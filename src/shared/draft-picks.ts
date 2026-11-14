export function mergePicks(manual: number[], revealed: number[], limit: number) {
  return [...new Set([...revealed, ...manual])].slice(0, limit)
}

export function draftLineup(own: number | null, manualAllied: number[], manualEnemy: number[], feedAllied: number[], feedEnemy: number[]) {
  const revealedAllied = feedAllied.filter((id) => id !== own && !feedEnemy.includes(id)).slice(0, 4)
  const revealedEnemy = feedEnemy.filter((id) => id !== own).slice(0, 5)
  const allied = mergePicks(manualAllied.filter((id) => id !== own && !revealedEnemy.includes(id)), revealedAllied, 4)
  const enemy = mergePicks(manualEnemy.filter((id) => id !== own && !allied.includes(id)), revealedEnemy, 5)
  return { ownHero: own, allied, enemy, revealedAllied, revealedEnemy }
}

/** Keep recent feed updates in their original slots; a blank packet may precede the next visible round. */
export function mergeDraftSlots(current: ReadonlyMap<number, number>, incoming: ReadonlyMap<number, number>) {
  if (![...incoming].some(([slot, hero]) => current.get(slot) !== hero)) return current
  return new Map([...current, ...incoming])
}
