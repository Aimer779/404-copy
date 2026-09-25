import { AsciiPlayer, decodeAsciiClip, frameAt, loadAsciiClip, measureCharAspect } from '../src/index.mjs'

const gray = document.querySelector('#gray')
const bars = document.querySelector('#bars')
const ascii = document.querySelector('#ascii')
const stage = document.querySelector('#stage')
const columnsInput = document.querySelector('#columns')
const frameInput = document.querySelector('#frame')
const shiftInput = document.querySelector('#shift')
const colorInput = document.querySelector('#color')
const bandsInput = document.querySelector('#bands')
const pauseButton = document.querySelector('#pause')
const status = document.querySelector('#status')
const grayCtx = gray.getContext('2d')
const barCtx = bars.getContext('2d')
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

const themes = {
  light: { page: '#000013', mass: '#f3f3f3', ink: '#000013' },
  dark: { page: '#f3f3f3', mass: '#000013', ink: '#f3f3f3' },
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

function applyTheme(next) {
  theme = next
  stage.style.background = theme.page
  colorInput.value = theme.ink
}

function bandsFor(now) {
  const width = stage.clientWidth
  const height = stage.clientHeight
  if (!bandsInput.checked) {
    return [{ x: 0, y: 0, width, height, shift: 0 }]
  }
  const strength = Number(shiftInput.value)
  const count = 8
  const top = height * 0.05
  const span = height * 0.9
  const gap = 5
  const bandHeight = (span - gap * (count - 1)) / count
  return Array.from({ length: count }, (_, i) => {
    const inset = width * (0.04 + (i % 4) * 0.035)
    return {
      x: inset,
      y: top + i * (bandHeight + gap),
      width: Math.max(1, width - inset * 2.4),
      height: bandHeight,
      shift: strength * Math.sin(now / 220 + i * 0.8),
    }
  })
}

function drawBars(bands) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.round(stage.clientWidth * dpr)
  const height = Math.round(stage.clientHeight * dpr)
  if (bars.width !== width || bars.height !== height) {
    bars.width = width
    bars.height = height
  }
  barCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  barCtx.clearRect(0, 0, stage.clientWidth, stage.clientHeight)
  barCtx.fillStyle = theme.mass
  for (const band of bands) {
    barCtx.fillRect(band.x + band.shift, band.y, band.width, band.height)
  }
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

function timeForFrame(index) {
  let time = 0
  for (let i = 0; i < index; i++) time += clip.frames[i].delay
  return time
}

function render(now) {
  const index = frameAt(clip, gifTime)
  const frame = clip.frames[index]
  drawGray(frame)
  const bands = bandsFor(now)
  drawBars(bands)
  player.sync({ time: gifTime, color: colorInput.value, bands })
  const grid = player.grid()
  if (!scrubbing) frameInput.value = String(index)
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
    font: '"VT323", ui-monospace, monospace',
    columns: Number(columnsInput.value),
    charAspect: measureCharAspect('"VT323", ui-monospace, monospace'),
    color: colorInput.value,
  })
  paused = reduced.matches
  pauseButton.textContent = paused ? '继续' : '暂停'
  render(performance.now())
}

function tick(now) {
  if (clip && player && !document.hidden) {
    if (!paused) gifTime += now - last
    render(now)
  }
  last = now
  requestAnimationFrame(tick)
}

columnsInput.addEventListener('input', () => player?.setColumns(Number(columnsInput.value)))
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
