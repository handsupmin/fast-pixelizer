import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

function makeLowResPattern(cols, rows, mode) {
  const data = new Uint8ClampedArray(cols * rows * 4)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const block = Math.floor(x / 5) + Math.floor(y / 7)
      const seed = mode === 'sparse' ? block * 37 : x * 17 + y * 31 + block * 53
      const value = seed % 256
      data[i] = value
      data[i + 1] = (value * 3 + x * 5) % 256
      data[i + 2] = (value * 7 + y * 11) % 256
      data[i + 3] = mode === 'transparent' && x < cols / 5 && y < rows / 5 ? 0 : 255
    }
  }
  return { data, width: cols, height: rows }
}

async function writeScaled(file, image, scale, kernel) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { kernel })
    .png()
    .toFile(file)
}

export async function generateSyntheticDataset(outDir) {
  const dir = path.join(outDir, 'synthetic-source')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })

  const fixtures = [
    {
      file: 'nearest-48x32-scale8.png',
      image: makeLowResPattern(48, 32, 'dense'),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'rectangular-80x32-scale5.png',
      image: makeLowResPattern(80, 32, 'dense'),
      scale: 5,
      kernel: 'nearest',
      expected: { cols: 80, rows: 32 },
    },
    {
      file: 'blurred-64x40-scale6.png',
      image: makeLowResPattern(64, 40, 'dense'),
      scale: 6,
      kernel: 'cubic',
      expected: { cols: 64, rows: 40 },
    },
    {
      file: 'sparse-32x32-scale10.png',
      image: makeLowResPattern(32, 32, 'sparse'),
      scale: 10,
      kernel: 'nearest',
      expected: { cols: 32, rows: 32 },
    },
    {
      file: 'transparent-32x32-scale8.png',
      image: makeLowResPattern(32, 32, 'transparent'),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 32, rows: 32 },
    },
  ]

  const expectations = new Map()
  for (const fixture of fixtures) {
    await writeScaled(path.join(dir, fixture.file), fixture.image, fixture.scale, fixture.kernel)
    expectations.set(fixture.file, fixture.expected)
  }

  return {
    dataset: { name: 'synthetic-fixtures', dir },
    expectations,
  }
}
