export interface StepEstimate {
  step: number
  confidence: number
}

export const FALLBACK_SEGMENTS = 64
export const MIN_CELLS = 4

const MAX_SHORT_AXIS_CELLS = 256

function grayAt(data: Uint8ClampedArray, offset: number): number {
  return data[offset + 3] === 0
    ? 0
    : 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]
}

export function computeColProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float64Array {
  const profile = new Float64Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width - 1; x++) {
      const left = (y * width + x - 1) * 4
      const right = (y * width + x + 1) * 4
      profile[x] += Math.abs(grayAt(data, right) - grayAt(data, left))
    }
  }
  return profile
}

export function computeRowProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float64Array {
  const profile = new Float64Array(height)
  for (let x = 0; x < width; x++) {
    for (let y = 1; y < height - 1; y++) {
      const top = ((y - 1) * width + x) * 4
      const bottom = ((y + 1) * width + x) * 4
      profile[y] += Math.abs(grayAt(data, bottom) - grayAt(data, top))
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

export function estimatePeriodicStep(profile: Float64Array, minLag = 2): StepEstimate | null {
  const maxLag = Math.min(256, Math.floor(profile.length / 3))
  const startLag = Math.max(2, Math.min(maxLag, Math.ceil(minLag)))
  if (maxLag < startLag) return null

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

  let bestLag = startLag
  let bestCorr = -Infinity
  for (let lag = startLag; lag <= maxLag; lag++) {
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

export function estimatePeakStep(profile: Float64Array, minLag = 2): StepEstimate | null {
  const maxLag = Math.min(256, Math.floor(profile.length / 3))
  const startLag = Math.max(2, Math.min(maxLag, Math.ceil(minLag)))
  if (maxLag < startLag) return null

  const smoothed = smoothProfile(profile)
  let mean = 0
  for (let i = 0; i < smoothed.length; i++) mean += smoothed[i]
  mean /= smoothed.length

  let variance = 0
  for (let i = 0; i < smoothed.length; i++) {
    const delta = smoothed[i] - mean
    variance += delta * delta
  }

  const threshold = mean + Math.sqrt(variance / smoothed.length) * 0.75
  const peaks: number[] = []
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] < threshold) continue
    if (smoothed[i] < smoothed[i - 1] || smoothed[i] < smoothed[i + 1]) continue
    peaks.push(i)
  }
  if (peaks.length < 4) return null

  const bins = new Float64Array(maxLag + 1)
  let total = 0
  for (let i = 1; i < peaks.length; i++) {
    const distance = peaks[i] - peaks[i - 1]
    if (distance < startLag || distance > maxLag) continue
    bins[distance] += 1
    total += 1
  }
  if (total === 0) return null

  let bestLag = startLag
  let bestCount = 0
  for (let lag = startLag; lag <= maxLag; lag++) {
    if (bins[lag] > bestCount) {
      bestLag = lag
      bestCount = bins[lag]
    }
  }

  const confidence = bestCount / total
  if (confidence < 0.3) return null
  return { step: bestLag, confidence }
}

export function minimumPlausibleStep(width: number, height: number): number {
  return Math.max(2, Math.ceil(Math.min(width, height) / MAX_SHORT_AXIS_CELLS))
}

export function clampGridToPlausibleCells(
  width: number,
  height: number,
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  if (Math.min(cols, rows) <= MAX_SHORT_AXIS_CELLS) return { cols, rows }

  if (width >= height) {
    const nextRows = Math.min(height, MAX_SHORT_AXIS_CELLS)
    return {
      cols: Math.max(MIN_CELLS, Math.min(width, Math.floor(nextRows * (width / height)))),
      rows: nextRows,
    }
  }

  const nextCols = Math.min(width, MAX_SHORT_AXIS_CELLS)
  return {
    cols: nextCols,
    rows: Math.max(MIN_CELLS, Math.min(height, Math.floor(nextCols * (height / width)))),
  }
}

export function walk(profile: Float64Array, stepSize: number, limit: number): number[] {
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
    let maxVal = -1
    let maxIdx = Math.round(target)
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

export function trimTinyEdgeCells(cuts: readonly number[], step: number, limit: number): number[] {
  const trimmed = cuts.slice()
  while (trimmed.length > 2 && trimmed[1] - trimmed[0] < step * 0.5) trimmed.shift()
  while (
    trimmed.length > 2 &&
    trimmed[trimmed.length - 1] - trimmed[trimmed.length - 2] < step * 0.5
  ) {
    trimmed.pop()
  }

  trimmed[0] = 0
  trimmed[trimmed.length - 1] = limit
  return trimmed
}

export function buildUniformCuts(limit: number, cells: number): number[] {
  const safeCells = Math.max(MIN_CELLS, Math.min(limit, Math.round(cells)))
  const cuts: number[] = []
  for (let i = 0; i <= safeCells; i++) cuts.push(Math.round((i * limit) / safeCells))
  return cuts
}
