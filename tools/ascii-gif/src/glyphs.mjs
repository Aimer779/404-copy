export const GLYPH_SETS = {
  binary: { id: 'binary', label: '01', chars: '01', mode: 'bit' },
  ascii: { id: 'ascii', label: '@%', chars: '@%#*+=-:. ', mode: 'ramp' },
  block: { id: 'block', label: '█▓', chars: '█▓▒░ ', mode: 'ramp' },
  mixed: { id: 'mixed', label: '@▓', chars: '@▓#*+·:- ', mode: 'ramp' },
  braille: { id: 'braille', label: '⣿', chars: '⣿⣇⡇⠇⠃⠁', mode: 'ramp' },
  ox: { id: 'ox', label: 'OX', chars: 'OX', mode: 'bit' },
}

export function glyphSet(id) {
  return GLYPH_SETS[id] || GLYPH_SETS.binary
}

export function glyphChars(set) {
  return Array.from(set.chars)
}

export function rampIndex(amount, set, jitter = 0) {
  const chars = glyphChars(set)
  if (!chars.length) return -1
  const weight = Math.min(255, Math.max(0, amount)) / 255
  let index = Math.min(chars.length - 1, Math.floor((1 - weight) * chars.length))
  if (jitter) index = Math.max(0, Math.min(chars.length - 1, index + jitter))
  const char = chars[index]
  if (char === ' ' || char === '⠀') return -1
  return index
}
