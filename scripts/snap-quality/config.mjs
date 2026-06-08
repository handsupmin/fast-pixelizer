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
  maxExpectedGridGap: 0,
  minEdgeAlignment: 0.6,
  minPhaseAlignment: 0.5,
  highCellMae: 18,
  maxPreservationMae: 38,
  maxPreservationP95: 86,
  maxAlphaMae: 8,
  maxAlphaP95: 40,
  maxOutputCellMae: 0.01,
  maxOutputSquareCellError: 0.001,
  maxOutputRgbPaletteOverage: 0,
  minLowPaletteRetention: 0.95,
  minOutputCoverage: 0.9,
  minContrastRatio: 0.45,
  maxContrastRatio: 1.8,
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
