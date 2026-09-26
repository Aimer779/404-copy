import { rowCount } from './grid.mjs'

export const RECIPE_TOOL = 'ascii-gif'
export const RECIPE_VERSION = 1

const MODULES = ['composite.mjs', 'grid.mjs', 'player.mjs', 'recipe.mjs', 'mount.mjs']

export function recipeFileName(sourceName) {
  const base = String(sourceName || 'ascii')
    .replace(/\.[^.]+$/, '')
    .replace(/-ascii$/i, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim() || 'ascii'
  return `${base}-ascii.json`
}

export function bytesToBase64(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (typeof Buffer !== 'undefined') return Buffer.from(buffer).toString('base64')
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(text) {
  if (typeof text !== 'string' || !text) throw new Error('Recipe frame is missing coverage.')
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'))
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function hasBakedFrames(recipe) {
  return Array.isArray(recipe?.clip?.frames) && recipe.clip.frames.length > 0
}

export function buildRecipe({ clip, look, sourceName = '' }) {
  if (!clip?.frames?.length) throw new Error('Nothing to export.')
  const columns = Math.max(8, Math.min(400, Math.round(Number(look.columns) || 110)))
  const charAspect = Number(look.charAspect) > 0 ? Number(look.charAspect) : 0.5
  const box = clip.content ?? { width: clip.pixelColumns, height: clip.pixelRows }
  const rows = rowCount(box.width, box.height, columns, charAspect)
  const aspect = Number(((columns * charAspect) / rows).toFixed(6))
  const gifName = sourceName || ''
  return {
    tool: RECIPE_TOOL,
    version: RECIPE_VERSION,
    source: {
      name: gifName,
      kind: 'gif',
      width: clip.width,
      height: clip.height,
      frameCount: clip.frames.length,
      duration: clip.duration,
    },
    look: {
      columns,
      rows,
      font: look.font || 'ui-monospace, monospace',
      fontId: look.fontId || '',
      charAspect,
      color: look.color || '#000013',
      mass: look.mass || '#f3f3f3',
      massId: look.massId || '',
      gain: look.gain ?? 1,
      ink: look.ink || 'auto',
      floor: look.floor ?? 18,
      pixelColumns: clip.pixelColumns,
      aspect,
      glyphs: look.glyphs || 'binary',
    },
    handoff: {
      entry: 'mount.mjs',
      mount: 'mountAsciiGif',
      gif: gifName || 'user.gif',
      modules: MODULES,
      vendor: 'vendor/gifuct.mjs',
      note: 'Give ascii-gif the original GIF and this recipe. Decode the GIF with the tool and play it with look.',
    },
  }
}

export function parseRecipe(input) {
  const data = asObject(input)
  if (data.tool !== RECIPE_TOOL) throw new Error('Not an ascii-gif recipe.')
  if (data.version !== RECIPE_VERSION) throw new Error(`Unsupported recipe version: ${data.version}`)
  const look = data.look
  if (!look || !Number.isFinite(look.columns)) throw new Error('Recipe is missing columns.')
  if (!(look.charAspect > 0)) throw new Error('Recipe is missing character aspect.')
  if (hasBakedFrames(data)) {
    for (const frame of data.clip.frames) {
      if (!Number.isFinite(frame.delay) || frame.delay < 0) throw new Error('Invalid frame delay.')
      if (typeof frame.coverage !== 'string' || !frame.coverage) throw new Error('Recipe frame is missing coverage.')
    }
  }
  return data
}

export function hydrateRecipe(input) {
  const parsed = parseRecipe(input)
  if (!hasBakedFrames(parsed)) throw new Error('This recipe has no baked frames. The original GIF is required.')
  const size = parsed.look.columns * parsed.look.rows
  return {
    ...parsed,
    clip: {
      ...parsed.clip,
      frames: parsed.clip.frames.map((frame) => {
        const coverage = base64ToBytes(frame.coverage)
        if (coverage.length !== size) {
          throw new Error(`Recipe frame size is not ${parsed.look.columns}×${parsed.look.rows}.`)
        }
        return { delay: frame.delay, coverage }
      }),
    },
  }
}

export function recipeClip(recipe) {
  const frames = recipe.clip.frames.map((frame) => ({ delay: frame.delay }))
  const duration = recipe.clip.duration || frames.reduce((sum, frame) => sum + frame.delay, 0)
  return { frames, duration }
}

export function retuneRecipe(recipe, look) {
  const parsed = parseRecipe(recipe)
  return {
    ...parsed,
    look: {
      ...parsed.look,
      font: look.font ?? parsed.look.font,
      fontId: look.fontId ?? parsed.look.fontId,
      color: look.color ?? parsed.look.color,
      mass: look.mass ?? parsed.look.mass,
      massId: look.massId ?? parsed.look.massId,
      gain: look.gain ?? parsed.look.gain,
      columns: look.columns ?? parsed.look.columns,
      glyphs: look.glyphs ?? parsed.look.glyphs,
    },
  }
}

export function agentPrompt(recipe, fileName) {
  const parsed = parseRecipe(recipe)
  const look = parsed.look
  const name = fileName || recipeFileName(parsed.source?.name)
  const gifName = parsed.source?.name || parsed.handoff?.gif || 'user.gif'
  return `Mount this GIF as an ASCII animation on the current site.

You need all three:
1. The original GIF (${gifName})
2. This recipe JSON (${name})
3. The ascii-gif tool: the src/ directory and vendor/gifuct.mjs

Do not write a new ASCII renderer. Do not bake pixel grids into JSON. Decode the GIF with this tool and play it with the recipe look.

Recipe: ascii-gif v${parsed.version}
Source: ${gifName}, ${parsed.source?.width || '?'}×${parsed.source?.height || '?'}, ${parsed.source?.frameCount || '?'} frames
Grid: ${look.columns} columns × ${look.rows} rows
Font: ${look.font}
Glyphs: ${look.glyphs || 'binary'}
Ink: ${look.color}
Mass: ${look.mass}
Character aspect: ${look.charAspect}

Steps:
1. Copy ascii-gif src/ and vendor/gifuct.mjs into the site.
2. Place ${gifName} and ${name} where the page can fetch them.
3. Give the host an explicit size or aspect-ratio. Recommended aspect-ratio: ${look.aspect}.
4. Call:

\`\`\`js
import { mountAsciiGif } from './ascii-gif/mount.mjs'

const recipe = await fetch('./${name}').then((r) => r.json())
mountAsciiGif(document.querySelector('#ascii-slot'), './${gifName}', recipe)
\`\`\`

5. look.color and look.mass may use the site's resolved color values.
6. Pass columns, font, charAspect, and glyphs from the recipe. To resample, go back to the demo, adjust, and export again.
7. If the font is not a system font, load the same font file before mounting.
`
}

function asObject(input) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      throw new Error('Recipe is not valid JSON.')
    }
  }
  if (!input || typeof input !== 'object') throw new Error('Invalid recipe format.')
  return input
}
