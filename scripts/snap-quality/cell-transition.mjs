import { MAX_METRIC_SAMPLES } from './config.mjs'

const CHANNELS = 4

function premultipliedFeature(data, index) {
  const alpha = data[index + 3] / 255
  return [data[index] * alpha, data[index + 1] * alpha, data[index + 2] * alpha, data[index + 3]]
}

function featureDifference(a, aIndex, b, bIndex) {
  let total = 0
  for (let ch = 0; ch < CHANNELS; ch++) total += Math.abs(a[aIndex + ch] - b[bIndex + ch])
  return total / CHANNELS
}

function sourceCellFeatures(input, cols, rows) {
  const cellCount = cols * rows
  const features = new Float64Array(cellCount * CHANNELS)
  const counts = new Uint32Array(cellCount)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const x = pixel % input.width
    const y = Math.floor(pixel / input.width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / input.width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / input.height))
    const cell = row * cols + col
    const feature = premultipliedFeature(input.data, pixel * 4)

    for (let ch = 0; ch < CHANNELS; ch++) features[cell * CHANNELS + ch] += feature[ch]
    counts[cell]++
  }

  for (let cell = 0; cell < cellCount; cell++) {
    if (counts[cell] === 0) continue
    for (let ch = 0; ch < CHANNELS; ch++) features[cell * CHANNELS + ch] /= counts[cell]
  }

  return features
}

function gridCellFeatures(grid) {
  const features = new Float64Array(grid.width * grid.height * CHANNELS)
  for (let cell = 0; cell < grid.width * grid.height; cell++) {
    const feature = premultipliedFeature(grid.data, cell * 4)
    for (let ch = 0; ch < CHANNELS; ch++) features[cell * CHANNELS + ch] = feature[ch]
  }
  return features
}

export function cellTransitionMetrics(input, grid, options = {}) {
  const minTransitionDelta = options.minTransitionDelta ?? 12
  const cols = grid.width
  const rows = grid.height
  const source = sourceCellFeatures(input, cols, rows)
  const output = gridCellFeatures(grid)
  let sourceTransitionWeight = 0
  let outputTransitionWeight = 0
  let retainedTransitionWeight = 0
  let spuriousTransitionWeight = 0
  let transitionErrorSum = 0
  let transitionCount = 0
  let sourceCellTransitionCount = 0
  let outputCellTransitionCount = 0

  function accumulatePair(a, b) {
    const sourceDelta = featureDifference(source, a * CHANNELS, source, b * CHANNELS)
    const outputDelta = featureDifference(output, a * CHANNELS, output, b * CHANNELS)

    transitionErrorSum += Math.abs(sourceDelta - outputDelta)
    transitionCount++

    if (sourceDelta >= minTransitionDelta) {
      sourceCellTransitionCount++
      sourceTransitionWeight += sourceDelta
      retainedTransitionWeight += Math.min(outputDelta, sourceDelta)
    }

    if (outputDelta >= minTransitionDelta) {
      outputCellTransitionCount++
      outputTransitionWeight += outputDelta
      if (sourceDelta < minTransitionDelta) spuriousTransitionWeight += outputDelta
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col
      if (col + 1 < cols) accumulatePair(cell, cell + 1)
      if (row + 1 < rows) accumulatePair(cell, cell + cols)
    }
  }

  return {
    cellTransitionErrorMean: transitionCount > 0 ? transitionErrorSum / transitionCount : 0,
    cellTransitionRetention:
      sourceTransitionWeight > 0 ? retainedTransitionWeight / sourceTransitionWeight : 1,
    cellTransitionSpuriousRatio:
      outputTransitionWeight > 0 ? spuriousTransitionWeight / outputTransitionWeight : 0,
    outputCellTransitionCount,
    sourceCellTransitionCount,
  }
}
