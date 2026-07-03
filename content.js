(function () {
  const overlayId = "arabic-translation-overlay";
  const storageKey = "monkeytypeArabicTranslatorOverlay";
  const state = {
    lastWord: "",
    lastRequestedWord: "",
    requestToken: 0,
    drag: null,
    observer: null,
    rafId: null
  };

  if (window.top !== window) {
    return;
  }

  const overlay = createOverlay();
  document.documentElement.appendChild(overlay);
  restorePosition(overlay);
  attachDragging(overlay);
  startWatching();

  function createOverlay() {
    const root = document.createElement("div");
    root.id = overlayId;
    root.innerHTML = `
      <div class="amt-window" role="status" aria-live="polite">
        <div class="amt-header">
          <div class="amt-title">Arabic translation</div>
          <button class="amt-reset" type="button" aria-label="Reset position">Reset</button>
        </div>
        <div class="amt-body">
          <div class="amt-word" data-role="word">Waiting for a word…</div>
          <div class="amt-translation" data-role="translation">Type on Monkeytype to see the Arabic translation here.</div>
        </div>
      </div>
    `;

    const resetButton = root.querySelector(".amt-reset");
    resetButton.addEventListener("click", async () => {
      root.classList.remove("amt-has-position");
      root.style.left = "auto";
      root.style.top = "auto";
      root.style.right = "16px";
      root.style.bottom = "16px";
      await chrome.storage.local.remove(storageKey);
    });

    return root;
  }

  function attachDragging(root) {
    const windowEl = root.querySelector(".amt-window");
    const header = root.querySelector(".amt-header");

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) {
        return;
      }

      const rect = windowEl.getBoundingClientRect();
      state.drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };

      header.setPointerCapture(event.pointerId);
      windowEl.classList.add("amt-dragging");
      event.preventDefault();
    });

    windowEl.addEventListener("pointermove", (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }

      const nextLeft = Math.max(8, Math.min(window.innerWidth - windowEl.offsetWidth - 8, event.clientX - state.drag.offsetX));
      const nextTop = Math.max(8, Math.min(window.innerHeight - windowEl.offsetHeight - 8, event.clientY - state.drag.offsetY));

      root.classList.add("amt-has-position");
      root.style.left = `${nextLeft}px`;
      root.style.top = `${nextTop}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    });

    const endDrag = async (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) {
        return;
      }

      windowEl.classList.remove("amt-dragging");
      if (header.hasPointerCapture(event.pointerId)) {
        header.releasePointerCapture(event.pointerId);
      }
      state.drag = null;

      await chrome.storage.local.set({
        [storageKey]: {
          left: root.style.left,
          top: root.style.top
        }
      });
    };

    windowEl.addEventListener("pointerup", endDrag);
    windowEl.addEventListener("pointercancel", endDrag);
  }

  async function restorePosition(root) {
    const stored = await chrome.storage.local.get(storageKey);
    const position = stored?.[storageKey];

    if (position?.left && position?.top) {
      root.classList.add("amt-has-position");
      root.style.left = position.left;
      root.style.top = position.top;
      root.style.right = "auto";
      root.style.bottom = "auto";
    }
  }

  function startWatching() {
    const scheduleUpdate = () => {
      if (state.rafId) {
        return;
      }

      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        const word = getActiveWord();
        if (word && word !== state.lastWord) {
          state.lastWord = word;
          updateWord(word);
        }
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
        return text;
      }
    }

    const activeLine = document.querySelector(".word.active") || document.querySelector(".word.current");
    if (activeLine) {
      return cleanWord(activeLine.textContent);
    }

    return "";
  }

  function cleanWord(text) {
    return String(text || "")
      .replace(/[^A-Za-z'-]/g, "")
      .trim();
  }

  async function updateWord(word) {
    const wordEl = overlay.querySelector('[data-role="word"]');
    const translationEl = overlay.querySelector('[data-role="translation"]');

    if (!word) {
      wordEl.textContent = "Waiting for a word…";
      translationEl.textContent = "Type on Monkeytype to see the Arabic translation here.";
      return;
    }

    if (word === state.lastRequestedWord) {
      return;
    }

    state.lastRequestedWord = word;
    const token = ++state.requestToken;

    wordEl.textContent = word;
    translationEl.textContent = "Translating…";

    const response = await chrome.runtime.sendMessage({
      type: "TRANSLATE_WORD",
      word
    });

    if (token !== state.requestToken) {
      return;
    }

    if (!response?.ok) {
      translationEl.textContent = response?.error ? `Translation unavailable: ${response.error}` : "Translation unavailable.";
      return;
    }

    translationEl.textContent = response.translation || "No translation found.";
  }
})();