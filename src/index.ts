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

export interface PixelateOptions {
  /**
   * Number of pixel cells along each axis (e.g. 32 → 32×32 grid).
   * Any positive integer. Values larger than the image dimension are clamped.
   */
  resolution: number

  /**
   * Color sampling algorithm per cell.
   * - `'clean'`  — most-frequent color (sharp, graphic look) [default]
   * - `'detail'` — average color (smoother gradients, more texture)
   */
  mode?: 'clean' | 'detail'

  /**
   * Output dimensions.
   * - `'original'` — same size as input, cells filled with uniform color [default]
   * - `'resized'`  — output is `resolution × resolution` pixels
   */
  output?: 'original' | 'resized'
}

export interface PixelateResult {
  data: Uint8ClampedArray
  width: number
  height: number
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Pixelates an image synchronously.
 *
 * Works in both browser and Node.js (no DOM required).
 *
 * @example
 * ```ts
 * const result = pixelate(imageData, { resolution: 32 })
 * const result = pixelate(imageData, { resolution: 64, mode: 'detail', output: 'resized' })
 * ```
 */
export function pixelate(input: ImageLike, options: PixelateOptions): PixelateResult {
  const { data, width, height } = input
  const { mode = 'clean', output = 'original' } = options

  const resolution = Math.max(1, Math.min(Math.floor(options.resolution), width, height))

  const getColor = mode === 'clean' ? getFrequentColor : getAverageColor
  const cellW = width / resolution
  const cellH = height / resolution

  // Sample one color per cell
  const cellColors = new Uint8ClampedArray(resolution * resolution * 4)

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const x0 = Math.round(col * cellW)
      const y0 = Math.round(row * cellH)
      const x1 = Math.round((col + 1) * cellW)
      const y1 = Math.round((row + 1) * cellH)
      const [r, g, b, a] = getColor(data, width, x0, y0, x1, y1)
      const idx = (row * resolution + col) * 4
      cellColors[idx] = r
      cellColors[idx + 1] = g
      cellColors[idx + 2] = b
      cellColors[idx + 3] = a
    }
  }

  // Build output
  if (output === 'resized') {
    return { data: cellColors, width: resolution, height: resolution }
  }

  // output === 'original': paint each cell back at full size
  const out = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const idx = (row * resolution + col) * 4
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
