import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DEFAULT_MODEL_DIR = path.resolve(ROOT, '../mono-pix/src/assets/examples')
export const DEFAULT_DEMO_DIR = path.resolve(ROOT, 'examples')
export const DEFAULT_OUT_DIR = path.resolve(ROOT, '.tmp/snap-quality-eval')
export const MAX_METRIC_SAMPLES = 500_000

export const QUALITY_RULES = {
  maxAspectError: 0.03,
  maxShortAxisCells: 256,
  minSourceCellSize: 3,
  maxSourceCellSizeReview: 64,
  maxRepeatGridGapFloor: 2,
  maxRepeatGridGapRate: 0.01,
  maxRepeatVisualMae: 0.5,
  maxRepeatVisualP95: 2,
  maxDeterminismVisualMae: 0,
  maxDeterminismVisualP95: 0,
  maxExpectedGridGap: 0,
  minEdgeAlignment: 0.6,
  minAxisEdgeAlignment: 0.35,
  minPhaseAlignment: 0.5,
  minAxisPhaseAlignment: 0.35,
  minCellColorDominance: 0.18,
  maxCellColorErrorMean: 30,
  maxCellColorErrorP95: 55,
  minCellTransitionCount: 24,
  minCellTransitionRetention: 0.7,
  maxCellTransitionSpuriousRatio: 0.45,
  highCellMae: 18,
  maxPreservationMae: 38,
  maxPreservationP95: 86,
  maxTilePreservationMae: 40,
  maxTilePreservationP95: 35,
  minChromaMeanForRatio: 8,
  minChromaRatio: 0.9,
  maxChromaRatio: 1.2,
  maxAlphaMae: 8,
  maxAlphaP95: 40,
  minAlphaCoverageRatio: 0.98,
  maxAlphaCoverageRatio: 1.02,
  minAlphaMaskIou: 0.98,
  maxAlphaBBoxDriftRatio: 0.01,
  maxOutputCellMae: 0.01,
  maxOutputSquareCellError: 0.001,
  maxOutputRgbPaletteOverage: 0,
  maxOutputColorDominance: 0.65,
  maxPaletteDominanceDelta: 0.2,
  minPaletteUtilizationTarget: 16,
  minOutputPaletteUtilization: 0.5,
  minLowPaletteRetention: 0.95,
  minOutputCoverage: 0.9,
  minContrastRatio: 0.45,
  maxContrastRatio: 1.8,
  minLineEdgeRatio: 0.3,
  maxLineEdgeRatio: 2.4,
  minEdgeRecall: 0.65,
  maxEdgeSpuriousRatio: 0.5,
  minEdgeJaccard: 0.4,
}

export const KNOWN_EXPECTATIONS = [
  ['demo-examples/example-32-clean.png', { cols: 32, rows: 32 }],
  ['demo-examples/example-32-detail.png', { cols: 32, rows: 32 }],
  ['demo-examples/example-64-clean.png', { cols: 64, rows: 64 }],
  ['demo-examples/example-64-detail.png', { cols: 64, rows: 64 }],
]

export function defaultDatasets() {
  return [
    { name: 'model-examples', dir: DEFAULT_MODEL_DIR },
    { name: 'demo-examples', dir: DEFAULT_DEMO_DIR },
  ]
}
