import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { snap } from '../dist/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_MODEL_DIR = path.resolve(ROOT, '../mono-pix/src/assets/examples')
const DEFAULT_DEMO_DIR = path.resolve(ROOT, 'examples')
const DEFAULT_OUT_DIR = path.resolve(ROOT, '.tmp/snap-quality-eval')
const MAX_METRIC_SAMPLES = 500_000

const QUALITY_RULES = {
  maxAspectError: 0.03,
  maxShortAxisCells: 256,
  minSourceCellSize: 3,
  maxRepeatGridGapFloor: 2,
  maxRepeatGridGapRate: 0.01,
  minEdgeAlignment: 0.6,
  highCellMae: 18,
  maxPreservationMae: 38,
}

function defaultDatasets() {
  return [
    { name: 'model-examples', dir: DEFAULT_MODEL_DIR },
    { name: 'demo-examples', dir: DEFAULT_DEMO_DIR },
  ]
}

function parseDataset(value) {
  const separator = value.indexOf('=')
  if (separator <= 0) throw new Error(`Expected --dataset name=path, got: ${value}`)
  return {
    name: value.slice(0, separator),
    dir: path.resolve(value.slice(separator + 1)),
  }
}

function parseArgs(argv) {
  const args = {
    datasets: defaultDatasets(),
    outDir: DEFAULT_OUT_DIR,
    colorVariety: 64,
    writeImages: true,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--examples-dir')
      args.datasets = [{ name: 'examples', dir: path.resolve(argv[++i]) }]
    else if (arg === '--model-dir')
      args.datasets[0] = { name: 'model-examples', dir: path.resolve(argv[++i]) }
    else if (arg === '--demo-dir')
      args.datasets[1] = { name: 'demo-examples', dir: path.resolve(argv[++i]) }
    else if (arg === '--dataset') args.datasets.push(parseDataset(argv[++i]))
    else if (arg === '--no-default-datasets') args.datasets = []
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++i])
    else if (arg === '--color-variety') args.colorVariety = Number.parseInt(argv[++i], 10)
    else if (arg === '--no-images') args.writeImages = false
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isFinite(args.colorVariety) || args.colorVariety < 2) {
    throw new Error(`Invalid --color-variety: ${args.colorVariety}`)
  }
  if (args.datasets.length === 0) throw new Error('At least one dataset is required')

  return args
}

async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function loadImage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

function grayAt(data, width, x, y) {
  const i = (y * width + x) * 4
  return data[i + 3] === 0 ? 0 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

function meanAxisGradient(input) {
  const { data, width, height } = input
  let sum = 0
  let count = 0
  const xStride = Math.max(1, Math.floor(width / 512))
  const yStride = Math.max(1, Math.floor(height / 512))

  for (let y = 0; y < height; y += yStride) {
    for (let x = xStride; x < width - xStride; x += xStride) {
      sum += Math.abs(grayAt(data, width, x + xStride, y) - grayAt(data, width, x - xStride, y))
      count++
    }
  }

  for (let x = 0; x < width; x += xStride) {
    for (let y = yStride; y < height - yStride; y += yStride) {
      sum += Math.abs(grayAt(data, width, x, y + yStride) - grayAt(data, width, x, y - yStride))
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

function gridBoundaryGradient(input, cols, rows) {
  const { data, width, height } = input
  let sum = 0
  let count = 0
  const yStride = Math.max(1, Math.floor(height / 768))
  const xStride = Math.max(1, Math.floor(width / 768))

  for (let c = 1; c < cols; c++) {
    const x = Math.min(width - 2, Math.max(1, Math.round((c * width) / cols)))
    for (let y = 0; y < height; y += yStride) {
      sum += Math.abs(grayAt(data, width, x + 1, y) - grayAt(data, width, x - 1, y))
      count++
    }
  }

  for (let r = 1; r < rows; r++) {
    const y = Math.min(height - 2, Math.max(1, Math.round((r * height) / rows)))
    for (let x = 0; x < width; x += xStride) {
      sum += Math.abs(grayAt(data, width, x, y + 1) - grayAt(data, width, x, y - 1))
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

function cellUniformityMetrics(input, cols, rows) {
  const { data, width, height } = input
  const cellCount = cols * rows
  const sums = new Float64Array(cellCount * 3)
  const sumsSq = new Float64Array(cellCount * 3)
  const counts = new Uint32Array(cellCount)
  const stride = Math.max(1, Math.floor((width * height) / MAX_METRIC_SAMPLES))

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    const cell = row * cols + col
    const i = pixel * 4
    for (let ch = 0; ch < 3; ch++) {
      const value = data[i + ch]
      sums[cell * 3 + ch] += value
      sumsSq[cell * 3 + ch] += value * value
    }
    counts[cell]++
  }

  let weightedVariance = 0
  let weightedMae = 0
  let sampleCount = 0

  for (let cell = 0; cell < cellCount; cell++) {
    const count = counts[cell]
    if (count === 0) continue
    sampleCount += count
    for (let ch = 0; ch < 3; ch++) {
      const idx = cell * 3 + ch
      const mean = sums[idx] / count
      const variance = Math.max(0, sumsSq[idx] / count - mean * mean)
      weightedVariance += variance * count
    }
  }

  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const col = Math.min(cols - 1, Math.floor((x * cols) / width))
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    const cell = row * cols + col
    const count = counts[cell] || 1
    const i = pixel * 4
    for (let ch = 0; ch < 3; ch++) {
      weightedMae += Math.abs(data[i + ch] - sums[cell * 3 + ch] / count)
    }
  }

  return {
    cellStdDev: sampleCount > 0 ? Math.sqrt(weightedVariance / (sampleCount * 3)) : 0,
    cellMae: sampleCount > 0 ? weightedMae / (sampleCount * 3) : 0,
  }
}

async function resizeResultToInput(result, input) {
  const { data } = await sharp(Buffer.from(result.data), {
    raw: { width: result.width, height: result.height, channels: 4 },
  })
    .resize(input.width, input.height, { kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
}

async function preservationMae(input, result) {
  const resized = await resizeResultToInput(result, input)
  const stride = Math.max(1, Math.floor((input.width * input.height) / MAX_METRIC_SAMPLES))
  let sum = 0
  let count = 0

  for (let pixel = 0; pixel < input.width * input.height; pixel += stride) {
    const i = pixel * 4
    for (let ch = 0; ch < 3; ch++) {
      sum += Math.abs(input.data[i + ch] - resized[i + ch])
      count++
    }
  }

  return count > 0 ? sum / count : 0
}

async function writePng(file, image) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png()
    .toFile(file)
}

function formatNum(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : value
}

function repeatTolerance(cols, rows) {
  return Math.max(
    QUALITY_RULES.maxRepeatGridGapFloor,
    Math.round((cols + rows) * QUALITY_RULES.maxRepeatGridGapRate),
  )
}

function issue(severity, code, detail) {
  return { severity, code, detail }
}

function classifyMetrics(metrics) {
  const issues = []
  if (metrics.aspectError > QUALITY_RULES.maxAspectError) {
    issues.push(
      issue('fail', 'aspect-drift', `grid aspect error ${formatNum(metrics.aspectError)}`),
    )
  }
  if (metrics.shortAxisCells > QUALITY_RULES.maxShortAxisCells) {
    issues.push(issue('fail', 'micro-grid', `short axis cells ${metrics.shortAxisCells}`))
  }
  if (metrics.sourceCellSize < QUALITY_RULES.minSourceCellSize) {
    issues.push(
      issue('fail', 'subpixel-texture', `source cell size ${formatNum(metrics.sourceCellSize)}px`),
    )
  }
  if (metrics.repeatGridGap > repeatTolerance(metrics.cols, metrics.rows)) {
    issues.push(issue('fail', 'unstable-repeat', `repeat grid gap ${metrics.repeatGridGap}`))
  }
  if (metrics.edgeAlignment < QUALITY_RULES.minEdgeAlignment) {
    issues.push(
      issue('review', 'weak-boundaries', `edge alignment ${formatNum(metrics.edgeAlignment)}`),
    )
  }
  if (metrics.cellMae > QUALITY_RULES.highCellMae) {
    issues.push(issue('review', 'noisy-cells', `cell MAE ${formatNum(metrics.cellMae)}`))
  }
  if (metrics.preservationMae > QUALITY_RULES.maxPreservationMae) {
    issues.push(
      issue(
        'review',
        'preservation-loss',
        `preservation MAE ${formatNum(metrics.preservationMae)}`,
      ),
    )
  }

  if (issues.some((item) => item.severity === 'fail')) return { status: 'fail', issues }
  if (issues.length > 0) return { status: 'review', issues }
  return { status: 'pass', issues }
}

async function evaluateFile(file, dataset, options) {
  const input = await loadImage(file)
  const result = snap(input, { colorVariety: options.colorVariety, output: 'original' })
  const resized = snap(input, { colorVariety: options.colorVariety, output: 'resized' })
  const repeat = snap(result, { colorVariety: options.colorVariety, output: 'resized' })
  const cols = resized.width
  const rows = resized.height
  const inputAspect = input.width / input.height
  const gridAspect = cols / rows
  const aspectError = Math.abs(gridAspect / inputAspect - 1)
  const repeatGridGap = Math.abs(repeat.width - cols) + Math.abs(repeat.height - rows)
  const fullGradient = meanAxisGradient(input)
  const boundaryGradient = gridBoundaryGradient(input, cols, rows)
  const edgeAlignment = boundaryGradient / (fullGradient + 1e-9)
  const uniformity = cellUniformityMetrics(input, cols, rows)
  const preserveMae = await preservationMae(input, result)
  const sourceCellSize = Math.min(input.width / cols, input.height / rows)
  const shortAxisCells = Math.min(cols, rows)
  const outputCellWidth = result.width / cols
  const outputCellHeight = result.height / rows
  const squareCellError = Math.abs(outputCellWidth / outputCellHeight - 1)
  const objective =
    repeatGridGap * 100 +
    aspectError * 50 +
    uniformity.cellMae +
    preserveMae +
    Math.max(0, 1 - edgeAlignment) * 25 +
    Math.max(0, QUALITY_RULES.minSourceCellSize - sourceCellSize) * 500 +
    Math.max(0, shortAxisCells - QUALITY_RULES.maxShortAxisCells) * 10
  const metrics = {
    cols,
    rows,
    aspectError,
    shortAxisCells,
    sourceCellSize,
    repeatGridGap,
    edgeAlignment,
    cellMae: uniformity.cellMae,
    preservationMae: preserveMae,
  }
  const classification = classifyMetrics(metrics)
  const name = path.basename(file)
  const item = {
    dataset: dataset.name,
    file: name,
    input: `${input.width}x${input.height}`,
    output: `${result.width}x${result.height}`,
    grid: `${cols}x${rows}`,
    detectedResolution: result.detectedResolution,
    sourceCellSize: formatNum(sourceCellSize),
    squareCellError: formatNum(squareCellError),
    aspectError: formatNum(aspectError),
    edgeAlignment: formatNum(edgeAlignment),
    cellMae: formatNum(uniformity.cellMae),
    cellStdDev: formatNum(uniformity.cellStdDev),
    preservationMae: formatNum(preserveMae),
    repeatGridGap,
    status: classification.status,
    issues: classification.issues,
    issueSummary: classification.issues.map((item) => item.code).join(', ') || 'none',
    objective: formatNum(objective),
  }

  if (options.writeImages) {
    const datasetOutDir = path.join(options.outDir, dataset.name)
    await fs.mkdir(datasetOutDir, { recursive: true })
    await writePng(path.join(datasetOutDir, `${path.parse(name).name}.snap.png`), result)
    await writePng(path.join(datasetOutDir, `${path.parse(name).name}.grid.png`), resized)
  }

  return item
}

function mean(results, key) {
  if (results.length === 0) return 0
  return formatNum(results.reduce((sum, item) => sum + item[key], 0) / results.length)
}

function summarize(results) {
  const statusCounts = results.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1
    return counts
  }, {})

  return {
    count: results.length,
    statusCounts,
    objectiveMean: mean(results, 'objective'),
    repeatGridGapTotal: results.reduce((sum, item) => sum + item.repeatGridGap, 0),
    preservationMaeMean: mean(results, 'preservationMae'),
    sourceCellSizeMean: mean(results, 'sourceCellSize'),
  }
}

function summarizeByDataset(results) {
  const groups = new Map()
  for (const item of results) {
    groups.set(item.dataset, [...(groups.get(item.dataset) ?? []), item])
  }
  return Object.fromEntries([...groups].map(([dataset, items]) => [dataset, summarize(items)]))
}

function criteriaMarkdown() {
  return [
    '## Criteria',
    '',
    `- Aspect preservation: fail when grid aspect differs from source by more than ${QUALITY_RULES.maxAspectError}.`,
    `- No micro-grid snap: fail when the detected short axis exceeds ${QUALITY_RULES.maxShortAxisCells} cells or source cell size drops below ${QUALITY_RULES.minSourceCellSize}px.`,
    `- Idempotence: fail when snapping the snapped output changes the grid by more than max(${QUALITY_RULES.maxRepeatGridGapFloor}, ${(QUALITY_RULES.maxRepeatGridGapRate * 100).toFixed(1)}% of cols+rows).`,
    `- Boundary evidence: review when inferred grid boundaries are weaker than ${QUALITY_RULES.minEdgeAlignment}x the average axis gradient.`,
    `- Source disorder: review when intra-cell source MAE exceeds ${QUALITY_RULES.highCellMae}.`,
    `- Preservation: review when nearest-resized snapped output differs from source by MAE over ${QUALITY_RULES.maxPreservationMae}.`,
    '',
  ]
}

function toMarkdown(summary) {
  const headers = [
    'dataset',
    'file',
    'input',
    'grid',
    'output',
    'sourceCellSize',
    'aspectError',
    'edgeAlignment',
    'cellMae',
    'preservationMae',
    'repeatGridGap',
    'status',
    'issueSummary',
    'objective',
  ]
  const lines = [
    '# Snap Quality Eval',
    '',
    `Color variety: \`${summary.colorVariety}\``,
    '',
    ...criteriaMarkdown(),
    '## Datasets',
    '',
    ...summary.datasets.map((dataset) => `- \`${dataset.name}\`: \`${dataset.dir}\``),
    '',
    '## Aggregate',
    '',
    '```json',
    JSON.stringify(summary.aggregate, null, 2),
    '```',
    '',
    '## Results',
    '',
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
  ]

  for (const result of summary.results) {
    lines.push('| ' + headers.map((header) => String(result[header])).join(' | ') + ' |')
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await fs.mkdir(options.outDir, { recursive: true })

  const results = []
  for (const dataset of options.datasets) {
    const files = await listImages(dataset.dir)
    if (files.length === 0) throw new Error(`No images found in ${dataset.dir}`)
    for (const file of files) results.push(await evaluateFile(file, dataset, options))
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    datasets: options.datasets,
    qualityRules: QUALITY_RULES,
    colorVariety: options.colorVariety,
    results,
    aggregate: {
      overall: summarize(results),
      byDataset: summarizeByDataset(results),
    },
  }

  await fs.writeFile(
    path.join(options.outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  )
  await fs.writeFile(path.join(options.outDir, 'summary.md'), toMarkdown(summary))

  console.table(
    results.map((item) => ({
      dataset: item.dataset,
      file: item.file,
      grid: item.grid,
      cell: item.sourceCellSize,
      repeat: item.repeatGridGap,
      status: item.status,
      issues: item.issueSummary,
      objective: item.objective,
    })),
  )
  console.table([summary.aggregate.overall])
  console.log(`Wrote ${path.relative(ROOT, options.outDir)}/summary.json`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
