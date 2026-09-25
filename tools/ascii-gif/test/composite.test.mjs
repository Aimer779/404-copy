import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { compositeFrames, coverageGrid, decodeAsciiClip, frameAt, inkValue, rowCount } from '../src/index.mjs'

const fixtures = new URL('../fixtures/', import.meta.url)

function patch(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0]
    data[i * 4 + 1] = fill[1]
    data[i * 4 + 2] = fill[2]
    data[i * 4 + 3] = fill[3]
  }
  return data
}

function pixel(screen, width, x, y) {
  const i = (y * width + x) * 4
  return [screen[i], screen[i + 1], screen[i + 2], screen[i + 3]]
}

test('transparent patch pixels do not erase, and disposal restores background or the previous screen', () => {
  const background = { index: 0, rgba: [255, 255, 255, 255] }
  const red = patch(2, 2, [255, 0, 0, 255])
  red[15] = 0
  const screens = []
  compositeFrames({
    width: 2,
    height: 2,
    background,
    frames: [
      { dims: { left: 0, top: 0, width: 2, height: 2 }, disposalType: 1, patch: patch(2, 2, [0, 0, 0, 255]) },
      { dims: { left: 0, top: 0, width: 2, height: 2 }, disposalType: 2, patch: red, transparentIndex: 8 },
      { dims: { left: 1, top: 1, width: 1, height: 1 }, disposalType: 3, patch: patch(1, 1, [0, 0, 255, 255]) },
      { dims: { left: 0, top: 0, width: 1, height: 1 }, disposalType: 1, patch: patch(1, 1, [0, 255, 0, 255]) },
    ],
    visit: screen => screens.push(new Uint8ClampedArray(screen)),
  })
  assert.deepEqual(pixel(screens[1], 2, 0, 0), [255, 0, 0, 255])
  assert.deepEqual(pixel(screens[1], 2, 1, 1), [0, 0, 0, 255])
  assert.deepEqual(pixel(screens[2], 2, 0, 0), [0, 0, 0, 0])
  assert.deepEqual(pixel(screens[2], 2, 1, 1), [0, 0, 255, 255])
  assert.deepEqual(pixel(screens[3], 2, 0, 0), [0, 255, 0, 255])
  assert.deepEqual(pixel(screens[3], 2, 1, 1), [0, 0, 0, 0])
})

test('disposal 2 erases a transparent patch instead of leaving the background color', () => {
  const screens = []
  compositeFrames({
    width: 4,
    height: 4,
    background: { index: 0, rgba: [0, 0, 0, 255] },
    frames: [
      {
        dims: { left: 1, top: 1, width: 2, height: 2 },
        disposalType: 2,
        transparentIndex: 3,
        patch: patch(2, 2, [210, 210, 210, 255]),
      },
      {
        dims: { left: 0, top: 0, width: 1, height: 1 },
        disposalType: 1,
        transparentIndex: 4,
        patch: patch(1, 1, [255, 0, 0, 255]),
      },
    ],
    visit: screen => screens.push(new Uint8ClampedArray(screen)),
  })
  assert.equal(pixel(screens[0], 4, 1, 1)[3], 255)
  assert.deepEqual(pixel(screens[1], 4, 1, 1), [0, 0, 0, 0])
  assert.deepEqual(pixel(screens[1], 4, 2, 2), [0, 0, 0, 0])
  assert.deepEqual(pixel(screens[1], 4, 0, 0), [255, 0, 0, 255])
})

test('a missing patch is rejected instead of reading color indexes as RGBA', () => {
  assert.throws(() => compositeFrames({
    width: 1,
    height: 1,
    background: { index: 0, rgba: [0, 0, 0, 255] },
    frames: [{ dims: { left: 0, top: 0, width: 1, height: 1 }, pixels: [1] }],
  }), /patch/)
})

test('disposal fixture round-trips through gifuct and keeps partial frames', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  assert.equal(clip.width, 6)
  assert.equal(clip.height, 4)
  assert.equal(clip.frames.length, 5)
  assert.deepEqual(clip.frames[1].dims, { left: 2, top: 1, width: 2, height: 2 })
  assert.equal(clip.frames[3].disposalType, 3)
  assert.equal(clip.duration, 500)
  assert.equal(frameAt(clip, 0), 0)
  assert.equal(frameAt(clip, 100), 1)
  assert.equal(frameAt(clip, 499), 4)
  assert.equal(frameAt(clip, 500), 0)

  const at = (frame, x, y) => {
    const cell = clip.frames[frame]
    const i = y * clip.pixelColumns + x
    return [cell.luma[i], cell.alpha[i]]
  }
  assert.deepEqual(at(0, 0, 0), [255, 255])
  assert.deepEqual(at(0, 1, 0), [0, 255])
  assert.deepEqual(at(0, 5, 3), [0, 255])
  assert.deepEqual(at(1, 2, 1), [54, 255])
  assert.deepEqual(at(1, 3, 2), [0, 255])
  assert.deepEqual(at(2, 2, 1), [0, 0])
  assert.deepEqual(at(2, 0, 1), [18, 255])
  assert.deepEqual(at(3, 5, 0), [54, 255])
  assert.deepEqual(at(4, 5, 0), [0, 255])
  assert.deepEqual(at(4, 5, 3), [18, 255])
  assert.ok(clip.bytes < clip.width * clip.height * 4 * clip.frames.length)
})

test('bust frames stay incremental and the head survives sampling', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('bust.gif', fixtures)))
  assert.equal(clip.frames.length, 10)
  assert.equal(clip.duration, 1200)
  assert.equal(clip.frames[0].dims.width, 180)
  assert.ok(clip.frames.slice(1).some(frame => frame.dims.width < 180))
  assert.ok(clip.paper.luma > 200)
  assert.equal(rowCount(clip.pixelColumns, clip.pixelRows, 90, 0.5), 60)
  const grid = coverageGrid(clip, 0, { columns: 90, charAspect: 0.5, ink: 'auto', floor: 18 })
  assert.equal(grid.coverage[0], 0)
  assert.ok(grid.coverage[12 * 90 + 45] > 180)
  assert.equal(clip.bytes, 180 * 240 * 2 * 10)
})

test('a dark eye stays darker than the light body after grayscale stretch', () => {
  const width = 12
  const height = 12
  const luma = new Uint8Array(width * height)
  const alpha = new Uint8Array(width * height)
  for (let y = 2; y < 10; y++) {
    for (let x = 3; x < 9; x++) {
      luma[y * width + x] = 180
      alpha[y * width + x] = 255
    }
  }
  for (let y = 3; y < 5; y++) {
    for (let x = 4; x < 6; x++) {
      luma[y * width + x] = 12
      alpha[y * width + x] = 255
    }
  }
  const clip = {
    pixelColumns: width,
    pixelRows: height,
    paper: { luma: 255, transparent: true },
    content: { x: 0, y: 0, width, height },
    frames: [{ luma, alpha }],
  }
  const grid = coverageGrid(clip, 0, { columns: 12, charAspect: 1, floor: 18 })
  const eye = grid.coverage[4 * 12 + 4]
  const body = grid.coverage[8 * 12 + 6]
  assert.equal(grid.coverage[0], 0)
  assert.ok(body > 40, `body ${body}`)
  assert.ok(eye > body + 50, `eye ${eye} body ${body}`)
})

test('ink follows contrast and glyph choice stays put', () => {
  assert.equal(inkValue(255, 255, 255, 'auto', 18), 0)
  assert.equal(inkValue(0, 255, 255, 'auto', 18), 255)
  assert.equal(inkValue(0, 0, 255, 'auto', 18), 0)
  assert.equal(inkValue(255, 255, 0, 'light', 18), 255)
})
