import test from 'node:test'
import assert from 'node:assert/strict'
import { fitResolutionToAspect, pixelate } from '../dist/index.js'

function makeImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x % 256
      data[i + 1] = y % 256
      data[i + 2] = (x + y) % 256
      data[i + 3] = 255
    }
  }

  return { data, width, height }
}

test('scalar resolution preserves legacy square resized output', () => {
  const result = pixelate(makeImage(100, 40), { resolution: 32, output: 'resized' })

  assert.equal(result.width, 32)
  assert.equal(result.height, 32)
  assert.equal(result.data.length, 32 * 32 * 4)
})

test('rectangular resolution resizes to cols by rows', () => {
  const result = pixelate(makeImage(100, 40), {
    resolution: { cols: 80, rows: 32 },
    output: 'resized',
  })

  assert.equal(result.width, 80)
  assert.equal(result.height, 32)
  assert.equal(result.data.length, 80 * 32 * 4)
})

test('rectangular resolution keeps original output dimensions when requested', () => {
  const result = pixelate(makeImage(100, 40), {
    resolution: { cols: 80, rows: 32 },
    output: 'original',
  })

  assert.equal(result.width, 100)
  assert.equal(result.height, 40)
  assert.equal(result.data.length, 100 * 40 * 4)
})

test('fitResolutionToAspect maps scalar to the shorter image axis', () => {
  assert.deepEqual(fitResolutionToAspect({ width: 100, height: 40 }, 32), {
    cols: 80,
    rows: 32,
  })
  assert.deepEqual(fitResolutionToAspect({ width: 40, height: 100 }, 32), {
    cols: 32,
    rows: 80,
  })
})
