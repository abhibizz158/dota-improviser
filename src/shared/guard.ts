// Fair-play guardrails. Enforced three ways: types/constants here, runtime checks (network allowlist, GSI section list),
// and tests/guard.test.mjs which scans the source tree and fails the build on forbidden APIs.

/** Only Valve-provided, player-visible GSI sections. Spectator/hidden-info sections (allplayers, buildings, wearables, minimap, events) are never requested. */
export const allowedGsiSections = ['provider', 'map', 'player', 'hero', 'items', 'draft'] as const

/** Every outbound HTTP request from any window or the main process must target one of these hosts. */
export const allowedHosts = ['api.opendota.com', 'api.github.com', 'api.puter.com', 'puter.com', 'cdn.cloudflare.steamstatic.com', 'www.dota2.com', 'support.overwolf.com', 'blog.opendota.com'] as const

export function hostAllowed(url: string) {
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol === 'file:' || protocol === 'devtools:' || protocol === 'data:' || protocol === 'blob:') return true
    return (protocol === 'https:' && (allowedHosts as readonly string[]).includes(hostname)) || (protocol === 'http:' && hostname === '127.0.0.1')
  } catch { return false }
}

export const fairPlay = [
  'Reads only what Dota sends through its official Game State Integration, which is limited to your own client.',
  'Uses public OpenDota aggregates and read-only local files (steam.inf, itembuilds, Steam login list).',
  'Optional Puter AI uses the signed-in user account and only receives the question plus explicitly selected hero/pick and own-player lane fields.',
  'Never reads game memory, captures the screen, injects input, or inspects network traffic.',
  'Never shows hidden information: enemy picks appear only when Dota reveals them or you type them.',
  'Overlay is click-through during play and makes no moves for you.',
  'Network access is limited to a fixed list of hosts; everything else is blocked.',
] as const
