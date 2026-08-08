(function () {
  "use strict";

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  BP.processUploadedImage = async function (file, palette, opts) {
    const img = await BP.loadImage(file);
    const imageData = BP.extractImagePixels(img);
    const data = imageData.data;
    const lookup = BP.buildPaletteLookup(palette);
    const currentCanvas = (opts && opts.currentCanvas) || null;
    const result = [];

    for (let y = 0; y < BP.CANVAS_SIZE; y++) {
      for (let x = 0; x < BP.CANVAS_SIZE; x++) {
        const i = (y * BP.CANVAS_SIZE + x) * 4;
        const a = data[i + 3];
        if (a === 0) continue;

        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const exact = BP.getColorIndex(r, g, b, lookup);
        const colorIndex =
          exact !== -1 ? exact : BP.getNearestColorIndex(r, g, b, lookup);
        if (currentCanvas) {
          const key = x + "," + y;
          const existing = currentCanvas.get(key);
          if (existing !== undefined && existing === colorIndex) continue;
        }
        result.push({ point: { x, y }, color: colorIndex });
      }
    }

    return result;
  };

  BP.renderPixelsToCanvas = function (pixels, palette) {
    const SIZE = BP.CANVAS_SIZE;
    const out = document.createElement("canvas");
    out.width = SIZE;
    out.height = SIZE;
    const ctx = out.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;

    const lastHex = { value: null };
    for (const pixel of pixels) {
      const hex = palette[pixel.color];
      if (!hex) continue;
      if (hex !== lastHex.value) {
        ctx.fillStyle = hex;
        lastHex.value = hex;
      }
      ctx.fillRect(pixel.point.x, pixel.point.y, 1, 1);
    }
    return out;
  };

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

  BP.copyCanvasToClipboard = async function (canvas) {
    try {
      if (
        !navigator.clipboard ||
        !navigator.clipboard.write ||
        typeof ClipboardItem === "undefined"
      ) {
        return false;
      }
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return false;
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    } catch (e) {
      console.warn("[basepaint-plugin] Clipboard write failed:", e);
      return false;
    }
  };

  BP.findBasePaintComponent = function () {
    const sources = [];
    ["#toolbar", "#toolBar"].forEach((sel) => {
      const root = document.querySelector(sel);
      if (!root) return;
      root.querySelectorAll("*").forEach((el) => sources.push(el));
      sources.push(root);
    });

    let best = null;
    let bestSrc = null;
    for (const el of sources) {
      if (!el) continue;
      const fkey = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
      if (!fkey) continue;
      let f = el[fkey];
      let depth = 0;
      while (f && depth++ < 50) {
        const t = f.type;
        if (t && typeof t !== "string" && f.memoizedProps) {
          const p = f.memoizedProps;
          if (typeof p.onPaste === "function") {
            best = f;
            bestSrc =
              el.tagName +
              (el.id ? "#" + el.id : "") +
              (el.title ? "[" + el.title + "]" : "");
            break;
          }
        }
        f = f.return;
      }
      if (best) break;
    }
    return best;
  };

  BP.applyStrokesDirectly = async function (strokes) {
    const strokesJson = JSON.stringify(strokes);

    let clipboardWritten = false;
    try {
      await navigator.clipboard.writeText(strokesJson);
      clipboardWritten = true;
    } catch (e) {
      console.warn("[basepaint-plugin] Clipboard write failed:", e.message);
    }

    const F = BP.findBasePaintComponent();
    if (F && typeof F.memoizedProps?.onPaste === "function") {
      try {
        document.querySelector("canvas")?.focus();
      } catch {}
      try {
        await F.memoizedProps.onPaste();
        return { ok: true, source: "react-fiber" };
      } catch (e) {
        console.warn("[basepaint-plugin] React onPaste threw:", e.message);
      }
    }

    const pasteBtn = document.querySelector(
      '#toolbar button[title="Paste Strokes"]',
    );
    if (pasteBtn && clipboardWritten) {
      try {
        pasteBtn.click();
        return { ok: true, source: "paste-button-click" };
      } catch (e) {
        return { ok: false, reason: "Paste button click failed: " + e.message };
      }
    }

    return {
      ok: false,
      reason: clipboardWritten
        ? "No way to trigger paste"
        : "Clipboard write blocked",
    };
  };

  BP.simulatePasteKeydown = function (target) {
    try {
      const ev = new KeyboardEvent("keydown", {
        key: "v",
        code: "KeyV",
        keyCode: 86,
        which: 86,
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      return target.dispatchEvent(ev);
    } catch (e) {
      return false;
    }
  };

  BP.showUploadPreview = function (img, pixels, palette, opts) {
    return new Promise((resolve) => {
      const noOverprintRef = { checked: false };
      const fullPixels = pixels.slice();
      const currentCanvasMap = (opts && opts.currentCanvas) || null;
      const overlay = document.createElement("div");
      overlay.id = "basepaint-plugin-upload-preview";
      overlay.className = "basepaint-plugin-modal-overlay";

      const modal = document.createElement("div");
      modal.className = "basepaint-plugin-modal";

      const title = document.createElement("h3");
      title.className = "basepaint-plugin-modal-title";
      title.textContent = "Image Upload";
      modal.appendChild(title);

      const desc = document.createElement("p");
      desc.className = "basepaint-plugin-modal-desc";
      desc.textContent =
        "Pick a file. Pixels are matched to today's palette and applied as basepaint strokes.";
      modal.appendChild(desc);

      const previewBlock = document.createElement("div");
      previewBlock.className = "basepaint-plugin-modal-preview";

      const previewCanvas = document.createElement("canvas");
      previewCanvas.className = "basepaint-plugin-modal-preview-img";
      previewCanvas.width = BP.CANVAS_SIZE;
      previewCanvas.height = BP.CANVAS_SIZE;
      previewCanvas.style.width = "96px";
      previewCanvas.style.height = "96px";
      const pCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
      pCtx.imageSmoothingEnabled = false;

      const meta = document.createElement("div");
      meta.className = "basepaint-plugin-modal-preview-meta";

      const stats = document.createElement("div");
      stats.className = "basepaint-plugin-modal-stats";
      stats.textContent = "— pixels matched";

      const rangeStats = document.createElement("div");
      rangeStats.className = "basepaint-plugin-modal-stats";
      rangeStats.style.color = "var(--bp-text-3)";

      meta.appendChild(stats);
      meta.appendChild(rangeStats);
      previewBlock.appendChild(previewCanvas);
      previewBlock.appendChild(meta);
      modal.appendChild(previewBlock);

      const totalPixels = BP.CANVAS_SIZE * BP.CANVAS_SIZE;
      const matchRate = ((fullPixels.length / totalPixels) * 100).toFixed(1);

      function computeRange(pixList) {
        if (!pixList.length) return null;
        let minX = 256,
          minY = 256,
          maxX = -1,
          maxY = -1;
        for (const p of pixList) {
          const x = p.point.x,
            y = p.point.y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        return { minX, minY, maxX, maxY };
      }

      function renderPreview(pixList, keepExisting) {
        pCtx.fillStyle = "#0f1722";
        pCtx.fillRect(0, 0, BP.CANVAS_SIZE, BP.CANVAS_SIZE);
        for (const pixel of pixList) {
          const hex = palette[pixel.color];
          if (!hex) continue;
          pCtx.fillStyle = hex;
          pCtx.fillRect(pixel.point.x, pixel.point.y, 1, 1);
        }
        const r = computeRange(pixList);
        const rangeText = r
          ? `Range: x[${r.minX}–${r.maxX}] y[${r.minY}–${r.maxY}]`
          : "Range: —";
        if (keepExisting) {
          stats.innerHTML = `<b>${pixList.length}</b> pixels (no-overprint ON — kept ${currentCanvasMap ? currentCanvasMap.size : 0} existing)`;
        } else {
          stats.innerHTML = `<b>${pixList.length}</b> pixels matched · <span style="color: var(--bp-blue-light);">${matchRate}%</span> of canvas`;
        }
        rangeStats.textContent = rangeText;
      }
      renderPreview(fullPixels, false);

      const noOverprintRow = document.createElement("label");
      noOverprintRow.className = "basepaint-plugin-modal-checkbox-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.addEventListener("change", (e) => {
        noOverprintRef.checked = e.target.checked;
        if (e.target.checked && currentCanvasMap && currentCanvasMap.size > 0) {
          const filtered = fullPixels.filter(
            (p) =>
              currentCanvasMap.get(p.point.x + "," + p.point.y) !== p.color,
          );
          renderPreview(filtered, true);
        } else {
          renderPreview(fullPixels, false);
        }
      });
      const noOverprintLabel = document.createElement("span");
      noOverprintLabel.textContent =
        "No overprint — skip pixels that already match the canvas";
      noOverprintRow.appendChild(cb);
      noOverprintRow.appendChild(noOverprintLabel);
      modal.appendChild(noOverprintRow);

      const hint = document.createElement("p");
      hint.className = "basepaint-plugin-modal-hint";
      hint.textContent =
        'When "no overprint" is on, the preview shows only pixels that change.';
      modal.appendChild(hint);

      const actions = document.createElement("div");
      actions.className = "basepaint-plugin-modal-actions-row";

      const cancelBtn = document.createElement("button");
      cancelBtn.className =
        "basepaint-plugin-modal-btn basepaint-plugin-modal-btn--ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        overlay.remove();
        resolve({ confirm: false, noOverprint: false, finalPixels: [] });
      });
      actions.appendChild(cancelBtn);

      const confirmBtn = document.createElement("button");
      confirmBtn.className =
        "basepaint-plugin-modal-btn basepaint-plugin-modal-btn--primary";
      confirmBtn.textContent = "✓  Paste to canvas";
      confirmBtn.addEventListener("click", () => {
        const noOverprint = noOverprintRef.checked;
        const finalPixels =
          noOverprint && currentCanvasMap && currentCanvasMap.size > 0
            ? fullPixels.filter(
                (p) =>
                  currentCanvasMap.get(p.point.x + "," + p.point.y) !== p.color,
              )
            : fullPixels;
        overlay.remove();
        resolve({ confirm: true, noOverprint, finalPixels });
      });
      actions.appendChild(confirmBtn);

      modal.appendChild(actions);
      overlay.appendChild(modal);

      const onKey = (e) => {
        if (e.key === "Escape") {
          overlay.remove();
          document.removeEventListener("keydown", onKey);
          resolve({ confirm: false, noOverprint: false, finalPixels: [] });
        }
      };
      document.addEventListener("keydown", onKey);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.remove();
          document.removeEventListener("keydown", onKey);
          resolve({ confirm: false, noOverprint: false, finalPixels: [] });
        }
      });

      document.body.appendChild(overlay);
    });
  };

  BP.executeImageUpload = async function (canvas) {
    let palette;
    try {
      palette = BP.readPaletteFromDOM();
      if (!palette) {
        const theme = await BP.fetchTheme();
        palette = theme.palette;
      }
    } catch (e) {
      console.error("[basepaint-plugin] Failed to get palette:", e);
      return 0;
    }

    console.log(`[basepaint-plugin] Palette loaded: ${palette.length} colors`);

    const file = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif";
      input.style.display = "none";
      input.addEventListener("change", () => {
        resolve(input.files[0] || null);
        input.remove();
      });

      input.addEventListener("cancel", () => {
        resolve(null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });

    if (!file) return 0;

    console.log(`[basepaint-plugin] Processing ${file.name}...`);

    const img = await BP.loadImage(file);
    const currentCanvasMap = BP.readCanvasAsColorMap
      ? BP.readCanvasAsColorMap(canvas, palette)
      : null;

    const allPixels = await BP.processUploadedImage(file, palette);
    if (allPixels.length === 0) {
      console.warn("[basepaint-plugin] No pixels matched the palette");
      alert(
        "No pixels in this image match today's palette colors.\nMake sure your image uses the exact palette colors.",
      );
      return 0;
    }

    const confirmed = await BP.showUploadPreview(img, allPixels, palette, {
      currentCanvas: currentCanvasMap,
    });
    if (!confirmed.confirm) {
      console.log("[basepaint-plugin] Upload cancelled");
      return 0;
    }

    const pixels = confirmed.finalPixels;

    const rendered = BP.renderPixelsToCanvas(pixels, palette);
    console.log(
      `[basepaint-plugin] Rendered ${pixels.length} pixels to PNG canvas`,
    );

    let maxX = 0,
      maxY = 0,
      minX = 999,
      minY = 999;
    for (const s of pixels) {
      if (s.point.x > maxX) maxX = s.point.x;
      if (s.point.y > maxY) maxY = s.point.y;
      if (s.point.x < minX) minX = s.point.x;
      if (s.point.y < minY) minY = s.point.y;
    }
    console.log(
      `[basepaint-plugin] Stroke coord range: x[${minX}-${maxX}] y[${minY}-${maxY}] (should be 0-255)`,
    );

    const result = await BP.applyStrokesDirectly(pixels);
    console.log(`[basepaint-plugin] Apply strokes: ${JSON.stringify(result)}`);

    if (result.ok) {
      console.log(
        `[basepaint-plugin] ✅ ${pixels.length} strokes applied to basepaint canvas`,
      );
      return pixels.length;
    }

    writePixelsToCanvasDirect(canvas, pixels, palette);
    console.warn(
      `[basepaint-plugin] Auto-paste failed: ${result.reason}; image drawn as preview pixels only`,
    );
    return pixels.length;
  };

  console.log("[basepaint-plugin] Image upload tool loaded");
})();
