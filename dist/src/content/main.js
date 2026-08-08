

(function () {
  'use strict';

  const PLUGIN_ID = 'basepaint-plugin';
  const LOG_PREFIX = `[${PLUGIN_ID}]`;

  if (document.getElementById(PLUGIN_ID)) return;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }
  function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
  }

  function findCanvas() {
    const canvases = document.querySelectorAll('canvas');
    let best = null;
    let bestArea = 0;
    for (const c of canvases) {
      const area = c.width * c.height;
      if (area > bestArea) {
        bestArea = area;
        best = c;
      }
    }
    return best;
  }

  function findToolbar() {
    if (!/\/paint/.test(location.pathname) && !/paint/.test(location.search)) {
      return null;
    }

    const desktop = document.getElementById('toolbar');
    if (desktop && desktop.isConnected) {
      return desktop;
    }

    const allButtons = document.querySelectorAll('button');
    const candidates = new Map();

    const hasIcon = (btn) =>
      btn.querySelector('svg') || btn.querySelector('img');

    for (const btn of allButtons) {
      if (!hasIcon(btn)) continue;
      if (btn.closest(`#${PLUGIN_ID}`)) continue;

      let parent = btn.parentElement;
      for (let depth = 0; depth < 12 && parent; depth++) {
        const style = getComputedStyle(parent);
        const display = style.display;
        if (display === 'flex' || display === 'inline-flex' ||
            display === 'grid' || display === 'inline-grid') {
          candidates.set(parent, (candidates.get(parent) || 0) + 1);
        }
        parent = parent.parentElement;
      }
    }

    let best = null;
    let bestScore = 0;
    for (const [container, btnScore] of candidates) {
      if (btnScore < 3) continue;

      const rect = container.getBoundingClientRect();
      if (rect.width < 60) continue;
      if (rect.height < 20) continue;
      if (rect.width > window.innerWidth * 0.95) continue;

      let directIconButtons = 0;
      for (const child of container.children) {
        if (child.tagName === 'BUTTON' && hasIcon(child)) directIconButtons++;
      }
      if (directIconButtons < 3) continue;

      if (btnScore > bestScore) {
        bestScore = btnScore;
        best = container;
      }
    }

    if (!best) {
      const top = [...candidates.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([el, s]) => {
          const rect = el.getBoundingClientRect();
          let directBtns = 0;
          let directIconBtns = 0;
          for (const c of el.children) {
            if (c.tagName === 'BUTTON') {
              directBtns++;
              if (hasIcon(c)) directIconBtns++;
            }
          }
          return {
            tag: el.tagName,
            id: el.id || '',
            cls: (el.className || '').slice(0, 70),
            score: s,
            directBtns,
            directIconBtns,
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        });
      console.warn(LOG_PREFIX, 'No toolbar candidate. Top 10:', top);
    }
    return best;
  }

  function findInjectionPoint(toolbar) {
    const children = Array.from(toolbar.children);
    if (children.length === 0) return null;

    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const rect = child.getBoundingClientRect();
      if (rect.height < 4 && rect.width > 10) return child;
      if (child.tagName === 'HR') return child;
    }
    return null;
  }

  const TOOL_ICONS = {
    bucket: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><g transform="scale(-1, 1) translate(-24, 0)"><path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/><path d="m5 2 5 5"/><path d="M2 13h15"/><path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/></g></svg>`,
    upload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/>
      <path d="m14 19.5 3-3 3 3"/>
      <path d="M17 22v-5.5"/>
      <circle cx="9" cy="9" r="2"/>
    </svg>`,
    picker: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>`,
    download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>`,
    copy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
    </svg>`,
    help: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
  };

  function createToolButton(id, svgIcon, tooltip, onClick) {
    const btn = document.createElement('button');
    btn.id = `${PLUGIN_ID}-${id}`;
    btn.className = `${PLUGIN_ID}-btn`;

    btn.innerHTML = svgIcon.replace(
      /width="22" height="22"/,
      'width="22" height="22" class="w-4 h-4 text-gray-400 hover:text-white"'
    );
    btn.title = tooltip;
    btn.setAttribute('data-plugin', PLUGIN_ID);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(e);
    });
    return btn;
  }

  const state = {
    activeTool: null,
    canvas: null,
    toolbar: null,
  };

const BUCKET_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><g transform='scale(-1, 1) translate(-24, 0)'><path d='m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z'/><path d='m5 2 5 5'/><path d='M2 13h15'/><path d='M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z'/></g></svg>") 4 16, none`;

const PICKER_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m2 22 1-1h3l9-9'/><path d='M3 21v-3l9-9'/><path d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z'/></svg>") 3 18, none`;

  function setActiveTool(toolName) {
    state.activeTool = toolName;

    document.querySelectorAll(`.${PLUGIN_ID}-btn`).forEach((btn) => {
      const btnTool = btn.id.replace(`${PLUGIN_ID}-`, '');
      btn.classList.toggle(`${PLUGIN_ID}-btn--active`, btnTool === state.activeTool);
    });
    updateCursor();
  }

  function toggleGridForTool(enable) {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.title === 'Hide Grid' || b.title === 'Show Grid'
    );
    if (!btn) return;
    const isHidden = btn.title === 'Show Grid';
    if (enable && !isHidden) btn.click();
    else if (!enable && isHidden) btn.click();
  }

  function updateCursor() {
    const canvas = findCanvas();
    if (!canvas) return;
    if (state.activeTool === 'bucket') {
      canvas.style.cursor = BUCKET_CURSOR;
    } else if (state.activeTool === 'picker') {
      canvas.style.cursor = PICKER_CURSOR;
      toggleGridForTool(true);
      pickerPreview.style.display = 'block';
    } else {
      canvas.style.cursor = '';
      toggleGridForTool(false);
      pickerPreview.style.display = 'none';
    }
  }

  function reapplyCursorOnCanvas() {
    const canvas = findCanvas();
    if (!canvas) return;
    canvas.addEventListener('pointerdown', updateCursor);
    canvas.addEventListener('mouseenter', updateCursor);
    canvas.addEventListener('focus', updateCursor);
  }

  const pickerPreview = document.createElement('div');
  pickerPreview.className = 'basepaint-plugin-picker-preview';
  pickerPreview.style.display = 'none';
  pickerPreview.innerHTML = `
    <div class="basepaint-plugin-picker-preview-swatch" style="background:#000"></div>
  `;
  document.body.appendChild(pickerPreview);
  const pickerPreviewSwatch = pickerPreview.querySelector('.basepaint-plugin-picker-preview-swatch');

  function installPickerPreview() {
    const canvas = findCanvas();
    if (!canvas) return;
    if (canvas.__pickerPreviewInstalled) return;
    canvas.__pickerPreviewInstalled = true;

    let lastEvent = null;
    let rafScheduled = false;
    const update = () => {
      rafScheduled = false;
      if (!lastEvent || state.activeTool !== 'picker') return;
      const e = lastEvent;
      lastEvent = null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const px = Math.floor((e.clientX - rect.left) * scaleX);
      const py = Math.floor((e.clientY - rect.top) * scaleY);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      try {
        const data = ctx.getImageData(px, py, 1, 1);
        const r = data.data[0], g = data.data[1], b = data.data[2];
        const hex = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
        pickerPreviewSwatch.style.background = hex;
        pickerPreview.style.left = (e.clientX + 10) + 'px';
        pickerPreview.style.top = (e.clientY - 72) + 'px';
        pickerPreview.style.display = 'block';
      } catch (err) {
      }
    };
    canvas.addEventListener('mousemove', (e) => {
      lastEvent = e;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(update);
      }
    });
    canvas.addEventListener('mouseleave', () => {
      pickerPreview.style.opacity = '0.4';
    });
    canvas.addEventListener('mouseenter', () => {
      pickerPreview.style.opacity = '1';
    });
  }

  const PLUGIN_HOTKEY_ROWS_HTML = `
      <tr class="border-b border-slate-700">
        <td class="p-3"><div class="tool-icon flex flex-row space-x-2"><div class="w-5 h-5 flex items-center justify-center">${TOOL_ICONS.bucket}</div></div></td>
        <td class="p-3 border-b border-slate-700">Plugin: Bucket fill</td>
        <td class="p-3 border-b border-slate-700" style="text-align:right"><span class="hotkey"><span class="key">B</span></span></td>
      </tr>
      <tr class="border-b border-slate-700">
        <td class="p-3"><div class="tool-icon flex flex-row space-x-2"><div class="w-5 h-5 flex items-center justify-center">${TOOL_ICONS.picker}</div></div></td>
        <td class="p-3 border-b border-slate-700">Plugin: Color picker</td>
        <td class="p-3 border-b border-slate-700" style="text-align:right"><span class="hotkey"><span class="key">I</span></span></td>
      </tr>
`;

  function injectPluginHotkeyRows(helpContainer) {
    const tbody = helpContainer.querySelector('table.min-w-full tbody');
    if (!tbody) return;
    if (tbody.querySelector('tr[data-basepaint-plugin-hotkeys]')) return;
    const markerRow = document.createElement('tr');
    markerRow.setAttribute('data-basepaint-plugin-hotkeys', '1');
    markerRow.innerHTML = `
      <td class="p-3 border-b border-slate-700" colspan="3" style="text-align:center;color:var(--bp-text-4);font-style:italic;font-size:11px">— Plugin —</td>
    `;
    tbody.appendChild(markerRow);
    tbody.insertAdjacentHTML('beforeend', PLUGIN_HOTKEY_ROWS_HTML);
  }

  function installHelpContainerObserver() {
    const tryInject = (root) => {
      const containers = (root || document).querySelectorAll('.help-container');
      containers.forEach(injectPluginHotkeyRows);
    };
    tryInject(document);
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (n.classList && n.classList.contains('help-container')) {
            injectPluginHotkeyRows(n);
          }
          tryInject(n);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function installKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        onBucketClick();
      } else if (key === 'i') {
        e.preventDefault();
        onPickerClick();
      } else if (key === 'escape') {
        if (state.activeTool) {
          e.preventDefault();
          setActiveTool(null);
        }
      }
    });
  }

  let suppressNativeWatch = false;
  function activateNativeDrawMode() {
    const drawBtn =
      document.querySelector('#toolbar button[title="Switch to Move Mode"]') ||
      document.querySelector('#toolbar button[title="Draw"]');
    if (!drawBtn) return;
    if (drawBtn.getAttribute('aria-pressed') === 'true') return;
    suppressNativeWatch = true;
    try {
      drawBtn.click();
    } finally {
      setTimeout(() => { suppressNativeWatch = false; }, 0);
    }
  }

  function clearPluginTool() {
    if (!state.activeTool) return;
    state.activeTool = null;
    document.querySelectorAll(`.${PLUGIN_ID}-btn`).forEach((btn) => {
      btn.classList.remove(`${PLUGIN_ID}-btn--active`);
    });
    log('Plugin tool cleared (native tool clicked)');
  }

  function installNativeToolWatcher() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;
    toolbar.addEventListener('click', (e) => {
      if (suppressNativeWatch) return;
      const btn = e.target.closest('button');
      if (!btn || btn.closest(`#${PLUGIN_ID}`)) return;
      clearPluginTool();
    }, true);
  }

  function onBucketClick() {
    setActiveTool('bucket');
    log('🪣 Bucket fill tool selected — click on the canvas to fill');
  }

  function onUploadClick() {
    log('📤 Image upload triggered');
    if (!state.canvas) {
      warn('Canvas not found — cannot upload image');
      return;
    }
    const BP = window.__BP_PLUGIN__;
    BP.executeImageUpload(state.canvas).then((count) => {
      if (count > 0) {
        log(`✅ Uploaded ${count} pixels`);
      }
    }).catch((e) => {
      console.error(LOG_PREFIX, 'Image upload failed:', e);
    });
  }

  function onPickerClick() {
    setActiveTool('picker');
    log('🎨 Color picker tool selected — click on the canvas to pick a color');
  }

  function onDownloadClick() {
    log('💾 Download triggered');
    if (!state.canvas) {
      warn('Canvas not found — cannot download');
      return;
    }
    openDownloadModal();
  }

  function findPaintComponent() {
    const tb = document.getElementById('toolbar');
    if (!tb) return null;
    const all = tb.querySelectorAll('*');
    for (const el of all) {
      const fkey = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
      if (!fkey) continue;
      let f = el[fkey];
      let depth = 0;
      while (f && depth++ < 30) {
        const t = f.type;
        if (t && typeof t !== 'string' && f.memoizedProps && typeof f.memoizedProps.onPaste === 'function') {
          return f;
        }
        f = f.return;
      }
    }
    return null;
  }

  function onHelpClick() {
    log('❓ About opened');
    const BP = window.__BP_PLUGIN__;
    if (BP && typeof BP.showAboutModal === 'function') {
      BP.showAboutModal();
    }
  }

  const ABOUT_DISMISS_KEY = `${PLUGIN_ID}-about-dismissed`;

  function shouldShowAbout() {
    try {
      return localStorage.getItem(ABOUT_DISMISS_KEY) !== '1';
    } catch (_) {
      return true;
    }
  }

  function setAboutDismissed() {
    try {
      localStorage.setItem(ABOUT_DISMISS_KEY, '1');
    } catch (_) {  }
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function buildAboutModal({ autoShown } = {}) {
    const config = window.__BP_PLUGIN_CONFIG__ || {};
    const version = config.VERSION || '0.1.0';
    const hackUrl = config.HACK_URL || 'https://basepaint.xyz/hack';
    const shareUrl = config.SHARE_URL || 'https://x.com/basepaint_xyz';

    const overlay = document.createElement('div');
    overlay.className = 'basepaint-plugin-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'basepaint-plugin-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-labelledby', `${PLUGIN_ID}-about-title`);

    const title = document.createElement('h3');
    title.className = 'basepaint-plugin-modal-title';
    title.id = `${PLUGIN_ID}-about-title`;
    const titleLogo = document.createElement('img');
    titleLogo.className = 'basepaint-plugin-modal-title-logo';
    titleLogo.src = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('icons/icon-128.png')
      : 'icons/icon-128.png';
    titleLogo.alt = '';
    title.appendChild(titleLogo);
    const titleText = document.createElement('span');
    titleText.textContent = 'Basepaint Plugin';
    title.appendChild(titleText);
    modal.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'basepaint-plugin-modal-desc';
    desc.innerHTML = `Built for the <a href="${escapeAttr(hackUrl)}" target="_blank" rel="noopener noreferrer">BasePaint Hackathon</a> (Aug 1–8, 2026) to add the tools we felt were missing.`;
    modal.appendChild(desc);

    const credits = document.createElement('div');
    credits.className = 'basepaint-plugin-modal-credits';
    credits.innerHTML = `
      <div class="basepaint-plugin-modal-section-label">Inspiration &amp; thanks to</div>
      <div><span class="basepaint-plugin-modal-tag">tooling</span><b>CopyStroke</b> by <b>Afuro</b></div>
      <div><span class="basepaint-plugin-modal-tag">tooling</span><b>Baseprite</b> by <b>Creamy</b></div>
    `;
    modal.appendChild(credits);

    const shareLabel = document.createElement('div');
    shareLabel.className = 'basepaint-plugin-modal-section-label';
    shareLabel.textContent = 'Share your thoughts';
    modal.appendChild(shareLabel);

    const shareLink = document.createElement('a');
    shareLink.className = 'basepaint-plugin-modal-btn basepaint-plugin-modal-btn--x';
    shareLink.href = shareUrl;
    shareLink.target = '_blank';
    shareLink.rel = 'noopener noreferrer';
    shareLink.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      Reply on X
    `;
    modal.appendChild(shareLink);

    const versionRow = document.createElement('div');
    versionRow.className = 'basepaint-plugin-modal-stats';
    versionRow.style.color = 'var(--bp-text-4)';
    versionRow.style.marginTop = '4px';
    versionRow.textContent = `Version ${version}`;
    modal.appendChild(versionRow);

    if (autoShown) {
      const dismissRow = document.createElement('label');
      dismissRow.className = 'basepaint-plugin-modal-checkbox-row';
      const dismissCb = document.createElement('input');
      dismissCb.type = 'checkbox';
      dismissCb.addEventListener('change', (e) => {
        if (e.target.checked) setAboutDismissed();
        else {
          try { localStorage.removeItem(ABOUT_DISMISS_KEY); } catch (_) {}
        }
      });
      const dismissText = document.createElement('span');
      dismissText.textContent = "Don't show this again on this device";
      dismissRow.appendChild(dismissCb);
      dismissRow.appendChild(dismissText);
      modal.appendChild(dismissRow);
    }

    const actions = document.createElement('div');
    actions.className = 'basepaint-plugin-modal-actions-end';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'basepaint-plugin-modal-btn basepaint-plugin-modal-btn--primary';
    closeBtn.textContent = '✕ Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(closeBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    return overlay;
  }

  function showAboutModal(opts = {}) {
    const id = `${PLUGIN_ID}-about`;
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = buildAboutModal(opts);
    overlay.id = id;
    document.body.appendChild(overlay);
  }

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});
  BP.showAboutModal = showAboutModal;
  BP.shouldShowAbout = shouldShowAbout;

  async function openDownloadModal() {
    const BP = window.__BP_PLUGIN__;
    const id = `${PLUGIN_ID}-modal-download`;
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'basepaint-plugin-modal-overlay';
    overlay.id = id;

    const modal = document.createElement('div');
    modal.className = 'basepaint-plugin-modal';

    const title = document.createElement('h3');
    title.className = 'basepaint-plugin-modal-title';
    title.textContent = 'Download Canvas';
    modal.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'basepaint-plugin-modal-desc';
    desc.textContent = "Pick a format. PNG is just your strokes on a transparent background; text files are YOUR strokes in the basepaint toolbox paste format.";
    modal.appendChild(desc);

    const palette = BP.readPaletteFromDOM() || [];
    let strokes = [];
    let sourceNote = '';
    const apiStrokes = await diffStrokesAgainstApi();
    if (apiStrokes.length) {
      strokes = apiStrokes;
      sourceNote = ' (from overlay canvas)';
    } else {
      const clipboardResult = readMyStrokesFromClipboard();
      if (clipboardResult.strokes.length) {
        strokes = clipboardResult.strokes;
        sourceNote = ' (from basepaint Copy Strokes)';
      }
    }

    const renderStats = () => {
      statsBlock.innerHTML = '';
      if (!strokes.length) {
        const empty = document.createElement('div');
        empty.className = 'basepaint-plugin-modal-stats';
        empty.style.color = 'var(--bp-text-3)';
        empty.textContent = 'No strokes found. Draw some on the canvas first.';
        statsBlock.appendChild(empty);
        return;
      }
      let minX = 256, minY = 256, maxX = -1, maxY = -1;
      const colorCounts = new Map();
      for (const s of strokes) {
        const x = s.point.x, y = s.point.y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        colorCounts.set(s.color, (colorCounts.get(s.color) || 0) + 1);
      }
      const topColors = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const totalLen = JSON.stringify(strokes).length;
      const estKb = (totalLen / 1024).toFixed(1);

      const counts = document.createElement('div');
      counts.className = 'basepaint-plugin-modal-stats';
      counts.innerHTML = `<b>${strokes.length}</b> stroke${strokes.length === 1 ? '' : 's'} · ~<b>${estKb} KB</b>`
        + (sourceNote ? ` <span style="color:var(--bp-text-4);">${sourceNote}</span>` : '');
      statsBlock.appendChild(counts);

      if (strokes.length) {
        const range = document.createElement('div');
        range.className = 'basepaint-plugin-modal-stats';
        range.style.color = 'var(--bp-text-3)';
        range.textContent = `Range x[${minX}–${maxX}] y[${minY}–${maxY}]`;
        statsBlock.appendChild(range);

        const swatches = document.createElement('div');
        swatches.className = 'basepaint-plugin-modal-swatches';
        for (const [idx, n] of topColors) {
          const hex = palette[idx];
          if (!hex) continue;
          const sw = document.createElement('span');
          sw.className = 'basepaint-plugin-modal-swatch';
          sw.style.background = hex;
          sw.title = `${hex} · ${n} stroke${n === 1 ? '' : 's'}`;
          swatches.appendChild(sw);
        }
        const swatchLabel = document.createElement('span');
        swatchLabel.className = 'basepaint-plugin-modal-stats';
        swatchLabel.style.color = 'var(--bp-text-4)';
        swatchLabel.textContent = `top ${topColors.length} colors`;
        swatches.appendChild(swatchLabel);
        statsBlock.appendChild(swatches);
      }
    };

    const statsBlock = document.createElement('div');
    statsBlock.className = 'basepaint-plugin-modal-stats-block';
    renderStats();
    modal.appendChild(statsBlock);

    const btnStack = document.createElement('div');
    btnStack.className = 'basepaint-plugin-modal-btn-stack';

    const mkBtn = (label, onClick, primary) => {
      const b = document.createElement('button');
      b.className = 'basepaint-plugin-modal-btn' + (primary ? ' basepaint-plugin-modal-btn--primary' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        try { onClick(); } finally { overlay.remove(); }
      });
      return b;
    };

    btnStack.appendChild(mkBtn('⬇  Download as PNG (256×256)', () => {
      const canvas = findCanvas();
      state.canvas = canvas;
      BP.exportCanvasPNG(canvas, { strokes, palette });
      log('✅ PNG download triggered');
    }, true));

    btnStack.appendChild(mkBtn('Download strokes (single text file)', () => {
      downloadStrokesSingle();
    }));

    const splitWrap = document.createElement('div');
    splitWrap.className = 'basepaint-plugin-modal-form-row';
    const splitInput = document.createElement('input');
    splitInput.className = 'basepaint-plugin-modal-input basepaint-plugin-modal-input--narrow';
    splitInput.type = 'number';
    splitInput.min = '1';
    splitInput.value = '1000';
    splitInput.placeholder = 'px/section';
    const splitBtn = mkBtn('Split into N-pixel stroke chunks', () => {
      const size = Math.max(1, parseInt(splitInput.value, 10) || 1000);
      downloadStrokesSplit(size);
    });
    splitBtn.style.flex = '1';
    splitWrap.appendChild(splitInput);
    splitWrap.appendChild(splitBtn);
    btnStack.appendChild(splitWrap);

    const splitNote = document.createElement('p');
    splitNote.className = 'basepaint-plugin-modal-hint';
    splitNote.textContent = "Each chunk is one paste-ready text file you can paste into the basepaint toolbox, one at a time.";
    btnStack.appendChild(splitNote);

    modal.appendChild(btnStack);

    const actions = document.createElement('div');
    actions.className = 'basepaint-plugin-modal-actions-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'basepaint-plugin-modal-btn basepaint-plugin-modal-btn--ghost';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actions.appendChild(cancelBtn);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function readMyStrokesFromClipboard() {
    const copyBtn = document.querySelector('#toolbar button[title="Copy Strokes"]')
      || document.querySelector('button[title="Copy Strokes"]');
    if (!copyBtn) {
      return { strokes: [], reason: 'no-copy-button' };
    }
    if (copyBtn.disabled) {
      return { strokes: [], reason: 'copy-disabled' };
    }
    let captured = null;
    const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (t) => { captured = t; return orig(t); };
    try {
      copyBtn.click();
    } catch (e) {
      warn('Copy Strokes click failed: ' + e.message);
      return { strokes: [], reason: 'click-failed' };
    } finally {
      navigator.clipboard.writeText = orig;
    }
    if (!captured) return { strokes: [], reason: 'empty' };
    try {
      const parsed = JSON.parse(captured);
      if (Array.isArray(parsed)) return { strokes: parsed, reason: null };
    } catch (e) {
      warn('Could not parse clipboard strokes: ' + e.message);
    }
    return { strokes: [], reason: 'parse-failed' };
  }

  function readAllStrokesFromCanvas() {
    if (!state.canvas) return [];
    const palette = BP.readPaletteFromDOM() || [];
    if (!palette.length) return [];
    return BP.readCanvasAsStrokes(state.canvas, palette);
  }

  async function fetchApiCanvas() {
    return new Promise((resolve, reject) => {
      const out = document.createElement('canvas');
      out.width = BP.CANVAS_SIZE;
      out.height = BP.CANVAS_SIZE;
      const ctx = out.getContext('2d', { willReadFrequently: true });
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, BP.CANVAS_SIZE, BP.CANVAS_SIZE);
        resolve(out);
      };
      img.onerror = () => reject(new Error('API image failed to load'));
      img.src = `https://basepaint.xyz/api/art/image?day=painting&scale=1&v=${Date.now()}`;
    });
  }

  async function diffStrokesAgainstApi() {
    const mainCanvas = Array.from(document.querySelectorAll('canvas')).find(
      (c) => !c.classList.contains('overlay-canvas')
    );
    if (!mainCanvas) return [];
    state.canvas = mainCanvas;
    const palette = BP.readPaletteFromDOM() || [];
    if (!palette.length) return [];

    const gridBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.title === 'Hide Grid' || b.title === 'Show Grid'
    );
    const gridWasHidden = gridBtn && gridBtn.title === 'Show Grid';
    if (gridBtn && !gridWasHidden) {
      gridBtn.click();
      await new Promise((r) => setTimeout(r, 250));
    }

    let apiCanvas;
    try {
      apiCanvas = await fetchApiCanvas();
    } catch (e) {
      warn('API canvas fetch failed: ' + e.message);
      if (gridBtn && !gridWasHidden) gridBtn.click();
      return [];
    }

    const SIZE = BP.CANVAS_SIZE;
    const scale = mainCanvas.width / SIZE;
    const userCanvas = document.createElement('canvas');
    userCanvas.width = mainCanvas.width;
    userCanvas.height = mainCanvas.height;
    const userCtx = userCanvas.getContext('2d', { willReadFrequently: true });
    userCtx.drawImage(mainCanvas, 0, 0);
    const userData = userCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height).data;
    const apiData = apiCanvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, SIZE, SIZE).data;
    const lookup = BP.buildPaletteLookup(palette);
    const out = [];
    for (let ly = 0; ly < SIZE; ly++) {
      for (let lx = 0; lx < SIZE; lx++) {
        const bx = Math.min(mainCanvas.width - 1, Math.floor(lx * scale));
        const by = Math.min(mainCanvas.height - 1, Math.floor(ly * scale));
        const uIdx = (by * mainCanvas.width + bx) * 4;
        const aIdx = (ly * SIZE + lx) * 4;
        const ur = userData[uIdx], ug = userData[uIdx + 1], ub = userData[uIdx + 2];
        const ar = apiData[aIdx], ag = apiData[aIdx + 1], ab = apiData[aIdx + 2];
        if (ur !== ar || ug !== ag || ub !== ab) {
          const exact = BP.getColorIndex(ur, ug, ub, lookup);
          const color = exact !== -1 ? exact : BP.getNearestColorIndex(ur, ug, ub, lookup);
          out.push({ point: { x: lx, y: ly }, color });
        }
      }
    }
    if (gridBtn && !gridWasHidden) gridBtn.click();
    return out;
  }

  function strokesToText(strokes) {
    return JSON.stringify(strokes);
  }

  async function downloadStrokesSingle() {
    let strokes = await diffStrokesAgainstApi();
    let source = 'overlay canvas';
    if (!strokes.length) {
      const result = readMyStrokesFromClipboard();
      strokes = result.strokes;
      source = 'Copy Strokes';
    }
    if (!strokes.length) {
      warn('No strokes to download — draw some on the canvas first.');
      return;
    }
    log(`📥 Source: ${source} (${strokes.length} strokes)`);
    const day = BP.getCurrentDay();
    BP.downloadText(strokesToText(strokes), `basepaint-stroke-${day}.txt`);
    log(`✅ Downloaded ${strokes.length} strokes`);
  }

  async function downloadStrokesSplit(chunkSize) {
    let strokes = await diffStrokesAgainstApi();
    let source = 'overlay canvas';
    if (!strokes.length) {
      const result = readMyStrokesFromClipboard();
      strokes = result.strokes;
      source = 'Copy Strokes';
    }
    if (!strokes.length) {
      warn('No strokes to split — draw some on the canvas first.');
      return;
    }
    log(`📥 Source: ${source} (${strokes.length} strokes)`);
    const sections = [];
    for (let i = 0; i < strokes.length; i += chunkSize) {
      sections.push(strokes.slice(i, i + chunkSize));
    }
    const total = sections.length;
    for (let i = 0; i < sections.length; i++) {
      const num = String(i + 1).padStart(3, '0');
      const totalStr = String(total).padStart(3, '0');
      await new Promise((r) => setTimeout(r, 80));
      BP.downloadText(
        strokesToText(sections[i]),
        `basepaint-stroke-${num}-of-${totalStr}.txt`
      );
    }
    log(`✅ Split ${strokes.length} strokes into ${total} files`);
  }

  function refreshToggleButtons() {
    document.querySelectorAll(`.${PLUGIN_ID}-btn`).forEach((btn) => {
      const btnTool = btn.id.replace(`${PLUGIN_ID}-`, '');
      btn.classList.toggle(`${PLUGIN_ID}-btn--active`, btnTool === state.activeTool);
    });
  }

  function installDiagnosticProbe(canvas) {
    if (!window.__BP_DEBUG__) return;
    console.warn(LOG_PREFIX, '=== DIAGNOSTIC PROBE ENABLED ===');

    function safeStringify(obj, maxLen = 200) {
      try {
        let s = JSON.stringify(obj, (_, v) => typeof v === 'function' ? `[fn ${v.name || 'anon'}]` : v);
        if (s && s.length > maxLen) s = s.slice(0, maxLen) + '…';
        return s;
      } catch { return '<unserializable>'; }
    }

    function dumpGlobals() {
      const candidates = ['paint', 'submit', 'submitPaint', 'submitStroke', 'sendStroke', 'paintStroke', 'sendPaint', 'onPaint', '__paintStore', '__strokeStore', 'BasePaint', '__bp', 'store'];
      const found = {};
      for (const k of candidates) {
        if (k in window) found[k] = typeof window[k];
      }
      console.warn(LOG_PREFIX, 'window globals:', found);
    }

    function dumpReactFiber(el) {
      const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!key) return null;
      let fiber = el[key];
      let depth = 0;
      const ancestors = [];
      while (fiber && depth++ < 12) {
        const name = fiber.type && (fiber.type.displayName || fiber.type.name) || fiber.elementType?.name;
        if (name) ancestors.push({ name, props: fiber.memoizedProps ? Object.keys(fiber.memoizedProps) : [] });
        fiber = fiber.return;
      }
      return ancestors;
    }

    dumpGlobals();

    const desktop = document.getElementById('toolbar');
    if (desktop) {
      const buttons = desktop.querySelectorAll('button');
      buttons.forEach((btn, idx) => {
        const fiberInfo = dumpReactFiber(btn);
        console.warn(LOG_PREFIX, `toolbar button[${idx}] title="${btn.title || ''}" id="${btn.id || ''}"`, {
          className: btn.className,
          fiberAncestors: fiberInfo?.slice(0, 5),
          onClickName: btn.onclick?.name || '(none)',
          reactPropsKeys: Object.keys(btn).filter((k) => k.startsWith('__reactProps')),
        });
      });
    }

    const saveBtn =
      document.querySelector('button#commit') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.title?.toLowerCase().includes('save') || b.title?.toLowerCase().includes('commit'));
    if (saveBtn) {
      console.warn(LOG_PREFIX, 'Save button found:', { title: saveBtn.title, id: saveBtn.id });
      saveBtn.addEventListener('click', () => {
        console.warn(LOG_PREFIX, 'Save button clicked');
      }, true);
    }

    document.addEventListener('paste', (e) => {
      console.warn(LOG_PREFIX, 'paste event fired', {
        clipboardDataItems: e.clipboardData ? Array.from(e.clipboardData.items).map((it) => ({ kind: it.kind, type: it.type })) : null,
        target: e.target?.tagName,
      });
    }, true);

    const origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function patchedFetch(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        if (url && (url.includes('/paint') || url.includes('/api/') || url.includes('/submit'))) {
          let body = args[1]?.body;
          if (body instanceof ArrayBuffer) body = `[ArrayBuffer ${body.byteLength} bytes]`;
          else if (body instanceof Uint8Array) body = `[Uint8Array ${body.length}]`;
          console.warn(LOG_PREFIX, 'fetch', { method: args[1]?.method || 'GET', url, body: safeStringify(body, 300) });
        }
        return origFetch.apply(this, args);
      };
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const proto = Object.getPrototypeOf(ctx);
      const origDraw = proto.drawImage;
      proto.drawImage = function patchedDraw(...args) {
        if (args[0] && args[0] !== canvas && (args[0].width === 256 || args[0].width === 768)) {
          console.warn(LOG_PREFIX, 'ctx.drawImage', {
            srcW: args[0].width, srcH: args[0].height,
            dx: args[1], dy: args[2], dW: args[3], dH: args[4],
          });
        }
        return origDraw.apply(this, args);
      };
      const origGetImageData = proto.getImageData;
      proto.getImageData = function patchedGID(...args) {
        const result = origGetImageData.apply(this, args);
        if (result.width === 256 || result.width === 768) {
          console.warn(LOG_PREFIX, 'ctx.getImageData', { w: result.width, h: result.height });
        }
        return result;
      };
    }

    console.warn(LOG_PREFIX, '=== DIAGNOSTIC PROBE READY ===');
  }

  function installCanvasInterceptor(canvas) {
    const BP = window.__BP_PLUGIN__;
    let bucketFilling = false;

    canvas.addEventListener('pointerdown', async (event) => {
      if (!state.activeTool) return;
      if (state.activeTool !== 'bucket' && state.activeTool !== 'picker') return;

      const bitmap = BP.screenToPixel(canvas, event.clientX, event.clientY);
      const pixel = BP.bitmapToLogical(canvas, bitmap.x, bitmap.y);
      const logicalSize = BP.getLogicalSize(canvas);

      if (pixel.x < 0 || pixel.x >= logicalSize || pixel.y < 0 || pixel.y >= logicalSize) return;

      if (state.activeTool === 'bucket' && bucketFilling) return;
      if (state.activeTool === 'picker' && bucketFilling) return;

      event.preventDefault();
      event.stopPropagation();
      if (state.activeTool === 'bucket') {
        bucketFilling = true;
        suppressNativeWatch = true;
        try {
          await BP.executeBucketFill(canvas, pixel.x, pixel.y, { mode: 'flood', diagonal: false });
        } finally {
          setTimeout(() => {
            bucketFilling = false;
            suppressNativeWatch = false;
          }, 200);
        }
      } else if (state.activeTool === 'picker') {
        BP.executeColorPick(canvas, pixel.x, pixel.y);
        setActiveTool(null);
      }
    });
  }

  function injectToolButtons(toolbar) {
    if (document.getElementById(PLUGIN_ID)) return;

    const isDesktopPalette = toolbar.id === 'toolbar';

    if (isDesktopPalette) {
      const main = toolbar.querySelector(':scope > .no-drag') || toolbar;

      let nativeToolsGrid = null;
      for (const child of main.children) {
        if (
          child.tagName === 'DIV' &&
          child.classList.contains('grid') &&
          child.classList.contains('grid-cols-2')
        ) {
          const firstBtn = child.querySelector(':scope > button');
          if (firstBtn && (firstBtn.querySelector('svg') || firstBtn.querySelector('img'))) {
            nativeToolsGrid = child;
            break;
          }
        }
      }

      const section = document.createElement('div');
      section.id = PLUGIN_ID;
      section.className = `${PLUGIN_ID}-container grid grid-cols-2 gap-2 no-drag`;

      const buttons = [
        createToolButton('bucket', TOOL_ICONS.bucket, 'Bucket Fill (B)', onBucketClick),
        createToolButton('picker', TOOL_ICONS.picker, 'Color Picker (I)', onPickerClick),
        createToolButton('upload', TOOL_ICONS.upload, 'Upload Image (Plugin)', onUploadClick),
        createToolButton('download', TOOL_ICONS.download, 'Download (Plugin)', onDownloadClick),
      ];

      for (const btn of buttons) {
        btn.classList.add(
          'p-2', 'bg-gray-800', 'rounded',
          'border', 'border-transparent',
          'hover:bg-gray-700', 'transition-colors',
          'flex', 'items-center', 'justify-center',
          'text-gray-400', 'hover:text-white'
        );
        section.appendChild(btn);
      }

      if (nativeToolsGrid && nativeToolsGrid.parentElement === main) {
        main.insertBefore(section, nativeToolsGrid);
        log('✅ Plugin buttons injected above native tools (before Save)');
      } else {
        main.appendChild(section);
        log('✅ Plugin buttons injected (native tools grid not found)');
      }
      return section;
    }

    const container = document.createElement('div');
    container.id = PLUGIN_ID;
    container.className = `${PLUGIN_ID}-container flex flex-row items-center gap-2 pl-2 ml-1 border-l border-white/10`;

    const buttons = [
      createToolButton('bucket', TOOL_ICONS.bucket, 'Bucket Fill (B)', onBucketClick),
      createToolButton('picker', TOOL_ICONS.picker, 'Color Picker (I)', onPickerClick),
      createToolButton('upload', TOOL_ICONS.upload, 'Upload Image (Plugin)', onUploadClick),
      createToolButton('download', TOOL_ICONS.download, 'Download (Plugin)', onDownloadClick),
    ];

    for (const btn of buttons) {
      btn.classList.add(
        'p-2', 'bg-transparent', 'rounded',
        'flex', 'flex-row', 'justify-center', 'items-center',
        'text-gray-400', 'min-w-[40px]', 'min-h-[40px]'
      );
      container.appendChild(btn);
    }

    toolbar.appendChild(container);
    log('✅ Plugin buttons injected into mobile toolbar');
    return container;
  }

  function startObserver() {
    let attempts = 0;
    const MAX_ATTEMPTS = 50;
    const BASE_INTERVAL = 500;

    function tryInject() {
      attempts++;

      const canvas = findCanvas();
      const toolbar = findToolbar();

      if (!toolbar) {
        log(`attempt ${attempts}: no toolbar (path=${location.pathname})`);
      }

      if (canvas && toolbar) {
        state.canvas = canvas;
        state.toolbar = toolbar;

        log('Found canvas:', canvas.width, 'x', canvas.height);
        log('Found toolbar:', toolbar.tagName, toolbar.children.length, 'children');

        const container = injectToolButtons(toolbar);
        if (container) {
          log('🎉 BasePaint Plugin loaded successfully!');

          installCanvasInterceptor(canvas);

          installNativeToolWatcher();

          installDiagnosticProbe(canvas);

          let reinjectTimer = null;
          const reinjectObserver = new MutationObserver(() => {
            if (reinjectTimer) return;
            reinjectTimer = setTimeout(() => {
              reinjectTimer = null;
              const toolbarGone = !state.toolbar || !state.toolbar.isConnected;
              const containerGone = !document.getElementById(PLUGIN_ID);
              if (toolbarGone && containerGone) {
                log('Plugin container removed — re-injecting...');
                const newToolbar = findToolbar();
                if (newToolbar) {
                  state.toolbar = newToolbar;
                  state.canvas = findCanvas() || state.canvas;
                  injectToolButtons(newToolbar);
                }
              }
            }, 500);
          });
          reinjectObserver.observe(document.getElementById('__next') || document.body, {
            childList: true,
            subtree: true,
          });

          return;
        }
      }

      if (attempts < MAX_ATTEMPTS) {

        const delay = Math.min(BASE_INTERVAL * Math.pow(1.1, attempts), 3000);
        setTimeout(tryInject, delay);
      } else {
        warn(`Failed to find toolbar/canvas after ${MAX_ATTEMPTS} attempts. BasePaint may have changed its structure.`);
        warn('The plugin will not load. Please report this at the extension settings.');
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(tryInject, 1000));
    } else {

      setTimeout(tryInject, 1000);
    }
  }

  log('Initializing...');
  startObserver();
  installKeyboardShortcuts();
  installHelpContainerObserver();
  setTimeout(installPickerPreview, 500);

  setTimeout(() => {
    const BP = window.__BP_PLUGIN__;
    if (BP && BP.shouldShowAbout && BP.shouldShowAbout() && typeof BP.showAboutModal === 'function') {
      BP.showAboutModal({ autoShown: true });
    }
  }, 800);
})();
