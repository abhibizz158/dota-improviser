// Static, patch-revisable reference spots for support warding — general community knowledge (own wording, not
// copied from any guide), never read from the game. Same category/caveat as map-timers.ts and the Roshan
// timer: the map gets reworked across patches, so these are named entries in one place to revise, not scattered
// magic numbers. No live position/vision data is involved anywhere in this file.
export type WardSpot = { id: string; side: 'Radiant' | 'Dire' | 'Both'; area: string; label: string; sub: string; kind: 'observer' | 'sentry' }

export const WARD_SPOTS: WardSpot[] = [
  { id: 'rad-rune-cliff', side: 'Radiant', area: 'River', kind: 'observer',
    label: 'Cliff above the river rune', sub: 'High ground near the secret shop sees both rune spots and the river pull camp.' },
  { id: 'dire-rune-cliff', side: 'Dire', area: 'River', kind: 'observer',
    label: 'Ledge above the river rune', sub: 'Mirrors the Radiant river spot — covers both rune spawns from a safe elevation.' },
  { id: 'rad-triangle', side: 'Radiant', area: 'Safe-lane triangle', kind: 'observer',
    label: 'Safe-lane triangle camp', sub: 'Standard early safe-lane vision against a gank from the offlane jungle.' },
  { id: 'dire-triangle', side: 'Dire', area: 'Safe-lane triangle', kind: 'observer',
    label: 'Safe-lane triangle camp', sub: 'Same idea mirrored for Dire — watches the pull camp and the offlane approach.' },
  { id: 'rad-offlane-highground', side: 'Radiant', area: 'Off-lane', kind: 'observer',
    label: 'High ground above the off-lane', sub: 'Gives the off-laner room to see an incoming rotation before it arrives.' },
  { id: 'dire-offlane-highground', side: 'Dire', area: 'Off-lane', kind: 'observer',
    label: 'High ground above the off-lane', sub: 'Mirrored off-lane vision — the same early-game read for the other side.' },
  { id: 'both-roshan-approach', side: 'Both', area: 'Roshan', kind: 'observer',
    label: "Roshan pit approach", sub: 'Placed before a Roshan attempt so the pit and the common approach paths are both lit.' },
  { id: 'both-midlane-rune', side: 'Both', area: 'Mid lane', kind: 'observer',
    label: 'Mid lane high ground near the rune', sub: "Covers the mid rune spot and gives mid a look at ganks rotating through." },
  { id: 'rad-small-camp', side: 'Radiant', area: 'Jungle', kind: 'sentry',
    label: 'Small camp near the safe lane', sub: 'A sentry here denies enemy vision of your own stacking/pulling without lighting your position up for them.' },
  { id: 'dire-small-camp', side: 'Dire', area: 'Jungle', kind: 'sentry',
    label: 'Small camp near the safe lane', sub: 'Mirrored sentry spot — keeps your own farm/stack routine off the enemy ward.' },
  { id: 'both-rosh-sentry', side: 'Both', area: 'Roshan', kind: 'sentry',
    label: 'Sentry near the Roshan pit entrance', sub: 'Clears enemy vision of your own Roshan attempt instead of just lighting the pit.' },
]

export function wardSpotsFor(side: 'Radiant' | 'Dire' | null): WardSpot[] {
  return WARD_SPOTS.filter((spot) => spot.side === 'Both' || spot.side === side)
}
