// ─── Snap mode: detect existing pixel grid & re-snap to clean uniform cells ──

// Seeded PRNG (mulberry32) — deterministic results on same image
function makePrng(seed: number) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// K-means++ quantization: spreads initial centroids far apart for better palette
function kmeansQuantize(
  data: Uint8ClampedArray,
  pixelCount: number,
  k = 16,
  maxIter = 15,
): Uint8ClampedArray {
  const rng = makePrng(42)

  const opaque: number[] = []
  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] > 0) opaque.push(i)
  }
  if (opaque.length === 0) return new Uint8ClampedArray(data)

  const n = opaque.length
  const actualK = Math.min(k, n)

  // Sample up to 50k pixels for centroid estimation
  const sampleSize = Math.min(n, 50000)
  const stride = n / sampleSize
  const sample: number[] = []
  for (let i = 0; i < sampleSize; i++) sample.push(opaque[Math.floor(i * stride)])

  // K-means++ initialization: each centroid is chosen with probability ∝ distance²
  const centroids = new Float32Array(actualK * 3)
  const distances = new Float32Array(sampleSize).fill(Infinity)

  const firstIdx = Math.floor(rng() * sampleSize)
  const fp = sample[firstIdx] * 4
  centroids[0] = data[fp]
  centroids[1] = data[fp + 1]
  centroids[2] = data[fp + 2]

  for (let ki = 1; ki < actualK; ki++) {
    let sumDist = 0
    const cx = centroids[(ki - 1) * 3]
    const cy = centroids[(ki - 1) * 3 + 1]
    const cz = centroids[(ki - 1) * 3 + 2]
    for (let si = 0; si < sampleSize; si++) {
      const pi = sample[si] * 4
      const dr = data[pi] - cx
      const dg = data[pi + 1] - cy
      const db = data[pi + 2] - cz
      const d = dr * dr + dg * dg + db * db
      if (d < distances[si]) distances[si] = d
      sumDist += distances[si]
    }

    let chosen = sampleSize - 1
    if (sumDist > 0) {
      let target = rng() * sumDist
      for (let si = 0; si < sampleSize; si++) {
        target -= distances[si]
        if (target <= 0) {
          chosen = si
          break
        }
      }
    } else {
      chosen = Math.floor(rng() * sampleSize)
    }
    const cp = sample[chosen] * 4
    centroids[ki * 3] = data[cp]
    centroids[ki * 3 + 1] = data[cp + 1]
    centroids[ki * 3 + 2] = data[cp + 2]
  }

  // Lloyd's iterations on sample
  const sums = new Float64Array(actualK * 3)
  const counts = new Int32Array(actualK)
  for (let iter = 0; iter < maxIter; iter++) {
    sums.fill(0)
    counts.fill(0)
    let moved = false

    for (let si = 0; si < sampleSize; si++) {
      const pi = sample[si] * 4
      const r = data[pi],
        g = data[pi + 1],
        b = data[pi + 2]
      let bestK = 0,
        bestDist = Infinity
      for (let ki = 0; ki < actualK; ki++) {
        const dr = r - centroids[ki * 3]
        const dg = g - centroids[ki * 3 + 1]
        const db = b - centroids[ki * 3 + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < bestDist) {
          bestDist = d
          bestK = ki
        }
      }
      sums[bestK * 3] += r
      sums[bestK * 3 + 1] += g
      sums[bestK * 3 + 2] += b
      counts[bestK]++
    }

    for (let ki = 0; ki < actualK; ki++) {
      if (counts[ki] > 0) {
        const nr = sums[ki * 3] / counts[ki]
        const ng = sums[ki * 3 + 1] / counts[ki]
        const nb = sums[ki * 3 + 2] / counts[ki]
        const delta =
          Math.abs(nr - centroids[ki * 3]) +
          Math.abs(ng - centroids[ki * 3 + 1]) +
          Math.abs(nb - centroids[ki * 3 + 2])
        if (delta > 0.01) moved = true
        centroids[ki * 3] = nr
        centroids[ki * 3 + 1] = ng
        centroids[ki * 3 + 2] = nb
      }
    }
    if (!moved) break
  }

  // Apply to all pixels; preserve alpha channel as-is
  const result = new Uint8ClampedArray(data)
  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] === 0) continue
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2]
    let bestK = 0,
      bestDist = Infinity
    for (let ki = 0; ki < actualK; ki++) {
      const dr = r - centroids[ki * 3]
      const dg = g - centroids[ki * 3 + 1]
      const db = b - centroids[ki * 3 + 2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestDist) {
        bestDist = d
        bestK = ki
      }
    }
    result[i * 4] = Math.round(centroids[bestK * 3])
    result[i * 4 + 1] = Math.round(centroids[bestK * 3 + 1])
    result[i * 4 + 2] = Math.round(centroids[bestK * 3 + 2])
  }
  return result
}

function computeColProfile(data: Uint8ClampedArray, width: number, height: number): Float64Array {
  const profile = new Float64Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      const li = (y * width + x - 1) * 4
      const ri = (y * width + x + 1) * 4
      const lg =
        data[li + 3] === 0 ? 0 : 0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2]
      const rg =
        data[ri + 3] === 0 ? 0 : 0.299 * data[ri] + 0.587 * data[ri + 1] + 0.114 * data[ri + 2]
      profile[x] += Math.abs(rg - lg)
    }
  }
  return profile
}

function computeRowProfile(data: Uint8ClampedArray, width: number, height: number): Float64Array {
  const profile = new Float64Array(height)
  for (let x = 0; x < width; x++) {
    for (let y = 1; y < height - 1; y++) {
      const ti = ((y - 1) * width + x) * 4
      const bi = ((y + 1) * width + x) * 4
      const tg =
        data[ti + 3] === 0 ? 0 : 0.299 * data[ti] + 0.587 * data[ti + 1] + 0.114 * data[ti + 2]
      const bg =
        data[bi + 3] === 0 ? 0 : 0.299 * data[bi] + 0.587 * data[bi + 1] + 0.114 * data[bi + 2]
      profile[y] += Math.abs(bg - tg)
    }
  }
  return profile
}

function smoothProfile(profile: Float64Array): Float64Array {
  const out = new Float64Array(profile.length)
  for (let i = 0; i < profile.length; i++) {
    let sum = profile[i] * 2
    let weight = 2

    if (i > 0) {
      sum += profile[i - 1]
      weight += 1
    }
    if (i + 1 < profile.length) {
      sum += profile[i + 1]
      weight += 1
    }
    if (i > 1) {
      sum += profile[i - 2] * 0.5
      weight += 0.5
    }
    if (i + 2 < profile.length) {
      sum += profile[i + 2] * 0.5
      weight += 0.5
    }

    out[i] = sum / weight
  }
  return out
}

function estimatePeriodicStep(profile: Float64Array): { step: number; confidence: number } | null {
  const maxLag = Math.min(256, Math.floor(profile.length / 3))
  if (maxLag < 2) return null

  const smoothed = smoothProfile(profile)
  let mean = 0
  for (let i = 0; i < smoothed.length; i++) mean += smoothed[i]
  mean /= smoothed.length

  const centered = new Float64Array(smoothed.length)
  let energy = 0
  for (let i = 0; i < smoothed.length; i++) {
    const value = smoothed[i] - mean
    centered[i] = value
    energy += value * value
  }
  if (energy === 0) return null

  let bestLag = 2
  let bestCorr = -Infinity
  for (let lag = 2; lag <= maxLag; lag++) {
    let num = 0
    let denomA = 0
    let denomB = 0

    for (let i = lag; i < centered.length; i++) {
      const a = centered[i]
      const b = centered[i - lag]
      num += a * b
      denomA += a * a
      denomB += b * b
    }

    const corr = denomA > 0 && denomB > 0 ? num / Math.sqrt(denomA * denomB) : -Infinity
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  if (!Number.isFinite(bestCorr) || bestCorr <= 0) return null
  return { step: bestLag, confidence: bestCorr }
}

const FALLBACK_SEGMENTS = 64

function walk(profile: Float64Array, stepSize: number, limit: number): number[] {
  const cuts = [0]
  let pos = 0
  const searchWindow = Math.max(2, stepSize * 0.35)
  let mean = 0
  for (let i = 0; i < profile.length; i++) mean += profile[i]
  mean /= profile.length

  while (pos < limit) {
    const target = pos + stepSize
    if (target >= limit) {
      cuts.push(limit)
      break
    }
    const start = Math.max(Math.ceil(pos + 1), Math.floor(target - searchWindow))
    const end = Math.min(limit, Math.ceil(target + searchWindow))
    let maxVal = -1,
      maxIdx = Math.round(target)
    for (let i = start; i < end; i++) {
      if (profile[i] > maxVal) {
        maxVal = profile[i]
        maxIdx = i
      }
    }
    if (maxVal > mean * 0.5) {
      cuts.push(maxIdx)
      pos = maxIdx
    } else {
      const next = Math.round(target)
      cuts.push(next)
      pos = next
    }
  }
  return cuts
}

const MIN_CELLS = 4

function trimTinyEdgeCells(cuts: number[], step: number, limit: number): number[] {
  const trimmed = cuts.slice()
  while (trimmed.length > 2 && trimmed[1] - trimmed[0] < step * 0.5) trimmed.shift()
  while (
    trimmed.length > 2 &&
    trimmed[trimmed.length - 1] - trimmed[trimmed.length - 2] < step * 0.5
  )
    trimmed.pop()

  trimmed[0] = 0
  trimmed[trimmed.length - 1] = limit
  return trimmed
}

function buildUniformCuts(limit: number, cells: number): number[] {
  const safeCells = Math.max(MIN_CELLS, Math.min(limit, Math.round(cells)))
  const cuts: number[] = []
  for (let i = 0; i <= safeCells; i++) cuts.push(Math.round((i * limit) / safeCells))
  return cuts
}

function resampleCells(
  data: Uint8ClampedArray,
  width: number,
  colCuts: number[],
  rowCuts: number[],
): Uint8ClampedArray {
  const numCols = colCuts.length - 1
  const numRows = rowCuts.length - 1
  const out = new Uint8ClampedArray(numCols * numRows * 4)

  for (let ri = 0; ri < numRows; ri++) {
    const ys = rowCuts[ri],
      ye = rowCuts[ri + 1]
    for (let ci = 0; ci < numCols; ci++) {
      const xs = colCuts[ci],
        xe = colCuts[ci + 1]
      const freq = new Map<number, number>()

      for (let py = ys; py < ye; py++) {
        for (let px = xs; px < xe; px++) {
          const i = (py * width + px) * 4
          const key =
            ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0
          freq.set(key, (freq.get(key) ?? 0) + 1)
        }
      }

      const outIdx = (ri * numCols + ci) * 4
      let bestKey = 0,
        bestCount = 0
      for (const [k, c] of freq) {
        if (c > bestCount) {
          bestCount = c
          bestKey = k
        }
      }
      out[outIdx] = (bestKey >>> 24) & 0xff
      out[outIdx + 1] = (bestKey >>> 16) & 0xff
      out[outIdx + 2] = (bestKey >>> 8) & 0xff
      out[outIdx + 3] = bestKey & 0xff
    }
  }
  return out
}

// ─── Public types & function ─────────────────────────────────────────────────

import type { ImageLike } from './index'

export interface SnapOptions {
  /**
   * Number of representative colors for K-means quantization.
   * Higher values preserve more color detail but slow down grid detection.
   * @default 32
   */
  colorVariety?: number

  /**
   * Output dimensions.
   * - `'original'` — uniform grid at approximately the original size [default]
   * - `'resized'`  — output is detectedResolution × detectedResolution pixels
   */
  output?: 'original' | 'resized'
}

export interface SnapResult {
  data: Uint8ClampedArray
  width: number
  height: number
  /** Detected grid resolution (average of column and row count). */
  detectedResolution: number
  /** Column boundary positions in the output image (for grid overlay rendering). */
  colCuts: number[]
  /** Row boundary positions in the output image (for grid overlay rendering). */
  rowCuts: number[]
}

/**
 * Detects the pixel grid in an existing pixel-art image and re-snaps it
 * to a clean, uniform grid. Fixes anti-aliasing artifacts, sub-pixel
 * misalignment, and scaling blur that degrade pixel art shared online.
 *
 * @example
 * ```ts
 * const result = snap(imageData)
 * const result = snap(imageData, { colorVariety: 64, output: 'resized' })
 * ```
 */
export function snap(input: ImageLike, options?: SnapOptions): SnapResult {
  const { data, width, height } = input
  const colorVariety = options?.colorVariety ?? 32
  const outputMode = options?.output ?? 'original'
  const pixelCount = width * height

  const quantData = kmeansQuantize(data, pixelCount, colorVariety)
  const colProfile = computeColProfile(quantData, width, height)
  const rowProfile = computeRowProfile(quantData, width, height)

  const colStepEstimate = estimatePeriodicStep(colProfile)
  const rowStepEstimate = estimatePeriodicStep(rowProfile)
  const fallbackStep = Math.max(1, Math.min(width, height) / FALLBACK_SEGMENTS)

  let baseStep = fallbackStep
  if (colStepEstimate && rowStepEstimate) {
    baseStep = (colStepEstimate.step + rowStepEstimate.step) / 2
  } else if (colStepEstimate) {
    baseStep = colStepEstimate.step
  } else if (rowStepEstimate) {
    baseStep = rowStepEstimate.step
  }

  let colCuts = trimTinyEdgeCells(walk(colProfile, baseStep, width), baseStep, width)
  let rowCuts = trimTinyEdgeCells(walk(rowProfile, baseStep, height), baseStep, height)

  let numCols = Math.max(MIN_CELLS, colCuts.length - 1)
  let numRows = Math.max(MIN_CELLS, rowCuts.length - 1)
  const squareCanvasRatio = Math.abs(width - height) / Math.max(width, height)
  if (squareCanvasRatio <= 0.05 && Math.abs(numCols - numRows) > 0) {
    // On square canvases, treat extra rows/cols as edge noise and collapse to a square grid.
    const sharedCount = Math.max(MIN_CELLS, Math.min(numCols, numRows))
    numCols = sharedCount
    numRows = sharedCount
  }

  colCuts = buildUniformCuts(width, numCols)
  rowCuts = buildUniformCuts(height, numRows)

  const detectedResolution = Math.round((numCols + numRows) / 2)

  const cells = resampleCells(quantData, width, colCuts, rowCuts)

  const cellSize = Math.max(1, Math.floor(Math.min(width / numCols, height / numRows)))
  const outW = cellSize * numCols
  const outH = cellSize * numRows

  const uniformColCuts: number[] = []
  const uniformRowCuts: number[] = []
  for (let i = 0; i <= numCols; i++) uniformColCuts.push(i * cellSize)
  for (let i = 0; i <= numRows; i++) uniformRowCuts.push(i * cellSize)

  if (outputMode === 'original') {
    const result = new Uint8ClampedArray(outW * outH * 4)
    for (let ri = 0; ri < numRows; ri++) {
      for (let ci = 0; ci < numCols; ci++) {
        const cellIdx = (ri * numCols + ci) * 4
        const r = cells[cellIdx],
          g = cells[cellIdx + 1],
          b = cells[cellIdx + 2],
          a = cells[cellIdx + 3]
        const pyStart = ri * cellSize
        const pxStart = ci * cellSize
        for (let py = pyStart; py < pyStart + cellSize; py++) {
          for (let px = pxStart; px < pxStart + cellSize; px++) {
            const idx = (py * outW + px) * 4
            result[idx] = r
            result[idx + 1] = g
            result[idx + 2] = b
            result[idx + 3] = a
          }
        }
      }
    }
    return {
      data: result,
      width: outW,
      height: outH,
      detectedResolution,
      colCuts: uniformColCuts,
      rowCuts: uniformRowCuts,
    }
  } else {
    return {
      data: cells,
      width: numCols,
      height: numRows,
      detectedResolution,
      colCuts: uniformColCuts,
      rowCuts: uniformRowCuts,
    }
  }
}
