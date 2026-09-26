import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeAsciiClip } from '../src/index.mjs'
import {
  agentPrompt,
  buildRecipe,
  hasBakedFrames,
  hydrateRecipe,
  parseRecipe,
  recipeFileName,
  retuneRecipe,
} from '../src/recipe.mjs'

const fixtures = new URL('../fixtures/', import.meta.url)

function look(overrides = {}) {
  return {
    columns: 24,
    charAspect: 0.5,
    font: 'Consolas, ui-monospace, monospace',
    fontId: 'consolas',
    color: '#112233',
    mass: '#f3f3f3',
    massId: 'light',
    ink: 'auto',
    floor: 18,
    gain: 1,
    ...overrides,
  }
}

test('recipe file names keep the source stem', () => {
  assert.equal(recipeFileName('bust.gif'), 'bust-ascii.json')
  assert.equal(recipeFileName('bust-ascii.json'), 'bust-ascii.json')
})

test('a GIF clip exports a small look recipe without pixel grids', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  assert.equal(recipe.tool, 'ascii-gif')
  assert.equal(recipe.version, 1)
  assert.equal(recipe.source.name, 'disposal.gif')
  assert.equal(recipe.source.kind, 'gif')
  assert.equal(recipe.source.frameCount, clip.frames.length)
  assert.equal(recipe.look.columns, 24)
  assert.equal(recipe.handoff.mount, 'mountAsciiGif')
  assert.equal(hasBakedFrames(recipe), false)
  assert.equal(recipe.clip?.frames, undefined)

  const json = JSON.stringify(recipe, null, 2)
  assert.ok(json.length < 2000, `recipe too large: ${json.length}`)
  assert.equal(json.includes('coverage'), false)
  assert.doesNotMatch(json, /AAAAAAA/)

  const parsed = parseRecipe(json)
  assert.equal(parsed.look.color, '#112233')
  assert.equal(parsed.look.columns, 24)
  assert.throws(() => hydrateRecipe(parsed), /需要原 GIF/)
})

test('retune updates play-time color', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  const next = retuneRecipe(recipe, { color: '#ff00aa', mass: '#000013', massId: 'dark' })
  assert.equal(next.look.color, '#ff00aa')
  assert.equal(next.look.massId, 'dark')
  assert.equal(next.look.columns, 24)
})

test('agent prompt asks for the GIF and mountAsciiGif', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  const text = agentPrompt(recipe, 'disposal-ascii.json')
  assert.match(text, /mountAsciiGif/)
  assert.match(text, /disposal-ascii\.json/)
  assert.match(text, /disposal\.gif/)
  assert.match(text, /原 GIF/)
  assert.doesNotMatch(text, /clip\.frames/)
})

test('invalid recipes are rejected', () => {
  assert.throws(() => parseRecipe('{"tool":"nope"}'), /不是 ascii-gif 配方/)
  assert.throws(() => parseRecipe({ tool: 'ascii-gif', version: 2 }), /不支持的配方版本/)
  assert.throws(() => hydrateRecipe({
    tool: 'ascii-gif',
    version: 1,
    look: { columns: 2, rows: 2, charAspect: 0.5 },
    clip: { frames: [{ delay: 100, coverage: 'AQID' }] },
  }), /配方帧尺寸/)
})
