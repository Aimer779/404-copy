export function rowCount(pixelColumns, pixelRows, columns, charAspect) {
  const aspect = charAspect > 0 ? charAspect : 1
  return Math.max(1, Math.round(columns * (pixelRows / pixelColumns) * aspect))
}

export function frameAt(clip, timeMs) {
  const duration = clip.duration
  if (!clip.frames.length) return 0
  const time = duration > 0 ? ((timeMs % duration) + duration) % duration : 0
  let elapsed = 0
  for (let i = 0; i < clip.frames.length; i++) {
    elapsed += clip.frames[i].delay
    if (time < elapsed) return i
  }
  return clip.frames.length - 1
}

export function glyphBit(x, y) {
  let n = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b)
  n = Math.imul(n ^ (n >>> 16), 0xc2b2ae35)
  return (n >>> 0) & 1
}

export function inkValue(luma, alpha, paperLuma, ink, floor, paperTransparent = false) {
  if (alpha < 16) return 0
  const presence = alpha / 255
  const lightSubject = ink === 'light' || (ink !== 'dark' && paperLuma < 128)
  const delta = lightSubject ? luma - paperLuma : paperLuma - luma
  if (!paperTransparent && delta <= floor) return 0
  const span = Math.max(1, 255 - floor)
  const contrast = paperTransparent ? 1 : Math.min(1, (delta - floor) / span)
  return Math.round(contrast * presence * 255)
}

// Stretch the subject's own black-to-white range so eyes and a beak stay
// darker than the surrounding body, whatever the source color was.
export function detailCoverage(luma, alpha, low, high) {
  if (alpha < 16) return 0
  const presence = alpha / 255
  if (high - low < 24) return Math.round(presence * 255)
  const t = Math.min(1, Math.max(0, (luma - low) / (high - low)))
  const strength = t < 0.22 ? 1 : ((1 - t) / 0.78) ** 1.35
  return Math.round(presence * (0.3 + 0.7 * strength) * 255)
}

export function measureTone(luma, alpha, width, box, paper, floor) {
  const hist = new Uint32Array(256)
  let count = 0
  const lightSubject = paper.luma < 128
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = y * width + x
      const pixelAlpha = alpha[i]
      if (pixelAlpha < 128) continue
      const pixelLuma = luma[i]
      if (!paper.transparent) {
        const delta = lightSubject ? pixelLuma - paper.luma : paper.luma - pixelLuma
        if (delta <= Math.min(floor, 8)) continue
      }
      hist[pixelLuma] += 1
      count += 1
    }
  }
  if (count < 8) return { low: 0, high: 255 }
  const at = (portion) => {
    let need = Math.floor((count - 1) * portion)
    for (let value = 0; value < 256; value++) {
      need -= hist[value]
      if (need < 0) return value
    }
    return 255
  }
  return { low: at(0.06), high: at(0.9) }
}

function boxCell(frame, pixelColumns, x0, x1, y0, y1) {
  let lumaSum = 0
  let alphaSum = 0
  let weight = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * pixelColumns + x
      const alpha = frame.alpha[i]
      alphaSum += alpha
      count += 1
      if (!alpha) continue
      const luma = frame.luma[i]
      const emphasis = 0.3 + (1 - luma / 255)
      lumaSum += luma * alpha * emphasis
      weight += alpha * emphasis
    }
  }
  return {
    luma: weight ? lumaSum / weight : 0,
    alpha: count ? alphaSum / count : 0,
  }
}

function cellSpan(origin, size, index, count, limit) {
  const start = Math.min(limit - 1, origin + Math.floor(index * size / count))
  let end = origin + Math.floor((index + 1) * size / count)
  if (end <= start) end = start + 1
  if (end > origin + size) end = origin + size
  if (end > limit) end = limit
  return [start, end]
}

export function coverageGrid(clip, frameIndex, { columns, charAspect, ink = 'auto', floor = 18 } = {}) {
  const frame = clip.frames[frameIndex]
  const box = clip.content ?? { x: 0, y: 0, width: clip.pixelColumns, height: clip.pixelRows }
  const rows = rowCount(box.width, box.height, columns, charAspect)
  const tone = measureTone(frame.luma, frame.alpha, clip.pixelColumns, box, clip.paper, floor)
  const coverage = new Uint8Array(columns * rows)
  for (let y = 0; y < rows; y++) {
    const [y0, y1] = cellSpan(box.y, box.height, y, rows, clip.pixelRows)
    for (let x = 0; x < columns; x++) {
      const [x0, x1] = cellSpan(box.x, box.width, x, columns, clip.pixelColumns)
      const cell = boxCell(frame, clip.pixelColumns, x0, x1, y0, y1)
      const flat = inkValue(cell.luma, cell.alpha, clip.paper.luma, ink, floor, clip.paper.transparent)
      coverage[y * columns + x] = flat === 0 ? 0 : detailCoverage(cell.luma, cell.alpha, tone.low, tone.high)
    }
  }
  return { columns, rows, coverage }
}
