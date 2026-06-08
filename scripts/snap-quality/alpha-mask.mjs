const VISIBLE_ALPHA_THRESHOLD = 16

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
    alphaMaskIou: union > 0 ? intersection / union : 1,
    alphaBBoxDriftPx: driftPx,
    alphaBBoxDriftRatio: driftPx / Math.max(width, height),
  }
}
