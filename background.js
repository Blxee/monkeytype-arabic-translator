const cache = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || (message.type !== "TRANSLATE_WORD" && message.type !== "PREFETCH_WORDS")) {
    return false;
  }

  if (message.type === "PREFETCH_WORDS") {
    const words = Array.isArray(message.words) ? message.words : [];

    void Promise.all(words.map((word) => warmCache(word)));
    sendResponse({ ok: true });
    return false;
  }

  const word = String(message.word || "").trim().toLowerCase();
  if (!word) {
    sendResponse({ ok: true, translation: "" });
    return false;
  }

  if (cache.has(word)) {
    sendResponse({ ok: true, translation: cache.get(word) });
    return false;

async function warmCache(rawWord) {
  const word = String(rawWord || "").trim().toLowerCase();
  if (!word || cache.has(word)) {
    return;
  }

  try {
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
      return;
    }

    const data = await response.json();
    const translation = data?.responseData?.translatedText?.trim() || "";
    cache.set(word, translation);
  } catch {
    // Ignore prefetch failures; the normal request path will retry.
  }
}
  }

  (async () => {
    try {
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
      sendResponse({ ok: true, translation });
    } catch (error) {
      sendResponse({
        ok: false,
        translation: "",
        error: error instanceof Error ? error.message : "Unknown translation error"
      });
    }
  })();

  return true;
});