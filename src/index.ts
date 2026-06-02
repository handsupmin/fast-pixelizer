import { getAverageColor, getFrequentColor } from './algorithms'

export { snap } from './snap'
export type { SnapOptions, SnapResult } from './snap'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Any object with `data`, `width`, `height` — compatible with the browser's
 * built-in `ImageData` as well as node-canvas and raw buffers.
 */
export interface ImageLike {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface ImageDimensions {
  width: number
  height: number
}

export interface PixelateGridResolution {
  cols: number
  rows: number
}

export type PixelateResolution = number | PixelateGridResolution

export interface PixelateOptions {
  /**
   * Pixel grid size.
   * - `32` keeps the legacy square-grid behavior (32×32)
   * - `{ cols: 80, rows: 32 }` uses a rectangular grid
   *
   * Values larger than the image dimension are clamped automatically.
   */
  resolution: PixelateResolution

  /**
   * Color sampling algorithm per cell.
   * - `'clean'`  — most-frequent color (sharp, graphic look) [default]
   * - `'detail'` — average color (smoother gradients, more texture)
   */
  mode?: 'clean' | 'detail'

  /**
   * Output dimensions.
   * - `'original'` — same size as input, cells filled with uniform color [default]
   * - `'resized'`  — output is grid-sized (`cols × rows`) pixels
   */
  output?: 'original' | 'resized'
}

export interface PixelateResult {
  data: Uint8ClampedArray
  width: number
  height: number
}

// ─── Core ────────────────────────────────────────────────────────────────────

function sanitizeResolution(value: number, limit: number): number {
  return Math.max(1, Math.min(Math.floor(value), limit))
}

function resolveGridSize(width: number, height: number, resolution: PixelateResolution) {
  if (typeof resolution === 'number') {
    const size = sanitizeResolution(resolution, Math.min(width, height))
    return { cols: size, rows: size }
  }

  return {
    cols: sanitizeResolution(resolution.cols, width),
    rows: sanitizeResolution(resolution.rows, height),
  }
}

/**
 * Converts a single scalar resolution into an aspect-preserving rectangular grid.
 *
 * The scalar is applied to the shorter axis, and the longer axis is scaled to
 * keep square pixel cells for non-square images.
 */
export function fitResolutionToAspect(
  input: ImageDimensions,
  resolution: number,
): PixelateGridResolution {
  const width = Math.max(1, Math.floor(input.width))
  const height = Math.max(1, Math.floor(input.height))
  const base = sanitizeResolution(resolution, Math.min(width, height))

  if (width >= height) {
    return {
      cols: sanitizeResolution(Math.round(base * (width / height)), width),
      rows: base,
    }
  }

  return {
    cols: base,
    rows: sanitizeResolution(Math.round(base * (height / width)), height),
  }
}

/**
 * Pixelates an image synchronously.
 *
 * Works in both browser and Node.js (no DOM required).
 *
 * @example
 * ```ts
 * const result = pixelate(imageData, { resolution: 32 })
 * const grid = fitResolutionToAspect(imageData, 64)
 * const result = pixelate(imageData, { resolution: grid, output: 'resized' })
 * const result = pixelate(imageData, { resolution: 64, mode: 'detail', output: 'resized' })
 * ```
 */
export function pixelate(input: ImageLike, options: PixelateOptions): PixelateResult {
  const { data, width, height } = input
  const { mode = 'clean', output = 'original' } = options

  const { cols, rows } = resolveGridSize(width, height, options.resolution)

  const getColor = mode === 'clean' ? getFrequentColor : getAverageColor
  const cellW = width / cols
  const cellH = height / rows

  // Sample one color per cell
  const cellColors = new Uint8ClampedArray(cols * rows * 4)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = Math.round(col * cellW)
      const y0 = Math.round(row * cellH)
      const x1 = Math.round((col + 1) * cellW)
      const y1 = Math.round((row + 1) * cellH)
      const [r, g, b, a] = getColor(data, width, x0, y0, x1, y1)
      const idx = (row * cols + col) * 4
      cellColors[idx] = r
      cellColors[idx + 1] = g
      cellColors[idx + 2] = b
      cellColors[idx + 3] = a
    }
  }

  // Build output
  if (output === 'resized') {
    return { data: cellColors, width: cols, height: rows }
  }

  // output === 'original': paint each cell back at full size
  const out = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 4
      const r = cellColors[idx]
      const g = cellColors[idx + 1]
      const b = cellColors[idx + 2]
      const a = cellColors[idx + 3]

      const x0 = Math.round(col * cellW)
      const y0 = Math.round(row * cellH)
      const x1 = Math.round((col + 1) * cellW)
      const y1 = Math.round((row + 1) * cellH)

      for (let py = y0; py < y1; py++) {
        const rowBase = py * width * 4
        for (let px = x0; px < x1; px++) {
          const i = rowBase + px * 4
          out[i] = r
          out[i + 1] = g
          out[i + 2] = b
          out[i + 3] = a
        }
      }
    }
  }

  return { data: out, width, height }
}
