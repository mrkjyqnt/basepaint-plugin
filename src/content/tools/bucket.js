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

  function writePixelsToCanvasDirect(canvas, pixels, palette) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const logical = BP.getLogicalSize(canvas);
    const scale = canvas.width / logical;
    const lastHex = { value: null };
    for (const pixel of pixels) {
      const hex = palette[pixel.color];
      if (!hex) continue;
      if (hex !== lastHex.value) {
        ctx.fillStyle = hex;
        lastHex.value = hex;
      }
      ctx.fillRect(pixel.point.x * scale, pixel.point.y * scale, scale, scale);
    }
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

    const strokes = logical.map((p) => ({
      point: { x: p.x, y: p.y },
      color: colorIdx,
    }));

    console.log(
      `[basepaint-plugin] Bucket fill: writing ${strokes.length} pixels (mode=${opts?.mode || "flood"})`,
    );

    writePixelsToCanvasDirect(canvas, strokes, palette);
    await BP.applyStrokesDirectly(strokes);

    return strokes.length;
  };

  console.log("[basepaint-plugin] Bucket fill tool loaded");
})();
