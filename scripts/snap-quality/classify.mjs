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
  if ((metrics.longAxisCells ?? 0) > QUALITY_RULES.maxLongAxisCellsReview) {
    issues.push(
      issue('review', 'runaway-long-axis-grid', `long axis cells ${metrics.longAxisCells}`),
    )
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
  if (
    (metrics.repeatVisualAlphaMae ?? 0) > QUALITY_RULES.maxRepeatVisualAlphaMae ||
    (metrics.repeatVisualAlphaP95 ?? 0) > QUALITY_RULES.maxRepeatVisualAlphaP95
  ) {
    issues.push(
      issue(
        'fail',
        'unstable-repeat-alpha',
        `repeat alpha MAE ${formatNum(metrics.repeatVisualAlphaMae)}, p95 ${formatNum(
          metrics.repeatVisualAlphaP95,
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
  if (
    (metrics.determinismVisualAlphaMae ?? 0) > QUALITY_RULES.maxDeterminismVisualAlphaMae ||
    (metrics.determinismVisualAlphaP95 ?? 0) > QUALITY_RULES.maxDeterminismVisualAlphaP95
  ) {
    issues.push(
      issue(
        'fail',
        'non-deterministic-alpha',
        `same input alpha MAE ${formatNum(metrics.determinismVisualAlphaMae)}, p95 ${formatNum(
          metrics.determinismVisualAlphaP95,
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
  if (metrics.outputAlphaCellMae > QUALITY_RULES.maxOutputAlphaCellMae) {
    issues.push(
      issue(
        'fail',
        'non-uniform-output-alpha-cells',
        `output alpha cell MAE ${formatNum(metrics.outputAlphaCellMae)}`,
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
  if (
    metrics.lowPaletteCoverageEligible &&
    (metrics.lowPaletteCoverageDrift > QUALITY_RULES.maxLowPaletteCoverageDrift ||
      metrics.lowPaletteCoverageRetention < QUALITY_RULES.minLowPaletteCoverageRetention)
  ) {
    issues.push(
      issue(
        'review',
        'low-palette-coverage-drift',
        `low-palette coverage drift ${formatNum(
          metrics.lowPaletteCoverageDrift,
        )}, retention ${formatNum(metrics.lowPaletteCoverageRetention)}`,
      ),
    )
  }
  if (
    metrics.lowPaletteCoverageEligible &&
    (metrics.lowPaletteTileCoverageTileCount ?? 0) >=
      QUALITY_RULES.minLowPaletteTileCoverageCount &&
    ((metrics.lowPaletteTileCoverageDriftMax ?? 0) > QUALITY_RULES.maxLowPaletteTileCoverageDrift ||
      (metrics.lowPaletteTileCoverageRetentionMin ?? 1) <
        QUALITY_RULES.minLowPaletteTileCoverageRetention)
  ) {
    issues.push(
      issue(
        'review',
        'low-palette-regional-coverage-drift',
        `low-palette regional coverage drift ${formatNum(
          metrics.lowPaletteTileCoverageDriftMax,
        )}, min retention ${formatNum(metrics.lowPaletteTileCoverageRetentionMin)}`,
      ),
    )
  }
  if (metrics.outputCoverage < QUALITY_RULES.minOutputCoverage) {
    issues.push(
      issue('review', 'output-shrink', `output coverage ${formatNum(metrics.outputCoverage)}`),
    )
  }
  if ((metrics.outputExpansion ?? 1) > QUALITY_RULES.maxOutputExpansion) {
    issues.push(
      issue('review', 'output-expansion', `output expansion ${formatNum(metrics.outputExpansion)}`),
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
  if ((metrics.cellColorDominanceP05 ?? 1) < QUALITY_RULES.minCellColorDominanceP05) {
    issues.push(
      issue(
        'review',
        'localized-ambiguous-cell-colors',
        `cell color dominance p05 ${formatNum(metrics.cellColorDominanceP05)}`,
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
  if ((metrics.cellColorErrorMax ?? 0) > QUALITY_RULES.maxCellColorErrorMaxReview) {
    issues.push(
      issue(
        'review',
        'cell-color-outlier',
        `max cell color error ${formatNum(metrics.cellColorErrorMax)}`,
      ),
    )
  }
  if (
    (metrics.cellAlphaErrorMean ?? 0) > QUALITY_RULES.maxCellAlphaErrorMean ||
    (metrics.cellAlphaErrorP95 ?? 0) > QUALITY_RULES.maxCellAlphaErrorP95
  ) {
    issues.push(
      issue(
        'review',
        'cell-alpha-drift',
        `cell alpha error mean ${formatNum(metrics.cellAlphaErrorMean)}, p95 ${formatNum(
          metrics.cellAlphaErrorP95,
        )}`,
      ),
    )
  }
  if ((metrics.cellAlphaErrorMax ?? 0) > QUALITY_RULES.maxCellAlphaErrorMaxReview) {
    issues.push(
      issue(
        'review',
        'cell-alpha-outlier',
        `max cell alpha error ${formatNum(metrics.cellAlphaErrorMax)}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    metrics.cellColorErrorMax > QUALITY_RULES.maxExactLowPaletteCellColorErrorMax
  ) {
    issues.push(
      issue(
        'review',
        'rare-cell-color-drift',
        `exact low-palette max cell color error ${formatNum(metrics.cellColorErrorMax)}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    (metrics.cellAlphaErrorMax ?? 0) > QUALITY_RULES.maxExactLowPaletteCellAlphaErrorMax
  ) {
    issues.push(
      issue(
        'review',
        'rare-cell-alpha-drift',
        `exact low-palette max cell alpha error ${formatNum(metrics.cellAlphaErrorMax)}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorAdjacencyCount ?? 0,
      metrics.outputCellColorAdjacencyCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorAdjacencyCount &&
    (metrics.cellColorAdjacencyDrift ?? 0) > QUALITY_RULES.maxExactCellColorAdjacencyDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-adjacency-drift',
        `exact cell color adjacencies ${metrics.sourceCellColorAdjacencyCount}->${metrics.outputCellColorAdjacencyCount}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorDiagonalAdjacencyCount ?? 0,
      metrics.outputCellColorDiagonalAdjacencyCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorDiagonalAdjacencyCount &&
    (metrics.cellColorDiagonalAdjacencyDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorDiagonalAdjacencyDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-diagonal-adjacency-drift',
        `exact cell color diagonal adjacencies ${metrics.sourceCellColorDiagonalAdjacencyCount}->${metrics.outputCellColorDiagonalAdjacencyCount}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorBoundaryPairCount ?? 0,
      metrics.outputCellColorBoundaryPairCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorBoundaryPairCount &&
    (metrics.cellColorBoundaryPairDrift ?? 0) > QUALITY_RULES.maxExactCellColorBoundaryPairDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-boundary-pair-drift',
        `exact cell color boundary pair drift ${metrics.cellColorBoundaryPairDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorDiagonalBoundaryPairCount ?? 0,
      metrics.outputCellColorDiagonalBoundaryPairCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorDiagonalBoundaryPairCount &&
    (metrics.cellColorDiagonalBoundaryPairDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorDiagonalBoundaryPairDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-diagonal-boundary-pair-drift',
        `exact cell color diagonal boundary pair drift ${metrics.cellColorDiagonalBoundaryPairDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorBoundaryHorizontalRunCount ?? 0,
      metrics.outputCellColorBoundaryHorizontalRunCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorBoundaryRunCount &&
    (metrics.cellColorBoundaryHorizontalRunDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorBoundaryRunDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-boundary-horizontal-run-drift',
        `exact cell color horizontal boundary run drift ${metrics.cellColorBoundaryHorizontalRunDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorBoundaryVerticalRunCount ?? 0,
      metrics.outputCellColorBoundaryVerticalRunCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorBoundaryRunCount &&
    (metrics.cellColorBoundaryVerticalRunDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorBoundaryRunDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-boundary-vertical-run-drift',
        `exact cell color vertical boundary run drift ${metrics.cellColorBoundaryVerticalRunDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorNeighborMaskCount ?? 0,
      metrics.outputCellColorNeighborMaskCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorNeighborMaskCount &&
    (metrics.cellColorNeighborMaskDrift ?? 0) > QUALITY_RULES.maxExactCellColorNeighborMaskDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-neighbor-mask-drift',
        `exact cell color neighbor mask drift ${metrics.cellColorNeighborMaskDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorQuadPatternCount ?? 0,
      metrics.outputCellColorQuadPatternCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorQuadPatternCount &&
    (metrics.cellColorQuadPatternDrift ?? 0) > QUALITY_RULES.maxExactCellColorQuadPatternDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-quad-pattern-drift',
        `exact cell color 2x2 pattern drift ${metrics.cellColorQuadPatternDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorWindowPatternCount ?? 0,
      metrics.outputCellColorWindowPatternCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorWindowPatternCount &&
    (metrics.cellColorWindowPatternDrift ?? 0) > QUALITY_RULES.maxExactCellColorWindowPatternDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-window-pattern-drift',
        `exact cell color 3x3 window pattern drift ${metrics.cellColorWindowPatternDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorHorizontalRunCount ?? 0,
      metrics.outputCellColorHorizontalRunCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorRunCount &&
    (metrics.cellColorHorizontalRunDrift ?? 0) > QUALITY_RULES.maxExactCellColorRunDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-horizontal-run-drift',
        `exact cell color horizontal run drift ${metrics.cellColorHorizontalRunDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorVerticalRunCount ?? 0,
      metrics.outputCellColorVerticalRunCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorRunCount &&
    (metrics.cellColorVerticalRunDrift ?? 0) > QUALITY_RULES.maxExactCellColorRunDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-vertical-run-drift',
        `exact cell color vertical run drift ${metrics.cellColorVerticalRunDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorRowProjectionCount ?? 0,
      metrics.outputCellColorRowProjectionCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorProjectionCount &&
    (metrics.cellColorRowProjectionDrift ?? 0) > QUALITY_RULES.maxExactCellColorProjectionDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-row-projection-drift',
        `exact cell color row projection drift ${metrics.cellColorRowProjectionDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorColumnProjectionCount ?? 0,
      metrics.outputCellColorColumnProjectionCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorProjectionCount &&
    (metrics.cellColorColumnProjectionDrift ?? 0) > QUALITY_RULES.maxExactCellColorProjectionDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-column-projection-drift',
        `exact cell color column projection drift ${metrics.cellColorColumnProjectionDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(metrics.sourceCellColorComponentCount, metrics.outputCellColorComponentCount) >=
      QUALITY_RULES.minExactCellColorComponentCount &&
    metrics.cellColorComponentCountDrift > QUALITY_RULES.maxExactCellColorComponentCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-drift',
        `exact cell color components ${metrics.sourceCellColorComponentCount}->${metrics.outputCellColorComponentCount}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(metrics.sourceCellColorComponentCount, metrics.outputCellColorComponentCount) >=
      QUALITY_RULES.minExactCellColorComponentCount &&
    (metrics.cellColorComponentAreaDrift ?? 0) > QUALITY_RULES.maxExactCellColorComponentAreaDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-area-drift',
        `exact cell color component area drift ${metrics.cellColorComponentAreaDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(metrics.sourceCellColorComponentCount, metrics.outputCellColorComponentCount) >=
      QUALITY_RULES.minExactCellColorComponentCount &&
    (metrics.cellColorComponentBBoxDrift ?? 0) > QUALITY_RULES.maxExactCellColorComponentBBoxDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-bounds-drift',
        `exact cell color component bounds drift ${metrics.cellColorComponentBBoxDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceCellColorComponentHoleCount ?? 0,
      metrics.outputCellColorComponentHoleCount ?? 0,
    ) >= QUALITY_RULES.minExactCellColorComponentHoleCount &&
    (metrics.cellColorComponentHoleCountDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorComponentHoleCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-hole-drift',
        `exact cell color component holes ${metrics.sourceCellColorComponentHoleCount}->${metrics.outputCellColorComponentHoleCount}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(metrics.sourceCellColorComponentCount, metrics.outputCellColorComponentCount) >=
      QUALITY_RULES.minExactCellColorComponentCount &&
    (metrics.cellColorComponentPerimeterDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorComponentPerimeterDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-perimeter-drift',
        `exact cell color component perimeter drift ${metrics.cellColorComponentPerimeterDrift}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(metrics.sourceCellColorComponentCount, metrics.outputCellColorComponentCount) >=
      QUALITY_RULES.minExactCellColorComponentCount &&
    (metrics.cellColorComponentPositionDrift ?? 0) >
      QUALITY_RULES.maxExactCellColorComponentPositionDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-cell-color-component-position-drift',
        `exact cell color component position drift ${formatNum(
          metrics.cellColorComponentPositionDrift,
        )}`,
      ),
    )
  }
  if (
    metrics.exactLowPaletteCellColorEligible &&
    Math.max(
      metrics.sourceSmallCellColorComponentCount,
      metrics.outputSmallCellColorComponentCount,
    ) >= QUALITY_RULES.minExactSmallCellColorComponentCount &&
    metrics.smallCellColorComponentCountDrift >
      QUALITY_RULES.maxExactSmallCellColorComponentCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'exact-small-cell-color-component-drift',
        `exact small cell color components ${metrics.sourceSmallCellColorComponentCount}->${metrics.outputSmallCellColorComponentCount}`,
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
  if (
    (metrics.sourceCellDiagonalTransitionCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
    (metrics.cellDiagonalTransitionRetention ?? 1) <
      QUALITY_RULES.minCellDiagonalTransitionRetention
  ) {
    issues.push(
      issue(
        'review',
        'cell-diagonal-transition-loss',
        `diagonal cell transition retention ${formatNum(metrics.cellDiagonalTransitionRetention)}`,
      ),
    )
  }
  if (
    ((metrics.sourceCellDiagonalTransitionDownRightCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
      (metrics.cellDiagonalTransitionDownRightRetention ?? 1) <
        QUALITY_RULES.minCellDiagonalTransitionRetention) ||
    ((metrics.sourceCellDiagonalTransitionDownLeftCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
      (metrics.cellDiagonalTransitionDownLeftRetention ?? 1) <
        QUALITY_RULES.minCellDiagonalTransitionRetention)
  ) {
    issues.push(
      issue(
        'review',
        'directional-cell-diagonal-transition-loss',
        `min diagonal cell transition retention ${formatNum(
          metrics.cellDiagonalTransitionDirectionRetentionMin,
        )}`,
      ),
    )
  }
  if (
    (metrics.outputCellDiagonalTransitionCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
    (metrics.cellDiagonalTransitionSpuriousRatio ?? 0) >
      QUALITY_RULES.maxCellDiagonalTransitionSpuriousRatio
  ) {
    issues.push(
      issue(
        'review',
        'spurious-cell-diagonal-transitions',
        `diagonal cell transition spurious ratio ${formatNum(
          metrics.cellDiagonalTransitionSpuriousRatio,
        )}`,
      ),
    )
  }
  if (
    ((metrics.outputCellDiagonalTransitionDownRightCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
      (metrics.cellDiagonalTransitionDownRightSpuriousRatio ?? 0) >
        QUALITY_RULES.maxCellDiagonalTransitionSpuriousRatio) ||
    ((metrics.outputCellDiagonalTransitionDownLeftCount ?? 0) >=
      QUALITY_RULES.minCellDiagonalTransitionCount &&
      (metrics.cellDiagonalTransitionDownLeftSpuriousRatio ?? 0) >
        QUALITY_RULES.maxCellDiagonalTransitionSpuriousRatio)
  ) {
    issues.push(
      issue(
        'review',
        'directional-spurious-cell-diagonal-transitions',
        `max diagonal cell transition spurious ratio ${formatNum(
          metrics.cellDiagonalTransitionDirectionSpuriousRatioMax,
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
  if ((metrics.alphaMax ?? 0) > QUALITY_RULES.maxAlphaMax) {
    issues.push(
      issue('review', 'alpha-preservation-outlier', `alpha max ${formatNum(metrics.alphaMax)}`),
    )
  }
  if (
    metrics.alphaTileMaxMae > QUALITY_RULES.maxAlphaTileMae ||
    metrics.alphaTileP95Mae > QUALITY_RULES.maxAlphaTileP95
  ) {
    issues.push(
      issue(
        'review',
        'regional-alpha-preservation-loss',
        `alpha tile max ${formatNum(metrics.alphaTileMaxMae)}, p95 ${formatNum(
          metrics.alphaTileP95Mae,
        )}`,
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
    Math.max(metrics.alphaComponentCount ?? 0, metrics.outputAlphaComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaComponentCount &&
    metrics.alphaComponentCountDrift > QUALITY_RULES.maxAlphaComponentCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-component-drift',
        `alpha components ${metrics.alphaComponentCount}->${metrics.outputAlphaComponentCount}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaComponentCount ?? 0, metrics.outputAlphaComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaComponentCount &&
    (metrics.alphaComponentAreaDrift ?? 0) > QUALITY_RULES.maxAlphaComponentAreaDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-component-area-drift',
        `alpha component area drift ${metrics.alphaComponentAreaDrift}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaComponentCount ?? 0, metrics.outputAlphaComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaComponentCount &&
    (metrics.alphaComponentBBoxDrift ?? 0) > QUALITY_RULES.maxAlphaComponentBBoxDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-component-bounds-drift',
        `alpha component bounds drift ${metrics.alphaComponentBBoxDrift}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaComponentCount ?? 0, metrics.outputAlphaComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaComponentCount &&
    (metrics.alphaComponentPerimeterDrift ?? 0) > QUALITY_RULES.maxAlphaComponentPerimeterDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-component-perimeter-drift',
        `alpha component perimeter drift ${metrics.alphaComponentPerimeterDrift}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaComponentCount ?? 0, metrics.outputAlphaComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaComponentCount &&
    (metrics.alphaComponentPositionDrift ?? 0) > QUALITY_RULES.maxAlphaComponentPositionDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-component-position-drift',
        `alpha component position drift ${formatNum(metrics.alphaComponentPositionDrift)}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaHoleCount ?? 0, metrics.outputAlphaHoleCount ?? 0) >=
      QUALITY_RULES.minAlphaHoleCount &&
    (metrics.alphaHoleCountDrift ?? 0) > QUALITY_RULES.maxAlphaHoleCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-hole-drift',
        `alpha holes ${metrics.alphaHoleCount}->${metrics.outputAlphaHoleCount}`,
      ),
    )
  }
  if (
    Math.max(metrics.alphaSmallComponentCount ?? 0, metrics.outputAlphaSmallComponentCount ?? 0) >=
      QUALITY_RULES.minAlphaSmallComponentCount &&
    metrics.alphaSmallComponentCountDrift > QUALITY_RULES.maxAlphaSmallComponentCountDrift
  ) {
    issues.push(
      issue(
        'review',
        'alpha-small-component-drift',
        `small alpha components ${metrics.alphaSmallComponentCount}->${metrics.outputAlphaSmallComponentCount}`,
      ),
    )
  }
  if (
    metrics.alphaSemitransparentPixelCount >= QUALITY_RULES.minAlphaSemitransparentPixelCount &&
    metrics.alphaSemitransparentRetention < QUALITY_RULES.minAlphaSemitransparentRetention
  ) {
    issues.push(
      issue(
        'review',
        'alpha-semitransparency-loss',
        `alpha semitransparent retention ${formatNum(metrics.alphaSemitransparentRetention)}`,
      ),
    )
  }
  if (
    metrics.alphaSemitransparentPixelCount >= QUALITY_RULES.minAlphaSemitransparentPixelCount &&
    (metrics.alphaSemitransparentValueMae > QUALITY_RULES.maxAlphaSemitransparentValueMae ||
      metrics.alphaSemitransparentValueP95 > QUALITY_RULES.maxAlphaSemitransparentValueP95)
  ) {
    issues.push(
      issue(
        'review',
        'alpha-semitransparency-value-drift',
        `alpha semitransparent value MAE ${formatNum(
          metrics.alphaSemitransparentValueMae,
        )}, p95 ${formatNum(metrics.alphaSemitransparentValueP95)}`,
      ),
    )
  }
  if (
    metrics.outputAlphaSemitransparentPixelCount >=
      QUALITY_RULES.minAlphaSemitransparentPixelCount &&
    metrics.alphaSemitransparentSpuriousRatio > QUALITY_RULES.maxAlphaSemitransparentSpuriousRatio
  ) {
    issues.push(
      issue(
        'review',
        'spurious-alpha-semitransparency',
        `alpha semitransparent spurious ratio ${formatNum(
          metrics.alphaSemitransparentSpuriousRatio,
        )}`,
      ),
    )
  }
  if (
    metrics.alphaEdgeCount >= QUALITY_RULES.minAlphaEdgeCount &&
    (metrics.alphaEdgeRecall < QUALITY_RULES.minAlphaEdgeRecall ||
      metrics.alphaEdgeJaccard < QUALITY_RULES.minAlphaEdgeJaccard)
  ) {
    issues.push(
      issue(
        'review',
        'alpha-edge-loss',
        `alpha edge recall ${formatNum(metrics.alphaEdgeRecall)}, overlap ${formatNum(
          metrics.alphaEdgeJaccard,
        )}`,
      ),
    )
  }
  if (
    metrics.outputAlphaEdgeCount >= QUALITY_RULES.minAlphaEdgeCount &&
    metrics.alphaEdgeSpuriousRatio > QUALITY_RULES.maxAlphaEdgeSpuriousRatio
  ) {
    issues.push(
      issue(
        'review',
        'spurious-alpha-edge-growth',
        `alpha edge spurious ratio ${formatNum(metrics.alphaEdgeSpuriousRatio)}`,
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
    metrics.inputChromaMean >= QUALITY_RULES.minChromaMeanForRatio &&
    (metrics.chromaRatio < QUALITY_RULES.minChromaRatio ||
      metrics.chromaRatio > QUALITY_RULES.maxChromaRatio)
  ) {
    issues.push(
      issue(
        'review',
        'chroma-drift',
        `chroma ratio ${formatNum(metrics.chromaRatio)} (${formatNum(
          metrics.inputChromaMean,
        )}->${formatNum(metrics.outputChromaMean)})`,
      ),
    )
  }
  if (
    metrics.hueSampleCount >= QUALITY_RULES.minHueSampleCount &&
    (metrics.hueErrorMean > QUALITY_RULES.maxHueErrorMean ||
      metrics.hueErrorP95 > QUALITY_RULES.maxHueErrorP95)
  ) {
    issues.push(
      issue(
        'review',
        'hue-drift',
        `hue error mean ${formatNum(metrics.hueErrorMean)}, p95 ${formatNum(metrics.hueErrorP95)}`,
      ),
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
  if (
    (metrics.sourceEdgeDirectionCount ?? 0) >= QUALITY_RULES.minEdgeDirectionCount &&
    (metrics.outputEdgeDirectionCount ?? 0) >= QUALITY_RULES.minEdgeDirectionCount &&
    (metrics.edgeDirectionDrift ?? 0) > QUALITY_RULES.maxEdgeDirectionDrift
  ) {
    issues.push(
      issue(
        'review',
        'edge-direction-drift',
        `edge direction drift ${formatNum(metrics.edgeDirectionDrift)}`,
      ),
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
  if (
    (metrics.sourceEdgeTileCount ?? 0) >= QUALITY_RULES.minEdgeTileCount &&
    (metrics.edgeTileRecallMin ?? 1) < QUALITY_RULES.minEdgeTileRecall
  ) {
    issues.push(
      issue(
        'review',
        'regional-edge-loss',
        `min tile edge recall ${formatNum(metrics.edgeTileRecallMin)}`,
      ),
    )
  }
  if (
    (metrics.outputEdgeTileCount ?? 0) >= QUALITY_RULES.minEdgeTileCount &&
    (metrics.edgeTileSpuriousMax ?? 0) > QUALITY_RULES.maxEdgeTileSpuriousRatio
  ) {
    issues.push(
      issue(
        'review',
        'regional-spurious-edge-growth',
        `max tile edge spurious ratio ${formatNum(metrics.edgeTileSpuriousMax)}`,
      ),
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
    metrics.repeatVisualMae * 80 +
    metrics.repeatVisualP95 * 20 +
    (metrics.repeatVisualAlphaMae ?? 0) * 80 +
    (metrics.repeatVisualAlphaP95 ?? 0) * 20 +
    metrics.determinismVisualMae * 80 +
    metrics.determinismVisualP95 * 20 +
    (metrics.determinismVisualAlphaMae ?? 0) * 80 +
    (metrics.determinismVisualAlphaP95 ?? 0) * 20 +
    metrics.expectedGridGap * 150 +
    metrics.aspectError * 50 +
    Math.max(0, (metrics.longAxisCells ?? 0) - QUALITY_RULES.maxLongAxisCellsReview) * 0.1 +
    (metrics.cellAlphaErrorMean ?? 0) * 0.5 +
    (metrics.cellAlphaErrorP95 ?? 0) * 0.2 +
    metrics.cellColorErrorMean * 0.5 +
    metrics.cellColorErrorP95 * 0.2 +
    Math.max(0, (metrics.cellAlphaErrorMax ?? 0) - QUALITY_RULES.maxCellAlphaErrorMaxReview) * 0.1 +
    Math.max(0, (metrics.cellColorErrorMax ?? 0) - QUALITY_RULES.maxCellColorErrorMaxReview) * 0.1 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellAlphaErrorMax ?? 0) : 0) -
        QUALITY_RULES.maxExactLowPaletteCellAlphaErrorMax,
    ) *
      0.5 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? metrics.cellColorErrorMax : 0) -
        QUALITY_RULES.maxExactLowPaletteCellColorErrorMax,
    ) *
      0.5 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? metrics.cellColorComponentCountDrift : 0) -
        QUALITY_RULES.maxExactCellColorComponentCountDrift,
    ) *
      20 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorAdjacencyDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorAdjacencyDrift,
    ) *
      8 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorDiagonalAdjacencyDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorDiagonalAdjacencyDrift,
    ) *
      8 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorBoundaryPairDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorBoundaryPairDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorDiagonalBoundaryPairDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorDiagonalBoundaryPairDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorBoundaryHorizontalRunDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorBoundaryRunDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorBoundaryVerticalRunDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorBoundaryRunDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorNeighborMaskDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorNeighborMaskDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorQuadPatternDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorQuadPatternDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorWindowPatternDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorWindowPatternDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorHorizontalRunDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorRunDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorVerticalRunDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorRunDrift,
    ) *
      4 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorRowProjectionDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorProjectionDrift,
    ) *
      2 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorColumnProjectionDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorProjectionDrift,
    ) *
      2 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorComponentAreaDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorComponentAreaDrift,
    ) *
      2 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? (metrics.cellColorComponentBBoxDrift ?? 0) : 0) -
        QUALITY_RULES.maxExactCellColorComponentBBoxDrift,
    ) *
      2 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorComponentHoleCountDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorComponentHoleCountDrift,
    ) *
      20 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorComponentPerimeterDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorComponentPerimeterDrift,
    ) *
      1 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible
        ? (metrics.cellColorComponentPositionDrift ?? 0)
        : 0) - QUALITY_RULES.maxExactCellColorComponentPositionDrift,
    ) *
      2 +
    Math.max(
      0,
      (metrics.exactLowPaletteCellColorEligible ? metrics.smallCellColorComponentCountDrift : 0) -
        QUALITY_RULES.maxExactSmallCellColorComponentCountDrift,
    ) *
      16 +
    metrics.cellMae +
    metrics.preservationMae +
    metrics.preservationP95 * 0.25 +
    Math.max(0, metrics.tilePreservationMaxMae - QUALITY_RULES.maxTilePreservationMae) * 0.5 +
    Math.max(0, metrics.tilePreservationP95Mae - QUALITY_RULES.maxTilePreservationP95) * 0.75 +
    metrics.alphaMae +
    metrics.alphaP95 * 0.1 +
    Math.max(0, (metrics.alphaMax ?? 0) - QUALITY_RULES.maxAlphaMax) * 0.2 +
    Math.max(0, metrics.alphaTileMaxMae - QUALITY_RULES.maxAlphaTileMae) * 0.5 +
    Math.max(0, metrics.alphaTileP95Mae - QUALITY_RULES.maxAlphaTileP95) * 0.75 +
    Math.abs(1 - metrics.alphaCoverageRatio) * 80 +
    Math.max(0, QUALITY_RULES.minAlphaMaskIou - metrics.alphaMaskIou) * 120 +
    Math.max(0, metrics.alphaBBoxDriftRatio - QUALITY_RULES.maxAlphaBBoxDriftRatio) * 200 +
    Math.max(
      0,
      (metrics.alphaComponentCountDrift ?? 0) - QUALITY_RULES.maxAlphaComponentCountDrift,
    ) *
      40 +
    Math.max(0, (metrics.alphaComponentAreaDrift ?? 0) - QUALITY_RULES.maxAlphaComponentAreaDrift) *
      0.25 +
    Math.max(0, (metrics.alphaComponentBBoxDrift ?? 0) - QUALITY_RULES.maxAlphaComponentBBoxDrift) *
      0.5 +
    Math.max(
      0,
      (metrics.alphaComponentPerimeterDrift ?? 0) - QUALITY_RULES.maxAlphaComponentPerimeterDrift,
    ) *
      0.25 +
    Math.max(
      0,
      (metrics.alphaComponentPositionDrift ?? 0) - QUALITY_RULES.maxAlphaComponentPositionDrift,
    ) *
      0.5 +
    Math.max(0, (metrics.alphaHoleCountDrift ?? 0) - QUALITY_RULES.maxAlphaHoleCountDrift) * 30 +
    Math.max(
      0,
      (metrics.alphaSmallComponentCountDrift ?? 0) - QUALITY_RULES.maxAlphaSmallComponentCountDrift,
    ) *
      35 +
    Math.max(
      0,
      QUALITY_RULES.minAlphaSemitransparentRetention - (metrics.alphaSemitransparentRetention ?? 1),
    ) *
      45 +
    Math.max(
      0,
      (metrics.alphaSemitransparentValueMae ?? 0) - QUALITY_RULES.maxAlphaSemitransparentValueMae,
    ) *
      0.5 +
    Math.max(
      0,
      (metrics.alphaSemitransparentValueP95 ?? 0) - QUALITY_RULES.maxAlphaSemitransparentValueP95,
    ) *
      0.25 +
    Math.max(
      0,
      (metrics.alphaSemitransparentSpuriousRatio ?? 0) -
        QUALITY_RULES.maxAlphaSemitransparentSpuriousRatio,
    ) *
      35 +
    Math.max(0, QUALITY_RULES.minAlphaEdgeRecall - (metrics.alphaEdgeRecall ?? 1)) * 70 +
    Math.max(0, (metrics.alphaEdgeSpuriousRatio ?? 0) - QUALITY_RULES.maxAlphaEdgeSpuriousRatio) *
      50 +
    Math.max(0, QUALITY_RULES.minAlphaEdgeJaccard - (metrics.alphaEdgeJaccard ?? 1)) * 60 +
    metrics.outputCellMae * 500 +
    (metrics.outputAlphaCellMae ?? 0) * 500 +
    metrics.outputRgbPaletteOverage * 50 +
    Math.max(0, metrics.outputColorDominance - QUALITY_RULES.maxOutputColorDominance) *
      Math.max(0, metrics.paletteDominanceDelta - QUALITY_RULES.maxPaletteDominanceDelta) *
      80 +
    Math.max(0, QUALITY_RULES.minOutputPaletteUtilization - metrics.outputPaletteUtilization) *
      Math.max(0, metrics.paletteUtilizationTarget - QUALITY_RULES.minPaletteUtilizationTarget) *
      0.5 +
    Math.max(0, QUALITY_RULES.minLowPaletteRetention - metrics.lowPaletteRetention) * 50 +
    Math.max(0, (metrics.lowPaletteCoverageDrift ?? 0) - QUALITY_RULES.maxLowPaletteCoverageDrift) *
      80 +
    Math.max(
      0,
      QUALITY_RULES.minLowPaletteCoverageRetention - (metrics.lowPaletteCoverageRetention ?? 1),
    ) *
      80 +
    Math.max(
      0,
      (metrics.lowPaletteCoverageEligible ? (metrics.lowPaletteTileCoverageDriftMax ?? 0) : 0) -
        QUALITY_RULES.maxLowPaletteTileCoverageDrift,
    ) *
      40 +
    Math.max(
      0,
      QUALITY_RULES.minLowPaletteTileCoverageRetention -
        (metrics.lowPaletteCoverageEligible
          ? (metrics.lowPaletteTileCoverageRetentionMin ?? 1)
          : 1),
    ) *
      40 +
    Math.max(0, QUALITY_RULES.minOutputCoverage - metrics.outputCoverage) * 50 +
    Math.max(0, (metrics.outputExpansion ?? 1) - QUALITY_RULES.maxOutputExpansion) * 50 +
    Math.max(0, 1 - metrics.edgeAlignment) * 25 +
    Math.max(0, 1 - metrics.axisEdgeAlignmentMin) * 15 +
    Math.max(0, 1 - metrics.phaseAlignment) * 15 +
    Math.max(0, 1 - metrics.axisPhaseAlignmentMin) * 10 +
    Math.max(0, QUALITY_RULES.minCellColorDominance - metrics.cellColorDominance) * 120 +
    Math.max(0, QUALITY_RULES.minCellColorDominanceP05 - (metrics.cellColorDominanceP05 ?? 1)) *
      120 +
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
    Math.max(
      0,
      QUALITY_RULES.minCellDiagonalTransitionRetention -
        (metrics.cellDiagonalTransitionRetention ?? 1),
    ) *
      35 +
    Math.max(
      0,
      QUALITY_RULES.minCellDiagonalTransitionRetention -
        (metrics.cellDiagonalTransitionDirectionRetentionMin ?? 1),
    ) *
      25 +
    Math.max(
      0,
      (metrics.cellDiagonalTransitionSpuriousRatio ?? 0) -
        QUALITY_RULES.maxCellDiagonalTransitionSpuriousRatio,
    ) *
      30 +
    Math.max(
      0,
      (metrics.cellDiagonalTransitionDirectionSpuriousRatioMax ?? 0) -
        QUALITY_RULES.maxCellDiagonalTransitionSpuriousRatio,
    ) *
      20 +
    Math.max(0, QUALITY_RULES.minSourceCellSize - metrics.sourceCellSize) * 500 +
    Math.max(0, metrics.shortAxisCells - QUALITY_RULES.maxShortAxisCells) * 10 +
    Math.max(0, metrics.sourceCellSize - QUALITY_RULES.maxSourceCellSizeReview) * 2 +
    Math.abs(1 - metrics.contrastRatio) * 10 +
    Math.max(0, QUALITY_RULES.minChromaRatio - metrics.chromaRatio) * 40 +
    Math.max(0, metrics.chromaRatio - QUALITY_RULES.maxChromaRatio) * 35 +
    Math.max(0, metrics.hueErrorMean - QUALITY_RULES.maxHueErrorMean) * 0.5 +
    Math.max(0, metrics.hueErrorP95 - QUALITY_RULES.maxHueErrorP95) * 0.2 +
    Math.abs(1 - metrics.lineEdgeRatio) * 8 +
    Math.max(0, (metrics.edgeDirectionDrift ?? 0) - QUALITY_RULES.maxEdgeDirectionDrift) * 40 +
    Math.max(0, QUALITY_RULES.minEdgeRecall - metrics.edgeRecall) * 60 +
    Math.max(0, metrics.edgeSpuriousRatio - QUALITY_RULES.maxEdgeSpuriousRatio) * 40 +
    Math.max(0, QUALITY_RULES.minEdgeJaccard - metrics.edgeJaccard) * 40 +
    Math.max(0, QUALITY_RULES.minEdgeTileRecall - (metrics.edgeTileRecallMin ?? 1)) * 30 +
    Math.max(0, (metrics.edgeTileSpuriousMax ?? 0) - QUALITY_RULES.maxEdgeTileSpuriousRatio) * 20
  )
}
