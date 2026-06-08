import { MAX_METRIC_SAMPLES } from './config.mjs'

function rgbKey(data, index) {
  return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
}

function bucketedRgbKey(data, index) {
  return ((data[index] >> 4) << 8) | ((data[index + 1] >> 4) << 4) | (data[index + 2] >> 4)
}

function dominantShare(image, keyFn) {
  const colors = new Map()
  const stride = Math.max(1, Math.floor((image.width * image.height) / MAX_METRIC_SAMPLES))
  let count = 0
  for (let pixel = 0; pixel < image.width * image.height; pixel += stride) {
    const index = pixel * 4
    if (image.data[index + 3] === 0) continue
    const key = keyFn(image.data, index)
    colors.set(key, (colors.get(key) ?? 0) + 1)
    count++
  }

  let best = 0
  for (const value of colors.values()) best = Math.max(best, value)
  return count > 0 ? best / count : 1
}

export function paletteDominanceMetrics(input, grid) {
  const inputColorDominance = dominantShare(input, bucketedRgbKey)
  const outputColorDominance = dominantShare(grid, rgbKey)
  return {
    inputColorDominance,
    outputColorDominance,
    paletteDominanceDelta: outputColorDominance - inputColorDominance,
  }
}
