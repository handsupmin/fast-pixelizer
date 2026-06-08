function rgbKey(data, index) {
  return (data[index] << 16) | (data[index + 1] << 8) | data[index + 2]
}

function sourceCellKeys(input, cols, rows) {
  const cellColors = Array.from({ length: cols * rows }, () => new Map())

  for (let pixel = 0; pixel < input.width * input.height; pixel++) {
    const x = pixel % input.width
    const y = Math.floor(pixel / input.width)
    const index = pixel * 4
    if (input.data[index + 3] === 0) continue

    const col = Math.min(cols - 1, Math.floor((x * cols) / input.width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / input.height))
    const colors = cellColors[row * cols + col]
    const key = rgbKey(input.data, index)
    colors.set(key, (colors.get(key) ?? 0) + 1)
  }

  return cellColors.map((colors) => {
    let bestKey = -1
    let bestCount = 0
    for (const [key, count] of colors) {
      if (count <= bestCount) continue
      bestKey = key
      bestCount = count
    }
    return bestKey
  })
}

function outputCellKeys(grid) {
  const keys = []
  for (let cell = 0; cell < grid.width * grid.height; cell++) {
    const index = cell * 4
    keys.push(grid.data[index + 3] === 0 ? -1 : rgbKey(grid.data, index))
  }
  return keys
}

function componentStats(keys, cols, rows) {
  const seen = new Uint8Array(keys.length)
  const stack = []
  const smallLimit = Math.max(1, Math.floor(cols * rows * 0.01))
  let count = 0
  let smallCount = 0

  for (let cell = 0; cell < keys.length; cell++) {
    if (seen[cell] === 1 || keys[cell] < 0) continue

    const key = keys[cell]
    let size = 0
    seen[cell] = 1
    stack.push(cell)

    while (stack.length > 0) {
      const index = stack.pop()
      size++
      const x = index % cols
      const y = Math.floor(index / cols)

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
        const next = ny * cols + nx
        if (seen[next] === 1 || keys[next] !== key) continue

        seen[next] = 1
        stack.push(next)
      }
    }

    count++
    if (size <= smallLimit) smallCount++
  }

  return { count, smallCount }
}

export function cellColorComponentMetrics(input, grid) {
  const cols = grid.width
  const rows = grid.height
  const source = componentStats(sourceCellKeys(input, cols, rows), cols, rows)
  const output = componentStats(outputCellKeys(grid), cols, rows)

  return {
    cellColorComponentCountDrift: Math.abs(source.count - output.count),
    outputCellColorComponentCount: output.count,
    outputSmallCellColorComponentCount: output.smallCount,
    smallCellColorComponentCountDrift: Math.abs(source.smallCount - output.smallCount),
    sourceCellColorComponentCount: source.count,
    sourceSmallCellColorComponentCount: source.smallCount,
  }
}
