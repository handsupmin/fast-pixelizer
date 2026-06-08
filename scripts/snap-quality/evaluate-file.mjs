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

function lowPaletteRetention(inputRgbColorCount, outputRgbColorCount, colorVariety) {
  return inputRgbColorCount > 0 && inputRgbColorCount <= colorVariety + 1
    ? outputRgbColorCount / inputRgbColorCount
    : 1
}

function outputCoverage(input, result) {
  return Math.min(result.width / input.width, result.height / input.height)
}

function toItem({ dataset, expected, input, metrics, name, original, resized, uniformity }) {
  const classification = classifyMetrics(metrics)
  return {
    dataset: dataset.name,
    file: name,
    input: `${input.width}x${input.height}`,
    output: `${original.result.width}x${original.result.height}`,
    outputCoverage: formatNum(metrics.outputCoverage),
    grid: `${metrics.cols}x${metrics.rows}`,
    expectedGrid: expected ? `${expected.cols}x${expected.rows}` : '',
    detectedResolution: original.result.detectedResolution,
    sourceCellSize: formatNum(metrics.sourceCellSize),
    squareCellError: formatNum(metrics.squareCellError),
    aspectError: formatNum(metrics.aspectError),
    edgeAlignment: formatNum(metrics.edgeAlignment),
    axisEdgeAlignmentMin: formatNum(metrics.axisEdgeAlignmentMin),
    phaseAlignment: formatNum(metrics.phaseAlignment),
    axisPhaseAlignmentMin: formatNum(metrics.axisPhaseAlignmentMin),
    cellColorDominance: formatNum(metrics.cellColorDominance),
    cellColorDominanceP05: formatNum(metrics.cellColorDominanceP05),
    exactLowPaletteCellColorEligible: metrics.exactLowPaletteCellColorEligible,
    cellColorComponentCountDrift: metrics.cellColorComponentCountDrift,
    cellColorComponentAreaDrift: metrics.cellColorComponentAreaDrift,
    cellColorComponentBBoxDrift: metrics.cellColorComponentBBoxDrift,
    cellColorComponentPositionDrift: formatNum(metrics.cellColorComponentPositionDrift),
    smallCellColorComponentCountDrift: metrics.smallCellColorComponentCountDrift,
    sourceCellColorComponentCount: metrics.sourceCellColorComponentCount,
    sourceSmallCellColorComponentCount: metrics.sourceSmallCellColorComponentCount,
    outputCellColorComponentCount: metrics.outputCellColorComponentCount,
    outputSmallCellColorComponentCount: metrics.outputSmallCellColorComponentCount,
    cellAlphaErrorMean: formatNum(metrics.cellAlphaErrorMean),
    cellAlphaErrorP95: formatNum(metrics.cellAlphaErrorP95),
    cellAlphaErrorMax: formatNum(metrics.cellAlphaErrorMax),
    cellColorErrorMean: formatNum(metrics.cellColorErrorMean),
    cellColorErrorP95: formatNum(metrics.cellColorErrorP95),
    cellColorErrorMax: formatNum(metrics.cellColorErrorMax),
    cellTransitionRetention: formatNum(metrics.cellTransitionRetention),
    cellTransitionSpuriousRatio: formatNum(metrics.cellTransitionSpuriousRatio),
    cellTransitionErrorMean: formatNum(metrics.cellTransitionErrorMean),
    cellTransitionAxisRetentionMin: formatNum(metrics.cellTransitionAxisRetentionMin),
    cellTransitionAxisSpuriousRatioMax: formatNum(metrics.cellTransitionAxisSpuriousRatioMax),
    cellTransitionXRetention: formatNum(metrics.cellTransitionXRetention),
    cellTransitionYRetention: formatNum(metrics.cellTransitionYRetention),
    cellTransitionXSpuriousRatio: formatNum(metrics.cellTransitionXSpuriousRatio),
    cellTransitionYSpuriousRatio: formatNum(metrics.cellTransitionYSpuriousRatio),
    sourceCellTransitionCount: metrics.sourceCellTransitionCount,
    sourceCellTransitionXCount: metrics.sourceCellTransitionXCount,
    sourceCellTransitionYCount: metrics.sourceCellTransitionYCount,
    outputCellTransitionCount: metrics.outputCellTransitionCount,
    outputCellTransitionXCount: metrics.outputCellTransitionXCount,
    outputCellTransitionYCount: metrics.outputCellTransitionYCount,
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
    alphaComponentPositionDrift: formatNum(metrics.alphaComponentPositionDrift),
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
    lowPaletteCoverageEligible: metrics.lowPaletteCoverageEligible,
    hueErrorMean: formatNum(metrics.hueErrorMean),
    hueErrorP95: formatNum(metrics.hueErrorP95),
    hueSampleCount: metrics.hueSampleCount,
    contrastRatio: formatNum(metrics.contrastRatio),
    lineEdgeRatio: formatNum(metrics.lineEdgeRatio),
    edgeRecall: formatNum(metrics.edgeRecall),
    edgeSpuriousRatio: formatNum(metrics.edgeSpuriousRatio),
    edgeJaccard: formatNum(metrics.edgeJaccard),
    repeatGridGap: metrics.repeatGridGap,
    repeatVisualMae: formatNum(metrics.repeatVisualMae),
    repeatVisualP95: formatNum(metrics.repeatVisualP95),
    stabilityDepthGap: metrics.stabilityDepthGap,
    determinismGridGap: metrics.determinismGridGap,
    determinismVisualMae: formatNum(metrics.determinismVisualMae),
    determinismVisualP95: formatNum(metrics.determinismVisualP95),
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
        cellColorComponentAreaDrift: 0,
        cellColorComponentBBoxDrift: 0,
        cellColorComponentPositionDrift: 0,
        outputCellColorComponentCount: 0,
        outputSmallCellColorComponentCount: 0,
        smallCellColorComponentCountDrift: 0,
        sourceCellColorComponentCount: 0,
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
      sourceCellSize: Math.min(input.width / cols, input.height / rows),
      repeatGridGap: gridGap(repeat, resized.result),
      stabilityDepthGap: gridGap(repeatAgain, repeat),
      determinismGridGap: gridGap(deterministic, resized.result),
      repeatVisualMae: repeatPreserve.mae,
      repeatVisualP95: repeatPreserve.p95,
      determinismVisualMae: deterministicPreserve.mae,
      determinismVisualP95: deterministicPreserve.p95,
      expectedGridGap: expected
        ? Math.abs(cols - expected.cols) + Math.abs(rows - expected.rows)
        : 0,
      edgeAlignment: boundary.mean / (fullGradient + 1e-9),
      axisEdgeAlignmentMin: boundary.min / (fullGradient + 1e-9),
      phaseAlignment: phase.mean,
      axisPhaseAlignmentMin: phase.min,
      cellColorDominance: dominance.mean,
      cellColorDominanceP05: dominance.p05,
      exactLowPaletteCellColorEligible,
      cellColorComponentCountDrift: colorComponents.cellColorComponentCountDrift,
      cellColorComponentAreaDrift: colorComponents.cellColorComponentAreaDrift,
      cellColorComponentBBoxDrift: colorComponents.cellColorComponentBBoxDrift,
      cellColorComponentPositionDrift: colorComponents.cellColorComponentPositionDrift,
      smallCellColorComponentCountDrift: colorComponents.smallCellColorComponentCountDrift,
      sourceCellColorComponentCount: colorComponents.sourceCellColorComponentCount,
      sourceSmallCellColorComponentCount: colorComponents.sourceSmallCellColorComponentCount,
      outputCellColorComponentCount: colorComponents.outputCellColorComponentCount,
      outputSmallCellColorComponentCount: colorComponents.outputSmallCellColorComponentCount,
      cellAlphaErrorMean: colorError.cellAlphaErrorMean,
      cellAlphaErrorP95: colorError.cellAlphaErrorP95,
      cellAlphaErrorMax: colorError.cellAlphaErrorMax,
      cellColorErrorMean: colorError.cellColorErrorMean,
      cellColorErrorP95: colorError.cellColorErrorP95,
      cellColorErrorMax: colorError.cellColorErrorMax,
      cellTransitionRetention: transitions.cellTransitionRetention,
      cellTransitionSpuriousRatio: transitions.cellTransitionSpuriousRatio,
      cellTransitionErrorMean: transitions.cellTransitionErrorMean,
      cellTransitionAxisRetentionMin: transitions.cellTransitionAxisRetentionMin,
      cellTransitionAxisSpuriousRatioMax: transitions.cellTransitionAxisSpuriousRatioMax,
      cellTransitionXRetention: transitions.cellTransitionXRetention,
      cellTransitionYRetention: transitions.cellTransitionYRetention,
      cellTransitionXSpuriousRatio: transitions.cellTransitionXSpuriousRatio,
      cellTransitionYSpuriousRatio: transitions.cellTransitionYSpuriousRatio,
      sourceCellTransitionCount: transitions.sourceCellTransitionCount,
      sourceCellTransitionXCount: transitions.sourceCellTransitionXCount,
      sourceCellTransitionYCount: transitions.sourceCellTransitionYCount,
      outputCellTransitionCount: transitions.outputCellTransitionCount,
      outputCellTransitionXCount: transitions.outputCellTransitionXCount,
      outputCellTransitionYCount: transitions.outputCellTransitionYCount,
      cellMae: uniformity.cellMae,
      outputCellMae: outputUniformity.cellMae,
      outputAlphaCellMae: outputUniformity.alphaCellMae,
      preservationMae: preserve.mae,
      preservationP95: preserve.p95,
      tilePreservationMaxMae: preserve.tileMaxMae,
      tilePreservationP95Mae: preserve.tileP95Mae,
      alphaMae: preserve.alphaMae,
      alphaP95: preserve.alphaP95,
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
      alphaComponentPositionDrift: preserve.alphaComponentPositionDrift,
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
      lowPaletteCoverageEligible,
      hueErrorMean: preserve.hueErrorMean,
      hueErrorP95: preserve.hueErrorP95,
      hueSampleCount: preserve.hueSampleCount,
      contrastRatio: preserve.contrastRatio,
      lineEdgeRatio: preserve.lineEdgeRatio,
      edgeRecall: preserve.edgeRecall,
      edgeSpuriousRatio: preserve.edgeSpuriousRatio,
      edgeJaccard: preserve.edgeJaccard,
      squareCellError: Math.abs(original.result.width / cols / (original.result.height / rows) - 1),
      outputCoverage: outputCoverage(input, original.result),
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
