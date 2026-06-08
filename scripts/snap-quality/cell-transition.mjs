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

function createTransitionStats() {
  return {
    outputCount: 0,
    outputWeight: 0,
    pairs: 0,
    retainedWeight: 0,
    sourceCount: 0,
    sourceWeight: 0,
    spuriousWeight: 0,
    transitionErrorSum: 0,
  }
}

function accumulateTransition(stats, sourceDelta, outputDelta, minTransitionDelta) {
  stats.transitionErrorSum += Math.abs(sourceDelta - outputDelta)
  stats.pairs++

  if (sourceDelta >= minTransitionDelta) {
    stats.sourceCount++
    stats.sourceWeight += sourceDelta
    stats.retainedWeight += Math.min(outputDelta, sourceDelta)
  }

  if (outputDelta >= minTransitionDelta) {
    stats.outputCount++
    stats.outputWeight += outputDelta
    if (sourceDelta < minTransitionDelta) stats.spuriousWeight += outputDelta
  }
}

function finishTransitionStats(stats) {
  return {
    errorMean: stats.pairs > 0 ? stats.transitionErrorSum / stats.pairs : 0,
    outputCount: stats.outputCount,
    retention: stats.sourceWeight > 0 ? stats.retainedWeight / stats.sourceWeight : 1,
    sourceCount: stats.sourceCount,
    spuriousRatio: stats.outputWeight > 0 ? stats.spuriousWeight / stats.outputWeight : 0,
  }
}

export function cellTransitionMetrics(input, grid, options = {}) {
  const minTransitionDelta = options.minTransitionDelta ?? 12
  const cols = grid.width
  const rows = grid.height
  const source = sourceCellFeatures(input, cols, rows)
  const output = gridCellFeatures(grid)
  const allTransitions = createTransitionStats()
  const xTransitions = createTransitionStats()
  const yTransitions = createTransitionStats()
  const diagonalTransitions = createTransitionStats()
  const downRightTransitions = createTransitionStats()
  const downLeftTransitions = createTransitionStats()

  function accumulatePair(axisStats, a, b) {
    const sourceDelta = featureDifference(source, a * CHANNELS, source, b * CHANNELS)
    const outputDelta = featureDifference(output, a * CHANNELS, output, b * CHANNELS)

    accumulateTransition(allTransitions, sourceDelta, outputDelta, minTransitionDelta)
    accumulateTransition(axisStats, sourceDelta, outputDelta, minTransitionDelta)
  }

  function accumulateDiagonalPair(directionStats, a, b) {
    const sourceDelta = featureDifference(source, a * CHANNELS, source, b * CHANNELS)
    const outputDelta = featureDifference(output, a * CHANNELS, output, b * CHANNELS)

    accumulateTransition(diagonalTransitions, sourceDelta, outputDelta, minTransitionDelta)
    accumulateTransition(directionStats, sourceDelta, outputDelta, minTransitionDelta)
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col
      if (col + 1 < cols) accumulatePair(xTransitions, cell, cell + 1)
      if (row + 1 < rows) accumulatePair(yTransitions, cell, cell + cols)
      if (row + 1 < rows && col + 1 < cols) {
        accumulateDiagonalPair(downRightTransitions, cell, cell + cols + 1)
      }
      if (row + 1 < rows && col > 0) {
        accumulateDiagonalPair(downLeftTransitions, cell, cell + cols - 1)
      }
    }
  }

  const all = finishTransitionStats(allTransitions)
  const x = finishTransitionStats(xTransitions)
  const y = finishTransitionStats(yTransitions)
  const diagonal = finishTransitionStats(diagonalTransitions)
  const downRight = finishTransitionStats(downRightTransitions)
  const downLeft = finishTransitionStats(downLeftTransitions)

  return {
    cellDiagonalTransitionDirectionRetentionMin: Math.min(downRight.retention, downLeft.retention),
    cellDiagonalTransitionDirectionSpuriousRatioMax: Math.max(
      downRight.spuriousRatio,
      downLeft.spuriousRatio,
    ),
    cellDiagonalTransitionDownLeftRetention: downLeft.retention,
    cellDiagonalTransitionDownLeftSpuriousRatio: downLeft.spuriousRatio,
    cellDiagonalTransitionDownRightRetention: downRight.retention,
    cellDiagonalTransitionDownRightSpuriousRatio: downRight.spuriousRatio,
    cellDiagonalTransitionErrorMean: diagonal.errorMean,
    cellDiagonalTransitionRetention: diagonal.retention,
    cellDiagonalTransitionSpuriousRatio: diagonal.spuriousRatio,
    cellTransitionAxisRetentionMin: Math.min(x.retention, y.retention),
    cellTransitionAxisSpuriousRatioMax: Math.max(x.spuriousRatio, y.spuriousRatio),
    cellTransitionErrorMean: all.errorMean,
    cellTransitionRetention: all.retention,
    cellTransitionSpuriousRatio: all.spuriousRatio,
    cellTransitionXErrorMean: x.errorMean,
    cellTransitionXRetention: x.retention,
    cellTransitionXSpuriousRatio: x.spuriousRatio,
    cellTransitionYErrorMean: y.errorMean,
    cellTransitionYRetention: y.retention,
    cellTransitionYSpuriousRatio: y.spuriousRatio,
    outputCellDiagonalTransitionCount: diagonal.outputCount,
    outputCellDiagonalTransitionDownLeftCount: downLeft.outputCount,
    outputCellDiagonalTransitionDownRightCount: downRight.outputCount,
    outputCellTransitionCount: all.outputCount,
    outputCellTransitionXCount: x.outputCount,
    outputCellTransitionYCount: y.outputCount,
    sourceCellDiagonalTransitionCount: diagonal.sourceCount,
    sourceCellDiagonalTransitionDownLeftCount: downLeft.sourceCount,
    sourceCellDiagonalTransitionDownRightCount: downRight.sourceCount,
    sourceCellTransitionCount: all.sourceCount,
    sourceCellTransitionXCount: x.sourceCount,
    sourceCellTransitionYCount: y.sourceCount,
  }
}
