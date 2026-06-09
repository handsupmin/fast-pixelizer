import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'

test('quality classification reviews orthogonal cell transition color drift above the tuned boundary', () => {
  const review = classifyMetrics({
    cellTransitionErrorMean: 10.5,
    sourceCellTransitionCount: 24,
  })
  const pass = classifyMetrics({
    cellTransitionErrorMean: 9.5,
    sourceCellTransitionCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'cell-transition-color-drift'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews diagonal cell transition color drift above the tuned boundary', () => {
  const review = classifyMetrics({
    cellDiagonalTransitionErrorMean: 10.5,
    sourceCellDiagonalTransitionCount: 24,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionErrorMean: 9.5,
    sourceCellDiagonalTransitionCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'cell-diagonal-transition-color-drift'))
  assert.equal(pass.status, 'pass')
})
