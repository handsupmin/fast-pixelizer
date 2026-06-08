import { runSnapQualityEval } from './snap-quality/run.mjs'

runSnapQualityEval(process.argv.slice(2)).catch((err) => {
  console.error(err)
  process.exitCode = 1
})
