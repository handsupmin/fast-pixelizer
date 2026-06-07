function makePrng(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function kmeansQuantize(
  data: Uint8ClampedArray,
  pixelCount: number,
  k = 16,
  maxIter = 15,
): Uint8ClampedArray {
  const rng = makePrng(42)

  const opaque: number[] = []
  for (let i = 0; i < pixelCount; i++) {
    if (data[i * 4 + 3] > 0) opaque.push(i)
  }
  if (opaque.length === 0) return new Uint8ClampedArray(data)

  const n = opaque.length
  const actualK = Math.min(k, n)
  const sampleSize = Math.min(n, 50000)
  const stride = n / sampleSize
  const sample: number[] = []
  for (let i = 0; i < sampleSize; i++) sample.push(opaque[Math.floor(i * stride)])

  const centroids = new Float32Array(actualK * 3)
  const distances = new Float32Array(sampleSize).fill(Infinity)
  const firstIdx = Math.floor(rng() * sampleSize)
  const firstPixel = sample[firstIdx] * 4
  centroids[0] = data[firstPixel]
  centroids[1] = data[firstPixel + 1]
  centroids[2] = data[firstPixel + 2]

  for (let centroid = 1; centroid < actualK; centroid++) {
    let sumDist = 0
    const cx = centroids[(centroid - 1) * 3]
    const cy = centroids[(centroid - 1) * 3 + 1]
    const cz = centroids[(centroid - 1) * 3 + 2]

    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex++) {
      const pixel = sample[sampleIndex] * 4
      const dr = data[pixel] - cx
      const dg = data[pixel + 1] - cy
      const db = data[pixel + 2] - cz
      const distance = dr * dr + dg * dg + db * db
      if (distance < distances[sampleIndex]) distances[sampleIndex] = distance
      sumDist += distances[sampleIndex]
    }

    let chosen = sampleSize - 1
    if (sumDist > 0) {
      let target = rng() * sumDist
      for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex++) {
        target -= distances[sampleIndex]
        if (target <= 0) {
          chosen = sampleIndex
          break
        }
      }
    } else {
      chosen = Math.floor(rng() * sampleSize)
    }

    const pixel = sample[chosen] * 4
    centroids[centroid * 3] = data[pixel]
    centroids[centroid * 3 + 1] = data[pixel + 1]
    centroids[centroid * 3 + 2] = data[pixel + 2]
  }

  const sums = new Float64Array(actualK * 3)
  const counts = new Int32Array(actualK)
  for (let iter = 0; iter < maxIter; iter++) {
    sums.fill(0)
    counts.fill(0)
    let moved = false

    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex++) {
      const pixel = sample[sampleIndex] * 4
      const r = data[pixel]
      const g = data[pixel + 1]
      const b = data[pixel + 2]
      let bestK = 0
      let bestDist = Infinity

      for (let centroid = 0; centroid < actualK; centroid++) {
        const dr = r - centroids[centroid * 3]
        const dg = g - centroids[centroid * 3 + 1]
        const db = b - centroids[centroid * 3 + 2]
        const distance = dr * dr + dg * dg + db * db
        if (distance < bestDist) {
          bestDist = distance
          bestK = centroid
        }
      }

      sums[bestK * 3] += r
      sums[bestK * 3 + 1] += g
      sums[bestK * 3 + 2] += b
      counts[bestK]++
    }

    for (let centroid = 0; centroid < actualK; centroid++) {
      if (counts[centroid] === 0) continue
      const nr = sums[centroid * 3] / counts[centroid]
      const ng = sums[centroid * 3 + 1] / counts[centroid]
      const nb = sums[centroid * 3 + 2] / counts[centroid]
      const delta =
        Math.abs(nr - centroids[centroid * 3]) +
        Math.abs(ng - centroids[centroid * 3 + 1]) +
        Math.abs(nb - centroids[centroid * 3 + 2])
      if (delta > 0.01) moved = true
      centroids[centroid * 3] = nr
      centroids[centroid * 3 + 1] = ng
      centroids[centroid * 3 + 2] = nb
    }
    if (!moved) break
  }

  const result = new Uint8ClampedArray(data)
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    if (data[pixelIndex * 4 + 3] === 0) continue
    const r = data[pixelIndex * 4]
    const g = data[pixelIndex * 4 + 1]
    const b = data[pixelIndex * 4 + 2]
    let bestK = 0
    let bestDist = Infinity

    for (let centroid = 0; centroid < actualK; centroid++) {
      const dr = r - centroids[centroid * 3]
      const dg = g - centroids[centroid * 3 + 1]
      const db = b - centroids[centroid * 3 + 2]
      const distance = dr * dr + dg * dg + db * db
      if (distance < bestDist) {
        bestDist = distance
        bestK = centroid
      }
    }

    result[pixelIndex * 4] = Math.round(centroids[bestK * 3])
    result[pixelIndex * 4 + 1] = Math.round(centroids[bestK * 3 + 1])
    result[pixelIndex * 4 + 2] = Math.round(centroids[bestK * 3 + 2])
  }

  return result
}
