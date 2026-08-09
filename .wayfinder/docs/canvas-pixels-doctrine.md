# Canvas Pixels Doctrine

> The do's and don'ts of adding pixels to the basepaint canvas from the Chrome plugin. For the plugin team — read this before touching `src/content/tools/bucket.js`, `src/content/tools/upload.js`, `src/content/main.js`, or `src/content/canvas-utils.js`.

**Maintenance**: when a PR touches those files, the template asks: *"Does this change affect any pitfall in this doctrine? If yes, update the doctrine in the same PR."*

---

## Antipattern index — "what goes wrong"

The 12 failure modes, ordered by impact. Each links to the deep-dive in the matching task section.

| # | Failure | Where covered |
| --- | --- | --- |
| 1 | **The "white flash"** — canvas goes blank for one frame, then the painted state returns. Caused by `putImageData` with a fresh `ImageData` that has `alpha=0` for unfilled pixels. | [Writing pixels](#writing-pixels) |
| 2 | **"Pixels vanish on next render"** — fill is visible for seconds, then disappears. Caused by direct canvas writes that don't tell basepaint's state. | [Syncing state with basepaint](#syncing-state-with-basepaint) |
| 3 | **"Bucket only fills 1 pixel"** — clicking a region of one color fills only the start pixel. Caused by passing `opts.mode = 'magic'` from the bucket UI by mistake. | — |
| 4 | **"Cursor doesn't match the bucket icon"** — after the toolbar re-renders, the cursor is the basepaint default arrow. Caused by setting `canvas.style.cursor` inline (basepaint's re-render resets inline styles). | [Cursor: persistent styling](#cursor-persistent-styling) |
| 5 | **"Bucket lag" — 200ms+ freeze per fill** — clicking the bucket tool blocks the main thread. Caused by clicking basepaint's React buttons (Draw, Hide Grid) which trigger full re-renders. | [Syncing state with basepaint](#syncing-state-with-basepaint) |
| 6 | **"Tool deactivates when canvas is clicked"** — after a successful fill, the bucket button is no longer highlighted. Caused by the fill path clicking Paste Strokes, which triggers `installNativeToolWatcher`. | [Syncing state with basepaint](#syncing-state-with-basepaint) |
| 7 | **"No canvas found"** — bucket returns 0 pixels. Caused by `state.canvas` captured at init before the overlay canvas was mounted. | [Reading pixels](#reading-pixels) |
| 8 | **"Wrong canvas read"** — bucket fills the wrong color or fills the entire canvas. Caused by reading the overlay canvas (transparent in normal use) instead of the main canvas. | [Reading pixels](#reading-pixels) |
| 9 | **"Fill color off by one"** — 1-pixel-thick border of the wrong color around the filled region. Caused by rounding mismatch with basepaint's `Math.floor` write path. | [Writing pixels](#writing-pixels) |
| 10 | **"Permission denied on clipboard.writeText"** — `navigator.clipboard.writeText` throws. Happens in agent-browser or any non-user-gesture context. | [Syncing state with basepaint](#syncing-state-with-basepaint) |
| 11 | **"Grid lines counted as user strokes"** — bucket or upload includes the gray grid lines. Caused by the grid being painted INTO the canvas pixels, not a CSS overlay. | [Reading pixels](#reading-pixels) |
| 12 | **"Pixels dragged behind cursor"** — picker preview flickers when the cursor moves over the canvas. Caused by running the pixel read on every `mousemove` event instead of rAF-coalescing. | [Performance](#performance) |

---

## Reading pixels

**Don't** read from `state.canvas` captured at init time. The captured canvas is whichever was largest at init — but the overlay can be the largest in some states, or basepaint can re-mount the canvas. Cached references go stale. The current `diffStrokesAgainstApi` re-finds the canvas on every call (`src/content/tools/download.js:60-63`).

**Don't** read the overlay canvas. The overlay (`canvas.overlay-canvas`) is transparent everywhere in normal use. If you read it, you'll get empty data.

**Do** read the main canvas:
```js
const mainCanvas = [...document.querySelectorAll('canvas')]
  .find((c) => !c.classList.contains('overlay-canvas'));
```

**Do** use a proxy canvas with `willReadFrequently: true` to silence Chrome's perf warning. Direct reads on basepaint's own context can't be controlled (browsers ignore the flag on a context that already exists). The current `BP.readCanvasPixels` (`src/content/canvas-utils.js:79-86`):
```js
BP.readCanvasPixels = function (canvas) {
  const proxy = document.createElement('canvas');
  proxy.width = canvas.width;
  proxy.height = canvas.height;
  const ctx = proxy.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
};
```

**Do** use `?day=painting&scale=1` for the on-chain baseline. Never `?day=${currentDay}` — that returns the finalized (post-save) canvas from yesterday if today is still "painting".

**Do** sample logical pixels with `Math.floor(lx * scale)` and clamp with `Math.min(width-1, …)`. Match basepaint's own write path exactly — anything else produces a 1-pixel-wide artifact at the edge of every fill. Current code at `src/content/tools/download.js:106-107` and `src/content/tools/bucket.js:55-56`.

**Do** treat `alpha < 16` as transparent. basepaint's own code uses the same threshold.

**Do** hide the grid before reading — the grid is painted into the canvas pixels, not a CSS overlay. Current code at `src/content/tools/download.js:68-75`:
```js
const gridBtn = [...document.querySelectorAll('button')]
  .find((b) => b.title === 'Hide Grid' || b.title === 'Show Grid');
if (gridBtn && gridBtn.title === 'Hide Grid' /* not Show Grid */) {
  gridBtn.click();
  await new Promise((r) => setTimeout(r, 250));
}
```

---

## Writing pixels

**Don't** create a fresh `ImageData` and call `ctx.putImageData(imgData, 0, 0)` on the live canvas. A fresh buffer has `alpha = 0` for every pixel you didn't set, so the rest of the canvas goes transparent → white flash.

**Do** use `getImageData` → modify → `putImageData` for atomic large writes:
```js
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
// ... modify img.data[off], data[off+1], data[off+2], data[off+3] for each target pixel
ctx.putImageData(img, 0, 0);
```

**Do** use `fillRect` per pixel for small fills (< 100 px), batching same-color pixels to avoid repeated `fillStyle` assignment. Current code at `src/content/tools/bucket.js:26-40`:
```js
function writePixelsToCanvasDirect(canvas, pixels, palette) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
```

**Do** match basepaint's `Math.floor` rounding for the fillRect origin. `fillRect(lx*scale, ly*scale, scale, scale)` — to the right and down.

**Don't** introduce a "safety margin" of `fillRect(lx*scale-1, …, scale+1, …)` — that double-draws the seam and is wasted.

**Don't** read `button.style.background` and try to parse it yourself — use `BP.readActiveColorFromDOM()` (`src/content/canvas-utils.js:262-301`). It handles all three formats (`rgb(255, 0, 0)`, `rgb(255 0 0)`, `#ff0000`).

---

## Syncing state with basepaint

Direct canvas writes are visual only. basepaint's React state is unchanged, so the next state-driven render overwrites the canvas. Always pair a canvas write with a state-sync call.

**Do** follow the channel ordering: React fiber `onPaste` → Paste button click → log failure.

```js
async function applyStrokesDirectly(strokes) {
  const strokesJson = JSON.stringify(strokes);
  let clipboardWritten = false;
  try {
    await navigator.clipboard.writeText(strokesJson);
    clipboardWritten = true;
  } catch (e) { /* clipboard denied — fall through */ }
  if (clipboardWritten) await new Promise((r) => setTimeout(r, 50));

  // 1. React fiber onPaste (fastest, works in agent-browser, no clipboard needed)
  const F = BP.findBasePaintComponent();
  if (F?.memoizedProps?.onPaste) {
    try {
      document.querySelector('canvas')?.focus();
      await F.memoizedProps.onPaste();
      return { ok: true, source: 'react-fiber' };
    } catch (e) { /* fall through */ }
  }

  // 2. Click the Paste button (10x retry, with delay)
  const findPasteBtn = () =>
    document.querySelector('#toolbar button[title*="Paste Strokes"]') ||
    document.querySelector('#toolBar button[title*="Paste Strokes"]');
  let pasteBtn = findPasteBtn();
  if (!pasteBtn && clipboardWritten) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100));
      pasteBtn = findPasteBtn();
      if (pasteBtn) break;
    }
  }
  if (pasteBtn) {
    try {
      pasteBtn.click();
      return { ok: true, source: 'paste-button-click' };
    } catch (e) { /* fall through */ }
  }

  // 3. Both failed — log clearly so the user knows the fill is visual-only
  return { ok: false, reason: clipboardWritten ? 'No way to trigger paste' : 'Clipboard write blocked' };
}
```

Source: `src/content/tools/upload.js:135-193`.

**Don't** click basepaint's React buttons (Draw, Hide Grid) from the plugin — each click triggers a 200ms+ full re-render. Either do the work via the React fiber directly (`F.memoizedProps.onColorChange` etc.) or skip the activation entirely. The current plugin has removed `activateNativeDrawMode()` and `toggleGridForTool()` from bucket activation for this reason.

**Do** set `suppressNativeWatch = true` before triggering any basepaint button click. The `installNativeToolWatcher` (`src/content/main.js`) watches for toolbar clicks and deactivates the plugin tool. Without suppression, your own state sync click deactivates the bucket right after the fill. Current code wraps the click:
```js
suppressNativeWatch = true;
try { pasteBtn.click(); }
finally { setTimeout(() => { suppressNativeWatch = false; }, 200); }
```

**Don't** require a connected wallet for state sync. Pasting just adds to local state; save is a separate user action.

---

## Cursor: persistent styling

**Don't** set `canvas.style.cursor = '…'` (inline). basepaint's React re-render replaces inline styles, the cursor reverts to the default arrow.

**Do** use a CSS class with `!important`. `src/content/styles.css`:
```css
.basepaint-plugin-cursor-bucket,
.basepaint-plugin-cursor-bucket:hover,
.basepaint-plugin-cursor-bucket:focus,
.basepaint-plugin-cursor-bucket:active {
  cursor: url("data:image/svg+xml;…bucket SVG…") 4 16, none !important;
}
```

Toggle the class on the canvas in `updateCursor()` (`src/content/main.js:203-216`) when the tool activates. The `!important` beats basepaint's inline-style resets.

---

## Performance

**Do** use `requestAnimationFrame` to coalesce `mousemove` events to one update per frame. The current picker preview (`src/content/main.js:247-280`) uses this pattern. Without it, a fast-moving cursor fires 100+ events per second, each reading pixels and writing the DOM.

**Do** cache `ImageData` for ~200ms when reading the canvas repeatedly. The cache key is the time-of-last-read. Current code:
```js
let cachedImageData = null;
let cacheTime = 0;
const CACHE_TTL = 200;
if (!cachedImageData || now - cacheTime > CACHE_TTL) {
  cachedImageData = BP.readCanvasPixels(canvas);
  cacheTime = now;
}
```

**Don't** cache forever. basepaint re-renders the canvas frequently. A cache older than ~200ms might be reading a stale canvas.

**Do** batch same-color pixels to avoid repeated `fillStyle` assignment. See the `lastHex` cache in `writePixelsToCanvasDirect` above.

**Don't** try to parallelize canvas reads with `Promise.all` or workers — the canvas read is synchronous, and the compare is fast enough.

**Don't** use `DataView` with `getUint32(idx, true)` for "faster" 4-byte reads. Modern V8 optimizes index-based access to equivalent code; `DataView` adds indirection.

**Don't** leave the diagnostic probe on. `src/content/main.js:680-707` wraps `getImageData` and `drawImage` to log every call. It only runs when `window.__BP_DEBUG__` is true — keep it that way; the console spam makes the dev console unusable.

---

## Quick checklist for canvas PRs

Before opening a PR that touches `src/content/tools/{bucket,upload}.js`, `src/content/main.js`, or `src/content/canvas-utils.js`:

1. **Reads**: are you using `BP.readCanvasPixels(canvas)` (proxy, `willReadFrequently: true`) on the **main** canvas (not the overlay), with grid hidden? Are you sampling with `Math.floor(lx * scale)` and clamping?
2. **Writes**: are you using either `fillRect` per pixel (small fills) or `getImageData` → modify → `putImageData` (large fills)? Are you using `fillStyle` batching? Are you matching basepaint's `Math.floor` rounding?
3. **State sync**: does the canvas write happen alongside `BP.applyStrokesDirectly()` (React fiber onPaste → Paste button click → log failure)? Is `suppressNativeWatch = true` set during the state sync?
4. **Grid**: if reading, is the grid hidden first? If writing, doesn't matter (your write is the new state, regardless of grid).
5. **Cursor**: if the change affects which tool's cursor is shown, is the cursor class added (not inline style) with `!important`?
6. **Performance**: is the change throttled with rAF for per-frame work? Is `ImageData` cached for repeated reads?
7. **Pitfall map**: does this change affect any of the 12 failure modes in the antipattern index? If yes, update the index.

If any answer is "no", fix it before opening the PR.
