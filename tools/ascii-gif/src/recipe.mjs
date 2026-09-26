import { coverageGrid } from './grid.mjs'

export const RECIPE_TOOL = 'ascii-gif'
export const RECIPE_VERSION = 1

const MODULES = ['grid.mjs', 'player.mjs', 'recipe.mjs', 'mount.mjs']

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

export function buildRecipe({ clip, look, sourceName = '' }) {
  if (!clip?.frames?.length) throw new Error('没有可导出的画面。')
  const columns = Math.max(8, Math.min(400, Math.round(Number(look.columns) || 110)))
  const charAspect = Number(look.charAspect) > 0 ? Number(look.charAspect) : 0.5
  const ink = look.ink || 'auto'
  const floor = look.floor ?? 18
  const frames = []
  let rows = 1
  for (let i = 0; i < clip.frames.length; i++) {
    const grid = coverageGrid(clip, i, { columns, charAspect, ink, floor })
    rows = grid.rows
    frames.push({
      delay: clip.frames[i].delay,
      coverage: bytesToBase64(grid.coverage),
    })
  }
  const aspect = Number(((columns * charAspect) / rows).toFixed(6))
  return {
    tool: RECIPE_TOOL,
    version: RECIPE_VERSION,
    source: { name: sourceName || '' },
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
      ink,
      floor,
      aspect,
    },
    clip: {
      width: clip.width,
      height: clip.height,
      duration: clip.duration,
      frames,
    },
    handoff: {
      entry: 'mount.mjs',
      modules: MODULES,
      note: '播放配方不需要 GIF 解码器。不要改 clip.frames。',
    },
  }
}

export function parseRecipe(input) {
  const data = asObject(input)
  if (data.tool !== RECIPE_TOOL) throw new Error('不是 ascii-gif 配方。')
  if (data.version !== RECIPE_VERSION) throw new Error(`不支持的配方版本：${data.version}`)
  const look = data.look
  if (!look || !Number.isFinite(look.columns) || !Number.isFinite(look.rows)) {
    throw new Error('配方缺少列数或行数。')
  }
  if (!(look.charAspect > 0)) throw new Error('配方缺少字符宽高比。')
  const frames = data.clip?.frames
  if (!Array.isArray(frames) || !frames.length) throw new Error('配方里没有帧。')
  for (const frame of frames) {
    if (!Number.isFinite(frame.delay) || frame.delay < 0) throw new Error('配方帧时长无效。')
    if (typeof frame.coverage !== 'string' || !frame.coverage) throw new Error('配方帧缺少 coverage。')
  }
  return data
}

export function hydrateRecipe(input) {
  const parsed = parseRecipe(input)
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
    },
  }
}

export function agentPrompt(recipe, fileName) {
  const parsed = parseRecipe(recipe)
  const look = parsed.look
  const name = fileName || recipeFileName(parsed.source?.name)
  return `把这份 ASCII 动画装进当前站点。

不要重写转换，也不要另写 ASCII 渲染器。使用 ascii-gif 的 mountAsciiRecipe 挂载配方文件。

配方文件：${name}
工具：ascii-gif 配方版本 ${parsed.version}
来源：${parsed.source?.name || 'unknown'}
画面：${look.columns} 列 × ${look.rows} 行
字体：${look.font}
墨色：${look.color}
底色：${look.mass}
时长：${parsed.clip.duration} ms，${parsed.clip.frames.length} 帧
字符宽高比：${look.charAspect}

步骤：
1. 将下列模块拷到站点里（播放配方不需要 GIF 解码器，也不需要 vendor/gifuct.mjs）：
   ${MODULES.join('、')}
   入口是 mount.mjs。
2. 把 ${name} 放到页面能 fetch 到的位置。
3. 在目标位置放一个有明确宽高或 aspect-ratio 的容器。推荐 aspect-ratio: ${look.aspect}。
4. 调用：

\`\`\`js
import { mountAsciiRecipe } from './ascii-gif/mount.mjs'

const recipe = await fetch('./${name}').then((r) => r.json())
mountAsciiRecipe(document.querySelector('#ascii-slot'), recipe)
\`\`\`

5. look.color 和 look.mass 可以改成站点里的实色值。不要改 clip.frames。
6. 列数已经烤进配方。要改取样，回到 ASCII GIF 演示台导入原 GIF 后重新导出。
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
