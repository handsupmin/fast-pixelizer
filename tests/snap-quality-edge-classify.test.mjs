import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyMetrics } from '../scripts/snap-quality/classify.mjs'

test('quality classification reviews edge map overlap below the tuned boundary', () => {
  const review = classifyMetrics({
    edgeJaccard: 0.49,
  })
  const pass = classifyMetrics({
    edgeJaccard: 0.51,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'edge-map-drift'))
  assert.equal(pass.status, 'pass')
})
