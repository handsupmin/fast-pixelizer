import sharp from 'sharp'
import { snap } from '../dist/index.js'

const FILES = [
  'examples/1.gemini.png',
  'examples/2.well-converted.png',
  'examples/3.gpt.png',
  'examples/4.gpt.png',
]

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
    file,
    width: input.width,
    height: input.height,
    detectedResolution: result.detectedResolution,
    cols: result.colCuts.length - 1,
    rows: result.rowCuts.length - 1,
  }
}

const results = []
for (const file of FILES) {
  results.push(await detect(file))
}

const gemini = results[0]
const converted = results[1]
const gpt3 = results[2]
const gpt4 = results[3]

const metrics = {
  geminiGap: Math.abs(gemini.detectedResolution - converted.detectedResolution),
  gpt3AxisGap: Math.abs(gpt3.cols - gpt3.rows),
  gpt4AxisGap: Math.abs(gpt4.cols - gpt4.rows),
}

const objective = metrics.geminiGap * 10 + metrics.gpt3AxisGap + metrics.gpt4AxisGap

console.table(results)
console.table([{ ...metrics, objective }])
