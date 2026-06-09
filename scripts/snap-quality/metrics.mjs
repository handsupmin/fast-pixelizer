import { MAX_METRIC_SAMPLES, QUALITY_RULES } from './config.mjs'
import { alphaMaskStats } from './alpha-mask.mjs'
import { edgeOverlapStats } from './edge-overlap.mjs'
import { resizeToInput } from './image-io.mjs'

const RGB_HISTOGRAM_BINS = 16
const EDGE_MAGNITUDE_HISTOGRAM_BINS = [0, 8, 16, 24, 32, 48, 64, 96, 128, 192, Infinity]

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

function rgbBucketKey(data, index) {
  return ((data[index] >> 4) << 8) | ((data[index + 1] >> 4) << 4) | (data[index + 2] >> 4)
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

function tileLumaMeanDeltaStats(inputSums, outputSums, counts) {
  const values = []
  let deltaMax = 0
  let tileCount = 0

  for (let tile = 0; tile < counts.length; tile++) {
    const count = counts[tile]
    if (count === 0) continue

    const delta = Math.abs(outputSums[tile] / count - inputSums[tile] / count)
    deltaMax = Math.max(deltaMax, delta)
    values.push(delta)
    tileCount++
  }

  values.sort((a, b) => a - b)

  return {
    tileLumaMeanDeltaMax: deltaMax,
    tileLumaMeanDeltaP95: percentile(values, 0.95),
    tileLumaMeanDeltaTileCount: tileCount,
  }
}

function tileMeanRgbDriftStats(inputSums, inputCounts, outputSums, outputCounts, minSampleCount) {
  const values = []
  let driftMax = 0

  for (let tile = 0; tile < inputCounts.length; tile++) {
    const inputCount = inputCounts[tile]
    const outputCount = outputCounts[tile]
    if (Math.max(inputCount, outputCount) < minSampleCount) continue

    const inputR = inputCount > 0 ? inputSums[tile * 3] / inputCount : 0
    const inputG = inputCount > 0 ? inputSums[tile * 3 + 1] / inputCount : 0
    const inputB = inputCount > 0 ? inputSums[tile * 3 + 2] / inputCount : 0
    const outputR = outputCount > 0 ? outputSums[tile * 3] / outputCount : 0
    const outputG = outputCount > 0 ? outputSums[tile * 3 + 1] / outputCount : 0
    const outputB = outputCount > 0 ? outputSums[tile * 3 + 2] / outputCount : 0
    const drift = Math.hypot(inputR - outputR, inputG - outputG, inputB - outputB)
    driftMax = Math.max(driftMax, drift)
    values.push(drift)
  }

  values.sort((a, b) => a - b)

  return {
    tileMeanRgbDriftMax: driftMax,
    tileMeanRgbDriftP95: percentile(values, 0.95),
    tileMeanRgbDriftTileCount: values.length,
  }
}

function tileCoverageDriftStats(inputHits, inputCounts, outputHits, outputCounts, minSampleCount) {
  const values = []
  let driftMax = 0

  for (let tile = 0; tile < inputHits.length; tile++) {
    if (Math.max(inputCounts[tile], outputCounts[tile]) < minSampleCount) continue

    const inputCoverage = inputCounts[tile] > 0 ? inputHits[tile] / inputCounts[tile] : 0
    const outputCoverage = outputCounts[tile] > 0 ? outputHits[tile] / outputCounts[tile] : 0
    const drift = Math.abs(inputCoverage - outputCoverage)
    driftMax = Math.max(driftMax, drift)
    values.push(drift)
  }

  values.sort((a, b) => a - b)

  return {
    tileCoverageDriftMax: driftMax,
    tileCoverageDriftP95: percentile(values, 0.95),
    tileCoverageTileCount: values.length,
  }
}

function inkComponentStats(data, width, height, lumaThreshold, minArea) {
  const visited = new Uint8Array(width * height)
  const stack = []
  let componentCount = 0
  let componentPixelCount = 0
  let largestComponentPixels = 0

  function isInk(index) {
    const offset = index * 4
    return data[offset + 3] > 0 && lumaAt(data, offset) < lumaThreshold
  }

  for (let index = 0; index < width * height; index++) {
    if (visited[index] || !isInk(index)) continue

    visited[index] = 1
    stack.length = 0
    stack.push(index)
    let area = 0

    while (stack.length > 0) {
      const current = stack.pop()
      area++
      const x = current % width
      const y = Math.floor(current / width)
      const left = current - 1
      const right = current + 1
      const up = current - width
      const down = current + width

      if (x > 0 && !visited[left] && isInk(left)) {
        visited[left] = 1
        stack.push(left)
      }
      if (x < width - 1 && !visited[right] && isInk(right)) {
        visited[right] = 1
        stack.push(right)
      }
      if (y > 0 && !visited[up] && isInk(up)) {
        visited[up] = 1
        stack.push(up)
      }
      if (y < height - 1 && !visited[down] && isInk(down)) {
        visited[down] = 1
        stack.push(down)
      }
    }

    if (area < minArea) continue
    componentCount++
    componentPixelCount += area
    largestComponentPixels = Math.max(largestComponentPixels, area)
  }

  return {
    componentCount,
    componentPixelCount,
    largestComponentPixels,
  }
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

function addRgbHistogramBins(histogram, data, index) {
  for (let ch = 0; ch < 3; ch++) {
    const bucket = Math.min(RGB_HISTOGRAM_BINS - 1, data[index + ch] >> 4)
    histogram[ch * RGB_HISTOGRAM_BINS + bucket]++
  }
}

function rgbHistogramDrift(inputHistogram, inputCount, outputHistogram, outputCount) {
  if (inputCount === 0 && outputCount === 0) return 0

  let total = 0
  for (let ch = 0; ch < 3; ch++) {
    let channel = 0
    const offset = ch * RGB_HISTOGRAM_BINS
    for (let bin = 0; bin < RGB_HISTOGRAM_BINS; bin++) {
      const inputValue = inputCount > 0 ? inputHistogram[offset + bin] / inputCount : 0
      const outputValue = outputCount > 0 ? outputHistogram[offset + bin] / outputCount : 0
      channel += Math.abs(inputValue - outputValue)
    }
    total += channel / 2
  }

  return total / 3
}

function tileRgbHistogramStats(
  inputHistograms,
  inputCounts,
  outputHistograms,
  outputCounts,
  minSampleCount,
) {
  const values = []
  let driftMax = 0

  for (let tile = 0; tile < inputHistograms.length; tile++) {
    if (Math.max(inputCounts[tile], outputCounts[tile]) < minSampleCount) continue

    const drift = rgbHistogramDrift(
      inputHistograms[tile],
      inputCounts[tile],
      outputHistograms[tile],
      outputCounts[tile],
    )
    driftMax = Math.max(driftMax, drift)
    values.push(drift)
  }

  values.sort((a, b) => a - b)

  return {
    tileRgbHistogramDriftMax: driftMax,
    tileRgbHistogramDriftP95: percentile(values, 0.95),
    tileRgbHistogramTileCount: values.length,
  }
}

function dominantBucketCoverageStats(inputBuckets, inputCount, outputBuckets, outputCount) {
  if (inputCount === 0) {
    return {
      sourceDominantBucketCoverage: 1,
      outputDominantBucketCoverage: outputCount > 0 ? 0 : 1,
      dominantBucketCoverageDrift: outputCount > 0 ? 1 : 0,
    }
  }

  let dominantKey = 0
  let dominantCount = 0
  for (const [key, value] of inputBuckets) {
    if (value > dominantCount) {
      dominantKey = key
      dominantCount = value
    }
  }

  const sourceCoverage = dominantCount / inputCount
  const outputCoverage = outputCount > 0 ? (outputBuckets.get(dominantKey) ?? 0) / outputCount : 0

  return {
    sourceDominantBucketCoverage: sourceCoverage,
    outputDominantBucketCoverage: outputCoverage,
    dominantBucketCoverageDrift: Math.abs(sourceCoverage - outputCoverage),
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

function tileHueStats(tileErrors, minSamples) {
  let errorMeanMax = 0
  let errorP95Max = 0
  let tileCount = 0

  for (const values of tileErrors) {
    if (values.length < minSamples) continue

    values.sort((a, b) => a - b)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    errorMeanMax = Math.max(errorMeanMax, mean)
    errorP95Max = Math.max(errorP95Max, percentile(values, 0.95))
    tileCount++
  }

  return {
    tileHueErrorMeanMax: errorMeanMax,
    tileHueErrorP95Max: errorP95Max,
    tileHueErrorTileCount: tileCount,
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

function hasVisibleEdgeSupport(data, width, index) {
  return (
    data[index + 3] > 0 ||
    data[index - 4 + 3] > 0 ||
    data[index + 4 + 3] > 0 ||
    data[index - width * 4 + 3] > 0 ||
    data[index + width * 4 + 3] > 0
  )
}

function localEdgeMagnitude(data, width, index) {
  const dx = lumaAt(data, index + 4) - lumaAt(data, index - 4)
  const dy = lumaAt(data, index + width * 4) - lumaAt(data, index - width * 4)
  return Math.sqrt(dx * dx + dy * dy) / 2
}

function addEdgeMagnitudeBin(histogram, magnitude) {
  for (let bin = 0; bin < EDGE_MAGNITUDE_HISTOGRAM_BINS.length - 1; bin++) {
    if (
      magnitude >= EDGE_MAGNITUDE_HISTOGRAM_BINS[bin] &&
      magnitude < EDGE_MAGNITUDE_HISTOGRAM_BINS[bin + 1]
    ) {
      histogram[bin]++
      return
    }
  }
}

function edgeMagnitudeHistogramDrift(inputHistogram, inputCount, outputHistogram, outputCount) {
  if (inputCount === 0 && outputCount === 0) return 0

  let drift = 0
  for (let bin = 0; bin < inputHistogram.length; bin++) {
    const source = inputCount > 0 ? inputHistogram[bin] / inputCount : 0
    const output = outputCount > 0 ? outputHistogram[bin] / outputCount : 0
    drift += Math.abs(source - output)
  }
  return drift / 2
}

function tileEdgeMagnitudeHistogramStats(
  inputHistograms,
  inputCounts,
  outputHistograms,
  outputCounts,
  minSampleCount,
) {
  const values = []
  let driftMax = 0

  for (let tile = 0; tile < inputHistograms.length; tile++) {
    if (Math.max(inputCounts[tile], outputCounts[tile]) < minSampleCount) continue

    const drift = edgeMagnitudeHistogramDrift(
      inputHistograms[tile],
      inputCounts[tile],
      outputHistograms[tile],
      outputCounts[tile],
    )
    driftMax = Math.max(driftMax, drift)
    values.push(drift)
  }

  values.sort((a, b) => a - b)

  return {
    tileEdgeMagnitudeHistogramDriftMax: driftMax,
    tileEdgeMagnitudeHistogramDriftP95: percentile(values, 0.95),
    tileEdgeMagnitudeHistogramTileCount: values.length,
  }
}

function isBorderPixel(x, y, width, height, band) {
  return x < band || y < band || x >= width - band || y >= height - band
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
  const inputShadowCoverageTileHits = new Uint32Array(tileCount)
  const inputShadowCoverageTileCounts = new Uint32Array(tileCount)
  const outputShadowCoverageTileHits = new Uint32Array(tileCount)
  const outputShadowCoverageTileCounts = new Uint32Array(tileCount)
  const inputBrightCoverageTileHits = new Uint32Array(tileCount)
  const inputBrightCoverageTileCounts = new Uint32Array(tileCount)
  const outputBrightCoverageTileHits = new Uint32Array(tileCount)
  const outputBrightCoverageTileCounts = new Uint32Array(tileCount)
  const inputColorfulCoverageTileHits = new Uint32Array(tileCount)
  const inputColorfulCoverageTileCounts = new Uint32Array(tileCount)
  const outputColorfulCoverageTileHits = new Uint32Array(tileCount)
  const outputColorfulCoverageTileCounts = new Uint32Array(tileCount)
  const inputSaturatedCoverageTileHits = new Uint32Array(tileCount)
  const inputSaturatedCoverageTileCounts = new Uint32Array(tileCount)
  const outputSaturatedCoverageTileHits = new Uint32Array(tileCount)
  const outputSaturatedCoverageTileCounts = new Uint32Array(tileCount)
  const inputChromaTileSums = new Float64Array(tileCount)
  const outputChromaTileSums = new Float64Array(tileCount)
  const inputLineEdgeTileSums = new Float64Array(tileCount)
  const outputLineEdgeTileSums = new Float64Array(tileCount)
  const inputEdgeMagnitudeHistogram = new Uint32Array(EDGE_MAGNITUDE_HISTOGRAM_BINS.length - 1)
  const outputEdgeMagnitudeHistogram = new Uint32Array(EDGE_MAGNITUDE_HISTOGRAM_BINS.length - 1)
  const inputEdgeMagnitudeTileHistograms = Array.from(
    { length: tileCount },
    () => new Uint32Array(EDGE_MAGNITUDE_HISTOGRAM_BINS.length - 1),
  )
  const outputEdgeMagnitudeTileHistograms = Array.from(
    { length: tileCount },
    () => new Uint32Array(EDGE_MAGNITUDE_HISTOGRAM_BINS.length - 1),
  )
  const tileCounts = new Uint32Array(tileCount)
  const inputEdgeMagnitudeTileCounts = new Uint32Array(tileCount)
  const outputEdgeMagnitudeTileCounts = new Uint32Array(tileCount)
  const inputRgbTileHistograms = Array.from(
    { length: tileCount },
    () => new Uint32Array(RGB_HISTOGRAM_BINS * 3),
  )
  const outputRgbTileHistograms = Array.from(
    { length: tileCount },
    () => new Uint32Array(RGB_HISTOGRAM_BINS * 3),
  )
  const inputRgbTileHistogramCounts = new Uint32Array(tileCount)
  const outputRgbTileHistogramCounts = new Uint32Array(tileCount)
  const hueMinChroma = options.hueMinChroma ?? QUALITY_RULES.colorfulCoverageChromaThreshold
  const colorfulCoverageChromaThreshold =
    options.colorfulCoverageChromaThreshold ?? QUALITY_RULES.colorfulCoverageChromaThreshold
  const saturatedCoverageChromaThreshold =
    options.saturatedCoverageChromaThreshold ?? QUALITY_RULES.saturatedCoverageChromaThreshold
  const tileContrastMinStdDev = options.tileContrastMinStdDev ?? 8
  const tileChromaMinMean = options.tileChromaMinMean ?? 8
  const tileLineEdgeMinMean = options.tileLineEdgeMinMean ?? 6
  const shadowCoverageLumaThreshold =
    options.shadowCoverageLumaThreshold ?? QUALITY_RULES.shadowCoverageLumaThreshold
  const inkComponentLumaThreshold =
    options.inkComponentLumaThreshold ?? QUALITY_RULES.inkCoverageLumaThreshold
  const inkComponentMinArea = Math.max(
    options.inkComponentMinArea ?? QUALITY_RULES.minInkComponentArea,
    Math.floor(
      input.width *
        input.height *
        (options.inkComponentMinAreaRatio ?? QUALITY_RULES.minInkComponentAreaRatio),
    ),
  )
  const brightCoverageLumaThreshold =
    options.brightCoverageLumaThreshold ?? QUALITY_RULES.brightCoverageLumaThreshold
  const tileShadowCoverageMinSampleCount =
    options.tileShadowCoverageMinSampleCount ?? QUALITY_RULES.minTileShadowCoverageSampleCount
  const tileBrightCoverageMinSampleCount =
    options.tileBrightCoverageMinSampleCount ?? QUALITY_RULES.minTileBrightCoverageSampleCount
  const tileColorfulCoverageMinSampleCount =
    options.tileColorfulCoverageMinSampleCount ?? QUALITY_RULES.minTileColorfulCoverageSampleCount
  const tileSaturatedCoverageMinSampleCount =
    options.tileSaturatedCoverageMinSampleCount ?? QUALITY_RULES.minTileSaturatedCoverageSampleCount
  const tileRgbHistogramMinSampleCount =
    options.tileRgbHistogramMinSampleCount ?? QUALITY_RULES.minTileRgbHistogramSampleCount
  const tileMeanRgbMinSampleCount =
    options.tileMeanRgbMinSampleCount ?? QUALITY_RULES.minTileMeanRgbSampleCount
  const tileEdgeMagnitudeHistogramMinSampleCount =
    options.tileEdgeMagnitudeHistogramMinSampleCount ??
    QUALITY_RULES.minTileEdgeMagnitudeHistogramSampleCount
  const borderBandPx = Math.max(1, Math.round(options.borderBandPx ?? 1))
  const inputRgbCoverage = new Map()
  const outputRgbCoverage = new Map()
  const inputRgbBuckets = new Map()
  const outputRgbBuckets = new Map()
  const inputRgbTileCoverage = createTileCoverage(tileCount)
  const outputRgbTileCoverage = createTileCoverage(tileCount)
  const inputRgbTileCoverageCounts = new Uint32Array(tileCount)
  const outputRgbTileCoverageCounts = new Uint32Array(tileCount)
  const inputMeanRgbTileSums = new Float64Array(tileCount * 3)
  const outputMeanRgbTileSums = new Float64Array(tileCount * 3)
  const tileHueErrors = Array.from({ length: tileCount }, () => [])
  const tileHueMinSampleCount = options.tileHueMinSampleCount ?? QUALITY_RULES.minTileHueSampleCount
  const hueErrors = []
  const errors = []
  const alphaErrors = []
  let sum = 0
  let alphaSum = 0
  let count = 0
  let alphaCount = 0
  let borderSum = 0
  let borderCount = 0
  let inputRgbCoverageCount = 0
  let outputRgbCoverageCount = 0
  let meanRgbSampleCount = 0
  let inputMeanRgbR = 0
  let inputMeanRgbG = 0
  let inputMeanRgbB = 0
  let outputMeanRgbR = 0
  let outputMeanRgbG = 0
  let outputMeanRgbB = 0
  let sourceColorfulPixelCount = 0
  let outputColorfulPixelCount = 0
  let retainedColorfulPixelCount = 0
  let spuriousColorfulPixelCount = 0
  let sourceInkPixelCount = 0
  let outputInkPixelCount = 0
  let sourceShadowPixelCount = 0
  let outputShadowPixelCount = 0
  let sourceBrightPixelCount = 0
  let outputBrightPixelCount = 0
  let sourceSaturatedPixelCount = 0
  let outputSaturatedPixelCount = 0
  let inputEdgeMagnitudeSampleCount = 0
  let outputEdgeMagnitudeSampleCount = 0

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const x = pixel % input.width
    const y = Math.floor(pixel / input.width)
    const i = pixel * 4
    const tileX = Math.min(tileGrid - 1, Math.floor((x * tileGrid) / input.width))
    const tileY = Math.min(tileGrid - 1, Math.floor((y * tileGrid) / input.height))
    const tile = tileY * tileGrid + tileX
    const inputLuma = lumaAt(input.data, i)
    const outputLuma = lumaAt(resized, i)
    const inputChromaValue = chromaAt(input.data, i)
    const outputChromaValue = chromaAt(resized, i)
    if (input.data[i + 3] > 0) {
      const key = rgbKey(input.data, i)
      increment(inputRgbCoverage, key)
      increment(inputRgbTileCoverage[tile], key)
      increment(inputRgbBuckets, rgbBucketKey(input.data, i))
      addRgbHistogramBins(inputRgbTileHistograms[tile], input.data, i)
      inputRgbCoverageCount++
      inputRgbTileCoverageCounts[tile]++
      inputRgbTileHistogramCounts[tile]++
      inputMeanRgbTileSums[tile * 3] += input.data[i]
      inputMeanRgbTileSums[tile * 3 + 1] += input.data[i + 1]
      inputMeanRgbTileSums[tile * 3 + 2] += input.data[i + 2]
      inputShadowCoverageTileCounts[tile]++
      inputBrightCoverageTileCounts[tile]++
      inputColorfulCoverageTileCounts[tile]++
      inputSaturatedCoverageTileCounts[tile]++
      if (inputLuma < shadowCoverageLumaThreshold) inputShadowCoverageTileHits[tile]++
      if (inputLuma > brightCoverageLumaThreshold) inputBrightCoverageTileHits[tile]++
      if (inputChromaValue >= colorfulCoverageChromaThreshold) {
        inputColorfulCoverageTileHits[tile]++
      }
      if (inputChromaValue > saturatedCoverageChromaThreshold) {
        inputSaturatedCoverageTileHits[tile]++
      }
    }
    if (resized[i + 3] > 0) {
      const key = rgbKey(resized, i)
      increment(outputRgbCoverage, key)
      increment(outputRgbTileCoverage[tile], key)
      increment(outputRgbBuckets, rgbBucketKey(resized, i))
      addRgbHistogramBins(outputRgbTileHistograms[tile], resized, i)
      outputRgbCoverageCount++
      outputRgbTileCoverageCounts[tile]++
      outputRgbTileHistogramCounts[tile]++
      outputMeanRgbTileSums[tile * 3] += resized[i]
      outputMeanRgbTileSums[tile * 3 + 1] += resized[i + 1]
      outputMeanRgbTileSums[tile * 3 + 2] += resized[i + 2]
      outputShadowCoverageTileCounts[tile]++
      outputBrightCoverageTileCounts[tile]++
      outputColorfulCoverageTileCounts[tile]++
      outputSaturatedCoverageTileCounts[tile]++
      if (outputLuma < shadowCoverageLumaThreshold) outputShadowCoverageTileHits[tile]++
      if (outputLuma > brightCoverageLumaThreshold) outputBrightCoverageTileHits[tile]++
      if (outputChromaValue >= colorfulCoverageChromaThreshold) {
        outputColorfulCoverageTileHits[tile]++
      }
      if (outputChromaValue > saturatedCoverageChromaThreshold) {
        outputSaturatedCoverageTileHits[tile]++
      }
    }
    let pixelError = 0
    for (let ch = 0; ch < 3; ch++) {
      const channelError = Math.abs(input.data[i + ch] - resized[i + ch])
      sum += channelError
      pixelError += channelError
      count++
    }
    if (isBorderPixel(x, y, input.width, input.height, borderBandPx)) {
      borderSum += pixelError / 3
      borderCount++
    }
    if (input.data[i + 3] > 0 || resized[i + 3] > 0) {
      meanRgbSampleCount++
      inputMeanRgbR += input.data[i]
      inputMeanRgbG += input.data[i + 1]
      inputMeanRgbB += input.data[i + 2]
      outputMeanRgbR += resized[i]
      outputMeanRgbG += resized[i + 1]
      outputMeanRgbB += resized[i + 2]
    }
    const alphaError = Math.abs(input.data[i + 3] - resized[i + 3])
    const inputColorful = input.data[i + 3] > 0 && inputChromaValue >= hueMinChroma
    const outputColorful = resized[i + 3] > 0 && outputChromaValue >= hueMinChroma
    const inputInk = input.data[i + 3] > 0 && inputLuma < QUALITY_RULES.inkCoverageLumaThreshold
    const outputInk = resized[i + 3] > 0 && outputLuma < QUALITY_RULES.inkCoverageLumaThreshold
    const inputShadow = input.data[i + 3] > 0 && inputLuma < shadowCoverageLumaThreshold
    const outputShadow = resized[i + 3] > 0 && outputLuma < shadowCoverageLumaThreshold
    const inputBright = input.data[i + 3] > 0 && inputLuma > brightCoverageLumaThreshold
    const outputBright = resized[i + 3] > 0 && outputLuma > brightCoverageLumaThreshold
    const inputSaturated =
      input.data[i + 3] > 0 && inputChromaValue > saturatedCoverageChromaThreshold
    const outputSaturated =
      resized[i + 3] > 0 && outputChromaValue > saturatedCoverageChromaThreshold
    const inputLineEdge = localAxisGradient(input.data, input.width, x, y, i)
    const outputLineEdge = localAxisGradient(resized, input.width, x, y, i)
    if (x > 0 && y > 0 && x < input.width - 1 && y < input.height - 1) {
      if (hasVisibleEdgeSupport(input.data, input.width, i)) {
        const magnitude = localEdgeMagnitude(input.data, input.width, i)
        addEdgeMagnitudeBin(inputEdgeMagnitudeHistogram, magnitude)
        addEdgeMagnitudeBin(inputEdgeMagnitudeTileHistograms[tile], magnitude)
        inputEdgeMagnitudeSampleCount++
        inputEdgeMagnitudeTileCounts[tile]++
      }
      if (hasVisibleEdgeSupport(resized, input.width, i)) {
        const magnitude = localEdgeMagnitude(resized, input.width, i)
        addEdgeMagnitudeBin(outputEdgeMagnitudeHistogram, magnitude)
        addEdgeMagnitudeBin(outputEdgeMagnitudeTileHistograms[tile], magnitude)
        outputEdgeMagnitudeSampleCount++
        outputEdgeMagnitudeTileCounts[tile]++
      }
    }
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
    if (inputColorful) sourceColorfulPixelCount++
    if (outputColorful) outputColorfulPixelCount++
    if (inputColorful && outputColorful) retainedColorfulPixelCount++
    if (!inputColorful && outputColorful) spuriousColorfulPixelCount++
    if (inputInk) sourceInkPixelCount++
    if (outputInk) outputInkPixelCount++
    if (inputShadow) sourceShadowPixelCount++
    if (outputShadow) outputShadowPixelCount++
    if (inputBright) sourceBrightPixelCount++
    if (outputBright) outputBrightPixelCount++
    if (inputSaturated) sourceSaturatedPixelCount++
    if (outputSaturated) outputSaturatedPixelCount++
    if (inputColorful && outputColorful) {
      const hueError = hueDistance(hueAt(input.data, i), hueAt(resized, i))
      hueErrors.push(hueError)
      tileHueErrors[tile].push(hueError)
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
  const tileLumaMeanDelta = tileLumaMeanDeltaStats(
    inputLumaTileSums,
    outputLumaTileSums,
    tileCounts,
  )
  const tileMeanRgbDrift = tileMeanRgbDriftStats(
    inputMeanRgbTileSums,
    inputRgbTileCoverageCounts,
    outputMeanRgbTileSums,
    outputRgbTileCoverageCounts,
    tileMeanRgbMinSampleCount,
  )
  const tileShadowCoverage = tileCoverageDriftStats(
    inputShadowCoverageTileHits,
    inputShadowCoverageTileCounts,
    outputShadowCoverageTileHits,
    outputShadowCoverageTileCounts,
    tileShadowCoverageMinSampleCount,
  )
  const tileBrightCoverage = tileCoverageDriftStats(
    inputBrightCoverageTileHits,
    inputBrightCoverageTileCounts,
    outputBrightCoverageTileHits,
    outputBrightCoverageTileCounts,
    tileBrightCoverageMinSampleCount,
  )
  const tileColorfulCoverage = tileCoverageDriftStats(
    inputColorfulCoverageTileHits,
    inputColorfulCoverageTileCounts,
    outputColorfulCoverageTileHits,
    outputColorfulCoverageTileCounts,
    tileColorfulCoverageMinSampleCount,
  )
  const tileSaturatedCoverage = tileCoverageDriftStats(
    inputSaturatedCoverageTileHits,
    inputSaturatedCoverageTileCounts,
    outputSaturatedCoverageTileHits,
    outputSaturatedCoverageTileCounts,
    tileSaturatedCoverageMinSampleCount,
  )
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
  const tileHue = tileHueStats(tileHueErrors, tileHueMinSampleCount)
  const tileLineEdge = tileLineEdgeStats(
    inputLineEdgeTileSums,
    outputLineEdgeTileSums,
    tileCounts,
    tileLineEdgeMinMean,
  )
  const tileEdgeMagnitudeHistogram = tileEdgeMagnitudeHistogramStats(
    inputEdgeMagnitudeTileHistograms,
    inputEdgeMagnitudeTileCounts,
    outputEdgeMagnitudeTileHistograms,
    outputEdgeMagnitudeTileCounts,
    tileEdgeMagnitudeHistogramMinSampleCount,
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
  const tileRgbHistogram = tileRgbHistogramStats(
    inputRgbTileHistograms,
    inputRgbTileHistogramCounts,
    outputRgbTileHistograms,
    outputRgbTileHistogramCounts,
    tileRgbHistogramMinSampleCount,
  )
  const dominantBucketCoverage = dominantBucketCoverageStats(
    inputRgbBuckets,
    inputRgbCoverageCount,
    outputRgbBuckets,
    outputRgbCoverageCount,
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
  const sourceInkComponents = inkComponentStats(
    input.data,
    input.width,
    input.height,
    inkComponentLumaThreshold,
    inkComponentMinArea,
  )
  const outputInkComponents = inkComponentStats(
    resized,
    input.width,
    input.height,
    inkComponentLumaThreshold,
    inkComponentMinArea,
  )
  const meanRgbRDrift =
    meanRgbSampleCount > 0
      ? Math.abs(inputMeanRgbR / meanRgbSampleCount - outputMeanRgbR / meanRgbSampleCount)
      : 0
  const meanRgbGDrift =
    meanRgbSampleCount > 0
      ? Math.abs(inputMeanRgbG / meanRgbSampleCount - outputMeanRgbG / meanRgbSampleCount)
      : 0
  const meanRgbBDrift =
    meanRgbSampleCount > 0
      ? Math.abs(inputMeanRgbB / meanRgbSampleCount - outputMeanRgbB / meanRgbSampleCount)
      : 0

  return {
    mae: count > 0 ? sum / count : 0,
    p95: percentile(errors, 0.95),
    borderMae: borderCount > 0 ? borderSum / borderCount : 0,
    tileMaxMae: tileValues.length > 0 ? tileValues[tileValues.length - 1] : 0,
    tileP95Mae: percentile(tileValues, 0.95),
    meanRgbSampleCount,
    meanRgbRDrift,
    meanRgbGDrift,
    meanRgbBDrift,
    meanRgbChannelDrift: (meanRgbRDrift + meanRgbGDrift + meanRgbBDrift) / 3,
    meanRgbDrift: Math.hypot(meanRgbRDrift, meanRgbGDrift, meanRgbBDrift),
    inkComponentMinArea,
    sourceInkComponentCount: sourceInkComponents.componentCount,
    outputInkComponentCount: outputInkComponents.componentCount,
    sourceInkComponentPixelCount: sourceInkComponents.componentPixelCount,
    outputInkComponentPixelCount: outputInkComponents.componentPixelCount,
    inputInkComponentCoverage:
      sourceInkComponents.componentPixelCount / (input.width * input.height),
    outputInkComponentCoverage:
      outputInkComponents.componentPixelCount / (input.width * input.height),
    inkComponentCoverageDrift:
      Math.abs(sourceInkComponents.componentPixelCount - outputInkComponents.componentPixelCount) /
      (input.width * input.height),
    inputInkLargestComponentCoverage:
      sourceInkComponents.largestComponentPixels / (input.width * input.height),
    outputInkLargestComponentCoverage:
      outputInkComponents.largestComponentPixels / (input.width * input.height),
    inkLargestComponentCoverageDrift:
      Math.abs(
        sourceInkComponents.largestComponentPixels - outputInkComponents.largestComponentPixels,
      ) /
      (input.width * input.height),
    tileMeanRgbDriftMax: tileMeanRgbDrift.tileMeanRgbDriftMax,
    tileMeanRgbDriftP95: tileMeanRgbDrift.tileMeanRgbDriftP95,
    tileMeanRgbDriftTileCount: tileMeanRgbDrift.tileMeanRgbDriftTileCount,
    tileLumaMeanDeltaMax: tileLumaMeanDelta.tileLumaMeanDeltaMax,
    tileLumaMeanDeltaP95: tileLumaMeanDelta.tileLumaMeanDeltaP95,
    tileLumaMeanDeltaTileCount: tileLumaMeanDelta.tileLumaMeanDeltaTileCount,
    tileShadowCoverageDriftMax: tileShadowCoverage.tileCoverageDriftMax,
    tileShadowCoverageDriftP95: tileShadowCoverage.tileCoverageDriftP95,
    tileShadowCoverageTileCount: tileShadowCoverage.tileCoverageTileCount,
    tileBrightCoverageDriftMax: tileBrightCoverage.tileCoverageDriftMax,
    tileBrightCoverageDriftP95: tileBrightCoverage.tileCoverageDriftP95,
    tileBrightCoverageTileCount: tileBrightCoverage.tileCoverageTileCount,
    tileColorfulCoverageDriftMax: tileColorfulCoverage.tileCoverageDriftMax,
    tileColorfulCoverageDriftP95: tileColorfulCoverage.tileCoverageDriftP95,
    tileColorfulCoverageTileCount: tileColorfulCoverage.tileCoverageTileCount,
    tileSaturatedCoverageDriftMax: tileSaturatedCoverage.tileCoverageDriftMax,
    tileSaturatedCoverageDriftP95: tileSaturatedCoverage.tileCoverageDriftP95,
    tileSaturatedCoverageTileCount: tileSaturatedCoverage.tileCoverageTileCount,
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
    tileRgbHistogramDriftMax: tileRgbHistogram.tileRgbHistogramDriftMax,
    tileRgbHistogramDriftP95: tileRgbHistogram.tileRgbHistogramDriftP95,
    tileRgbHistogramTileCount: tileRgbHistogram.tileRgbHistogramTileCount,
    sourceDominantBucketCoverage: dominantBucketCoverage.sourceDominantBucketCoverage,
    outputDominantBucketCoverage: dominantBucketCoverage.outputDominantBucketCoverage,
    dominantBucketCoverageDrift: dominantBucketCoverage.dominantBucketCoverageDrift,
    sourceColorfulPixelCount,
    outputColorfulPixelCount,
    retainedColorfulPixelCount,
    spuriousColorfulPixelCount,
    sourceInkPixelCount,
    outputInkPixelCount,
    inputInkCoverage: inputRgbCoverageCount > 0 ? sourceInkPixelCount / inputRgbCoverageCount : 0,
    outputInkCoverage:
      outputRgbCoverageCount > 0 ? outputInkPixelCount / outputRgbCoverageCount : 0,
    inkCoverageDrift: Math.abs(
      (inputRgbCoverageCount > 0 ? sourceInkPixelCount / inputRgbCoverageCount : 0) -
        (outputRgbCoverageCount > 0 ? outputInkPixelCount / outputRgbCoverageCount : 0),
    ),
    sourceShadowPixelCount,
    outputShadowPixelCount,
    inputShadowCoverage:
      inputRgbCoverageCount > 0 ? sourceShadowPixelCount / inputRgbCoverageCount : 0,
    outputShadowCoverage:
      outputRgbCoverageCount > 0 ? outputShadowPixelCount / outputRgbCoverageCount : 0,
    shadowCoverageDrift: Math.abs(
      (inputRgbCoverageCount > 0 ? sourceShadowPixelCount / inputRgbCoverageCount : 0) -
        (outputRgbCoverageCount > 0 ? outputShadowPixelCount / outputRgbCoverageCount : 0),
    ),
    sourceBrightPixelCount,
    outputBrightPixelCount,
    inputBrightCoverage:
      inputRgbCoverageCount > 0 ? sourceBrightPixelCount / inputRgbCoverageCount : 0,
    outputBrightCoverage:
      outputRgbCoverageCount > 0 ? outputBrightPixelCount / outputRgbCoverageCount : 0,
    brightCoverageDrift: Math.abs(
      (inputRgbCoverageCount > 0 ? sourceBrightPixelCount / inputRgbCoverageCount : 0) -
        (outputRgbCoverageCount > 0 ? outputBrightPixelCount / outputRgbCoverageCount : 0),
    ),
    sourceSaturatedPixelCount,
    outputSaturatedPixelCount,
    inputSaturatedCoverage:
      inputRgbCoverageCount > 0 ? sourceSaturatedPixelCount / inputRgbCoverageCount : 0,
    outputSaturatedCoverage:
      outputRgbCoverageCount > 0 ? outputSaturatedPixelCount / outputRgbCoverageCount : 0,
    saturatedCoverageDrift: Math.abs(
      (inputRgbCoverageCount > 0 ? sourceSaturatedPixelCount / inputRgbCoverageCount : 0) -
        (outputRgbCoverageCount > 0 ? outputSaturatedPixelCount / outputRgbCoverageCount : 0),
    ),
    colorfulRetention:
      sourceColorfulPixelCount > 0 ? retainedColorfulPixelCount / sourceColorfulPixelCount : 1,
    colorfulSpuriousRatio:
      outputColorfulPixelCount > 0 ? spuriousColorfulPixelCount / outputColorfulPixelCount : 0,
    hueErrorMean:
      hueErrors.length > 0
        ? hueErrors.reduce((total, value) => total + value, 0) / hueErrors.length
        : 0,
    hueErrorP95: percentile(hueErrors, 0.95),
    hueSampleCount: hueErrors.length,
    tileHueErrorMeanMax: tileHue.tileHueErrorMeanMax,
    tileHueErrorP95Max: tileHue.tileHueErrorP95Max,
    tileHueErrorTileCount: tileHue.tileHueErrorTileCount,
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
    edgeMagnitudeHistogramDrift: edgeMagnitudeHistogramDrift(
      inputEdgeMagnitudeHistogram,
      inputEdgeMagnitudeSampleCount,
      outputEdgeMagnitudeHistogram,
      outputEdgeMagnitudeSampleCount,
    ),
    tileEdgeMagnitudeHistogramDriftMax:
      tileEdgeMagnitudeHistogram.tileEdgeMagnitudeHistogramDriftMax,
    tileEdgeMagnitudeHistogramDriftP95:
      tileEdgeMagnitudeHistogram.tileEdgeMagnitudeHistogramDriftP95,
    tileEdgeMagnitudeHistogramTileCount:
      tileEdgeMagnitudeHistogram.tileEdgeMagnitudeHistogramTileCount,
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
