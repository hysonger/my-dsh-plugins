import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, panBy, wheelDeltaPixels, wheelZoomFactor,
  zoomAtPoint, zoomCentered, zoomPercent,
} from '../src/client/zoom.js'

function pointUnderState(point, state, viewport) {
  // Image-space point currently under the viewport point.
  return {
    x: (point.x - viewport.width / 2 - state.x) / state.scale,
    y: (point.y - viewport.height / 2 - state.y) / state.scale,
  }
}

test('clamps zoom to the supported range', () => {
  assert.equal(clampZoom(0.2), ZOOM_MIN)
  assert.equal(clampZoom(2.5), 2.5)
  assert.equal(clampZoom(80), ZOOM_MAX)
  assert.equal(clampZoom(Number.NaN), ZOOM_MIN)
})

test('formats zoom percentages', () => {
  assert.equal(zoomPercent(1), '100%')
  assert.equal(zoomPercent(1.333), '133%')
  assert.equal(zoomPercent(999), '800%')
})

test('normalizes wheel line and page deltas', () => {
  assert.equal(wheelDeltaPixels({ deltaY: 10, deltaMode: 0 }), 10)
  assert.equal(wheelDeltaPixels({ deltaY: 2, deltaMode: 1 }), 32)
  assert.equal(wheelDeltaPixels({ deltaY: 2, deltaMode: 2 }), 1600)
})

test('wheel direction zooms in and out with bounded per-event factors', () => {
  assert.ok(wheelZoomFactor(-40) > 1)
  assert.ok(wheelZoomFactor(40) < 1)
  assert.equal(wheelZoomFactor(0), 1)
  assert.ok(wheelZoomFactor(-100000) <= 1.35)
  assert.ok(wheelZoomFactor(100000) >= 1 / 1.35)
})

test('zoom at a pointer keeps that diagram point under the cursor', () => {
  const viewport = { width: 100, height: 80 }
  const point = { x: 75, y: 20 }
  const before = { scale: 1, x: 10, y: -4 }
  const imagePoint = pointUnderState(point, before, viewport)
  const after = zoomAtPoint(before, 2, point, viewport)
  assert.equal(after.scale, 2)
  const screenX = viewport.width / 2 + after.scale * imagePoint.x + after.x
  const screenY = viewport.height / 2 + after.scale * imagePoint.y + after.y
  assert.ok(Math.abs(screenX - point.x) < 1e-9)
  assert.ok(Math.abs(screenY - point.y) < 1e-9)
})

test('zooming at the viewport center does not introduce translation', () => {
  const viewport = { width: 200, height: 100 }
  const after = zoomAtPoint(
    { scale: 1, x: 0, y: 0 },
    1.5,
    { x: 100, y: 50 },
    viewport,
  )
  assert.deepEqual(after, { scale: 1.5, x: 0, y: 0 })
})

test('returning to fit resets translation', () => {
  const after = zoomAtPoint(
    { scale: 1.2, x: 80, y: -20 },
    1 / 10,
    { x: 10, y: 10 },
    { width: 100, height: 100 },
  )
  assert.deepEqual(after, { scale: ZOOM_MIN, x: 0, y: 0 })
})

test('pans only when zoomed in', () => {
  assert.deepEqual(panBy({ scale: 1, x: 0, y: 0 }, 5, 5), { scale: 1, x: 0, y: 0 })
  assert.deepEqual(panBy({ scale: 2, x: 3, y: 4 }, 5, -2), { scale: 2, x: 8, y: 2 })
})

test('center zoom helper changes only scale at center', () => {
  assert.deepEqual(zoomCentered(1, 1.25), { scale: 1.25, x: 0, y: 0 })
})
