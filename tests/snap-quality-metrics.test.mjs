import test from 'node:test'
import assert from 'node:assert/strict'
import { alphaMaskStats } from '../scripts/snap-quality/alpha-mask.mjs'
import { cellColorComponentMetrics } from '../scripts/snap-quality/cell-color-components.mjs'
import { cellColorErrorMetrics } from '../scripts/snap-quality/cell-color-error.mjs'
import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'
import { cellColorDominanceMetrics } from '../scripts/snap-quality/cell-dominance.mjs'
import { edgeOverlapStats } from '../scripts/snap-quality/edge-overlap.mjs'
import {
  cellUniformityMetrics,
  gridBoundarySignals,
  preservationStats,
} from '../scripts/snap-quality/metrics.mjs'
import { cellTransitionMetrics } from '../scripts/snap-quality/cell-transition.mjs'
import { paletteDominanceMetrics } from '../scripts/snap-quality/palette-dominance.mjs'
import { paletteUtilizationMetrics } from '../scripts/snap-quality/palette-utilization.mjs'
import { QUALITY_RULES } from '../scripts/snap-quality/config.mjs'

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

function makeHorizontalStripes(width, height, stripeHeight) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const value = Math.floor(y / stripeHeight) % 2 === 0 ? 0 : 255
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

function copyImage(image) {
  return {
    data: new Uint8ClampedArray(image.data),
    height: image.height,
    width: image.width,
  }
}

function setRgbRect(image, left, top, right, bottom, value) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = value
      image.data[i + 1] = value
      image.data[i + 2] = value
      image.data[i + 3] = 255
    }
  }
  return image
}

function setColorRect(image, left, top, right, bottom, color) {
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = color[0]
      image.data[i + 1] = color[1]
      image.data[i + 2] = color[2]
      image.data[i + 3] = color[3] ?? 255
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

function makeCellImage(keys, cols, rows, cellSize) {
  const width = cols * cellSize
  const height = rows * cellSize
  const data = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const color = keys[row * cols + col]
      for (let y = row * cellSize; y < (row + 1) * cellSize; y++) {
        for (let x = col * cellSize; x < (col + 1) * cellSize; x++) {
          const i = (y * width + x) * 4
          data[i] = color[0]
          data[i + 1] = color[1]
          data[i + 2] = color[2]
          data[i + 3] = color[3] ?? 255
        }
      }
    }
  }

  return { data, width, height }
}

function makeCellGrid(keys, cols, rows) {
  const data = new Uint8ClampedArray(cols * rows * 4)

  for (let cell = 0; cell < keys.length; cell++) {
    const color = keys[cell]
    const i = cell * 4
    data[i] = color[0]
    data[i + 1] = color[1]
    data[i + 2] = color[2]
    data[i + 3] = color[3] ?? 255
  }

  return { data, width: cols, height: rows }
}

function makeAlphaCells(width, height, cells) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of cells) {
    const i = (y * width + x) * 4
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
    data[i + 3] = 255
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

test('edge overlap tracks strong edge direction drift', () => {
  const vertical = makeVerticalStripes(64, 64, 8)
  const horizontal = makeHorizontalStripes(64, 64, 8)
  const preserved = edgeOverlapStats(vertical, vertical.data)
  const rotated = edgeOverlapStats(vertical, horizontal.data)

  assert.equal(preserved.edgeDirectionDrift, 0)
  assert.ok(preserved.sourceEdgeDirectionCount > 64)
  assert.ok(preserved.outputEdgeDirectionCount > 64)
  assert.ok(
    rotated.edgeDirectionDrift > 0.9,
    `expected large edge direction drift, got ${rotated.edgeDirectionDrift}`,
  )
})

test('edge overlap tracks direction-preserving edge loss and growth', () => {
  const vertical = makeVerticalStripes(64, 64, 4)
  const horizontal = makeHorizontalStripes(64, 64, 4)
  const preserved = edgeOverlapStats(vertical, vertical.data)
  const changedDirection = edgeOverlapStats(vertical, horizontal.data)

  assert.equal(preserved.directedEdgeRecallMin, 1)
  assert.equal(preserved.directedEdgeJaccardMin, 1)
  assert.ok(
    changedDirection.directedEdgeRecallMin < 0.2,
    `expected directed edge recall loss, got ${changedDirection.directedEdgeRecallMin}`,
  )
  assert.ok(
    changedDirection.directedEdgeJaccardMin < 0.2,
    `expected directed edge overlap loss, got ${changedDirection.directedEdgeJaccardMin}`,
  )
  assert.ok(
    changedDirection.directedEdgeSpuriousMax > 0.8,
    `expected directed spurious edge growth, got ${changedDirection.directedEdgeSpuriousMax}`,
  )
})

test('edge overlap tracks localized tile edge loss and growth', () => {
  const source = makeVerticalStripes(64, 64, 4)
  const localLoss = setRgbRect(copyImage(source), 0, 0, 16, 16, 0)
  const solid = makeSolid(64, 64, 0)
  const localGrowth = setRgbRect(copyImage(solid), 0, 0, 16, 16, 255)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x += 4) {
      setRgbRect(localGrowth, x, y, Math.min(16, x + 2), y + 1, 0)
    }
  }

  const preserved = edgeOverlapStats(source, source.data)
  const loss = edgeOverlapStats(source, localLoss.data)
  const growth = edgeOverlapStats(solid, localGrowth.data)

  assert.equal(preserved.edgeTileRecallMin, 1)
  assert.equal(preserved.edgeTileJaccardMin, 1)
  assert.ok(
    loss.edgeTileRecallMin < 0.5,
    `expected regional edge loss, got ${loss.edgeTileRecallMin}`,
  )
  assert.ok(
    loss.edgeTileJaccardMin < 0.5,
    `expected regional edge overlap loss, got ${loss.edgeTileJaccardMin}`,
  )
  assert.ok(
    growth.edgeTileSpuriousMax > 0.9,
    `expected regional spurious edge growth, got ${growth.edgeTileSpuriousMax}`,
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

test('border preservation catches edge-only drift below global preservation thresholds', async () => {
  const source = makeSolid(64, 64, 0)
  const output = copyImage(source)
  setRgbRect(output, 0, 0, 64, 2, 255)
  setRgbRect(output, 0, 62, 64, 64, 255)
  setRgbRect(output, 0, 0, 2, 64, 255)
  setRgbRect(output, 62, 0, 64, 64, 255)

  const stats = await preservationStats(source, output, { borderBandPx: 2 })

  assert.ok(
    stats.mae < QUALITY_RULES.maxPreservationMae,
    `expected global MAE below preservation threshold, got ${stats.mae}`,
  )
  assert.equal(stats.borderMae, 255)
})

test('tile luma mean delta catches localized brightness drift hidden by preservation stats', async () => {
  const source = makeSolid(64, 64, 32)
  const output = setRgbRect(copyImage(source), 0, 0, 8, 8, 48)
  const stats = await preservationStats(source, output, { tileGrid: 8 })

  assert.ok(stats.mae < 1, `expected low global MAE, got ${stats.mae}`)
  assert.equal(stats.p95, 0)
  assert.ok(
    stats.tileMaxMae < QUALITY_RULES.maxTilePreservationMae,
    `expected tile MAE below review threshold, got ${stats.tileMaxMae}`,
  )
  assert.equal(stats.tileLumaMeanDeltaTileCount, 64)
  assert.ok(
    Math.abs(stats.tileLumaMeanDeltaMax - 16) < 1e-9,
    `expected max tile luma mean delta near 16, got ${stats.tileLumaMeanDeltaMax}`,
  )
  assert.equal(stats.tileLumaMeanDeltaP95, 0)
})

test('tile luma p95 catches broad moderate brightness drift below max-tile luma', async () => {
  const source = makeSolid(64, 64, 32)
  const output = makeSolid(64, 64, 41)
  const stats = await preservationStats(source, output, { tileGrid: 8 })

  assert.ok(
    stats.tileLumaMeanDeltaMax < QUALITY_RULES.maxTileLumaMeanDelta,
    `expected max tile luma below threshold, got ${stats.tileLumaMeanDeltaMax}`,
  )
  assert.ok(
    stats.tileLumaMeanDeltaP95 > QUALITY_RULES.maxTileLumaMeanDeltaP95,
    `expected tile luma p95 above threshold, got ${stats.tileLumaMeanDeltaP95}`,
  )
})

test('tile contrast catches localized contrast collapse hidden by global contrast', async () => {
  const source = makeChecker(16, 16, 1)
  const output = setRgbRect(copyImage(source), 0, 0, 8, 8, 128)
  const stats = await preservationStats(source, output, { tileGrid: 2 })

  assert.equal(stats.tileContrastTileCount, 4)
  assert.ok(
    stats.tileContrastRatioMin < 1e-6,
    `expected collapsed tile contrast near 0, got ${stats.tileContrastRatioMin}`,
  )
  assert.ok(
    stats.tileContrastRatioMax > 0.99 && stats.tileContrastRatioMax < 1.01,
    `expected preserved tile contrast near 1, got ${stats.tileContrastRatioMax}`,
  )
})

test('tile line edge ratio catches localized edge collapse', async () => {
  const source = makeChecker(32, 32, 1)
  const output = setRgbRect(copyImage(source), 0, 0, 16, 16, 128)
  const stats = await preservationStats(source, output, { tileGrid: 2 })

  assert.equal(stats.tileLineEdgeTileCount, 4)
  assert.ok(
    stats.tileLineEdgeRatioMin < 0.3,
    `expected collapsed tile line edge ratio below 0.3, got ${stats.tileLineEdgeRatioMin}`,
  )
  assert.ok(
    stats.tileLineEdgeRatioMax > 0.99 && stats.tileLineEdgeRatioMax < 1.01,
    `expected preserved tile line edge ratio near 1, got ${stats.tileLineEdgeRatioMax}`,
  )
})

test('edge magnitude histogram drift catches changed edge strength distribution', async () => {
  const source = makeChecker(64, 64, 4)
  const preserved = await preservationStats(source, source)
  const flattened = await preservationStats(source, makeSolid(64, 64, 127))

  assert.equal(preserved.edgeMagnitudeHistogramDrift, 0)
  assert.ok(
    flattened.edgeMagnitudeHistogramDrift > QUALITY_RULES.maxEdgeMagnitudeHistogramDrift,
    `expected high edge magnitude histogram drift, got ${flattened.edgeMagnitudeHistogramDrift}`,
  )
})

test('tile edge magnitude histogram drift catches regional strength distribution changes', async () => {
  const source = makeChecker(64, 64, 4)
  const preserved = await preservationStats(source, source, { tileGrid: 8 })
  const flattened = await preservationStats(source, makeSolid(64, 64, 127), { tileGrid: 8 })

  assert.equal(preserved.tileEdgeMagnitudeHistogramDriftP95, 0)
  assert.equal(preserved.tileEdgeMagnitudeHistogramTileCount, 36)
  assert.ok(
    flattened.tileEdgeMagnitudeHistogramDriftP95 >
      QUALITY_RULES.maxTileEdgeMagnitudeHistogramDriftP95,
    `expected high regional edge magnitude histogram drift, got ${flattened.tileEdgeMagnitudeHistogramDriftP95}`,
  )
})

test('cell uniformity tracks alpha variation separately from RGB variation', () => {
  const image = makeSolid(16, 16, 96)
  setAlphaRect(image, 0, 0, 4, 8, 0)
  const stats = cellUniformityMetrics(image, 2, 2)

  assert.equal(stats.cellMae, 0)
  assert.ok(stats.alphaCellMae > 31, `expected alpha cell MAE above 31, got ${stats.alphaCellMae}`)
})

test('chroma ratio detects desaturated colorful output', async () => {
  const source = makeColorGrid(8, 8, 8)
  const output = makeSolid(64, 64, 96)
  const stats = await preservationStats(source, output)

  assert.ok(stats.inputChromaMean > 8, `expected colorful source, got ${stats.inputChromaMean}`)
  assert.equal(stats.outputChromaMean, 0)
  assert.equal(stats.chromaRatio, 0)
})

test('colorful spurious ratio catches output-only colorful pixels', async () => {
  const source = makeSolid(64, 64, 96)
  const output = setColorRect(copyImage(source), 0, 0, 16, 16, [255, 0, 0])
  const stats = await preservationStats(source, output)

  assert.equal(stats.sourceColorfulPixelCount, 0)
  assert.equal(stats.outputColorfulPixelCount, 256)
  assert.equal(stats.retainedColorfulPixelCount, 0)
  assert.equal(stats.spuriousColorfulPixelCount, 256)
  assert.equal(stats.colorfulRetention, 1)
  assert.equal(stats.colorfulSpuriousRatio, 1)
})

test('tile chroma ratio catches localized desaturation hidden by global chroma', async () => {
  const source = makeCellImage(
    [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ],
    2,
    2,
    8,
  )
  const output = setColorRect(copyImage(source), 0, 0, 8, 8, [128, 128, 128])
  const stats = await preservationStats(source, output, { tileGrid: 2 })

  assert.equal(stats.tileChromaTileCount, 4)
  assert.equal(stats.tileChromaRatioMin, 0)
  assert.equal(stats.tileChromaRatioMax, 1)
})

test('hue error detects color direction drift', async () => {
  const source = makeRgbSolid(64, 64, 255, 0, 0)
  const output = makeRgbSolid(64, 64, 0, 255, 0)
  const stats = await preservationStats(source, output)

  assert.equal(stats.hueSampleCount, 4096)
  assert.equal(stats.hueErrorMean, 120)
  assert.equal(stats.hueErrorP95, 120)
})

test('tile hue error catches localized hue drift hidden by global hue stats', async () => {
  const source = makeRgbSolid(64, 64, 255, 0, 0)
  const output = setColorRect(copyImage(source), 0, 0, 8, 8, [0, 255, 0])
  const stats = await preservationStats(source, output, { tileGrid: 8 })

  assert.equal(stats.hueSampleCount, 4096)
  assert.ok(
    stats.hueErrorMean < QUALITY_RULES.maxHueErrorMean,
    `expected global hue mean below review threshold, got ${stats.hueErrorMean}`,
  )
  assert.equal(stats.hueErrorP95, 0)
  assert.equal(stats.tileHueErrorTileCount, 64)
  assert.equal(stats.tileHueErrorMeanMax, 120)
  assert.equal(stats.tileHueErrorP95Max, 120)
})

test('tile hue p95 catches rare local hue outliers below tile mean drift', async () => {
  const source = makeRgbSolid(64, 64, 255, 0, 0)
  const output = setColorRect(copyImage(source), 0, 0, 2, 2, [0, 255, 255])
  const stats = await preservationStats(source, output, { tileGrid: 8 })

  assert.equal(stats.hueSampleCount, 4096)
  assert.equal(stats.hueErrorP95, 0)
  assert.ok(
    stats.tileHueErrorMeanMax < QUALITY_RULES.maxTileHueErrorMean,
    `expected tile hue mean below threshold, got ${stats.tileHueErrorMeanMax}`,
  )
  assert.ok(
    stats.tileHueErrorP95Max > QUALITY_RULES.maxTileHueErrorP95,
    `expected tile hue p95 above threshold, got ${stats.tileHueErrorP95Max}`,
  )
})

test('rgb coverage drift tracks low-palette color area changes', async () => {
  const source = makeRgbSplit(64, 64, 32, [0, 0, 0], [255, 255, 255])
  const output = makeRgbSplit(64, 64, 16, [0, 0, 0], [255, 255, 255])
  const stats = await preservationStats(source, output)

  assert.equal(stats.rgbCoverageDrift, 0.25)
  assert.equal(stats.rgbCoverageRetention, 0.75)
})

test('dominant bucket coverage catches broad surface drift below global MAE threshold', async () => {
  const source = makeRgbSolid(64, 64, 0, 0, 0)
  setColorRect(source, 0, 0, 32, 32, [255, 255, 255])
  const output = makeRgbSolid(64, 64, 16, 16, 16)
  setColorRect(output, 0, 0, 32, 32, [255, 255, 255])
  const stats = await preservationStats(source, output)

  assert.ok(
    stats.mae < QUALITY_RULES.maxPreservationMae,
    `expected global MAE below preservation threshold, got ${stats.mae}`,
  )
  assert.equal(stats.sourceDominantBucketCoverage, 0.75)
  assert.equal(stats.outputDominantBucketCoverage, 0)
  assert.equal(stats.dominantBucketCoverageDrift, 0.75)
})

test('regional rgb coverage catches color relocation with unchanged global coverage', async () => {
  const source = makeRgbSolid(64, 64, 0, 0, 0)
  const output = makeRgbSolid(64, 64, 0, 0, 0)
  setColorRect(source, 0, 0, 16, 16, [255, 0, 0])
  setColorRect(output, 48, 48, 64, 64, [255, 0, 0])
  const stats = await preservationStats(source, output)

  assert.equal(stats.rgbCoverageDrift, 0)
  assert.equal(stats.rgbCoverageRetention, 1)
  assert.equal(stats.rgbTileCoverageDriftMax, 1)
  assert.equal(stats.rgbTileCoverageRetentionMin, 0)
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

test('alpha edge stats track localized tile edge loss and growth', () => {
  const source = makeTransparentBox(64, 64, 8, 8, 56, 56)
  const localLoss = clearAlphaRect(copyImage(source), 8, 8, 16, 16)
  const transparent = {
    data: new Uint8ClampedArray(64 * 64 * 4),
    height: 64,
    width: 64,
  }
  const localGrowth = makeTransparentBox(64, 64, 4, 4, 14, 14)

  const preserved = alphaMaskStats(source, source.data)
  const loss = alphaMaskStats(source, localLoss.data)
  const growth = alphaMaskStats(transparent, localGrowth.data)

  assert.equal(preserved.alphaEdgeTileRecallMin, 1)
  assert.equal(preserved.alphaEdgeTileJaccardMin, 1)
  assert.ok(
    loss.alphaEdgeTileRecallMin < 0.7,
    `expected regional alpha edge loss, got ${loss.alphaEdgeTileRecallMin}`,
  )
  assert.ok(
    loss.alphaEdgeTileJaccardMin < 0.7,
    `expected regional alpha edge overlap loss, got ${loss.alphaEdgeTileJaccardMin}`,
  )
  assert.ok(
    growth.alphaEdgeTileSpuriousMax > 0.9,
    `expected regional spurious alpha edge growth, got ${growth.alphaEdgeTileSpuriousMax}`,
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
  assert.equal(stats.alphaComponentAreaDrift, 4)
  assert.equal(stats.alphaComponentBBoxDrift, 0)
  assert.equal(stats.alphaComponentPositionDrift, 0)
  assert.equal(stats.alphaSmallComponentCount, 1)
  assert.equal(stats.outputAlphaSmallComponentCount, 0)
  assert.equal(stats.alphaSmallComponentCountDrift, 1)
})

test('alpha component stats detect same-count component movement', () => {
  const source = makeTransparentBox(64, 64, 8, 8, 24, 24)
  const detached = makeTransparentBox(64, 64, 40, 40, 44, 44)
  for (let i = 0; i < detached.data.length; i += 4) {
    if (detached.data[i + 3] === 0) continue
    source.data[i] = detached.data[i]
    source.data[i + 1] = detached.data[i + 1]
    source.data[i + 2] = detached.data[i + 2]
    source.data[i + 3] = detached.data[i + 3]
  }
  const output = makeTransparentBox(64, 64, 8, 8, 24, 24)
  const shifted = makeTransparentBox(64, 64, 42, 40, 46, 44)
  for (let i = 0; i < shifted.data.length; i += 4) {
    if (shifted.data[i + 3] === 0) continue
    output.data[i] = shifted.data[i]
    output.data[i + 1] = shifted.data[i + 1]
    output.data[i + 2] = shifted.data[i + 2]
    output.data[i + 3] = shifted.data[i + 3]
  }
  const stats = alphaMaskStats(source, output.data)

  assert.equal(stats.alphaComponentCount, 2)
  assert.equal(stats.outputAlphaComponentCount, 2)
  assert.equal(stats.alphaComponentCountDrift, 0)
  assert.equal(stats.alphaComponentAreaDrift, 0)
  assert.equal(stats.alphaComponentBBoxDrift, 4)
  assert.equal(stats.alphaComponentPositionDrift, 2)
})

test('alpha component stats detect same-area same-center bounds drift', () => {
  const source = makeTransparentBox(32, 32, 16, 15, 17, 18)
  const output = makeTransparentBox(32, 32, 15, 16, 18, 17)
  const stats = alphaMaskStats(source, output.data)

  assert.equal(stats.alphaComponentCount, 1)
  assert.equal(stats.outputAlphaComponentCount, 1)
  assert.equal(stats.alphaComponentCountDrift, 0)
  assert.equal(stats.alphaComponentAreaDrift, 0)
  assert.equal(stats.alphaComponentPositionDrift, 0)
  assert.equal(stats.alphaComponentBBoxDrift, 4)
})

test('alpha component stats detect same-area same-center same-bounds perimeter drift', () => {
  const source = makeAlphaCells(4, 4, [
    [3, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [0, 2],
    [1, 2],
    [2, 2],
    [0, 3],
  ])
  const output = makeAlphaCells(4, 4, [
    [2, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [0, 2],
    [1, 2],
    [3, 2],
    [0, 3],
  ])
  const stats = alphaMaskStats(source, output.data)

  assert.equal(stats.alphaComponentCount, 1)
  assert.equal(stats.outputAlphaComponentCount, 1)
  assert.equal(stats.alphaComponentCountDrift, 0)
  assert.equal(stats.alphaComponentAreaDrift, 0)
  assert.equal(stats.alphaComponentBBoxDrift, 0)
  assert.equal(stats.alphaComponentPositionDrift, 0)
  assert.equal(stats.alphaComponentPerimeterDrift, 2)
})

test('alpha mask stats detect filled internal holes', () => {
  const sourceCells = []
  const outputCells = []
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      outputCells.push([x, y])
      if (x !== 2 || y !== 2) sourceCells.push([x, y])
    }
  }
  const source = makeAlphaCells(5, 5, sourceCells)
  const output = makeAlphaCells(5, 5, outputCells)
  const stats = alphaMaskStats(source, output.data)

  assert.equal(stats.alphaHoleCount, 1)
  assert.equal(stats.outputAlphaHoleCount, 0)
  assert.equal(stats.alphaHoleCountDrift, 1)
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

test('alpha tile preservation catches localized transparency loss below global alpha p95', async () => {
  const source = makeSolid(64, 64, 96)
  const output = setAlphaRect(makeSolid(64, 64, 96), 4, 4, 8, 8, 0)
  const stats = await preservationStats(source, output, { alphaMask: true })

  assert.ok(stats.alphaMae < 1, `expected low alpha MAE, got ${stats.alphaMae}`)
  assert.equal(stats.alphaP95, 0)
  assert.ok(
    stats.alphaCoverageRatio > 0.99,
    `expected coverage inside tolerance, got ${stats.alphaCoverageRatio}`,
  )
  assert.ok(
    stats.alphaMaskIou > 0.99,
    `expected mask IoU inside tolerance, got ${stats.alphaMaskIou}`,
  )
  assert.equal(stats.alphaTileMaxMae, 63.75)
  assert.equal(stats.alphaTileP95Mae, 0)
})

test('alpha max preservation catches a single changed pixel below p95 and tile thresholds', async () => {
  const source = makeSolid(64, 64, 96)
  const output = setAlphaRect(makeSolid(64, 64, 96), 4, 4, 5, 5, 0)
  const stats = await preservationStats(source, output, { alphaMask: true })

  assert.ok(stats.alphaMae < 1, `expected low alpha MAE, got ${stats.alphaMae}`)
  assert.equal(stats.alphaP95, 0)
  assert.ok(
    stats.alphaTileMaxMae < 40,
    `expected tile alpha MAE below review threshold, got ${stats.alphaTileMaxMae}`,
  )
  assert.equal(stats.alphaMax, 255)
})

test('cell color dominance separates clean and ambiguous cells', () => {
  const clean = cellColorDominanceMetrics(makeChecker(64, 64, 8), 8, 8)
  const ambiguous = cellColorDominanceMetrics(makeChecker(64, 64, 1), 8, 8)

  assert.equal(clean.mean, 1)
  assert.ok(ambiguous.mean < 0.51, `expected ambiguous dominance near half, got ${ambiguous.mean}`)
})

test('cell color dominance exposes rare ambiguous cells hidden by p05', () => {
  const image = makeSolid(64, 64, 0)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = x * 16
      image.data[i + 1] = y * 16
      image.data[i + 2] = ((x + y) % 16) * 16
    }
  }

  const metrics = cellColorDominanceMetrics(image, 8, 8)

  assert.equal(metrics.p05, 1)
  assert.equal(metrics.min, 1 / 64)
})

test('quality classification reviews localized cell color ambiguity hidden by the mean', () => {
  const result = classifyMetrics({
    cellColorDominance: 0.9,
    cellColorDominanceP05: 0.04,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'localized-ambiguous-cell-colors'))
})

test('quality classification reviews rare cell color ambiguity hidden by p05', () => {
  const result = classifyMetrics({
    cellColorDominance: 0.9,
    cellColorDominanceMin: 0.03,
    cellColorDominanceP05: 0.9,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'rare-ambiguous-cell-colors'))
})

test('cell color error tracks representative source cell color drift', () => {
  const clean = cellColorErrorMetrics(makeChecker(64, 64, 8), makeChecker(8, 8, 1))
  const drifted = cellColorErrorMetrics(makeChecker(64, 64, 8), makeSolid(8, 8, 127))

  assert.equal(clean.cellAlphaErrorMean, 0)
  assert.equal(clean.cellAlphaErrorP95, 0)
  assert.equal(clean.cellAlphaErrorMax, 0)
  assert.equal(clean.cellColorErrorMean, 0)
  assert.equal(clean.cellColorErrorP95, 0)
  assert.equal(clean.cellColorErrorP99, 0)
  assert.equal(clean.cellColorErrorMax, 0)
  assert.ok(
    drifted.cellColorErrorMean > 120,
    `expected high representative color error, got ${drifted.cellColorErrorMean}`,
  )
})

test('cell color error p99 exposes rare representative color drift hidden by p95', () => {
  const sourceCells = Array.from({ length: 100 }, () => [0, 0, 0, 255])
  const outputCells = Array.from({ length: 100 }, () => [0, 0, 0, 255])
  outputCells[99] = [255, 255, 255, 255]

  const stats = cellColorErrorMetrics(
    makeCellImage(sourceCells, 10, 10, 4),
    makeCellGrid(outputCells, 10, 10),
  )

  assert.equal(stats.cellColorErrorMean, 2.55)
  assert.equal(stats.cellColorErrorP95, 0)
  assert.equal(stats.cellColorErrorP99, 255)
  assert.equal(stats.cellColorErrorMax, 255)
})

test('cell color error tracks representative source cell alpha drift', () => {
  const source = makeCellImage([[96, 96, 96, 128]], 1, 1, 8)
  const output = makeCellGrid([[96, 96, 96, 255]], 1, 1)
  const stats = cellColorErrorMetrics(source, output)

  assert.equal(stats.cellColorErrorMean, 0)
  assert.equal(stats.cellAlphaErrorMean, 127)
  assert.equal(stats.cellAlphaErrorP95, 127)
  assert.equal(stats.cellAlphaErrorMax, 127)
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

test('cell color components detect lost detached exact-color parts', () => {
  const black = [0, 0, 0, 255]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 16 }, () => black)
  sourceKeys[0] = red
  sourceKeys[15] = red
  const outputKeys = [...sourceKeys]
  outputKeys[15] = black
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 4, 8),
    makeCellGrid(outputKeys, 4, 4),
  )

  assert.equal(metrics.sourceCellColorComponentCount, 3)
  assert.equal(metrics.outputCellColorComponentCount, 2)
  assert.equal(metrics.cellColorComponentCountDrift, 1)
  assert.equal(metrics.sourceSmallCellColorComponentCount, 2)
  assert.equal(metrics.outputSmallCellColorComponentCount, 1)
  assert.equal(metrics.smallCellColorComponentCountDrift, 1)
})

test('cell color components detect same-count component area drift', () => {
  const black = [0, 0, 0, 255]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 16 }, () => black)
  sourceKeys[0] = red
  sourceKeys[1] = red
  const outputKeys = Array.from({ length: 16 }, () => black)
  outputKeys[0] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 4, 8),
    makeCellGrid(outputKeys, 4, 4),
  )

  assert.equal(metrics.cellColorComponentCountDrift, 0)
  assert.equal(metrics.cellColorComponentAreaDrift, 2)
})

test('cell color components detect same-size component position drift', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 16 }, () => transparent)
  sourceKeys[0] = red
  const outputKeys = Array.from({ length: 16 }, () => transparent)
  outputKeys[1] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 4, 8),
    makeCellGrid(outputKeys, 4, 4),
  )

  assert.equal(metrics.cellColorComponentCountDrift, 0)
  assert.equal(metrics.cellColorComponentAreaDrift, 0)
  assert.equal(metrics.cellColorComponentPositionDrift, 1)
})

test('cell color components detect same-area same-center bounds drift', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 16 }, () => transparent)
  sourceKeys[1] = red
  sourceKeys[5] = red
  sourceKeys[9] = red
  const outputKeys = Array.from({ length: 16 }, () => transparent)
  outputKeys[4] = red
  outputKeys[5] = red
  outputKeys[6] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 4, 8),
    makeCellGrid(outputKeys, 4, 4),
  )

  assert.equal(metrics.cellColorComponentCountDrift, 0)
  assert.equal(metrics.cellColorComponentAreaDrift, 0)
  assert.equal(metrics.cellColorComponentPositionDrift, 0)
  assert.equal(metrics.cellColorComponentBBoxDrift, 4)
})

test('cell color components detect same-area same-center same-bounds perimeter drift', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 16 }, () => transparent)
  for (const index of [3, 5, 6, 7, 8, 9, 10, 12]) sourceKeys[index] = red
  const outputKeys = Array.from({ length: 16 }, () => transparent)
  for (const index of [2, 5, 6, 7, 8, 9, 11, 12]) outputKeys[index] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 4, 8),
    makeCellGrid(outputKeys, 4, 4),
  )

  assert.equal(metrics.cellColorComponentCountDrift, 0)
  assert.equal(metrics.cellColorComponentAreaDrift, 0)
  assert.equal(metrics.cellColorComponentBBoxDrift, 0)
  assert.equal(metrics.cellColorComponentPositionDrift, 0)
  assert.equal(metrics.cellColorComponentPerimeterDrift, 2)
})

test('cell color components detect filled internal holes', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 25 }, () => transparent)
  const outputKeys = Array.from({ length: 25 }, () => transparent)
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col
      outputKeys[index] = red
      if (col !== 2 || row !== 2) sourceKeys[index] = red
    }
  }
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 5, 5, 8),
    makeCellGrid(outputKeys, 5, 5),
  )

  assert.equal(metrics.sourceCellColorComponentHoleCount, 1)
  assert.equal(metrics.outputCellColorComponentHoleCount, 0)
  assert.equal(metrics.cellColorComponentHoleCountDrift, 1)
})

test('cell color adjacency detects lost same-color orthogonal neighbors', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 6 }, () => transparent)
  sourceKeys[0] = red
  sourceKeys[1] = red
  const outputKeys = Array.from({ length: 6 }, () => transparent)
  outputKeys[0] = red
  outputKeys[2] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 2, 8),
    makeCellGrid(outputKeys, 3, 2),
  )

  assert.equal(metrics.sourceCellColorAdjacencyCount, 1)
  assert.equal(metrics.outputCellColorAdjacencyCount, 0)
  assert.equal(metrics.cellColorAdjacencyDrift, 1)
})

test('cell color adjacency detects lost same-color diagonal neighbors', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = Array.from({ length: 9 }, () => transparent)
  sourceKeys[0] = red
  sourceKeys[4] = red
  const outputKeys = Array.from({ length: 9 }, () => transparent)
  outputKeys[0] = red
  outputKeys[1] = red
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 3, 8),
    makeCellGrid(outputKeys, 3, 3),
  )

  assert.equal(metrics.sourceCellColorDiagonalAdjacencyCount, 1)
  assert.equal(metrics.outputCellColorDiagonalAdjacencyCount, 0)
  assert.equal(metrics.cellColorDiagonalAdjacencyDrift, 1)
})

test('cell color boundary pairs detect changed orthogonal color contacts', () => {
  const red = [255, 0, 0, 255]
  const blue = [0, 0, 255, 255]
  const green = [0, 255, 0, 255]
  const metrics = cellColorComponentMetrics(
    makeCellImage([red, blue], 2, 1, 8),
    makeCellGrid([red, green], 2, 1),
  )

  assert.equal(metrics.sourceCellColorBoundaryPairCount, 1)
  assert.equal(metrics.outputCellColorBoundaryPairCount, 1)
  assert.equal(metrics.cellColorBoundaryPairDrift, 2)
  assert.equal(metrics.cellColorDiagonalBoundaryPairDrift, 0)
})

test('cell color boundary pairs detect changed diagonal color contacts', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const blue = [0, 0, 255, 255]
  const green = [0, 255, 0, 255]
  const metrics = cellColorComponentMetrics(
    makeCellImage([red, transparent, transparent, blue], 2, 2, 8),
    makeCellGrid([red, transparent, transparent, green], 2, 2),
  )

  assert.equal(metrics.sourceCellColorDiagonalBoundaryPairCount, 1)
  assert.equal(metrics.outputCellColorDiagonalBoundaryPairCount, 1)
  assert.equal(metrics.cellColorDiagonalBoundaryPairDrift, 2)
  assert.equal(metrics.cellColorBoundaryPairDrift, 0)
})

test('cell color boundary runs detect split horizontal color contacts', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const blue = [0, 0, 255, 255]
  const sourceKeys = [red, red, red, red, transparent, blue, blue, blue, blue, transparent]
  const outputKeys = [red, red, transparent, red, red, blue, blue, transparent, blue, blue]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 5, 2, 8),
    makeCellGrid(outputKeys, 5, 2),
  )

  assert.equal(metrics.sourceCellColorBoundaryHorizontalRunCount, 1)
  assert.equal(metrics.outputCellColorBoundaryHorizontalRunCount, 2)
  assert.equal(metrics.cellColorBoundaryHorizontalRunDrift, 3)
  assert.equal(metrics.cellColorBoundaryVerticalRunDrift, 0)
})

test('cell color boundary runs detect split vertical color contacts', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const blue = [0, 0, 255, 255]
  const sourceKeys = [red, blue, red, blue, red, blue, red, blue, transparent, transparent]
  const outputKeys = [red, blue, red, blue, transparent, transparent, red, blue, red, blue]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 2, 5, 8),
    makeCellGrid(outputKeys, 2, 5),
  )

  assert.equal(metrics.sourceCellColorBoundaryVerticalRunCount, 1)
  assert.equal(metrics.outputCellColorBoundaryVerticalRunCount, 2)
  assert.equal(metrics.cellColorBoundaryVerticalRunDrift, 3)
  assert.equal(metrics.cellColorBoundaryHorizontalRunDrift, 0)
})

test('cell color quad patterns detect changed 2x2 corners', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, red, red, transparent]
  const outputKeys = [red, red, transparent, red]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 2, 2, 8),
    makeCellGrid(outputKeys, 2, 2),
  )

  assert.equal(metrics.sourceCellColorQuadPatternCount, 1)
  assert.equal(metrics.outputCellColorQuadPatternCount, 1)
  assert.equal(metrics.sourceCellColorDistinctQuadPatternCount, 1)
  assert.equal(metrics.outputCellColorDistinctQuadPatternCount, 1)
  assert.equal(metrics.cellColorQuadPatternDrift, 2)
})

test('cell color window patterns detect changed 3x3 neighborhood context', () => {
  const red = [255, 0, 0, 255]
  const blue = [0, 0, 255, 255]
  const green = [0, 255, 0, 255]
  const sourceKeys = [red, red, red, red, blue, red, red, red, red]
  const outputKeys = [red, red, red, red, green, red, red, red, red]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 3, 8),
    makeCellGrid(outputKeys, 3, 3),
  )

  assert.equal(metrics.sourceCellColorWindowPatternCount, 9)
  assert.equal(metrics.outputCellColorWindowPatternCount, 9)
  assert.equal(metrics.sourceCellColorDistinctWindowPatternCount, 9)
  assert.equal(metrics.outputCellColorDistinctWindowPatternCount, 9)
  assert.equal(metrics.cellColorWindowPatternDrift, 18)
})

test('cell color neighbor masks detect changed line topology', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, red, red, transparent, transparent, transparent]
  const outputKeys = [red, red, transparent, red, transparent, transparent]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 2, 8),
    makeCellGrid(outputKeys, 3, 2),
  )

  assert.equal(metrics.sourceCellColorNeighborMaskCount, 3)
  assert.equal(metrics.outputCellColorNeighborMaskCount, 3)
  assert.equal(metrics.cellColorNeighborMaskDrift, 4)
})

test('cell color runs detect split horizontal same-color strokes', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, red, red, transparent]
  const outputKeys = [red, red, transparent, red]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 4, 1, 8),
    makeCellGrid(outputKeys, 4, 1),
  )

  assert.equal(metrics.sourceCellColorHorizontalRunCount, 1)
  assert.equal(metrics.outputCellColorHorizontalRunCount, 2)
  assert.equal(metrics.cellColorHorizontalRunDrift, 3)
  assert.equal(metrics.cellColorVerticalRunDrift, 0)
})

test('cell color runs detect split vertical same-color strokes', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, red, red, transparent]
  const outputKeys = [red, red, transparent, red]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 1, 4, 8),
    makeCellGrid(outputKeys, 1, 4),
  )

  assert.equal(metrics.sourceCellColorVerticalRunCount, 1)
  assert.equal(metrics.outputCellColorVerticalRunCount, 2)
  assert.equal(metrics.cellColorVerticalRunDrift, 3)
  assert.equal(metrics.cellColorHorizontalRunDrift, 0)
})

test('cell color projections detect row occupancy drift', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, red, transparent, transparent, transparent, transparent]
  const outputKeys = [transparent, transparent, transparent, red, red, transparent]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 2, 8),
    makeCellGrid(outputKeys, 3, 2),
  )

  assert.equal(metrics.sourceCellColorRowProjectionCount, 2)
  assert.equal(metrics.outputCellColorRowProjectionCount, 2)
  assert.equal(metrics.cellColorRowProjectionDrift, 4)
  assert.equal(metrics.cellColorColumnProjectionDrift, 0)
})

test('cell color projections detect column occupancy drift', () => {
  const transparent = [0, 0, 0, 0]
  const red = [255, 0, 0, 255]
  const sourceKeys = [red, transparent, transparent, red, transparent, transparent]
  const outputKeys = [transparent, red, transparent, transparent, red, transparent]
  const metrics = cellColorComponentMetrics(
    makeCellImage(sourceKeys, 3, 2, 8),
    makeCellGrid(outputKeys, 3, 2),
  )

  assert.equal(metrics.sourceCellColorColumnProjectionCount, 2)
  assert.equal(metrics.outputCellColorColumnProjectionCount, 2)
  assert.equal(metrics.cellColorColumnProjectionDrift, 4)
  assert.equal(metrics.cellColorRowProjectionDrift, 0)
})

test('cell transitions distinguish retained, removed, and spurious boundaries', () => {
  const input = makeChecker(64, 64, 8)
  const retained = cellTransitionMetrics(input, makeChecker(8, 8, 1))
  const removed = cellTransitionMetrics(input, makeSolid(8, 8, 0))
  const spurious = cellTransitionMetrics(makeSolid(64, 64, 255), makeChecker(8, 8, 1))

  assert.equal(retained.cellTransitionRetention, 1)
  assert.equal(retained.cellTransitionSpuriousRatio, 0)
  assert.equal(retained.cellTransitionErrorMean, 0)
  assert.equal(retained.cellTransitionErrorP95, 0)
  assert.equal(retained.cellTransitionErrorP99, 0)
  assert.equal(retained.cellTransitionErrorMax, 0)
  assert.equal(retained.cellTransitionAxisRetentionMin, 1)
  assert.equal(retained.cellTransitionAxisSpuriousRatioMax, 0)
  assert.equal(retained.cellTransitionAxisErrorP95Max, 0)
  assert.equal(retained.cellTransitionAxisErrorP99Max, 0)
  assert.equal(retained.cellTransitionAxisErrorMaxMax, 0)
  assert.ok(removed.cellTransitionRetention < 0.01)
  assert.ok(removed.cellTransitionErrorP95 > 0)
  assert.ok(removed.cellTransitionErrorP99 > 0)
  assert.ok(removed.cellTransitionErrorMax > 0)
  assert.equal(removed.outputCellTransitionCount, 0)
  assert.equal(spurious.sourceCellTransitionCount, 0)
  assert.equal(spurious.cellTransitionSpuriousRatio, 1)
  assert.equal(spurious.cellTransitionAxisSpuriousRatioMax, 1)
})

test('cell diagonal transitions distinguish retained, removed, and spurious diagonals', () => {
  const black = [0, 0, 0, 255]
  const white = [255, 255, 255, 255]
  const stripes = Array.from({ length: 36 }, (_, index) => ((index % 6) % 2 === 0 ? black : white))
  const solid = Array.from({ length: 36 }, () => black)
  const input = makeCellImage(stripes, 6, 6, 8)
  const retained = cellTransitionMetrics(input, makeCellGrid(stripes, 6, 6))
  const removed = cellTransitionMetrics(input, makeCellGrid(solid, 6, 6))
  const spurious = cellTransitionMetrics(makeCellImage(solid, 6, 6, 8), makeCellGrid(stripes, 6, 6))

  assert.equal(retained.sourceCellDiagonalTransitionCount, 50)
  assert.equal(retained.outputCellDiagonalTransitionCount, 50)
  assert.equal(retained.cellDiagonalTransitionRetention, 1)
  assert.equal(retained.cellDiagonalTransitionSpuriousRatio, 0)
  assert.equal(retained.cellDiagonalTransitionErrorP95, 0)
  assert.equal(retained.cellDiagonalTransitionErrorP99, 0)
  assert.equal(retained.cellDiagonalTransitionErrorMax, 0)
  assert.equal(retained.cellDiagonalTransitionDirectionRetentionMin, 1)
  assert.equal(retained.cellDiagonalTransitionDirectionErrorP95Max, 0)
  assert.equal(retained.cellDiagonalTransitionDirectionErrorP99Max, 0)
  assert.equal(retained.cellDiagonalTransitionDirectionErrorMaxMax, 0)
  assert.ok(removed.cellDiagonalTransitionRetention < 0.01)
  assert.ok(removed.cellDiagonalTransitionErrorP95 > 0)
  assert.ok(removed.cellDiagonalTransitionErrorP99 > 0)
  assert.ok(removed.cellDiagonalTransitionErrorMax > 0)
  assert.equal(removed.outputCellDiagonalTransitionCount, 0)
  assert.equal(spurious.sourceCellDiagonalTransitionCount, 0)
  assert.equal(spurious.cellDiagonalTransitionSpuriousRatio, 1)
  assert.equal(spurious.cellDiagonalTransitionDirectionSpuriousRatioMax, 1)
})

test('quality classification fails when output alpha cells are not uniform', () => {
  const result = classifyMetrics({
    outputAlphaCellMae: 0.02,
    outputCellMae: 0,
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'non-uniform-output-alpha-cells'))
})

test('quality classification reviews runaway long-axis grids', () => {
  const result = classifyMetrics({
    cols: 2048,
    longAxisCells: 2048,
    rows: 8,
    shortAxisCells: 8,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'runaway-long-axis-grid'))
})

test('quality classification reviews representative alpha drift', () => {
  const result = classifyMetrics({
    cellAlphaErrorMean: 9,
    cellAlphaErrorP95: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-alpha-drift'))
})

test('quality classification reviews rare representative alpha outliers hidden by p95', () => {
  const result = classifyMetrics({
    cellAlphaErrorMax: 241,
    cellAlphaErrorMean: 0,
    cellAlphaErrorP95: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-alpha-outlier'))
  assert.ok(!result.issues.some((issue) => issue.code === 'cell-alpha-drift'))
})

test('quality classification reviews exact low-palette alpha drift', () => {
  const result = classifyMetrics({
    cellAlphaErrorMax: 1,
    cellAlphaErrorMean: 0,
    cellAlphaErrorP95: 0,
    exactLowPaletteCellColorEligible: true,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'rare-cell-alpha-drift'))
})

test('quality classification reviews exact cell color component area drift', () => {
  const result = classifyMetrics({
    cellColorComponentAreaDrift: 2,
    cellColorComponentCountDrift: 0,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    sourceCellColorComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-component-area-drift'))
})

test('quality classification reviews exact cell color adjacency drift', () => {
  const result = classifyMetrics({
    cellColorAdjacencyDrift: 1,
    exactLowPaletteCellColorEligible: true,
    outputCellColorAdjacencyCount: 0,
    sourceCellColorAdjacencyCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-adjacency-drift'))
})

test('quality classification reviews exact cell color diagonal adjacency drift', () => {
  const result = classifyMetrics({
    cellColorDiagonalAdjacencyDrift: 1,
    exactLowPaletteCellColorEligible: true,
    outputCellColorDiagonalAdjacencyCount: 0,
    sourceCellColorDiagonalAdjacencyCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-diagonal-adjacency-drift'),
  )
})

test('quality classification reviews exact cell color boundary pair drift', () => {
  const result = classifyMetrics({
    cellColorBoundaryPairDrift: 2,
    exactLowPaletteCellColorEligible: true,
    outputCellColorBoundaryPairCount: 1,
    sourceCellColorBoundaryPairCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-boundary-pair-drift'))
})

test('quality classification reviews exact cell color diagonal boundary pair drift', () => {
  const result = classifyMetrics({
    cellColorDiagonalBoundaryPairDrift: 2,
    exactLowPaletteCellColorEligible: true,
    outputCellColorDiagonalBoundaryPairCount: 1,
    sourceCellColorDiagonalBoundaryPairCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-diagonal-boundary-pair-drift'),
  )
})

test('quality classification reviews exact cell color horizontal boundary run drift', () => {
  const result = classifyMetrics({
    cellColorBoundaryHorizontalRunDrift: 3,
    exactLowPaletteCellColorEligible: true,
    outputCellColorBoundaryHorizontalRunCount: 2,
    sourceCellColorBoundaryHorizontalRunCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-boundary-horizontal-run-drift'),
  )
})

test('quality classification reviews exact cell color vertical boundary run drift', () => {
  const result = classifyMetrics({
    cellColorBoundaryVerticalRunDrift: 3,
    exactLowPaletteCellColorEligible: true,
    outputCellColorBoundaryVerticalRunCount: 2,
    sourceCellColorBoundaryVerticalRunCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-boundary-vertical-run-drift'),
  )
})

test('quality classification reviews exact cell color neighbor mask drift', () => {
  const result = classifyMetrics({
    cellColorNeighborMaskDrift: 4,
    exactLowPaletteCellColorEligible: true,
    outputCellColorNeighborMaskCount: 3,
    sourceCellColorNeighborMaskCount: 3,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-neighbor-mask-drift'))
})

test('quality classification reviews exact cell color quad pattern drift', () => {
  const result = classifyMetrics({
    cellColorQuadPatternDrift: 2,
    exactLowPaletteCellColorEligible: true,
    outputCellColorQuadPatternCount: 1,
    sourceCellColorQuadPatternCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-quad-pattern-drift'))
})

test('quality classification reviews exact cell color window pattern drift', () => {
  const result = classifyMetrics({
    cellColorWindowPatternDrift: 2,
    exactLowPaletteCellColorEligible: true,
    outputCellColorWindowPatternCount: 1,
    sourceCellColorWindowPatternCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-window-pattern-drift'))
})

test('quality classification reviews low-palette regional coverage drift', () => {
  const result = classifyMetrics({
    lowPaletteCoverageEligible: true,
    lowPaletteTileCoverageDriftMax: 1,
    lowPaletteTileCoverageRetentionMin: 0,
    lowPaletteTileCoverageTileCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'low-palette-regional-coverage-drift'))
})

test('quality classification reviews exact cell color horizontal run drift', () => {
  const result = classifyMetrics({
    cellColorHorizontalRunDrift: 3,
    exactLowPaletteCellColorEligible: true,
    outputCellColorHorizontalRunCount: 2,
    sourceCellColorHorizontalRunCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-horizontal-run-drift'))
})

test('quality classification reviews exact cell color vertical run drift', () => {
  const result = classifyMetrics({
    cellColorVerticalRunDrift: 3,
    exactLowPaletteCellColorEligible: true,
    outputCellColorVerticalRunCount: 2,
    sourceCellColorVerticalRunCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-vertical-run-drift'))
})

test('quality classification reviews exact cell color row projection drift', () => {
  const result = classifyMetrics({
    cellColorRowProjectionDrift: 4,
    exactLowPaletteCellColorEligible: true,
    outputCellColorRowProjectionCount: 2,
    sourceCellColorRowProjectionCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-row-projection-drift'))
})

test('quality classification reviews exact cell color column projection drift', () => {
  const result = classifyMetrics({
    cellColorColumnProjectionDrift: 4,
    exactLowPaletteCellColorEligible: true,
    outputCellColorColumnProjectionCount: 2,
    sourceCellColorColumnProjectionCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-column-projection-drift'),
  )
})

test('quality classification reviews exact cell color component position drift', () => {
  const result = classifyMetrics({
    cellColorComponentAreaDrift: 0,
    cellColorComponentBBoxDrift: 0,
    cellColorComponentCountDrift: 0,
    cellColorComponentPositionDrift: 1,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    sourceCellColorComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-component-position-drift'),
  )
})

test('quality classification reviews exact cell color component bounds drift', () => {
  const result = classifyMetrics({
    cellColorComponentAreaDrift: 0,
    cellColorComponentBBoxDrift: 1,
    cellColorComponentCountDrift: 0,
    cellColorComponentPerimeterDrift: 0,
    cellColorComponentPositionDrift: 0,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    sourceCellColorComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-component-bounds-drift'))
})

test('quality classification reviews exact cell color component perimeter drift', () => {
  const result = classifyMetrics({
    cellColorComponentAreaDrift: 0,
    cellColorComponentBBoxDrift: 0,
    cellColorComponentCountDrift: 0,
    cellColorComponentPerimeterDrift: 2,
    cellColorComponentPositionDrift: 0,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    sourceCellColorComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'exact-cell-color-component-perimeter-drift'),
  )
})

test('quality classification reviews exact cell color component hole drift', () => {
  const result = classifyMetrics({
    cellColorComponentAreaDrift: 0,
    cellColorComponentBBoxDrift: 0,
    cellColorComponentCountDrift: 0,
    cellColorComponentHoleCountDrift: 1,
    cellColorComponentPerimeterDrift: 0,
    cellColorComponentPositionDrift: 0,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    outputCellColorComponentHoleCount: 0,
    sourceCellColorComponentCount: 2,
    sourceCellColorComponentHoleCount: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-component-hole-drift'))
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

test('quality classification fails when repeat snap changes alpha only', () => {
  const result = classifyMetrics({
    repeatVisualAlphaMae: 0.01,
    repeatVisualAlphaP95: 0,
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'unstable-repeat-alpha'))
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

test('quality classification fails when same input snap changes alpha only', () => {
  const result = classifyMetrics({
    determinismVisualAlphaMae: 0,
    determinismVisualAlphaP95: 1,
  })

  assert.equal(result.status, 'fail')
  assert.ok(result.issues.some((issue) => issue.code === 'non-deterministic-alpha'))
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

test('quality classification reviews edge direction drift', () => {
  const result = classifyMetrics({
    edgeDirectionDrift: 0.8,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputEdgeDirectionCount: 128,
    sourceEdgeDirectionCount: 128,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'edge-direction-drift'))
})

test('quality classification reviews source edge recall below the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 0.87,
    edgeSpuriousRatio: 0,
  })
  const pass = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 0.89,
    edgeSpuriousRatio: 0,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'edge-recall-loss'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews phase alignment below the tuned boundary', () => {
  const review = classifyMetrics({
    axisPhaseAlignmentMin: 1,
    phaseAlignment: 0.59,
  })
  const pass = classifyMetrics({
    axisPhaseAlignmentMin: 1,
    phaseAlignment: 0.61,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'phase-misaligned-grid'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews spurious edges above the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0.381,
  })
  const pass = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0.379,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'spurious-edge-growth'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional spurious edges above the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileSpuriousMax: 0.501,
    outputEdgeTileCount: 1,
  })
  const pass = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileSpuriousMax: 0.499,
    outputEdgeTileCount: 1,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-spurious-edge-growth'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional edge recall below the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileRecallMin: 0.69,
    edgeTileSpuriousMax: 0,
    sourceEdgeTileCount: 1,
  })
  const pass = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileRecallMin: 0.71,
    edgeTileSpuriousMax: 0,
    sourceEdgeTileCount: 1,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-edge-loss'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional edge overlap below the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileJaccardMin: 0.349,
    edgeTileRecallMin: 1,
    edgeTileSpuriousMax: 0,
    sourceEdgeTileCount: 1,
  })
  const pass = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileJaccardMin: 0.351,
    edgeTileRecallMin: 1,
    edgeTileSpuriousMax: 0,
    sourceEdgeTileCount: 1,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-edge-map-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional edge loss and growth', () => {
  const loss = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileRecallMin: 0.2,
    edgeTileSpuriousMax: 0,
    sourceEdgeTileCount: 1,
  })
  const growth = classifyMetrics({
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    edgeTileRecallMin: 1,
    edgeTileSpuriousMax: 0.95,
    outputEdgeTileCount: 1,
  })

  assert.equal(loss.status, 'review')
  assert.ok(loss.issues.some((issue) => issue.code === 'regional-edge-loss'))
  assert.equal(growth.status, 'review')
  assert.ok(growth.issues.some((issue) => issue.code === 'regional-spurious-edge-growth'))
})

test('quality classification reviews directed edge drift', () => {
  const review = classifyMetrics({
    directedEdgeJaccardMin: 0.159,
    directedEdgeRecallMin: 1,
    directedEdgeSpuriousMax: 0,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputDirectedEdgeBinCount: 1,
    sourceDirectedEdgeBinCount: 1,
  })
  const pass = classifyMetrics({
    directedEdgeJaccardMin: 0.161,
    directedEdgeRecallMin: 1,
    directedEdgeSpuriousMax: 0,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputDirectedEdgeBinCount: 1,
    sourceDirectedEdgeBinCount: 1,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'directed-edge-map-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews directed edge loss and growth', () => {
  const loss = classifyMetrics({
    directedEdgeJaccardMin: 1,
    directedEdgeRecallMin: 0.24,
    directedEdgeSpuriousMax: 0,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputDirectedEdgeBinCount: 1,
    sourceDirectedEdgeBinCount: 1,
  })
  const growth = classifyMetrics({
    directedEdgeJaccardMin: 1,
    directedEdgeRecallMin: 1,
    directedEdgeSpuriousMax: 0.81,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputDirectedEdgeBinCount: 1,
    sourceDirectedEdgeBinCount: 1,
  })
  const pass = classifyMetrics({
    directedEdgeJaccardMin: 1,
    directedEdgeRecallMin: 0.26,
    directedEdgeSpuriousMax: 0.79,
    edgeJaccard: 1,
    edgeRecall: 1,
    edgeSpuriousRatio: 0,
    outputDirectedEdgeBinCount: 1,
    sourceDirectedEdgeBinCount: 1,
  })

  assert.equal(loss.status, 'review')
  assert.ok(loss.issues.some((issue) => issue.code === 'directed-edge-loss'))
  assert.equal(growth.status, 'review')
  assert.ok(growth.issues.some((issue) => issue.code === 'directed-spurious-edge-growth'))
  assert.equal(pass.status, 'pass')
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

test('quality classification reviews regional alpha edge drift', () => {
  const review = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 1,
    alphaEdgeRecall: 1,
    alphaEdgeSpuriousRatio: 0,
    alphaEdgeTileJaccardMin: 0.349,
    alphaEdgeTileRecallMin: 1,
    alphaEdgeTileSpuriousMax: 0,
    outputAlphaEdgeCount: 128,
    outputAlphaEdgeTileCount: 4,
    sourceAlphaEdgeTileCount: 4,
  })
  const pass = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 1,
    alphaEdgeRecall: 1,
    alphaEdgeSpuriousRatio: 0,
    alphaEdgeTileJaccardMin: 0.351,
    alphaEdgeTileRecallMin: 1,
    alphaEdgeTileSpuriousMax: 0,
    outputAlphaEdgeCount: 128,
    outputAlphaEdgeTileCount: 4,
    sourceAlphaEdgeTileCount: 4,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-alpha-edge-map-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional alpha edge loss and growth', () => {
  const loss = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 1,
    alphaEdgeRecall: 1,
    alphaEdgeSpuriousRatio: 0,
    alphaEdgeTileJaccardMin: 1,
    alphaEdgeTileRecallMin: 0.69,
    alphaEdgeTileSpuriousMax: 0,
    outputAlphaEdgeCount: 128,
    outputAlphaEdgeTileCount: 4,
    sourceAlphaEdgeTileCount: 4,
  })
  const growth = classifyMetrics({
    alphaEdgeCount: 128,
    alphaEdgeJaccard: 1,
    alphaEdgeRecall: 1,
    alphaEdgeSpuriousRatio: 0,
    alphaEdgeTileJaccardMin: 1,
    alphaEdgeTileRecallMin: 1,
    alphaEdgeTileSpuriousMax: 0.51,
    outputAlphaEdgeCount: 128,
    outputAlphaEdgeTileCount: 4,
    sourceAlphaEdgeTileCount: 4,
  })

  assert.equal(loss.status, 'review')
  assert.ok(loss.issues.some((issue) => issue.code === 'regional-alpha-edge-loss'))
  assert.equal(growth.status, 'review')
  assert.ok(growth.issues.some((issue) => issue.code === 'regional-spurious-alpha-edge-growth'))
})

test('quality classification reviews alpha component count drift', () => {
  const result = classifyMetrics({
    alphaComponentAreaDrift: 0,
    alphaComponentBBoxDrift: 0,
    alphaComponentCount: 2,
    alphaComponentCountDrift: 1,
    alphaComponentPositionDrift: 0,
    alphaSmallComponentCount: 1,
    alphaSmallComponentCountDrift: 1,
    outputAlphaComponentCount: 1,
    outputAlphaSmallComponentCount: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-small-component-drift'))
})

test('quality classification reviews alpha component shape drift', () => {
  const result = classifyMetrics({
    alphaComponentAreaDrift: 4,
    alphaComponentBBoxDrift: 2,
    alphaComponentCount: 2,
    alphaComponentCountDrift: 0,
    alphaComponentPerimeterDrift: 3,
    alphaComponentPositionDrift: 1,
    outputAlphaComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-area-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-bounds-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-perimeter-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-component-position-drift'))
})

test('quality classification reviews alpha hole drift', () => {
  const result = classifyMetrics({
    alphaHoleCount: 1,
    alphaHoleCountDrift: 1,
    outputAlphaHoleCount: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-hole-drift'))
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

test('quality classification reviews regional alpha preservation loss', () => {
  const result = classifyMetrics({
    alphaTileMaxMae: 41,
    alphaTileP95Mae: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-alpha-preservation-loss'))
})

test('quality classification reviews original-size output expansion', () => {
  const result = classifyMetrics({
    outputCoverage: 1,
    outputExpansion: 1.06,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'output-expansion'))
  assert.ok(!result.issues.some((issue) => issue.code === 'output-shrink'))
})

test('quality classification reviews original-size output area shrink', () => {
  const result = classifyMetrics({
    outputAreaCoverage: 0.84,
    outputCoverage: 0.92,
    outputExpansion: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'output-area-shrink'))
  assert.ok(!result.issues.some((issue) => issue.code === 'output-shrink'))
})

test('quality classification reviews non-integer original-size output cells', () => {
  const result = classifyMetrics({
    outputCellIntegerError: 0.25,
    squareCellError: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'non-integer-output-cells'))
  assert.ok(!result.issues.some((issue) => issue.code === 'non-square-output-cells'))
})

test('quality classification reviews alpha preservation outliers hidden by p95', () => {
  const result = classifyMetrics({
    alphaMae: 0,
    alphaMax: 255,
    alphaP95: 0,
    alphaTileMaxMae: 0,
    alphaTileP95Mae: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'alpha-preservation-outlier'))
  assert.ok(!result.issues.some((issue) => issue.code === 'alpha-preservation-loss'))
  assert.ok(!result.issues.some((issue) => issue.code === 'regional-alpha-preservation-loss'))
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

test('quality classification reviews cell representative p95 above the tuned boundary', () => {
  const review = classifyMetrics({
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP99: 0,
    cellColorErrorP95: 46,
  })
  const pass = classifyMetrics({
    cellColorErrorMax: 0,
    cellColorErrorMean: 0,
    cellColorErrorP99: 0,
    cellColorErrorP95: 44,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'cell-color-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews cell representative p99 outliers hidden by p95', () => {
  const review = classifyMetrics({
    cellColorErrorMax: 120,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cellColorErrorP99: 71,
  })
  const pass = classifyMetrics({
    cellColorErrorMax: 120,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
    cellColorErrorP99: 69,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'localized-cell-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews rare representative color outliers hidden by p95', () => {
  const result = classifyMetrics({
    cellColorErrorMax: 241,
    cellColorErrorMean: 0,
    cellColorErrorP95: 0,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-color-outlier'))
  assert.ok(!result.issues.some((issue) => issue.code === 'cell-color-drift'))
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

test('quality classification reviews exact cell color component drift', () => {
  const result = classifyMetrics({
    cellColorComponentCountDrift: 1,
    exactLowPaletteCellColorEligible: true,
    outputCellColorComponentCount: 2,
    outputSmallCellColorComponentCount: 1,
    smallCellColorComponentCountDrift: 1,
    sourceCellColorComponentCount: 3,
    sourceSmallCellColorComponentCount: 2,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'exact-cell-color-component-drift'))
  assert.ok(result.issues.some((issue) => issue.code === 'exact-small-cell-color-component-drift'))
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

test('quality classification reviews large palette gaps hidden by utilization ratio', () => {
  const review = classifyMetrics({
    outputPaletteColorCount: 48,
    outputPaletteUtilization: 0.75,
    paletteUtilizationGap: 16,
    paletteUtilizationTarget: 64,
  })
  const pass = classifyMetrics({
    outputPaletteColorCount: 56,
    outputPaletteUtilization: 0.875,
    paletteUtilizationGap: 8,
    paletteUtilizationTarget: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'palette-utilization-gap'))
  assert.ok(!review.issues.some((issue) => issue.code === 'palette-underused'))
  assert.equal(pass.status, 'pass')
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

test('quality classification reviews orthogonal cell transition color outliers hidden by mean', () => {
  const review = classifyMetrics({
    cellTransitionAxisErrorP95Max: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 37,
    sourceCellTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellTransitionAxisErrorP95Max: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 35,
    sourceCellTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'cell-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews orthogonal cell transition p99 outliers hidden by p95', () => {
  const review = classifyMetrics({
    cellTransitionAxisErrorP99Max: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 60,
    sourceCellTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellTransitionAxisErrorP99Max: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 59,
    sourceCellTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'localized-cell-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews rare orthogonal cell transition max outliers hidden by p99', () => {
  const threshold = QUALITY_RULES.maxCellTransitionErrorMaxReview
  const review = classifyMetrics({
    cellTransitionAxisErrorMaxMax: 0,
    cellTransitionErrorMax: threshold + 1,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 0,
    sourceCellTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellTransitionAxisErrorMaxMax: 0,
    cellTransitionErrorMax: Math.max(0, threshold - 1),
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 0,
    sourceCellTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'rare-cell-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews rare one-axis cell transition max outliers', () => {
  const threshold = QUALITY_RULES.maxCellTransitionErrorMaxReview
  const review = classifyMetrics({
    cellTransitionAxisErrorMaxMax: threshold + 1,
    cellTransitionErrorMax: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 0,
    cellTransitionXErrorMax: threshold + 1,
    cellTransitionYErrorMax: 0,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
  })
  const pass = classifyMetrics({
    cellTransitionAxisErrorMaxMax: Math.max(0, threshold - 1),
    cellTransitionErrorMax: 0,
    cellTransitionErrorMean: 0,
    cellTransitionErrorP95: 0,
    cellTransitionErrorP99: 0,
    cellTransitionXErrorMax: Math.max(0, threshold - 1),
    cellTransitionYErrorMax: 0,
    sourceCellTransitionCount: 64,
    sourceCellTransitionXCount: 32,
    sourceCellTransitionYCount: 32,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'rare-axis-cell-transition-color-outlier'))
  assert.ok(!review.issues.some((issue) => issue.code === 'rare-cell-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
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

test('quality classification reviews lost diagonal cell transitions', () => {
  const result = classifyMetrics({
    cellDiagonalTransitionRetention: 0.4,
    sourceCellDiagonalTransitionCount: 64,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'cell-diagonal-transition-loss'))
})

test('quality classification reviews diagonal cell transition color outliers hidden by mean', () => {
  const review = classifyMetrics({
    cellDiagonalTransitionDirectionErrorP95Max: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 37,
    sourceCellDiagonalTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDirectionErrorP95Max: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 35,
    sourceCellDiagonalTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'cell-diagonal-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews diagonal cell transition p99 outliers hidden by p95', () => {
  const review = classifyMetrics({
    cellDiagonalTransitionDirectionErrorP99Max: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 60,
    sourceCellDiagonalTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDirectionErrorP99Max: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 59,
    sourceCellDiagonalTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some(
      (issue) => issue.code === 'localized-cell-diagonal-transition-color-outlier',
    ),
  )
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews rare diagonal cell transition max outliers hidden by p99', () => {
  const threshold = QUALITY_RULES.maxCellDiagonalTransitionErrorMaxReview
  const review = classifyMetrics({
    cellDiagonalTransitionDirectionErrorMaxMax: 0,
    cellDiagonalTransitionErrorMax: threshold + 1,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 0,
    sourceCellDiagonalTransitionCount: 64,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDirectionErrorMaxMax: 0,
    cellDiagonalTransitionErrorMax: Math.max(0, threshold - 1),
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 0,
    sourceCellDiagonalTransitionCount: 64,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some((issue) => issue.code === 'rare-cell-diagonal-transition-color-outlier'),
  )
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews rare one-direction diagonal transition max outliers', () => {
  const threshold = QUALITY_RULES.maxCellDiagonalTransitionErrorMaxReview
  const review = classifyMetrics({
    cellDiagonalTransitionDirectionErrorMaxMax: threshold + 1,
    cellDiagonalTransitionDownLeftErrorMax: 0,
    cellDiagonalTransitionDownRightErrorMax: threshold + 1,
    cellDiagonalTransitionErrorMax: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 0,
    sourceCellDiagonalTransitionCount: 64,
    sourceCellDiagonalTransitionDownLeftCount: 32,
    sourceCellDiagonalTransitionDownRightCount: 32,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDirectionErrorMaxMax: Math.max(0, threshold - 1),
    cellDiagonalTransitionDownLeftErrorMax: 0,
    cellDiagonalTransitionDownRightErrorMax: Math.max(0, threshold - 1),
    cellDiagonalTransitionErrorMax: 0,
    cellDiagonalTransitionErrorMean: 0,
    cellDiagonalTransitionErrorP95: 0,
    cellDiagonalTransitionErrorP99: 0,
    sourceCellDiagonalTransitionCount: 64,
    sourceCellDiagonalTransitionDownLeftCount: 32,
    sourceCellDiagonalTransitionDownRightCount: 32,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some(
      (issue) => issue.code === 'rare-directional-cell-diagonal-transition-color-outlier',
    ),
  )
  assert.ok(
    !review.issues.some((issue) => issue.code === 'rare-cell-diagonal-transition-color-outlier'),
  )
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews spurious diagonal cell transitions', () => {
  const result = classifyMetrics({
    cellDiagonalTransitionSpuriousRatio: 0.6,
    outputCellDiagonalTransitionCount: 64,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-cell-diagonal-transitions'))
})

test('quality classification reviews one-direction diagonal cell transition loss', () => {
  const result = classifyMetrics({
    cellDiagonalTransitionDirectionRetentionMin: 0.4,
    cellDiagonalTransitionDownLeftRetention: 1,
    cellDiagonalTransitionDownRightRetention: 0.4,
    cellDiagonalTransitionRetention: 0.8,
    sourceCellDiagonalTransitionCount: 64,
    sourceCellDiagonalTransitionDownLeftCount: 32,
    sourceCellDiagonalTransitionDownRightCount: 32,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'directional-cell-diagonal-transition-loss'),
  )
  assert.ok(!result.issues.some((issue) => issue.code === 'cell-diagonal-transition-loss'))
})

test('quality classification reviews one-direction spurious diagonal cell transitions', () => {
  const result = classifyMetrics({
    cellDiagonalTransitionDirectionSpuriousRatioMax: 0.6,
    cellDiagonalTransitionDownLeftSpuriousRatio: 0,
    cellDiagonalTransitionDownRightSpuriousRatio: 0.6,
    cellDiagonalTransitionSpuriousRatio: 0.3,
    outputCellDiagonalTransitionCount: 64,
    outputCellDiagonalTransitionDownLeftCount: 32,
    outputCellDiagonalTransitionDownRightCount: 32,
  })

  assert.equal(result.status, 'review')
  assert.ok(
    result.issues.some((issue) => issue.code === 'directional-spurious-cell-diagonal-transitions'),
  )
  assert.ok(!result.issues.some((issue) => issue.code === 'spurious-cell-diagonal-transitions'))
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

test('quality classification reviews preservation p95 above the tuned boundary', () => {
  const review = classifyMetrics({
    preservationMae: 0,
    preservationP95: 71,
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 0,
  })
  const pass = classifyMetrics({
    preservationMae: 0,
    preservationP95: 69,
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 0,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'localized-preservation-loss'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews border preservation drift', () => {
  const result = classifyMetrics({
    borderPreservationMae: QUALITY_RULES.maxBorderPreservationMae + 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'border-preservation-drift'))
})

test('quality classification reviews regional preservation p95 above the tuned boundary', () => {
  const review = classifyMetrics({
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 29,
  })
  const pass = classifyMetrics({
    tilePreservationMaxMae: 0,
    tilePreservationP95Mae: 27,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-preservation-loss'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews high intra-cell source variance hidden by MAE', () => {
  const review = classifyMetrics({
    cellMae: 0,
    cellStdDev: 31,
  })
  const pass = classifyMetrics({
    cellMae: 0,
    cellStdDev: 29,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'high-cell-variance'))
  assert.ok(!review.issues.some((issue) => issue.code === 'noisy-cells'))
  assert.equal(pass.status, 'pass')
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

test('quality classification reviews regional chroma drift on colorful inputs', () => {
  const desaturated = classifyMetrics({
    inputChromaMean: QUALITY_RULES.minChromaMeanForRatio,
    tileChromaRatioMin: QUALITY_RULES.minTileChromaRatio - 0.01,
    tileChromaRatioMax: 1,
    tileChromaTileCount: QUALITY_RULES.minTileChromaTileCount,
  })
  const oversaturated = classifyMetrics({
    inputChromaMean: QUALITY_RULES.minChromaMeanForRatio,
    tileChromaRatioMin: 1,
    tileChromaRatioMax: QUALITY_RULES.maxTileChromaRatio + 0.01,
    tileChromaTileCount: QUALITY_RULES.minTileChromaTileCount,
  })

  assert.equal(desaturated.status, 'review')
  assert.ok(desaturated.issues.some((issue) => issue.code === 'regional-chroma-drift'))
  assert.equal(oversaturated.status, 'review')
  assert.ok(oversaturated.issues.some((issue) => issue.code === 'regional-chroma-drift'))
})

test('quality classification reviews spurious color growth', () => {
  const result = classifyMetrics({
    colorfulSpuriousRatio: QUALITY_RULES.maxColorfulSpuriousRatio + 0.01,
    outputColorfulPixelCount: QUALITY_RULES.minColorfulSpuriousPixelCount,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'spurious-color-growth'))
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

test('quality classification reviews dominant bucket coverage drift', () => {
  const result = classifyMetrics({
    dominantBucketCoverageDrift: QUALITY_RULES.maxDominantBucketCoverageDrift + 0.01,
    outputDominantBucketCoverage: 0,
    sourceDominantBucketCoverage: QUALITY_RULES.minDominantBucketCoverage,
  })
  const lowCoverage = classifyMetrics({
    dominantBucketCoverageDrift: 1,
    outputDominantBucketCoverage: QUALITY_RULES.minDominantBucketCoverage - 0.01,
    sourceDominantBucketCoverage: QUALITY_RULES.minDominantBucketCoverage - 0.01,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'dominant-bucket-coverage-drift'))
  assert.equal(lowCoverage.status, 'pass')
})

test('quality classification reviews regional contrast collapse', () => {
  const result = classifyMetrics({
    lowPaletteCoverageEligible: false,
    tileContrastRatioMin: QUALITY_RULES.minTileContrastRatio - 0.01,
    tileContrastTileCount: QUALITY_RULES.minTileContrastTileCount,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-contrast-collapse'))
})

test('quality classification reviews regional luma drift', () => {
  const result = classifyMetrics({
    tileLumaMeanDeltaMax: QUALITY_RULES.maxTileLumaMeanDelta + 0.01,
    tileLumaMeanDeltaTileCount: QUALITY_RULES.minTileLumaMeanDeltaTileCount,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-luma-drift'))
})

test('quality classification reviews regional luma p95 drift', () => {
  const review = classifyMetrics({
    tileLumaMeanDeltaMax: QUALITY_RULES.maxTileLumaMeanDelta - 0.01,
    tileLumaMeanDeltaP95: QUALITY_RULES.maxTileLumaMeanDeltaP95 + 0.01,
    tileLumaMeanDeltaTileCount: QUALITY_RULES.minTileLumaMeanDeltaTileCount,
  })
  const pass = classifyMetrics({
    tileLumaMeanDeltaMax: QUALITY_RULES.maxTileLumaMeanDelta - 0.01,
    tileLumaMeanDeltaP95: QUALITY_RULES.maxTileLumaMeanDeltaP95 - 0.01,
    tileLumaMeanDeltaTileCount: QUALITY_RULES.minTileLumaMeanDeltaTileCount,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-luma-p95-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional line edge collapse', () => {
  const result = classifyMetrics({
    tileLineEdgeRatioMin: QUALITY_RULES.minTileLineEdgeRatio - 0.01,
    tileLineEdgeTileCount: QUALITY_RULES.minTileLineEdgeTileCount,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-line-edge-collapse'))
})

test('quality classification reviews edge magnitude histogram drift', () => {
  const review = classifyMetrics({
    edgeMagnitudeHistogramDrift: QUALITY_RULES.maxEdgeMagnitudeHistogramDrift + 0.01,
  })
  const pass = classifyMetrics({
    edgeMagnitudeHistogramDrift: QUALITY_RULES.maxEdgeMagnitudeHistogramDrift - 0.01,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'edge-magnitude-histogram-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional edge magnitude histogram drift', () => {
  const review = classifyMetrics({
    tileEdgeMagnitudeHistogramDriftP95: QUALITY_RULES.maxTileEdgeMagnitudeHistogramDriftP95 + 0.01,
    tileEdgeMagnitudeHistogramTileCount: QUALITY_RULES.minTileEdgeMagnitudeHistogramTileCount,
  })
  const pass = classifyMetrics({
    tileEdgeMagnitudeHistogramDriftP95: QUALITY_RULES.maxTileEdgeMagnitudeHistogramDriftP95 - 0.01,
    tileEdgeMagnitudeHistogramTileCount: QUALITY_RULES.minTileEdgeMagnitudeHistogramTileCount,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-edge-magnitude-histogram-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews regional hue drift', () => {
  const result = classifyMetrics({
    tileHueErrorMeanMax: QUALITY_RULES.maxTileHueErrorMean + 0.01,
    tileHueErrorTileCount: QUALITY_RULES.minTileHueTileCount,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'regional-hue-drift'))
})

test('quality classification reviews regional hue p95 drift', () => {
  const review = classifyMetrics({
    tileHueErrorMeanMax: QUALITY_RULES.maxTileHueErrorMean - 0.01,
    tileHueErrorP95Max: QUALITY_RULES.maxTileHueErrorP95 + 0.01,
    tileHueErrorTileCount: QUALITY_RULES.minTileHueTileCount,
  })
  const pass = classifyMetrics({
    tileHueErrorMeanMax: QUALITY_RULES.maxTileHueErrorMean - 0.01,
    tileHueErrorP95Max: QUALITY_RULES.maxTileHueErrorP95 - 0.01,
    tileHueErrorTileCount: QUALITY_RULES.minTileHueTileCount,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'regional-hue-p95-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification skips regional contrast for low-palette inputs', () => {
  const result = classifyMetrics({
    lowPaletteCoverageEligible: true,
    tileContrastRatioMin: 0,
    tileContrastTileCount: QUALITY_RULES.minTileContrastTileCount,
  })

  assert.equal(result.status, 'pass')
  assert.ok(!result.issues.some((issue) => issue.code === 'regional-contrast-collapse'))
})

test('quality classification reviews low-palette color growth', () => {
  const result = classifyMetrics({
    lowPaletteCoverageEligible: true,
    lowPaletteGrowth: 1.25,
    lowPaletteRetention: 1,
  })

  assert.equal(result.status, 'review')
  assert.ok(result.issues.some((issue) => issue.code === 'low-palette-growth'))
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
