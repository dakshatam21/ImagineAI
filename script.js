/* ===========================================================
   ImagineAI — script.js
   All app logic: API calls, storage, UI interactions
   =========================================================== */

(() => {
  'use strict';

  /* -------------------- 1. CONSTANTS & STATE -------------------- */

 // Pollinations AI Image Generation API
 
 // Generates an AI image using the Pollinations API.
 
 const POLLINATIONS_URL = "https://image.pollinations.ai/prompt/";
 const STORAGE_KEYS = {
    history: 'imagineai_history',
    gallery: 'imagineai_gallery',
    favorites: 'imagineai_favorites',
    theme: 'imagineai_theme',
  };

  const MAX_HISTORY = 10;
  const MAX_GALLERY = 40; // keep local storage from growing unbounded

  // Cached DOM references (queried once at startup)
  const dom = {};

  /* -------------------- 2. UTILITIES -------------------- */

  /** Safely parse JSON from localStorage, falling back to a default value. */
  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn(`Could not read "${key}" from storage:`, err);
      return fallback;
    }
  }

  /** Safely write JSON to localStorage. */
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Most likely quota exceeded — let the user know via toast instead of crashing.
      console.warn(`Could not save "${key}" to storage:`, err);
      showToast('Storage is full — try clearing some history or favorites.', 'warning');
    }
  }

  /** Generate a short unique id for storage records. */
  function makeId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Show a small toast notification at the bottom of the screen. */
  let toastTimer = null;
  function showToast(message, type = 'info') {
    const icons = {
      info: 'fa-circle-info',
      success: 'fa-circle-check',
      warning: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
    };
    dom.toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> ${escapeHTML(message)}`;
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 3200);
  }

  /** Prevent basic HTML/script injection when inserting user text into the DOM. */
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Convert a base64/blob image into a downloadable file for the user. */
  function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename || `imagineai-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* -------------------- 3. THEME -------------------- */

  function initTheme() {
    const saved = readStorage(STORAGE_KEYS.theme, 'light');
    applyTheme(saved);

    dom.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writeStorage(STORAGE_KEYS.theme, next);
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      dom.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
      document.documentElement.removeAttribute('data-theme');
      dom.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
  }

  /* -------------------- 4. MOBILE NAV -------------------- */

  function initMobileNav() {
    dom.navBurger.addEventListener('click', () => {
      dom.navLinks.classList.toggle('is-open');
    });
    dom.navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => dom.navLinks.classList.remove('is-open'));
    });
  }

  /* -------------------- 5. HERO TYPING ANIMATION -------------------- */

  function initHeroTyping() {
    const phrases = [
      'a dragon made of stained glass...',
      'a cozy cabin in the snow...',
      'an astronaut surfing on Saturn...',
      'a city built inside a teacup...',
    ];
    let phraseIndex = 0;
    let charIndex = 0;
    let deleting = false;

    function tick() {
      const current = phrases[phraseIndex];
      if (!deleting) {
        charIndex++;
        dom.typedPrompt.textContent = current.slice(0, charIndex);
        if (charIndex === current.length) {
          deleting = true;
          setTimeout(tick, 1400);
          return;
        }
      } else {
        charIndex--;
        dom.typedPrompt.textContent = current.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
        }
      }
      setTimeout(tick, deleting ? 35 : 55);
    }
    tick();
  }

  
  /* -------------------- 7. PROMPT TEXTAREA -------------------- */

  function initPromptInput() {
    dom.promptInput.addEventListener('input', () => {
      const len = dom.promptInput.value.length;
      dom.charCount.textContent = `${len} / 500`;
      dom.promptInput.classList.remove('is-invalid');
    });

    dom.clearPrompt.addEventListener('click', () => {
      dom.promptInput.value = '';
      dom.charCount.textContent = '0 / 500';
      dom.promptInput.focus();
    });

    // Prompt suggestion chips fill the textarea.
    dom.suggestions.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        dom.promptInput.value = chip.dataset.prompt;
        dom.charCount.textContent = `${chip.dataset.prompt.length} / 500`;
        dom.promptInput.focus();
      });
    });
  }

  /* -------------------- 8. STYLE SELECTOR -------------------- */

  let activeStyleSuffix = '';

  function initStyleSelector() {
    dom.styleGrid.querySelectorAll('.style-card').forEach((card) => {
      card.addEventListener('click', () => {
        dom.styleGrid.querySelectorAll('.style-card').forEach((c) => c.classList.remove('is-active'));
        card.classList.add('is-active');
        activeStyleSuffix = card.dataset.suffix || '';
      });
    });
  }

  /* -------------------- 9. IMAGE GENERATION -------------------- */

  function initGenerate() {
    dom.generateBtn.addEventListener('click', handleGenerate);
    dom.dismissError.addEventListener('click', () => hide(dom.errorBox));
  }

  async function handleGenerate() {
    hideError();
    const rawPrompt = dom.promptInput.value.trim();

    // --- Validation: empty prompt ---
    if (!rawPrompt) {
      dom.promptInput.classList.add('is-invalid');
      showError('Please type a prompt before generating — even a short idea works!');
      dom.promptInput.focus();
      return;
    }

    // --- Validation: API key present ---

    const fullPrompt = `${rawPrompt}${activeStyleSuffix}`;

    hide(dom.errorBox);
    hide(dom.resultBox);
    setLoading(true);

    try {
     const imageDataUrl = await generateImageFromAPI(fullPrompt);
      showResult(imageDataUrl, rawPrompt);
      hideError();
      addToHistory(rawPrompt);
      addToGallery(imageDataUrl, rawPrompt);
      showToast('Your image is ready!', 'success');
    } catch (err) {
      console.error('Image generation failed:', err);
      showError(err.message || 'Something went wrong while generating your image. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Calls the Hugging Face Inference API to generate an image from a text prompt.
   * Returns a base64 data URL (image/png) on success, or throws a friendly Error.
   */

async function generateImageFromAPI(prompt) {
    return `${POLLINATIONS_URL}${encodeURIComponent(prompt)}`;
}
  /* -------------------- 10. LOADING / ERROR / RESULT UI -------------------- */

  const loadingMessages = [
    'Warming up the AI canvas…',
    'Mixing digital paint…',
    'Sketching the first shapes…',
    'Adding light and shadow…',
    'Almost there…',
  ];
  let loadingMsgTimer = null;

  function setLoading(isLoading) {
    dom.generateBtn.disabled = isLoading;
    if (isLoading) {
      show(dom.loadingBox);
      let i = 0;
      dom.loadingText.textContent = loadingMessages[0];
      loadingMsgTimer = setInterval(() => {
        i = (i + 1) % loadingMessages.length;
        dom.loadingText.textContent = loadingMessages[i];
      }, 2200);
    } else {
      hide(dom.loadingBox);
      clearInterval(loadingMsgTimer);
    }
  }

  function showError(message) {
    dom.errorText.textContent = message;
     show(dom.errorBox);
    
  }
function hideError() {
    dom.errorText.textContent = "";
    hide(dom.errorBox);
}

  let currentResult = { src: '', prompt: '', favoriteId: null };

  
  function showResult(dataUrl, prompt) {


    dom.resultImage.src = dataUrl;

    currentResult = {
        src: dataUrl,
        prompt,
        favoriteId: null
    };

    dom.favoriteResult.classList.remove('is-favorited');
    dom.favoriteResult.innerHTML =
        '<i class="fa-regular fa-heart"></i> Favorite';

    show(dom.resultBox);

    console.log("RESULT BOX SHOWN");

    dom.resultBox.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
    });
}
  function initResultActions() {
    dom.downloadResult.addEventListener('click', () => {
      downloadImage(currentResult.src, `imagineai-${Date.now()}.png`);
      showToast('Download started.', 'success');
    });

    dom.favoriteResult.addEventListener('click', () => {
      const isFav = dom.favoriteResult.classList.contains('is-favorited');
      if (isFav) {
        removeFavoriteBySrc(currentResult.src);
        dom.favoriteResult.classList.remove('is-favorited');
        dom.favoriteResult.innerHTML = '<i class="fa-regular fa-heart"></i> Favorite';
      } else {
        addToFavorites(currentResult.src, currentResult.prompt);
        dom.favoriteResult.classList.add('is-favorited');
        dom.favoriteResult.innerHTML = '<i class="fa-solid fa-heart"></i> Favorited';
      }
    });

    dom.viewFullResult.addEventListener('click', () => {
      openLightbox(currentResult.src, currentResult.prompt);
    });
  }

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  /* -------------------- 11. PROMPT HISTORY -------------------- */

  function getHistory() { return readStorage(STORAGE_KEYS.history, []); }

  function addToHistory(prompt) {
    let history = getHistory();
    // Avoid duplicate consecutive entries.
    history = history.filter((p) => p !== prompt);
    history.unshift(prompt);
    history = history.slice(0, MAX_HISTORY);
    writeStorage(STORAGE_KEYS.history, history);
    renderHistory();
  }

  function renderHistory() {
    const history = getHistory();
    dom.historyList.innerHTML = '';

    if (history.length === 0) {
      dom.historyList.appendChild(dom.historyEmpty);
      return;
    }

    history.forEach((prompt) => {
      const chip = document.createElement('div');
      chip.className = 'history-chip';
      chip.innerHTML = `
        <span title="${escapeHTML(prompt)}">${escapeHTML(prompt)}</span>
        <button aria-label="Remove from history" data-action="remove"><i class="fa-solid fa-xmark"></i></button>
      `;
      chip.querySelector('span').addEventListener('click', () => {
        dom.promptInput.value = prompt;
        dom.charCount.textContent = `${prompt.length} / 500`;
        dom.promptInput.focus();
        dom.promptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      chip.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        const updated = getHistory().filter((p) => p !== prompt);
        writeStorage(STORAGE_KEYS.history, updated);
        renderHistory();
      });
      dom.historyList.appendChild(chip);
    });
  }

  function initHistoryControls() {
    dom.clearHistory.addEventListener('click', () => {
      writeStorage(STORAGE_KEYS.history, []);
      renderHistory();
      showToast('Prompt history cleared.', 'info');
    });
  }

  /* -------------------- 12. GALLERY -------------------- */

  function getGallery() { return readStorage(STORAGE_KEYS.gallery, []); }

  function addToGallery(dataUrl, prompt) {
    let gallery = getGallery();
    const record = { id: makeId(), src: dataUrl, prompt, createdAt: Date.now() };
    gallery.unshift(record);
    gallery = gallery.slice(0, MAX_GALLERY);
    writeStorage(STORAGE_KEYS.gallery, gallery);
    renderGallery();
    updateStats();
  }

  function deleteFromGallery(id) {
    const gallery = getGallery().filter((item) => item.id !== id);
    writeStorage(STORAGE_KEYS.gallery, gallery);
    renderGallery();
    updateStats();
    showToast('Image removed from gallery.', 'info');
  }

  function renderGallery() {
    const gallery = getGallery();
    dom.galleryGrid.innerHTML = '';

    if (gallery.length === 0) {
      dom.galleryGrid.appendChild(dom.galleryEmpty);
      return;
    }

    const favorites = getFavorites();

    gallery.forEach((item) => {
      const isFav = favorites.some((f) => f.src === item.src);
      const el = buildGalleryCard(item, isFav, { deletable: true });
      dom.galleryGrid.appendChild(el);
    });
  }

  function buildGalleryCard(item, isFav, { deletable }) {
    const card = document.createElement('div');
    card.className = 'gallery-item';
    card.innerHTML = `
      <img src="${item.src}" alt="AI image for prompt: ${escapeHTML(item.prompt)}" loading="lazy" />
      <div class="gallery-item__overlay">
        <p>${escapeHTML(item.prompt)}</p>
        <div class="gallery-item__actions">
          <button data-action="view" aria-label="View full screen"><i class="fa-solid fa-expand"></i></button>
          <button data-action="download" aria-label="Download image"><i class="fa-solid fa-download"></i></button>
          <button data-action="favorite" aria-label="Toggle favorite"><i class="fa-${isFav ? 'solid is-active' : 'regular'} fa-heart"></i></button>
          ${deletable ? '<button data-action="delete" aria-label="Delete image"><i class="fa-solid fa-trash"></i></button>' : ''}
        </div>
      </div>
    `;

    card.querySelector('[data-action="view"]').addEventListener('click', () => openLightbox(item.src, item.prompt));
    card.querySelector('[data-action="download"]').addEventListener('click', () =>
      downloadImage(item.src, `imagineai-${item.id}.png`)
    );
    card.querySelector('[data-action="favorite"]').addEventListener('click', (e) => {
      const heartIcon = e.currentTarget.querySelector('i');
      if (heartIcon.classList.contains('is-active')) {
        removeFavoriteBySrc(item.src);
        heartIcon.classList.remove('is-active');
        heartIcon.classList.replace('fa-solid', 'fa-regular');
      } else {
        addToFavorites(item.src, item.prompt);
        heartIcon.classList.add('is-active');
        heartIcon.classList.replace('fa-regular', 'fa-solid');
      }
    });

    if (deletable) {
      card.querySelector('[data-action="delete"]').addEventListener('click', () => {
        deleteFromGallery(item.id);
      });
    }

    return card;
  }

  function updateStats() {
    dom.statGenerated.textContent = getGallery().length;
  }

  /* -------------------- 13. FAVORITES -------------------- */

  function getFavorites() { return readStorage(STORAGE_KEYS.favorites, []); }

  function addToFavorites(src, prompt) {
    const favorites = getFavorites();
    if (favorites.some((f) => f.src === src)) return; // already favorited
    favorites.unshift({ id: makeId(), src, prompt, createdAt: Date.now() });
    writeStorage(STORAGE_KEYS.favorites, favorites);
    renderFavorites();
    renderGallery(); // keep heart icons in sync
    showToast('Added to favorites.', 'success');
  }

  function removeFavoriteBySrc(src) {
    const favorites = getFavorites().filter((f) => f.src !== src);
    writeStorage(STORAGE_KEYS.favorites, favorites);
    renderFavorites();
    renderGallery();
  }

  function renderFavorites() {
    const favorites = getFavorites();
    dom.favoritesGrid.innerHTML = '';

    if (favorites.length === 0) {
      dom.favoritesGrid.appendChild(dom.favoritesEmpty);
      return;
    }

    favorites.forEach((item) => {
      const card = buildGalleryCard(item, true, { deletable: false });
      dom.favoritesGrid.appendChild(card);
    });
  }

  /* -------------------- 14. LIGHTBOX -------------------- */

  function openLightbox(src, caption) {
    dom.lightboxImage.src = src;
    dom.lightboxCaption.textContent = caption || '';
    dom.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    dom.lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function initLightbox() {
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightbox.addEventListener('click', (e) => {
      if (e.target === dom.lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dom.lightbox.hidden) closeLightbox();
    });
  }

  /* -------------------- 15. NAVBAR SCROLL SHADOW -------------------- */

  function initNavbarScroll() {
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY > 8;
      dom.navbar.style.boxShadow = scrolled ? 'var(--shadow-sm)' : 'none';
      lastScroll = window.scrollY;
    }, { passive: true });
  }

  /* -------------------- 16. INIT -------------------- */

  function cacheDom() {
    dom.navbar = document.getElementById('navbar');
    dom.navLinks = document.getElementById('navLinks');
    dom.navBurger = document.getElementById('navBurger');
    dom.themeToggle = document.getElementById('themeToggle');

    dom.typedPrompt = document.getElementById('typedPrompt');
    dom.statGenerated = document.getElementById('statGenerated');

    dom.promptInput = document.getElementById('promptInput');
    dom.charCount = document.getElementById('charCount');
    dom.clearPrompt = document.getElementById('clearPrompt');
    dom.suggestions = document.getElementById('suggestions');

    dom.styleGrid = document.getElementById('styleGrid');

    dom.generateBtn = document.getElementById('generateBtn');
    dom.loadingBox = document.getElementById('loadingBox');
    dom.loadingText = document.getElementById('loadingText');
    dom.errorBox = document.getElementById('errorBox');
    dom.errorText = document.getElementById('errorText');
    dom.dismissError = document.getElementById('dismissError');

    dom.resultBox = document.getElementById('resultBox');
    dom.resultImage = document.getElementById('resultImage');
    dom.downloadResult = document.getElementById('downloadResult');
    dom.favoriteResult = document.getElementById('favoriteResult');
    dom.viewFullResult = document.getElementById('viewFullResult');

    dom.historyList = document.getElementById('historyList');
    dom.historyEmpty = document.getElementById('historyEmpty');
    dom.clearHistory = document.getElementById('clearHistory');

    dom.galleryGrid = document.getElementById('galleryGrid');
    dom.galleryEmpty = document.getElementById('galleryEmpty');

    dom.favoritesGrid = document.getElementById('favoritesGrid');
    dom.favoritesEmpty = document.getElementById('favoritesEmpty');

    dom.lightbox = document.getElementById('lightbox');
    dom.lightboxImage = document.getElementById('lightboxImage');
    dom.lightboxCaption = document.getElementById('lightboxCaption');
    dom.lightboxClose = document.getElementById('lightboxClose');

    dom.toast = document.getElementById('toast');
    dom.year = document.getElementById('year');
  }

  function init() {
    cacheDom();
    dom.year.textContent = new Date().getFullYear();
    initTheme();
    initMobileNav();
    initHeroTyping();
    initPromptInput();
    initStyleSelector();
    initGenerate();
    initResultActions();
    initHistoryControls();
    initLightbox();
    initNavbarScroll();

    renderHistory();
    renderGallery();
    renderFavorites();
    updateStats();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

