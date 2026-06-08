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
  if (metrics.phaseAlignment < QUALITY_RULES.minPhaseAlignment) {
    issues.push(
      issue(
        'review',
        'phase-misaligned-grid',
        `phase alignment ${formatNum(metrics.phaseAlignment)}`,
      ),
    )
  }
  if (metrics.sourceCellSize > QUALITY_RULES.maxSourceCellSizeReview) {
    issues.push(
      issue('review', 'macro-grid', `source cell size ${formatNum(metrics.sourceCellSize)}px`),
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
    metrics.contrastRatio < QUALITY_RULES.minContrastRatio ||
    metrics.contrastRatio > QUALITY_RULES.maxContrastRatio
  ) {
    issues.push(
      issue('review', 'contrast-drift', `contrast ratio ${formatNum(metrics.contrastRatio)}`),
    )
  }

  if (issues.some((item) => item.severity === 'fail')) return { status: 'fail', issues }
  if (issues.length > 0) return { status: 'review', issues }
  return { status: 'pass', issues }
}

export function objective(metrics) {
  return (
    metrics.repeatGridGap * 100 +
    metrics.stabilityDepthGap * 100 +
    metrics.expectedGridGap * 150 +
    metrics.aspectError * 50 +
    metrics.cellMae +
    metrics.preservationMae +
    metrics.preservationP95 * 0.25 +
    metrics.alphaMae +
    metrics.alphaP95 * 0.1 +
    metrics.outputCellMae * 500 +
    metrics.outputRgbPaletteOverage * 50 +
    Math.max(0, 1 - metrics.edgeAlignment) * 25 +
    Math.max(0, 1 - metrics.phaseAlignment) * 15 +
    Math.max(0, QUALITY_RULES.minSourceCellSize - metrics.sourceCellSize) * 500 +
    Math.max(0, metrics.shortAxisCells - QUALITY_RULES.maxShortAxisCells) * 10 +
    Math.max(0, metrics.sourceCellSize - QUALITY_RULES.maxSourceCellSizeReview) * 2 +
    Math.abs(1 - metrics.contrastRatio) * 10
  )
}
