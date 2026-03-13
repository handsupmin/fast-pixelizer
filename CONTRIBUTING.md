# Contributing to fast-pixelizer

Thank you for your interest in contributing! This is an open-source project and contributions of all kinds are welcome — bug reports, feature suggestions, documentation improvements, and code.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/handsupmin/fast-pixelizer.git
cd fast-pixelizer
npm install
```

### Development

```bash
npm run dev      # watch mode — rebuilds on file changes
npm run build    # one-off production build
npm run lint     # ESLint check
npm run lint:fix # ESLint auto-fix
npm run format   # Prettier format
```

### Regenerate example images

```bash
npm run build
node scripts/generate-examples.mjs
```

---

## Project Structure

```
src/
├── index.ts        # Public API: pixelate(), types
└── algorithms.ts   # getFrequentColor, getAverageColor
scripts/
└── generate-examples.mjs   # Generates docs/example-*.png
docs/
└── *.png           # README example images
```

The library is intentionally small. `src/index.ts` contains the orchestration (cell boundary math, output assembly) and `src/algorithms.ts` contains the two color-sampling algorithms.

---

## How to Contribute

### Reporting bugs

Open an issue with:

- A minimal reproduction (image + options that trigger the bug)
- Expected vs actual output
- Environment (browser/Node.js, version)

### Suggesting features

Open an issue before writing code — it helps to align on scope and API design first.

### Submitting a pull request

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `npm run lint:fix && npm run format && npm run build` — all must pass
4. Commit using a descriptive message
5. Open a PR with a clear description of what changed and why

---

## Algorithm Notes

Understanding these two points will help you navigate the code:

**Cell boundary math**

Cell boundaries use `Math.round(col * cellW)` rather than integer division or float truncation. This ensures adjacent cells share no gaps and no overlapping pixels, even when `width` is not divisible by `resolution`.

**`clean` mode frequency table**

Instead of a `Map<string, count>`, color frequencies are tracked in a pre-allocated `Uint16Array(32768)`. Each color is quantized to 5 bits per channel (`value >> 3`) and packed into a 15-bit integer key. Only visited buckets are reset between cells, so initialization cost is O(pixels in cell), not O(32768).

**Transparency**

If more than 50% of pixels in a cell have `alpha < 128`, the entire cell is treated as transparent (RGBA `[0,0,0,0]`). Only opaque pixels contribute to color averaging/frequency in `detail`/`clean` modes.

---

## Coding Style

- TypeScript strict mode — no `any`, no non-null assertions (`!`) without a comment
- No runtime dependencies — keep the bundle tiny
- No DOM globals (`document`, `window`, `ImageData`) in the implementation — accept `ImageLike` instead so the library works in Node.js
- Prefer readability over cleverness, except in the hot inner loops where performance comments are expected

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
