import test from 'node:test'
import assert from 'node:assert/strict'
import { alphaMaskStats } from '../scripts/snap-quality/alpha-mask.mjs'
import { cellColorErrorMetrics } from '../scripts/snap-quality/cell-color-error.mjs'
import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'
import { cellColorDominanceMetrics } from '../scripts/snap-quality/cell-dominance.mjs'
import { edgeOverlapStats } from '../scripts/snap-quality/edge-overlap.mjs'
import { gridBoundarySignals, preservationStats } from '../scripts/snap-quality/metrics.mjs'
import { cellTransitionMetrics } from '../scripts/snap-quality/cell-transition.mjs'
import { paletteDominanceMetrics } from '../scripts/snap-quality/palette-dominance.mjs'
import { paletteUtilizationMetrics } from '../scripts/snap-quality/palette-utilization.mjs'

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

function makeRgbSolid(width, height, red, green, blue) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = red
    data[i + 1] = green
    data[i + 2] = blue
    data[i + 3] = 255
  }
  return { data, width, height }
}

function makeRgbSplit(width, height, splitX, left, right) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const color = x < splitX ? left : right
      data[i] = color[0]
      data[i + 1] = color[1]
      data[i + 2] = color[2]
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function makePatchedSolid(width, height, value, patch) {
  const image = makeSolid(width, height, value)
  for (let y = patch.top; y < patch.bottom; y++) {
    for (let x = patch.left; x < patch.right; x++) {
      const i = (y * width + x) * 4
      image.data[i] = patch.value
      image.data[i + 1] = patch.value
      image.data[i + 2] = patch.value
    }
  }
  return image
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

function clearAlphaRect(image, left, top, right, bottom) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      image.data[(y * image.width + x) * 4 + 3] = 0
    }
  }
  return image
}

function setAlphaRect(image, left, top, right, bottom, alpha) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      image.data[(y * image.width + x) * 4 + 3] = alpha
    }
  }
  return image
}

function makeColorGrid(cols, rows, cellSize) {
  const width = cols * cellSize
  const data = new Uint8ClampedArray(width * rows * cellSize * 4)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const seed = row * cols + col
      for (let y = row * cellSize; y < (row + 1) * cellSize; y++) {
        for (let x = col * cellSize; x < (col + 1) * cellSize; x++) {
          const i = (y * width + x) * 4
          data[i] = (seed * 37) % 256
          data[i + 1] = (seed * 67) % 256
          data[i + 2] = (seed * 97) % 256
          data[i + 3] = 255
        }
      }
    }
  }
  return { data, width, height: rows * cellSize }
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

test('tile preservation catches small localized loss below pixel p95', async () => {
  const source = makeSolid(64, 64, 0)
  const output = makePatchedSolid(64, 64, 0, {
    bottom: 8,
    left: 0,
    right: 8,
    top: 0,
    value: 255,
  })
  const stats = await preservationStats(source, output)

  assert.equal(stats.p95, 0)
  assert.equal(stats.tileMaxMae, 255)
  assert.equal(stats.tileP95Mae, 0)
})

test('chroma ratio detects desaturated colorful output', async () => {
  const source = makeColorGrid(8, 8, 8)
  const output = makeSolid(64, 64, 96)
  const stats = await preservationStats(source, output)

  assert.ok(stats.inputChromaMean > 8, `expected colorful source, got ${stats.inputChromaMean}`)
  assert.equal(stats.outputChromaMean, 0)
  assert.equal(stats.chromaRatio, 0)
})

test('hue error detects color direction drift', async () => {
  const source = makeRgbSolid(64, 64, 255, 0, 0)
  const output = makeRgbSolid(64, 64, 0, 255, 0)
  const stats = await preservationStats(source, output)

  assert.equal(stats.hueSampleCount, 4096)
  assert.equal(stats.hueErrorMean, 120)
  assert.equal(stats.hueErrorP95, 120)
})

test('rgb coverage drift tracks low-palette color area changes', async () => {
  const source = makeRgbSplit(64, 64, 32, [0, 0, 0], [255, 255, 255])
  const output = makeRgbSplit(64, 64, 16, [0, 0, 0], [255, 255, 255])
  const stats = await preservationStats(source, output)

  assert.equal(stats.rgbCoverageDrift, 0.25)
  assert.equal(stats.rgbCoverageRetention, 0.75)
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

test('alpha edge stats detect lost transparent cutouts with high mask IoU', () => {
  const source = clearAlphaRect(makeTransparentBox(64, 64, 16, 16, 48, 48), 31, 24, 32, 40)
  const filled = makeTransparentBox(64, 64, 16, 16, 48, 48)
  const stats = alphaMaskStats(source, filled.data)

  assert.ok(
    stats.alphaCoverageRatio < 1.02,
    `expected coverage inside tolerance, got ${stats.alphaCoverageRatio}`,
  )
  assert.ok(
    stats.alphaMaskIou > 0.98,
    `expected mask IoU inside tolerance, got ${stats.alphaMaskIou}`,
  )
  assert.ok(
    stats.alphaEdgeRecall < 0.9,
    `expected edge recall below 0.9, got ${stats.alphaEdgeRecall}`,
  )
  assert.ok(
    stats.alphaEdgeJaccard < 0.9,
    `expected edge overlap below 0.9, got ${stats.alphaEdgeJaccard}`,
  )
})

test('alpha component stats detect lost detached details with high mask IoU', () => {
  const source = makeTransparentBox(64, 64, 16, 16, 48, 48)
  const detached = makeTransparentBox(64, 64, 4, 4, 6, 6)
  for (let i = 0; i < detached.data.length; i += 4) {
    if (detached.data[i + 3] === 0) continue
    source.data[i] = detached.data[i]
    source.data[i + 1] = detached.data[i + 1]
    source.data[i + 2] = detached.data[i + 2]
    source.data[i + 3] = detached.data[i + 3]
  }
  const output = makeTransparentBox(64, 64, 16, 16, 48, 48)
  const stats = alphaMaskStats(source, output.data)

  assert.ok(
    stats.alphaMaskIou > 0.99,
    `expected lost detail to keep high mask IoU, got ${stats.alphaMaskIou}`,
  )
  assert.equal(stats.alphaComponentCount, 2)
  assert.equal(stats.outputAlphaComponentCount, 1)
  assert.equal(stats.alphaComponentCountDrift, 1)
  assert.equal(stats.alphaSmallComponentCount, 1)
  assert.equal(stats.outputAlphaSmallComponentCount, 0)
  assert.equal(stats.alphaSmallComponentCountDrift, 1)
})

test('alpha semitransparency stats detect collapsed rare shadows with low alpha MAE', async () => {
  const source = setAlphaRect(makeSolid(64, 64, 96), 4, 4, 8, 8, 128)
  const output = makeSolid(64, 64, 96)
  const stats = await preservationStats(source, output, { alphaMask: true })

  assert.ok(stats.alphaMae < 1, `expected low alpha MAE, got ${stats.alphaMae}`)
  assert.equal(stats.alphaP95, 0)
  assert.equal(stats.alphaCoverageRatio, 1)
  assert.equal(stats.alphaMaskIou, 1)
  assert.equal(stats.alphaSemitransparentPixelCount, 16)
  assert.equal(stats.outputAlphaSemitransparentPixelCount, 0)
  assert.equal(stats.alphaSemitransparentRetention, 0)
  assert.equal(stats.alphaSemitransparentSpuriousRatio, 0)
  assert.equal(stats.alphaSemitransparentValueMae, 127)
  assert.equal(stats.alphaSemitransparentValueP95, 127)
})

test('alpha semitransparency value stats detect changed shadow opacity with low alpha MAE', async () => {
  const source = setAlphaRect(makeSolid(64, 64, 96), 4, 4, 8, 8, 128)
  const output = setAlphaRect(makeSolid(64, 64, 96), 4, 4, 8, 8, 64)
  const stats = await preservationStats(source, output, { alphaMask: true })

  assert.ok(stats.alphaMae < 1, `expected low alpha MAE, got ${stats.alphaMae}`)
  assert.equal(stats.alphaP95, 0)
  assert.equal(stats.alphaCoverageRatio, 1)
  assert.equal(stats.alphaMaskIou, 1)
  assert.equal(stats.alphaSemitransparentRetention, 1)
  assert.equal(stats.alphaSemitransparentSpuriousRatio, 0)
  assert.equal(stats.alphaSemitransparentValueMae, 64)
  assert.equal(stats.alphaSemitransparentValueP95, 64)
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

test('palette utilization detects underused output palette on rich inputs', () => {
  const input = makeColorGrid(8, 8, 4)
  const rich = makeColorGrid(8, 8, 1)
  const collapsed = makeSolid(8, 8, 0)
  const preserved = paletteUtilizationMetrics(input, rich, 64)
  const drifted = paletteUtilizationMetrics(input, collapsed, 64)

  assert.equal(preserved.paletteUtilizationTarget, 64)
  assert.equal(preserved.outputPaletteUtilization, 1)
  assert.equal(preserved.paletteUtilizationGap, 0)
  assert.equal(drifted.paletteUtilizationTarget, 64)
  assert.equal(drifted.outputPaletteColorCount, 1)
  assert.ok(
    drifted.outputPaletteUtilization < 0.02,
    `expected collapsed palette utilization below 0.02, got ${drifted.outputPaletteUtilization}`,
  )
})

test('cell transitions distinguish retained, removed, and spurious boundaries', () => {
  const input = makeChecker(64, 64, 8)
  const retained = cellTransitionMetrics(input, makeChecker(8, 8, 1))
  const removed = cellTransitionMetrics(input, makeSolid(8, 8, 0))
  const spurious = cellTransitionMetrics(makeSolid(64, 64, 255), makeChecker(8, 8, 1))

  assert.equal(retained.cellTransitionRetention, 1)
  assert.equal(retained.cellTransitionSpuriousRatio, 0)
  assert.equal(retained.cellTransitionErrorMean, 0)
  assert.equal(retained.cellTransitionAxisRetentionMin, 1)
  assert.equal(retained.cellTransitionAxisSpuriousRatioMax, 0)
  assert.ok(removed.cellTransitionRetention < 0.01)
  assert.equal(removed.outputCellTransitionCount, 0)
  assert.equal(spurious.sourceCellTransitionCount, 0)
  assert.equal(spurious.cellTransitionSpuriousRatio, 1)
  assert.equal(spurious.cellTransitionAxisSpuriousRatioMax, 1)
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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

test('quality classification reviews alpha edge drift', () => {
  const result = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 0.7,
    alphaEdgeRecall: 0.8,
    alphaEdgeSpuriousRatio: 0,
    outputAlphaEdgeCount: 128,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-edge-loss'))
})

test('quality classification reviews spurious alpha edge growth', () => {
  const result = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 1,
    alphaEdgeRecall: 1,
    alphaEdgeSpuriousRatio: 0.2,
    outputAlphaEdgeCount: 128,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-alpha-edge-growth'))
})

test('quality classification reviews alpha component count drift', () => {
  const result = classifyMetrics({
    alphaComponentCount: 2,
    alphaComponentCountDrift: 1,
    alphaSmallComponentCount: 1,
    alphaSmallComponentCountDrift: 1,
    outputAlphaComponentCount: 1,
    outputAlphaSmallComponentCount: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-small-component-drift'))
})

test('quality classification reviews alpha semitransparency drift', () => {
  const result = classifyMetrics({
    alphaSemitransparentPixelCount: 16,
    alphaSemitransparentRetention: 0.9,
    alphaSemitransparentSpuriousRatio: 0.2,
    alphaSemitransparentValueMae: 0,
    alphaSemitransparentValueP95: 0,
    outputAlphaSemitransparentPixelCount: 16,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-semitransparency-loss'))
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-alpha-semitransparency'))
})

test('quality classification reviews alpha semitransparency value drift', () => {
  const result = classifyMetrics({
    alphaSemitransparentPixelCount: 16,
    alphaSemitransparentRetention: 1,
    alphaSemitransparentSpuriousRatio: 0,
    alphaSemitransparentValueMae: 9,
    alphaSemitransparentValueP95: 17,
    outputAlphaSemitransparentPixelCount: 16,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-semitransparency-value-drift'))
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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

test('quality classification reviews rare exact low-palette cell drift', () => {
  const result = classifyMetrics({
    cellColorErrorMax: 128,
    cellColorErrorMean: 0.1,
    cellColorErrorP95: 0,
    exactLowPaletteCellColorEligible: true,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'rare-cell-color-drift'))
  assert.ok(!result.issues.some((issue) => issue.code === 'cell-color-drift'))
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
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0.3,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
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

test('quality classification reviews underused palette on rich inputs', () => {
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
    outputColorDominance: 0.4,
    outputPaletteColorCount: 12,
    outputPaletteUtilization: 0.375,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 20,
    paletteUtilizationTarget: 32,
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
  assert.ok(result.issues.some((issue) => issue.code === 'palette-underused'))
})

test('quality classification reviews lost cell transitions', () => {
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
    cellTransitionErrorMean: 60,
    cellTransitionRetention: 0.4,
    cellTransitionSpuriousRatio: 0,
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
    outputCellTransitionCount: 0,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-transition-loss'))
})

test('quality classification reviews spurious cell transitions', () => {
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
    cellTransitionErrorMean: 60,
    cellTransitionRetention: 1,
    cellTransitionSpuriousRatio: 0.6,
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
    outputCellTransitionCount: 64,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 0,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-cell-transitions'))
})

test('quality classification reviews one-axis cell transition loss', () => {
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
    cellTransitionAxisRetentionMin: 0.4,
    cellTransitionAxisSpuriousRatioMax: 0,
    cellTransitionErrorMean: 20,
    cellTransitionRetention: 0.8,
    cellTransitionSpuriousRatio: 0,
    cellTransitionXRetention: 0.4,
    cellTransitionXSpuriousRatio: 0,
    cellTransitionYRetention: 1,
    cellTransitionYSpuriousRatio: 0,
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
    outputCellTransitionCount: 64,
    outputCellTransitionXCount: 32,
    outputCellTransitionYCount: 32,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'axis-cell-transition-loss'))
  assert.ok(!result.issues.some((issue) => issue.code === 'cell-transition-loss'))
})

test('quality classification reviews one-axis spurious cell transitions', () => {
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
    cellTransitionAxisRetentionMin: 1,
    cellTransitionAxisSpuriousRatioMax: 0.6,
    cellTransitionErrorMean: 20,
    cellTransitionRetention: 1,
    cellTransitionSpuriousRatio: 0.3,
    cellTransitionXRetention: 1,
    cellTransitionXSpuriousRatio: 0.6,
    cellTransitionYRetention: 1,
    cellTransitionYSpuriousRatio: 0,
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
    outputCellTransitionCount: 64,
    outputCellTransitionXCount: 32,
    outputCellTransitionYCount: 32,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
    squareCellError: 0,
    stabilityDepthGap: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'axis-spurious-cell-transitions'))
  assert.ok(!result.issues.some((issue) => issue.code === 'spurious-cell-transitions'))
})

test('quality classification reviews regional preservation loss', () => {
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
    cellTransitionAxisRetentionMin: 1,
    cellTransitionAxisSpuriousRatioMax: 0,
    cellTransitionErrorMean: 0,
    cellTransitionRetention: 1,
    cellTransitionSpuriousRatio: 0,
    cellTransitionXRetention: 1,
    cellTransitionXSpuriousRatio: 0,
    cellTransitionYRetention: 1,
    cellTransitionYSpuriousRatio: 0,
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
    outputCellTransitionCount: 64,
    outputCellTransitionXCount: 32,
    outputCellTransitionYCount: 32,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 5,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
    squareCellError: 0,
    stabilityDepthGap: 0,
    tilePreservationMaxMae: 60,
    tilePreservationP95Mae: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-preservation-loss'))
  assert.ok(!result.issues.some((issue) => issue.code === 'localized-preservation-loss'))
})

test('quality classification reviews chroma drift on colorful inputs', () => {
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
    cellTransitionAxisRetentionMin: 1,
    cellTransitionAxisSpuriousRatioMax: 0,
    cellTransitionErrorMean: 0,
    cellTransitionRetention: 1,
    cellTransitionSpuriousRatio: 0,
    cellTransitionXRetention: 1,
    cellTransitionXSpuriousRatio: 0,
    cellTransitionYRetention: 1,
    cellTransitionYSpuriousRatio: 0,
    chromaRatio: 0.25,
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
    inputChromaMean: 48,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCellTransitionCount: 64,
    outputCellTransitionXCount: 32,
    outputCellTransitionYCount: 32,
    outputChromaMean: 12,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
    squareCellError: 0,
    stabilityDepthGap: 0,
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'chroma-drift'))
})

test('quality classification reviews low-palette coverage drift', () => {
  const result = classifyMetrics({
    lowPaletteCoverageDrift: 0.04,
    lowPaletteCoverageEligible: true,
    lowPaletteCoverageRetention: 0.96,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'low-palette-coverage-drift'))
})

test('quality classification reviews hue drift on colorful inputs', () => {
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
    cellTransitionAxisRetentionMin: 1,
    cellTransitionAxisSpuriousRatioMax: 0,
    cellTransitionErrorMean: 0,
    cellTransitionRetention: 1,
    cellTransitionSpuriousRatio: 0,
    cellTransitionXRetention: 1,
    cellTransitionXSpuriousRatio: 0,
    cellTransitionYRetention: 1,
    cellTransitionYSpuriousRatio: 0,
    chromaRatio: 1,
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
    hueErrorMean: 30,
    hueErrorP95: 100,
    hueSampleCount: 4096,
    inputChromaMean: 48,
    lineEdgeRatio: 1,
    lowPaletteRetention: 1,
    outputCellMae: 0,
    outputCellTransitionCount: 64,
    outputCellTransitionXCount: 32,
    outputCellTransitionYCount: 32,
    outputChromaMean: 48,
    outputCoverage: 1,
    outputColorDominance: 0.5,
    outputPaletteColorCount: 32,
    outputPaletteUtilization: 1,
    outputRgbPaletteOverage: 0,
    paletteDominanceDelta: 0,
    paletteUtilizationGap: 0,
    paletteUtilizationTarget: 32,
    preservationMae: 0,
    preservationP95: 0,
    repeatGridGap: 0,
    repeatVisualMae: 0,
    repeatVisualP95: 0,
    rows: 32,
    shortAxisCells: 32,
    sourceCellSize: 8,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
    squareCellError: 0,
    stabilityDepthGap: 0,
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'hue-drift'))
})
