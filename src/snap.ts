import type { ImageLike } from './index'
import {
  resampleCells,
  resampleDetailCells,
  resampleEdgeDetailCells,
  sharpenCellEdges,
} from './snap-cells'
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

const DETAIL_PRESERVATION_LONG_AXIS = 128
const DETAIL_PRESERVATION_MAX_SOURCE_CELL_SIZE = 9
const DETAIL_PRESERVATION_COLOR_FLOOR = 256
const DETAIL_PRESERVATION_MAX_ITER = 12
const NATIVE_PIXEL_PALETTE_LIMIT = 1024
const NATIVE_PIXEL_SHORT_AXIS_LIMIT = 256
const CRISP_PIXEL_NEIGHBOR_RATIO = 0.6
const COARSE_DETAIL_NEIGHBOR_RATIO = 0.25
const PERIODIC_CONFIDENCE_FLOOR = 0.55
const HARMONIC_RATIO_TOLERANCE = 0.08
const ORIGINAL_SIZE_EXPANSION_LIMIT = 1.02

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
  /** Whether an already-clean source palette was preserved without quantization. */
  preservedSourceColors: boolean
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

function rgbaKey(data: Uint8ClampedArray, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

function hasNativePixelPalette(data: Uint8ClampedArray, pixelCount: number): boolean {
  const colors = new Set<number>()
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    colors.add(rgbaKey(data, pixel * 4))
    if (colors.size > NATIVE_PIXEL_PALETTE_LIMIT) return false
  }
  return true
}

function isUniformBlockScale(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): boolean {
  for (let y = 0; y < height; y += scale) {
    for (let x = 0; x < width; x += scale) {
      const key = rgbaKey(data, (y * width + x) * 4)
      for (let py = y; py < y + scale; py++) {
        for (let px = x; px < x + scale; px++) {
          if (rgbaKey(data, (py * width + px) * 4) !== key) return false
        }
      }
    }
  }
  return true
}

function detectExactUniformScale(data: Uint8ClampedArray, width: number, height: number): number {
  const maxScale = Math.min(64, Math.floor(width / MIN_CELLS), Math.floor(height / MIN_CELLS))
  for (let scale = maxScale; scale >= 2; scale--) {
    if (width % scale !== 0 || height % scale !== 0) continue
    if (isUniformBlockScale(data, width, height, scale)) return scale
  }
  return 1
}

function exactNeighborRatio(data: Uint8ClampedArray, width: number, height: number): number {
  let matching = 0
  let total = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const key = rgbaKey(data, offset)
      if (x > 0) {
        total++
        if (key === rgbaKey(data, offset - 4)) matching++
      }
      if (y > 0) {
        total++
        if (key === rgbaKey(data, offset - width * 4)) matching++
      }
    }
  }

  return total > 0 ? matching / total : 1
}

function combinePeriodicSteps(
  colEstimate: { step: number; confidence: number } | null,
  rowEstimate: { step: number; confidence: number } | null,
  fallback: number,
): number {
  if (!colEstimate && !rowEstimate) return fallback
  if (!colEstimate) return rowEstimate!.step
  if (!rowEstimate) return colEstimate.step

  const smaller = colEstimate.step <= rowEstimate.step ? colEstimate : rowEstimate
  const larger = smaller === colEstimate ? rowEstimate : colEstimate
  const ratio = larger.step / smaller.step
  const harmonic = Math.round(ratio)

  if (
    harmonic >= 2 &&
    Math.abs(ratio - harmonic) <= HARMONIC_RATIO_TOLERANCE &&
    smaller.confidence >= PERIODIC_CONFIDENCE_FLOOR
  ) {
    return smaller.step
  }

  return (colEstimate.step + rowEstimate.step) / 2
}

function estimateGridPhase(profile: Float64Array, step: number): number {
  const integerStep = Math.max(1, Math.round(step))
  let bestPhase = 0
  let bestScore = -Infinity

  for (let phase = 0; phase < integerStep; phase++) {
    let score = 0
    let samples = 0
    for (
      let position = phase === 0 ? integerStep : phase;
      position < profile.length;
      position += integerStep
    ) {
      score += profile[position]
      samples++
    }
    const average = samples > 0 ? score / samples : 0
    if (average > bestScore) {
      bestScore = average
      bestPhase = phase
    }
  }

  return bestPhase === integerStep - 1 ? 0 : bestPhase
}

function buildPhaseAlignedCuts(limit: number, step: number, phase: number): number[] {
  const integerStep = Math.max(1, Math.round(step))
  const cuts = [0]
  for (let position = phase; position < limit; position += integerStep) {
    if (position > 0) cuts.push(position)
  }
  if (cuts[cuts.length - 1] !== limit) cuts.push(limit)
  return cuts
}

function shouldPreserveNativePixels(
  width: number,
  height: number,
  hasUniformGrid: boolean,
  transitionGrid: { cols: number; rows: number } | null,
  colStepEstimate: { step: number } | null,
  rowStepEstimate: { step: number } | null,
): boolean {
  if (hasUniformGrid) return false
  if (Math.min(width, height) <= NATIVE_PIXEL_SHORT_AXIS_LIMIT) return true
  if (
    transitionGrid &&
    Math.min(width / transitionGrid.cols, height / transitionGrid.rows) > 2.25
  ) {
    return false
  }
  const nativeStepLimit = minimumPlausibleStep(width, height)
  if (!colStepEstimate || !rowStepEstimate) return false
  return Math.max(colStepEstimate.step, rowStepEstimate.step) <= nativeStepLimit
}

function originalCellSize(width: number, height: number, cols: number, rows: number): number {
  const exact = Math.min(width / cols, height / rows)
  const rounded = Math.max(1, Math.round(exact))
  const expansion = Math.max((rounded * cols) / width, (rounded * rows) / height)
  return expansion <= ORIGINAL_SIZE_EXPANSION_LIMIT ? rounded : Math.max(1, Math.floor(exact))
}

function isNearIdenticalSource(source: Uint8ClampedArray, rendered: Uint8ClampedArray): boolean {
  if (source.length !== rendered.length) return false
  const maximumTotalDelta = source.length * 0.01
  let totalDelta = 0
  for (let index = 0; index < source.length; index++) {
    totalDelta += Math.abs(source[index] - rendered[index])
    if (totalDelta > maximumTotalDelta) return false
  }
  return true
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

function buildLocallyAlignedCuts(
  profile: Float64Array,
  limit: number,
  targetCells: number,
): number[] {
  let mean = 0
  for (let index = 0; index < profile.length; index++) mean += profile[index]
  mean /= profile.length

  const cuts = [0]
  const averageStep = limit / targetCells
  const searchWindow = Math.max(1, averageStep * 0.25)
  const minimumCellSize = Math.max(1, Math.floor(averageStep * 0.7))

  for (let cell = 1; cell < targetCells; cell++) {
    const target = (cell * limit) / targetCells
    const start = Math.max(
      cuts[cuts.length - 1] + minimumCellSize,
      Math.floor(target - searchWindow),
    )
    const end = Math.min(
      limit - (targetCells - cell) * minimumCellSize,
      Math.ceil(target + searchWindow),
    )
    const fallback = Math.max(start, Math.min(end, Math.round(target)))
    let strongestPosition = fallback
    let strongestValue = -Infinity

    for (let position = start; position <= end; position++) {
      if (profile[position] > strongestValue) {
        strongestValue = profile[position]
        strongestPosition = position
      }
    }

    cuts.push(strongestValue > mean * 0.5 ? strongestPosition : fallback)
  }

  cuts.push(limit)
  return cuts
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
  neighborRatio: number,
) {
  if (hasStrongGrid) return false
  const longAxisCells = Math.max(cols, rows)
  const sourceCellSize = Math.min(width / cols, height / rows)
  const establishedDetailGrid =
    longAxisCells >= DETAIL_PRESERVATION_LONG_AXIS &&
    sourceCellSize <= DETAIL_PRESERVATION_MAX_SOURCE_CELL_SIZE &&
    neighborRatio >= COARSE_DETAIL_NEIGHBOR_RATIO
  const highResolutionDetailGrid = longAxisCells >= 300 && sourceCellSize <= 5
  return establishedDetailGrid || highResolutionDetailGrid
}

function shouldEnhanceCoarseGeneratedDetail(
  hasStrongGrid: boolean,
  width: number,
  height: number,
  cols: number,
  rows: number,
  neighborRatio: number,
) {
  if (hasStrongGrid) return false
  const longAxisCells = Math.max(cols, rows)
  const sourceCellSize = Math.min(width / cols, height / rows)
  return (
    longAxisCells >= DETAIL_PRESERVATION_LONG_AXIS &&
    longAxisCells < 300 &&
    sourceCellSize <= DETAIL_PRESERVATION_MAX_SOURCE_CELL_SIZE &&
    neighborRatio >= COARSE_DETAIL_NEIGHBOR_RATIO
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
  const neighborRatio = exactNeighborRatio(data, width, height)
  let colProfile: Float64Array | null = null
  let rowProfile: Float64Array | null = null
  let colStepEstimate: { step: number; confidence: number } | null = null
  let rowStepEstimate: { step: number; confidence: number } | null = null

  const nativePixelPalette = hasNativePixelPalette(data, pixelCount)
  let uniformGrid = detectUniformCellGrid(data, width, height)
  let exactUniformScale = 1
  if (!uniformGrid && nativePixelPalette) {
    colProfile = computeColProfile(data, width, height)
    rowProfile = computeRowProfile(data, width, height)
    colStepEstimate = estimatePeriodicStep(colProfile)
    rowStepEstimate = estimatePeriodicStep(rowProfile)
    const exactScaleStepLimit = minimumPlausibleStep(width, height)
    if (
      colStepEstimate &&
      rowStepEstimate &&
      Math.max(colStepEstimate.step, rowStepEstimate.step) <= exactScaleStepLimit
    ) {
      exactUniformScale = detectExactUniformScale(data, width, height)
      if (exactUniformScale > 1) {
        uniformGrid = {
          cols: width / exactUniformScale,
          rows: height / exactUniformScale,
          confidence: 1,
        }
      }
    }
  }
  const transitionGrid = detectExactTransitionGrid(data, width, height)
  const initialGrid = shouldPreferUniformGrid(uniformGrid, transitionGrid)
    ? uniformGrid
    : (transitionGrid ?? uniformGrid)
  const hasStrongGrid = Boolean(initialGrid)
  let numCols = initialGrid?.cols ?? 0
  let numRows = initialGrid?.rows ?? 0
  let samplingColCuts: number[] | null = null
  let samplingRowCuts: number[] | null = null
  let walkedColCuts: number[] | null = null
  let walkedRowCuts: number[] | null = null
  let preserveSamplingLayout = false

  if (!uniformGrid && nativePixelPalette) {
    if (
      shouldPreserveNativePixels(
        width,
        height,
        Boolean(uniformGrid),
        transitionGrid,
        colStepEstimate,
        rowStepEstimate,
      )
    ) {
      return {
        data: new Uint8ClampedArray(data),
        width,
        height,
        detectedResolution: Math.round((width + height) / 2),
        colCuts: buildUniformCuts(width, width),
        rowCuts: buildUniformCuts(height, height),
        preservedSourceColors: true,
      }
    }
  }

  if (!transitionGrid && !uniformGrid) {
    const quantData = kmeansQuantize(data, pixelCount, colorVariety)
    colProfile = computeColProfile(quantData, width, height)
    rowProfile = computeRowProfile(quantData, width, height)
    colStepEstimate = estimatePeriodicStep(colProfile)
    rowStepEstimate = estimatePeriodicStep(rowProfile)
    const fallbackStep = Math.max(1, Math.min(width, height) / FALLBACK_SEGMENTS)
    const baseStep = combinePeriodicSteps(colStepEstimate, rowStepEstimate, fallbackStep)
    const crispPixelGrid =
      colStepEstimate !== null &&
      rowStepEstimate !== null &&
      colStepEstimate.confidence >= PERIODIC_CONFIDENCE_FLOOR &&
      rowStepEstimate.confidence >= PERIODIC_CONFIDENCE_FLOOR &&
      neighborRatio >= CRISP_PIXEL_NEIGHBOR_RATIO
    if (crispPixelGrid) {
      const colPhase = estimateGridPhase(colProfile, baseStep)
      const rowPhase = estimateGridPhase(rowProfile, baseStep)
      const integerBaseStep = Math.max(1, Math.round(baseStep))
      samplingColCuts = buildPhaseAlignedCuts(width, baseStep, colPhase)
      samplingRowCuts = buildPhaseAlignedCuts(height, baseStep, rowPhase)
      numCols = Math.max(MIN_CELLS, samplingColCuts.length - 1)
      numRows = Math.max(MIN_CELLS, samplingRowCuts.length - 1)
      const alignedUniformCoverage =
        colPhase === 0 &&
        rowPhase === 0 &&
        width % integerBaseStep === 0 &&
        height % integerBaseStep === 0
      preserveSamplingLayout = !alignedUniformCoverage
    } else {
      const colCuts = trimTinyEdgeCells(walk(colProfile, baseStep, width), baseStep, width)
      const rowCuts = trimTinyEdgeCells(walk(rowProfile, baseStep, height), baseStep, height)
      numCols = Math.max(MIN_CELLS, colCuts.length - 1)
      numRows = Math.max(MIN_CELLS, rowCuts.length - 1)
      walkedColCuts = colCuts
      walkedRowCuts = rowCuts
    }
    if (width === height && Math.abs(numCols - numRows) > 0) {
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
        samplingColCuts = null
        samplingRowCuts = null
        walkedColCuts = null
        walkedRowCuts = null
        preserveSamplingLayout = false
      }
    }
  }

  if (hasStrongGrid && exactUniformScale === 1) {
    const plausibleGrid = clampGridToPlausibleCells(width, height, numCols, numRows)
    numCols = plausibleGrid.cols
    numRows = plausibleGrid.rows
  }

  const detectedResolution = Math.round((numCols + numRows) / 2)
  const preserveGeneratedDetail = shouldPreserveGeneratedDetail(
    hasStrongGrid,
    width,
    height,
    numCols,
    numRows,
    neighborRatio,
  )
  const enhanceCoarseGeneratedDetail = shouldEnhanceCoarseGeneratedDetail(
    hasStrongGrid,
    width,
    height,
    numCols,
    numRows,
    neighborRatio,
  )
  if (enhanceCoarseGeneratedDetail && walkedColCuts && walkedRowCuts && colProfile && rowProfile) {
    samplingColCuts = buildLocallyAlignedCuts(colProfile, width, numCols)
    samplingRowCuts = buildLocallyAlignedCuts(rowProfile, height, numRows)
  }

  const colCuts = buildUniformCuts(width, numCols)
  const rowCuts = buildUniformCuts(height, numRows)
  const sourceColCuts = samplingColCuts ?? colCuts
  const sourceRowCuts = samplingRowCuts ?? rowCuts
  let cells: Uint8ClampedArray
  if (hasStrongGrid) {
    cells = resampleCells(data, width, sourceColCuts, sourceRowCuts)
  } else if (preserveGeneratedDetail) {
    const sampledCells = enhanceCoarseGeneratedDetail
      ? sharpenCellEdges(
          resampleEdgeDetailCells(data, width, sourceColCuts, sourceRowCuts),
          numCols,
          numRows,
        )
      : resampleDetailCells(data, width, sourceColCuts, sourceRowCuts)
    cells = kmeansQuantize(
      sampledCells,
      numCols * numRows,
      Math.max(colorVariety, DETAIL_PRESERVATION_COLOR_FLOOR),
      DETAIL_PRESERVATION_MAX_ITER,
    )
  } else {
    cells = resampleCells(
      kmeansQuantize(data, pixelCount, colorVariety),
      width,
      sourceColCuts,
      sourceRowCuts,
    )
  }
  const cellSize = originalCellSize(width, height, numCols, numRows)
  const uniformColCuts = buildUniformCuts(cellSize * numCols, numCols)
  const uniformRowCuts = buildUniformCuts(cellSize * numRows, numRows)

  if (outputMode === 'original') {
    if (preserveSamplingLayout) {
      return {
        data: new Uint8ClampedArray(data),
        width,
        height,
        detectedResolution,
        colCuts: sourceColCuts,
        rowCuts: sourceRowCuts,
        preservedSourceColors: true,
      }
    }
    const rendered = paintUniformCells(cells, numCols, numRows, cellSize)
    const preserveOriginalPixels =
      hasStrongGrid &&
      rendered.width === width &&
      rendered.height === height &&
      isNearIdenticalSource(data, rendered.data)
    return {
      ...(preserveOriginalPixels ? { data: new Uint8ClampedArray(data), width, height } : rendered),
      detectedResolution,
      colCuts: uniformColCuts,
      rowCuts: uniformRowCuts,
      preservedSourceColors: hasStrongGrid,
    }
  }

  return {
    data: cells,
    width: numCols,
    height: numRows,
    detectedResolution,
    colCuts: uniformColCuts,
    rowCuts: uniformRowCuts,
    preservedSourceColors: hasStrongGrid,
  }
}
