import type { LiveSettings, OverlayView } from '../shared/model.js'

export type Rect = { x: number; y: number; width: number; height: number }
type Display = { id: number; bounds: Rect; workArea: Rect }

export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y)
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) }
}

export function gameDisplay<T extends Display>(displays: T[], game: Rect | null): T | undefined {
  if (!game) return undefined
  let best: T | undefined, area = 0
  for (const display of displays) {
    const overlap = intersection(game, display.bounds)
    if (overlap.width * overlap.height > area) { best = display; area = overlap.width * overlap.height }
  }
  return best
}

export function overlayBounds(workArea: Rect, game: Rect | null, settings: Pick<LiveSettings, 'size' | 'placement'>,
  view: OverlayView, measuredHeight: number | null, editing: boolean): Rect {
  const clipped = game && intersection(workArea, game)
  const area = clipped && clipped.width >= 3 && clipped.height >= 3 ? clipped : workArea
  const inset = Math.max(0, Math.min(24, Math.floor((Math.min(area.width, area.height) - 1) / 2),
    Math.round(Math.min(area.width, area.height) * 0.025)))
  const large = settings.size === 'Large'
  const width = Math.min(Math.max(1, Math.floor(area.width - 2 * inset)), editing ? 440 :
    Math.min(large ? 416 : 336, Math.max(224, Math.round(area.width * (large ? 0.34 : 0.28)))))
  const heightLimit = Math.min(area.height - 2 * inset,
    Math.max(190, Math.round(area.height * (editing ? 0.78 : large ? 0.60 : 0.50))))
  const height = Math.max(1, Math.min(Math.floor(heightLimit), measuredHeight ?? (view === 'draft' ? 320 : 220)))
  const placement = settings.placement === 'Auto' ? (view === 'draft' ? 'Top left' : 'Top right') : settings.placement
  return {
    x: placement.endsWith('left') ? Math.ceil(area.x + inset) : Math.floor(area.x + area.width - width - inset),
    y: placement.startsWith('Top') ? Math.ceil(area.y + inset) : Math.floor(area.y + area.height - height - inset),
    width, height,
  }
}
