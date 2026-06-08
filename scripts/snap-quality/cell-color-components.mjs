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
  const byColor = new Map()
  const smallLimit = Math.max(1, Math.floor(cols * rows * 0.01))
  let count = 0
  let smallCount = 0

  for (let cell = 0; cell < keys.length; cell++) {
    if (seen[cell] === 1 || keys[cell] < 0) continue

    const key = keys[cell]
    let size = 0
    let sumX = 0
    let sumY = 0
    let left = cols
    let right = -1
    let top = rows
    let bottom = -1
    let perimeter = 0
    const cells = []
    seen[cell] = 1
    stack.push(cell)

    while (stack.length > 0) {
      const index = stack.pop()
      size++
      const x = index % cols
      const y = Math.floor(index / cols)
      cells.push(index)
      sumX += x
      sumY += y
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          perimeter++
          continue
        }
        const next = ny * cols + nx
        if (keys[next] !== key) {
          perimeter++
          continue
        }
        if (seen[next] === 1) continue

        seen[next] = 1
        stack.push(next)
      }
    }

    count++
    if (size <= smallLimit) smallCount++
    const components = byColor.get(key) ?? []
    components.push({
      bottom,
      cells,
      left,
      perimeter,
      right,
      size,
      top,
      x: sumX / size,
      y: sumY / size,
    })
    byColor.set(key, components)
  }

  return { byColor, count, smallCount }
}

function componentHoleCount(component, cols) {
  const bboxWidth = component.right - component.left + 1
  const bboxHeight = component.bottom - component.top + 1
  const bboxArea = bboxWidth * bboxHeight
  if (bboxArea === component.size) return 0

  const solid = new Uint8Array(bboxArea)
  const seen = new Uint8Array(bboxArea)
  const stack = []
  let holes = 0

  for (const cell of component.cells) {
    const x = (cell % cols) - component.left
    const y = Math.floor(cell / cols) - component.top
    solid[y * bboxWidth + x] = 1
  }

  function flood(start) {
    let touchesEdge = false
    seen[start] = 1
    stack.push(start)

    while (stack.length > 0) {
      const index = stack.pop()
      const x = index % bboxWidth
      const y = Math.floor(index / bboxWidth)
      if (x === 0 || y === 0 || x === bboxWidth - 1 || y === bboxHeight - 1) touchesEdge = true

      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= bboxWidth || ny >= bboxHeight) continue
        const next = ny * bboxWidth + nx
        if (seen[next] === 1 || solid[next] === 1) continue

        seen[next] = 1
        stack.push(next)
      }
    }

    return touchesEdge
  }

  for (let index = 0; index < bboxArea; index++) {
    if (seen[index] === 1 || solid[index] === 1) continue
    if (!flood(index)) holes++
  }

  return holes
}

function componentAreaDrift(source, output) {
  const colors = new Set([...source.byColor.keys(), ...output.byColor.keys()])
  let drift = 0

  for (const color of colors) {
    const sourceSizes = [...(source.byColor.get(color) ?? [])]
      .map((component) => component.size)
      .sort((a, b) => b - a)
    const outputSizes = [...(output.byColor.get(color) ?? [])]
      .map((component) => component.size)
      .sort((a, b) => b - a)
    const sizeCount = Math.max(sourceSizes.length, outputSizes.length)
    for (let index = 0; index < sizeCount; index++) {
      drift += Math.abs((sourceSizes[index] ?? 0) - (outputSizes[index] ?? 0))
    }
  }

  return drift
}

function sortComponents(components) {
  return [...components].sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x)
}

function componentPositionDrift(source, output) {
  const colors = new Set([...source.byColor.keys(), ...output.byColor.keys()])
  let drift = 0

  for (const color of colors) {
    const sourceComponents = sortComponents(source.byColor.get(color) ?? [])
    const outputComponents = sortComponents(output.byColor.get(color) ?? [])
    const componentCount = Math.min(sourceComponents.length, outputComponents.length)
    for (let index = 0; index < componentCount; index++) {
      drift +=
        Math.abs(sourceComponents[index].x - outputComponents[index].x) +
        Math.abs(sourceComponents[index].y - outputComponents[index].y)
    }
  }

  return drift
}

function componentBBoxDrift(source, output) {
  const colors = new Set([...source.byColor.keys(), ...output.byColor.keys()])
  let drift = 0

  for (const color of colors) {
    const sourceComponents = sortComponents(source.byColor.get(color) ?? [])
    const outputComponents = sortComponents(output.byColor.get(color) ?? [])
    const componentCount = Math.min(sourceComponents.length, outputComponents.length)
    for (let index = 0; index < componentCount; index++) {
      drift +=
        Math.abs(sourceComponents[index].left - outputComponents[index].left) +
        Math.abs(sourceComponents[index].right - outputComponents[index].right) +
        Math.abs(sourceComponents[index].top - outputComponents[index].top) +
        Math.abs(sourceComponents[index].bottom - outputComponents[index].bottom)
    }
  }

  return drift
}

function componentPerimeterDrift(source, output) {
  const colors = new Set([...source.byColor.keys(), ...output.byColor.keys()])
  let drift = 0

  for (const color of colors) {
    const sourceComponents = sortComponents(source.byColor.get(color) ?? [])
    const outputComponents = sortComponents(output.byColor.get(color) ?? [])
    const componentCount = Math.max(sourceComponents.length, outputComponents.length)
    for (let index = 0; index < componentCount; index++) {
      drift += Math.abs(
        (sourceComponents[index]?.perimeter ?? 0) - (outputComponents[index]?.perimeter ?? 0),
      )
    }
  }

  return drift
}

function componentHoleCountDrift(source, output, cols) {
  const colors = new Set([...source.byColor.keys(), ...output.byColor.keys()])
  let drift = 0
  let sourceCount = 0
  let outputCount = 0

  for (const color of colors) {
    const sourceComponents = sortComponents(source.byColor.get(color) ?? [])
    const outputComponents = sortComponents(output.byColor.get(color) ?? [])
    const componentCount = Math.max(sourceComponents.length, outputComponents.length)
    for (let index = 0; index < componentCount; index++) {
      const sourceHoles = sourceComponents[index]
        ? componentHoleCount(sourceComponents[index], cols)
        : 0
      const outputHoles = outputComponents[index]
        ? componentHoleCount(outputComponents[index], cols)
        : 0
      sourceCount += sourceHoles
      outputCount += outputHoles
      drift += Math.abs(sourceHoles - outputHoles)
    }
  }

  return { drift, outputCount, sourceCount }
}

export function cellColorComponentMetrics(input, grid) {
  const cols = grid.width
  const rows = grid.height
  const source = componentStats(sourceCellKeys(input, cols, rows), cols, rows)
  const output = componentStats(outputCellKeys(grid), cols, rows)
  const holes = componentHoleCountDrift(source, output, cols)

  return {
    cellColorComponentAreaDrift: componentAreaDrift(source, output),
    cellColorComponentBBoxDrift: componentBBoxDrift(source, output),
    cellColorComponentCountDrift: Math.abs(source.count - output.count),
    cellColorComponentHoleCountDrift: holes.drift,
    cellColorComponentPerimeterDrift: componentPerimeterDrift(source, output),
    cellColorComponentPositionDrift: componentPositionDrift(source, output),
    outputCellColorComponentCount: output.count,
    outputCellColorComponentHoleCount: holes.outputCount,
    outputSmallCellColorComponentCount: output.smallCount,
    smallCellColorComponentCountDrift: Math.abs(source.smallCount - output.smallCount),
    sourceCellColorComponentCount: source.count,
    sourceCellColorComponentHoleCount: holes.sourceCount,
    sourceSmallCellColorComponentCount: source.smallCount,
  }
}
