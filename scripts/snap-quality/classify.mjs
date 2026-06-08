import { QUALITY_RULES } from './config.mjs'

export function formatNum(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : value
}

function repeatTolerance(cols, rows) {
  return Math.max(
    QUALITY_RULES.maxRepeatGridGapFloor,
    Math.round((cols + rows) * QUALITY_RULES.maxRepeatGridGapRate),
  )
}

function issue(severity, code, detail) {
  return { severity, code, detail }
}

export function classifyMetrics(metrics) {
  const issues = []
  if (metrics.expectedGridGap > QUALITY_RULES.maxExpectedGridGap) {
    issues.push(
      issue('fail', 'ground-truth-grid-miss', `expected grid gap ${metrics.expectedGridGap}`),
    )
  }
  if (metrics.aspectError > QUALITY_RULES.maxAspectError) {
    issues.push(
      issue('fail', 'aspect-drift', `grid aspect error ${formatNum(metrics.aspectError)}`),
    )
  }
  if (metrics.shortAxisCells > QUALITY_RULES.maxShortAxisCells) {
    issues.push(issue('fail', 'micro-grid', `short axis cells ${metrics.shortAxisCells}`))
  }
  if (metrics.sourceCellSize < QUALITY_RULES.minSourceCellSize) {
    issues.push(
      issue('fail', 'subpixel-texture', `source cell size ${formatNum(metrics.sourceCellSize)}px`),
    )
  }
  if (metrics.repeatGridGap > repeatTolerance(metrics.cols, metrics.rows)) {
    issues.push(issue('fail', 'unstable-repeat', `repeat grid gap ${metrics.repeatGridGap}`))
  }
  if (
    metrics.repeatVisualMae > QUALITY_RULES.maxRepeatVisualMae ||
    metrics.repeatVisualP95 > QUALITY_RULES.maxRepeatVisualP95
  ) {
    issues.push(
      issue(
        'fail',
        'unstable-repeat-visuals',
        `repeat visual MAE ${formatNum(metrics.repeatVisualMae)}, p95 ${formatNum(
          metrics.repeatVisualP95,
        )}`,
      ),
    )
  }
  if (metrics.stabilityDepthGap > 0) {
    issues.push(
      issue('fail', 'unstable-depth', `second repeat grid gap ${metrics.stabilityDepthGap}`),
    )
  }
  if (metrics.determinismGridGap > 0) {
    issues.push(
      issue('fail', 'non-deterministic-grid', `same input grid gap ${metrics.determinismGridGap}`),
    )
  }
  if (
    metrics.determinismVisualMae > QUALITY_RULES.maxDeterminismVisualMae ||
    metrics.determinismVisualP95 > QUALITY_RULES.maxDeterminismVisualP95
  ) {
    issues.push(
      issue(
        'fail',
        'non-deterministic-visuals',
        `same input visual MAE ${formatNum(metrics.determinismVisualMae)}, p95 ${formatNum(
          metrics.determinismVisualP95,
        )}`,
      ),
    )
  }
  if (metrics.outputCellMae > QUALITY_RULES.maxOutputCellMae) {
    issues.push(
      issue(
        'fail',
        'non-uniform-output-cells',
        `output cell MAE ${formatNum(metrics.outputCellMae)}`,
      ),
    )
  }
  if (metrics.outputRgbPaletteOverage > QUALITY_RULES.maxOutputRgbPaletteOverage) {
    issues.push(
      issue(
        'fail',
        'palette-budget-exceeded',
        `RGB palette over budget by ${metrics.outputRgbPaletteOverage}`,
      ),
    )
  }
  if (
    metrics.outputColorDominance > QUALITY_RULES.maxOutputColorDominance &&
    metrics.paletteDominanceDelta > QUALITY_RULES.maxPaletteDominanceDelta
  ) {
    issues.push(
      issue(
        'review',
        'palette-dominance-collapse',
        `output dominant color ${formatNum(metrics.outputColorDominance)}, delta ${formatNum(
          metrics.paletteDominanceDelta,
        )}`,
      ),
    )
  }
  if (
    metrics.paletteUtilizationTarget >= QUALITY_RULES.minPaletteUtilizationTarget &&
    metrics.outputPaletteUtilization < QUALITY_RULES.minOutputPaletteUtilization
  ) {
    issues.push(
      issue(
        'review',
        'palette-underused',
        `palette utilization ${formatNum(metrics.outputPaletteUtilization)} (${metrics.outputPaletteColorCount}/${metrics.paletteUtilizationTarget})`,
      ),
    )
  }
  if (metrics.lowPaletteRetention < QUALITY_RULES.minLowPaletteRetention) {
    issues.push(
      issue(
        'review',
        'palette-collapse',
        `low-palette retention ${formatNum(metrics.lowPaletteRetention)}`,
      ),
    )
  }
  if (metrics.outputCoverage < QUALITY_RULES.minOutputCoverage) {
    issues.push(
      issue('review', 'output-shrink', `output coverage ${formatNum(metrics.outputCoverage)}`),
    )
  }
  if (metrics.squareCellError > QUALITY_RULES.maxOutputSquareCellError) {
    issues.push(
      issue(
        'fail',
        'non-square-output-cells',
        `square cell error ${formatNum(metrics.squareCellError)}`,
      ),
    )
  }
  if (metrics.edgeAlignment < QUALITY_RULES.minEdgeAlignment) {
    issues.push(
      issue('review', 'weak-boundaries', `edge alignment ${formatNum(metrics.edgeAlignment)}`),
    )
  }
  if (metrics.axisEdgeAlignmentMin < QUALITY_RULES.minAxisEdgeAlignment) {
    issues.push(
      issue(
        'review',
        'weak-axis-boundaries',
        `min axis edge alignment ${formatNum(metrics.axisEdgeAlignmentMin)}`,
      ),
    )
  }
  if (metrics.phaseAlignment < QUALITY_RULES.minPhaseAlignment) {
    issues.push(
      issue(
        'review',
        'phase-misaligned-grid',
        `phase alignment ${formatNum(metrics.phaseAlignment)}`,
      ),
    )
  }
  if (metrics.axisPhaseAlignmentMin < QUALITY_RULES.minAxisPhaseAlignment) {
    issues.push(
      issue(
        'review',
        'axis-phase-misaligned-grid',
        `min axis phase alignment ${formatNum(metrics.axisPhaseAlignmentMin)}`,
      ),
    )
  }
  if (metrics.sourceCellSize > QUALITY_RULES.maxSourceCellSizeReview) {
    issues.push(
      issue('review', 'macro-grid', `source cell size ${formatNum(metrics.sourceCellSize)}px`),
    )
  }
  if (metrics.cellColorDominance < QUALITY_RULES.minCellColorDominance) {
    issues.push(
      issue(
        'review',
        'ambiguous-cell-colors',
        `cell color dominance ${formatNum(metrics.cellColorDominance)}`,
      ),
    )
  }
  if (
    metrics.cellColorErrorMean > QUALITY_RULES.maxCellColorErrorMean ||
    metrics.cellColorErrorP95 > QUALITY_RULES.maxCellColorErrorP95
  ) {
    issues.push(
      issue(
        'review',
        'cell-color-drift',
        `cell color error mean ${formatNum(metrics.cellColorErrorMean)}, p95 ${formatNum(
          metrics.cellColorErrorP95,
        )}`,
      ),
    )
  }
  if (
    metrics.sourceCellTransitionCount >= QUALITY_RULES.minCellTransitionCount &&
    metrics.cellTransitionRetention < QUALITY_RULES.minCellTransitionRetention
  ) {
    issues.push(
      issue(
        'review',
        'cell-transition-loss',
        `cell transition retention ${formatNum(metrics.cellTransitionRetention)}`,
      ),
    )
  }
  if (
    (metrics.sourceCellTransitionXCount >= QUALITY_RULES.minCellTransitionCount &&
      metrics.cellTransitionXRetention < QUALITY_RULES.minCellTransitionRetention) ||
    (metrics.sourceCellTransitionYCount >= QUALITY_RULES.minCellTransitionCount &&
      metrics.cellTransitionYRetention < QUALITY_RULES.minCellTransitionRetention)
  ) {
    issues.push(
      issue(
        'review',
        'axis-cell-transition-loss',
        `min axis cell transition retention ${formatNum(metrics.cellTransitionAxisRetentionMin)}`,
      ),
    )
  }
  if (
    metrics.outputCellTransitionCount >= QUALITY_RULES.minCellTransitionCount &&
    metrics.cellTransitionSpuriousRatio > QUALITY_RULES.maxCellTransitionSpuriousRatio
  ) {
    issues.push(
      issue(
        'review',
        'spurious-cell-transitions',
        `cell transition spurious ratio ${formatNum(metrics.cellTransitionSpuriousRatio)}`,
      ),
    )
  }
  if (
    (metrics.outputCellTransitionXCount >= QUALITY_RULES.minCellTransitionCount &&
      metrics.cellTransitionXSpuriousRatio > QUALITY_RULES.maxCellTransitionSpuriousRatio) ||
    (metrics.outputCellTransitionYCount >= QUALITY_RULES.minCellTransitionCount &&
      metrics.cellTransitionYSpuriousRatio > QUALITY_RULES.maxCellTransitionSpuriousRatio)
  ) {
    issues.push(
      issue(
        'review',
        'axis-spurious-cell-transitions',
        `max axis cell transition spurious ratio ${formatNum(
          metrics.cellTransitionAxisSpuriousRatioMax,
        )}`,
      ),
    )
  }
  if (metrics.cellMae > QUALITY_RULES.highCellMae) {
    issues.push(issue('review', 'noisy-cells', `cell MAE ${formatNum(metrics.cellMae)}`))
  }
  if (metrics.preservationMae > QUALITY_RULES.maxPreservationMae) {
    issues.push(
      issue(
        'review',
        'preservation-loss',
        `preservation MAE ${formatNum(metrics.preservationMae)}`,
      ),
    )
  }
  if (metrics.preservationP95 > QUALITY_RULES.maxPreservationP95) {
    issues.push(
      issue(
        'review',
        'localized-preservation-loss',
        `preservation p95 ${formatNum(metrics.preservationP95)}`,
      ),
    )
  }
  if (
    metrics.tilePreservationMaxMae > QUALITY_RULES.maxTilePreservationMae ||
    metrics.tilePreservationP95Mae > QUALITY_RULES.maxTilePreservationP95
  ) {
    issues.push(
      issue(
        'review',
        'regional-preservation-loss',
        `tile preservation max ${formatNum(metrics.tilePreservationMaxMae)}, p95 ${formatNum(
          metrics.tilePreservationP95Mae,
        )}`,
      ),
    )
  }
  if (
    metrics.alphaMae > QUALITY_RULES.maxAlphaMae ||
    metrics.alphaP95 > QUALITY_RULES.maxAlphaP95
  ) {
    issues.push(
      issue(
        'review',
        'alpha-preservation-loss',
        `alpha MAE ${formatNum(metrics.alphaMae)}, p95 ${formatNum(metrics.alphaP95)}`,
      ),
    )
  }
  if (
    metrics.alphaCoverageRatio < QUALITY_RULES.minAlphaCoverageRatio ||
    metrics.alphaCoverageRatio > QUALITY_RULES.maxAlphaCoverageRatio
  ) {
    issues.push(
      issue(
        'review',
        'alpha-coverage-drift',
        `alpha coverage ratio ${formatNum(metrics.alphaCoverageRatio)}`,
      ),
    )
  }
  if (metrics.alphaMaskIou < QUALITY_RULES.minAlphaMaskIou) {
    issues.push(
      issue('review', 'alpha-mask-drift', `alpha mask IoU ${formatNum(metrics.alphaMaskIou)}`),
    )
  }
  if (metrics.alphaBBoxDriftRatio > QUALITY_RULES.maxAlphaBBoxDriftRatio) {
    issues.push(
      issue(
        'review',
        'alpha-bounds-drift',
        `alpha bounds drift ${formatNum(metrics.alphaBBoxDriftRatio)}`,
      ),
    )
  }
  if (
    metrics.contrastRatio < QUALITY_RULES.minContrastRatio ||
    metrics.contrastRatio > QUALITY_RULES.maxContrastRatio
  ) {
    issues.push(
      issue('review', 'contrast-drift', `contrast ratio ${formatNum(metrics.contrastRatio)}`),
    )
  }
  if (
    metrics.lineEdgeRatio < QUALITY_RULES.minLineEdgeRatio ||
    metrics.lineEdgeRatio > QUALITY_RULES.maxLineEdgeRatio
  ) {
    issues.push(
      issue('review', 'line-edge-drift', `line edge ratio ${formatNum(metrics.lineEdgeRatio)}`),
    )
  }
  if (metrics.edgeRecall < QUALITY_RULES.minEdgeRecall) {
    issues.push(issue('review', 'edge-recall-loss', `edge recall ${formatNum(metrics.edgeRecall)}`))
  }
  if (metrics.edgeSpuriousRatio > QUALITY_RULES.maxEdgeSpuriousRatio) {
    issues.push(
      issue(
        'review',
        'spurious-edge-growth',
        `spurious edge ratio ${formatNum(metrics.edgeSpuriousRatio)}`,
      ),
    )
  }
  if (metrics.edgeJaccard < QUALITY_RULES.minEdgeJaccard) {
    issues.push(issue('review', 'edge-map-drift', `edge overlap ${formatNum(metrics.edgeJaccard)}`))
  }

  if (issues.some((item) => item.severity === 'fail')) return { status: 'fail', issues }
  if (issues.length > 0) return { status: 'review', issues }
  return { status: 'pass', issues }
}

export function objective(metrics) {
  return (
    metrics.repeatGridGap * 100 +
    metrics.stabilityDepthGap * 100 +
    metrics.repeatVisualMae * 80 +
    metrics.repeatVisualP95 * 20 +
    metrics.determinismVisualMae * 80 +
    metrics.determinismVisualP95 * 20 +
    metrics.expectedGridGap * 150 +
    metrics.aspectError * 50 +
    metrics.cellColorErrorMean * 0.5 +
    metrics.cellColorErrorP95 * 0.2 +
    metrics.cellMae +
    metrics.preservationMae +
    metrics.preservationP95 * 0.25 +
    Math.max(0, metrics.tilePreservationMaxMae - QUALITY_RULES.maxTilePreservationMae) * 0.5 +
    Math.max(0, metrics.tilePreservationP95Mae - QUALITY_RULES.maxTilePreservationP95) * 0.75 +
    metrics.alphaMae +
    metrics.alphaP95 * 0.1 +
    Math.abs(1 - metrics.alphaCoverageRatio) * 80 +
    Math.max(0, QUALITY_RULES.minAlphaMaskIou - metrics.alphaMaskIou) * 120 +
    Math.max(0, metrics.alphaBBoxDriftRatio - QUALITY_RULES.maxAlphaBBoxDriftRatio) * 200 +
    metrics.outputCellMae * 500 +
    metrics.outputRgbPaletteOverage * 50 +
    Math.max(0, metrics.outputColorDominance - QUALITY_RULES.maxOutputColorDominance) *
      Math.max(0, metrics.paletteDominanceDelta - QUALITY_RULES.maxPaletteDominanceDelta) *
      80 +
    Math.max(0, QUALITY_RULES.minOutputPaletteUtilization - metrics.outputPaletteUtilization) *
      Math.max(0, metrics.paletteUtilizationTarget - QUALITY_RULES.minPaletteUtilizationTarget) *
      0.5 +
    Math.max(0, QUALITY_RULES.minLowPaletteRetention - metrics.lowPaletteRetention) * 50 +
    Math.max(0, QUALITY_RULES.minOutputCoverage - metrics.outputCoverage) * 50 +
    Math.max(0, 1 - metrics.edgeAlignment) * 25 +
    Math.max(0, 1 - metrics.axisEdgeAlignmentMin) * 15 +
    Math.max(0, 1 - metrics.phaseAlignment) * 15 +
    Math.max(0, 1 - metrics.axisPhaseAlignmentMin) * 10 +
    Math.max(0, QUALITY_RULES.minCellColorDominance - metrics.cellColorDominance) * 120 +
    Math.max(0, QUALITY_RULES.minCellTransitionRetention - metrics.cellTransitionRetention) * 50 +
    Math.max(0, QUALITY_RULES.minCellTransitionRetention - metrics.cellTransitionAxisRetentionMin) *
      35 +
    Math.max(
      0,
      metrics.cellTransitionSpuriousRatio - QUALITY_RULES.maxCellTransitionSpuriousRatio,
    ) *
      40 +
    Math.max(
      0,
      metrics.cellTransitionAxisSpuriousRatioMax - QUALITY_RULES.maxCellTransitionSpuriousRatio,
    ) *
      30 +
    metrics.cellTransitionErrorMean * 0.1 +
    Math.max(0, QUALITY_RULES.minSourceCellSize - metrics.sourceCellSize) * 500 +
    Math.max(0, metrics.shortAxisCells - QUALITY_RULES.maxShortAxisCells) * 10 +
    Math.max(0, metrics.sourceCellSize - QUALITY_RULES.maxSourceCellSizeReview) * 2 +
    Math.abs(1 - metrics.contrastRatio) * 10 +
    Math.abs(1 - metrics.lineEdgeRatio) * 8 +
    Math.max(0, QUALITY_RULES.minEdgeRecall - metrics.edgeRecall) * 60 +
    Math.max(0, metrics.edgeSpuriousRatio - QUALITY_RULES.maxEdgeSpuriousRatio) * 40 +
    Math.max(0, QUALITY_RULES.minEdgeJaccard - metrics.edgeJaccard) * 40
  )
}
