import { CONTROL } from './mechanics.js'
import type { Kit } from './mechanics.js'
import type { Hero } from './model.js'

type PickReason = { points: number; text: string }
type Ally = { hero: Hero; kit?: Kit }

export function counterInteraction(hero: Hero, opponent: Hero | undefined, kit?: Kit, opponentKit?: Kit): PickReason | null {
  if (!opponent) return null
  const shield = opponent.slug === 'medusa' || opponentKit?.a.some((ability) => /\bmana shield\b/i.test(ability.n))
  const drain = kit?.a.find((ability) => /\b(mana break|mana drain|mana burn|mana combustion)\b/i.test(ability.n))
  if (!shield || (!drain && hero.slug !== 'antimage')) return null
  return { points: hero.slug === 'antimage' ? 9 : 5, text: `${drain?.n ?? 'Mana Break'} drains ${opponent.name}’s Mana Shield.` }
}

export function allyCombination(hero: Hero, kit: Kit | undefined, allies: Ally[]): PickReason | null {
  const attackCore = hero.roles.some((role) => role === 'Carry' || role === 'Pusher')
  const hardControl = (value?: Kit) =>
    value?.a.find((ability) => !ability.p && ability.c.some((effect) => (CONTROL[effect] ?? 0) >= 0.6))
  const ownControl = hardControl(kit)
  for (const ally of allies) {
    const theirControl = hardControl(ally.kit)
    if (ownControl && theirControl) {
      return { points: 3, text: `Chain ${ownControl.n} after ${ally.hero.name}’s ${theirControl.n}.` }
    }
    if (attackCore && (theirControl || ally.hero.roles.includes('Disabler'))) {
      return { points: 2.5, text: theirControl ? `${ally.hero.name}’s ${theirControl.n} sets up your damage.` : `${ally.hero.name} can lock targets down for your damage.` }
    }
    if ((ownControl || hero.roles.includes('Disabler')) && ally.hero.roles.includes('Carry')) {
      return { points: 2.5, text: ownControl ? `Set up ${ally.hero.name} with ${ownControl.n}.` : `Lock targets down for ${ally.hero.name}.` }
    }
  }
  return null
}
