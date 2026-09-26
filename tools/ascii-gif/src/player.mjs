import { glyphChars, glyphSet, rampIndex } from './glyphs.mjs'
import { coverageGrid, frameAt, glyphBit } from './grid.mjs'

export function measureCharAspect(font, sample = '0') {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `100px ${font}`
  const width = ctx.measureText(sample).width
  return width > 0 ? width / 100 : 0.5
}

export class AsciiPlayer {
  constructor(canvas, clip, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('需要 canvas。')
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: true })
    this.clipData = clip
    this.font = options.font || 'ui-monospace, monospace'
    this.glyphSet = glyphSet(options.glyphs)
    this.columns = clampColumns(options.columns ?? 110)
    this.charAspect = options.charAspect || measureCharAspect(this.font, glyphChars(this.glyphSet)[0])
    this.color = options.color || '#000013'
    this.ink = options.ink || 'auto'
    this.floor = options.floor ?? 18
    this.gain = options.gain ?? 1
    this.viewport = options.viewport || null
    this.bands = null
    this.baked = null
    this.time = 0
    this.cacheKey = ''
    this.cache = null
    this.atlasKey = ''
  }

  setColumns(columns) {
    if (this.baked) return
    this.columns = clampColumns(columns)
  }

  setFont(font, charAspect) {
    this.font = font
    this.charAspect = charAspect || measureCharAspect(font, glyphChars(this.glyphSet)[0])
    this.atlasKey = ''
  }

  setGlyphs(id) {
    this.glyphSet = glyphSet(id)
    this.atlas = null
    this.atlasKey = ''
    this.cacheKey = ''
    this.cache = null
    if (!this.baked) {
      this.charAspect = measureCharAspect(this.font, glyphChars(this.glyphSet)[0] || '0')
    }
    if (this.canvas.clientWidth > 1) this.draw()
  }

  setViewport(viewport) {
    this.viewport = viewport
  }

  setBaked(recipe) {
    const look = recipe.look
    this.baked = {
      columns: look.columns,
      rows: look.rows,
      frames: recipe.clip.frames,
    }
    this.columns = look.columns
    this.charAspect = look.charAspect
    this.gain = look.gain ?? this.gain
    this.cacheKey = ''
    this.cache = null
  }

  clearBaked() {
    this.baked = null
    this.cacheKey = ''
    this.cache = null
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
    if (this.baked) {
      const frame = this.baked.frames[index]
      return {
        columns: this.baked.columns,
        rows: this.baked.rows,
        coverage: frame.coverage,
      }
    }
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
    const chars = glyphChars(this.glyphSet)
    const key = `${this.glyphSet.id}:${this.font}:${this.color}:${layout.cellW}x${layout.cellH}`
    if (key === this.atlasKey) return
    const atlas = document.createElement('canvas')
    atlas.width = layout.cellW
    atlas.height = Math.max(1, layout.cellH * chars.length)
    const ctx = atlas.getContext('2d')
    ctx.clearRect(0, 0, atlas.width, atlas.height)
    ctx.fillStyle = this.color
    ctx.font = `${layout.cellH}px ${this.font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], layout.cellW / 2, layout.cellH * i + layout.cellH / 2)
    }
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
    const ramp = this.glyphSet.mode === 'ramp'
    for (let row = row0; row < row1; row++) {
      for (let col = col0; col < col1; col++) {
        const amount = Math.min(255, coverage[row * columns + col] * this.gain)
        if (amount < 8) continue
        const weight = amount / 255
        const slot = ramp
          ? rampIndex(amount, this.glyphSet, this.glyphSet.id === 'mixed' ? glyphBit(col, row) * 2 - 1 : 0)
          : glyphBit(col, row)
        if (slot < 0) continue
        const scale = ramp ? 0.82 + 0.18 * weight : 0.42 + 0.7 * weight * weight
        const dw = cellW * scale
        const dh = cellH * scale
        ctx.globalAlpha = ramp ? 0.4 + 0.6 * weight : 0.28 + 0.72 * weight
        ctx.drawImage(
          this.atlas,
          0,
          slot * cellH,
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
