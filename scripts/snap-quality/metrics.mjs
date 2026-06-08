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
    counts[cell]++
  }

  let weightedVariance = 0
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
    for (let ch = 0; ch < 3; ch++) {
      weightedMae += Math.abs(data[i + ch] - sums[cell * 3 + ch] / count)
    }
  }

  return {
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
    const luma = data[i + 3] === 0 ? 0 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += luma
    sumSq += luma * luma
    count++
  }
  const mean = count > 0 ? sum / count : 0
  return { mean, stdDev: count > 0 ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0 }
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

export async function preservationStats(input, result, options = {}) {
  const resized = await resizeToInput(result, input)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))
  const tileGrid = options.tileGrid ?? 8
  const tileSums = new Float64Array(tileGrid * tileGrid)
  const tileCounts = new Uint32Array(tileGrid * tileGrid)
  const hueMinChroma = options.hueMinChroma ?? 16
  const inputRgbCoverage = new Map()
  const outputRgbCoverage = new Map()
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
    if (input.data[i + 3] > 0) {
      increment(inputRgbCoverage, rgbKey(input.data, i))
      inputRgbCoverageCount++
    }
    if (resized[i + 3] > 0) {
      increment(outputRgbCoverage, rgbKey(resized, i))
      outputRgbCoverageCount++
    }
    let pixelError = 0
    for (let ch = 0; ch < 3; ch++) {
      const channelError = Math.abs(input.data[i + ch] - resized[i + ch])
      sum += channelError
      pixelError += channelError
      count++
    }
    const alphaError = Math.abs(input.data[i + 3] - resized[i + 3])
    const tileX = Math.min(tileGrid - 1, Math.floor((x * tileGrid) / input.width))
    const tileY = Math.min(tileGrid - 1, Math.floor((y * tileGrid) / input.height))
    const tile = tileY * tileGrid + tileX
    tileSums[tile] += pixelError / 3
    tileCounts[tile]++
    if (
      input.data[i + 3] > 0 &&
      resized[i + 3] > 0 &&
      chromaAt(input.data, i) >= hueMinChroma &&
      chromaAt(resized, i) >= hueMinChroma
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
  const edgeOverlap = options.edgeOverlap
    ? edgeOverlapStats(input, resized)
    : { edgeRecall: 1, edgeSpuriousRatio: 0, edgeJaccard: 1 }
  const alphaMask = options.alphaMask
    ? alphaMaskStats(input, resized)
    : {
        alphaCoverageRatio: 1,
        alphaComponentCount: 0,
        alphaComponentCountDrift: 0,
        alphaEdgeCount: 0,
        alphaEdgeJaccard: 1,
        alphaEdgeRecall: 1,
        alphaEdgeSpuriousRatio: 0,
        alphaMaskIou: 1,
        alphaBBoxDriftPx: 0,
        alphaBBoxDriftRatio: 0,
        alphaSmallComponentCount: 0,
        alphaSmallComponentCountDrift: 0,
        outputAlphaComponentCount: 0,
        outputAlphaEdgeCount: 0,
        outputAlphaSmallComponentCount: 0,
      }

  return {
    mae: count > 0 ? sum / count : 0,
    p95: percentile(errors, 0.95),
    tileMaxMae: tileValues.length > 0 ? tileValues[tileValues.length - 1] : 0,
    tileP95Mae: percentile(tileValues, 0.95),
    alphaMae: alphaCount > 0 ? alphaSum / alphaCount : 0,
    alphaP95: percentile(alphaErrors, 0.95),
    alphaCoverageRatio: alphaMask.alphaCoverageRatio,
    alphaMaskIou: alphaMask.alphaMaskIou,
    alphaBBoxDriftPx: alphaMask.alphaBBoxDriftPx,
    alphaBBoxDriftRatio: alphaMask.alphaBBoxDriftRatio,
    alphaComponentCount: alphaMask.alphaComponentCount,
    outputAlphaComponentCount: alphaMask.outputAlphaComponentCount,
    alphaComponentCountDrift: alphaMask.alphaComponentCountDrift,
    alphaSmallComponentCount: alphaMask.alphaSmallComponentCount,
    outputAlphaSmallComponentCount: alphaMask.outputAlphaSmallComponentCount,
    alphaSmallComponentCountDrift: alphaMask.alphaSmallComponentCountDrift,
    alphaEdgeCount: alphaMask.alphaEdgeCount,
    outputAlphaEdgeCount: alphaMask.outputAlphaEdgeCount,
    alphaEdgeRecall: alphaMask.alphaEdgeRecall,
    alphaEdgeSpuriousRatio: alphaMask.alphaEdgeSpuriousRatio,
    alphaEdgeJaccard: alphaMask.alphaEdgeJaccard,
    inputChromaMean: inputChroma.mean,
    outputChromaMean: outputChroma.mean,
    chromaRatio: inputChroma.mean > 0 ? outputChroma.mean / inputChroma.mean : 1,
    rgbCoverageDrift: rgbCoverage.rgbCoverageDrift,
    rgbCoverageRetention: rgbCoverage.rgbCoverageRetention,
    hueErrorMean:
      hueErrors.length > 0
        ? hueErrors.reduce((total, value) => total + value, 0) / hueErrors.length
        : 0,
    hueErrorP95: percentile(hueErrors, 0.95),
    hueSampleCount: hueErrors.length,
    contrastRatio: inputLuma.stdDev > 0 ? outputLuma.stdDev / inputLuma.stdDev : 1,
    lineEdgeRatio: inputEdge > 0 ? outputEdge / inputEdge : 1,
    edgeRecall: edgeOverlap.edgeRecall,
    edgeSpuriousRatio: edgeOverlap.edgeSpuriousRatio,
    edgeJaccard: edgeOverlap.edgeJaccard,
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
