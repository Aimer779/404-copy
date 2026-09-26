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
  if (typeof text !== 'string' || !text) throw new Error('配方帧缺少 coverage。')
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
  if (!clip?.frames?.length) throw new Error('没有可导出的画面。')
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
    },
    handoff: {
      entry: 'mount.mjs',
      mount: 'mountAsciiGif',
      gif: gifName || 'user.gif',
      modules: MODULES,
      vendor: 'vendor/gifuct.mjs',
      note: '把用户的 GIF 和这份配方一起交给 ascii-gif。用工具解码 GIF，按 look 播放。',
    },
  }
}

export function parseRecipe(input) {
  const data = asObject(input)
  if (data.tool !== RECIPE_TOOL) throw new Error('不是 ascii-gif 配方。')
  if (data.version !== RECIPE_VERSION) throw new Error(`不支持的配方版本：${data.version}`)
  const look = data.look
  if (!look || !Number.isFinite(look.columns)) throw new Error('配方缺少列数。')
  if (!(look.charAspect > 0)) throw new Error('配方缺少字符宽高比。')
  if (hasBakedFrames(data)) {
    for (const frame of data.clip.frames) {
      if (!Number.isFinite(frame.delay) || frame.delay < 0) throw new Error('配方帧时长无效。')
      if (typeof frame.coverage !== 'string' || !frame.coverage) throw new Error('配方帧缺少 coverage。')
    }
  }
  return data
}

export function hydrateRecipe(input) {
  const parsed = parseRecipe(input)
  if (!hasBakedFrames(parsed)) throw new Error('这份配方没有烘焙帧，需要原 GIF。')
  const size = parsed.look.columns * parsed.look.rows
  return {
    ...parsed,
    clip: {
      ...parsed.clip,
      frames: parsed.clip.frames.map((frame) => {
        const coverage = base64ToBytes(frame.coverage)
        if (coverage.length !== size) {
          throw new Error(`配方帧尺寸不是 ${parsed.look.columns}×${parsed.look.rows}。`)
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
    },
  }
}

export function agentPrompt(recipe, fileName) {
  const parsed = parseRecipe(recipe)
  const look = parsed.look
  const name = fileName || recipeFileName(parsed.source?.name)
  const gifName = parsed.source?.name || parsed.handoff?.gif || 'user.gif'
  return `把用户上传的 GIF 做成 ASCII 动画，装进当前站点。

必须同时拿到三样东西：
1. 用户的原 GIF（${gifName}）
2. 这份配方 JSON（${name}）
3. ascii-gif 工具：src 目录和 vendor/gifuct.mjs

不要另写 ASCII 渲染器，不要把像素网格写进 JSON。用工具解码 GIF，按配方的 look 播放。

配方：ascii-gif v${parsed.version}
来源：${gifName}，${parsed.source?.width || '?'}×${parsed.source?.height || '?'}，${parsed.source?.frameCount || '?'} 帧
画面：${look.columns} 列 × ${look.rows} 行
字体：${look.font}
墨色：${look.color}
底色：${look.mass}
字符宽高比：${look.charAspect}

步骤：
1. 把 ascii-gif 的 src/ 和 vendor/gifuct.mjs 拷到站点里。
2. 把 ${gifName} 和 ${name} 放到页面能 fetch 到的位置。
3. 容器要有明确宽高或 aspect-ratio。推荐 aspect-ratio: ${look.aspect}。
4. 调用：

\`\`\`js
import { mountAsciiGif } from './ascii-gif/mount.mjs'

const recipe = await fetch('./${name}').then((r) => r.json())
mountAsciiGif(document.querySelector('#ascii-slot'), './${gifName}', recipe)
\`\`\`

5. look.color 和 look.mass 可以改成站点里的实色值。
6. 列数、字体、charAspect 按配方传给播放器。要改取样，回到演示台调，再导出配方。
7. 若字体不是系统字体，在页面里加载同一字体文件后再挂载。
`
}

function asObject(input) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      throw new Error('配方不是有效的 JSON。')
    }
  }
  if (!input || typeof input !== 'object') throw new Error('配方格式无效。')
  return input
}
