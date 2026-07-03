(function () {
  const overlayId = "arabic-translation-overlay";
  const positionGap = 12;
  const viewportMargin = 8;
  const state = {
    lastWord: "",
    lastRequestedWord: "",
    requestToken: 0,
    activeElement: null,
    prefetchedWords: new Set(),
    observer: null,
    rafId: null,
    positionRafId: null,
    loadingTimerId: null
  };

  if (window.top !== window) {
    return;
  }

  const overlay = createOverlay();
  document.documentElement.appendChild(overlay);
  startWatching();

  function createOverlay() {
    const root = document.createElement("div");
    root.id = overlayId;
    root.innerHTML = `
      <div class="amt-window" role="status" aria-live="polite">
        <div class="amt-translation" data-role="translation">Type on Monkeytype to see the Arabic translation here.</div>
      </div>
    `;

    return root;
  }

  function startWatching() {
    const scheduleUpdate = () => {
      if (state.rafId) {
        return;
      }

      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        const activeWord = getActiveWord();
        const word = activeWord?.word || "";

        state.activeElement = activeWord?.element || null;

        if (word !== state.lastWord) {
          state.lastWord = word;
          updateWord(word);
        }

        schedulePositionUpdate(state.activeElement);
        prefetchUpcomingWords(state.activeElement, word);
      });
    };

    scheduleUpdate();

    if (!document.body) {
      return;
    }

    state.observer = new MutationObserver(scheduleUpdate);
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"]
    });

    window.addEventListener("keyup", scheduleUpdate, true);
    window.addEventListener("click", scheduleUpdate, true);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);
  }

  function getActiveWord() {
    const selectors = [
      ".word.active",
      ".word.active .word",
      ".word.active span",
      ".words .word.active"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) {
        continue;
      }

      const text = cleanWord(element.textContent);
      if (text) {
        return { word: text, element };
      }
    }

    const activeLine = document.querySelector(".word.active") || document.querySelector(".word.current");
    if (activeLine) {
      const word = cleanWord(activeLine.textContent);
      return word ? { word, element: activeLine } : null;
    }

    return null;
  }

  function cleanWord(text) {
    return String(text || "")
      .replace(/[^A-Za-z'-]/g, "")
      .trim();
  }

  function prefetchUpcomingWords(activeElement, currentWord) {
    const nextWords = getUpcomingWords(activeElement, 10);
    const wordsToPrefetch = [];

    for (const word of nextWords) {
      if (!word || word === currentWord || state.prefetchedWords.has(word)) {
        continue;
      }

      state.prefetchedWords.add(word);
      wordsToPrefetch.push(word);
    }

    if (!wordsToPrefetch.length) {
      return;
    }

    chrome.runtime.sendMessage({
      type: "PREFETCH_WORDS",
      words: wordsToPrefetch
    }).catch(() => {});
  }

  function getUpcomingWords(activeElement, limit) {
    const currentWordElement = activeElement?.closest?.(".word") || activeElement;
    const parent = currentWordElement?.parentElement;

    if (!currentWordElement || !parent) {
      return [];
    }

    const children = Array.from(parent.children);
    const currentIndex = children.indexOf(currentWordElement);
    if (currentIndex < 0) {
      return [];
    }

    const results = [];
    for (let index = currentIndex + 1; index < children.length && results.length < limit; index += 1) {
      const candidate = children[index];
      const word = cleanWord(candidate.textContent);
      if (word) {
        results.push(word);
      }
    }

    return results;
  }

  function schedulePositionUpdate(activeElement) {
    if (state.positionRafId) {
      return;
    }

    state.positionRafId = requestAnimationFrame(() => {
      state.positionRafId = null;
      positionOverlay(activeElement);
    });
  }

  function positionOverlay(activeElement) {
    const windowEl = overlay.querySelector(".amt-window");

    if (!windowEl || !activeElement || !document.contains(activeElement)) {
      overlay.style.left = "16px";
      overlay.style.top = "16px";
      overlay.style.transform = "none";
      return;
    }

    const wordRect = activeElement.getBoundingClientRect();
    const overlayRect = windowEl.getBoundingClientRect();
    const centerX = wordRect.left + wordRect.width / 2;
    const topY = wordRect.top - positionGap - overlayRect.height;
    const clampedX = Math.max(viewportMargin + overlayRect.width / 2, Math.min(window.innerWidth - viewportMargin - overlayRect.width / 2, centerX));
    const clampedY = Math.max(viewportMargin, topY);

    overlay.style.left = `${clampedX}px`;
    overlay.style.top = `${clampedY}px`;
    overlay.style.transform = "translateX(-50%)";
  }

  async function updateWord(word) {
    const translationEl = overlay.querySelector('[data-role="translation"]');

    if (state.loadingTimerId) {
      clearTimeout(state.loadingTimerId);
      state.loadingTimerId = null;
    }

    if (!word) {
      translationEl.textContent = "Type on Monkeytype to see the Arabic translation here.";
      schedulePositionUpdate(state.activeElement);
      return;
    }

    if (word === state.lastRequestedWord) {
      return;
    }

    state.lastRequestedWord = word;
    const token = ++state.requestToken;

    state.loadingTimerId = window.setTimeout(() => {
      if (token !== state.requestToken) {
        return;
      }

      translationEl.textContent = "Translating…";
      schedulePositionUpdate(state.activeElement);
    }, 140);

    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_WORD",
      word
    });

    if (state.loadingTimerId) {
      clearTimeout(state.loadingTimerId);
      state.loadingTimerId = null;
    }

    if (token !== state.requestToken) {
      return;
    }

    if (!response?.ok) {
      translationEl.textContent = response?.error ? `Translation unavailable: ${response.error}` : "Translation unavailable.";
      schedulePositionUpdate(state.activeElement);
      return;
    }

    translationEl.textContent = response.translation || "No translation found.";
    schedulePositionUpdate(state.activeElement);
  }
})();