import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { snap } from '../../dist/index.js'
import { QUALITY_RULES } from './config.mjs'
import { classifyMetrics, formatNum, objective } from './classify.mjs'
import { cellColorDominanceMetrics } from './cell-dominance.mjs'
import { cellColorComponentMetrics } from './cell-color-components.mjs'
import { cellColorErrorMetrics } from './cell-color-error.mjs'
import { cellTransitionMetrics } from './cell-transition.mjs'
import { loadImage, writePng } from './image-io.mjs'
import { paletteDominanceMetrics } from './palette-dominance.mjs'
import { paletteUtilizationMetrics } from './palette-utilization.mjs'
import {
  cellUniformityMetrics,
  gridBoundarySignals,
  gridPhaseSignals,
  meanAxisGradient,
  preservationStats,
  uniqueColorCount,
  uniqueRgbColorCount,
} from './metrics.mjs'

function gridGap(a, b) {
  return Math.abs(a.width - b.width) + Math.abs(a.height - b.height)
}

async function timedSnap(input, options) {
  const start = performance.now()
  const result = snap(input, options)
  return { result, durationMs: performance.now() - start }
}

function lowPaletteColorRatio(inputRgbColorCount, outputRgbColorCount, colorVariety) {
  return inputRgbColorCount > 0 && inputRgbColorCount <= colorVariety + 1
    ? outputRgbColorCount / inputRgbColorCount
    : 1
}

function lowPaletteRetention(inputRgbColorCount, outputRgbColorCount, colorVariety) {
  return Math.min(1, lowPaletteColorRatio(inputRgbColorCount, outputRgbColorCount, colorVariety))
}

function lowPaletteGrowth(inputRgbColorCount, outputRgbColorCount, colorVariety) {
  return lowPaletteColorRatio(inputRgbColorCount, outputRgbColorCount, colorVariety)
}

function outputCoverage(input, result) {
  return Math.min(result.width / input.width, result.height / input.height)
}

function outputAreaCoverage(input, result) {
  return (result.width * result.height) / (input.width * input.height)
}

function outputExpansion(input, result) {
  return Math.max(result.width / input.width, result.height / input.height)
}

function outputCellIntegerError(result, cols, rows) {
  const cellWidth = result.width / cols
  const cellHeight = result.height / rows
  return Math.max(
    Math.abs(cellWidth - Math.round(cellWidth)),
    Math.abs(cellHeight - Math.round(cellHeight)),
  )
}

function toItem({ dataset, expected, input, metrics, name, original, resized, uniformity }) {
  const classification = classifyMetrics(metrics)
  return {
    dataset: dataset.name,
    file: name,
    input: `${input.width}x${input.height}`,
    output: `${original.result.width}x${original.result.height}`,
    outputCoverage: formatNum(metrics.outputCoverage),
    outputAreaCoverage: formatNum(metrics.outputAreaCoverage),
    outputExpansion: formatNum(metrics.outputExpansion),
    grid: `${metrics.cols}x${metrics.rows}`,
    expectedGrid: expected ? `${expected.cols}x${expected.rows}` : '',
    longAxisCells: metrics.longAxisCells,
    detectedResolution: original.result.detectedResolution,
    sourceCellSize: formatNum(metrics.sourceCellSize),
    squareCellError: formatNum(metrics.squareCellError),
    outputCellIntegerError: formatNum(metrics.outputCellIntegerError),
    aspectError: formatNum(metrics.aspectError),
    edgeAlignment: formatNum(metrics.edgeAlignment),
    axisEdgeAlignmentMin: formatNum(metrics.axisEdgeAlignmentMin),
    phaseAlignment: formatNum(metrics.phaseAlignment),
    axisPhaseAlignmentMin: formatNum(metrics.axisPhaseAlignmentMin),
    cellColorDominance: formatNum(metrics.cellColorDominance),
    cellColorDominanceP05: formatNum(metrics.cellColorDominanceP05),
    cellColorDominanceMin: formatNum(metrics.cellColorDominanceMin),
    exactLowPaletteCellColorEligible: metrics.exactLowPaletteCellColorEligible,
    cellColorAdjacencyDrift: metrics.cellColorAdjacencyDrift,
    cellColorDiagonalAdjacencyDrift: metrics.cellColorDiagonalAdjacencyDrift,
    sourceCellColorAdjacencyCount: metrics.sourceCellColorAdjacencyCount,
    sourceCellColorDiagonalAdjacencyCount: metrics.sourceCellColorDiagonalAdjacencyCount,
    outputCellColorAdjacencyCount: metrics.outputCellColorAdjacencyCount,
    outputCellColorDiagonalAdjacencyCount: metrics.outputCellColorDiagonalAdjacencyCount,
    cellColorBoundaryPairDrift: metrics.cellColorBoundaryPairDrift,
    cellColorDiagonalBoundaryPairDrift: metrics.cellColorDiagonalBoundaryPairDrift,
    sourceCellColorBoundaryPairCount: metrics.sourceCellColorBoundaryPairCount,
    sourceCellColorDiagonalBoundaryPairCount: metrics.sourceCellColorDiagonalBoundaryPairCount,
    outputCellColorBoundaryPairCount: metrics.outputCellColorBoundaryPairCount,
    outputCellColorDiagonalBoundaryPairCount: metrics.outputCellColorDiagonalBoundaryPairCount,
    cellColorBoundaryHorizontalRunDrift: metrics.cellColorBoundaryHorizontalRunDrift,
    cellColorBoundaryVerticalRunDrift: metrics.cellColorBoundaryVerticalRunDrift,
    sourceCellColorBoundaryHorizontalRunCount: metrics.sourceCellColorBoundaryHorizontalRunCount,
    sourceCellColorBoundaryVerticalRunCount: metrics.sourceCellColorBoundaryVerticalRunCount,
    outputCellColorBoundaryHorizontalRunCount: metrics.outputCellColorBoundaryHorizontalRunCount,
    outputCellColorBoundaryVerticalRunCount: metrics.outputCellColorBoundaryVerticalRunCount,
    cellColorNeighborMaskDrift: metrics.cellColorNeighborMaskDrift,
    sourceCellColorNeighborMaskCount: metrics.sourceCellColorNeighborMaskCount,
    outputCellColorNeighborMaskCount: metrics.outputCellColorNeighborMaskCount,
    cellColorQuadPatternDrift: metrics.cellColorQuadPatternDrift,
    sourceCellColorQuadPatternCount: metrics.sourceCellColorQuadPatternCount,
    outputCellColorQuadPatternCount: metrics.outputCellColorQuadPatternCount,
    sourceCellColorDistinctQuadPatternCount: metrics.sourceCellColorDistinctQuadPatternCount,
    outputCellColorDistinctQuadPatternCount: metrics.outputCellColorDistinctQuadPatternCount,
    cellColorWindowPatternDrift: metrics.cellColorWindowPatternDrift,
    sourceCellColorWindowPatternCount: metrics.sourceCellColorWindowPatternCount,
    outputCellColorWindowPatternCount: metrics.outputCellColorWindowPatternCount,
    sourceCellColorDistinctWindowPatternCount: metrics.sourceCellColorDistinctWindowPatternCount,
    outputCellColorDistinctWindowPatternCount: metrics.outputCellColorDistinctWindowPatternCount,
    cellColorHorizontalRunDrift: metrics.cellColorHorizontalRunDrift,
    cellColorVerticalRunDrift: metrics.cellColorVerticalRunDrift,
    sourceCellColorHorizontalRunCount: metrics.sourceCellColorHorizontalRunCount,
    sourceCellColorVerticalRunCount: metrics.sourceCellColorVerticalRunCount,
    outputCellColorHorizontalRunCount: metrics.outputCellColorHorizontalRunCount,
    outputCellColorVerticalRunCount: metrics.outputCellColorVerticalRunCount,
    cellColorRowProjectionDrift: metrics.cellColorRowProjectionDrift,
    cellColorColumnProjectionDrift: metrics.cellColorColumnProjectionDrift,
    sourceCellColorRowProjectionCount: metrics.sourceCellColorRowProjectionCount,
    sourceCellColorColumnProjectionCount: metrics.sourceCellColorColumnProjectionCount,
    outputCellColorRowProjectionCount: metrics.outputCellColorRowProjectionCount,
    outputCellColorColumnProjectionCount: metrics.outputCellColorColumnProjectionCount,
    cellColorComponentCountDrift: metrics.cellColorComponentCountDrift,
    cellColorComponentAreaDrift: metrics.cellColorComponentAreaDrift,
    cellColorComponentBBoxDrift: metrics.cellColorComponentBBoxDrift,
    cellColorComponentHoleCountDrift: metrics.cellColorComponentHoleCountDrift,
    cellColorComponentPerimeterDrift: metrics.cellColorComponentPerimeterDrift,
    cellColorComponentPositionDrift: formatNum(metrics.cellColorComponentPositionDrift),
    smallCellColorComponentCountDrift: metrics.smallCellColorComponentCountDrift,
    sourceCellColorComponentCount: metrics.sourceCellColorComponentCount,
    sourceCellColorComponentHoleCount: metrics.sourceCellColorComponentHoleCount,
    sourceSmallCellColorComponentCount: metrics.sourceSmallCellColorComponentCount,
    outputCellColorComponentCount: metrics.outputCellColorComponentCount,
    outputCellColorComponentHoleCount: metrics.outputCellColorComponentHoleCount,
    outputSmallCellColorComponentCount: metrics.outputSmallCellColorComponentCount,
    cellAlphaErrorMean: formatNum(metrics.cellAlphaErrorMean),
    cellAlphaErrorP95: formatNum(metrics.cellAlphaErrorP95),
    cellAlphaErrorMax: formatNum(metrics.cellAlphaErrorMax),
    cellColorErrorMean: formatNum(metrics.cellColorErrorMean),
    cellColorErrorP95: formatNum(metrics.cellColorErrorP95),
    cellColorErrorP99: formatNum(metrics.cellColorErrorP99),
    cellColorErrorMax: formatNum(metrics.cellColorErrorMax),
    cellTransitionRetention: formatNum(metrics.cellTransitionRetention),
    cellTransitionSpuriousRatio: formatNum(metrics.cellTransitionSpuriousRatio),
    cellTransitionErrorMean: formatNum(metrics.cellTransitionErrorMean),
    cellTransitionErrorP95: formatNum(metrics.cellTransitionErrorP95),
    cellTransitionErrorP99: formatNum(metrics.cellTransitionErrorP99),
    cellTransitionAxisErrorP95Max: formatNum(metrics.cellTransitionAxisErrorP95Max),
    cellTransitionAxisErrorP99Max: formatNum(metrics.cellTransitionAxisErrorP99Max),
    cellDiagonalTransitionRetention: formatNum(metrics.cellDiagonalTransitionRetention),
    cellDiagonalTransitionSpuriousRatio: formatNum(metrics.cellDiagonalTransitionSpuriousRatio),
    cellDiagonalTransitionErrorMean: formatNum(metrics.cellDiagonalTransitionErrorMean),
    cellDiagonalTransitionErrorP95: formatNum(metrics.cellDiagonalTransitionErrorP95),
    cellDiagonalTransitionErrorP99: formatNum(metrics.cellDiagonalTransitionErrorP99),
    cellDiagonalTransitionDirectionErrorP95Max: formatNum(
      metrics.cellDiagonalTransitionDirectionErrorP95Max,
    ),
    cellDiagonalTransitionDirectionErrorP99Max: formatNum(
      metrics.cellDiagonalTransitionDirectionErrorP99Max,
    ),
    cellDiagonalTransitionDirectionRetentionMin: formatNum(
      metrics.cellDiagonalTransitionDirectionRetentionMin,
    ),
    cellDiagonalTransitionDirectionSpuriousRatioMax: formatNum(
      metrics.cellDiagonalTransitionDirectionSpuriousRatioMax,
    ),
    cellDiagonalTransitionDownRightRetention: formatNum(
      metrics.cellDiagonalTransitionDownRightRetention,
    ),
    cellDiagonalTransitionDownLeftRetention: formatNum(
      metrics.cellDiagonalTransitionDownLeftRetention,
    ),
    cellDiagonalTransitionDownRightSpuriousRatio: formatNum(
      metrics.cellDiagonalTransitionDownRightSpuriousRatio,
    ),
    cellDiagonalTransitionDownLeftSpuriousRatio: formatNum(
      metrics.cellDiagonalTransitionDownLeftSpuriousRatio,
    ),
    cellTransitionAxisRetentionMin: formatNum(metrics.cellTransitionAxisRetentionMin),
    cellTransitionAxisSpuriousRatioMax: formatNum(metrics.cellTransitionAxisSpuriousRatioMax),
    cellTransitionXRetention: formatNum(metrics.cellTransitionXRetention),
    cellTransitionYRetention: formatNum(metrics.cellTransitionYRetention),
    cellTransitionXSpuriousRatio: formatNum(metrics.cellTransitionXSpuriousRatio),
    cellTransitionYSpuriousRatio: formatNum(metrics.cellTransitionYSpuriousRatio),
    cellTransitionXErrorP95: formatNum(metrics.cellTransitionXErrorP95),
    cellTransitionYErrorP95: formatNum(metrics.cellTransitionYErrorP95),
    cellTransitionXErrorP99: formatNum(metrics.cellTransitionXErrorP99),
    cellTransitionYErrorP99: formatNum(metrics.cellTransitionYErrorP99),
    sourceCellTransitionCount: metrics.sourceCellTransitionCount,
    sourceCellTransitionXCount: metrics.sourceCellTransitionXCount,
    sourceCellTransitionYCount: metrics.sourceCellTransitionYCount,
    sourceCellDiagonalTransitionCount: metrics.sourceCellDiagonalTransitionCount,
    sourceCellDiagonalTransitionDownRightCount: metrics.sourceCellDiagonalTransitionDownRightCount,
    sourceCellDiagonalTransitionDownLeftCount: metrics.sourceCellDiagonalTransitionDownLeftCount,
    outputCellTransitionCount: metrics.outputCellTransitionCount,
    outputCellTransitionXCount: metrics.outputCellTransitionXCount,
    outputCellTransitionYCount: metrics.outputCellTransitionYCount,
    outputCellDiagonalTransitionCount: metrics.outputCellDiagonalTransitionCount,
    outputCellDiagonalTransitionDownRightCount: metrics.outputCellDiagonalTransitionDownRightCount,
    outputCellDiagonalTransitionDownLeftCount: metrics.outputCellDiagonalTransitionDownLeftCount,
    cellMae: formatNum(metrics.cellMae),
    cellStdDev: formatNum(uniformity.cellStdDev),
    outputCellMae: formatNum(metrics.outputCellMae),
    outputAlphaCellMae: formatNum(metrics.outputAlphaCellMae),
    preservationMae: formatNum(metrics.preservationMae),
    preservationP95: formatNum(metrics.preservationP95),
    tilePreservationMaxMae: formatNum(metrics.tilePreservationMaxMae),
    tilePreservationP95Mae: formatNum(metrics.tilePreservationP95Mae),
    alphaMae: formatNum(metrics.alphaMae),
    alphaP95: formatNum(metrics.alphaP95),
    alphaMax: formatNum(metrics.alphaMax),
    alphaTileMaxMae: formatNum(metrics.alphaTileMaxMae),
    alphaTileP95Mae: formatNum(metrics.alphaTileP95Mae),
    alphaCoverageRatio: formatNum(metrics.alphaCoverageRatio),
    alphaMaskIou: formatNum(metrics.alphaMaskIou),
    alphaBBoxDriftPx: metrics.alphaBBoxDriftPx,
    alphaBBoxDriftRatio: formatNum(metrics.alphaBBoxDriftRatio),
    alphaComponentCount: metrics.alphaComponentCount,
    outputAlphaComponentCount: metrics.outputAlphaComponentCount,
    alphaComponentCountDrift: metrics.alphaComponentCountDrift,
    alphaComponentAreaDrift: metrics.alphaComponentAreaDrift,
    alphaComponentBBoxDrift: metrics.alphaComponentBBoxDrift,
    alphaComponentPerimeterDrift: metrics.alphaComponentPerimeterDrift,
    alphaComponentPositionDrift: formatNum(metrics.alphaComponentPositionDrift),
    alphaHoleCount: metrics.alphaHoleCount,
    outputAlphaHoleCount: metrics.outputAlphaHoleCount,
    alphaHoleCountDrift: metrics.alphaHoleCountDrift,
    alphaSmallComponentCount: metrics.alphaSmallComponentCount,
    outputAlphaSmallComponentCount: metrics.outputAlphaSmallComponentCount,
    alphaSmallComponentCountDrift: metrics.alphaSmallComponentCountDrift,
    alphaSemitransparentPixelCount: metrics.alphaSemitransparentPixelCount,
    outputAlphaSemitransparentPixelCount: metrics.outputAlphaSemitransparentPixelCount,
    alphaSemitransparentRetention: formatNum(metrics.alphaSemitransparentRetention),
    alphaSemitransparentSpuriousRatio: formatNum(metrics.alphaSemitransparentSpuriousRatio),
    alphaSemitransparentValueMae: formatNum(metrics.alphaSemitransparentValueMae),
    alphaSemitransparentValueP95: formatNum(metrics.alphaSemitransparentValueP95),
    alphaEdgeCount: metrics.alphaEdgeCount,
    outputAlphaEdgeCount: metrics.outputAlphaEdgeCount,
    alphaEdgeRecall: formatNum(metrics.alphaEdgeRecall),
    alphaEdgeSpuriousRatio: formatNum(metrics.alphaEdgeSpuriousRatio),
    alphaEdgeJaccard: formatNum(metrics.alphaEdgeJaccard),
    inputChromaMean: formatNum(metrics.inputChromaMean),
    outputChromaMean: formatNum(metrics.outputChromaMean),
    chromaRatio: formatNum(metrics.chromaRatio),
    lowPaletteCoverageDrift: formatNum(metrics.lowPaletteCoverageDrift),
    lowPaletteCoverageRetention: formatNum(metrics.lowPaletteCoverageRetention),
    lowPaletteTileCoverageDriftMax: formatNum(metrics.lowPaletteTileCoverageDriftMax),
    lowPaletteTileCoverageRetentionMin: formatNum(metrics.lowPaletteTileCoverageRetentionMin),
    lowPaletteTileCoverageTileCount: metrics.lowPaletteTileCoverageTileCount,
    lowPaletteCoverageEligible: metrics.lowPaletteCoverageEligible,
    hueErrorMean: formatNum(metrics.hueErrorMean),
    hueErrorP95: formatNum(metrics.hueErrorP95),
    hueSampleCount: metrics.hueSampleCount,
    contrastRatio: formatNum(metrics.contrastRatio),
    lineEdgeRatio: formatNum(metrics.lineEdgeRatio),
    sourceEdgeDirectionCount: metrics.sourceEdgeDirectionCount,
    outputEdgeDirectionCount: metrics.outputEdgeDirectionCount,
    edgeDirectionDrift: formatNum(metrics.edgeDirectionDrift),
    edgeRecall: formatNum(metrics.edgeRecall),
    edgeSpuriousRatio: formatNum(metrics.edgeSpuriousRatio),
    edgeJaccard: formatNum(metrics.edgeJaccard),
    sourceEdgeTileCount: metrics.sourceEdgeTileCount,
    outputEdgeTileCount: metrics.outputEdgeTileCount,
    edgeTileRecallMin: formatNum(metrics.edgeTileRecallMin),
    edgeTileSpuriousMax: formatNum(metrics.edgeTileSpuriousMax),
    repeatGridGap: metrics.repeatGridGap,
    repeatVisualMae: formatNum(metrics.repeatVisualMae),
    repeatVisualP95: formatNum(metrics.repeatVisualP95),
    repeatVisualAlphaMae: formatNum(metrics.repeatVisualAlphaMae),
    repeatVisualAlphaP95: formatNum(metrics.repeatVisualAlphaP95),
    stabilityDepthGap: metrics.stabilityDepthGap,
    determinismGridGap: metrics.determinismGridGap,
    determinismVisualMae: formatNum(metrics.determinismVisualMae),
    determinismVisualP95: formatNum(metrics.determinismVisualP95),
    determinismVisualAlphaMae: formatNum(metrics.determinismVisualAlphaMae),
    determinismVisualAlphaP95: formatNum(metrics.determinismVisualAlphaP95),
    expectedGridGap: metrics.expectedGridGap,
    inputColorCount: uniqueColorCount(input),
    inputRgbColorCount: metrics.inputRgbColorCount,
    inputBucketColorCount: metrics.inputBucketColorCount,
    inputColorDominance: formatNum(metrics.inputColorDominance),
    outputColorCount: uniqueColorCount(resized.result),
    outputRgbColorCount: metrics.outputRgbColorCount,
    outputPaletteColorCount: metrics.outputPaletteColorCount,
    outputPaletteUtilization: formatNum(metrics.outputPaletteUtilization),
    paletteUtilizationGap: metrics.paletteUtilizationGap,
    paletteUtilizationTarget: metrics.paletteUtilizationTarget,
    outputColorDominance: formatNum(metrics.outputColorDominance),
    paletteDominanceDelta: formatNum(metrics.paletteDominanceDelta),
    outputRgbPaletteOverage: metrics.outputRgbPaletteOverage,
    lowPaletteRetention: formatNum(metrics.lowPaletteRetention),
    lowPaletteGrowth: formatNum(metrics.lowPaletteGrowth),
    snapOriginalMs: formatNum(original.durationMs),
    snapResizedMs: formatNum(resized.durationMs),
    status: classification.status,
    issues: classification.issues,
    issueSummary: classification.issues.map((issue) => issue.code).join(', ') || 'none',
    objective: formatNum(objective(metrics)),
  }
}

async function buildMetrics(input, expected, snapshots, colorVariety) {
  const {
    deterministic,
    deterministicOriginal,
    original,
    repeat,
    repeatAgain,
    repeatOriginal,
    resized,
  } = snapshots
  const cols = resized.result.width
  const rows = resized.result.height
  const targetAspect = expected ? expected.cols / expected.rows : input.width / input.height
  const fullGradient = meanAxisGradient(input)
  const boundary = gridBoundarySignals(input, cols, rows)
  const phase = gridPhaseSignals(input, cols, rows)
  const uniformity = cellUniformityMetrics(input, cols, rows)
  const dominance = cellColorDominanceMetrics(input, cols, rows)
  const colorError = cellColorErrorMetrics(input, resized.result)
  const transitions = cellTransitionMetrics(input, resized.result)
  const outputUniformity = cellUniformityMetrics(original.result, cols, rows)
  const preserve = await preservationStats(input, original.result, {
    alphaMask: true,
    edgeOverlap: true,
  })
  const repeatPreserve = await preservationStats(original.result, repeatOriginal)
  const deterministicPreserve = await preservationStats(original.result, deterministicOriginal)
  const inputRgbColorCount = uniqueRgbColorCount(input)
  const outputRgbColorCount = uniqueRgbColorCount(resized.result)
  const lowPaletteCoverageEligible =
    inputRgbColorCount > 0 && inputRgbColorCount <= colorVariety + 1
  const exactLowPaletteCellColorEligible =
    lowPaletteCoverageEligible && dominance.mean >= QUALITY_RULES.minExactLowPaletteCellDominance
  const colorComponents = exactLowPaletteCellColorEligible
    ? cellColorComponentMetrics(input, resized.result)
    : {
        cellColorComponentCountDrift: 0,
        cellColorAdjacencyDrift: 0,
        cellColorColumnProjectionDrift: 0,
        cellColorComponentAreaDrift: 0,
        cellColorComponentBBoxDrift: 0,
        cellColorComponentHoleCountDrift: 0,
        cellColorComponentPerimeterDrift: 0,
        cellColorComponentPositionDrift: 0,
        cellColorBoundaryPairDrift: 0,
        cellColorBoundaryHorizontalRunDrift: 0,
        cellColorBoundaryVerticalRunDrift: 0,
        cellColorDiagonalAdjacencyDrift: 0,
        cellColorDiagonalBoundaryPairDrift: 0,
        cellColorHorizontalRunDrift: 0,
        cellColorNeighborMaskDrift: 0,
        cellColorQuadPatternDrift: 0,
        cellColorRowProjectionDrift: 0,
        cellColorVerticalRunDrift: 0,
        cellColorWindowPatternDrift: 0,
        outputCellColorAdjacencyCount: 0,
        outputCellColorBoundaryHorizontalRunCount: 0,
        outputCellColorBoundaryPairCount: 0,
        outputCellColorBoundaryVerticalRunCount: 0,
        outputCellColorColumnProjectionCount: 0,
        outputCellColorComponentCount: 0,
        outputCellColorComponentHoleCount: 0,
        outputCellColorDiagonalAdjacencyCount: 0,
        outputCellColorDiagonalBoundaryPairCount: 0,
        outputCellColorDistinctQuadPatternCount: 0,
        outputCellColorDistinctWindowPatternCount: 0,
        outputCellColorHorizontalRunCount: 0,
        outputCellColorNeighborMaskCount: 0,
        outputCellColorQuadPatternCount: 0,
        outputCellColorRowProjectionCount: 0,
        outputCellColorVerticalRunCount: 0,
        outputCellColorWindowPatternCount: 0,
        outputSmallCellColorComponentCount: 0,
        smallCellColorComponentCountDrift: 0,
        sourceCellColorAdjacencyCount: 0,
        sourceCellColorBoundaryHorizontalRunCount: 0,
        sourceCellColorBoundaryPairCount: 0,
        sourceCellColorBoundaryVerticalRunCount: 0,
        sourceCellColorColumnProjectionCount: 0,
        sourceCellColorComponentCount: 0,
        sourceCellColorComponentHoleCount: 0,
        sourceCellColorDiagonalAdjacencyCount: 0,
        sourceCellColorDiagonalBoundaryPairCount: 0,
        sourceCellColorDistinctQuadPatternCount: 0,
        sourceCellColorDistinctWindowPatternCount: 0,
        sourceCellColorHorizontalRunCount: 0,
        sourceCellColorNeighborMaskCount: 0,
        sourceCellColorQuadPatternCount: 0,
        sourceCellColorRowProjectionCount: 0,
        sourceCellColorVerticalRunCount: 0,
        sourceCellColorWindowPatternCount: 0,
        sourceSmallCellColorComponentCount: 0,
      }
  const paletteDominance = paletteDominanceMetrics(input, resized.result)
  const paletteUtilization = paletteUtilizationMetrics(input, resized.result, colorVariety)

  return {
    metrics: {
      cols,
      rows,
      aspectError: Math.abs(cols / rows / targetAspect - 1),
      shortAxisCells: Math.min(cols, rows),
      longAxisCells: Math.max(cols, rows),
      sourceCellSize: Math.min(input.width / cols, input.height / rows),
      repeatGridGap: gridGap(repeat, resized.result),
      stabilityDepthGap: gridGap(repeatAgain, repeat),
      determinismGridGap: gridGap(deterministic, resized.result),
      repeatVisualMae: repeatPreserve.mae,
      repeatVisualP95: repeatPreserve.p95,
      repeatVisualAlphaMae: repeatPreserve.alphaMae,
      repeatVisualAlphaP95: repeatPreserve.alphaP95,
      determinismVisualMae: deterministicPreserve.mae,
      determinismVisualP95: deterministicPreserve.p95,
      determinismVisualAlphaMae: deterministicPreserve.alphaMae,
      determinismVisualAlphaP95: deterministicPreserve.alphaP95,
      expectedGridGap: expected
        ? Math.abs(cols - expected.cols) + Math.abs(rows - expected.rows)
        : 0,
      edgeAlignment: boundary.mean / (fullGradient + 1e-9),
      axisEdgeAlignmentMin: boundary.min / (fullGradient + 1e-9),
      phaseAlignment: phase.mean,
      axisPhaseAlignmentMin: phase.min,
      cellColorDominance: dominance.mean,
      cellColorDominanceP05: dominance.p05,
      cellColorDominanceMin: dominance.min,
      exactLowPaletteCellColorEligible,
      cellColorAdjacencyDrift: colorComponents.cellColorAdjacencyDrift,
      cellColorDiagonalAdjacencyDrift: colorComponents.cellColorDiagonalAdjacencyDrift,
      sourceCellColorAdjacencyCount: colorComponents.sourceCellColorAdjacencyCount,
      sourceCellColorDiagonalAdjacencyCount: colorComponents.sourceCellColorDiagonalAdjacencyCount,
      outputCellColorAdjacencyCount: colorComponents.outputCellColorAdjacencyCount,
      outputCellColorDiagonalAdjacencyCount: colorComponents.outputCellColorDiagonalAdjacencyCount,
      cellColorBoundaryPairDrift: colorComponents.cellColorBoundaryPairDrift,
      cellColorDiagonalBoundaryPairDrift: colorComponents.cellColorDiagonalBoundaryPairDrift,
      sourceCellColorBoundaryPairCount: colorComponents.sourceCellColorBoundaryPairCount,
      sourceCellColorDiagonalBoundaryPairCount:
        colorComponents.sourceCellColorDiagonalBoundaryPairCount,
      outputCellColorBoundaryPairCount: colorComponents.outputCellColorBoundaryPairCount,
      outputCellColorDiagonalBoundaryPairCount:
        colorComponents.outputCellColorDiagonalBoundaryPairCount,
      cellColorBoundaryHorizontalRunDrift: colorComponents.cellColorBoundaryHorizontalRunDrift,
      cellColorBoundaryVerticalRunDrift: colorComponents.cellColorBoundaryVerticalRunDrift,
      sourceCellColorBoundaryHorizontalRunCount:
        colorComponents.sourceCellColorBoundaryHorizontalRunCount,
      sourceCellColorBoundaryVerticalRunCount:
        colorComponents.sourceCellColorBoundaryVerticalRunCount,
      outputCellColorBoundaryHorizontalRunCount:
        colorComponents.outputCellColorBoundaryHorizontalRunCount,
      outputCellColorBoundaryVerticalRunCount:
        colorComponents.outputCellColorBoundaryVerticalRunCount,
      cellColorQuadPatternDrift: colorComponents.cellColorQuadPatternDrift,
      sourceCellColorQuadPatternCount: colorComponents.sourceCellColorQuadPatternCount,
      outputCellColorQuadPatternCount: colorComponents.outputCellColorQuadPatternCount,
      sourceCellColorDistinctQuadPatternCount:
        colorComponents.sourceCellColorDistinctQuadPatternCount,
      outputCellColorDistinctQuadPatternCount:
        colorComponents.outputCellColorDistinctQuadPatternCount,
      cellColorWindowPatternDrift: colorComponents.cellColorWindowPatternDrift,
      sourceCellColorWindowPatternCount: colorComponents.sourceCellColorWindowPatternCount,
      outputCellColorWindowPatternCount: colorComponents.outputCellColorWindowPatternCount,
      sourceCellColorDistinctWindowPatternCount:
        colorComponents.sourceCellColorDistinctWindowPatternCount,
      outputCellColorDistinctWindowPatternCount:
        colorComponents.outputCellColorDistinctWindowPatternCount,
      cellColorNeighborMaskDrift: colorComponents.cellColorNeighborMaskDrift,
      sourceCellColorNeighborMaskCount: colorComponents.sourceCellColorNeighborMaskCount,
      outputCellColorNeighborMaskCount: colorComponents.outputCellColorNeighborMaskCount,
      cellColorHorizontalRunDrift: colorComponents.cellColorHorizontalRunDrift,
      cellColorVerticalRunDrift: colorComponents.cellColorVerticalRunDrift,
      sourceCellColorHorizontalRunCount: colorComponents.sourceCellColorHorizontalRunCount,
      sourceCellColorVerticalRunCount: colorComponents.sourceCellColorVerticalRunCount,
      outputCellColorHorizontalRunCount: colorComponents.outputCellColorHorizontalRunCount,
      outputCellColorVerticalRunCount: colorComponents.outputCellColorVerticalRunCount,
      cellColorRowProjectionDrift: colorComponents.cellColorRowProjectionDrift,
      cellColorColumnProjectionDrift: colorComponents.cellColorColumnProjectionDrift,
      sourceCellColorRowProjectionCount: colorComponents.sourceCellColorRowProjectionCount,
      sourceCellColorColumnProjectionCount: colorComponents.sourceCellColorColumnProjectionCount,
      outputCellColorRowProjectionCount: colorComponents.outputCellColorRowProjectionCount,
      outputCellColorColumnProjectionCount: colorComponents.outputCellColorColumnProjectionCount,
      cellColorComponentCountDrift: colorComponents.cellColorComponentCountDrift,
      cellColorComponentAreaDrift: colorComponents.cellColorComponentAreaDrift,
      cellColorComponentBBoxDrift: colorComponents.cellColorComponentBBoxDrift,
      cellColorComponentHoleCountDrift: colorComponents.cellColorComponentHoleCountDrift,
      cellColorComponentPerimeterDrift: colorComponents.cellColorComponentPerimeterDrift,
      cellColorComponentPositionDrift: colorComponents.cellColorComponentPositionDrift,
      smallCellColorComponentCountDrift: colorComponents.smallCellColorComponentCountDrift,
      sourceCellColorComponentCount: colorComponents.sourceCellColorComponentCount,
      sourceCellColorComponentHoleCount: colorComponents.sourceCellColorComponentHoleCount,
      sourceSmallCellColorComponentCount: colorComponents.sourceSmallCellColorComponentCount,
      outputCellColorComponentCount: colorComponents.outputCellColorComponentCount,
      outputCellColorComponentHoleCount: colorComponents.outputCellColorComponentHoleCount,
      outputSmallCellColorComponentCount: colorComponents.outputSmallCellColorComponentCount,
      cellAlphaErrorMean: colorError.cellAlphaErrorMean,
      cellAlphaErrorP95: colorError.cellAlphaErrorP95,
      cellAlphaErrorMax: colorError.cellAlphaErrorMax,
      cellColorErrorMean: colorError.cellColorErrorMean,
      cellColorErrorP95: colorError.cellColorErrorP95,
      cellColorErrorP99: colorError.cellColorErrorP99,
      cellColorErrorMax: colorError.cellColorErrorMax,
      cellTransitionRetention: transitions.cellTransitionRetention,
      cellTransitionSpuriousRatio: transitions.cellTransitionSpuriousRatio,
      cellTransitionErrorMean: transitions.cellTransitionErrorMean,
      cellTransitionErrorP95: transitions.cellTransitionErrorP95,
      cellTransitionErrorP99: transitions.cellTransitionErrorP99,
      cellTransitionAxisErrorP95Max: transitions.cellTransitionAxisErrorP95Max,
      cellTransitionAxisErrorP99Max: transitions.cellTransitionAxisErrorP99Max,
      cellDiagonalTransitionRetention: transitions.cellDiagonalTransitionRetention,
      cellDiagonalTransitionSpuriousRatio: transitions.cellDiagonalTransitionSpuriousRatio,
      cellDiagonalTransitionErrorMean: transitions.cellDiagonalTransitionErrorMean,
      cellDiagonalTransitionErrorP95: transitions.cellDiagonalTransitionErrorP95,
      cellDiagonalTransitionErrorP99: transitions.cellDiagonalTransitionErrorP99,
      cellDiagonalTransitionDirectionErrorP95Max:
        transitions.cellDiagonalTransitionDirectionErrorP95Max,
      cellDiagonalTransitionDirectionErrorP99Max:
        transitions.cellDiagonalTransitionDirectionErrorP99Max,
      cellDiagonalTransitionDirectionRetentionMin:
        transitions.cellDiagonalTransitionDirectionRetentionMin,
      cellDiagonalTransitionDirectionSpuriousRatioMax:
        transitions.cellDiagonalTransitionDirectionSpuriousRatioMax,
      cellDiagonalTransitionDownRightRetention:
        transitions.cellDiagonalTransitionDownRightRetention,
      cellDiagonalTransitionDownLeftRetention: transitions.cellDiagonalTransitionDownLeftRetention,
      cellDiagonalTransitionDownRightSpuriousRatio:
        transitions.cellDiagonalTransitionDownRightSpuriousRatio,
      cellDiagonalTransitionDownLeftSpuriousRatio:
        transitions.cellDiagonalTransitionDownLeftSpuriousRatio,
      cellTransitionAxisRetentionMin: transitions.cellTransitionAxisRetentionMin,
      cellTransitionAxisSpuriousRatioMax: transitions.cellTransitionAxisSpuriousRatioMax,
      cellTransitionXRetention: transitions.cellTransitionXRetention,
      cellTransitionYRetention: transitions.cellTransitionYRetention,
      cellTransitionXSpuriousRatio: transitions.cellTransitionXSpuriousRatio,
      cellTransitionYSpuriousRatio: transitions.cellTransitionYSpuriousRatio,
      cellTransitionXErrorP95: transitions.cellTransitionXErrorP95,
      cellTransitionYErrorP95: transitions.cellTransitionYErrorP95,
      cellTransitionXErrorP99: transitions.cellTransitionXErrorP99,
      cellTransitionYErrorP99: transitions.cellTransitionYErrorP99,
      sourceCellTransitionCount: transitions.sourceCellTransitionCount,
      sourceCellTransitionXCount: transitions.sourceCellTransitionXCount,
      sourceCellTransitionYCount: transitions.sourceCellTransitionYCount,
      sourceCellDiagonalTransitionCount: transitions.sourceCellDiagonalTransitionCount,
      sourceCellDiagonalTransitionDownRightCount:
        transitions.sourceCellDiagonalTransitionDownRightCount,
      sourceCellDiagonalTransitionDownLeftCount:
        transitions.sourceCellDiagonalTransitionDownLeftCount,
      outputCellTransitionCount: transitions.outputCellTransitionCount,
      outputCellTransitionXCount: transitions.outputCellTransitionXCount,
      outputCellTransitionYCount: transitions.outputCellTransitionYCount,
      outputCellDiagonalTransitionCount: transitions.outputCellDiagonalTransitionCount,
      outputCellDiagonalTransitionDownRightCount:
        transitions.outputCellDiagonalTransitionDownRightCount,
      outputCellDiagonalTransitionDownLeftCount:
        transitions.outputCellDiagonalTransitionDownLeftCount,
      cellMae: uniformity.cellMae,
      outputCellMae: outputUniformity.cellMae,
      outputAlphaCellMae: outputUniformity.alphaCellMae,
      preservationMae: preserve.mae,
      preservationP95: preserve.p95,
      tilePreservationMaxMae: preserve.tileMaxMae,
      tilePreservationP95Mae: preserve.tileP95Mae,
      alphaMae: preserve.alphaMae,
      alphaP95: preserve.alphaP95,
      alphaMax: preserve.alphaMax,
      alphaTileMaxMae: preserve.alphaTileMaxMae,
      alphaTileP95Mae: preserve.alphaTileP95Mae,
      alphaCoverageRatio: preserve.alphaCoverageRatio,
      alphaMaskIou: preserve.alphaMaskIou,
      alphaBBoxDriftPx: preserve.alphaBBoxDriftPx,
      alphaBBoxDriftRatio: preserve.alphaBBoxDriftRatio,
      alphaComponentCount: preserve.alphaComponentCount,
      outputAlphaComponentCount: preserve.outputAlphaComponentCount,
      alphaComponentCountDrift: preserve.alphaComponentCountDrift,
      alphaComponentAreaDrift: preserve.alphaComponentAreaDrift,
      alphaComponentBBoxDrift: preserve.alphaComponentBBoxDrift,
      alphaComponentPerimeterDrift: preserve.alphaComponentPerimeterDrift,
      alphaComponentPositionDrift: preserve.alphaComponentPositionDrift,
      alphaHoleCount: preserve.alphaHoleCount,
      outputAlphaHoleCount: preserve.outputAlphaHoleCount,
      alphaHoleCountDrift: preserve.alphaHoleCountDrift,
      alphaSmallComponentCount: preserve.alphaSmallComponentCount,
      outputAlphaSmallComponentCount: preserve.outputAlphaSmallComponentCount,
      alphaSmallComponentCountDrift: preserve.alphaSmallComponentCountDrift,
      alphaSemitransparentPixelCount: preserve.alphaSemitransparentPixelCount,
      outputAlphaSemitransparentPixelCount: preserve.outputAlphaSemitransparentPixelCount,
      alphaSemitransparentRetention: preserve.alphaSemitransparentRetention,
      alphaSemitransparentSpuriousRatio: preserve.alphaSemitransparentSpuriousRatio,
      alphaSemitransparentValueMae: preserve.alphaSemitransparentValueMae,
      alphaSemitransparentValueP95: preserve.alphaSemitransparentValueP95,
      alphaEdgeCount: preserve.alphaEdgeCount,
      outputAlphaEdgeCount: preserve.outputAlphaEdgeCount,
      alphaEdgeRecall: preserve.alphaEdgeRecall,
      alphaEdgeSpuriousRatio: preserve.alphaEdgeSpuriousRatio,
      alphaEdgeJaccard: preserve.alphaEdgeJaccard,
      inputChromaMean: preserve.inputChromaMean,
      outputChromaMean: preserve.outputChromaMean,
      chromaRatio: preserve.chromaRatio,
      lowPaletteCoverageDrift: lowPaletteCoverageEligible ? preserve.rgbCoverageDrift : 0,
      lowPaletteCoverageRetention: lowPaletteCoverageEligible ? preserve.rgbCoverageRetention : 1,
      lowPaletteTileCoverageDriftMax: lowPaletteCoverageEligible
        ? preserve.rgbTileCoverageDriftMax
        : 0,
      lowPaletteTileCoverageRetentionMin: lowPaletteCoverageEligible
        ? preserve.rgbTileCoverageRetentionMin
        : 1,
      lowPaletteTileCoverageTileCount: lowPaletteCoverageEligible
        ? preserve.rgbTileCoverageTileCount
        : 0,
      lowPaletteCoverageEligible,
      hueErrorMean: preserve.hueErrorMean,
      hueErrorP95: preserve.hueErrorP95,
      hueSampleCount: preserve.hueSampleCount,
      contrastRatio: preserve.contrastRatio,
      lineEdgeRatio: preserve.lineEdgeRatio,
      sourceEdgeDirectionCount: preserve.sourceEdgeDirectionCount,
      outputEdgeDirectionCount: preserve.outputEdgeDirectionCount,
      edgeDirectionDrift: preserve.edgeDirectionDrift,
      edgeRecall: preserve.edgeRecall,
      edgeSpuriousRatio: preserve.edgeSpuriousRatio,
      edgeJaccard: preserve.edgeJaccard,
      sourceEdgeTileCount: preserve.sourceEdgeTileCount,
      outputEdgeTileCount: preserve.outputEdgeTileCount,
      edgeTileRecallMin: preserve.edgeTileRecallMin,
      edgeTileSpuriousMax: preserve.edgeTileSpuriousMax,
      squareCellError: Math.abs(original.result.width / cols / (original.result.height / rows) - 1),
      outputCellIntegerError: outputCellIntegerError(original.result, cols, rows),
      outputCoverage: outputCoverage(input, original.result),
      outputAreaCoverage: outputAreaCoverage(input, original.result),
      outputExpansion: outputExpansion(input, original.result),
      outputRgbPaletteOverage: Math.max(0, outputRgbColorCount - (colorVariety + 1)),
      inputColorDominance: paletteDominance.inputColorDominance,
      outputColorDominance: paletteDominance.outputColorDominance,
      paletteDominanceDelta: paletteDominance.paletteDominanceDelta,
      inputBucketColorCount: paletteUtilization.inputBucketColorCount,
      outputPaletteColorCount: paletteUtilization.outputPaletteColorCount,
      outputPaletteUtilization: paletteUtilization.outputPaletteUtilization,
      paletteUtilizationGap: paletteUtilization.paletteUtilizationGap,
      paletteUtilizationTarget: paletteUtilization.paletteUtilizationTarget,
      inputRgbColorCount,
      outputRgbColorCount,
      lowPaletteRetention: lowPaletteRetention(
        inputRgbColorCount,
        outputRgbColorCount,
        colorVariety,
      ),
      lowPaletteGrowth: lowPaletteGrowth(inputRgbColorCount, outputRgbColorCount, colorVariety),
    },
    uniformity,
  }
}

async function snapVariants(input, colorVariety) {
  const original = await timedSnap(input, { colorVariety, output: 'original' })
  const resized = await timedSnap(input, { colorVariety, output: 'resized' })
  const deterministic = snap(input, { colorVariety, output: 'resized' })
  const deterministicOriginal = snap(input, { colorVariety, output: 'original' })
  const repeat = snap(original.result, { colorVariety, output: 'resized' })
  const repeatOriginal = snap(original.result, { colorVariety, output: 'original' })
  const repeatAgain = snap(repeatOriginal, { colorVariety, output: 'resized' })

  return {
    deterministic,
    deterministicOriginal,
    original,
    repeat,
    repeatAgain,
    repeatOriginal,
    resized,
  }
}

export async function evaluateFile(file, dataset, options, expectations) {
  const input = await loadImage(file)
  const name = path.basename(file)
  const expected = expectations.get(`${dataset.name}/${name}`) ?? expectations.get(name)
  const snapshots = await snapVariants(input, options.colorVariety)
  const { metrics, uniformity } = await buildMetrics(
    input,
    expected,
    snapshots,
    options.colorVariety,
  )

  if (options.writeImages) {
    const datasetOutDir = path.join(options.outDir, dataset.name)
    await fs.mkdir(datasetOutDir, { recursive: true })
    await writePng(
      path.join(datasetOutDir, `${path.parse(name).name}.snap.png`),
      snapshots.original.result,
    )
    await writePng(
      path.join(datasetOutDir, `${path.parse(name).name}.grid.png`),
      snapshots.resized.result,
    )
  }

  return toItem({
    dataset,
    expected,
    input,
    metrics,
    name,
    original: snapshots.original,
    resized: snapshots.resized,
    uniformity,
  })
}
