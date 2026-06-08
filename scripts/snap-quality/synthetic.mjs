import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const INDEXED_PALETTE = [
  [33, 30, 39],
  [82, 43, 58],
  [139, 72, 82],
  [190, 123, 92],
  [229, 181, 103],
  [151, 179, 108],
  [73, 135, 112],
  [52, 78, 91],
]

function makeLowResPattern(cols, rows, mode) {
  const data = new Uint8ClampedArray(cols * rows * 4)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      const block = Math.floor(x / 5) + Math.floor(y / 7)
      const seed = mode === 'sparse' ? block * 37 : x * 17 + y * 31 + block * 53
      const value = seed % 256
      if (mode === 'indexed-8') {
        const color = INDEXED_PALETTE[(x * 3 + y * 5 + block) % INDEXED_PALETTE.length]
        data[i] = color[0]
        data[i + 1] = color[1]
        data[i + 2] = color[2]
      } else {
        data[i] = value
        data[i + 1] = (value * 3 + x * 5) % 256
        data[i + 2] = (value * 7 + y * 11) % 256
      }
      const transparentBorder =
        mode === 'transparent-border' &&
        (x < cols / 4 || y < rows / 4 || x >= (cols * 3) / 4 || y >= (rows * 3) / 4)
      if (mode === 'transparent' && x < cols / 5 && y < rows / 5) data[i + 3] = 0
      else if (transparentBorder) data[i + 3] = 0
      else if (mode === 'semi-transparent' && (x + y) % 5 === 0) data[i + 3] = 128
      else data[i + 3] = 255
    }
  }
  return { data, width: cols, height: rows }
}

async function writeScaled(file, image, scale, kernel) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { fit: 'fill', kernel })
    .png()
    .toFile(file)
}

async function writeResized(file, image, width, height, kernel) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(width, height, { fit: 'fill', kernel })
    .png()
    .toFile(file)
}

async function writeJpeg(file, image, scale, quality) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { fit: 'fill', kernel: 'nearest' })
    .jpeg({ quality })
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
    {
      file: 'transparent-border-32x32-scale8.png',
      image: makeLowResPattern(32, 32, 'transparent-border'),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 32, rows: 32 },
    },
    {
      file: 'semi-transparent-48x32-scale8.png',
      image: makeLowResPattern(48, 32, 'semi-transparent'),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'indexed-8-color-48x32-scale8.png',
      image: makeLowResPattern(48, 32, 'indexed-8'),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'non-integer-48x32-to-360x240.png',
      image: makeLowResPattern(48, 32, 'dense'),
      width: 360,
      height: 240,
      kernel: 'nearest',
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'anisotropic-40x40-to-320x240.png',
      image: makeLowResPattern(40, 40, 'dense'),
      width: 320,
      height: 240,
      kernel: 'nearest',
      expected: { cols: 40, rows: 40 },
    },
    {
      file: 'jpeg-48x32-scale8-q45.jpg',
      image: makeLowResPattern(48, 32, 'dense'),
      scale: 8,
      quality: 45,
      expected: { cols: 48, rows: 32 },
    },
  ]

  const expectations = new Map()
  for (const fixture of fixtures) {
    const file = path.join(dir, fixture.file)
    if (fixture.quality) await writeJpeg(file, fixture.image, fixture.scale, fixture.quality)
    else if (fixture.width && fixture.height)
      await writeResized(file, fixture.image, fixture.width, fixture.height, fixture.kernel)
    else await writeScaled(file, fixture.image, fixture.scale, fixture.kernel)
    expectations.set(fixture.file, fixture.expected)
  }

  return {
    dataset: { name: 'synthetic-fixtures', dir },
    expectations,
  }
}
