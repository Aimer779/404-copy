import { AsciiPlayer, decodeAsciiClip, frameAt, loadAsciiClip, measureCharAspect } from '../src/index.mjs'

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
let player = null
let sourceName = ''
let statusNote = ''
let gifTime = 0
let last = performance.now()
let paused = reduced.matches
let scrubbing = false

function currentFont() {
  return fonts[fontSelect.value] || fonts.consolas
}

async function applyFont() {
  if (fontSelect.value === 'vt323') await document.fonts.load('100px VT323')
  player?.setFont(currentFont())
}

function applyTheme(next) {
  theme = next
  stage.style.background = theme.mass
  colorInput.value = theme.ink
  document.querySelector('#light-mass').classList.toggle('is-on', next === themes.light)
  document.querySelector('#dark-mass').classList.toggle('is-on', next === themes.dark)
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
    const link = document.createElement('a')
    const base = (sourceName || 'ascii').replace(/\.[^.]+$/, '')
    link.href = URL.createObjectURL(blob)
    link.download = `${base}-ascii.png`
    link.click()
    URL.revokeObjectURL(link.href)
  }, 'image/png')
}

function timeForFrame(index) {
  let time = 0
  for (let i = 0; i < index; i++) time += clip.frames[i].delay
  return time
}

function render() {
  const index = frameAt(clip, gifTime)
  const frame = clip.frames[index]
  drawGray(frame)
  player.sync({ time: gifTime, color: colorInput.value })
  const grid = player.grid()
  if (!scrubbing && frameInput.value !== String(index)) frameInput.value = String(index)
  document.querySelector('#columns-value').textContent = String(grid.columns)
  document.querySelector('#frame-value').textContent = `${index + 1}/${clip.frames.length}`
  const partial = clip.frames.filter(item => item.dims.width < clip.width || item.dims.height < clip.height).length
  const stored = clip.bytes < 1024 ? `${clip.bytes} B` : `${Math.round(clip.bytes / 1024)} KB`
  const detail = `${sourceName} · 帧 ${index + 1}/${clip.frames.length} · 本帧 ${frame.delay} ms · 列 ${grid.columns} × 行 ${grid.rows} · 灰度 ${stored} · 素材 ${clip.width}×${clip.height} · 局部帧 ${partial}`
  status.textContent = statusNote || detail
}

function useClip(next, name) {
  clip = next
  sourceName = name
  gifTime = 0
  frameInput.max = String(Math.max(0, clip.frames.length - 1))
  frameInput.value = '0'
  const box = clip.content ?? { width: clip.width, height: clip.height }
  document.querySelector('.preview').style.aspectRatio = `${box.width} / ${box.height}`
  player = new AsciiPlayer(ascii, clip, {
    font: currentFont(),
    columns: Number(columnsInput.value),
    charAspect: measureCharAspect(currentFont()),
    color: colorInput.value,
  })
  paused = reduced.matches
  pauseButton.textContent = paused ? '继续' : '暂停'
  render()
}

function tick(now) {
  if (clip && player && !document.hidden) {
    if (!paused) gifTime += now - last
    render()
  }
  last = now
  requestAnimationFrame(tick)
}

columnsInput.addEventListener('input', () => player?.setColumns(Number(columnsInput.value)))
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
document.querySelector('#choose-gif').addEventListener('click', () => gifFile.click())
document.querySelector('#export-png').addEventListener('click', exportPng)
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
document.querySelector('#light-mass').addEventListener('click', () => applyTheme(themes.light))
document.querySelector('#dark-mass').addEventListener('click', () => applyTheme(themes.dark))
if (window.matchMedia('(max-width: 640px)').matches) columnsInput.value = '60'
if (paused) pauseButton.textContent = '继续'
applyTheme(theme)

const params = new URLSearchParams(location.search)
const gifUrl = params.get('gif') || new URL('../fixtures/bust.gif', import.meta.url).href
try {
  await document.fonts.load('20px VT323')
  const initial = await loadAsciiClip(gifUrl)
  const initialName = params.get('gif') ? params.get('gif').split('/').pop() : 'bust.gif'
  useClip(initial, initialName)
} catch (error) {
  status.textContent = error.message
}
requestAnimationFrame(tick)
