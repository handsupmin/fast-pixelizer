const VISIBLE_ALPHA_THRESHOLD = 16
const ALPHA_EDGE_THRESHOLD = 16
const EDGE_TOLERANCE_PX = 1

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
    ...alphaEdgeStats(input, resized),
    alphaMaskIou: union > 0 ? intersection / union : 1,
    alphaBBoxDriftPx: driftPx,
    alphaBBoxDriftRatio: driftPx / Math.max(width, height),
  }
}
