import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeAsciiClip } from '../src/index.mjs'
import {
  agentPrompt,
  buildRecipe,
  hydrateRecipe,
  parseRecipe,
  recipeClip,
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

test('a GIF clip bakes into a recipe that round-trips through JSON', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  assert.equal(recipe.tool, 'ascii-gif')
  assert.equal(recipe.version, 1)
  assert.equal(recipe.source.name, 'disposal.gif')
  assert.equal(recipe.look.columns, 24)
  assert.equal(recipe.clip.frames.length, clip.frames.length)
  assert.equal(recipe.clip.duration, clip.duration)
  assert.equal(recipe.handoff.entry, 'mount.mjs')

  const json = JSON.stringify(recipe)
  const parsed = parseRecipe(json)
  const hydrated = hydrateRecipe(parsed)
  assert.equal(hydrated.look.rows, recipe.look.rows)
  assert.equal(hydrated.clip.frames[0].coverage.length, recipe.look.columns * recipe.look.rows)
  assert.equal(hydrated.clip.frames[0].delay, clip.frames[0].delay)
  assert.ok(hydrated.clip.frames.some((frame) => frame.coverage.some((value) => value > 0)))

  const mini = recipeClip(hydrated)
  assert.equal(mini.frames.length, clip.frames.length)
  assert.equal(mini.duration, clip.duration)
})

test('retune keeps baked frames and updates play-time color', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  const next = retuneRecipe(recipe, { color: '#ff00aa', mass: '#000013', massId: 'dark' })
  assert.equal(next.look.color, '#ff00aa')
  assert.equal(next.look.massId, 'dark')
  assert.equal(next.look.columns, 24)
  assert.equal(next.clip.frames[0].coverage, recipe.clip.frames[0].coverage)
})

test('agent prompt names the recipe file and mount entry', () => {
  const clip = decodeAsciiClip(readFileSync(new URL('disposal.gif', fixtures)))
  const recipe = buildRecipe({ clip, look: look(), sourceName: 'disposal.gif' })
  const text = agentPrompt(recipe, 'disposal-ascii.json')
  assert.match(text, /mountAsciiRecipe/)
  assert.match(text, /disposal-ascii\.json/)
  assert.match(text, /不要改 clip\.frames/)
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
