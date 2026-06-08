const VISIBLE_ALPHA_THRESHOLD = 16
const SEMITRANSPARENT_ALPHA_MIN = 16
const SEMITRANSPARENT_ALPHA_MAX = 239
const ALPHA_EDGE_THRESHOLD = 16
const EDGE_TOLERANCE_PX = 1
const SMALL_COMPONENT_AREA_RATIO = 0.01

function emptyBounds(width, height) {
  return {
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
  }
}

function include(bounds, x, y) {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.maxY = Math.max(bounds.maxY, y)
}

function bboxDrift(inputBounds, outputBounds, hasInput, hasOutput, width, height) {
  if (!hasInput && !hasOutput) return 0
  if (hasInput !== hasOutput) return Math.max(width, height)
  return Math.max(
    Math.abs(inputBounds.minX - outputBounds.minX),
    Math.abs(inputBounds.minY - outputBounds.minY),
    Math.abs(inputBounds.maxX - outputBounds.maxX),
    Math.abs(inputBounds.maxY - outputBounds.maxY),
  )
}

function alphaAt(data, width, x, y) {
  return data[(y * width + x) * 4 + 3]
}

function isSemitransparent(alpha) {
  return alpha > SEMITRANSPARENT_ALPHA_MIN && alpha < SEMITRANSPARENT_ALPHA_MAX
}

function percentile(sortedValues, quantile) {
  return sortedValues.length > 0
    ? sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile))]
    : 0
}

function alphaEdgeMap(data, width, height) {
  const map = new Uint8Array(width * height)
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const dx = Math.abs(alphaAt(data, width, x + 1, y) - alphaAt(data, width, x - 1, y))
      const dy = Math.abs(alphaAt(data, width, x, y + 1) - alphaAt(data, width, x, y - 1))
      if (Math.max(dx, dy) < ALPHA_EDGE_THRESHOLD) continue

      map[y * width + x] = 1
      count++
    }
  }

  return { count, map }
}

function hasNearbyEdge(map, width, height, x, y) {
  for (
    let yy = Math.max(1, y - EDGE_TOLERANCE_PX);
    yy <= Math.min(height - 2, y + EDGE_TOLERANCE_PX);
    yy++
  ) {
    for (
      let xx = Math.max(1, x - EDGE_TOLERANCE_PX);
      xx <= Math.min(width - 2, x + EDGE_TOLERANCE_PX);
      xx++
    ) {
      if (map[yy * width + xx] === 1) return true
    }
  }
  return false
}

function alphaEdgeStats(input, resized) {
  const { width, height } = input
  if (width < 3 || height < 3) {
    return {
      alphaEdgeCount: 0,
      alphaEdgeJaccard: 1,
      alphaEdgeRecall: 1,
      alphaEdgeSpuriousRatio: 0,
      outputAlphaEdgeCount: 0,
    }
  }

  const source = alphaEdgeMap(input.data, width, height)
  const output = alphaEdgeMap(resized, width, height)
  let matched = 0
  let outputOnly = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x
      if (source.map[index] === 1 && hasNearbyEdge(output.map, width, height, x, y)) matched++
      if (output.map[index] === 1 && !hasNearbyEdge(source.map, width, height, x, y)) {
        outputOnly++
      }
    }
  }

  return {
    alphaEdgeCount: source.count,
    alphaEdgeJaccard: source.count + outputOnly > 0 ? matched / (source.count + outputOnly) : 1,
    alphaEdgeRecall: source.count > 0 ? matched / source.count : 1,
    alphaEdgeSpuriousRatio: output.count > 0 ? outputOnly / output.count : 0,
    outputAlphaEdgeCount: output.count,
  }
}

function alphaSemitransparentStats(input, resized) {
  const { width, height } = input
  let sourceCount = 0
  let outputCount = 0
  let retained = 0
  let outputOnly = 0
  const alphaErrors = []

  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4
    const sourceAlpha = input.data[i + 3]
    const outputAlpha = resized[i + 3]
    const source = isSemitransparent(sourceAlpha)
    const output = isSemitransparent(outputAlpha)

    if (source) {
      sourceCount++
      if (output) retained++
      alphaErrors.push(Math.abs(sourceAlpha - outputAlpha))
    }
    if (output) {
      outputCount++
      if (!source) outputOnly++
    }
  }

  return {
    alphaSemitransparentPixelCount: sourceCount,
    alphaSemitransparentRetention: sourceCount > 0 ? retained / sourceCount : 1,
    alphaSemitransparentSpuriousRatio: outputCount > 0 ? outputOnly / outputCount : 0,
    alphaSemitransparentValueMae:
      alphaErrors.length > 0
        ? alphaErrors.reduce((sum, value) => sum + value, 0) / alphaErrors.length
        : 0,
    alphaSemitransparentValueP95: percentile(
      alphaErrors.sort((a, b) => a - b),
      0.95,
    ),
    outputAlphaSemitransparentPixelCount: outputCount,
  }
}

function componentStats(data, width, height) {
  const seen = new Uint8Array(width * height)
  const components = []
  const stack = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (seen[start] === 1 || alphaAt(data, width, x, y) <= VISIBLE_ALPHA_THRESHOLD) continue

      let size = 0
      let sumX = 0
      let sumY = 0
      let left = width
      let right = -1
      let top = height
      let bottom = -1
      let perimeter = 0
      seen[start] = 1
      stack.push(start)

      while (stack.length > 0) {
        const index = stack.pop()
        size++
        const px = index % width
        const py = Math.floor(index / width)
        sumX += px
        sumY += py
        left = Math.min(left, px)
        right = Math.max(right, px)
        top = Math.min(top, py)
        bottom = Math.max(bottom, py)

        for (const [nx, ny] of [
          [px + 1, py],
          [px - 1, py],
          [px, py + 1],
          [px, py - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            perimeter++
            continue
          }
          const next = ny * width + nx
          if (alphaAt(data, width, nx, ny) <= VISIBLE_ALPHA_THRESHOLD) {
            perimeter++
            continue
          }
          if (seen[next] === 1) continue

          seen[next] = 1
          stack.push(next)
        }
      }

      components.push({ bottom, left, perimeter, right, size, top, x: sumX / size, y: sumY / size })
    }
  }

  return components
}

function sortComponents(components) {
  return [...components].sort((a, b) => b.size - a.size || a.y - b.y || a.x - b.x)
}

function componentAreaDrift(source, output) {
  const sourceComponents = sortComponents(source)
  const outputComponents = sortComponents(output)
  const componentCount = Math.max(sourceComponents.length, outputComponents.length)
  let drift = 0

  for (let index = 0; index < componentCount; index++) {
    drift += Math.abs((sourceComponents[index]?.size ?? 0) - (outputComponents[index]?.size ?? 0))
  }

  return drift
}

function componentPositionDrift(source, output) {
  const sourceComponents = sortComponents(source)
  const outputComponents = sortComponents(output)
  const componentCount = Math.min(sourceComponents.length, outputComponents.length)
  let drift = 0

  for (let index = 0; index < componentCount; index++) {
    drift +=
      Math.abs(sourceComponents[index].x - outputComponents[index].x) +
      Math.abs(sourceComponents[index].y - outputComponents[index].y)
  }

  return drift
}

function componentBBoxDrift(source, output) {
  const sourceComponents = sortComponents(source)
  const outputComponents = sortComponents(output)
  const componentCount = Math.min(sourceComponents.length, outputComponents.length)
  let drift = 0

  for (let index = 0; index < componentCount; index++) {
    drift +=
      Math.abs(sourceComponents[index].left - outputComponents[index].left) +
      Math.abs(sourceComponents[index].right - outputComponents[index].right) +
      Math.abs(sourceComponents[index].top - outputComponents[index].top) +
      Math.abs(sourceComponents[index].bottom - outputComponents[index].bottom)
  }

  return drift
}

function componentPerimeterDrift(source, output) {
  const sourceComponents = sortComponents(source)
  const outputComponents = sortComponents(output)
  const componentCount = Math.max(sourceComponents.length, outputComponents.length)
  let drift = 0

  for (let index = 0; index < componentCount; index++) {
    drift += Math.abs(
      (sourceComponents[index]?.perimeter ?? 0) - (outputComponents[index]?.perimeter ?? 0),
    )
  }

  return drift
}

function alphaComponentStats(input, resized) {
  const { width, height } = input
  const smallLimit = Math.max(64, Math.floor(width * height * SMALL_COMPONENT_AREA_RATIO))
  const source = componentStats(input.data, width, height)
  const output = componentStats(resized, width, height)
  const sourceSmall = source.filter((component) => component.size <= smallLimit).length
  const outputSmall = output.filter((component) => component.size <= smallLimit).length

  return {
    alphaComponentAreaDrift: componentAreaDrift(source, output),
    alphaComponentBBoxDrift: componentBBoxDrift(source, output),
    alphaComponentCount: source.length,
    alphaComponentCountDrift: Math.abs(source.length - output.length),
    alphaComponentPerimeterDrift: componentPerimeterDrift(source, output),
    alphaComponentPositionDrift: componentPositionDrift(source, output),
    alphaSmallComponentCount: sourceSmall,
    alphaSmallComponentCountDrift: Math.abs(sourceSmall - outputSmall),
    outputAlphaComponentCount: output.length,
    outputAlphaSmallComponentCount: outputSmall,
  }
}

export function alphaMaskStats(input, resized) {
  const { width, height } = input
  const inputBounds = emptyBounds(width, height)
  const outputBounds = emptyBounds(width, height)
  let inputCount = 0
  let outputCount = 0
  let intersection = 0
  let union = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inputVisible = input.data[i + 3] > VISIBLE_ALPHA_THRESHOLD
      const outputVisible = resized[i + 3] > VISIBLE_ALPHA_THRESHOLD

      if (inputVisible) {
        inputCount++
        include(inputBounds, x, y)
      }
      if (outputVisible) {
        outputCount++
        include(outputBounds, x, y)
      }
      if (inputVisible && outputVisible) intersection++
      if (inputVisible || outputVisible) union++
    }
  }

  const driftPx = bboxDrift(
    inputBounds,
    outputBounds,
    inputCount > 0,
    outputCount > 0,
    width,
    height,
  )

  return {
    alphaCoverageRatio: inputCount > 0 ? outputCount / inputCount : outputCount > 0 ? 0 : 1,
    ...alphaComponentStats(input, resized),
    ...alphaSemitransparentStats(input, resized),
    ...alphaEdgeStats(input, resized),
    alphaMaskIou: union > 0 ? intersection / union : 1,
    alphaBBoxDriftPx: driftPx,
    alphaBBoxDriftRatio: driftPx / Math.max(width, height),
  }
}
