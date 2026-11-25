import { TYPES, composeMail, detectSystem, parseNotes, pickAssets } from './updates.js'

const REPO = 'abhibizz158/dota-improviser'
const EMAIL = 'abhishekbizz.156@gmail.com'
const $ = (s, root = document) => root.querySelector(s)
const $$ = (s, root = document) => [...root.querySelectorAll(s)]
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n }
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches

// ---- header and menu ----
const bar = $('.top'), menu = $('.menu')
const setMenu = (open) => { bar.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open)) }
menu.addEventListener('click', () => setMenu(!bar.classList.contains('open')))
$('#nav').addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false) })
addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false) })
const onScroll = () => bar.classList.toggle('scrolled', scrollY > 8)
addEventListener('scroll', onScroll, { passive: true }); onScroll()
const here = location.pathname.split('/').pop() || 'index.html'
for (const a of $$('#nav a')) if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page')

// ---- tabs ----
function selectTab(tab) {
  for (const t of $$('[role=tab]', tab.parentElement)) {
    const on = t === tab
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on
  }
}
const step = (list, by, from) => { const tabs = $$('[role=tab]', list); return tabs[(tabs.indexOf(from) + by + tabs.length) % tabs.length] }
for (const list of $$('[role=tablist]')) {
  list.addEventListener('click', (e) => { const t = e.target.closest('[role=tab]'); if (t) selectTab(t) })
  list.addEventListener('keydown', (e) => {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    const next = step(list, by, e.target)
    selectTab(next); next.focus()
  })
}

// ---- motion: sections arrive, screens lean towards the pointer, the overview plays by itself until touched ----
if (!calm && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('js')
  const seen = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target) } }, { rootMargin: '0px 0px -8% 0px' })
  for (const s of $$('.reveal')) seen.observe(s)
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) for (const box of $$('[data-tilt]')) {
    const lean = (x, y) => { box.style.setProperty('--ry', x + 'deg'); box.style.setProperty('--rx', y + 'deg') }
    box.addEventListener('pointermove', (e) => { const r = box.getBoundingClientRect(); lean(((e.clientX - r.left) / r.width - 0.5) * 8, (0.5 - (e.clientY - r.top) / r.height) * 6) })
    box.addEventListener('pointerleave', () => lean(0, 0))
  }
  const show = $('#show-tabs')
  if (show) {
    const section = show.closest('section')
    let visible = false, held = false, done = false
    new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.35 }).observe(section)
    section.addEventListener('pointerenter', () => { held = true }); section.addEventListener('pointerleave', () => { held = false })
    section.addEventListener('focusin', () => { done = true }); section.addEventListener('click', () => { done = true })
    setInterval(() => { if (visible && !held && !done && !document.hidden) selectTab(step(show, 1, $('[aria-selected=true]', show))) }, 5000)
  }
}

// ---- larger pictures ----
const viewer = $('#viewer')
for (const b of $$('.zoom')) b.addEventListener('click', () => {
  const img = $('img', b), big = $('img', viewer)
  big.src = img.getAttribute('src'); big.alt = img.alt
  big.classList.toggle('wide', Number(img.getAttribute('width')) > Number(img.getAttribute('height')) * 1.2)
  viewer.showModal(); viewer.scrollTop = 0
})
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close() })

// ---- the visitor's computer ----
const system = detectSystem({ userAgent: navigator.userAgent, platform: navigator.userAgentData?.platform ?? navigator.platform, touchPoints: navigator.maxTouchPoints })
const names = { windows: 'a Windows computer', mac: 'a Mac', linux: 'Linux', phone: 'a phone or tablet', other: '' }
const tips = { Chrome: 'If Chrome asks, choose Keep.', Edge: 'If Edge holds it back, open ⋯ and choose Keep.', Firefox: 'If Firefox asks, allow the download.' }
const browserTip = (root) => { if (tips[system.browser]) for (const n of $$('[data-browser-tip]', root)) n.textContent = tips[system.browser] }
browserTip(document)
if (system.os === 'mac' && $('#t-mac')) selectTab($('#t-mac'))

function showSystem() {
  const { os, browser } = system, note = $('#note'), buttons = $('.get-buttons')
  if (!buttons) return
  const win = $('[data-download=windows]', buttons), mac = $('[data-download=mac]', buttons), demo = $('[data-demo]', buttons)
  if (names[os]) $('#detected').textContent = 'You are on ' + names[os] + (browser ? ' · ' + browser : '') + '.'
  const lead = (first) => { buttons.prepend(first); first.classList.replace('ghost', 'play') }
  const quiet = (...list) => list.forEach((b) => b.classList.replace('play', 'ghost'))
  if (os === 'windows') { lead(win); quiet(mac) }
  else if (os === 'mac') { lead(mac); quiet(win) }
  else if (os === 'phone' || os === 'linux') {
    lead(demo); quiet(win, mac)
    note.hidden = false
    note.textContent = os === 'phone' ? 'The app runs on Windows and Mac computers, not phones. ' : 'The app runs on Windows and Mac only. Try it in your browser.'
    if (os === 'phone') {
      note.append(el('a', { textContent: 'Email myself the link', href: 'mailto:?subject=' + encodeURIComponent('Dota Improviser download') + '&body=' + encodeURIComponent(location.origin + location.pathname) }))
      const t = $('#try-note'); if (t) t.hidden = false
    }
  }
  // Only Chromium browsers can say which chip a Mac has.
  if (os === 'mac') navigator.userAgentData?.getHighEntropyValues(['architecture']).then((v) => {
    if (v.architecture !== 'x86') return
    note.hidden = false; note.textContent = 'This looks like an Intel Mac. The app needs an Apple chip (M1 or newer). You can still try it in your browser.'
    lead(demo); quiet(mac)
  }).catch(() => {})
}
showSystem()

// ---- picture instructions that appear when a download starts (taken from the install page) ----
const after = $('#after')
document.addEventListener('click', async (e) => {
  const link = e.target.closest('a[data-download]')
  // Only a real installer link downloads in place; the fallback link leaves for GitHub.
  if (!link || link.dataset.download === 'sums' || !/\.(exe|pkg)$/.test(link.href) || after.contains(link)) return
  after.showModal(); after.scrollTop = 0
  try {
    const page = new DOMParser().parseFromString(await (await fetch('install.html')).text(), 'text/html')
    const steps = page.querySelector('#p-' + link.dataset.download + ' .how')
    $('#after-steps').replaceChildren(document.importNode(steps, true))
    browserTip(after)
  } catch { /* the link to the full guide is already there */ }
})
after.addEventListener('click', (e) => { if (e.target === after || e.target.closest('a')) after.close() })

// ---- contact ----
$('#copy')?.addEventListener('click', async (e) => {
  const button = e.currentTarget
  try { await navigator.clipboard.writeText(EMAIL); button.textContent = 'Copied' } catch { button.textContent = 'Select the address to copy' }
  setTimeout(() => { button.textContent = 'Copy address' }, 2500)
})
const form = $('#contact-form')
form?.topic.addEventListener('change', () => { $('#problem-hint').hidden = form.topic.value !== 'problem' })
form?.addEventListener('submit', (e) => {
  e.preventDefault() // nothing is posted anywhere
  if (!form.message.value.trim()) { form.message.value = ''; form.reportValidity(); return }
  const computer = 'My computer: ' + (names[system.os] || 'unknown') + '\nMy browser: ' + (system.browser || 'unknown') + '\nApp version (if installed): '
  const mail = composeMail({ to: EMAIL, name: form.elements.name.value, topic: form.topic.value, message: form.message.value, system: computer })
  const gmail = e.submitter?.value === 'gmail'
  if (gmail) window.open(mail.gmail, '_blank', 'noopener,noreferrer')
  else location.href = mail.app
  $('#form-status').textContent = gmail ? 'Gmail opened in a new tab. Press Send there.' : 'Your email app should open now. If nothing happens, use Gmail.'
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
function ago(date) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date)) / 864e5)), rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return days < 31 ? rel.format(-days, 'day') : rel.format(-Math.round(days / 30), 'month')
}

function showLatest(release) {
  for (const n of $$('[data-version]')) n.textContent = release.tag_name
  for (const n of $$('[data-age]')) n.textContent = ' · updated ' + ago(release.published_at)
  const assets = pickAssets(release)
  for (const kind of ['windows', 'mac', 'sums']) {
    const a = assets[kind]
    if (!a || !official(a.browser_download_url)) continue
    for (const link of $$('[data-download=' + kind + ']')) link.href = a.browser_download_url
    for (const meta of $$('[data-meta=' + kind + ']')) meta.textContent = (kind === 'windows' ? 'Windows 10 or 11 · ' : 'Apple chip (M1 or newer) · ') + size(a)
  }
}

let filter = 'all', shown = 5
function releaseCard(release, index) {
  const wanted = parseNotes(release.body).items.filter((i) => filter === 'all' || i.type === filter)
  if (!wanted.length) return null
  const date = new Date(release.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
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
  if (official(release.html_url)) links.append(el('a', { href: release.html_url, textContent: 'Download and full notes' }))
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

if ($('#releases') || $('[data-version]') || $('[data-download]')) loadReleases().then((releases) => {
  if (!releases.length) throw new Error('empty')
  showLatest(releases[0])
  if (!$('#releases')) return
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
  $('#releases')?.replaceChildren(el('p', {}, 'The update list could not be loaded. ', el('a', { href: 'https://github.com/' + REPO + '/releases', textContent: 'See it on GitHub.' })))
})
