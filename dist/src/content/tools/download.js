/**
 * BasePaint Plugin — Stroke Download Tool
 *
 * Exports the user's strokes as:
 *   1. PNG (transparent background) — just the strokes
 *   2. Text file in basepaint paste format — single file or N-pixel chunks
 *
 * Detection flow:
 *   1. Try basepaint's native Copy Strokes button (returns committed strokes)
 *   2. Fall back to canvas-vs-API diff (catches uncommitted/drawn-but-not-saved)
 *
 * Both paths only return the user's strokes, not the entire day's painted canvas.
 */

(function () {
  'use strict';

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

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
      console.warn('[basepaint-plugin] Copy Strokes click failed:', e.message);
      return { strokes: [], reason: 'click-failed' };
    } finally {
      navigator.clipboard.writeText = orig;
    }
    if (!captured) return { strokes: [], reason: 'empty' };
    try {
      const parsed = JSON.parse(captured);
      if (Array.isArray(parsed)) return { strokes: parsed, reason: null };
    } catch (e) {
      console.warn('[basepaint-plugin] Could not parse clipboard strokes:', e.message);
    }
    return { strokes: [], reason: 'parse-failed' };
  }

  function fetchApiCanvas() {
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
      console.warn('[basepaint-plugin] API canvas fetch failed:', e.message);
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

  async function getUserStrokes() {
    let strokes = await diffStrokesAgainstApi();
    if (!strokes.length) {
      strokes = readMyStrokesFromClipboard().strokes;
    }
    return strokes;
  }

  function strokesToText(strokes) {
    return JSON.stringify(strokes);
  }

  function openDownloadModal() {
    const id = `basepaint-plugin-modal-download`;
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
    const statsBlock = document.createElement('div');
    statsBlock.className = 'basepaint-plugin-modal-stats-block';
    let strokes = [];

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
      counts.innerHTML = `<b>${strokes.length}</b> stroke${strokes.length === 1 ? '' : 's'} · ~<b>${estKb} KB</b>`;
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
      const canvas = Array.from(document.querySelectorAll('canvas')).find(
        (c) => !c.classList.contains('overlay-canvas')
      );
      BP.exportCanvasPNG(canvas, { strokes, palette });
      console.log('[basepaint-plugin] PNG download triggered');
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

    (async () => {
      strokes = await getUserStrokes();
      renderStats();
    })();
  }

  async function downloadStrokesSingle() {
    const strokes = await getUserStrokes();
    if (!strokes.length) {
      console.warn('[basepaint-plugin] No strokes to download — draw some on the canvas first.');
      return;
    }
    const day = BP.getCurrentDay();
    BP.downloadText(strokesToText(strokes), `basepaint-stroke-${day}.txt`);
    console.log(`[basepaint-plugin] Downloaded ${strokes.length} strokes`);
  }

  async function downloadStrokesSplit(chunkSize) {
    const strokes = await getUserStrokes();
    if (!strokes.length) {
      console.warn('[basepaint-plugin] No strokes to split — draw some on the canvas first.');
      return;
    }
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
    console.log(`[basepaint-plugin] Split ${strokes.length} strokes into ${total} files`);
  }

  BP.openDownloadModal = openDownloadModal;
  BP.downloadStrokesSingle = downloadStrokesSingle;
  BP.downloadStrokesSplit = downloadStrokesSplit;
  BP.getUserStrokes = getUserStrokes;
  BP.diffStrokesAgainstApi = diffStrokesAgainstApi;
  BP.readMyStrokesFromClipboard = readMyStrokesFromClipboard;

  console.log('[basepaint-plugin] Stroke download tool loaded');
})();