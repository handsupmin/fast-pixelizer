import { MIN_CELLS, minimumPlausibleStep } from './snap-profile'

interface TransitionGridEstimate {
  cols: number
  rows: number
  confidence: number
}

type Axis = 'x' | 'y'

const MAX_SAMPLE_LINES = 512
const MAX_EXACT_TRANSITION_CELLS = 256
const MIN_TRANSITION_SCORE = 0.08
const MIN_TRANSITION_CONTRAST = 3
const FINE_GRID_SCORE_RATIO = 0.8

function pixelKey(data: Uint8ClampedArray, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

function transitionProfile(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  axis: Axis,
): Float64Array {
  const limit = axis === 'x' ? width : height
  const otherLimit = axis === 'x' ? height : width
  const otherStep = Math.max(1, Math.floor(otherLimit / MAX_SAMPLE_LINES))
  const profile = new Float64Array(limit)
  let samples = 0

  for (let other = 0; other < otherLimit; other += otherStep) {
    samples++
    for (let position = 1; position < limit; position++) {
      const before =
        axis === 'x' ? (other * width + position - 1) * 4 : ((position - 1) * width + other) * 4
      const after = axis === 'x' ? (other * width + position) * 4 : (position * width + other) * 4
      if (pixelKey(data, before) !== pixelKey(data, after)) profile[position]++
    }
  }

  for (let index = 0; index < profile.length; index++) profile[index] /= samples
  return profile
}

function mean(profile: Float64Array): number {
  let sum = 0
  for (let index = 0; index < profile.length; index++) sum += profile[index]
  return profile.length > 0 ? sum / profile.length : 0
}

function boundaryScore(profile: Float64Array, cells: number): number {
  let sum = 0
  for (let index = 1; index < cells; index++) {
    sum += profile[Math.round((index * profile.length) / cells)]
  }
  return cells > 1 ? sum / (cells - 1) : 0
}

export function detectExactTransitionGrid(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): TransitionGridEstimate | null {
  if (width !== height) return null

  const colProfile = transitionProfile(data, width, height, 'x')
  const rowProfile = transitionProfile(data, width, height, 'y')
  const averageTransition = (mean(colProfile) + mean(rowProfile)) / 2
  const maxCells = Math.min(
    MAX_EXACT_TRANSITION_CELLS,
    width,
    height,
    Math.floor(Math.min(width, height) / minimumPlausibleStep(width, height)),
  )

  let bestCells = 0
  let bestScore = 0
  const scores = new Float64Array(maxCells + 1)

  for (let cells = MIN_CELLS; cells <= maxCells; cells++) {
    const score = (boundaryScore(colProfile, cells) + boundaryScore(rowProfile, cells)) / 2
    scores[cells] = score
    if (score > bestScore) {
      bestScore = score
      bestCells = cells
    }
  }

  const contrast = bestScore / (averageTransition + 1e-9)
  if (bestScore < MIN_TRANSITION_SCORE || contrast < MIN_TRANSITION_CONTRAST) return null

  let cells = bestCells
  for (let candidate = bestCells + 1; candidate <= maxCells; candidate++) {
    if (scores[candidate] >= bestScore * FINE_GRID_SCORE_RATIO) cells = candidate
  }

  return { cols: cells, rows: cells, confidence: contrast }
}
