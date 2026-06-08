import { MIN_CELLS, minimumPlausibleStep } from './snap-profile'

interface AxisEstimate {
  step: number
  cells: number
  confidence: number
}

export interface UniformGridEstimate {
  cols: number
  rows: number
  confidence: number
}

interface AxisRunSummary {
  histogram: Map<number, number>
  maxRunCount: number
}

const MAX_SAMPLE_LINES = 128
const MAX_RUN_LENGTH = 256
const MIN_TOTAL_RUNS = 64
const MIN_AXIS_CONFIDENCE = 0.72

function pixelKey(data: Uint8ClampedArray, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

function addRun(histogram: Map<number, number>, length: number): void {
  if (length < 2 || length > MAX_RUN_LENGTH) return
  histogram.set(length, (histogram.get(length) ?? 0) + 1)
}

function collectHorizontalRuns(data: Uint8ClampedArray, width: number, height: number) {
  const histogram = new Map<number, number>()
  let maxRunCount = 0
  const yStep = Math.max(1, Math.floor(height / MAX_SAMPLE_LINES))

  for (let y = 0; y < height; y += yStep) {
    let runStart = 0
    let runCount = 1
    let current = pixelKey(data, y * width * 4)
    for (let x = 1; x < width; x++) {
      const key = pixelKey(data, (y * width + x) * 4)
      if (key === current) continue
      addRun(histogram, x - runStart)
      runCount++
      runStart = x
      current = key
    }
    addRun(histogram, width - runStart)
    maxRunCount = Math.max(maxRunCount, runCount)
  }

  return { histogram, maxRunCount }
}

function collectVerticalRuns(data: Uint8ClampedArray, width: number, height: number) {
  const histogram = new Map<number, number>()
  let maxRunCount = 0
  const xStep = Math.max(1, Math.floor(width / MAX_SAMPLE_LINES))

  for (let x = 0; x < width; x += xStep) {
    let runStart = 0
    let runCount = 1
    let current = pixelKey(data, x * 4)
    for (let y = 1; y < height; y++) {
      const key = pixelKey(data, (y * width + x) * 4)
      if (key === current) continue
      addRun(histogram, y - runStart)
      runCount++
      runStart = y
      current = key
    }
    addRun(histogram, height - runStart)
    maxRunCount = Math.max(maxRunCount, runCount)
  }

  return { histogram, maxRunCount }
}

function estimateCells(limit: number, step: number, maxRunCount: number): number {
  const geometricCells = Math.round(limit / step)
  const edgeCropLimit = Math.ceil(limit / step) + 1
  return Math.max(geometricCells, Math.min(maxRunCount, edgeCropLimit))
}

function estimateAxisStep(summary: AxisRunSummary, limit: number): AxisEstimate | null {
  const entries = [...summary.histogram.entries()]
  const totalRuns = entries.reduce((sum, [, count]) => sum + count, 0)
  if (totalRuns < MIN_TOTAL_RUNS) return null

  let best: AxisEstimate | null = null
  const maxCandidate = Math.min(MAX_RUN_LENGTH, Math.floor(limit / MIN_CELLS))
  let bestDivisibleConfidence = 0
  for (let step = 2; step <= maxCandidate; step++) {
    let divisibleRuns = 0
    for (const [length, count] of entries) {
      if (length % step === 0) divisibleRuns += count
    }

    const divisibleConfidence = divisibleRuns / totalRuns
    if (divisibleConfidence < MIN_AXIS_CONFIDENCE) continue
    const nearBest = divisibleConfidence >= bestDivisibleConfidence * 0.98
    if (
      best === null ||
      divisibleConfidence > bestDivisibleConfidence + 0.02 ||
      (nearBest && step > best.step)
    ) {
      best = {
        step,
        cells: estimateCells(limit, step, summary.maxRunCount),
        confidence: divisibleConfidence,
      }
      bestDivisibleConfidence = Math.max(bestDivisibleConfidence, divisibleConfidence)
    }
  }

  return best
}

export function detectUniformCellGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): UniformGridEstimate | null {
  const horizontal = estimateAxisStep(collectHorizontalRuns(data, width, height), width)
  const vertical = estimateAxisStep(collectVerticalRuns(data, width, height), height)
  if (!horizontal || !vertical) return null

  const minCellSize = Math.min(horizontal.step, vertical.step)
  if (minCellSize <= minimumPlausibleStep(width, height)) return null

  const cols = Math.max(MIN_CELLS, horizontal.cells)
  const rows = Math.max(MIN_CELLS, vertical.cells)
  const confidence = Math.min(horizontal.confidence, vertical.confidence)
  return { cols, rows, confidence }
}
