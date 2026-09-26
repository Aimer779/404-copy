import { decodeAsciiClip, loadAsciiClip } from '../src/composite.mjs'
import { frameAt } from '../src/grid.mjs'
import { AsciiPlayer, measureCharAspect } from '../src/player.mjs'
import {
  agentPrompt,
  buildRecipe,
  hasBakedFrames,
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
const glyphsSelect = document.querySelector('#glyphs')
const fonts = {
  consolas: 'Consolas, ui-monospace, monospace',
  cascadia: '"Cascadia Mono", Consolas, ui-monospace, monospace',
  courier: '"Courier New", ui-monospace, monospace',
  lucida: '"Lucida Console", ui-monospace, monospace',
  vt323: '"VT323", ui-monospace, monospace',
}
const pauseButton = document.querySelector('#pause')
const status = document.querySelector('#status')
const colorHex = document.querySelector('#color-hex')
const recipePanel = document.querySelector('#recipe-panel')
const recipeJson = document.querySelector('#recipe-json')
const recipeFileLabel = document.querySelector('#recipe-file-label')
const recipeNote = document.querySelector('#recipe-note')
const grayCtx = gray.getContext('2d')
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

const themes = {
  light: { mass: '#f3f3f3', ink: '#000013' },
  dark: { mass: '#000013', ink: '#f3f3f3' },
}
let theme = themes.dark
let clip = null
let recipe = null
let player = null
let sourceName = ''
let sourceKind = 'gif'
let statusNote = ''
let gifTime = 0
let last = performance.now()
let paused = true
let scrubbing = false
let noteTimer = 0
let editorTimer = 0
let panelFileName = 'ascii.json'
const TAGLINE = 'Turn a GIF into an ASCII animation.'

function flashStatus(message) {
  statusNote = message
  status.textContent = message
  window.clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => {
    if (statusNote === message) {
      statusNote = ''
      status.textContent = TAGLINE
    }
  }, 2400)
}

function setPaused(next) {
  paused = next
  const label = paused ? 'Play' : 'Pause'
  pauseButton.classList.toggle('is-paused', paused)
  pauseButton.setAttribute('aria-label', label)
  pauseButton.dataset.tooltip = label
}

function syncColorHex() {
  colorHex.textContent = colorInput.value.toUpperCase()
}

function currentFont() {
  return fonts[fontSelect.value] || fonts.consolas
}

function playTimeLook() {
  return {
    font: currentFont(),
    fontId: fontSelect.value,
    glyphs: glyphsSelect.value,
    color: colorInput.value,
    mass: theme.mass,
    massId: theme === themes.dark ? 'dark' : 'light',
    gain: 1,
  }
}

function currentLook() {
  return {
    columns: Number(columnsInput.value),
    charAspect: player?.charAspect || measureCharAspect(currentFont(), glyphsSelect.value === 'block' ? '█' : '0'),
    ink: 'auto',
    floor: 18,
    ...playTimeLook(),
  }
}

function snapshotRecipe() {
  if (clip) return buildRecipe({ clip, look: currentLook(), sourceName })
  if (recipe) return retuneRecipe(recipe, playTimeLook())
  throw new Error('Nothing to export.')
}

function prettyRecipe(data) {
  return JSON.stringify(data, null, 2)
}

function currentPanelName() {
  return recipeFileName(sourceName || 'ascii')
}

async function copyText(text) {
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
}

function flashPanelNote(message) {
  recipeNote.textContent = message
}

function applyEditorLook(next) {
  applyLook(next.look)
  if (!player) return
  player.color = next.look.color
  player.gain = next.look.gain ?? 1
  if (clip) player.setColumns(next.look.columns)
  if (next.look.glyphs) player.setGlyphs(next.look.glyphs)
}

function readEditorRecipe() {
  const text = recipeJson.value
  const parsed = JSON.parse(text)
  return parseRecipe(parsed)
}

function applyEditorText() {
  try {
    const next = readEditorRecipe()
    recipe = next
    applyEditorLook(next)
    if (!clip && player && hasBakedFrames(next)) {
      const hydrated = hydrateRecipe(next)
      player.clipData = recipeClip(hydrated)
      player.setBaked(hydrated)
    }
    flashPanelNote('')
    return next
  } catch (error) {
    flashPanelNote(error.message)
    return null
  }
}

function closeRecipePanel() {
  if (typeof recipePanel.close === 'function' && recipePanel.open) recipePanel.close()
  else recipePanel.removeAttribute('open')
}

function openRecipePanel() {
  const next = snapshotRecipe()
  panelFileName = currentPanelName()
  recipeFileLabel.textContent = panelFileName
  recipeJson.value = prettyRecipe(next)
  flashPanelNote('')
  if (typeof recipePanel.showModal === 'function') recipePanel.showModal()
  else recipePanel.setAttribute('open', '')
  recipeJson.focus()
  recipeJson.setSelectionRange(0, 0)
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
  syncColorHex()
  document.querySelector('#light-mass').classList.toggle('is-on', next === themes.light)
  document.querySelector('#dark-mass').classList.toggle('is-on', next === themes.dark)
}

function applyLook(look) {
  if (look.massId === 'dark' || look.mass === themes.dark.mass) applyTheme(themes.dark)
  else applyTheme(themes.light)
  if (look.mass) stage.style.background = look.mass
  if (look.color) {
    colorInput.value = look.color
    syncColorHex()
  }
  if (look.fontId && fonts[look.fontId]) fontSelect.value = look.fontId
  if (look.glyphs && glyphsSelect.querySelector(`[value="${look.glyphs}"]`)) {
    glyphsSelect.value = look.glyphs
    player?.setGlyphs(look.glyphs)
  }
  if (look.columns) columnsInput.value = String(look.columns)
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function randomRecipeLook() {
  const dark = Math.random() < 0.5
  const inks = dark
    ? ['#f3f3f3', '#ffe8a3', '#9ae6b4', '#90cdf4', '#fbd38d', '#feb2b2', '#e9d5ff']
    : ['#000013', '#171717', '#3d1f00', '#0b3d2e', '#1e1b4b', '#4a0e0e', '#14213d']
  return {
    columns: pick([56, 72, 88, 104, 110, 128, 144]),
    fontId: pick(Object.keys(fonts)),
    glyphs: pick([...glyphsSelect.options].map((option) => option.value)),
    massId: dark ? 'dark' : 'light',
    mass: dark ? themes.dark.mass : themes.light.mass,
    color: pick(inks),
  }
}

async function applyRandomRecipe() {
  if (!player) {
    flashStatus('Import a GIF first.')
    return
  }
  let look = randomRecipeLook()
  for (let i = 0; i < 8; i++) {
    const same = look.glyphs === glyphsSelect.value
      && look.columns === Number(columnsInput.value)
      && look.color === colorInput.value
      && look.fontId === fontSelect.value
    if (!same) break
    look = randomRecipeLook()
  }
  applyLook(look)
  await applyFont()
  if (clip) player.setColumns(look.columns)
  ascii.dataset.glyphs = look.glyphs
  render()
  flashStatus('Random recipe')
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

async function loadDefaultClip(url, isDefault) {
  if (isDefault && window.__defaultGif) {
    const response = await window.__defaultGif
    if (!response.ok) throw new Error(`GIF fetch failed: ${response.status}`)
    return decodeAsciiClip(await response.arrayBuffer())
  }
  return loadAsciiClip(url)
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

function exportRecipeFile(data) {
  const next = data || snapshotRecipe()
  const name = recipeFileName(sourceName || next.source?.name)
  downloadBlob(name, new Blob([prettyRecipe(next)], { type: 'application/json' }))
  return { next, name }
}

async function copyAgentPrompt() {
  const edited = recipePanel.open ? applyEditorText() : null
  const { next, name } = exportRecipeFile(edited || undefined)
  await copyText(agentPrompt(next, name))
  return name
}

function timeForFrame(index) {
  const frames = clip?.frames || recipe?.clip?.frames || []
  let time = 0
  for (let i = 0; i < index; i++) time += frames[i].delay
  return time
}

function activeClip() {
  if (clip) return clip
  if (hasBakedFrames(recipe)) return recipeClip(recipe)
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
  document.querySelector('#frame-value').textContent = `${index + 1} / ${source.frames.length}`
  document.querySelector('#source-file').textContent = sourceName
  document.querySelector('#source-frames').textContent = String(source.frames.length)
  document.querySelector('#source-grid').textContent = `${grid.columns}×${grid.rows}`
  if (!statusNote) status.textContent = TAGLINE
}

function resetClock(frameCount) {
  gifTime = 0
  frameInput.max = String(Math.max(0, frameCount - 1))
  frameInput.value = '0'
  setPaused(true)
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
    glyphs: glyphsSelect.value,
  })
  ascii.dataset.glyphs = glyphsSelect.value
  render()
}

async function useRecipe(next, name) {
  recipe = parseRecipe(next)
  sourceName = name || recipe.source?.name || 'recipe.json'
  statusNote = ''
  applyLook(recipe.look)
  if (hasBakedFrames(recipe)) {
    clip = null
    sourceKind = 'recipe'
    resetClock(recipe.clip.frames.length)
    document.querySelector('.preview').style.aspectRatio = String(recipe.look.aspect || 1)
    const hydrated = hydrateRecipe(recipe)
    player = new AsciiPlayer(ascii, recipeClip(hydrated), {
      font: currentFont(),
      columns: recipe.look.columns,
      charAspect: recipe.look.charAspect,
      color: colorInput.value,
      gain: recipe.look.gain,
      glyphs: recipe.look.glyphs,
    })
    player.setBaked(hydrated)
    await applyFont()
    render()
    return
  }
  sourceKind = clip ? 'gif' : 'recipe'
  if (clip && player) {
    player.clearBaked()
    player.setColumns(recipe.look.columns)
    player.gain = recipe.look.gain ?? 1
    if (recipe.look.glyphs) player.setGlyphs(recipe.look.glyphs)
    await applyFont()
    render()
    return
  }
  statusNote = 'Recipe loaded. Import the original GIF to play it.'
  status.textContent = statusNote
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
    statusNote = 'Columns are stored in the recipe. Import the original GIF to resample.'
  }
})
fontSelect.addEventListener('change', () => { applyFont() })
function applyGlyphs() {
  if (!player) return
  player.setGlyphs(glyphsSelect.value)
  ascii.dataset.glyphs = glyphsSelect.value
  render()
}
glyphsSelect.addEventListener('input', applyGlyphs)
glyphsSelect.addEventListener('change', applyGlyphs)
frameInput.addEventListener('pointerdown', () => { scrubbing = true })
frameInput.addEventListener('pointerup', () => { scrubbing = false })
frameInput.addEventListener('input', () => {
  setPaused(true)
  gifTime = timeForFrame(Number(frameInput.value))
})
pauseButton.addEventListener('click', () => {
  setPaused(!paused)
})
colorInput.addEventListener('input', syncColorHex)
const gifFile = document.querySelector('#gif-file')
const recipeFile = document.querySelector('#recipe-file')
document.querySelector('#choose-gif').addEventListener('click', () => gifFile.click())
document.querySelector('#choose-recipe').addEventListener('click', () => recipeFile.click())
document.querySelector('#random-recipe').addEventListener('click', () => {
  applyRandomRecipe()
})
document.querySelector('#export-png').addEventListener('click', exportPng)
document.querySelector('#export-recipe').addEventListener('click', () => {
  try {
    openRecipePanel()
  } catch (error) {
    statusNote = error.message
    status.textContent = statusNote
  }
})
document.querySelector('#recipe-close').addEventListener('click', () => closeRecipePanel())
recipePanel.addEventListener('click', (event) => {
  if (event.target === recipePanel) closeRecipePanel()
})
recipeJson.addEventListener('input', () => {
  window.clearTimeout(editorTimer)
  editorTimer = window.setTimeout(applyEditorText, 400)
})
document.querySelector('#recipe-copy').addEventListener('click', async () => {
  try {
    const next = applyEditorText()
    await copyText(recipeJson.value)
    flashPanelNote(next ? `Copied ${panelFileName}` : 'Copied text')
  } catch (error) {
    flashPanelNote(error.message)
  }
})
document.querySelector('#recipe-download').addEventListener('click', () => {
  downloadBlob(panelFileName, new Blob([recipeJson.value], { type: 'application/json;charset=utf-8' }))
  const next = applyEditorText()
  flashPanelNote(next ? `Downloaded ${panelFileName}` : `Downloaded, ${recipeNote.textContent}`)
})
document.querySelector('#copy-agent').addEventListener('click', async () => {
  try {
    const name = await copyAgentPrompt()
    flashStatus(`Copied the agent prompt and downloaded ${name}`)
  } catch (error) {
    statusNote = error.message
    status.textContent = statusNote
  }
})
gifFile.addEventListener('change', async () => {
  const file = gifFile.files?.[0]
  gifFile.value = ''
  if (!file) return
  statusNote = `Converting ${file.name}`
  status.textContent = statusNote
  try {
    const bytes = await file.arrayBuffer()
    statusNote = ''
    useClip(decodeAsciiClip(bytes), file.name)
  } catch (error) {
    statusNote = `Could not convert ${file.name}: ${error.message}`
    status.textContent = statusNote
  }
})
recipeFile.addEventListener('change', async () => {
  const file = recipeFile.files?.[0]
  recipeFile.value = ''
  if (!file) return
  statusNote = `Reading ${file.name}`
  status.textContent = statusNote
  try {
    const text = await file.text()
    await useRecipe(text, file.name)
  } catch (error) {
    statusNote = `Could not import ${file.name}: ${error.message}`
    status.textContent = statusNote
  }
})
document.querySelector('#light-mass').addEventListener('click', () => applyTheme(themes.light))
document.querySelector('#dark-mass').addEventListener('click', () => applyTheme(themes.dark))
if (window.matchMedia('(max-width: 640px)').matches) columnsInput.value = '60'
setPaused(paused)
applyTheme(theme)

const params = new URLSearchParams(location.search)
const recipeUrl = params.get('recipe')
const defaultGif = new URL('../../../assets/squidward.gif', import.meta.url).href
const gifUrl = params.get('gif') || defaultGif
try {
  if (recipeUrl) {
    const response = await fetch(recipeUrl)
    if (!response.ok) throw new Error(`Recipe fetch failed: ${response.status}`)
    await useRecipe(await response.text(), recipeUrl.split('/').pop())
  } else {
    const initial = await loadDefaultClip(gifUrl, !params.get('gif'))
    const initialName = params.get('gif') ? params.get('gif').split('/').pop() : 'squidward.gif'
    useClip(initial, initialName)
  }
} catch (error) {
  status.textContent = error.message
}
requestAnimationFrame(tick)
