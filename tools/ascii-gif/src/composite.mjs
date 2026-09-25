import gifuct from '../vendor/gifuct.mjs'

const { parseGIF, decompressFrame } = gifuct

const PATCH_ERROR = '帧上没有 patch。pixels 是颜色表索引，不能当作 RGBA。'

function asArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
  }
  throw new TypeError('GIF 需要 ArrayBuffer 或类型化数组。')
}

function backgroundFrom(gif) {
  const index = gif.lsd?.backgroundColorIndex ?? 0
  const color = gif.gct?.[index]
  return {
    index,
    rgba: color ? [color[0], color[1], color[2], 255] : [0, 0, 0, 0],
  }
}

function clipRect(width, height, dims) {
  const x0 = Math.max(0, dims.left)
  const y0 = Math.max(0, dims.top)
  const x1 = Math.min(width, dims.left + dims.width)
  const y1 = Math.min(height, dims.top + dims.height)
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null
}

function fillRect(screen, width, height, dims, color) {
  const rect = clipRect(width, height, dims)
  if (!rect) return
  const [x0, y0, x1, y1] = rect
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4
      screen[i] = color[0]
      screen[i + 1] = color[1]
      screen[i + 2] = color[2]
      screen[i + 3] = color[3]
    }
  }
}

function disposalFill(previous, background, clearDisposal) {
  if (clearDisposal === 'transparent') return [0, 0, 0, 0]
  if (clearDisposal === 'background') return background.rgba
  // A transparent color means this patch should disappear. Painting the
  // logical screen background instead leaves an opaque block behind it.
  if (previous.transparentIndex != null) return [0, 0, 0, 0]
  return background.rgba
}

function dispose(screen, width, height, previous, backup, background, clearDisposal) {
  const type = previous.disposalType ?? 0
  if (type === 2) {
    fillRect(screen, width, height, previous.dims, disposalFill(previous, background, clearDisposal))
  } else if (type === 3) {
    screen.set(backup)
  }
}

function blit(screen, width, height, frame) {
  const { left, top, width: frameWidth, height: frameHeight } = frame.dims
  const patch = frame.patch
  for (let y = 0; y < frameHeight; y++) {
    const dy = top + y
    if (dy < 0 || dy >= height) continue
    for (let x = 0; x < frameWidth; x++) {
      const dx = left + x
      if (dx < 0 || dx >= width) continue
      const source = (y * frameWidth + x) * 4
      if (patch[source + 3] === 0) continue
      const dest = (dy * width + dx) * 4
      screen[dest] = patch[source]
      screen[dest + 1] = patch[source + 1]
      screen[dest + 2] = patch[source + 2]
      screen[dest + 3] = patch[source + 3]
    }
  }
}

// Visit each full screen after the frame is composited. The screen buffer is reused.
export function compositeFrames({ width, height, frames, background, clearDisposal = 'auto', visit }) {
  const screen = new Uint8ClampedArray(width * height * 4)
  const backup = new Uint8ClampedArray(screen.length)
  let previous = null
  let index = 0
  for (const frame of frames) {
    if (!frame?.patch) throw new Error(PATCH_ERROR)
    if (previous) dispose(screen, width, height, previous, backup, background, clearDisposal)
    if ((frame.disposalType ?? 0) === 3) backup.set(screen)
    blit(screen, width, height, frame)
    visit?.(screen, frame, index)
    previous = frame
    index += 1
  }
  return index
}

export function sampleGrid(screen, width, height, columns, rows) {
  const luma = new Uint8Array(columns * rows)
  const alpha = new Uint8Array(columns * rows)
  for (let y = 0; y < rows; y++) {
    const y0 = Math.floor(y * height / rows)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / rows))
    for (let x = 0; x < columns; x++) {
      const x0 = Math.floor(x * width / columns)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / columns))
      let lumaSum = 0
      let alphaSum = 0
      let weight = 0
      let count = 0
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * width + px) * 4
          const a = screen[i + 3]
          alphaSum += a
          count += 1
          if (a) {
            lumaSum += (0.2126 * screen[i] + 0.7152 * screen[i + 1] + 0.0722 * screen[i + 2]) * a
            weight += a
          }
        }
      }
      const cell = y * columns + x
      alpha[cell] = count ? Math.round(alphaSum / count) : 0
      luma[cell] = weight ? Math.round(lumaSum / weight) : 0
    }
  }
  return { luma, alpha }
}

function paperFrom(luma, alpha, columns, rows) {
  const points = [[0, 0], [columns - 1, 0], [0, rows - 1], [columns - 1, rows - 1]]
  let sum = 0
  let count = 0
  for (const [x, y] of points) {
    const i = y * columns + x
    if (alpha[i] > 200) {
      sum += luma[i]
      count += 1
    }
  }
  if (!count) return { luma: 255, transparent: true }
  return { luma: sum / count, transparent: false }
}

export function contentBounds(frames, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (const frame of frames) {
    for (let y = 0; y < height; y++) {
      const row = y * width
      for (let x = 0; x < width; x++) {
        if (frame.alpha[row + x] < 32) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height }
  const padX = Math.max(1, Math.round((maxX - minX) * 0.04))
  const padY = Math.max(1, Math.round((maxY - minY) * 0.04))
  const x = Math.max(0, minX - padX)
  const y = Math.max(0, minY - padY)
  return {
    x,
    y,
    width: Math.min(width - x, maxX - minX + 1 + padX * 2),
    height: Math.min(height - y, maxY - minY + 1 + padY * 2),
  }
}

export function decodeAsciiClip(input, options = {}) {
  const gif = parseGIF(asArrayBuffer(input))
  const width = gif.lsd.width
  const height = gif.lsd.height
  if (!width || !height) throw new Error('GIF 画面尺寸无效。')
  const background = backgroundFrom(gif)
  const pixelColumns = Math.min(width, Math.max(1, options.pixelColumns ?? 360))
  const pixelRows = Math.max(1, Math.round(pixelColumns * height / width))
  const clearDisposal = options.clearDisposal ?? 'auto'
  const frames = []
  const decoded = []
  for (const raw of gif.frames) {
    if (!raw.image) continue
    const frame = decompressFrame(raw, gif.gct, true)
    if (frame) decoded.push(frame)
  }
  compositeFrames({
    width,
    height,
    frames: decoded,
    background,
    clearDisposal,
    visit(screen, frame) {
      frames.push({
        delay: frame.delay || 100,
        disposalType: frame.disposalType ?? 0,
        dims: {
          left: frame.dims.left,
          top: frame.dims.top,
          width: frame.dims.width,
          height: frame.dims.height,
        },
        ...sampleGrid(screen, width, height, pixelColumns, pixelRows),
      })
      frame.patch = null
      frame.pixels = null
    },
  })
  if (!frames.length) throw new Error('GIF 里没有图像帧。')
  const duration = frames.reduce((sum, frame) => sum + frame.delay, 0)
  const bytes = frames.reduce((sum, frame) => sum + frame.luma.byteLength + frame.alpha.byteLength, 0)
  return {
    width,
    height,
    pixelColumns,
    pixelRows,
    frames,
    duration,
    background,
    paper: paperFrom(frames[0].luma, frames[0].alpha, pixelColumns, pixelRows),
    content: contentBounds(frames, pixelColumns, pixelRows),
    bytes,
  }
}

export async function loadAsciiClip(source, options) {
  if (typeof source === 'string') {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`GIF 读取失败：${response.status}`)
    return decodeAsciiClip(await response.arrayBuffer(), options)
  }
  return decodeAsciiClip(source, options)
}
