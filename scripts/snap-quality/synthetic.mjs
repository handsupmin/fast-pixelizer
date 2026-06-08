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

function paintRect(image, left, top, right, bottom, color) {
  for (let y = Math.max(0, top); y < Math.min(image.height, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(image.width, right); x++) {
      const i = (y * image.width + x) * 4
      image.data[i] = color[0]
      image.data[i + 1] = color[1]
      image.data[i + 2] = color[2]
      image.data[i + 3] = color[3] ?? 255
    }
  }
}

function paintLine(image, x0, y0, x1, y1, color) {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let error = dx + dy
  let x = x0
  let y = y0

  while (true) {
    paintRect(image, x, y, x + 1, y + 1, color)
    if (x === x1 && y === y1) break
    const doubled = error * 2
    if (doubled >= dy) {
      error += dy
      x += sx
    }
    if (doubled <= dx) {
      error += dx
      y += sy
    }
  }
}

function makeLowPaletteSprite(cols, rows) {
  const palette = {
    background: [22, 24, 35, 255],
    outline: [8, 10, 16, 255],
    shadow: [71, 76, 97, 255],
    body: [137, 166, 108, 255],
    highlight: [232, 218, 139, 255],
    accent: [183, 72, 82, 255],
  }
  const image = { data: new Uint8ClampedArray(cols * rows * 4), width: cols, height: rows }
  paintRect(image, 0, 0, cols, rows, palette.background)
  paintRect(image, 4, 25, 44, 28, palette.shadow)
  paintRect(image, 15, 8, 31, 23, palette.outline)
  paintRect(image, 16, 9, 30, 22, palette.body)
  paintRect(image, 18, 11, 23, 15, palette.highlight)
  paintRect(image, 25, 12, 27, 14, palette.outline)
  paintRect(image, 20, 18, 22, 20, palette.accent)
  paintRect(image, 24, 18, 26, 20, palette.accent)
  paintRect(image, 14, 21, 18, 24, palette.outline)
  paintRect(image, 28, 21, 32, 24, palette.outline)
  paintLine(image, 7, 21, 17, 13, palette.outline)
  paintLine(image, 8, 21, 18, 13, palette.highlight)
  paintLine(image, 31, 13, 40, 8, palette.outline)
  paintLine(image, 31, 14, 41, 9, palette.highlight)
  return image
}

function makeTransparentLowPaletteSprite(cols, rows) {
  const palette = {
    outline: [15, 18, 24, 255],
    skin: [229, 181, 103, 255],
    cloth: [73, 135, 112, 255],
    highlight: [244, 231, 151, 255],
    shadow: [82, 43, 58, 255],
  }
  const image = { data: new Uint8ClampedArray(cols * rows * 4), width: cols, height: rows }
  paintRect(image, 12, 6, 22, 17, palette.outline)
  paintRect(image, 13, 7, 21, 16, palette.skin)
  paintRect(image, 15, 9, 18, 12, palette.highlight)
  paintRect(image, 18, 10, 19, 11, palette.outline)
  paintRect(image, 11, 16, 24, 25, palette.outline)
  paintRect(image, 12, 17, 23, 24, palette.cloth)
  paintRect(image, 14, 19, 17, 23, palette.shadow)
  paintRect(image, 9, 18, 12, 21, palette.outline)
  paintRect(image, 23, 18, 26, 21, palette.outline)
  paintRect(image, 13, 24, 16, 28, palette.outline)
  paintRect(image, 20, 24, 23, 28, palette.outline)
  paintLine(image, 6, 15, 12, 19, palette.outline)
  paintLine(image, 23, 19, 30, 14, palette.outline)
  return image
}

async function writeScaled(file, image, scale, kernel) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { fit: 'fill', kernel })
    .png()
    .toFile(file)
}

async function writeScaledCrop(file, image, scale, kernel, crop) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(image.width * scale, image.height * scale, { fit: 'fill', kernel })
    .extract({
      left: crop.left,
      top: crop.top,
      width: image.width * scale - crop.left - crop.right,
      height: image.height * scale - crop.top - crop.bottom,
    })
    .png()
    .toFile(file)
}

async function writeScaledGutters(file, image, scale, gutter) {
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

  await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
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
      file: 'low-palette-sprite-48x32-scale8.png',
      image: makeLowPaletteSprite(48, 32),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'transparent-sprite-32x32-scale8.png',
      image: makeTransparentLowPaletteSprite(32, 32),
      scale: 8,
      kernel: 'nearest',
      expected: { cols: 32, rows: 32 },
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
      file: 'partial-edge-crop-48x32-scale8.png',
      image: makeLowResPattern(48, 32, 'dense'),
      scale: 8,
      kernel: 'nearest',
      crop: { left: 7, top: 7, right: 7, bottom: 7 },
      expected: { cols: 48, rows: 32 },
    },
    {
      file: 'editor-grid-gutter-48x32-scale6.png',
      image: makeLowResPattern(48, 32, 'dense'),
      scale: 6,
      gutter: 1,
      expected: { cols: 48, rows: 32 },
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
    else if (fixture.crop)
      await writeScaledCrop(file, fixture.image, fixture.scale, fixture.kernel, fixture.crop)
    else if (fixture.gutter)
      await writeScaledGutters(file, fixture.image, fixture.scale, fixture.gutter)
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
