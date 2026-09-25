import { coverageGrid, frameAt, glyphBit } from './grid.mjs'

export function measureCharAspect(font) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `100px ${font}`
  const width = ctx.measureText('0').width
  return width > 0 ? width / 100 : 0.5
}

export class AsciiPlayer {
  constructor(canvas, clip, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('需要 canvas。')
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })
    this.clipData = clip
    this.font = options.font || 'ui-monospace, monospace'
    this.columns = clampColumns(options.columns ?? 110)
    this.charAspect = options.charAspect || measureCharAspect(this.font)
    this.color = options.color || '#000013'
    this.ink = options.ink || 'auto'
    this.floor = options.floor ?? 18
    this.viewport = options.viewport || null
    this.bands = null
    this.time = 0
    this.cacheKey = ''
    this.cache = null
    this.atlasKey = ''
  }

  setColumns(columns) {
    this.columns = clampColumns(columns)
  }

  setFont(font, charAspect) {
    this.font = font
    this.charAspect = charAspect || measureCharAspect(font)
  }

  setViewport(viewport) {
    this.viewport = viewport
  }

  // time selects the GIF frame. bands use the host's own coordinates and shifts.
  sync({ time = 0, color, bands, ink } = {}) {
    if (color) this.color = color
    if (ink) this.ink = ink
    this.bands = bands ?? null
    this.time = time
    this.draw()
  }

  grid() {
    const index = frameAt(this.clipData, this.time)
    const { columns, rows } = this.cells(index)
    return { columns, rows, frameIndex: index }
  }

  cells(index) {
    const key = `${index}:${this.columns}:${this.charAspect}:${this.ink}:${this.floor}`
    if (key !== this.cacheKey) {
      this.cache = coverageGrid(this.clipData, index, {
        columns: this.columns,
        charAspect: this.charAspect,
        ink: this.ink,
        floor: this.floor,
      })
      this.cacheKey = key
    }
    return this.cache
  }

  draw() {
    const ctx = this.ctx
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssWidth = this.canvas.clientWidth
    const cssHeight = this.canvas.clientHeight
    if (cssWidth < 2 || cssHeight < 2) return
    const width = Math.round(cssWidth * dpr)
    const height = Math.round(cssHeight * dpr)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.atlasKey = ''
    }
    const index = frameAt(this.clipData, this.time)
    const grid = this.cells(index)
    const layout = this.layout(cssWidth, cssHeight, grid, dpr)
    this.prepareAtlas(layout)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.imageSmoothingEnabled = false
    if (this.bands) {
      for (const band of this.bands) this.drawBand(grid, layout, band)
    } else {
      this.drawCells(grid, layout, 0, grid.columns, 0, grid.rows, 0, 0)
    }
  }

  layout(cssWidth, cssHeight, grid, dpr) {
    const view = this.viewport || { x: 0, y: 0, width: cssWidth, height: cssHeight }
    const gridAspect = (grid.columns * this.charAspect) / grid.rows
    const frameAspect = view.width / Math.max(1, view.height)
    let drawWidth = view.width
    let drawHeight = view.height
    if (frameAspect > gridAspect) drawWidth = view.height * gridAspect
    else drawHeight = view.width / gridAspect
    const cellW = Math.max(1, Math.round(drawWidth * dpr / grid.columns))
    const cellH = Math.max(1, Math.round(drawHeight * dpr / grid.rows))
    const originX = Math.round((view.x + (view.width - drawWidth) / 2) * dpr)
    const originY = Math.round((view.y + (view.height - drawHeight) / 2) * dpr)
    return { originX, originY, cellW, cellH, dpr }
  }

  prepareAtlas(layout) {
    const key = `${this.font}:${this.color}:${layout.cellW}x${layout.cellH}`
    if (key === this.atlasKey) return
    const atlas = document.createElement('canvas')
    atlas.width = layout.cellW
    atlas.height = layout.cellH * 2
    const ctx = atlas.getContext('2d')
    ctx.clearRect(0, 0, atlas.width, atlas.height)
    ctx.fillStyle = this.color
    ctx.font = `${layout.cellH}px ${this.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('0', layout.cellW / 2, layout.cellH / 2)
    ctx.fillText('1', layout.cellW / 2, layout.cellH + layout.cellH / 2)
    this.atlas = atlas
    this.atlasKey = key
  }

  drawBand(grid, layout, band) {
    const { dpr, originX, originY, cellW, cellH } = layout
    const shift = (band.shift || 0) * dpr
    const x = band.x * dpr + shift
    const y = band.y * dpr
    const w = band.width * dpr
    const h = band.height * dpr
    if (w <= 0 || h <= 0) return
    const col0 = clamp(Math.floor((x - shift - originX) / cellW), 0, grid.columns)
    const col1 = clamp(Math.ceil((x - shift + w - originX) / cellW), 0, grid.columns)
    const row0 = clamp(Math.floor((y - originY) / cellH), 0, grid.rows)
    const row1 = clamp(Math.ceil((y + h - originY) / cellH), 0, grid.rows)
    const ctx = this.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    this.drawCells(grid, layout, col0, col1, row0, row1, shift, 0)
    ctx.restore()
  }

  drawCells(grid, layout, col0, col1, row0, row1, shiftX, shiftY) {
    const { coverage, columns } = grid
    const { originX, originY, cellW, cellH } = layout
    const ctx = this.ctx
    for (let row = row0; row < row1; row++) {
      for (let col = col0; col < col1; col++) {
        const amount = coverage[row * columns + col]
        if (amount < 8) continue
        const weight = amount / 255
        const scale = 0.42 + 0.7 * weight * weight
        const dw = cellW * scale
        const dh = cellH * scale
        ctx.globalAlpha = 0.28 + 0.72 * weight
        const bit = glyphBit(col, row)
        ctx.drawImage(
          this.atlas,
          0,
          bit * cellH,
          cellW,
          cellH,
          originX + col * cellW + shiftX + (cellW - dw) / 2,
          originY + row * cellH + shiftY + (cellH - dh) / 2,
          dw,
          dh,
        )
      }
    }
    ctx.globalAlpha = 1
  }
}

function clampColumns(value) {
  return Math.max(8, Math.min(400, Math.round(value)))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}
