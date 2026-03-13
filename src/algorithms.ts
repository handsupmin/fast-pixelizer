/**
 * Pre-allocated frequency table for frequent-color sampling.
 * 5 bits per channel (>> 3) → 32^3 = 32,768 buckets.
 * Safe because JS is single-threaded per context.
 */
const _freq = new Uint16Array(32768)
const _touched: number[] = []

/**
 * Returns the most-frequent quantized color in the cell.
 * Uses a typed-array bucket table instead of Map for speed.
 */
export function getFrequentColor(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] {
  // Reset only buckets touched in the previous call
  for (let i = 0; i < _touched.length; i++) _freq[_touched[i]] = 0
  _touched.length = 0

  let maxCount = 0
  let bestKey = 0
  let transparentCount = 0
  let totalPixels = 0

  for (let py = y0; py < y1; py++) {
    const row = py * width * 4
    for (let px = x0; px < x1; px++) {
      const i = row + px * 4
      const a = data[i + 3]
      totalPixels++
      if (a < 128) {
        transparentCount++
        continue
      }
      // Pack 5-bit quantized channels into a single 15-bit key
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
      if (_freq[key] === 0) _touched.push(key)
      const c = ++_freq[key]
      if (c > maxCount) {
        maxCount = c
        bestKey = key
      }
    }
  }

  if (totalPixels === 0 || transparentCount * 2 > totalPixels) return [0, 0, 0, 0]

  // Decode key back to RGB (multiply by 8 to restore approximate original range)
  return [((bestKey >> 10) & 31) << 3, ((bestKey >> 5) & 31) << 3, (bestKey & 31) << 3, 255]
}

/**
 * Returns the average color of visible (non-transparent) pixels in the cell.
 */
export function getAverageColor(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] {
  let rSum = 0,
    gSum = 0,
    bSum = 0,
    aSum = 0
  let transparentCount = 0
  let totalPixels = 0

  for (let py = y0; py < y1; py++) {
    const row = py * width * 4
    for (let px = x0; px < x1; px++) {
      const i = row + px * 4
      const a = data[i + 3]
      totalPixels++
      aSum += a
      if (a < 128) {
        transparentCount++
        continue
      }
      rSum += data[i]
      gSum += data[i + 1]
      bSum += data[i + 2]
    }
  }

  if (totalPixels === 0 || transparentCount * 2 > totalPixels) return [0, 0, 0, 0]

  const visible = totalPixels - transparentCount
  // (x + 0.5) | 0  ≡  Math.round(x) for non-negative values — avoids function call overhead
  return [
    visible > 0 ? (rSum / visible + 0.5) | 0 : 0,
    visible > 0 ? (gSum / visible + 0.5) | 0 : 0,
    visible > 0 ? (bSum / visible + 0.5) | 0 : 0,
    (aSum / totalPixels + 0.5) | 0,
  ]
}
