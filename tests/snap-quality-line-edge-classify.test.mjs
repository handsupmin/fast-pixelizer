import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'

test('quality classification reviews weak line edge strength below the tuned boundary', () => {
  const review = classifyMetrics({
    lineEdgeRatio: 0.54,
  })
  const pass = classifyMetrics({
    lineEdgeRatio: 0.56,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'line-edge-drift'))
  assert.equal(pass.status, 'pass')
})
