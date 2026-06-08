const MAX_EDGE_SAMPLES = 50_000
const EDGE_RADIUS = 2

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4
  return data[i + 3] === 0 ? 0 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

function edgeAt(data, width, height, x, y) {
  const x0 = Math.max(0, x - 1)
  const x1 = Math.min(width - 1, x + 1)
  const y0 = Math.max(0, y - 1)
  const y1 = Math.min(height - 1, y + 1)
  const dx = Math.abs(grayAt(data, width, x1, y) - grayAt(data, width, x0, y))
  const dy = Math.abs(grayAt(data, width, x, y1) - grayAt(data, width, x, y0))
  return Math.max(dx, dy)
}

function localMaxEdge(data, width, height, x, y, radius) {
  let best = 0
  for (let yy = Math.max(1, y - radius); yy <= Math.min(height - 2, y + radius); yy++) {
    for (let xx = Math.max(1, x - radius); xx <= Math.min(width - 2, x + radius); xx++) {
      best = Math.max(best, edgeAt(data, width, height, xx, yy))
    }
  }
  return best
}

function percentile(values, quantile) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]
}

function sampleStep(width, height) {
  return Math.max(1, Math.floor(Math.sqrt((width * height) / MAX_EDGE_SAMPLES)))
}

export function edgeOverlapStats(input, resized) {
  const { width, height } = input
  if (width < 3 || height < 3) {
    return { edgeRecall: 1, edgeSpuriousRatio: 0, edgeJaccard: 1 }
  }

  const step = sampleStep(width, height)
  const points = []
  const inputEdges = []
  const outputEdges = []
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      points.push({ x, y })
      inputEdges.push(edgeAt(input.data, width, height, x, y))
      outputEdges.push(edgeAt(resized, width, height, x, y))
    }
  }

  const inputThreshold = Math.max(8, percentile(inputEdges, 0.85))
  const outputThreshold = Math.max(8, inputThreshold * 0.35, percentile(outputEdges, 0.85) * 0.5)
  let sourceEdges = 0
  let outputEdgesTotal = 0
  let matchedEdges = 0
  let outputOnlyEdges = 0

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i]
    const sourceEdge = inputEdges[i] >= inputThreshold
    const outputEdge = outputEdges[i] >= outputThreshold
    const sourceNearby =
      localMaxEdge(input.data, width, height, x, y, EDGE_RADIUS) >= inputThreshold
    const outputNearby = localMaxEdge(resized, width, height, x, y, EDGE_RADIUS) >= outputThreshold

    if (sourceEdge) sourceEdges++
    if (outputEdge) outputEdgesTotal++
    if (sourceEdge && outputNearby) matchedEdges++
    if (outputEdge && !sourceNearby) outputOnlyEdges++
  }

  return {
    edgeRecall: sourceEdges > 0 ? matchedEdges / sourceEdges : 1,
    edgeSpuriousRatio: outputEdgesTotal > 0 ? outputOnlyEdges / outputEdgesTotal : 0,
    edgeJaccard:
      sourceEdges + outputOnlyEdges > 0 ? matchedEdges / (sourceEdges + outputOnlyEdges) : 1,
  }
}
