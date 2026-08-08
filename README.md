# BasePaint Plugin

A Chrome extension that adds missing drawing tools to [BasePaint](https://basepaint.xyz/paint) — the collaborative daily pixel art canvas on Base L2.

Built for the [BasePaint Hackathon 2026](https://basepaint.xyz/hack) (Aug 1–8).

## Tools

| Tool | What it does |
| --- | --- |
| 🪣 **Bucket Fill** | Exact-color flood fill (8-way). Click a region, fill with the active palette color. |
| 📤 **Image Upload** | Drop an image or pick a file. Pixels are matched to today's palette, previewed, then pasted as strokes. Optional *no-overprint* mode skips pixels that already match the canvas. |
| 🎨 **Color Picker** | Click any pixel on the canvas — the closest palette color becomes your active color. |
| 🪞 **Mirror** | Toggle symmetric drawing across the canvas axis. Hold to draw in multiple quadrants at once. |
| ⬇ **Stroke Download** | Save your strokes as a single text file, or split into N-pixel chunks (paste one at a time, works around the per-stroke pixel cap). PNG export of just your strokes too. |
| ℹ️ **About Modal** | Auto-shown once when you first visit `/paint`. Hackathon credits, feedback via X, *don't show again* remembered locally. |

## Installation (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `basepaint-plugin` folder
6. Navigate to [basepaint.xyz/paint](https://basepaint.xyz/paint) — the plugin tools appear next to basepaint's native toolbar

Not on the Chrome Web Store yet — load it unpacked while we finish the submission.

## How It Works

The extension injects a content script that:

1. **Waits** for BasePaint's Next.js SPA to hydrate
2. **Discovers** the toolbar using structural DOM patterns (not fragile class names)
3. **Injects** tool buttons directly into the existing toolbar
4. **Reads** your strokes via basepaint's native Copy button — never from the on-chain canvas
5. **Writes** strokes back via basepaint's native Paste Strokes button — same path the upload flow uses

The extension does **not** handle wallet/blockchain transactions — it modifies the canvas locally, and you use BasePaint's native Save button to submit your strokes on-chain.

## Architecture

```
basepaint-plugin/
├── manifest.json                # Chrome MV3 manifest (icons + content scripts)
├── src/
│   └── content/
│       ├── config.js            # Runtime config (HACK_URL, SHARE_URL, VERSION)
│       ├── styles.css           # Toolbar styles + basepaint font-face declarations
│       ├── canvas-utils.js      # Read canvas pixels, build palette lookup, export PNG
│       ├── main.js              # Content script entry, modals, toolbar injection
│       └── tools/
│           ├── bucket.js        # Flood fill (BFS, exact pixel match)
│           ├── upload.js        # Image → palette match → strokes
│           ├── picker.js        # Click canvas → nearest palette color
│           ├── mirror.js        # Symmetric drawing
│           └── (download uses native Copy + our text export)
├── icons/                       # Extension icons (16/32/48/128)
├── docs/                        # GitHub Pages landing page (index.html + assets/)
├── dist/                        # Built copy of src/ for the unpacked load
├── .agents/                     # Agent skills (planning + triage)
└── README.md
```

### Stack

- **Vanilla JS** (ES2017+) — no build step, no bundler, no framework
- **Basepaint brand tokens** — `--bp-bg: #1E2735`, `--bp-blue: #0042e0`, etc.
- **Basepaint fonts** — Viga / Roboto Mono / MEK Sans / MEK Mono, loaded from the host page's CDN
- **Permissions**: none (content script only)

## Landing Page

Marketing + install instructions live in [`docs/`](./docs/), served via GitHub Pages:

```
Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: /docs
```

## References

This plugin builds on two pieces of work that came before it:

- **[CopyStroke by Afuro](https://x.com/)** — the clipboard-paste pattern that makes bucket & upload possible
- **[Baseprite by Creamy](https://github.com/uwucreamy/Baseprite)** — reference for plugin UX & canvas-tool conventions

## License

CC0 — paint whatever you want. Public domain.