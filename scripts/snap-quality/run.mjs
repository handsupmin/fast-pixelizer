import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_OUT_DIR,
  KNOWN_EXPECTATIONS,
  QUALITY_RULES,
  ROOT,
  defaultDatasets,
} from './config.mjs'
import { evaluateFile } from './evaluate-file.mjs'
import { generateSyntheticDataset } from './synthetic.mjs'
import { listImages } from './image-io.mjs'
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
      mode: item.expectedMode,
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
