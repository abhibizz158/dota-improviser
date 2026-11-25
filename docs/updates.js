// Turns a GitHub release's notes into sections (New / Improved / Fixed), and picks the visitor's computer.
// Pure functions, tested in tests/site.test.mjs.

export const TYPES = ['New', 'Improved', 'Fixed']

const AREAS = [
  ['Strategize', /strategize|replay playback|planning board|\brooms?\b/i], ['In-game panel', /overlay|ward map|reminder|coach tips/i],
  ['Match review', /match review|support report/i], ['Chat', /\bchat\b|translat/i], ['Hero picks', /draft (help|suggest|page)|hero suggestions/i],
  ['Heroes', /\bhero(es)? (notes|library|page)/i], ['Install and speed', /windows|mac ?os|install|startup|lag\b/i],
]
// A heading in the notes called New / Improved / Fixed (or similar) wins over guessing.
const headingType = (h) => /^(new|added)\b/i.test(h) ? 'New' : /^(improve|change|better)/i.test(h) ? 'Improved' : /^(fix|bug)/i.test(h) ? 'Fixed' : null
const FIXED = /\bfixed\b|^\W*fix\b|works again|no longer|did nothing|now click|never showed|crash/i
const IMPROVED = /improv|better|faster|tid(y|ied)|fewer|lighter|smoother|less lag|upgrade|optimi/i

function toItem(raw, heading) {
  const bold = raw.match(/^\*\*(.+?)\*\*:?\s*(.*)$/s)
  let title, detail
  if (bold) [, title, detail] = bold
  else {
    // First sentence (or "Label: first sentence") is the headline, the rest is the detail.
    const cut = raw.search(/\.\s+(?=[A-Z0-9])/)
    title = cut > 0 ? raw.slice(0, cut + 1) : raw
    detail = cut > 0 ? raw.slice(cut + 1) : ''
  }
  const plain = (s) => s.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
  title = plain(title).replace(/[:.]$/, '')
  detail = plain(detail)
  const type = headingType(heading) ?? (FIXED.test(raw) ? 'Fixed' : IMPROVED.test(title) ? 'Improved' : 'New')
  const area = AREAS.find(([, re]) => re.test(heading))?.[0] ?? AREAS.find(([, re]) => re.test(title))?.[0] ?? ''
  return { type, area, title, detail }
}

export function parseNotes(body = '') {
  const [notes, history = ''] = String(body).replace(/\r/g, '').split(/^##\s+Version history.*$/m)
  const items = []
  let heading = '', open = null
  const close = () => { if (open) items.push(toItem(open.text, open.heading)); open = null }
  for (const line of notes.split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)$/)
    if (h) { close(); heading = /^v?\d+\.\d+/.test(h[1]) ? '' : h[1].trim(); continue }
    if (/^[-*]\s+/.test(line)) { close(); open = { heading, text: line.replace(/^[-*]\s+/, '').trim() } }
    else if (open && /^\s+\S/.test(line)) open.text += ' ' + line.trim().replace(/^[-*]\s+/, '')
    else if (!line.trim() || /^---+$/.test(line)) close()
    else if (open) open.text += ' ' + line.trim()
  }
  close()
  const versions = [...history.matchAll(/^\s*\d+\.\s+\*\*(.+?)\*\*:?\s*(.*)$/gm)].map((m) => ({ range: m[1], text: m[2].trim() }))
  return { items, versions }
}

export function detectSystem({ userAgent = '', platform = '', touchPoints = 0 } = {}) {
  const ua = userAgent
  // iPadOS says it is a Mac; a touch screen gives it away.
  const os = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || (/Mac/.test(ua) && touchPoints > 1) ? 'phone'
    : /Windows/i.test(platform + ' ' + ua) ? 'windows' : /Mac/i.test(platform + ' ' + ua) ? 'mac' : /Linux|X11|CrOS/i.test(platform + ' ' + ua) ? 'linux' : 'other'
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ''
  return { os, browser }
}

export const pickAssets = (release) => {
  const find = (re) => release?.assets?.find((a) => re.test(a.name)) ?? null
  return { windows: find(/windows.*setup\.exe$/i), mac: find(/macos.*\.pkg$/i), sums: find(/sha256sums/i) }
}

// The contact form only prepares an email; the visitor sends it from their own email.
const TOPICS = { question: 'question', problem: 'problem', idea: 'idea', business: 'enquiry' }
export function composeMail({ to, name = '', topic = 'question', message = '', system = '' }) {
  const subject = 'Dota Improviser: ' + (TOPICS[topic] ?? 'message')
  const body = [message.trim(), name.trim() && '\n' + name.trim(), topic === 'problem' && system && '\n---\n' + system].filter(Boolean).join('\n')
  const q = encodeURIComponent
  return {
    subject, body,
    app: 'mailto:' + to + '?subject=' + q(subject) + '&body=' + q(body),
    gmail: 'https://mail.google.com/mail/?view=cm&fs=1&to=' + q(to) + '&su=' + q(subject) + '&body=' + q(body),
  }
}
