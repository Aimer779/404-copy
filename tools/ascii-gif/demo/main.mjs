import { AsciiPlayer, decodeAsciiClip, frameAt, loadAsciiClip, measureCharAspect } from '../src/index.mjs'
import {
  agentPrompt,
  buildRecipe,
  hydrateRecipe,
  parseRecipe,
  recipeClip,
  recipeFileName,
  retuneRecipe,
} from '../src/recipe.mjs'

const gray = document.querySelector('#gray')
const ascii = document.querySelector('#ascii')
const stage = document.querySelector('#stage')
const columnsInput = document.querySelector('#columns')
const frameInput = document.querySelector('#frame')
const colorInput = document.querySelector('#color')
const fontSelect = document.querySelector('#font')
const fonts = {
  consolas: 'Consolas, ui-monospace, monospace',
  cascadia: '"Cascadia Mono", Consolas, ui-monospace, monospace',
  courier: '"Courier New", ui-monospace, monospace',
  lucida: '"Lucida Console", ui-monospace, monospace',
  vt323: '"VT323", ui-monospace, monospace',
}
const pauseButton = document.querySelector('#pause')
const status = document.querySelector('#status')
const grayCtx = gray.getContext('2d')
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

const themes = {
  light: { mass: '#f3f3f3', ink: '#000013' },
  dark: { mass: '#000013', ink: '#f3f3f3' },
}
let theme = themes.light
let clip = null
let recipe = null
let player = null
let sourceName = ''
let sourceKind = 'gif'
let statusNote = ''
let gifTime = 0
let last = performance.now()
let paused = reduced.matches
let scrubbing = false
let noteTimer = 0

function flashStatus(message) {
  statusNote = message
  status.textContent = message
  window.clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => {
    if (statusNote === message) statusNote = ''
  }, 2400)
}

function currentFont() {
  return fonts[fontSelect.value] || fonts.consolas
}

function playTimeLook() {
  return {
    font: currentFont(),
    fontId: fontSelect.value,
    color: colorInput.value,
    mass: theme.mass,
    massId: theme === themes.dark ? 'dark' : 'light',
    gain: 1,
  }
}

function currentLook() {
  return {
    columns: Number(columnsInput.value),
    charAspect: player?.charAspect || measureCharAspect(currentFont()),
    ink: 'auto',
    floor: 18,
    ...playTimeLook(),
  }
}

function snapshotRecipe() {
  if (clip) return buildRecipe({ clip, look: currentLook(), sourceName })
  if (recipe) return retuneRecipe(recipe, playTimeLook())
  throw new Error('没有可导出的画面。')
}

async function applyFont() {
  if (fontSelect.value === 'vt323') await document.fonts.load('100px VT323')
  if (!player) return
  if (clip) player.setFont(currentFont())
  else player.setFont(currentFont(), player.charAspect)
}

function applyTheme(next) {
  theme = next
  stage.style.background = theme.mass
  colorInput.value = theme.ink
  document.querySelector('#light-mass').classList.toggle('is-on', next === themes.light)
  document.querySelector('#dark-mass').classList.toggle('is-on', next === themes.dark)
}

function applyLook(look) {
  if (look.massId === 'dark' || look.mass === themes.dark.mass) applyTheme(themes.dark)
  else applyTheme(themes.light)
  if (look.mass) stage.style.background = look.mass
  if (look.color) colorInput.value = look.color
  if (look.fontId && fonts[look.fontId]) fontSelect.value = look.fontId
  if (look.columns) columnsInput.value = String(look.columns)
}

function drawGray(frame) {
  const box = clip.content ?? { x: 0, y: 0, width: clip.pixelColumns, height: clip.pixelRows }
  if (gray.width !== box.width || gray.height !== box.height) {
    gray.width = box.width
    gray.height = box.height
  }
  const image = grayCtx.createImageData(box.width, box.height)
  for (let y = 0; y < box.height; y++) {
    for (let x = 0; x < box.width; x++) {
      const source = (box.y + y) * clip.pixelColumns + box.x + x
      const dest = (y * box.width + x) * 4
      const luma = frame.luma[source]
      image.data[dest] = luma
      image.data[dest + 1] = luma
      image.data[dest + 2] = luma
      image.data[dest + 3] = frame.alpha[source]
    }
  }
  grayCtx.putImageData(image, 0, 0)
}

function drawGrayCoverage(grid) {
  if (gray.width !== grid.columns || gray.height !== grid.rows) {
    gray.width = grid.columns
    gray.height = grid.rows
  }
  const image = grayCtx.createImageData(grid.columns, grid.rows)
  for (let i = 0; i < grid.coverage.length; i++) {
    const value = grid.coverage[i]
    const dest = i * 4
    image.data[dest] = value
    image.data[dest + 1] = value
    image.data[dest + 2] = value
    image.data[dest + 3] = value > 0 ? 255 : 0
  }
  grayCtx.putImageData(image, 0, 0)
}

function downloadBlob(name, blob) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function exportPng() {
  if (!ascii.width || !ascii.height) return
  const sheet = document.createElement('canvas')
  sheet.width = ascii.width
  sheet.height = ascii.height
  const ctx = sheet.getContext('2d')
  ctx.fillStyle = getComputedStyle(stage).backgroundColor
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  ctx.drawImage(ascii, 0, 0)
  sheet.toBlob((blob) => {
    if (!blob) return
    const base = (sourceName || 'ascii').replace(/\.[^.]+$/, '')
    downloadBlob(`${base}-ascii.png`, blob)
  }, 'image/png')
}

function exportRecipeFile() {
  const next = snapshotRecipe()
  const name = recipeFileName(sourceName || next.source?.name)
  downloadBlob(name, new Blob([JSON.stringify(next)], { type: 'application/json' }))
  return { next, name }
}

async function copyAgentPrompt() {
  const { next, name } = exportRecipeFile()
  const text = agentPrompt(next, name)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
  return name
}

function timeForFrame(index) {
  const frames = clip?.frames || recipe?.clip.frames || []
  let time = 0
  for (let i = 0; i < index; i++) time += frames[i].delay
  return time
}

function activeClip() {
  if (clip) return clip
  if (recipe) return recipeClip(recipe)
  return null
}

function render() {
  const source = activeClip()
  if (!source || !player) return
  const index = frameAt(source, gifTime)
  if (clip) drawGray(clip.frames[index])
  else drawGrayCoverage(player.cells(index))
  player.sync({ time: gifTime, color: colorInput.value })
  const grid = player.grid()
  if (!scrubbing && frameInput.value !== String(index)) frameInput.value = String(index)
  document.querySelector('#columns-value').textContent = String(grid.columns)
  document.querySelector('#frame-value').textContent = `${index + 1}/${source.frames.length}`
  if (statusNote) {
    status.textContent = statusNote
    return
  }
  if (sourceKind === 'recipe') {
    status.textContent = `配方 ${sourceName} · 帧 ${index + 1}/${source.frames.length} · 本帧 ${source.frames[index].delay} ms · 列 ${grid.columns} × 行 ${grid.rows} · 已烘焙`
    return
  }
  const frame = clip.frames[index]
  const partial = clip.frames.filter(item => item.dims.width < clip.width || item.dims.height < clip.height).length
  const stored = clip.bytes < 1024 ? `${clip.bytes} B` : `${Math.round(clip.bytes / 1024)} KB`
  status.textContent = `${sourceName} · 帧 ${index + 1}/${clip.frames.length} · 本帧 ${frame.delay} ms · 列 ${grid.columns} × 行 ${grid.rows} · 灰度 ${stored} · 素材 ${clip.width}×${clip.height} · 局部帧 ${partial}`
}

function resetClock(frameCount) {
  gifTime = 0
  frameInput.max = String(Math.max(0, frameCount - 1))
  frameInput.value = '0'
  paused = reduced.matches
  pauseButton.textContent = paused ? '继续' : '暂停'
}

function useClip(next, name) {
  clip = next
  recipe = null
  sourceKind = 'gif'
  sourceName = name
  statusNote = ''
  resetClock(clip.frames.length)
  const box = clip.content ?? { width: clip.width, height: clip.height }
  document.querySelector('.preview').style.aspectRatio = `${box.width} / ${box.height}`
  player = new AsciiPlayer(ascii, clip, {
    font: currentFont(),
    columns: Number(columnsInput.value),
    charAspect: measureCharAspect(currentFont()),
    color: colorInput.value,
  })
  render()
}

async function useRecipe(next, name) {
  recipe = parseRecipe(next)
  clip = null
  sourceKind = 'recipe'
  sourceName = name || recipe.source?.name || 'recipe.json'
  statusNote = ''
  applyLook(recipe.look)
  resetClock(recipe.clip.frames.length)
  document.querySelector('.preview').style.aspectRatio = String(recipe.look.aspect || 1)
  const hydrated = hydrateRecipe(recipe)
  player = new AsciiPlayer(ascii, recipeClip(hydrated), {
    font: currentFont(),
    columns: recipe.look.columns,
    charAspect: recipe.look.charAspect,
    color: colorInput.value,
    gain: recipe.look.gain,
  })
  player.setBaked(hydrated)
  await applyFont()
  render()
}

function tick(now) {
  if (player && activeClip() && !document.hidden) {
    if (!paused) gifTime += now - last
    render()
  }
  last = now
  requestAnimationFrame(tick)
}

columnsInput.addEventListener('input', () => {
  if (clip) {
    player?.setColumns(Number(columnsInput.value))
    return
  }
  if (recipe) {
    columnsInput.value = String(recipe.look.columns)
    statusNote = '列数已写入配方。要改取样，先导入原 GIF。'
  }
})
fontSelect.addEventListener('change', () => { applyFont() })
frameInput.addEventListener('pointerdown', () => { scrubbing = true })
frameInput.addEventListener('pointerup', () => { scrubbing = false })
frameInput.addEventListener('input', () => {
  paused = true
  pauseButton.textContent = '继续'
  gifTime = timeForFrame(Number(frameInput.value))
})
pauseButton.addEventListener('click', () => {
  paused = !paused
  pauseButton.textContent = paused ? '继续' : '暂停'
})
const gifFile = document.querySelector('#gif-file')
const recipeFile = document.querySelector('#recipe-file')
document.querySelector('#choose-gif').addEventListener('click', () => gifFile.click())
document.querySelector('#choose-recipe').addEventListener('click', () => recipeFile.click())
document.querySelector('#export-png').addEventListener('click', exportPng)
document.querySelector('#export-recipe').addEventListener('click', () => {
  try {
    const { name } = exportRecipeFile()
    flashStatus(`已导出 ${name}`)
  } catch (error) {
    statusNote = error.message
    status.textContent = statusNote
  }
})
document.querySelector('#copy-agent').addEventListener('click', async () => {
  try {
    const name = await copyAgentPrompt()
    flashStatus(`已复制说明，并下载 ${name}`)
  } catch (error) {
    statusNote = error.message
    status.textContent = statusNote
  }
})
gifFile.addEventListener('change', async () => {
  const file = gifFile.files?.[0]
  gifFile.value = ''
  if (!file) return
  statusNote = `正在转换 ${file.name}`
  status.textContent = statusNote
  try {
    const bytes = await file.arrayBuffer()
    statusNote = ''
    useClip(decodeAsciiClip(bytes), file.name)
  } catch (error) {
    statusNote = `${file.name} 无法转换：${error.message}`
    status.textContent = statusNote
  }
})
recipeFile.addEventListener('change', async () => {
  const file = recipeFile.files?.[0]
  recipeFile.value = ''
  if (!file) return
  statusNote = `正在读取 ${file.name}`
  status.textContent = statusNote
  try {
    const text = await file.text()
    await useRecipe(text, file.name)
  } catch (error) {
    statusNote = `${file.name} 无法导入：${error.message}`
    status.textContent = statusNote
  }
})
document.querySelector('#light-mass').addEventListener('click', () => applyTheme(themes.light))
document.querySelector('#dark-mass').addEventListener('click', () => applyTheme(themes.dark))
if (window.matchMedia('(max-width: 640px)').matches) columnsInput.value = '60'
if (paused) pauseButton.textContent = '继续'
applyTheme(theme)

const params = new URLSearchParams(location.search)
const recipeUrl = params.get('recipe')
const gifUrl = params.get('gif') || new URL('../fixtures/bust.gif', import.meta.url).href
try {
  await document.fonts.load('20px VT323')
  if (recipeUrl) {
    const response = await fetch(recipeUrl)
    if (!response.ok) throw new Error(`配方读取失败：${response.status}`)
    await useRecipe(await response.text(), recipeUrl.split('/').pop())
  } else {
    const initial = await loadAsciiClip(gifUrl)
    const initialName = params.get('gif') ? params.get('gif').split('/').pop() : 'bust.gif'
    useClip(initial, initialName)
  }
} catch (error) {
  status.textContent = error.message
}
requestAnimationFrame(tick)
