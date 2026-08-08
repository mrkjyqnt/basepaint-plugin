(function () {
  "use strict";

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  function parseHexColor(hex) {
    if (!hex || hex[0] !== "#") return null;
    const h = hex.slice(1);
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      };
    }
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    return null;
  }

  BP.bucketFill = function (canvas, startX, startY, fillColorHex, opts) {
    const SIZE = BP.getLogicalSize(canvas);
    const bitmapScale = canvas.width / SIZE;
    const imageData = BP.readCanvasPixels(canvas);
    const data = imageData.data;
    const BW = canvas.width;

    opts = opts || {};
    const diagonal = opts.diagonal !== false;
    const fillTransparent = opts.fillTransparent !== false;
    const mode = opts.mode === "magic" ? "magic" : "flood";

    const readLogical = (lx, ly) => {
      const bx = Math.min(BW - 1, Math.floor(lx * bitmapScale));
      const by = Math.min(canvas.height - 1, Math.floor(ly * bitmapScale));
      const idx = (by * BW + bx) * 4;
      return {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      };
    };

    const start = readLogical(startX, startY);
    const fillR = parseInt(fillColorHex.slice(1, 3), 16);
    const fillG = parseInt(fillColorHex.slice(3, 5), 16);
    const fillB = parseInt(fillColorHex.slice(5, 7), 16);

    if (
      start.r === fillR &&
      start.g === fillG &&
      start.b === fillB &&
      (start.a === 255 || !fillTransparent)
    ) {
      return [];
    }

    const startIsEmpty = start.a < 16;
    let targetR, targetG, targetB;
    if (mode === "magic") {
      targetR = targetG = targetB = null;
    } else {
      targetR = startIsEmpty ? 0 : start.r;
      targetG = startIsEmpty ? 0 : start.g;
      targetB = startIsEmpty ? 0 : start.b;
    }

    const filled = [];
    const visited = new Uint8Array(SIZE * SIZE);
    const queue = [[startX, startY]];
    let head = 0;
    visited[startY * SIZE + startX] = 1;

    const matches = (p) => {
      if (!fillTransparent && p.a < 16) return false;
      if (p.r === fillR && p.g === fillG && p.b === fillB && p.a === 255)
        return false;
      if (mode === "magic") return p.a >= 16;
      if (startIsEmpty && fillTransparent) return p.a < 16;
      return p.r === targetR && p.g === targetG && p.b === targetB && p.a >= 16;
    };

    while (head < queue.length) {
      const [x, y] = queue[head++];
      filled.push({ x, y });
      const cardinals = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      const diagonals = [
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
        [x + 1, y + 1],
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
      console.warn(
        "[basepaint-plugin] Could not determine active palette color",
      );
      return 0;
    }

    const palette = BP.readPaletteFromDOM();
    if (palette.length === 0) {
      warn("No palette available");
      return 0;
    }
    const colorIdx = palette.findIndex(
      (c) => c.toLowerCase() === activeColor.toLowerCase(),
    );
    if (colorIdx < 0) {
      console.warn(
        "[basepaint-plugin] Active color not in palette:",
        activeColor,
      );
      return 0;
    }

    const logical = BP.bucketFill(canvas, pixelX, pixelY, activeColor, opts);
    if (logical.length === 0) {
      return 0;
    }

    console.log(
      `[basepaint-plugin] Bucket fill: writing ${logical.length} pixels (mode=${opts?.mode || "flood"})`,
    );

    const logicalSize = BP.getLogicalSize(canvas);
    const scale = canvas.width / logicalSize;
    const BW = canvas.width;
    const BH = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const colorObj = parseHexColor(activeColor);
    if (colorObj) {
      const imgData = ctx.getImageData(0, 0, BW, BH);
      const data = imgData.data;
      const r = colorObj.r,
        g = colorObj.g,
        b = colorObj.b,
        a = 255;
      for (let i = 0; i < logical.length; i++) {
        const p = logical[i];
        const bx0 = Math.floor(p.x * scale);
        const by0 = Math.floor(p.y * scale);
        const bx1 = Math.min(BW - 1, bx0 + scale - 1);
        const by1 = Math.min(BH - 1, by0 + scale - 1);
        for (let by = by0; by <= by1; by++) {
          const rowOff = by * BW * 4;
          for (let bx = bx0; bx <= bx1; bx++) {
            const off = rowOff + bx * 4;
            data[off] = r;
            data[off + 1] = g;
            data[off + 2] = b;
            data[off + 3] = a;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    try {
      const strokesJson = JSON.stringify(
        logical.map((p) => ({ point: { x: p.x, y: p.y }, color: colorIdx })),
      );
      await navigator.clipboard.writeText(strokesJson);
    } catch (e) {
      console.warn(
        "[basepaint-plugin] Could not write bucket strokes to clipboard:",
        e.message,
      );
      return logical.length;
    }

    const pasteBtn = document.querySelector(
      '#toolbar button[title="Paste Strokes"]',
    );
    if (pasteBtn && !pasteBtn.disabled) {
      try {
        pasteBtn.click();
      } catch (e) {
        console.warn(
          "[basepaint-plugin] Paste Strokes click failed:",
          e.message,
        );
      }
    }

    return logical.length;
  };

  console.log("[basepaint-plugin] Bucket fill tool loaded");
})();
