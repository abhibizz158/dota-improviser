import { TYPES, composeMail, detectSystem, parseNotes, pickAssets } from './updates.js'

const REPO = 'abhibizz158/dota-improviser'
const EMAIL = 'abhishekbizz.156@gmail.com'
const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n }

// ---- menu, tabs, pictures ----
const top_ = $('.top'), menu = $('.menu')
const setMenu = (open) => { top_.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)) }
menu.addEventListener('click', () => setMenu(!top_.classList.contains('open')))
$('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false) })
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false) })

function selectTab(tab) {
  for (const t of $$('[role=tab]', tab.parentElement)) {
    const on = t === tab
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  }
}
for (const list of $$('[role=tablist]')) {
  list.addEventListener('click', (e) => { const t = e.target.closest('[role=tab]'); if (t) selectTab(t) })
  list.addEventListener('keydown', (e) => {
    const tabs = $$('[role=tab]', list), step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const next = tabs[(tabs.indexOf(e.target) + step + tabs.length) % tabs.length]
    selectTab(next); next.focus()
  })
}

const viewer = $('#viewer')
for (const b of $$('.zoom')) b.addEventListener('click', () => {
  const img = $('img', b), big = $('img', viewer)
  big.src = img.src; big.alt = img.alt
  big.classList.toggle('wide', Number(img.getAttribute('width')) > Number(img.getAttribute('height')) * 1.2)
  viewer.showModal(); viewer.scrollTop = 0
})
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close() })

// ---- instructions that appear when a download starts ----
const after = $('#after')
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-download]')
  // Only a real installer link downloads in place; the fallback link leaves for GitHub.
  if (!link || link.dataset.download === 'sums' || !/\.(exe|pkg)$/.test(link.href) || after.contains(link)) return
  const kind = link.dataset.download
  const steps = $('#p-' + kind + ' .guide').cloneNode(true)
  $('#after-steps').replaceChildren(steps, $('.connect').cloneNode(true))
  selectTab($('#t-' + kind))
  after.showModal(); after.scrollTop = 0
})
after.addEventListener('click', (e) => { if (e.target === after || e.target.closest('[data-close]')) after.close() })

// ---- the visitor's computer ----
const system = detectSystem({ userAgent: navigator.userAgent, platform: navigator.userAgentData?.platform ?? navigator.platform, touchPoints: navigator.maxTouchPoints })
const names = { windows: 'a Windows computer', mac: 'a Mac', linux: 'Linux', phone: 'a phone or tablet', other: '' }

function showSystem() {
  const { os, browser } = system, note = $('#note'), buttons = $('.get-buttons')
  const win = $('.get [data-download=windows]'), mac = $('.get [data-download=mac]'), demo = $('.get [data-demo]')
  if (names[os]) $('#detected').textContent = 'You are on ' + names[os] + (browser ? ', using ' + browser : '') + '.'
  const lead = (first) => { buttons.prepend(first); first.classList.replace('ghost', 'gold') }
  const quiet = (...list) => list.forEach((b) => b.classList.replace('gold', 'ghost'))
  if (os === 'windows') { lead(win); quiet(mac) }
  else if (os === 'mac') { lead(mac); quiet(win); selectTab($('#t-mac')) }
  else if (os === 'phone' || os === 'linux') {
    lead(demo); quiet(win, mac)
    note.hidden = false
    note.textContent = os === 'phone' ? 'The app runs on Windows computers and Macs, not on phones. Look around here, then open this page on your computer. '
      : 'The app runs on Windows and Mac only. You can still try it in your browser.'
    if (os === 'phone') {
      note.append(el('a', { textContent: 'Email myself the link', href: 'mailto:?subject=' + encodeURIComponent('Dota Improviser download') + '&body=' + encodeURIComponent(location.origin + location.pathname) }))
      $('#try-note').hidden = false
    }
  }
  const tips = { Chrome: 'If Chrome asks whether to keep the file, choose Keep.', Edge: 'If Edge holds the file back, open the ⋯ menu next to it and choose Keep.', Firefox: 'If Firefox asks, choose to allow the download.' }
  if (tips[browser]) for (const n of $$('[data-browser-tip]')) n.textContent = tips[browser]
  // Only Chromium browsers can say which chip a Mac has.
  if (os === 'mac') navigator.userAgentData?.getHighEntropyValues(['architecture']).then((v) => {
    if (v.architecture !== 'x86') return
    note.hidden = false; note.textContent = 'This looks like an Intel Mac. The app needs a Mac with an Apple chip (M1 or newer), so it will not run on this one. You can still try it in your browser.'
    lead(demo); quiet(mac)
  }).catch(() => {})
}
showSystem()

$('#copy').addEventListener('click', async (e) => {
  const button = e.currentTarget
  try { await navigator.clipboard.writeText(EMAIL); button.textContent = 'Copied' } catch { button.textContent = 'Select the address to copy' }
  setTimeout(() => { button.textContent = 'Copy address' }, 2500)
})

const form = $('#contact-form')
form.topic.addEventListener('change', () => { $('#problem-hint').hidden = form.topic.value !== 'problem' })
form.addEventListener('submit', (e) => {
  e.preventDefault() // nothing is posted anywhere
  if (!form.message.value.trim()) { form.message.value = ''; form.reportValidity(); return }
  const system_ = 'My computer: ' + (names[system.os] || 'unknown') + '\nMy browser: ' + (system.browser || 'unknown') + '\nApp version (if installed): '
  const mail = composeMail({ to: EMAIL, name: form.elements.name.value, topic: form.topic.value, message: form.message.value, system: system_ })
  const gmail = e.submitter?.value === 'gmail'
  if (gmail) window.open(mail.gmail, '_blank', 'noopener,noreferrer')
  else location.href = mail.app
  $('#form-status').textContent = gmail ? 'Gmail opened in a new tab. Press Send there.' : 'Your email app should open now. Press Send there. If nothing happens, use Gmail or copy the address.'
})

// ---- releases: newest from GitHub, with a copy saved beside the page if GitHub can't be reached ----
async function loadReleases() {
  const read = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json() }
  let list = null
  try { list = await read('https://api.github.com/repos/' + REPO + '/releases?per_page=30') } catch { /* rate limit or offline */ }
  if (!Array.isArray(list)) list = await read('releases.json')
  return list.filter((r) => !r.draft && !r.prerelease)
}

const size = (a) => Math.round(a.size / 1048576) + ' MB'
const official = (url) => typeof url === 'string' && url.startsWith('https://github.com/' + REPO + '/')

function showLatest(release) {
  $('[data-version]').textContent = release.tag_name
  const assets = pickAssets(release)
  for (const kind of ['windows', 'mac', 'sums']) {
    const a = assets[kind]
    if (!a || !official(a.browser_download_url)) continue
    for (const link of $$('[data-download=' + kind + ']')) link.href = a.browser_download_url
    const meta = $('[data-meta=' + kind + ']')
    if (meta) meta.textContent = (kind === 'windows' ? 'Windows 10 or 11 · ' : 'Apple chip (M1 or newer) · ') + size(a)
  }
}

let filter = 'all', shown = 5
function releaseCard(release, index) {
  const { items } = parseNotes(release.body)
  const wanted = items.filter((i) => filter === 'all' || i.type === filter)
  if (!wanted.length) return null
  const date = new Date(release.published_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const body = el('div', { className: 'release-body' })
  for (const type of TYPES) {
    const group = wanted.filter((i) => i.type === type)
    if (!group.length) continue
    const rows = group.map((i) => {
      const head = [...(i.area ? [el('span', { className: 'area', textContent: i.area })] : []), i.title]
      return el('li', {}, i.detail ? el('details', {}, el('summary', {}, ...head), el('p', { textContent: i.detail })) : el('span', {}, ...head))
    })
    const section = el('div', { className: 'group' }, el('h4', { textContent: type === 'Improved' ? 'Better' : type }), el('ul', {}, ...rows))
    section.dataset.type = type
    body.append(section)
  }
  const links = el('p', { className: 'release-links' })
  if (official(release.html_url)) links.append(el('a', { href: release.html_url, textContent: 'Download this version and read the full notes' }))
  body.append(links)
  const summary = el('summary', {}, el('strong', { textContent: release.tag_name }), el('span', { textContent: date }))
  if (index === 0) summary.append(el('span', { className: 'badge', textContent: 'Latest' }))
  return el('details', { className: 'release', open: index === 0 }, summary, body)
}

function showUpdates(releases) {
  const cards = releases.map(releaseCard).filter(Boolean)
  $('#releases').replaceChildren(...(cards.length ? cards.slice(0, shown) : [el('p', { textContent: 'Nothing of this kind in the listed updates.' })]))
  $('#older').hidden = cards.length <= shown
}

loadReleases().then((releases) => {
  if (!releases.length) throw new Error('empty')
  showLatest(releases[0])
  showUpdates(releases)
  $('#older').addEventListener('click', () => { shown += 10; showUpdates(releases) })
  $('.filters').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    filter = b.dataset.filter; shown = 5
    for (const other of $$('.filters button')) other.setAttribute('aria-pressed', String(other === b))
    showUpdates(releases)
  })
  const versions = releases.map((r) => parseNotes(r.body).versions).find((v) => v.length) ?? []
  if (versions.length) {
    $('#history ol').replaceChildren(...versions.map((v) => el('li', {}, el('b', { textContent: v.range }), ': ' + v.text)))
    $('#history').hidden = false
  }
}).catch(() => {
  $('#releases').replaceChildren(el('p', {}, 'The update list could not be loaded. ', el('a', { href: 'https://github.com/' + REPO + '/releases', textContent: 'See it on GitHub.' })))
})
