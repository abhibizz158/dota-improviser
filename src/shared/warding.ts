// Static, patch-revisable reference spots for support warding — general community knowledge (own wording, not
// copied from any guide), never read from the game. Same category/caveat as map-timers.ts and the Roshan
// timer: the map gets reworked across patches, so these are named entries in one place to revise, not scattered
// magic numbers. No live position/vision data is involved anywhere in this file.
// x/y are schematic percent coordinates (0-100, 0,0 = top-left) on a hand-drawn diagram — not real map
// coordinates, since this app has no licensed minimap asset to plot against (see WardMap in ui.tsx). Radiant
// base sits bottom-left, Dire base top-right, matching the real map's own orientation; lane/jungle placement is
// relative (top lane = Dire's safe lane / Radiant's off lane, and the reverse for bottom), not pixel-accurate.
// `phase` marks when a spot is actually worth the slot (zero fabrication: just which part of the game each
// spot's own purpose applies to — a lane spot is dead once the lane's gone, Outposts/Tormentor only exist once
// they've spawned). Undefined = relevant for the whole game. `wardSpotsFor`'s `phase` arg uses this to surface
// what's "smart" (i.e. actually useful right now) first, instead of one flat, phase-blind list.
export type WardPhase = 'Laning' | 'Mid game' | 'Late game'
export type WardSpot = { id: string; side: 'Radiant' | 'Dire' | 'Both'; area: string; label: string; sub: string; kind: 'observer' | 'sentry'; x: number; y: number; phase?: WardPhase[] }

export const WARD_SPOTS: WardSpot[] = [
  { id: 'rad-rune-cliff', side: 'Radiant', area: 'River', kind: 'observer', x: 42, y: 62,
    label: 'Cliff above the river rune', sub: 'High ground near the secret shop sees both rune spots and the river pull camp.' },
  { id: 'dire-rune-cliff', side: 'Dire', area: 'River', kind: 'observer', x: 58, y: 38,
    label: 'Ledge above the river rune', sub: 'Mirrors the Radiant river spot — covers both rune spawns from a safe elevation.' },
  { id: 'rad-triangle', side: 'Radiant', area: 'Safe-lane triangle', kind: 'observer', x: 25, y: 75, phase: ['Laning'],
    label: 'Safe-lane triangle camp', sub: 'Standard early safe-lane vision against a gank from the offlane jungle.' },
  { id: 'dire-triangle', side: 'Dire', area: 'Safe-lane triangle', kind: 'observer', x: 75, y: 25, phase: ['Laning'],
    label: 'Safe-lane triangle camp', sub: 'Same idea mirrored for Dire — watches the pull camp and the offlane approach.' },
  { id: 'rad-offlane-highground', side: 'Radiant', area: 'Off-lane', kind: 'observer', x: 20, y: 30, phase: ['Laning'],
    label: 'High ground above the off-lane', sub: 'Gives the off-laner room to see an incoming rotation before it arrives.' },
  { id: 'dire-offlane-highground', side: 'Dire', area: 'Off-lane', kind: 'observer', x: 80, y: 70, phase: ['Laning'],
    label: 'High ground above the off-lane', sub: 'Mirrored off-lane vision — the same early-game read for the other side.' },
  { id: 'both-roshan-approach', side: 'Both', area: 'Roshan', kind: 'observer', x: 61, y: 56, phase: ['Mid game', 'Late game'],
    label: "Roshan pit approach", sub: 'Placed before a Roshan attempt so the pit and the common approach paths are both lit.' },
  { id: 'both-midlane-rune', side: 'Both', area: 'Mid lane', kind: 'observer', x: 50, y: 50, phase: ['Laning', 'Mid game'],
    label: 'Mid lane high ground near the rune', sub: "Covers the mid rune spot and gives mid a look at ganks rotating through." },
  { id: 'rad-small-camp', side: 'Radiant', area: 'Jungle', kind: 'sentry', x: 34, y: 80, phase: ['Laning', 'Mid game'],
    label: 'Small camp near the safe lane', sub: 'A sentry here denies enemy vision of your own stacking/pulling without lighting your position up for them.' },
  { id: 'dire-small-camp', side: 'Dire', area: 'Jungle', kind: 'sentry', x: 66, y: 20, phase: ['Laning', 'Mid game'],
    label: 'Small camp near the safe lane', sub: 'Mirrored sentry spot — keeps your own farm/stack routine off the enemy ward.' },
  { id: 'both-rosh-sentry', side: 'Both', area: 'Roshan', kind: 'sentry', x: 65, y: 59, phase: ['Mid game', 'Late game'],
    label: 'Sentry near the Roshan pit entrance', sub: 'Clears enemy vision of your own Roshan attempt instead of just lighting the pit.' },
  { id: 'outpost-top', side: 'Both', area: 'Outpost', kind: 'observer', x: 33, y: 27, phase: ['Mid game', 'Late game'],
    label: 'Top outpost', sub: 'Vision for contesting the bonus-XP capture and seeing who is already standing on it.' },
  { id: 'outpost-bot', side: 'Both', area: 'Outpost', kind: 'observer', x: 67, y: 73, phase: ['Mid game', 'Late game'],
    label: 'Bottom outpost', sub: 'Mirrors the top outpost spot on the other side of the map.' },
  { id: 'rad-tormentor', side: 'Radiant', area: 'Tormentor', kind: 'sentry', x: 18, y: 55, phase: ['Late game'],
    label: 'Radiant-side Tormentor', sub: 'Denies enemy vision of your own Tormentor attempt — it drops an Aghanim\'s Shard, worth fighting over once it spawns.' },
  { id: 'dire-tormentor', side: 'Dire', area: 'Tormentor', kind: 'sentry', x: 82, y: 45, phase: ['Late game'],
    label: 'Dire-side Tormentor', sub: 'Mirrored Tormentor vision for the other side — same Aghanim\'s Shard payoff.' },
]

/** `phase`, when known, pins the spots that actually matter right now (or have no phase restriction) to the
 * top instead of leaving a support to find them in a flat, phase-blind list — `relevant` on each result is what
 * the UI badges as "now". Order is otherwise preserved (stable sort), so this only reprioritizes, never reshuffles. */
export function wardSpotsFor(side: 'Radiant' | 'Dire' | null, phase?: WardPhase): (WardSpot & { relevant: boolean })[] {
  const spots = WARD_SPOTS.filter((spot) => spot.side === 'Both' || spot.side === side)
    .map((spot) => ({ ...spot, relevant: !phase || !spot.phase || spot.phase.includes(phase) }))
  if (!phase) return spots
  return [...spots].sort((a, b) => Number(b.relevant) - Number(a.relevant))
}
