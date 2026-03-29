import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { snap } from '../dist/index.js'

async function loadImage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

async function detect(file) {
  const input = await loadImage(file)
  const result = snap(input)
  return {
    detectedResolution: result.detectedResolution,
    cols: result.colCuts.length - 1,
    rows: result.rowCuts.length - 1,
  }
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
