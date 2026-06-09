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

test('quality classification reviews axis cell transition color outliers separately', () => {
  const review = classifyMetrics({
    cellTransitionErrorP95: 30,
    cellTransitionXErrorP95: 36.1,
    cellTransitionYErrorP95: 10,
    sourceCellTransitionCount: 24,
    sourceCellTransitionXCount: 24,
    sourceCellTransitionYCount: 24,
  })
  const pass = classifyMetrics({
    cellTransitionErrorP95: 30,
    cellTransitionXErrorP95: 35.9,
    cellTransitionYErrorP95: 10,
    sourceCellTransitionCount: 24,
    sourceCellTransitionXCount: 24,
    sourceCellTransitionYCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(review.issues.some((issue) => issue.code === 'axis-cell-transition-color-outlier'))
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews localized axis cell transition color outliers separately', () => {
  const review = classifyMetrics({
    cellTransitionErrorP99: 55,
    cellTransitionXErrorP99: 59.6,
    cellTransitionYErrorP99: 20,
    sourceCellTransitionCount: 24,
    sourceCellTransitionXCount: 24,
    sourceCellTransitionYCount: 24,
  })
  const pass = classifyMetrics({
    cellTransitionErrorP99: 55,
    cellTransitionXErrorP99: 59.4,
    cellTransitionYErrorP99: 20,
    sourceCellTransitionCount: 24,
    sourceCellTransitionXCount: 24,
    sourceCellTransitionYCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some((issue) => issue.code === 'localized-axis-cell-transition-color-outlier'),
  )
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

test('quality classification reviews directional diagonal transition color outliers separately', () => {
  const review = classifyMetrics({
    cellDiagonalTransitionDownLeftErrorP95: 12,
    cellDiagonalTransitionDownRightErrorP95: 36.1,
    cellDiagonalTransitionErrorP95: 30,
    sourceCellDiagonalTransitionCount: 24,
    sourceCellDiagonalTransitionDownLeftCount: 24,
    sourceCellDiagonalTransitionDownRightCount: 24,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDownLeftErrorP95: 12,
    cellDiagonalTransitionDownRightErrorP95: 35.9,
    cellDiagonalTransitionErrorP95: 30,
    sourceCellDiagonalTransitionCount: 24,
    sourceCellDiagonalTransitionDownLeftCount: 24,
    sourceCellDiagonalTransitionDownRightCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some(
      (issue) => issue.code === 'directional-cell-diagonal-transition-color-outlier',
    ),
  )
  assert.equal(pass.status, 'pass')
})

test('quality classification reviews localized directional diagonal transition outliers separately', () => {
  const review = classifyMetrics({
    cellDiagonalTransitionDownLeftErrorP99: 16,
    cellDiagonalTransitionDownRightErrorP99: 59.6,
    cellDiagonalTransitionErrorP99: 55,
    sourceCellDiagonalTransitionCount: 24,
    sourceCellDiagonalTransitionDownLeftCount: 24,
    sourceCellDiagonalTransitionDownRightCount: 24,
  })
  const pass = classifyMetrics({
    cellDiagonalTransitionDownLeftErrorP99: 16,
    cellDiagonalTransitionDownRightErrorP99: 59.4,
    cellDiagonalTransitionErrorP99: 55,
    sourceCellDiagonalTransitionCount: 24,
    sourceCellDiagonalTransitionDownLeftCount: 24,
    sourceCellDiagonalTransitionDownRightCount: 24,
  })

  assert.equal(review.status, 'review')
  assert.ok(
    review.issues.some(
      (issue) => issue.code === 'localized-directional-cell-diagonal-transition-color-outlier',
    ),
  )
  assert.equal(pass.status, 'pass')
})
