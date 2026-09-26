import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GLYPH_SETS, glyphSet, rampIndex } from '../src/glyphs.mjs'

test('default glyph set stays 01', () => {
  assert.equal(glyphSet('missing').id, 'binary')
  assert.equal(GLYPH_SETS.binary.chars, '01')
  assert.equal(GLYPH_SETS.ascii.chars, '@%#*+=-:. ')
})

test('ramp maps heavy coverage to denser glyphs and light coverage to space', () => {
  const ascii = glyphSet('ascii')
  assert.equal(ascii.chars[rampIndex(255, ascii)], '@')
  assert.equal(rampIndex(0, ascii), -1)
  assert.equal(glyphSet('block').chars[rampIndex(240, glyphSet('block'))], '█')
  assert.equal(glyphSet('braille').chars[rampIndex(255, glyphSet('braille'))], '⣿')
})
