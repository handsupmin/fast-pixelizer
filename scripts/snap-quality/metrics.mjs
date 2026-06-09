import { MAX_METRIC_SAMPLES } from './config.mjs'
import { alphaMaskStats } from './alpha-mask.mjs'
import { edgeOverlapStats } from './edge-overlap.mjs'
import { resizeToInput } from './image-io.mjs'

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4
  return data[i + 3] === 0 ? 0 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

function axisGradientAt(input, axis, position, stride) {
  const { data, width, height } = input
  let sum = 0
  let count = 0

  if (axis === 'x') {
    const x = Math.min(width - 2, Math.max(1, position))
    for (let y = 0; y < height; y += stride) {
      sum += Math.abs(grayAt(data, width, x + 1, y) - grayAt(data, width, x - 1, y))
      count++
    }
  } else {
    const y = Math.min(height - 2, Math.max(1, position))
    for (let x = 0; x < width; x += stride) {
      sum += Math.abs(grayAt(data, width, x, y + 1) - grayAt(data, width, x, y - 1))
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

export function meanAxisGradient(input) {
  const { data, width, height } = input
  let sum = 0
  let count = 0
  const xStride = Math.max(1, Math.floor(width / 512))
  const yStride = Math.max(1, Math.floor(height / 512))

  for (let y = 0; y < height; y += yStride) {
    for (let x = xStride; x < width - xStride; x += xStride) {
      sum += Math.abs(grayAt(data, width, x + xStride, y) - grayAt(data, width, x - xStride, y))
      count++
    }
  }

  for (let x = 0; x < width; x += xStride) {
    for (let y = yStride; y < height - yStride; y += yStride) {
      sum += Math.abs(grayAt(data, width, x, y + yStride) - grayAt(data, width, x, y - yStride))
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

export function gridBoundaryGradient(input, cols, rows) {
  const signals = gridBoundarySignals(input, cols, rows)
  return signals.mean
}

function axisBoundaryGradient(input, axis, cells, limit, stride) {
  let sum = 0
  let count = 0

  for (let index = 1; index < cells; index++) {
    const position = Math.min(limit - 2, Math.max(1, Math.round((index * limit) / cells)))
    sum += axisGradientAt(input, axis, position, stride)
    count++
  }

  return count > 0 ? sum / count : 0
}

export function gridBoundarySignals(input, cols, rows) {
  const { width, height } = input
  const yStride = Math.max(1, Math.floor(height / 768))
  const xStride = Math.max(1, Math.floor(width / 768))
  const x = axisBoundaryGradient(input, 'x', cols, width, yStride)
  const y = axisBoundaryGradient(input, 'y', rows, height, xStride)
  return {
    mean: (x + y) / 2,
    min: Math.min(x, y),
    x,
    y,
  }
}

function axisPhaseAlignment(input, axis, cells, limit, stride) {
  const step = limit / cells
  const radius = Math.max(1, Math.min(8, Math.floor(step / 2)))
  let sum = 0
  let count = 0

  for (let index = 1; index < cells; index++) {
    const base = Math.round(index * step)
    const boundary = axisGradientAt(input, axis, base, stride)
    let best = 0
    for (let offset = -radius; offset <= radius; offset++) {
      best = Math.max(best, axisGradientAt(input, axis, base + offset, stride))
    }
    if (best <= 0.01) continue
    sum += boundary / best
    count++
  }

  return count > 0 ? sum / count : 1
}

export function gridPhaseAlignment(input, cols, rows) {
  return gridPhaseSignals(input, cols, rows).mean
}

export function gridPhaseSignals(input, cols, rows) {
  const xStride = Math.max(1, Math.floor(input.height / 512))
  const yStride = Math.max(1, Math.floor(input.width / 512))
  const x = axisPhaseAlignment(input, 'x', cols, input.width, xStride)
  const y = axisPhaseAlignment(input, 'y', rows, input.height, yStride)
  return {
    mean: (x + y) / 2,
    min: Math.min(x, y),
    x,
    y,
  }
}

export function cellUniformityMetrics(input, cols, rows) {
  const { data, width, height } = input
  const cellCount = cols * rows
  const sums = new Float64Array(cellCount * 3)
  const sumsSq = new Float64Array(cellCount * 3)
  const alphaSums = new Float64Array(cellCount)
  const counts = new Uint32Array(cellCount)
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    const cell = row * cols + col
    const i = pixel * 4
    for (let ch = 0; ch < 3; ch++) {
      const value = data[i + ch]
      sums[cell * 3 + ch] += value
      sumsSq[cell * 3 + ch] += value * value
    }
    alphaSums[cell] += data[i + 3]
    counts[cell]++
  }

  let weightedVariance = 0
  let alphaWeightedMae = 0
  let weightedMae = 0
  let sampleCount = 0

  for (let cell = 0; cell < cellCount; cell++) {
    const count = counts[cell]
    if (count === 0) continue
    sampleCount += count
    for (let ch = 0; ch < 3; ch++) {
      const idx = cell * 3 + ch
      const mean = sums[idx] / count
      const variance = Math.max(0, sumsSq[idx] / count - mean * mean)
      weightedVariance += variance * count
    }
  }

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    const cell = row * cols + col
    const count = counts[cell] || 1
    const i = pixel * 4
    alphaWeightedMae += Math.abs(data[i + 3] - alphaSums[cell] / count)
    for (let ch = 0; ch < 3; ch++) {
      weightedMae += Math.abs(data[i + ch] - sums[cell * 3 + ch] / count)
    }
  }

  return {
    alphaCellMae: sampleCount > 0 ? alphaWeightedMae / sampleCount : 0,
    cellStdDev: sampleCount > 0 ? Math.sqrt(weightedVariance / (sampleCount * 3)) : 0,
    cellMae: sampleCount > 0 ? weightedMae / (sampleCount * 3) : 0,
  }
}

function lumaStats(data, width, height) {
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const i = pixel * 4
    const luma = lumaAt(data, i)
    sum += luma
    sumSq += luma * luma
    count++
  }
  const mean = count > 0 ? sum / count : 0
  return { mean, stdDev: count > 0 ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0 }
}

function lumaAt(data, index) {
  return data[index + 3] === 0
    ? 0
    : 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]
}

function chromaStats(data, width, height) {
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))
  let sum = 0
  let count = 0
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const i = pixel * 4
    if (data[i + 3] === 0) continue
    sum += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
    count++
  }
  return { mean: count > 0 ? sum / count : 0 }
}

function chromaAt(data, index) {
  return (
    Math.max(data[index], data[index + 1], data[index + 2]) -
    Math.min(data[index], data[index + 1], data[index + 2])
  )
}

function rgbKey(data, index) {
  return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function hueAt(data, index) {
  const r = data[index] / 255
  const g = data[index + 1] / 255
  const b = data[index + 2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0

  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4

  const degrees = hue * 60
  return degrees < 0 ? degrees + 360 : degrees
}

function hueDistance(a, b) {
  const distance = Math.abs(a - b) % 360
  return Math.min(distance, 360 - distance)
}

function percentile(sortedValues, quantile) {
  return sortedValues.length > 0
    ? sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile))]
    : 0
}

function tilePreservationValues(tileSums, tileCounts) {
  const values = []
  for (let tile = 0; tile < tileSums.length; tile++) {
    if (tileCounts[tile] > 0) values.push(tileSums[tile] / tileCounts[tile])
  }
  values.sort((a, b) => a - b)
  return values
}

function rgbCoverageStats(inputColors, inputCount, outputColors, outputCount) {
  if (inputCount === 0) {
    return {
      rgbCoverageDrift: outputCount > 0 ? 1 : 0,
      rgbCoverageRetention: outputCount > 0 ? 0 : 1,
    }
  }
  if (outputCount === 0) {
    return {
      rgbCoverageDrift: 1,
      rgbCoverageRetention: 0,
    }
  }

  const keys = new Set([...inputColors.keys(), ...outputColors.keys()])
  let drift = 0
  let retained = 0
  for (const key of keys) {
    const inputValue = inputColors.get(key) ?? 0
    const outputValue = outputColors.get(key) ?? 0
    drift += Math.abs(inputValue / inputCount - outputValue / outputCount)
    if (inputValue > 0) retained += Math.min(inputValue, outputValue)
  }

  return {
    rgbCoverageDrift: drift / 2,
    rgbCoverageRetention: retained / inputCount,
  }
}

function createTileCoverage(tileCount) {
  return Array.from({ length: tileCount }, () => new Map())
}

function rgbTileCoverageStats(inputTiles, inputCounts, outputTiles, outputCounts) {
  let driftMax = 0
  let retentionMin = 1
  let retentionTileCount = 0
  let tileCount = 0

  for (let tile = 0; tile < inputTiles.length; tile++) {
    const inputCount = inputCounts[tile]
    const outputCount = outputCounts[tile]
    if (inputCount === 0 && outputCount === 0) continue

    const stats = rgbCoverageStats(inputTiles[tile], inputCount, outputTiles[tile], outputCount)
    driftMax = Math.max(driftMax, stats.rgbCoverageDrift)
    tileCount++
    if (inputCount > 0) {
      retentionMin = Math.min(retentionMin, stats.rgbCoverageRetention)
      retentionTileCount++
    }
  }

  return {
    rgbTileCoverageDriftMax: driftMax,
    rgbTileCoverageRetentionMin: retentionTileCount > 0 ? retentionMin : 1,
    rgbTileCoverageTileCount: tileCount,
  }
}

function tileContrastStats(inputSums, inputSumsSq, outputSums, outputSumsSq, counts, minStdDev) {
  let ratioMin = 1
  let ratioMax = 1
  let tileCount = 0

  for (let tile = 0; tile < counts.length; tile++) {
    const count = counts[tile]
    if (count === 0) continue

    const inputMean = inputSums[tile] / count
    const inputStdDev = Math.sqrt(Math.max(0, inputSumsSq[tile] / count - inputMean * inputMean))
    if (inputStdDev < minStdDev) continue

    const outputMean = outputSums[tile] / count
    const outputStdDev = Math.sqrt(
      Math.max(0, outputSumsSq[tile] / count - outputMean * outputMean),
    )
    const ratio = outputStdDev / inputStdDev
    ratioMin = Math.min(ratioMin, ratio)
    ratioMax = Math.max(ratioMax, ratio)
    tileCount++
  }

  return {
    tileContrastRatioMin: tileCount > 0 ? ratioMin : 1,
    tileContrastRatioMax: tileCount > 0 ? ratioMax : 1,
    tileContrastTileCount: tileCount,
  }
}

function tileChromaStats(inputSums, outputSums, counts, minInputMean) {
  let ratioMin = 1
  let ratioMax = 1
  let tileCount = 0

  for (let tile = 0; tile < counts.length; tile++) {
    const count = counts[tile]
    if (count === 0) continue

    const inputMean = inputSums[tile] / count
    if (inputMean < minInputMean) continue

    const outputMean = outputSums[tile] / count
    const ratio = outputMean / inputMean
    ratioMin = Math.min(ratioMin, ratio)
    ratioMax = Math.max(ratioMax, ratio)
    tileCount++
  }

  return {
    tileChromaRatioMin: tileCount > 0 ? ratioMin : 1,
    tileChromaRatioMax: tileCount > 0 ? ratioMax : 1,
    tileChromaTileCount: tileCount,
  }
}

function tileLineEdgeStats(inputSums, outputSums, counts, minInputMean) {
  let ratioMin = 1
  let ratioMax = 1
  let tileCount = 0

  for (let tile = 0; tile < counts.length; tile++) {
    const count = counts[tile]
    if (count === 0) continue

    const inputMean = inputSums[tile] / count
    if (inputMean < minInputMean) continue

    const outputMean = outputSums[tile] / count
    const ratio = outputMean / inputMean
    ratioMin = Math.min(ratioMin, ratio)
    ratioMax = Math.max(ratioMax, ratio)
    tileCount++
  }

  return {
    tileLineEdgeRatioMin: tileCount > 0 ? ratioMin : 1,
    tileLineEdgeRatioMax: tileCount > 0 ? ratioMax : 1,
    tileLineEdgeTileCount: tileCount,
  }
}

function localAxisGradient(data, width, x, y, index) {
  let sum = 0
  let count = 0
  const center = lumaAt(data, index)

  if (x > 0) {
    sum += Math.abs(center - lumaAt(data, index - 4))
    count++
  }
  if (y > 0) {
    sum += Math.abs(center - lumaAt(data, index - width * 4))
    count++
  }

  return count > 0 ? sum / count : 0
}

export async function preservationStats(input, result, options = {}) {
  const resized = await resizeToInput(result, input)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))
  const tileGrid = options.tileGrid ?? 8
  const tileCount = tileGrid * tileGrid
  const tileSums = new Float64Array(tileCount)
  const alphaTileSums = new Float64Array(tileCount)
  const inputLumaTileSums = new Float64Array(tileCount)
  const inputLumaTileSumsSq = new Float64Array(tileCount)
  const outputLumaTileSums = new Float64Array(tileCount)
  const outputLumaTileSumsSq = new Float64Array(tileCount)
  const inputChromaTileSums = new Float64Array(tileCount)
  const outputChromaTileSums = new Float64Array(tileCount)
  const inputLineEdgeTileSums = new Float64Array(tileCount)
  const outputLineEdgeTileSums = new Float64Array(tileCount)
  const tileCounts = new Uint32Array(tileCount)
  const hueMinChroma = options.hueMinChroma ?? 16
  const tileContrastMinStdDev = options.tileContrastMinStdDev ?? 8
  const tileChromaMinMean = options.tileChromaMinMean ?? 8
  const tileLineEdgeMinMean = options.tileLineEdgeMinMean ?? 6
  const inputRgbCoverage = new Map()
  const outputRgbCoverage = new Map()
  const inputRgbTileCoverage = createTileCoverage(tileCount)
  const outputRgbTileCoverage = createTileCoverage(tileCount)
  const inputRgbTileCoverageCounts = new Uint32Array(tileCount)
  const outputRgbTileCoverageCounts = new Uint32Array(tileCount)
  const hueErrors = []
  const errors = []
  const alphaErrors = []
  let sum = 0
  let alphaSum = 0
  let count = 0
  let alphaCount = 0
  let inputRgbCoverageCount = 0
  let outputRgbCoverageCount = 0

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const x = pixel % input.width
    const y = Math.floor(pixel / input.width)
    const i = pixel * 4
    const tileX = Math.min(tileGrid - 1, Math.floor((x * tileGrid) / input.width))
    const tileY = Math.min(tileGrid - 1, Math.floor((y * tileGrid) / input.height))
    const tile = tileY * tileGrid + tileX
    if (input.data[i + 3] > 0) {
      const key = rgbKey(input.data, i)
      increment(inputRgbCoverage, key)
      increment(inputRgbTileCoverage[tile], key)
      inputRgbCoverageCount++
      inputRgbTileCoverageCounts[tile]++
    }
    if (resized[i + 3] > 0) {
      const key = rgbKey(resized, i)
      increment(outputRgbCoverage, key)
      increment(outputRgbTileCoverage[tile], key)
      outputRgbCoverageCount++
      outputRgbTileCoverageCounts[tile]++
    }
    let pixelError = 0
    for (let ch = 0; ch < 3; ch++) {
      const channelError = Math.abs(input.data[i + ch] - resized[i + ch])
      sum += channelError
      pixelError += channelError
      count++
    }
    const alphaError = Math.abs(input.data[i + 3] - resized[i + 3])
    const inputLuma = lumaAt(input.data, i)
    const outputLuma = lumaAt(resized, i)
    const inputChromaValue = chromaAt(input.data, i)
    const outputChromaValue = chromaAt(resized, i)
    const inputLineEdge = localAxisGradient(input.data, input.width, x, y, i)
    const outputLineEdge = localAxisGradient(resized, input.width, x, y, i)
    tileSums[tile] += pixelError / 3
    alphaTileSums[tile] += alphaError
    inputLumaTileSums[tile] += inputLuma
    inputLumaTileSumsSq[tile] += inputLuma * inputLuma
    outputLumaTileSums[tile] += outputLuma
    outputLumaTileSumsSq[tile] += outputLuma * outputLuma
    inputChromaTileSums[tile] += inputChromaValue
    outputChromaTileSums[tile] += outputChromaValue
    inputLineEdgeTileSums[tile] += inputLineEdge
    outputLineEdgeTileSums[tile] += outputLineEdge
    tileCounts[tile]++
    if (
      input.data[i + 3] > 0 &&
      resized[i + 3] > 0 &&
      inputChromaValue >= hueMinChroma &&
      outputChromaValue >= hueMinChroma
    ) {
      hueErrors.push(hueDistance(hueAt(input.data, i), hueAt(resized, i)))
    }
    alphaSum += alphaError
    alphaCount++
    errors.push(pixelError / 3)
    alphaErrors.push(alphaError)
  }

  errors.sort((a, b) => a - b)
  alphaErrors.sort((a, b) => a - b)
  hueErrors.sort((a, b) => a - b)
  const tileValues = tilePreservationValues(tileSums, tileCounts)
  const alphaTileValues = tilePreservationValues(alphaTileSums, tileCounts)
  const tileContrast = tileContrastStats(
    inputLumaTileSums,
    inputLumaTileSumsSq,
    outputLumaTileSums,
    outputLumaTileSumsSq,
    tileCounts,
    tileContrastMinStdDev,
  )
  const tileChroma = tileChromaStats(
    inputChromaTileSums,
    outputChromaTileSums,
    tileCounts,
    tileChromaMinMean,
  )
  const tileLineEdge = tileLineEdgeStats(
    inputLineEdgeTileSums,
    outputLineEdgeTileSums,
    tileCounts,
    tileLineEdgeMinMean,
  )
  const inputLuma = lumaStats(input.data, input.width, input.height)
  const outputLuma = lumaStats(resized, input.width, input.height)
  const inputChroma = chromaStats(input.data, input.width, input.height)
  const outputChroma = chromaStats(resized, input.width, input.height)
  const inputEdge = meanAxisGradient(input)
  const outputEdge = meanAxisGradient({ data: resized, width: input.width, height: input.height })
  const rgbCoverage = rgbCoverageStats(
    inputRgbCoverage,
    inputRgbCoverageCount,
    outputRgbCoverage,
    outputRgbCoverageCount,
  )
  const rgbTileCoverage = rgbTileCoverageStats(
    inputRgbTileCoverage,
    inputRgbTileCoverageCounts,
    outputRgbTileCoverage,
    outputRgbTileCoverageCounts,
  )
  const edgeOverlap = options.edgeOverlap
    ? edgeOverlapStats(input, resized)
    : {
        directedEdgeJaccardMin: 1,
        directedEdgeRecallMin: 1,
        directedEdgeSpuriousMax: 0,
        edgeDirectionDrift: 0,
        edgeRecall: 1,
        edgeSpuriousRatio: 0,
        edgeJaccard: 1,
        edgeTileJaccardMin: 1,
        edgeTileRecallMin: 1,
        edgeTileSpuriousMax: 0,
        outputDirectedEdgeBinCount: 0,
        outputEdgeDirectionCount: 0,
        outputEdgeTileCount: 0,
        sourceDirectedEdgeBinCount: 0,
        sourceEdgeDirectionCount: 0,
        sourceEdgeTileCount: 0,
      }
  const alphaMask = options.alphaMask
    ? alphaMaskStats(input, resized)
    : {
        alphaCoverageRatio: 1,
        alphaComponentAreaDrift: 0,
        alphaComponentBBoxDrift: 0,
        alphaComponentCount: 0,
        alphaComponentCountDrift: 0,
        alphaComponentPerimeterDrift: 0,
        alphaComponentPositionDrift: 0,
        alphaHoleCount: 0,
        alphaHoleCountDrift: 0,
        alphaEdgeCount: 0,
        alphaEdgeJaccard: 1,
        alphaEdgeRecall: 1,
        alphaEdgeSpuriousRatio: 0,
        alphaEdgeTileJaccardMin: 1,
        alphaEdgeTileRecallMin: 1,
        alphaEdgeTileSpuriousMax: 0,
        alphaMaskIou: 1,
        alphaBBoxDriftPx: 0,
        alphaBBoxDriftRatio: 0,
        alphaSemitransparentPixelCount: 0,
        alphaSemitransparentRetention: 1,
        alphaSemitransparentSpuriousRatio: 0,
        alphaSemitransparentValueMae: 0,
        alphaSemitransparentValueP95: 0,
        alphaSmallComponentCount: 0,
        alphaSmallComponentCountDrift: 0,
        outputAlphaComponentCount: 0,
        outputAlphaEdgeCount: 0,
        outputAlphaEdgeTileCount: 0,
        outputAlphaHoleCount: 0,
        outputAlphaSemitransparentPixelCount: 0,
        outputAlphaSmallComponentCount: 0,
        sourceAlphaEdgeTileCount: 0,
      }

  return {
    mae: count > 0 ? sum / count : 0,
    p95: percentile(errors, 0.95),
    tileMaxMae: tileValues.length > 0 ? tileValues[tileValues.length - 1] : 0,
    tileP95Mae: percentile(tileValues, 0.95),
    alphaMae: alphaCount > 0 ? alphaSum / alphaCount : 0,
    alphaP95: percentile(alphaErrors, 0.95),
    alphaMax: alphaErrors.length > 0 ? alphaErrors[alphaErrors.length - 1] : 0,
    alphaTileMaxMae: alphaTileValues.length > 0 ? alphaTileValues[alphaTileValues.length - 1] : 0,
    alphaTileP95Mae: percentile(alphaTileValues, 0.95),
    alphaCoverageRatio: alphaMask.alphaCoverageRatio,
    alphaMaskIou: alphaMask.alphaMaskIou,
    alphaBBoxDriftPx: alphaMask.alphaBBoxDriftPx,
    alphaBBoxDriftRatio: alphaMask.alphaBBoxDriftRatio,
    alphaComponentAreaDrift: alphaMask.alphaComponentAreaDrift,
    alphaComponentBBoxDrift: alphaMask.alphaComponentBBoxDrift,
    alphaComponentCount: alphaMask.alphaComponentCount,
    outputAlphaComponentCount: alphaMask.outputAlphaComponentCount,
    alphaComponentCountDrift: alphaMask.alphaComponentCountDrift,
    alphaComponentPerimeterDrift: alphaMask.alphaComponentPerimeterDrift,
    alphaComponentPositionDrift: alphaMask.alphaComponentPositionDrift,
    alphaHoleCount: alphaMask.alphaHoleCount,
    outputAlphaHoleCount: alphaMask.outputAlphaHoleCount,
    alphaHoleCountDrift: alphaMask.alphaHoleCountDrift,
    alphaSmallComponentCount: alphaMask.alphaSmallComponentCount,
    outputAlphaSmallComponentCount: alphaMask.outputAlphaSmallComponentCount,
    alphaSmallComponentCountDrift: alphaMask.alphaSmallComponentCountDrift,
    alphaSemitransparentPixelCount: alphaMask.alphaSemitransparentPixelCount,
    outputAlphaSemitransparentPixelCount: alphaMask.outputAlphaSemitransparentPixelCount,
    alphaSemitransparentRetention: alphaMask.alphaSemitransparentRetention,
    alphaSemitransparentSpuriousRatio: alphaMask.alphaSemitransparentSpuriousRatio,
    alphaSemitransparentValueMae: alphaMask.alphaSemitransparentValueMae,
    alphaSemitransparentValueP95: alphaMask.alphaSemitransparentValueP95,
    alphaEdgeCount: alphaMask.alphaEdgeCount,
    outputAlphaEdgeCount: alphaMask.outputAlphaEdgeCount,
    alphaEdgeRecall: alphaMask.alphaEdgeRecall,
    alphaEdgeSpuriousRatio: alphaMask.alphaEdgeSpuriousRatio,
    alphaEdgeJaccard: alphaMask.alphaEdgeJaccard,
    alphaEdgeTileJaccardMin: alphaMask.alphaEdgeTileJaccardMin,
    alphaEdgeTileRecallMin: alphaMask.alphaEdgeTileRecallMin,
    alphaEdgeTileSpuriousMax: alphaMask.alphaEdgeTileSpuriousMax,
    outputAlphaEdgeTileCount: alphaMask.outputAlphaEdgeTileCount,
    sourceAlphaEdgeTileCount: alphaMask.sourceAlphaEdgeTileCount,
    inputChromaMean: inputChroma.mean,
    outputChromaMean: outputChroma.mean,
    chromaRatio: inputChroma.mean > 0 ? outputChroma.mean / inputChroma.mean : 1,
    rgbCoverageDrift: rgbCoverage.rgbCoverageDrift,
    rgbCoverageRetention: rgbCoverage.rgbCoverageRetention,
    rgbTileCoverageDriftMax: rgbTileCoverage.rgbTileCoverageDriftMax,
    rgbTileCoverageRetentionMin: rgbTileCoverage.rgbTileCoverageRetentionMin,
    rgbTileCoverageTileCount: rgbTileCoverage.rgbTileCoverageTileCount,
    hueErrorMean:
      hueErrors.length > 0
        ? hueErrors.reduce((total, value) => total + value, 0) / hueErrors.length
        : 0,
    hueErrorP95: percentile(hueErrors, 0.95),
    hueSampleCount: hueErrors.length,
    contrastRatio: inputLuma.stdDev > 0 ? outputLuma.stdDev / inputLuma.stdDev : 1,
    tileContrastRatioMin: tileContrast.tileContrastRatioMin,
    tileContrastRatioMax: tileContrast.tileContrastRatioMax,
    tileContrastTileCount: tileContrast.tileContrastTileCount,
    tileChromaRatioMin: tileChroma.tileChromaRatioMin,
    tileChromaRatioMax: tileChroma.tileChromaRatioMax,
    tileChromaTileCount: tileChroma.tileChromaTileCount,
    lineEdgeRatio: inputEdge > 0 ? outputEdge / inputEdge : 1,
    tileLineEdgeRatioMin: tileLineEdge.tileLineEdgeRatioMin,
    tileLineEdgeRatioMax: tileLineEdge.tileLineEdgeRatioMax,
    tileLineEdgeTileCount: tileLineEdge.tileLineEdgeTileCount,
    directedEdgeJaccardMin: edgeOverlap.directedEdgeJaccardMin,
    directedEdgeRecallMin: edgeOverlap.directedEdgeRecallMin,
    directedEdgeSpuriousMax: edgeOverlap.directedEdgeSpuriousMax,
    edgeDirectionDrift: edgeOverlap.edgeDirectionDrift,
    edgeRecall: edgeOverlap.edgeRecall,
    edgeSpuriousRatio: edgeOverlap.edgeSpuriousRatio,
    edgeJaccard: edgeOverlap.edgeJaccard,
    edgeTileJaccardMin: edgeOverlap.edgeTileJaccardMin,
    edgeTileRecallMin: edgeOverlap.edgeTileRecallMin,
    edgeTileSpuriousMax: edgeOverlap.edgeTileSpuriousMax,
    outputDirectedEdgeBinCount: edgeOverlap.outputDirectedEdgeBinCount,
    outputEdgeDirectionCount: edgeOverlap.outputEdgeDirectionCount,
    outputEdgeTileCount: edgeOverlap.outputEdgeTileCount,
    sourceDirectedEdgeBinCount: edgeOverlap.sourceDirectedEdgeBinCount,
    sourceEdgeDirectionCount: edgeOverlap.sourceEdgeDirectionCount,
    sourceEdgeTileCount: edgeOverlap.sourceEdgeTileCount,
  }
}

export function uniqueColorCount(input) {
  const { data, width, height } = input
  const colors = new Set()
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const i = pixel * 4
    colors.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0)
  }
  return colors.size
}

export function uniqueRgbColorCount(input) {
  const { data, width, height } = input
  const colors = new Set()
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const i = pixel * 4
    if (data[i + 3] === 0) continue
    colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
  }
  return colors.size
}
