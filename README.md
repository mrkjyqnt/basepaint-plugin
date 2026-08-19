<div align="center">

<img src="icons/icon-128.png" alt="BasePaint Plugin" width="96" height="96" />

# BasePaint Plugin

### Tools that should've been there from day one.

A Chrome extension that adds missing drawing tools to [BasePaint](https://basepaint.xyz/paint) — the collaborative daily pixel-art canvas on Base L2.

[![Hackathon Winner](https://img.shields.io/badge/🏆_BasePaint_Hackathon_2026-Winner_for_Artists-fde047?style=for-the-badge&labelColor=0042e0&color=fde047)](https://x.com/basepaint_xyz/status/2089728698866184299)
[![License: CC0](https://img.shields.io/badge/License-CC0-0042e0?style=for-the-badge&labelColor=0042e0)](https://creativecommons.org/publicdomain/zero/1.0/)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-0042e0?style=for-the-badge&labelColor=0042e0)](https://developer.chrome.com/docs/extensions/reference/manifest/manifest-v3)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-fde047?style=for-the-badge&labelColor=0042e0)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

</div>

---

## 🏆 Winner — "For Artists" category at BasePaint Hackathon 2026

BasePaint Plugin took first place in the **"For Artists"** category at the [BasePaint Hackathon 2026](https://basepaint.xyz/hack) — out of every project built for artists making pixel art on the daily canvas.

📣 **[Announcement on X (basepaint_xyz)](https://x.com/basepaint_xyz/status/2089728698866184299)**

> Four tools that ship with v0.1.0: Bucket Fill, Image Upload, Color Picker, Stroke Download. Built for the workflow artists actually want — fast palette matching, no-overprint upload, exact-color flood fill, and a stroke downloader that doesn't fight the per-stroke pixel cap.

</div>

---

## ✨ Features

<div align="center">

| 🪣 | 📤 | 🎨 | ⬇ |
|:---:|:---:|:---:|:---:|
| **Bucket Fill** | **Image Upload** | **Color Picker** | **Stroke Download** |
| Exact-color flood fill (8-way) | Drop an image, get palette-matched strokes | Click any pixel — picks the nearest palette color | Export your strokes as PNG or paste-ready text |
| Hotkey `B` | Optional _no-overprint_ mode | Hotkey `I` | Split into N-pixel chunks |

</div>

All four tools respect basepaint's native toolbar, use its font tokens (Viga / MEK Sans / Roboto Mono) and brand colors (`#0042e0`, `#fde047`), and write back to its React state via the same clipboard-paste path the toolbox uses.

---

## 🚀 Quick start

### 1. Download

Grab the latest release: **[`basepaint-plugin-v0.1.0.zip`](https://github.com/mrkjyqnt/basepaint-plugin/releases/latest)**

### 2. Install (Developer Mode)

```bash
# 1. Unzip the downloaded file
# 2. Open chrome://extensions
# 3. Toggle "Developer mode" on (top-right)
# 4. Click "Load unpacked" → pick the unzipped folder
# 5. Visit https://basepaint.xyz/paint
# 6. Five new tool buttons appear next to basepaint's native toolbar
```

### 3. Verify

You should see four new tool buttons injected into basepaint's toolbar above the Delete/Save row. Click **B** for Bucket Fill, **I** for Color Picker, or use the buttons directly.

---

## 🧠 How it works

The extension is a single content script that lives inside `basepaint.xyz`:

1. **Waits** for BasePaint's Next.js SPA to hydrate (`MutationObserver`)
2. **Discovers** the toolbar using structural DOM patterns (not fragile class names)
3. **Injects** tool buttons directly into the existing toolbar
4. **Reads** the canvas via a `willReadFrequently: true` proxy — no Chrome perf warnings
5. **Writes** strokes back via basepaint's native Copy → Paste path (or React fiber `onPaste`)

The extension does **not** handle wallet/blockchain transactions — it modifies the canvas locally, and you use BasePaint's native Save button to submit your strokes on-chain.

---

## 🛠 Stack

| Layer | Tech |
|---|---|
| Language | Vanilla JS (ES2017+) — no build step, no bundler, no framework |
| Manifest | Chrome MV3 |
| Permissions | None (content script only) |
| Fonts | basepaint's own — Viga / MEK Sans / MEK Mono / Roboto Mono |
| Colors | basepaint's own — `#0042e0` / `#fde047` / `#1E2735` |
| Canvas API | `getContext('2d', { willReadFrequently: true })` proxy reads, `putImageData` for atomic writes |

---

## 📁 Architecture

```
basepaint-plugin/
├── manifest.json                # Chrome MV3 manifest (icons + content scripts)
├── src/
│   └── content/
│       ├── config.js            # Runtime config (HACK_URL, SHARE_URL, VERSION)
│       ├── styles.css           # Toolbar styles + basepaint font-face declarations
│       ├── canvas-utils.js      # Read canvas pixels, palette lookup, export PNG
│       ├── main.js              # Content script entry, modals, toolbar injection
│       └── tools/
│           ├── bucket.js        # Flood fill (BFS, exact pixel match)
│           ├── upload.js        # Image → palette match → strokes
│           ├── picker.js        # Click canvas → nearest palette color
│           ├── download.js      # Stroke download (PNG + paste-ready text)
│           └── (mirror.js removed in v0.1.0)
├── icons/                       # Extension icons (16/32/48/128)
├── docs/                        # GitHub Pages landing page (index.html + assets/)
├── dist/                        # Built copy of src/ for the unpacked load
├── .scratch/                    # Wayfinder maps (local-only, planning artifacts)
└── README.md
```

---

## 🌐 Landing page

Marketing + install instructions live in [`docs/`](./docs/), served via GitHub Pages:

🌐 **<https://mrkjyqnt.github.io/basepaint-plugin/>**

```
Settings → Pages → Source: Deploy from a branch → Branch: main → Folder: /docs
```

---

## 🙏 References

This plugin builds on two pieces of work that came before it:

- **[CopyStroke by Afuro](https://copystroke.vercel.app/)** — the clipboard-paste pattern that makes bucket & upload possible
- **[Baseprite by Creamy](https://www.tinypixelpepe.com/baseprite/)** — plugin UX & canvas-tool reference

And of course [BasePaint](https://basepaint.xyz) itself — the daily pixel-art canvas this plugin extends.

---

## 📄 License

[CC0](https://creativecommons.org/publicdomain/zero/1.0/) — paint whatever you want. Public domain.
