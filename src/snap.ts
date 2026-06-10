import type { ImageLike } from './index'
import { resampleCells, resampleDetailCells } from './snap-cells'
import {
  FALLBACK_SEGMENTS,
  MIN_CELLS,
  buildUniformCuts,
  clampGridToPlausibleCells,
  computeColProfile,
  computeRowProfile,
  estimatePeakStep,
  estimatePeriodicStep,
  minimumPlausibleStep,
  trimTinyEdgeCells,
  walk,
} from './snap-profile'
import { kmeansQuantize } from './snap-quantize'
import { detectExactTransitionGrid } from './snap-transitions'
import { detectUniformCellGrid } from './snap-uniform'

const DETAIL_PRESERVATION_LONG_AXIS = 300
const DETAIL_PRESERVATION_MAX_SOURCE_CELL_SIZE = 5
const DETAIL_PRESERVATION_COLOR_FLOOR = 256
const DETAIL_PRESERVATION_MAX_ITER = 12

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
   * - `'resized'`  — output is the detected grid (`cols × rows`) as pixels
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

function paintUniformCells(cells: Uint8ClampedArray, cols: number, rows: number, cellSize: number) {
  const width = cellSize * cols
  const height = cellSize * rows
  const result = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellIdx = (row * cols + col) * 4
      const r = cells[cellIdx]
      const g = cells[cellIdx + 1]
      const b = cells[cellIdx + 2]
      const a = cells[cellIdx + 3]
      const yStart = row * cellSize
      const xStart = col * cellSize

      for (let py = yStart; py < yStart + cellSize; py++) {
        for (let px = xStart; px < xStart + cellSize; px++) {
          const idx = (py * width + px) * 4
          result[idx] = r
          result[idx + 1] = g
          result[idx + 2] = b
          result[idx + 3] = a
        }
      }
    }
  }

  return { data: result, width, height }
}

function gridCountsFromStep(
  colProfile: Float64Array,
  rowProfile: Float64Array,
  width: number,
  height: number,
  step: number,
) {
  const colCuts = trimTinyEdgeCells(walk(colProfile, step, width), step, width)
  const rowCuts = trimTinyEdgeCells(walk(rowProfile, step, height), step, height)
  return {
    cols: Math.max(MIN_CELLS, colCuts.length - 1),
    rows: Math.max(MIN_CELLS, rowCuts.length - 1),
  }
}

function shouldUsePeakGrid(
  width: number,
  height: number,
  current: { cols: number; rows: number },
  candidate: { cols: number; rows: number },
) {
  const currentShortAxis = Math.min(current.cols, current.rows)
  const candidateShortAxis = Math.min(candidate.cols, candidate.rows)
  const candidateCellSize = Math.min(width / candidate.cols, height / candidate.rows)
  const candidateAspectError = Math.abs(candidate.cols / candidate.rows / (width / height) - 1)

  return (
    currentShortAxis < 24 &&
    candidateShortAxis > currentShortAxis * 1.8 &&
    candidateCellSize >= minimumPlausibleStep(width, height) &&
    candidateAspectError <= 0.05
  )
}

function shouldPreferUniformGrid(
  uniformGrid: { cols: number; rows: number; confidence: number } | null,
  transitionGrid: { cols: number; rows: number; confidence: number } | null,
): boolean {
  if (!uniformGrid || !transitionGrid) return false

  const uniformShortAxis = Math.min(uniformGrid.cols, uniformGrid.rows)
  const transitionShortAxis = Math.min(transitionGrid.cols, transitionGrid.rows)
  return uniformGrid.confidence >= 0.95 && uniformShortAxis >= transitionShortAxis * 2
}

function shouldPreserveGeneratedDetail(
  hasStrongGrid: boolean,
  width: number,
  height: number,
  cols: number,
  rows: number,
) {
  if (hasStrongGrid) return false
  const longAxisCells = Math.max(cols, rows)
  const sourceCellSize = Math.min(width / cols, height / rows)
  return (
    longAxisCells >= DETAIL_PRESERVATION_LONG_AXIS &&
    sourceCellSize <= DETAIL_PRESERVATION_MAX_SOURCE_CELL_SIZE
  )
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
  const uniformGrid = detectUniformCellGrid(data, width, height)
  const transitionGrid = detectExactTransitionGrid(data, width, height)
  const initialGrid = shouldPreferUniformGrid(uniformGrid, transitionGrid)
    ? uniformGrid
    : (transitionGrid ?? uniformGrid)
  const hasStrongGrid = Boolean(initialGrid)
  let numCols = initialGrid?.cols ?? 0
  let numRows = initialGrid?.rows ?? 0

  if (!transitionGrid && !uniformGrid) {
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

    const colCuts = trimTinyEdgeCells(walk(colProfile, baseStep, width), baseStep, width)
    const rowCuts = trimTinyEdgeCells(walk(rowProfile, baseStep, height), baseStep, height)

    numCols = Math.max(MIN_CELLS, colCuts.length - 1)
    numRows = Math.max(MIN_CELLS, rowCuts.length - 1)
    const squareCanvasRatio = Math.abs(width - height) / Math.max(width, height)
    if (squareCanvasRatio <= 0.05 && Math.abs(numCols - numRows) > 0) {
      const sharedCount = Math.max(MIN_CELLS, Math.min(numCols, numRows))
      numCols = sharedCount
      numRows = sharedCount
    }

    const minStep = minimumPlausibleStep(width, height)
    const colPeakEstimate = estimatePeakStep(colProfile, minStep)
    const rowPeakEstimate = estimatePeakStep(rowProfile, minStep)
    if (colPeakEstimate && rowPeakEstimate) {
      const peakStep = (colPeakEstimate.step + rowPeakEstimate.step) / 2
      const peakGrid = gridCountsFromStep(colProfile, rowProfile, width, height, peakStep)
      if (shouldUsePeakGrid(width, height, { cols: numCols, rows: numRows }, peakGrid)) {
        numCols = peakGrid.cols
        numRows = peakGrid.rows
      }
    }
  }

  if (hasStrongGrid) {
    const plausibleGrid = clampGridToPlausibleCells(width, height, numCols, numRows)
    numCols = plausibleGrid.cols
    numRows = plausibleGrid.rows
  }

  const colCuts = buildUniformCuts(width, numCols)
  const rowCuts = buildUniformCuts(height, numRows)

  const detectedResolution = Math.round((numCols + numRows) / 2)
  const preserveGeneratedDetail = shouldPreserveGeneratedDetail(
    hasStrongGrid,
    width,
    height,
    numCols,
    numRows,
  )
  const cells = preserveGeneratedDetail
    ? kmeansQuantize(
        resampleDetailCells(data, width, colCuts, rowCuts),
        numCols * numRows,
        Math.max(colorVariety, DETAIL_PRESERVATION_COLOR_FLOOR),
        DETAIL_PRESERVATION_MAX_ITER,
      )
    : resampleCells(quantData, width, colCuts, rowCuts)
  const cellSize = Math.max(1, Math.floor(Math.min(width / numCols, height / numRows)))
  const uniformColCuts = buildUniformCuts(cellSize * numCols, numCols)
  const uniformRowCuts = buildUniformCuts(cellSize * numRows, numRows)

  if (outputMode === 'original') {
    return {
      ...paintUniformCells(cells, numCols, numRows, cellSize),
      detectedResolution,
      colCuts: uniformColCuts,
      rowCuts: uniformRowCuts,
    }
  }

  return {
    data: cells,
    width: numCols,
    height: numRows,
    detectedResolution,
    colCuts: uniformColCuts,
    rowCuts: uniformRowCuts,
  }
}
