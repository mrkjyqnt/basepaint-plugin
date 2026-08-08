(function () {
  "use strict";

  const BP = (window.__BP_PLUGIN__ = window.__BP_PLUGIN__ || {});

  BP.readPaletteFromSwatches = function () {
    const tb = document.getElementById("toolbar");
    if (!tb) return [];
    const grids = tb.querySelectorAll(".grid.grid-cols-2");
    if (!grids.length) return [];
    const palette = [];
    for (const btn of grids[0].querySelectorAll("button")) {
      const hex = BP.colorFromStyle(btn);
      if (hex) palette.push(hex);
    }
    return palette;
  };

  BP.executeColorPick = function (canvas, logicalX, logicalY, palette) {
    const imageData = BP.readCanvasPixels(canvas);
    const bitmap = BP.logicalToBitmap(canvas, logicalX, logicalY);
    const pixel = BP.getPixelAt(imageData, bitmap.x, bitmap.y, canvas.width);

    if (pixel.a < 16) {
      console.log("[basepaint-plugin] Picked transparent pixel — no color");
      return null;
    }

    const raw = `#${((1 << 24) | (pixel.r << 16) | (pixel.g << 8) | pixel.b).toString(16).slice(1)}`;
    console.log(
      `[basepaint-plugin] Picked raw: ${raw} (a=${pixel.a}) at logical (${logicalX}, ${logicalY})`,
    );

    const swatchPalette =
      palette && palette.length ? palette : BP.readPaletteFromSwatches();
    if (!swatchPalette.length) {
      warn("No palette available — cannot change active color");
      return raw;
    }

    const lookup = BP.buildPaletteLookup(swatchPalette);
    const nearestIdx = BP.getNearestColorIndex(
      pixel.r,
      pixel.g,
      pixel.b,
      lookup,
    );
    const target = swatchPalette[nearestIdx];
    console.log(
      `[basepaint-plugin] Picked color ${raw} → nearest palette color ${target} (idx ${nearestIdx})`,
    );

    const swatchClicked = BP.clickPaletteSwatch(target);
    if (swatchClicked) {
      console.log(`[basepaint-plugin] ✅ Clicked swatch ${target}`);
    } else {
      warn("Could not find/click palette swatch");
    }

    if (typeof BP.findBasePaintComponent === "function") {
      const F = BP.findBasePaintComponent();
      if (F) {
        if (typeof F.memoizedProps?.onColorChange === "function") {
          try {
            F.memoizedProps.onColorChange(target);
          } catch (e) {
            warn("onColorChange failed: " + e.message);
          }
        }
        if (
          F.memoizedProps?.drawMode === false &&
          typeof F.memoizedProps.onToggleDrawMode === "function"
        ) {
          try {
            F.memoizedProps.onToggleDrawMode();
            console.log("[basepaint-plugin] Switched to draw mode");
          } catch (e) {
            warn("onToggleDrawMode failed: " + e.message);
          }
        }
        if (
          F.memoizedProps?.eraseMode === true &&
          typeof F.memoizedProps.onToggleErase === "function"
        ) {
          try {
            F.memoizedProps.onToggleErase();
            console.log("[basepaint-plugin] Switched off erase mode");
          } catch (e) {
            warn("onToggleErase failed: " + e.message);
          }
        }
      }
    }

    return target;
  };

  BP.clickPaletteSwatch = function (hex) {
    const target = BP.normalizeColor(hex);
    if (!target) return false;

    const sources = [];
    const desktop = document.getElementById("toolbar");
    const mobile = document.getElementById("toolBar");
    if (desktop) sources.push(...desktop.querySelectorAll("button"));
    if (mobile) sources.push(...mobile.querySelectorAll("button"));

    for (const btn of sources) {
      const swatchHex = BP.colorFromStyle(btn);
      if (!swatchHex) continue;
      if (BP.normalizeColor(swatchHex) !== target) continue;
      const rect = btn.getBoundingClientRect();
      if (rect.width < 10 || rect.width > 80) continue;
      if (rect.height < 10 || rect.height > 80) continue;
      btn.click();
      return true;
    }
    return false;
  };

  console.log("[basepaint-plugin] Color picker tool loaded");
})();
