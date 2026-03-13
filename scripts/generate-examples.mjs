/**
 * Generates README example images by running the library against docs/original.png.
 * Output goes to examples/  —  referenced by README.md.
 * Usage: node scripts/generate-examples.mjs
 */
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { pixelate } from '../dist/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const docsDir = join(root, 'docs')
const examplesDir = join(root, 'examples')
mkdirSync(examplesDir, { recursive: true })

async function processImage(srcPath, resolution, mode, outPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const input = {
    data: new Uint8ClampedArray(data.buffer),
    width: info.width,
    height: info.height,
  }

  const result = pixelate(input, { resolution, mode, output: 'original' })

  await sharp(Buffer.from(result.data), {
    raw: { width: result.width, height: result.height, channels: 4 },
  })
    .png()
    .toFile(outPath)

  console.log(`✓ ${outPath}  (${resolution}×${resolution} grid, ${mode})`)
}

const src = join(docsDir, 'original.png')

await Promise.all([
  processImage(src, 32, 'clean', join(examplesDir, 'example-32-clean.png')),
  processImage(src, 32, 'detail', join(examplesDir, 'example-32-detail.png')),
  processImage(src, 64, 'clean', join(examplesDir, 'example-64-clean.png')),
  processImage(src, 64, 'detail', join(examplesDir, 'example-64-detail.png')),
])

console.log('Done.')
