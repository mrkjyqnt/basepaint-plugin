

(function () {
  'use strict';

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  BP.bucketFill = function (canvas, startX, startY, fillColorHex, opts) {
    const SIZE = BP.getLogicalSize(canvas);
    const bitmapScale = canvas.width / SIZE;
    const imageData = BP.readCanvasPixels(canvas);
    const data = imageData.data;
    const BW = canvas.width;

    opts = opts || {};
    const diagonal = opts.diagonal !== false;
    const fillTransparent = opts.fillTransparent !== false;

    const readLogical = (lx, ly) => {
      const bx = Math.min(BW - 1, Math.floor(lx * bitmapScale));
      const by = Math.min(canvas.height - 1, Math.floor(ly * bitmapScale));
      const idx = (by * BW + bx) * 4;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
    };

    const start = readLogical(startX, startY);
    const fillR = parseInt(fillColorHex.slice(1, 3), 16);
    const fillG = parseInt(fillColorHex.slice(3, 5), 16);
    const fillB = parseInt(fillColorHex.slice(5, 7), 16);

    console.log(`[basepaint-plugin] bucketFill start: pixel(${startX},${startY}) rgba(${start.r},${start.g},${start.b},${start.a}) → fill ${fillColorHex}`);

    const startIsEmpty = start.a < 16;
    const targetR = startIsEmpty && fillTransparent ? 0 : start.r;
    const targetG = startIsEmpty && fillTransparent ? 0 : start.g;
    const targetB = startIsEmpty && fillTransparent ? 0 : start.b;

    if (
      start.r === fillR && start.g === fillG && start.b === fillB &&
      (start.a === 255 || !fillTransparent)
    ) {
      console.log('[basepaint-plugin] bucketFill: start color already matches fill color — nothing to do');
      return [];
    }

    const filled = [];
    const visited = new Uint8Array(SIZE * SIZE);
    const queue = [[startX, startY]];
    visited[startY * SIZE + startX] = 1;

    const matches = (p) => {
      if (!fillTransparent && p.a < 16) return false;
      if (p.r === fillR && p.g === fillG && p.b === fillB && p.a === 255) return false;
      return p.r === targetR && p.g === targetG && p.b === targetB;
    };

    while (queue.length > 0) {
      const [x, y] = queue.shift();
      filled.push({ x, y });
      const cardinals = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ];
      const diagonals = [
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
      ];
      const checks = diagonal ? cardinals.concat(diagonals) : cardinals;

      for (const [nx, ny] of checks) {
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const key = ny * SIZE + nx;
        if (visited[key]) continue;
        visited[key] = 1;
        if (matches(readLogical(nx, ny))) queue.push([nx, ny]);
      }
    }

    return filled;
  };

  BP.executeBucketFill = async function (canvas, pixelX, pixelY, opts) {
    const activeColor = BP.readActiveColorFromDOM();
    if (!activeColor) {
      console.warn('[basepaint-plugin] Could not determine active palette color');
      return 0;
    }

    const palette = BP.readPaletteFromDOM();
    if (palette.length === 0) {
      warn('No palette available');
      return 0;
    }
    const colorIdx = palette.findIndex((c) => c.toLowerCase() === activeColor.toLowerCase());
    if (colorIdx < 0) {
      console.warn('[basepaint-plugin] Active color not in palette:', activeColor);
      return 0;
    }

    console.log(`[basepaint-plugin] Bucket fill at logical (${pixelX}, ${pixelY}) with ${activeColor} (palette[${colorIdx}])`);

    const logical = BP.bucketFill(canvas, pixelX, pixelY, activeColor, opts);
    if (logical.length === 0) {
      console.log('[basepaint-plugin] Nothing to fill (same color or empty region)');
      return 0;
    }

    console.log(`[basepaint-plugin] Bucket fill: writing ${logical.length} pixels directly to canvas bitmap`);

    const logicalSize = BP.getLogicalSize(canvas);
    const scale = canvas.width / logicalSize;
    const ctx = canvas.getContext('2d');
    for (const p of logical) {
      ctx.fillStyle = activeColor;
      ctx.fillRect(p.x * scale, p.y * scale, scale, scale);
    }

    const strokes = logical.map((p) => ({ point: { x: p.x, y: p.y }, color: colorIdx }));

    try {
      const strokesJson = JSON.stringify(logical.map((p) => ({ point: { x: p.x, y: p.y }, color: colorIdx })));
      await navigator.clipboard.writeText(strokesJson);
    } catch (e) {
      console.warn('[basepaint-plugin] Could not write bucket strokes to clipboard:', e.message);
      return logical.length;
    }

    const pasteBtn = document.querySelector('#toolbar button[title="Paste Strokes"]');
    if (pasteBtn && !pasteBtn.disabled) {
      try {
        pasteBtn.click();
        console.log(`[basepaint-plugin] ✅ Clicked Paste Strokes for ${logical.length} bucket pixels`);
      } catch (e) {
        console.warn('[basepaint-plugin] Paste Strokes click failed:', e.message);
      }
    } else {
      console.log('[basepaint-plugin] Strokes in clipboard — press Ctrl+V to apply');
    }

    return logical.length;
  };

  console.log('[basepaint-plugin] Bucket fill tool loaded');
})();
