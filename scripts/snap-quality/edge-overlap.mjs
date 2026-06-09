const MAX_EDGE_SAMPLES = 50_000
const EDGE_RADIUS = 2
const EDGE_TILE_GRID = 4
const EDGE_TILE_MIN_EDGES = 8

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4
  return data[i + 3] === 0 ? 0 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

function gradientAt(data, width, height, x, y) {
  const x0 = Math.max(0, x - 1)
  const x1 = Math.min(width - 1, x + 1)
  const y0 = Math.max(0, y - 1)
  const y1 = Math.min(height - 1, y + 1)
  const dx = grayAt(data, width, x1, y) - grayAt(data, width, x0, y)
  const dy = grayAt(data, width, x, y1) - grayAt(data, width, x, y0)
  return { dx, dy, magnitude: Math.max(Math.abs(dx), Math.abs(dy)) }
}

function edgeAt(data, width, height, x, y) {
  return gradientAt(data, width, height, x, y).magnitude
}

function directionBin(dx, dy) {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)
  if (absX <= 0.01 && absY <= 0.01) return -1
  if (absX >= absY * 2) return 0
  if (absY >= absX * 2) return 1
  return dx * dy >= 0 ? 2 : 3
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

function directionDrift(source, sourceCount, output, outputCount) {
  if (sourceCount === 0 && outputCount === 0) return 0
  if (sourceCount === 0 || outputCount === 0) return 1

  let drift = 0
  for (let index = 0; index < source.length; index++) {
    drift += Math.abs(source[index] / sourceCount - output[index] / outputCount)
  }
  return drift / 2
}

function tileIndex(x, y, width, height) {
  const col = Math.min(EDGE_TILE_GRID - 1, Math.floor((x * EDGE_TILE_GRID) / width))
  const row = Math.min(EDGE_TILE_GRID - 1, Math.floor((y * EDGE_TILE_GRID) / height))
  return row * EDGE_TILE_GRID + col
}

function regionalEdgeStats(sourceTiles, outputTiles, matchedTiles, outputOnlyTiles) {
  let sourceTileCount = 0
  let outputTileCount = 0
  let jaccardMin = 1
  let recallMin = 1
  let spuriousMax = 0

  for (let tile = 0; tile < sourceTiles.length; tile++) {
    if (sourceTiles[tile] >= EDGE_TILE_MIN_EDGES) {
      sourceTileCount++
      jaccardMin = Math.min(
        jaccardMin,
        matchedTiles[tile] / (sourceTiles[tile] + outputOnlyTiles[tile]),
      )
      recallMin = Math.min(recallMin, matchedTiles[tile] / sourceTiles[tile])
    }
    if (outputTiles[tile] >= EDGE_TILE_MIN_EDGES) {
      outputTileCount++
      spuriousMax = Math.max(spuriousMax, outputOnlyTiles[tile] / outputTiles[tile])
    }
  }

  return {
    edgeTileJaccardMin: sourceTileCount > 0 ? jaccardMin : 1,
    edgeTileRecallMin: sourceTileCount > 0 ? recallMin : 1,
    edgeTileSpuriousMax: outputTileCount > 0 ? spuriousMax : 0,
    outputEdgeTileCount: outputTileCount,
    sourceEdgeTileCount: sourceTileCount,
  }
}

export function edgeOverlapStats(input, resized) {
  const { width, height } = input
  if (width < 3 || height < 3) {
    return {
      edgeDirectionDrift: 0,
      edgeJaccard: 1,
      edgeTileJaccardMin: 1,
      edgeRecall: 1,
      edgeSpuriousRatio: 0,
      edgeTileSpuriousMax: 0,
      edgeTileRecallMin: 1,
      outputEdgeDirectionCount: 0,
      outputEdgeTileCount: 0,
      sourceEdgeDirectionCount: 0,
      sourceEdgeTileCount: 0,
    }
  }

  const step = sampleStep(width, height)
  const points = []
  const inputEdges = []
  const outputEdges = []
  const inputDirections = []
  const outputDirections = []
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const inputGradient = gradientAt(input.data, width, height, x, y)
      const outputGradient = gradientAt(resized, width, height, x, y)
      points.push({ x, y })
      inputEdges.push(inputGradient.magnitude)
      outputEdges.push(outputGradient.magnitude)
      inputDirections.push(directionBin(inputGradient.dx, inputGradient.dy))
      outputDirections.push(directionBin(outputGradient.dx, outputGradient.dy))
    }
  }

  const inputThreshold = Math.max(8, percentile(inputEdges, 0.85))
  const outputThreshold = Math.max(8, inputThreshold * 0.35, percentile(outputEdges, 0.85) * 0.5)
  const sourceDirections = new Uint32Array(4)
  const outputDirectionsTotal = new Uint32Array(4)
  const sourceTiles = new Uint32Array(EDGE_TILE_GRID * EDGE_TILE_GRID)
  const outputTiles = new Uint32Array(EDGE_TILE_GRID * EDGE_TILE_GRID)
  const matchedTiles = new Uint32Array(EDGE_TILE_GRID * EDGE_TILE_GRID)
  const outputOnlyTiles = new Uint32Array(EDGE_TILE_GRID * EDGE_TILE_GRID)
  let sourceEdges = 0
  let outputEdgesTotal = 0
  let matchedEdges = 0
  let outputOnlyEdges = 0

  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i]
    const tile = tileIndex(x, y, width, height)
    const sourceEdge = inputEdges[i] >= inputThreshold
    const outputEdge = outputEdges[i] >= outputThreshold
    const sourceNearby =
      localMaxEdge(input.data, width, height, x, y, EDGE_RADIUS) >= inputThreshold
    const outputNearby = localMaxEdge(resized, width, height, x, y, EDGE_RADIUS) >= outputThreshold

    if (sourceEdge) {
      sourceEdges++
      sourceTiles[tile]++
      if (inputDirections[i] >= 0) sourceDirections[inputDirections[i]]++
    }
    if (outputEdge) {
      outputEdgesTotal++
      outputTiles[tile]++
      if (outputDirections[i] >= 0) outputDirectionsTotal[outputDirections[i]]++
    }
    if (sourceEdge && outputNearby) {
      matchedEdges++
      matchedTiles[tile]++
    }
    if (outputEdge && !sourceNearby) {
      outputOnlyEdges++
      outputOnlyTiles[tile]++
    }
  }

  const regional = regionalEdgeStats(sourceTiles, outputTiles, matchedTiles, outputOnlyTiles)
  return {
    edgeDirectionDrift: directionDrift(
      sourceDirections,
      sourceEdges,
      outputDirectionsTotal,
      outputEdgesTotal,
    ),
    edgeRecall: sourceEdges > 0 ? matchedEdges / sourceEdges : 1,
    edgeSpuriousRatio: outputEdgesTotal > 0 ? outputOnlyEdges / outputEdgesTotal : 0,
    edgeJaccard:
      sourceEdges + outputOnlyEdges > 0 ? matchedEdges / (sourceEdges + outputOnlyEdges) : 1,
    edgeTileJaccardMin: regional.edgeTileJaccardMin,
    edgeTileRecallMin: regional.edgeTileRecallMin,
    edgeTileSpuriousMax: regional.edgeTileSpuriousMax,
    outputEdgeDirectionCount: outputEdgesTotal,
    outputEdgeTileCount: regional.outputEdgeTileCount,
    sourceEdgeDirectionCount: sourceEdges,
    sourceEdgeTileCount: regional.sourceEdgeTileCount,
  }
}
