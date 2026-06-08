import fs from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { snap } from '../../dist/index.js'
import {
  DEFAULT_OUT_DIR,
  KNOWN_EXPECTATIONS,
  QUALITY_RULES,
  ROOT,
  defaultDatasets,
} from './config.mjs'
import { classifyMetrics, formatNum, objective } from './classify.mjs'
import { generateSyntheticDataset } from './synthetic.mjs'
import { listImages, loadImage, writePng } from './image-io.mjs'
import {
  cellUniformityMetrics,
  gridBoundaryGradient,
  gridPhaseAlignment,
  meanAxisGradient,
  preservationStats,
  uniqueColorCount,
  uniqueRgbColorCount,
} from './metrics.mjs'
import { summarize, summarizeByDataset, toMarkdown } from './report.mjs'

function parseDataset(value) {
  const separator = value.indexOf('=')
  if (separator <= 0) throw new Error(`Expected --dataset name=path, got: ${value}`)
  return { name: value.slice(0, separator), dir: path.resolve(value.slice(separator + 1)) }
}

function parseArgs(argv) {
  const args = {
    datasets: defaultDatasets(),
    outDir: DEFAULT_OUT_DIR,
    colorVariety: 64,
    writeImages: true,
    includeSynthetic: true,
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
    else if (arg === '--no-synthetic') args.includeSynthetic = false
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isFinite(args.colorVariety) || args.colorVariety < 2) {
    throw new Error(`Invalid --color-variety: ${args.colorVariety}`)
  }
  if (args.datasets.length === 0 && !args.includeSynthetic) {
    throw new Error('At least one dataset is required')
  }

  return args
}

function gridGap(a, b) {
  return Math.abs(a.width - b.width) + Math.abs(a.height - b.height)
}

async function timedSnap(input, options) {
  const start = performance.now()
  const result = snap(input, options)
  return { result, durationMs: performance.now() - start }
}

async function evaluateFile(file, dataset, options, expectations) {
  const input = await loadImage(file)
  const original = await timedSnap(input, {
    colorVariety: options.colorVariety,
    output: 'original',
  })
  const resized = await timedSnap(input, { colorVariety: options.colorVariety, output: 'resized' })
  const deterministic = snap(input, { colorVariety: options.colorVariety, output: 'resized' })
  const repeat = snap(original.result, { colorVariety: options.colorVariety, output: 'resized' })
  const repeatOriginal = snap(original.result, {
    colorVariety: options.colorVariety,
    output: 'original',
  })
  const repeatAgain = snap(repeatOriginal, {
    colorVariety: options.colorVariety,
    output: 'resized',
  })
  const cols = resized.result.width
  const rows = resized.result.height
  const name = path.basename(file)
  const expected = expectations.get(`${dataset.name}/${name}`) ?? expectations.get(name)
  const targetAspect = expected ? expected.cols / expected.rows : input.width / input.height
  const gridAspect = cols / rows
  const fullGradient = meanAxisGradient(input)
  const boundaryGradient = gridBoundaryGradient(input, cols, rows)
  const uniformity = cellUniformityMetrics(input, cols, rows)
  const outputUniformity = cellUniformityMetrics(original.result, cols, rows)
  const preserve = await preservationStats(input, original.result)
  const outputCellWidth = original.result.width / cols
  const outputCellHeight = original.result.height / rows
  const inputRgbColorCount = uniqueRgbColorCount(input)
  const outputRgbColorCount = uniqueRgbColorCount(resized.result)
  const lowPaletteRetention =
    inputRgbColorCount > 0 && inputRgbColorCount <= options.colorVariety + 1
      ? outputRgbColorCount / inputRgbColorCount
      : 1
  const metrics = {
    cols,
    rows,
    aspectError: Math.abs(gridAspect / targetAspect - 1),
    shortAxisCells: Math.min(cols, rows),
    sourceCellSize: Math.min(input.width / cols, input.height / rows),
    repeatGridGap: gridGap(repeat, resized.result),
    stabilityDepthGap: gridGap(repeatAgain, repeat),
    determinismGridGap: gridGap(deterministic, resized.result),
    expectedGridGap: expected ? Math.abs(cols - expected.cols) + Math.abs(rows - expected.rows) : 0,
    edgeAlignment: boundaryGradient / (fullGradient + 1e-9),
    phaseAlignment: gridPhaseAlignment(input, cols, rows),
    cellMae: uniformity.cellMae,
    outputCellMae: outputUniformity.cellMae,
    preservationMae: preserve.mae,
    preservationP95: preserve.p95,
    alphaMae: preserve.alphaMae,
    alphaP95: preserve.alphaP95,
    contrastRatio: preserve.contrastRatio,
    squareCellError: Math.abs(outputCellWidth / outputCellHeight - 1),
    outputRgbPaletteOverage: Math.max(0, outputRgbColorCount - (options.colorVariety + 1)),
    lowPaletteRetention,
  }
  const classification = classifyMetrics(metrics)
  const item = {
    dataset: dataset.name,
    file: name,
    input: `${input.width}x${input.height}`,
    output: `${original.result.width}x${original.result.height}`,
    grid: `${cols}x${rows}`,
    expectedGrid: expected ? `${expected.cols}x${expected.rows}` : '',
    detectedResolution: original.result.detectedResolution,
    sourceCellSize: formatNum(metrics.sourceCellSize),
    squareCellError: formatNum(metrics.squareCellError),
    aspectError: formatNum(metrics.aspectError),
    edgeAlignment: formatNum(metrics.edgeAlignment),
    phaseAlignment: formatNum(metrics.phaseAlignment),
    cellMae: formatNum(metrics.cellMae),
    cellStdDev: formatNum(uniformity.cellStdDev),
    outputCellMae: formatNum(metrics.outputCellMae),
    preservationMae: formatNum(metrics.preservationMae),
    preservationP95: formatNum(metrics.preservationP95),
    alphaMae: formatNum(metrics.alphaMae),
    alphaP95: formatNum(metrics.alphaP95),
    contrastRatio: formatNum(metrics.contrastRatio),
    repeatGridGap: metrics.repeatGridGap,
    stabilityDepthGap: metrics.stabilityDepthGap,
    determinismGridGap: metrics.determinismGridGap,
    expectedGridGap: metrics.expectedGridGap,
    inputColorCount: uniqueColorCount(input),
    inputRgbColorCount,
    outputColorCount: uniqueColorCount(resized.result),
    outputRgbColorCount,
    outputRgbPaletteOverage: metrics.outputRgbPaletteOverage,
    lowPaletteRetention: formatNum(metrics.lowPaletteRetention),
    snapOriginalMs: formatNum(original.durationMs),
    snapResizedMs: formatNum(resized.durationMs),
    status: classification.status,
    issues: classification.issues,
    issueSummary: classification.issues.map((issue) => issue.code).join(', ') || 'none',
    objective: formatNum(objective(metrics)),
  }

  if (options.writeImages) {
    const datasetOutDir = path.join(options.outDir, dataset.name)
    await fs.mkdir(datasetOutDir, { recursive: true })
    await writePng(path.join(datasetOutDir, `${path.parse(name).name}.snap.png`), original.result)
    await writePng(path.join(datasetOutDir, `${path.parse(name).name}.grid.png`), resized.result)
  }

  return item
}

export async function runSnapQualityEval(argv) {
  const options = parseArgs(argv)
  await fs.mkdir(options.outDir, { recursive: true })
  const expectations = new Map(KNOWN_EXPECTATIONS)
  const datasets = [...options.datasets]
  if (options.includeSynthetic) {
    const synthetic = await generateSyntheticDataset(options.outDir)
    datasets.push(synthetic.dataset)
    for (const [file, expected] of synthetic.expectations) expectations.set(file, expected)
  }

  const results = []
  for (const dataset of datasets) {
    const files = await listImages(dataset.dir)
    if (files.length === 0) throw new Error(`No images found in ${dataset.dir}`)
    for (const file of files) results.push(await evaluateFile(file, dataset, options, expectations))
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    datasets,
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
      expected: item.expectedGrid,
      repeat: item.repeatGridGap,
      truth: item.expectedGridGap,
      status: item.status,
      issues: item.issueSummary,
      objective: item.objective,
    })),
  )
  console.table([summary.aggregate.overall])
  console.log(`Wrote ${path.relative(ROOT, options.outDir)}/summary.json`)
}
