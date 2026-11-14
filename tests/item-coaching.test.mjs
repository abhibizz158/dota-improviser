import assert from 'node:assert/strict'
import test from 'node:test'
import { counterItems } from '../dist/main/shared/item-coaching.js'
import { itemInfo } from '../dist/main/main/data.js'

const frame = { clock: 380, level: 5, heroSlug: 'juggernaut', gpm: 350, gold: 350, items: [], itemsObserved: true }
const hero = (slug, name, roles) => ({ hero: { slug, name, roles } })

test('lane recommendations favor affordable responses and wait for an observed inventory', () => {
  const enemies = [hero('lina','Lina',['Nuker']), hero('tiny','Tiny',['Nuker'])]
  const [wand] = counterItems(frame,'Hard support','Laning',enemies,null,itemInfo)
  assert.equal(wand.key,'magic_stick')
  assert.match(wand.timing,/now/)
  assert.deepEqual(counterItems({ ...frame, itemsObserved: false },'Hard support','Laning',enemies,null,itemInfo),[])
  assert.deepEqual(counterItems({ ...frame, items: ['magic_wand'] },'Hard support','Laning',enemies,null,itemInfo),[])
})

test('support response to a piercing lineup differs from core advice against ordinary disables', () => {
  const enemies = [hero('axe','Axe',['Disabler']), hero('bane','Bane',['Disabler'])]
  const mid = { ...frame, clock: 920, level: 12, gold: 600, items: ['staff_of_wizardry'] }
  const profile = { damage: { mag: 0.3, phys: 0.4 }, hard: 2, sustain: 0, piercing: 2 }
  const [force] = counterItems(mid,'Hard support','Mid game',enemies,profile,itemInfo)
  assert.equal(force.key,'force_staff')
  assert.equal(force.remaining,itemInfo.force_staff.c - itemInfo.staff_of_wizardry.c)
  assert.match(force.goal,/at current GPM/)
  assert.ok(!counterItems(mid,'Carry','Mid game',enemies,profile,itemInfo).some((item) => item.key === 'black_king_bar'))
  assert.ok(counterItems(mid,'Carry','Mid game',enemies,{ ...profile, piercing: 0 },itemInfo).some((item) => item.key === 'black_king_bar'))
})

test('late matchup advice is conditional, takes components and inventory into account', () => {
  const late = { ...frame, clock: 1920, level: 20, gold: 6500 }
  const medusa = [hero('medusa','Medusa',['Carry'])]
  assert.equal(counterItems(late,'Carry','Late game',medusa,null,itemInfo)[0].key,'diffusal_blade')
  assert.match(counterItems(late,'Carry','Late game',medusa,null,itemInfo)[0].timing,/buyback/)
  assert.deepEqual(counterItems({ ...late, heroSlug: 'antimage' },'Carry','Late game',medusa,null,itemInfo),[])
  assert.deepEqual(counterItems({ ...late, items: ['disperser'] },'Carry','Late game',medusa,null,itemInfo),[])
})
