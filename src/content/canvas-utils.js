

(function () {
  'use strict';

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  BP.CANVAS_SIZE = 256;
  BP.THEME_API = 'https://basepaint.xyz/api/theme/';
  BP.EPOCH_START = Date.parse('2023-08-08T16:41:05Z');

  BP.buildPaletteLookup = function (palette) {
    const map = new Map();
    const rgb = [];
    for (let i = 0; i < palette.length; i++) {
      const hex = palette[i].toLowerCase();
      map.set(hex, i);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      rgb.push([r, g, b]);
    }
    map._rgb = rgb;
    return map;
  };

  BP.getColorIndex = function (r, g, b, lookup) {
    const hex = `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
    return lookup.get(hex) ?? -1;
  };

  BP.getNearestColorIndex = function (r, g, b, lookup) {
    const rgb = lookup._rgb;
    if (!rgb) {
      const idx = BP.getColorIndex(r, g, b, lookup);
      return idx === -1 ? 0 : idx;
    }
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < rgb.length; i++) {
      const dr = rgb[i][0] - r;
      const dg = rgb[i][1] - g;
      const db = rgb[i][2] - b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  BP.paletteIndexToHex = function (index, palette) {
    return index >= 0 && index < palette.length ? palette[index] : null;
  };

  BP.getCurrentDay = function () {
    const diffMs = Date.now() - BP.EPOCH_START;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  BP.fetchTheme = async function (day) {
    day = day ?? BP.getCurrentDay();
    const url = `${BP.THEME_API}${day}`;

    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {

    }

    const proxyUrl = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`Failed to fetch theme for day ${day}`);
    return res.json();
  };

  BP.readCanvasPixels = function (canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  BP.getPixelAt = function (imageData, x, y, width) {
    const i = (y * width + x) * 4;
    return {
      r: imageData.data[i],
      g: imageData.data[i + 1],
      b: imageData.data[i + 2],
      a: imageData.data[i + 3],
    };
  };

  BP.pixelToScreen = function (canvas, logicalX, logicalY) {
    const bitmap = BP.logicalToBitmap(canvas, logicalX, logicalY);
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    return {
      clientX: rect.left + (bitmap.x + 0.5) * scaleX,
      clientY: rect.top + (bitmap.y + 0.5) * scaleY,
    };
  };

  BP.screenToPixel = function (canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY),
    };
  };

  BP.simulatePointerEvent = function (canvas, eventType, pixelX, pixelY) {
    const { clientX, clientY } = BP.pixelToScreen(canvas, pixelX, pixelY);
    const event = new PointerEvent(eventType, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: eventType === 'pointerup' ? 0 : 1,
      pressure: eventType === 'pointerup' ? 0 : 0.5,
    });
    canvas.dispatchEvent(event);
  };

  BP.simulatePixelPlace = function (canvas, x, y) {
    BP.simulatePointerEvent(canvas, 'pointerdown', x, y);
    BP.simulatePointerEvent(canvas, 'pointerup', x, y);
  };

  BP.simulatePixelBatch = function (canvas, pixels, batchSize = 50) {
    return new Promise((resolve) => {
      let i = 0;
      function tick() {
        const end = Math.min(i + batchSize, pixels.length);
        for (; i < end; i++) {
          BP.simulatePixelPlace(canvas, pixels[i].x, pixels[i].y);
        }
        if (i < pixels.length) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  };

  BP.loadImage = function (source) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = source instanceof File ? URL.createObjectURL(source) : source;
    });
  };

  BP.getLogicalSize = function (canvas) {
    if (canvas) {
      const w = canvas.width;
      const candidates = [256, 128, 512, 64, 32];
      for (const c of candidates) {
        if (w === c * 3 || w === c) return c;
      }
    }
    return BP.CANVAS_SIZE;
  };

  BP.bitmapToLogical = function (canvas, bitmapX, bitmapY) {
    const logical = BP.getLogicalSize(canvas);
    const scale = canvas.width / logical;
    return {
      x: Math.floor(bitmapX / scale),
      y: Math.floor(bitmapY / scale),
    };
  };

  BP.logicalToBitmap = function (canvas, logicalX, logicalY) {
    const logical = BP.getLogicalSize(canvas);
    const scale = canvas.width / logical;
    return {
      x: Math.round(logicalX * scale),
      y: Math.round(logicalY * scale),
    };
  };

  BP.extractImagePixels = function (img) {
    const canvas = document.createElement('canvas');
    canvas.width = BP.CANVAS_SIZE;
    canvas.height = BP.CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, BP.CANVAS_SIZE, BP.CANVAS_SIZE);
    return ctx.getImageData(0, 0, BP.CANVAS_SIZE, BP.CANVAS_SIZE);
  };

  BP.normalizeColor = function (raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s || s === 'transparent' || s === 'none' || s === 'inherit') return null;

    let m = s.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
    if (m) {
      return `#${((1 << 24) | (+m[1] << 16) | (+m[2] << 8) | +m[3]).toString(16).slice(1)}`;
    }

    m = s.match(/^#([0-9a-f]{3})$/);
    if (m) {
      const [, r, g, b] = m[1];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    m = s.match(/^#([0-9a-f]{6})$/);
    if (m) return `#${m[1]}`;
    return null;
  };

  BP.colorFromStyle = function (el) {
    const inline = el.getAttribute('style') || '';

    if (!/#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i.test(inline)) return null;

    const bg = el.style.background || '';
    const bgColor = el.style.backgroundColor || '';

    const shorthand = bg.match(/(?:^|[\s;])(?:#[0-9a-f]{3,8}|rgba?\([^)]+\))/i);
    if (shorthand) return BP.normalizeColor(shorthand[0].trim());

    if (bgColor) return BP.normalizeColor(bgColor);

    const any = inline.match(/#[0-9a-f]{6}|rgba?\([^)]+\)/i);
    if (any) return BP.normalizeColor(any[0]);
    return null;
  };

  BP.readPaletteFromDOM = function () {
    const tb = document.getElementById('toolbar');
    if (!tb) return null;

    const grid = tb.querySelectorAll('.grid.grid-cols-2')[0];
    if (!grid) return null;
    const colors = [];
    const seen = new Set();
    for (const btn of grid.querySelectorAll('button')) {
      const hex = BP.colorFromStyle(btn);
      if (!hex) continue;
      if (seen.has(hex)) continue;
      seen.add(hex);
      colors.push(hex);
    }
    return colors.length >= 3 ? colors : null;
  };

  BP.readActiveColorFromDOM = function () {

    const tb = document.getElementById('toolbar');
    if (!tb) return null;
    const grids = tb.querySelectorAll('.grid.grid-cols-2');
    if (grids.length === 0) return null;
    const palette = grids[0];

    const activeByClass = Array.from(palette.querySelectorAll('button')).find(
      (b) => {
        const cls = b.className || '';
        return /\bring-2\b/.test(cls) && /\bring-blue-500\b/.test(cls);
      }
    );
    if (activeByClass) return BP.colorFromStyle(activeByClass);

    const swatches = Array.from(palette.querySelectorAll('button'));
    let best = null;
    let bestScore = 0;
    for (const el of swatches) {
      const computed = getComputedStyle(el);
      const boxShadow = computed.boxShadow || '';
      const outline = computed.outline || '';
      const transform = computed.transform || '';
      const borderWidth = parseFloat(computed.borderWidth) || 0;

      let score = 0;
      if (boxShadow !== 'none' && /(\d+px)/.test(boxShadow)) score += 3;
      if (outline !== 'none' && !/0px/.test(outline)) score += 2;
      if (borderWidth >= 1) score += 2;
      if (transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') score += 1;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) return BP.colorFromStyle(best);
    return null;
  };

  BP.readCanvasAsStrokes = function (canvas, palette) {
    const SIZE = BP.getLogicalSize(canvas);
    const bitmapScale = canvas.width / SIZE;
    const imageData = BP.readCanvasPixels(canvas);
    const data = imageData.data;
    const BW = canvas.width;
    const lookup = BP.buildPaletteLookup(palette);
    const out = [];

    for (let ly = 0; ly < SIZE; ly++) {
      for (let lx = 0; lx < SIZE; lx++) {
        const bx = Math.min(BW - 1, Math.floor(lx * bitmapScale));
        const by = Math.min(canvas.height - 1, Math.floor(ly * bitmapScale));
        const idx = (by * BW + bx) * 4;
        const a = data[idx + 3];
        if (a < 16) continue;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const exact = BP.getColorIndex(r, g, b, lookup);
        const color = exact !== -1 ? exact : BP.getNearestColorIndex(r, g, b, lookup);
        out.push({ point: { x: lx, y: ly }, color });
      }
    }
    return out;
  };

  BP.readCanvasAsColorMap = function (canvas, palette) {
    const map = new Map();
    const strokes = BP.readCanvasAsStrokes(canvas, palette);
    for (const s of strokes) {
      map.set(s.point.x + ',' + s.point.y, s.color);
    }
    return map;
  };

  BP.exportCanvasPNG = function (canvas, filenameOrOpts) {
    const opts = (typeof filenameOrOpts === 'object' && filenameOrOpts) || {};
    const filename = typeof filenameOrOpts === 'string' ? filenameOrOpts : opts.filename;
    const SIZE = BP.getLogicalSize(canvas);
    const day = BP.getCurrentDay();
    const out = document.createElement('canvas');
    out.width = SIZE;
    out.height = SIZE;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
    out.toBlob((blob) => {
      if (!blob) return;
      BP.triggerDownload(blob, filename || `basepaint-day-${day}.png`);
    }, 'image/png');
  };

  BP.strokesToHex = function (strokes) {
    const bytes = new Uint8Array(strokes.length * 3);
    for (let i = 0; i < strokes.length; i++) {
      bytes[i * 3] = strokes[i].point.x;
      bytes[i * 3 + 1] = strokes[i].point.y;
      bytes[i * 3 + 2] = strokes[i].color;
    }
    let hex = '0x';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  };

  BP.triggerDownload = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 0);
  };

  BP.showPreviewModal = function (opts) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui, sans-serif; color: white;';

      const panel = document.createElement('div');
      panel.style.cssText = 'background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 16px; max-width: 90vw; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; gap: 10px;';

      const title = document.createElement('div');
      title.style.cssText = 'font-size: 15px; font-weight: 600;';
      title.textContent = opts.title;
      panel.appendChild(title);

      if (opts.description) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size: 12px; color: #9ca3af; text-align: center;';
        desc.textContent = opts.description;
        panel.appendChild(desc);
      }

      if (opts.previewCanvas) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'border: 1px solid #374151; border-radius: 4px; background: #111; padding: 4px;';
        const c = opts.previewCanvas;
        c.style.cssText = 'width: 160px; height: 160px; image-rendering: pixelated; display: block;';
        wrap.appendChild(c);
        panel.appendChild(wrap);
      }

      if (opts.extraContent) {
        panel.appendChild(opts.extraContent);
      }

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;';
      for (const opt of opts.buttons) {
        const b = document.createElement('button');
        b.textContent = opt.label;
        const isPrimary = opt.primary === true;
        b.style.cssText = `padding: 6px 14px; font-size: 13px; font-weight: 600; color: white; background: ${isPrimary ? '#3b82f6' : '#374151'}; border: 1px solid ${isPrimary ? '#3b82f6' : '#4b5563'}; border-radius: 6px; cursor: pointer;`;
        b.addEventListener('click', () => {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
          if (opt.close !== false) {
            const result = opt.onClick ? opt.onClick() : {};
            resolve(result || {});
          }
        });
        btnRow.appendChild(b);
      }
      panel.appendChild(btnRow);
      overlay.appendChild(panel);

      const onKey = (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
          resolve({ cancelled: true });
        }
      };
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.remove();
          document.removeEventListener('keydown', onKey);
          resolve({ cancelled: true });
        }
      });

      document.body.appendChild(overlay);
    });
  };

  BP.showAboutModal = function () {

    try {
      if (window.localStorage && window.localStorage.getItem('basepaint-plugin:about-dismissed') === '1') {
        return;
      }
    } catch (e) {  }

    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 10px; width: 100%; align-items: stretch; font-size: 12px; color: #d1d5db;';

    const intro = document.createElement('div');
    intro.style.cssText = 'text-align: center; line-height: 1.5;';
    intro.innerHTML = `
      <div style="font-weight: 600; color: #60a5fa; margin-bottom: 4px;">Basepaint Plugin v0.1.0</div>
      <div>Built at a Basepaint hackathon to add the tools we felt were missing.</div>
    `;
    container.appendChild(intro);

    const creds = document.createElement('div');
    creds.style.cssText = 'border-top: 1px solid #374151; padding-top: 8px; line-height: 1.5;';
    creds.innerHTML = `
      <div style="font-size: 11px; color: #9ca3af; margin-bottom: 4px;">Inspiration &amp; thanks to:</div>
      <div>• <b>CopyStroke</b> by <b>Afuro</b></div>
      <div>• <b>Baseprite</b> by <b>Creamy</b></div>
    `;
    container.appendChild(creds);

    const shareTitle = document.createElement('div');
    shareTitle.style.cssText = 'border-top: 1px solid #374151; padding-top: 8px; font-size: 11px; color: #9ca3af;';
    shareTitle.textContent = 'Share your thoughts — paste a comment link below:';
    container.appendChild(shareTitle);

    const shareInput = document.createElement('textarea');
    shareInput.placeholder = 'Paste a link to your comment / feedback here...';
    shareInput.style.cssText = 'width: 100%; min-height: 48px; background: #111827; color: white; border: 1px solid #374151; border-radius: 6px; padding: 6px 8px; font-size: 12px; font-family: system-ui, sans-serif; resize: vertical;';
    shareInput.addEventListener('focus', () => { shareInput.style.borderColor = '#3b82f6'; });
    shareInput.addEventListener('blur', () => {
      shareInput.style.borderColor = '#374151';
      if (shareInput.value.trim()) {
        console.log('[basepaint-plugin] User feedback:', shareInput.value.trim());
      }
    });
    container.appendChild(shareInput);

    const noShowRow = document.createElement('label');
    noShowRow.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 12px; color: #d1d5db; cursor: pointer; margin-top: 4px;';
    const noShowCb = document.createElement('input');
    noShowCb.type = 'checkbox';
    noShowCb.style.cssText = 'cursor: pointer;';
    noShowRow.appendChild(noShowCb);
    const noShowLbl = document.createElement('span');
    noShowLbl.textContent = "Don't show this again (per browser)";
    noShowRow.appendChild(noShowLbl);
    container.appendChild(noShowRow);

    BP.showPreviewModal({
      title: 'About Basepaint Plugin',
      extraContent: container,
      buttons: [
        { label: '✕ Close', primary: true, onClick: () => {
          if (noShowCb.checked) {
            try { window.localStorage.setItem('basepaint-plugin:about-dismissed', '1'); } catch (e) {}
          }
          return {};
        } },
      ],
    });
  };

  BP.downloadText = function (text, filename) {
    BP.triggerDownload(new Blob([text], { type: 'application/json' }), filename);
  };

  console.log('[basepaint-plugin] Canvas utilities loaded');
})();
