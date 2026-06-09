import { MAX_METRIC_SAMPLES } from './config.mjs'

function percentile(values, quantile) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]
}

export function cellColorErrorMetrics(input, grid) {
  const cols = grid.width
  const rows = grid.height
  const cellCount = cols * rows
  const sums = new Float64Array(cellCount * 3)
  const alphaSums = new Float64Array(cellCount)
  const alphaCounts = new Uint32Array(cellCount)
  const counts = new Uint32Array(cellCount)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const x = pixel % input.width
    const y = Math.floor(pixel / input.width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / input.width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / input.height))
    const cell = row * cols + col
    const inputIndex = pixel * 4
    alphaSums[cell] += input.data[inputIndex + 3]
    alphaCounts[cell]++

    if (input.data[inputIndex + 3] === 0) continue
    counts[cell]++
    for (let ch = 0; ch < 3; ch++) sums[cell * 3 + ch] += input.data[inputIndex + ch]
  }

  const errors = []
  const alphaErrors = []
  let sum = 0
  let alphaSum = 0
  let max = 0
  let alphaMax = 0
  for (let cell = 0; cell < cellCount; cell++) {
    const outputIndex = cell * 4

    if (counts[cell] > 0) {
      let error = 0
      for (let ch = 0; ch < 3; ch++) {
        error += Math.abs(sums[cell * 3 + ch] / counts[cell] - grid.data[outputIndex + ch])
      }
      error /= 3
      errors.push(error)
      sum += error
      max = Math.max(max, error)
    }

    if (alphaCounts[cell] > 0) {
      const alphaError = Math.abs(alphaSums[cell] / alphaCounts[cell] - grid.data[outputIndex + 3])
      alphaErrors.push(alphaError)
      alphaSum += alphaError
      alphaMax = Math.max(alphaMax, alphaError)
    }
  }

  return {
    cellAlphaErrorMean: alphaErrors.length > 0 ? alphaSum / alphaErrors.length : 0,
    cellAlphaErrorP95: percentile(alphaErrors, 0.95),
    cellAlphaErrorMax: alphaMax,
    cellColorErrorMean: errors.length > 0 ? sum / errors.length : 0,
    cellColorErrorP95: percentile(errors, 0.95),
    cellColorErrorP99: percentile(errors, 0.99),
    cellColorErrorMax: max,
  }
}
