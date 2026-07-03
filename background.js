const cache = new Map();
const inFlight = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || (message.type !== "TRANSLATE_WORD" && message.type !== "PREFETCH_WORDS")) {
    return false;
  }

  if (message.type === "PREFETCH_WORDS") {
    const words = Array.isArray(message.words) ? message.words : [];
    void Promise.all(words.map((word) => fetchTranslation(word).catch(() => "")));
    sendResponse({ ok: true });
    return false;
  }

  const word = String(message.word || "").trim().toLowerCase();
  if (!word) {
    sendResponse({ ok: true, translation: "" });
    return false;
  }

  fetchTranslation(word)
    .then((translation) => {
      sendResponse({ ok: true, translation });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        translation: "",
        error: error instanceof Error ? error.message : "Unknown translation error"
      });
    });

  return true;
});

async function fetchTranslation(rawWord) {
  const word = String(rawWord || "").trim().toLowerCase();
  if (!word) {
    return "";
  }

  if (cache.has(word)) {
    return cache.get(word);
  }

  if (inFlight.has(word)) {
    return inFlight.get(word);
  }

  const request = (async () => {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.searchParams.set("q", word);
    url.searchParams.set("langpair", "en|ar");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Translation request failed with ${response.status}`);
    }

    const data = await response.json();
    const translation = data?.responseData?.translatedText?.trim() || "";
    cache.set(word, translation);
    return translation;
  })();

  inFlight.set(word, request);

  try {
    return await request;
  } finally {
    inFlight.delete(word);
  }
}