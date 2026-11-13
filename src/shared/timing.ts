export type PurchaseEstimate = {
  etaSeconds: number | null
  remainingGold: number
  incomeMinutes: number | null
  stage: 'early' | 'core' | 'late' | 'unknown'
  pace: 'on-track' | 'delayed' | 'ambitious' | 'unknown'
  note: string
  downside: string
}

/** A conservative linear forecast from own-player GPM and unspent gold; it is never a guarantee. */
export function estimatePurchase(input: {
  nowSeconds: number | null; gold: number | null; gpm: number | null; cost: number; usualSeconds?: number | null; sampleGames?: number
}): PurchaseEstimate {
  const cost = Math.max(0, input.cost)
  const stage = cost < 1200 ? 'early' : cost < 3200 ? 'core' : 'late'
  const remainingGold = Math.max(0, cost - Math.max(0, input.gold ?? 0))
  const incomeMinutes = input.gpm != null && input.gpm >= 50 ? remainingGold / input.gpm : null
  const etaSeconds = input.nowSeconds == null || incomeMinutes == null ? null : input.nowSeconds + incomeMinutes * 60
  const sampled = (input.sampleGames ?? 0) >= 3 && input.usualSeconds != null
  const pace: PurchaseEstimate['pace'] = etaSeconds == null ? 'unknown'
    : sampled ? etaSeconds <= input.usualSeconds! + 180 ? 'on-track' : 'delayed'
      : etaSeconds < 600 && stage === 'late' ? 'ambitious' : 'unknown'
  let note = 'Need a current GPM or your own purchase history to estimate arrival.'
  if (etaSeconds != null) {
    note = etaSeconds <= (input.nowSeconds ?? 0) + 60 ? 'Affordable from current unspent gold.' : `Rough ETA ${Math.floor(etaSeconds / 60)}:${String(Math.floor(etaSeconds % 60)).padStart(2, '0')} at current GPM.`
    if (input.nowSeconds != null && input.nowSeconds < 600 && etaSeconds >= 600) note += ' This timing lands after the 10-minute lane window.'
    if (sampled && etaSeconds > input.usualSeconds! + 180) note += ` Later than your ${Math.round(input.usualSeconds! / 60)}-minute average (${input.sampleGames} games).`
  }
  return {
    etaSeconds, remainingGold, incomeMinutes, stage, pace, note,
    downside: incomeMinutes == null ? 'Without a pace estimate, compare the price with your next defensive or farming item.'
      : `This ties up about ${incomeMinutes.toFixed(1)} minutes of your current gold pace and can delay other core or defensive items.`,
  }
}

export function counterCombinations<T extends { key: string; cost: number }>(items: T[], limit = 8): T[][] {
  const unique = [...new Map(items.filter((item) => item.cost > 0).map((item) => [item.key, item])).values()].slice(0, 5)
  const combos: T[][] = [...unique.map((item) => [item])]
  for (let i = 0; i < unique.length; i++) for (let j = i + 1; j < unique.length; j++) combos.push([unique[i], unique[j]])
  return combos.sort((a, b) => a.reduce((s, i) => s + i.cost, 0) - b.reduce((s, i) => s + i.cost, 0)).slice(0, limit)
}
