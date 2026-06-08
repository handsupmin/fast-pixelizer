import { MAX_METRIC_SAMPLES } from './config.mjs'

function rgbKey(data, index) {
  return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
}

function bucketedRgbKey(data, index) {
  return ((data[index] >> 4) << 8) | ((data[index + 1] >> 4) << 4) | (data[index + 2] >> 4)
}

function countVisibleColors(image, keyFn) {
  const colors = new Set()
  const stride = Math.max(1, Math.floor((image.width * image.height) / MAX_METRIC_SAMPLES))
  for (let pixel = 0; pixel < image.width * image.height; pixel += stride) {
    const index = pixel * 4
    if (image.data[index + 3] === 0) continue
    colors.add(keyFn(image.data, index))
  }
  return colors.size
}

export function paletteUtilizationMetrics(input, grid, colorVariety) {
  const inputBucketColorCount = countVisibleColors(input, bucketedRgbKey)
  const outputPaletteColorCount = countVisibleColors(grid, rgbKey)
  const paletteUtilizationTarget = Math.min(colorVariety, inputBucketColorCount)
  const rawUtilization =
    paletteUtilizationTarget > 0 ? outputPaletteColorCount / paletteUtilizationTarget : 1

  return {
    inputBucketColorCount,
    outputPaletteColorCount,
    outputPaletteUtilization: Math.min(1, rawUtilization),
    paletteUtilizationGap: Math.max(0, paletteUtilizationTarget - outputPaletteColorCount),
    paletteUtilizationTarget,
  }
}
