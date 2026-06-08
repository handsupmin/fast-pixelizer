import test from 'node:test'
import assert from 'node:assert/strict'
import { alphaMaskStats } from '../scripts/snap-quality/alpha-mask.mjs'
import { cellColorErrorMetrics } from '../scripts/snap-quality/cell-color-error.mjs'
import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'
import { cellColorDominanceMetrics } from '../scripts/snap-quality/cell-dominance.mjs'
import { edgeOverlapStats } from '../scripts/snap-quality/edge-overlap.mjs'
import { gridBoundarySignals, preservationStats } from '../scripts/snap-quality/metrics.mjs'
import { paletteDominanceMetrics } from '../scripts/snap-quality/palette-dominance.mjs'

function makeVerticalStripes(width, height, stripeWidth) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const value = Math.floor(x / stripeWidth) % 2 === 0 ? 0 : 255
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function makeChecker(width, height, cellSize) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const value = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0 ? 0 : 255
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function makeSolid(width, height, value) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { data, width, height }
}

function makeTransparentBox(width, height, left, top, right, bottom) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

test('grid boundary signals expose a weak axis instead of hiding it in the mean', () => {
  const signals = gridBoundarySignals(makeVerticalStripes(64, 64, 8), 8, 8)

  assert.ok(signals.x > 100, `expected strong x-axis boundaries, got ${signals.x}`)
  assert.equal(signals.y, 0)
  assert.ok(
    signals.min < signals.mean,
    `expected min axis ${signals.min} below mean ${signals.mean}`,
  )
})

test('line edge ratio stays near one when the snapped output is identical', async () => {
  const image = makeChecker(64, 64, 8)
  const stats = await preservationStats(image, image)

  assert.ok(
    stats.lineEdgeRatio > 0.99 && stats.lineEdgeRatio < 1.01,
    `expected line edge ratio near 1, got ${stats.lineEdgeRatio}`,
  )
})

test('edge overlap distinguishes preserved and removed line positions', () => {
  const image = makeChecker(64, 64, 8)
  const blank = makeSolid(64, 64, 127)
  const preserved = edgeOverlapStats(image, image.data)
  const removed = edgeOverlapStats(image, blank.data)

  assert.equal(preserved.edgeRecall, 1)
  assert.equal(preserved.edgeSpuriousRatio, 0)
  assert.equal(preserved.edgeJaccard, 1)
  assert.ok(removed.edgeRecall < 0.1, `expected low recall, got ${removed.edgeRecall}`)
  assert.equal(removed.edgeSpuriousRatio, 0)
  assert.ok(removed.edgeJaccard < 0.1, `expected low overlap, got ${removed.edgeJaccard}`)
})

test('alpha mask stats detect shifted transparent silhouettes', () => {
  const source = makeTransparentBox(64, 64, 16, 16, 48, 48)
  const shifted = makeTransparentBox(64, 64, 20, 16, 52, 48)
  const preserved = alphaMaskStats(source, source.data)
  const drifted = alphaMaskStats(source, shifted.data)

  assert.equal(preserved.alphaCoverageRatio, 1)
  assert.equal(preserved.alphaMaskIou, 1)
  assert.equal(preserved.alphaBBoxDriftPx, 0)
  assert.equal(preserved.alphaBBoxDriftRatio, 0)
  assert.equal(drifted.alphaCoverageRatio, 1)
  assert.ok(
    drifted.alphaMaskIou < 0.8,
    `expected shifted IoU below 0.8, got ${drifted.alphaMaskIou}`,
  )
  assert.equal(drifted.alphaBBoxDriftPx, 4)
})

test('cell color dominance separates clean and ambiguous cells', () => {
  const clean = cellColorDominanceMetrics(makeChecker(64, 64, 8), 8, 8)
  const ambiguous = cellColorDominanceMetrics(makeChecker(64, 64, 1), 8, 8)

  assert.equal(clean.mean, 1)
  assert.ok(ambiguous.mean < 0.51, `expected ambiguous dominance near half, got ${ambiguous.mean}`)
})

test('cell color error tracks representative source cell color drift', () => {
  const clean = cellColorErrorMetrics(makeChecker(64, 64, 8), makeChecker(8, 8, 1))
  const drifted = cellColorErrorMetrics(makeChecker(64, 64, 8), makeSolid(8, 8, 127))

  assert.equal(clean.cellColorErrorMean, 0)
  assert.equal(clean.cellColorErrorP95, 0)
  assert.equal(clean.cellColorErrorMax, 0)
  assert.ok(
    drifted.cellColorErrorMean > 120,
    `expected high representative color error, got ${drifted.cellColorErrorMean}`,
  )
})

test('palette dominance detects output color collapse beyond source dominance', () => {
  const input = makeChecker(64, 64, 8)
  const collapsed = makeSolid(8, 8, 0)
  const preserved = paletteDominanceMetrics(input, makeChecker(8, 8, 1))
  const drifted = paletteDominanceMetrics(input, collapsed)

  assert.equal(preserved.outputColorDominance, 0.5)
  assert.equal(preserved.paletteDominanceDelta, 0)
  assert.equal(drifted.outputColorDominance, 1)
  assert.equal(drifted.paletteDominanceDelta, 0.5)
})

test('quality classification fails when repeat snap changes visuals', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 0,
    alphaBBoxDriftRatio: 0,
    alphaCoverageRatio: 1,
    alphaMaskIou: 1,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 1,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'unstable-repeat-visuals'))
})

test('quality classification fails when same input snap is visually non-deterministic', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 0,
    alphaBBoxDriftRatio: 0,
    alphaCoverageRatio: 1,
    alphaMaskIou: 1,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0.001,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'non-deterministic-visuals'))
})

test('quality classification reviews weak edge map overlap', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 0,
    alphaBBoxDriftRatio: 0,
    alphaCoverageRatio: 1,
    alphaMaskIou: 1,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 0.1,
    edgeRecall: 0.2,
    edgeSpuriousRatio: 0.8,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'edge-recall-loss'))
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-edge-growth'))
  assert.ok(result.issues.some((issue) => issue.code === 'edge-map-drift'))
})

test('quality classification reviews alpha silhouette drift', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 4,
    alphaBBoxDriftRatio: 0.0625,
    alphaCoverageRatio: 0.9,
    alphaMaskIou: 0.75,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-coverage-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-mask-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-bounds-drift'))
})

test('quality classification reviews cell representative color drift', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 0,
    alphaBBoxDriftRatio: 0,
    alphaCoverageRatio: 1,
    alphaMaskIou: 1,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 100,
    cellColorErrorMean: 31,
    cellColorErrorP95: 56,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-color-drift'))
})

test('quality classification reviews palette dominance collapse', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaBBoxDriftPx: 0,
    alphaBBoxDriftRatio: 0,
    alphaCoverageRatio: 1,
    alphaMaskIou: 1,
    alphaP95: 0,
    aspectError: 0,
    axisEdgeAlignmentMin: 1,
    axisPhaseAlignmentMin: 1,
    cellMae: 0,
    cellColorDominance: 1,
    cellColorDominanceP05: 1,
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cols: 32,
    contrastRatio: 1,
    determinismGridGap: 0,
    determinismVisualMae: 0,
    determinismVisualP95: 0,
    edgeAlignment: 1,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    expectedGridGap: 0,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCoverage: 1,
    outputColorDominance: 0.9,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0.3,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'palette-dominance-collapse'))
})
