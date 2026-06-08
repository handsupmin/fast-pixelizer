import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function loadImage(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

export async function writePng(file, image) {
  await sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .png()
    .toFile(file)
}

export async function resizeToInput(result, input) {
  const { data } = await sharp(Buffer.from(result.data), {
    raw: { width: result.width, height: result.height, channels: 4 },
  })
    .resize(input.width, input.height, { kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
}
