export function resampleCells(
  data: Uint8ClampedArray,
  width: number,
  colCuts: readonly number[],
  rowCuts: readonly number[],
): Uint8ClampedArray {
  const numCols = colCuts.length - 1
  const numRows = rowCuts.length - 1
  const out = new Uint8ClampedArray(numCols * numRows * 4)

  for (let row = 0; row < numRows; row++) {
    const yStart = rowCuts[row]
    const yEnd = rowCuts[row + 1]
    for (let col = 0; col < numCols; col++) {
      const xStart = colCuts[col]
      const xEnd = colCuts[col + 1]
      const freq = new Map<number, number>()

      for (let py = yStart; py < yEnd; py++) {
        for (let px = xStart; px < xEnd; px++) {
          const idx = (py * width + px) * 4
          const key =
            ((data[idx] << 24) | (data[idx + 1] << 16) | (data[idx + 2] << 8) | data[idx + 3]) >>> 0
          freq.set(key, (freq.get(key) ?? 0) + 1)
        }
      }

      const outIdx = (row * numCols + col) * 4
      let bestKey = 0
      let bestCount = 0
      for (const [key, count] of freq) {
        if (count > bestCount) {
          bestCount = count
          bestKey = key
        }
      }

      out[outIdx] = (bestKey >>> 24) & 0xff
      out[outIdx + 1] = (bestKey >>> 16) & 0xff
      out[outIdx + 2] = (bestKey >>> 8) & 0xff
      out[outIdx + 3] = bestKey & 0xff
    }
  }
  return out
}

export function resampleMeanCells(
  data: Uint8ClampedArray,
  width: number,
  colCuts: readonly number[],
  rowCuts: readonly number[],
): Uint8ClampedArray {
  const numCols = colCuts.length - 1
  const numRows = rowCuts.length - 1
  const out = new Uint8ClampedArray(numCols * numRows * 4)

  for (let row = 0; row < numRows; row++) {
    const yStart = rowCuts[row]
    const yEnd = rowCuts[row + 1]
    for (let col = 0; col < numCols; col++) {
      const xStart = colCuts[col]
      const xEnd = colCuts[col + 1]
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0

      for (let py = yStart; py < yEnd; py++) {
        for (let px = xStart; px < xEnd; px++) {
          const idx = (py * width + px) * 4
          r += data[idx]
          g += data[idx + 1]
          b += data[idx + 2]
          a += data[idx + 3]
          count++
        }
      }

      const outIdx = (row * numCols + col) * 4
      out[outIdx] = Math.round(r / count)
      out[outIdx + 1] = Math.round(g / count)
      out[outIdx + 2] = Math.round(b / count)
      out[outIdx + 3] = Math.round(a / count)
    }
  }
  return out
}

export function resampleDetailCells(
  data: Uint8ClampedArray,
  width: number,
  colCuts: readonly number[],
  rowCuts: readonly number[],
): Uint8ClampedArray {
  const numCols = colCuts.length - 1
  const numRows = rowCuts.length - 1
  const out = new Uint8ClampedArray(numCols * numRows * 4)

  for (let row = 0; row < numRows; row++) {
    const yStart = rowCuts[row]
    const yEnd = rowCuts[row + 1]
    for (let col = 0; col < numCols; col++) {
      const xStart = colCuts[col]
      const xEnd = colCuts[col + 1]
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      let minLuma = Infinity
      let maxLuma = -Infinity

      for (let py = yStart; py < yEnd; py++) {
        for (let px = xStart; px < xEnd; px++) {
          const idx = (py * width + px) * 4
          const pr = data[idx]
          const pg = data[idx + 1]
          const pb = data[idx + 2]
          const luma = 0.299 * pr + 0.587 * pg + 0.114 * pb
          r += pr
          g += pg
          b += pb
          a += data[idx + 3]
          count++
          minLuma = Math.min(minLuma, luma)
          maxLuma = Math.max(maxLuma, luma)
        }
      }

      const cx = Math.min(width - 1, Math.floor((xStart + xEnd) / 2))
      const cy = Math.min(rowCuts[numRows] - 1, Math.floor((yStart + yEnd) / 2))
      const centerIdx = (cy * width + cx) * 4
      const contrast = maxLuma - minLuma
      const edgeWeight = 0.1 + Math.max(0, Math.min(1, (contrast - 14) / 44)) * 0.75
      const meanR = r / count
      const meanG = g / count
      const meanB = b / count
      const meanA = a / count
      const outIdx = (row * numCols + col) * 4

      out[outIdx] = clampByte(meanR + (data[centerIdx] - meanR) * edgeWeight)
      out[outIdx + 1] = clampByte(meanG + (data[centerIdx + 1] - meanG) * edgeWeight)
      out[outIdx + 2] = clampByte(meanB + (data[centerIdx + 2] - meanB) * edgeWeight)
      out[outIdx + 3] = clampByte(meanA + (data[centerIdx + 3] - meanA) * edgeWeight)
    }
  }
  return out
}

export function resampleEdgeDetailCells(
  data: Uint8ClampedArray,
  width: number,
  colCuts: readonly number[],
  rowCuts: readonly number[],
): Uint8ClampedArray {
  const numCols = colCuts.length - 1
  const numRows = rowCuts.length - 1
  const out = new Uint8ClampedArray(numCols * numRows * 4)

  for (let row = 0; row < numRows; row++) {
    const yStart = rowCuts[row]
    const yEnd = rowCuts[row + 1]
    for (let col = 0; col < numCols; col++) {
      const xStart = colCuts[col]
      const xEnd = colCuts[col + 1]
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let count = 0
      let minLuma = Infinity
      let maxLuma = -Infinity

      for (let py = yStart; py < yEnd; py++) {
        for (let px = xStart; px < xEnd; px++) {
          const idx = (py * width + px) * 4
          const pr = data[idx]
          const pg = data[idx + 1]
          const pb = data[idx + 2]
          const luma = 0.299 * pr + 0.587 * pg + 0.114 * pb
          r += pr
          g += pg
          b += pb
          a += data[idx + 3]
          count++
          minLuma = Math.min(minLuma, luma)
          maxLuma = Math.max(maxLuma, luma)
        }
      }

      const cx = Math.min(width - 1, Math.floor((xStart + xEnd) / 2))
      const cy = Math.min(rowCuts[numRows] - 1, Math.floor((yStart + yEnd) / 2))
      const centerIdx = (cy * width + cx) * 4
      const contrast = maxLuma - minLuma
      const edgeWeight = 0.2 + Math.max(0, Math.min(1, (contrast - 8) / 32)) * 0.8
      const meanR = r / count
      const meanG = g / count
      const meanB = b / count
      const meanA = a / count
      const outIdx = (row * numCols + col) * 4

      out[outIdx] = clampByte(meanR + (data[centerIdx] - meanR) * edgeWeight)
      out[outIdx + 1] = clampByte(meanG + (data[centerIdx + 1] - meanG) * edgeWeight)
      out[outIdx + 2] = clampByte(meanB + (data[centerIdx + 2] - meanB) * edgeWeight)
      out[outIdx + 3] = clampByte(meanA + (data[centerIdx + 3] - meanA) * edgeWeight)
    }
  }

  return out
}

export function sharpenCellEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data)
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let blurredLuma = 0
      let weight = 0
      let kernelIndex = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sampleIdx = ((y + ky) * width + x + kx) * 4
          blurredLuma +=
            (0.299 * data[sampleIdx] + 0.587 * data[sampleIdx + 1] + 0.114 * data[sampleIdx + 2]) *
            kernel[kernelIndex]
          weight += kernel[kernelIndex]
          kernelIndex++
        }
      }

      const idx = (y * width + x) * 4
      const centerLuma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
      const difference = centerLuma - blurredLuma / weight
      const magnitude = Math.max(0, Math.abs(difference) - 2)
      const adjustment = Math.sign(difference) * Math.min(20, magnitude * 0.4)
      out[idx] = clampByte(data[idx] + adjustment)
      out[idx + 1] = clampByte(data[idx + 1] + adjustment)
      out[idx + 2] = clampByte(data[idx + 2] + adjustment)
    }
  }

  return out
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}
