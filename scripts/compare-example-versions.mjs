import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { renderHtml, writeContactSheet } from './example-compare/render.mjs'
import { defaultDatasets } from './snap-quality/config.mjs'
import { listImages, loadImage, writePng } from './snap-quality/image-io.mjs'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUT_DIR = path.join(ROOT, '.tmp/example-version-compare')
const PIXELATE_EXAMPLE_RE = /^example-(32|64)-(clean|detail)\.png$/

function parseDataset(value) {
  const separator = value.indexOf('=')
  if (separator <= 0) throw new Error(`Expected --dataset name=path, got: ${value}`)
  return { name: value.slice(0, separator), dir: path.resolve(value.slice(separator + 1)) }
}

function parseArgs(argv) {
  const args = {
    after: 'local',
    before: '',
    colorVariety: 64,
    datasets: defaultDatasets(),
    includePixelateExamples: false,
    outDir: DEFAULT_OUT_DIR,
    output: 'original',
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--after') args.after = argv[++i]
    else if (arg === '--before') args.before = argv[++i]
    else if (arg === '--color-variety') args.colorVariety = Number.parseInt(argv[++i], 10)
    else if (arg === '--dataset') args.datasets.push(parseDataset(argv[++i]))
    else if (arg === '--examples-dir')
      args.datasets = [{ name: 'demo-examples', dir: path.resolve(argv[++i]) }]
    else if (arg === '--include-pixelate-examples') args.includePixelateExamples = true
    else if (arg === '--no-default-datasets') args.datasets = []
    else if (arg === '--out-dir') args.outDir = path.resolve(argv[++i])
    else if (arg === '--output') args.output = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!args.before) throw new Error('Missing required --before <version-or-package-spec>')
  if (!Number.isFinite(args.colorVariety) || args.colorVariety < 2) {
    throw new Error(`Invalid --color-variety: ${args.colorVariety}`)
  }
  if (!['original', 'resized'].includes(args.output)) {
    throw new Error(`Invalid --output: ${args.output}`)
  }
  if (args.datasets.length === 0) throw new Error('At least one dataset is required')
  return args
}

function shouldSkipImage(file, options) {
  return !options.includePixelateExamples && PIXELATE_EXAMPLE_RE.test(path.basename(file))
}

function normalizeSpec(spec) {
  return /^\d+\.\d+\.\d+/.test(spec) ? `fast-pixelizer@${spec}` : spec
}

function labelForSpec(spec) {
  if (['.', './', 'local'].includes(spec)) return 'local'
  return spec.replace(/^fast-pixelizer@/, '')
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '')
}

async function ensurePackedPackage(spec, outDir) {
  const packageDir = path.join(outDir, '_packages', safeName(spec), 'package')
  try {
    await fs.access(path.join(packageDir, 'dist/index.js'))
    return packageDir
  } catch {
    const dest = path.dirname(packageDir)
    await fs.rm(dest, { force: true, recursive: true })
    await fs.mkdir(dest, { recursive: true })
    const { stdout } = await execFileAsync('npm', ['pack', spec, '--pack-destination', dest], {
      cwd: ROOT,
    })
    const tarball = path.join(dest, stdout.trim().split('\n').at(-1))
    await execFileAsync('tar', ['-xzf', tarball, '-C', dest])
    return packageDir
  }
}

async function loadSnap(spec, outDir) {
  const normalized = normalizeSpec(spec)
  const indexFile = ['.', './', 'local'].includes(normalized)
    ? path.join(ROOT, 'dist/index.js')
    : path.join(await ensurePackedPackage(normalized, outDir), 'dist/index.js')
  const mod = await import(`${pathToFileURL(indexFile).href}?compare=${Date.now()}`)
  if (typeof mod.snap !== 'function') throw new Error(`No snap() export found in ${spec}`)
  return { label: labelForSpec(spec), snap: mod.snap, spec: normalized }
}

function gridOf(result) {
  return {
    cols: result.colCuts.length - 1,
    rows: result.rowCuts.length - 1,
  }
}

function pixelAt(image, x, y, channel) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0
  return image.data[(y * image.width + x) * 4 + channel]
}

function diffImages(before, after) {
  const width = Math.max(before.width, after.width)
  const height = Math.max(before.height, after.height)
  const data = new Uint8ClampedArray(width * height * 4)
  let changedPixels = 0
  let totalError = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      let maxDelta = 0
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(pixelAt(before, x, y, channel) - pixelAt(after, x, y, channel))
        totalError += delta
        maxDelta = Math.max(maxDelta, delta)
      }
      if (maxDelta > 0) {
        changedPixels++
        data[index] = 255
        data[index + 1] = Math.max(0, 230 - maxDelta)
        data[index + 2] = 0
        data[index + 3] = 255
      }
    }
  }

  return {
    changedPixels,
    image: { data, width, height },
    mae: Number((totalError / (width * height * 4)).toFixed(4)),
  }
}

async function runSnap(snap, input, options) {
  const started = performance.now()
  const result = snap(input, { colorVariety: options.colorVariety, output: options.output })
  const grid = gridOf(result)
  return {
    detectedResolution: result.detectedResolution,
    grid: `${grid.cols}x${grid.rows}`,
    height: result.height,
    ms: Number((performance.now() - started).toFixed(2)),
    result,
    width: result.width,
  }
}

function snapMeta(item) {
  return {
    detectedResolution: item.detectedResolution,
    grid: item.grid,
    height: item.height,
    ms: item.ms,
    width: item.width,
  }
}

export async function compareExampleVersions(argv) {
  const options = parseArgs(argv)
  await fs.mkdir(options.outDir, { recursive: true })
  const before = await loadSnap(options.before, options.outDir)
  const after = await loadSnap(options.after, options.outDir)
  const items = []
  const skipped = []

  for (const dataset of options.datasets) {
    for (const file of await listImages(dataset.dir)) {
      if (shouldSkipImage(file, options)) {
        skipped.push({
          dataset: dataset.name,
          file: path.basename(file),
          reason: 'pixelate-example',
        })
        continue
      }
      const input = await loadImage(file)
      const name = path.basename(file)
      const slug = `${safeName(dataset.name)}-${safeName(path.parse(name).name)}`
      const resultDir = path.join(options.outDir, 'results')
      await fs.mkdir(resultDir, { recursive: true })
      const absFiles = {
        after: path.join(resultDir, `${slug}.${safeName(after.label)}.png`),
        before: path.join(resultDir, `${slug}.${safeName(before.label)}.png`),
        diff: path.join(resultDir, `${slug}.diff.png`),
        original: path.join(resultDir, `${slug}.original.png`),
      }
      const beforeSnap = await runSnap(before.snap, input, options)
      const afterSnap = await runSnap(after.snap, input, options)
      const diff = diffImages(beforeSnap.result, afterSnap.result)
      await writePng(absFiles.original, input)
      await writePng(absFiles.before, beforeSnap.result)
      await writePng(absFiles.after, afterSnap.result)
      await writePng(absFiles.diff, diff.image)
      items.push({
        absFiles,
        after: snapMeta(afterSnap),
        before: snapMeta(beforeSnap),
        dataset: dataset.name,
        diff: { changedPixels: diff.changedPixels, mae: diff.mae },
        file: name,
        files: Object.fromEntries(
          Object.entries(absFiles).map(([key, value]) => [
            key,
            path.relative(options.outDir, value),
          ]),
        ),
        input: `${input.width}x${input.height}`,
        same:
          beforeSnap.width === afterSnap.width &&
          beforeSnap.height === afterSnap.height &&
          diff.changedPixels === 0,
      })
      console.log(`${dataset.name}/${name}: ${beforeSnap.grid} -> ${afterSnap.grid}`)
    }
  }

  const summary = {
    after,
    aggregate: {
      changed: items.filter((item) => !item.same).length,
      count: items.length,
      skipped: skipped.length,
      maeMean:
        items.length > 0
          ? Number((items.reduce((sum, item) => sum + item.diff.mae, 0) / items.length).toFixed(4))
          : 0,
    },
    before,
    colorVariety: options.colorVariety,
    generatedAt: new Date().toISOString(),
    items,
    output: options.output,
    skipped,
  }
  delete summary.before.snap
  delete summary.after.snap
  await fs.writeFile(
    path.join(options.outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  )
  await fs.writeFile(path.join(options.outDir, 'index.html'), renderHtml(summary))
  await writeContactSheet(summary, path.join(options.outDir, 'contact-sheet.png'))
  console.table(
    items.map((item) => ({
      dataset: item.dataset,
      file: item.file,
      before: item.before.grid,
      after: item.after.grid,
      changedPixels: item.diff.changedPixels,
      mae: item.diff.mae,
    })),
  )
  console.log(`Wrote ${path.relative(ROOT, options.outDir)}/index.html`)
}

compareExampleVersions(process.argv.slice(2)).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
