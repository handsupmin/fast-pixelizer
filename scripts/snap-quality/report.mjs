import { QUALITY_RULES } from './config.mjs'
import { formatNum } from './classify.mjs'

export function mean(results, key) {
  if (results.length === 0) return 0
  return formatNum(results.reduce((sum, item) => sum + item[key], 0) / results.length)
}

export function summarize(results) {
  const statusCounts = results.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1
    return counts
  }, {})

  return {
    count: results.length,
    statusCounts,
    objectiveMean: mean(results, 'objective'),
    repeatGridGapTotal: results.reduce((sum, item) => sum + item.repeatGridGap, 0),
    repeatVisualMaeMean: mean(results, 'repeatVisualMae'),
    repeatVisualP95Mean: mean(results, 'repeatVisualP95'),
    determinismVisualMaeMean: mean(results, 'determinismVisualMae'),
    determinismVisualP95Mean: mean(results, 'determinismVisualP95'),
    expectedGridGapTotal: results.reduce((sum, item) => sum + item.expectedGridGap, 0),
    preservationMaeMean: mean(results, 'preservationMae'),
    preservationP95Mean: mean(results, 'preservationP95'),
    alphaMaeMean: mean(results, 'alphaMae'),
    outputCellMaeMean: mean(results, 'outputCellMae'),
    phaseAlignmentMean: mean(results, 'phaseAlignment'),
    axisPhaseAlignmentMinMean: mean(results, 'axisPhaseAlignmentMin'),
    lowPaletteRetentionMean: mean(results, 'lowPaletteRetention'),
    outputCoverageMean: mean(results, 'outputCoverage'),
    lineEdgeRatioMean: mean(results, 'lineEdgeRatio'),
    sourceCellSizeMean: mean(results, 'sourceCellSize'),
  }
}

export function summarizeByDataset(results) {
  const groups = new Map()
  for (const item of results) {
    groups.set(item.dataset, [...(groups.get(item.dataset) ?? []), item])
  }
  return Object.fromEntries([...groups].map(([dataset, items]) => [dataset, summarize(items)]))
}

function criteriaMarkdown() {
  return [
    '## Criteria',
    '',
    `- Ground truth: fail when synthetic expected-grid gap is greater than ${QUALITY_RULES.maxExpectedGridGap}.`,
    `- Aspect preservation: fail when grid aspect differs from source by more than ${QUALITY_RULES.maxAspectError}.`,
    `- No micro-grid snap: fail when the detected short axis exceeds ${QUALITY_RULES.maxShortAxisCells} cells or source cell size drops below ${QUALITY_RULES.minSourceCellSize}px.`,
    `- No macro-grid under-detection: review when source cell size exceeds ${QUALITY_RULES.maxSourceCellSizeReview}px.`,
    `- Idempotence: fail when snapping the snapped output changes the grid by more than max(${QUALITY_RULES.maxRepeatGridGapFloor}, ${(QUALITY_RULES.maxRepeatGridGapRate * 100).toFixed(1)}% of cols+rows).`,
    `- Visual idempotence: fail when re-snapping the snapped output changes pixels by MAE > ${QUALITY_RULES.maxRepeatVisualMae} or p95 > ${QUALITY_RULES.maxRepeatVisualP95}.`,
    `- Deep stability: fail when a second re-snap changes the grid at all.`,
    `- Determinism: fail when two snaps of the same source disagree on grid size.`,
    `- Visual determinism: fail when two snaps of the same source produce different original-size pixels.`,
    `- Output purity: fail when snapped output cells are not single-color or square.`,
    `- Palette budget: fail when snapped RGB colors exceed colorVariety plus transparency allowance by more than ${QUALITY_RULES.maxOutputRgbPaletteOverage}.`,
    `- Low-palette retention: review when limited-palette inputs keep less than ${(QUALITY_RULES.minLowPaletteRetention * 100).toFixed(0)}% of their RGB colors.`,
    `- Output coverage: review when original-size snap output keeps less than ${(QUALITY_RULES.minOutputCoverage * 100).toFixed(0)}% of the input canvas on either axis.`,
    `- Boundary evidence: review when inferred grid boundaries are weaker than ${QUALITY_RULES.minEdgeAlignment}x the average axis gradient.`,
    `- Axis boundary evidence: review when either axis is weaker than ${QUALITY_RULES.minAxisEdgeAlignment}x the average axis gradient.`,
    `- Phase alignment: review when inferred grid boundaries score below ${QUALITY_RULES.minPhaseAlignment} against nearby gradient peaks.`,
    `- Axis phase alignment: review when either axis scores below ${QUALITY_RULES.minAxisPhaseAlignment} against nearby gradient peaks.`,
    `- Source disorder: review when intra-cell source MAE exceeds ${QUALITY_RULES.highCellMae}.`,
    `- Preservation: review when average MAE exceeds ${QUALITY_RULES.maxPreservationMae} or p95 exceeds ${QUALITY_RULES.maxPreservationP95}.`,
    `- Alpha preservation: review when alpha MAE exceeds ${QUALITY_RULES.maxAlphaMae} or p95 exceeds ${QUALITY_RULES.maxAlphaP95}.`,
    `- Contrast: review when snapped contrast ratio falls outside ${QUALITY_RULES.minContrastRatio}-${QUALITY_RULES.maxContrastRatio}.`,
    `- Line strength: review when resized snap edge strength falls outside ${QUALITY_RULES.minLineEdgeRatio}-${QUALITY_RULES.maxLineEdgeRatio}x the source edge strength.`,
    '',
  ]
}

export function toMarkdown(summary) {
  const headers = [
    'dataset',
    'file',
    'input',
    'output',
    'outputCoverage',
    'grid',
    'expectedGrid',
    'sourceCellSize',
    'aspectError',
    'edgeAlignment',
    'axisEdgeAlignmentMin',
    'phaseAlignment',
    'axisPhaseAlignmentMin',
    'cellMae',
    'outputCellMae',
    'preservationMae',
    'preservationP95',
    'alphaMae',
    'alphaP95',
    'contrastRatio',
    'lineEdgeRatio',
    'repeatGridGap',
    'repeatVisualMae',
    'repeatVisualP95',
    'determinismVisualMae',
    'determinismVisualP95',
    'expectedGridGap',
    'inputRgbColorCount',
    'outputRgbColorCount',
    'outputRgbPaletteOverage',
    'lowPaletteRetention',
    'status',
    'issueSummary',
    'objective',
  ]
  const lines = [
    '# Snap Quality Eval',
    '',
    `Color variety: \`${summary.colorVariety}\``,
    '',
    ...criteriaMarkdown(),
    '## Datasets',
    '',
    ...summary.datasets.map((dataset) => `- \`${dataset.name}\`: \`${dataset.dir}\``),
    '',
    '## Aggregate',
    '',
    '```json',
    JSON.stringify(summary.aggregate, null, 2),
    '```',
    '',
    '## Results',
    '',
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
  ]

  for (const result of summary.results) {
    lines.push('| ' + headers.map((header) => String(result[header])).join(' | ') + ' |')
  }

  return `${lines.join('\n')}\n`
}
