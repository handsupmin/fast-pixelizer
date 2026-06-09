import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { snap } from '../dist/index.js'

const MODEL_EXAMPLE_DIR = path.resolve('../mono-pix/src/assets/examples')
const MODEL_EXAMPLE_GRIDS = new Map([
  ['gemini-nano-banana-2.png', { cols: 557, rows: 306 }],
  ['gpt-image-2.png', { cols: 350, rows: 264 }],
  ['midjourney.png', { cols: 744, rows: 430 }],
  ['nano-banana-2.png', { cols: 565, rows: 298 }],
  ['seedream-4.5.png', { cols: 1387, rows: 778 }],
])

async function loadImage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

function makePattern(width, height, mode = 'dense') {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const block = Math.floor(x / 5) + Math.floor(y / 7)
      const seed = mode === 'sparse' ? block * 37 : x * 17 + y * 31 + block * 53
      const value = seed % 256
      data[i] = value
      data[i + 1] = (value * 3 + x * 5) % 256
      data[i + 2] = (value * 7 + y * 11) % 256
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

function makeTransparentBorderPattern(width, height, border) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inside = x >= border && y >= border && x < width - border && y < height - border
      const block = Math.floor(x / 4) + Math.floor(y / 5)
      const seed = x * 19 + y * 41 + block * 53
      data[i] = seed % 256
      data[i + 1] = (seed * 3 + x * 7) % 256
      data[i + 2] = (seed * 5 + y * 11) % 256
      data[i + 3] = inside ? 255 : 0
    }
  }
  return { data, width, height }
}

function scaleWithGutters(image, scale, gutter) {
  const width = image.width * scale + (image.width - 1) * gutter
  const height = image.height * scale + (image.height - 1) * gutter
  const data = new Uint8ClampedArray(width * height * 4)

  for (let i = 3; i < data.length; i += 4) data[i] = 255

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const sourceIndex = (y * image.width + x) * 4
      const x0 = x * (scale + gutter)
      const y0 = y * (scale + gutter)
      for (let py = y0; py < y0 + scale; py++) {
        for (let px = x0; px < x0 + scale; px++) {
          const targetIndex = (py * width + px) * 4
          data[targetIndex] = image.data[sourceIndex]
          data[targetIndex + 1] = image.data[sourceIndex + 1]
          data[targetIndex + 2] = image.data[sourceIndex + 2]
          data[targetIndex + 3] = image.data[sourceIndex + 3]
        }
      }
    }
  }

  return { data, width, height }
}

async function scaleImage(image, scale, kernel) {
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { kernel })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

async function resizeImage(image, width, height, kernel) {
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(width, height, { fit: 'fill', kernel })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

async function cropImage(image, left, top, width, height) {
  const { data, info } = await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

async function detect(file, options) {
  const input = await loadImage(file)
  const result = snap(input, options)
  return {
    detectedResolution: result.detectedResolution,
    cols: result.colCuts.length - 1,
    rows: result.rowCuts.length - 1,
  }
}

function detectImage(input) {
  const result = snap(input, { colorVariety: 64, output: 'resized' })
  return {
    cols: result.width,
    rows: result.height,
  }
}

async function repeatGap(file) {
  const input = await loadImage(file)
  const resized = snap(input, { colorVariety: 64, output: 'resized' })
  const original = snap(input, { colorVariety: 64, output: 'original' })
  const repeated = snap(original, { colorVariety: 64, output: 'resized' })

  return Math.abs(resized.width - repeated.width) + Math.abs(resized.height - repeated.height)
}

test('already snapped Gemini output keeps nearly the same detected grid', async () => {
  const gemini = await detect('examples/1.gemini.png')
  const converted = await detect('examples/2.well-converted.png')

  assert.ok(
    gemini.detectedResolution >= 190,
    `expected first snap to stay near 201, got ${gemini.detectedResolution}`,
  )
  assert.ok(
    Math.abs(gemini.detectedResolution - converted.detectedResolution) <= 2,
    `expected repeated snap to preserve the grid, got ${gemini.detectedResolution} vs ${converted.detectedResolution}`,
  )
})

test('square GPT pixel art collapses to an exact square grid', async () => {
  const gpt3 = await detect('examples/3.gpt.png')
  const gpt4 = await detect('examples/4.gpt.png')

  assert.equal(
    gpt3.cols,
    gpt3.rows,
    `expected 3.gpt grid to be square, got ${gpt3.cols}x${gpt3.rows}`,
  )
  assert.equal(
    gpt4.cols,
    gpt4.rows,
    `expected 4.gpt grid to be square, got ${gpt4.cols}x${gpt4.rows}`,
  )
})

test('uniform snap outputs keep the same grid when snapped again', async () => {
  for (const file of [
    'examples/example-64-detail.png',
    'examples/example-snap-after-with-grid.png',
  ]) {
    const gap = await repeatGap(file)
    assert.equal(gap, 0, `expected repeated snap to preserve ${file}, got grid gap ${gap}`)
  }
})

test(
  'model-generated pseudo pixel art preserves illustration detail',
  { skip: !fs.existsSync(MODEL_EXAMPLE_DIR) },
  async () => {
    for (const [file, expected] of MODEL_EXAMPLE_GRIDS) {
      const grid = await detect(path.join(MODEL_EXAMPLE_DIR, file), { colorVariety: 64 })
      assert.deepEqual(
        { cols: grid.cols, rows: grid.rows },
        expected,
        `expected ${file} to preserve the 1.3.0-style detail grid`,
      )
    }
  },
)

test('hand-authored snap examples still recover their source grid', async () => {
  const after = await detect('examples/example-snap-after.png', { colorVariety: 64 })
  const before = await detect('examples/example-snap-before.png', { colorVariety: 64 })

  assert.deepEqual({ cols: after.cols, rows: after.rows }, { cols: 41, rows: 41 })
  assert.deepEqual({ cols: before.cols, rows: before.rows }, { cols: 41, rows: 42 })
})

test('blurred scaled pixel art recovers the source grid', async () => {
  const input = await scaleImage(makePattern(64, 40), 6, 'cubic')
  const grid = detectImage(input)

  assert.deepEqual(grid, { cols: 64, rows: 40 })
})

test('sparse same-color pixel art stays stable on repeated snap', async () => {
  const input = await scaleImage(makePattern(32, 32, 'sparse'), 10, 'nearest')
  const first = snap(input, { colorVariety: 64, output: 'resized' })
  const original = snap(input, { colorVariety: 64, output: 'original' })
  const repeated = snap(original, { colorVariety: 64, output: 'resized' })

  assert.equal(Math.abs(first.width - repeated.width) + Math.abs(first.height - repeated.height), 0)
  assert.deepEqual({ cols: first.width, rows: first.height }, { cols: 32, rows: 32 })
})

test('non-square scaled pixel art recovers the square source grid', async () => {
  const input = await resizeImage(makePattern(40, 40), 320, 240, 'nearest')
  const grid = detectImage(input)

  assert.deepEqual(grid, { cols: 40, rows: 40 })
})

test('transparent padded pixel art keeps the full source grid', async () => {
  const input = await scaleImage(makeTransparentBorderPattern(32, 32, 8), 8, 'nearest')
  const grid = detectImage(input)

  assert.deepEqual(grid, { cols: 32, rows: 32 })
})

test('partially cropped edge cells keep the visible source grid', async () => {
  const scaled = await scaleImage(makePattern(48, 32), 8, 'nearest')
  const input = await cropImage(scaled, 7, 7, scaled.width - 14, scaled.height - 14)
  const grid = detectImage(input)

  assert.deepEqual(grid, { cols: 48, rows: 32 })
})

test('editor grid gutters do not count as source cells', () => {
  const input = scaleWithGutters(makePattern(48, 32), 6, 1)
  const grid = detectImage(input)

  assert.deepEqual(grid, { cols: 48, rows: 32 })
})

test('package 64px clean example recovers its generated source grid', async () => {
  const grid = await detect('examples/example-64-clean.png')

  assert.deepEqual({ cols: grid.cols, rows: grid.rows }, { cols: 64, rows: 64 })
})

test('package 64px detail example recovers its generated source grid', async () => {
  const grid = await detect('examples/example-64-detail.png')

  assert.deepEqual({ cols: grid.cols, rows: grid.rows }, { cols: 64, rows: 64 })
})
