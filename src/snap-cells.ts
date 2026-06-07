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
