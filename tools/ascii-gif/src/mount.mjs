import { AsciiPlayer } from './player.mjs'
import { hydrateRecipe, recipeClip } from './recipe.mjs'

export function mountAsciiRecipe(target, recipe, options = {}) {
  if (typeof document === 'undefined') throw new Error('mountAsciiRecipe 需要浏览器。')
  const hydrated = hydrateRecipe(recipe)
  const look = hydrated.look
  const canvas = ensureCanvas(target, look, options)
  const player = new AsciiPlayer(canvas, recipeClip(hydrated), {
    font: options.font || look.font,
    columns: look.columns,
    charAspect: look.charAspect,
    color: options.color || look.color,
    gain: options.gain ?? look.gain,
  })
  player.setBaked(hydrated)

  let time = 0
  let last = performance.now()
  let raf = 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const color = () => options.color || look.color

  const tick = (now) => {
    if (!document.hidden && !reduced.matches) time += now - last
    last = now
    player.sync({ time, color: color() })
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    player,
    recipe: hydrated,
    stop() {
      cancelAnimationFrame(raf)
    },
  }
}

function ensureCanvas(target, look, options) {
  if (target && typeof target.getContext === 'function') return target
  if (!target || typeof target.appendChild !== 'function') throw new Error('需要 canvas 或容器。')
  const canvas = document.createElement('canvas')
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  canvas.setAttribute('aria-hidden', 'true')
  target.appendChild(canvas)
  if (options.applyMass !== false && look.mass) target.style.background = look.mass
  return canvas
}
