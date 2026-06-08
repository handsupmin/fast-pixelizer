import { MAX_METRIC_SAMPLES } from './config.mjs'

function bucketKey(data, index) {
  return (
    ((data[index] >> 4) << 14) |
    ((data[index + 1] >> 4) << 10) |
    ((data[index + 2] >> 4) << 6) |
    (data[index + 3] >> 6)
  )
}

export function cellColorDominanceMetrics(input, cols, rows) {
  const { data, width, height } = input
  const cellCount = cols * rows
  const buckets = new Array(cellCount)
  const counts = new Uint32Array(cellCount)
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    const cell = row * cols + col
    const key = bucketKey(data, pixel * 4)
    let map = buckets[cell]
    if (!map) {
      map = new Map()
      buckets[cell] = map
    }
    map.set(key, (map.get(key) ?? 0) + 1)
    counts[cell]++
  }

  const dominance = []
  let min = 1
  let weighted = 0
  let samples = 0
  for (let cell = 0; cell < cellCount; cell++) {
    const count = counts[cell]
    if (count === 0) continue
    let best = 0
    for (const value of buckets[cell].values()) best = Math.max(best, value)
    const score = best / count
    dominance.push(score)
    min = Math.min(min, score)
    weighted += score * count
    samples += count
  }

  dominance.sort((a, b) => a - b)
  return {
    mean: samples > 0 ? weighted / samples : 1,
    min: samples > 0 ? min : 1,
    p05: dominance.length > 0 ? dominance[Math.floor(dominance.length * 0.05)] : 1,
  }
}
