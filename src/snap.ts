import type { ImageLike } from './index'
import { resampleCells } from './snap-cells'
import {
  FALLBACK_SEGMENTS,
  MIN_CELLS,
  buildUniformCuts,
  clampGridToPlausibleCells,
  computeColProfile,
  computeRowProfile,
  estimatePeriodicStep,
  minimumPlausibleStep,
  trimTinyEdgeCells,
  walk,
} from './snap-profile'
import { kmeansQuantize } from './snap-quantize'
import { detectUniformCellGrid } from './snap-uniform'

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
  let numCols = uniformGrid?.cols ?? 0
  let numRows = uniformGrid?.rows ?? 0

  if (!uniformGrid) {
    const colProfile = computeColProfile(quantData, width, height)
    const rowProfile = computeRowProfile(quantData, width, height)
    const minStep = minimumPlausibleStep(width, height)
    const colStepEstimate = estimatePeriodicStep(colProfile, minStep)
    const rowStepEstimate = estimatePeriodicStep(rowProfile, minStep)
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
  }

  const plausibleGrid = clampGridToPlausibleCells(width, height, numCols, numRows)
  numCols = plausibleGrid.cols
  numRows = plausibleGrid.rows

  const colCuts = buildUniformCuts(width, numCols)
  const rowCuts = buildUniformCuts(height, numRows)

  const detectedResolution = Math.round((numCols + numRows) / 2)
  const cells = resampleCells(quantData, width, colCuts, rowCuts)
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
