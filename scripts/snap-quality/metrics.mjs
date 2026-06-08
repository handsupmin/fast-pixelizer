import { MAX_METRIC_SAMPLES } from './config.mjs'
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

export async function preservationStats(input, result) {
  const resized = await resizeToInput(result, input)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))
  const errors = []
  const alphaErrors = []
  let sum = 0
  let alphaSum = 0
  let count = 0
  let alphaCount = 0

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const i = pixel * 4
    let pixelError = 0
    for (let ch = 0; ch < 3; ch++) {
      const channelError = Math.abs(input.data[i + ch] - resized[i + ch])
      sum += channelError
      pixelError += channelError
      count++
    }
    const alphaError = Math.abs(input.data[i + 3] - resized[i + 3])
    alphaSum += alphaError
    alphaCount++
    errors.push(pixelError / 3)
    alphaErrors.push(alphaError)
  }

  errors.sort((a, b) => a - b)
  alphaErrors.sort((a, b) => a - b)
  const p95Index = Math.min(errors.length - 1, Math.floor(errors.length * 0.95))
  const alphaP95Index = Math.min(alphaErrors.length - 1, Math.floor(alphaErrors.length * 0.95))
  const inputLuma = lumaStats(input.data, input.width, input.height)
  const outputLuma = lumaStats(resized, input.width, input.height)
  const inputEdge = meanAxisGradient(input)
  const outputEdge = meanAxisGradient({ data: resized, width: input.width, height: input.height })

  return {
    mae: count > 0 ? sum / count : 0,
    p95: errors.length > 0 ? errors[p95Index] : 0,
    alphaMae: alphaCount > 0 ? alphaSum / alphaCount : 0,
    alphaP95: alphaErrors.length > 0 ? alphaErrors[alphaP95Index] : 0,
    contrastRatio: inputLuma.stdDev > 0 ? outputLuma.stdDev / inputLuma.stdDev : 1,
    lineEdgeRatio: inputEdge > 0 ? outputEdge / inputEdge : 1,
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
