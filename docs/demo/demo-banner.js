// Added to the browser demo only (scripts/build-site.sh): always opens with sample data, and says it is a demo.
if (!/[?&]sample=/.test(location.search)) location.replace('?sample=game' + location.hash)

// The app is a desktop layout: a phone shows it whole and zoomed out instead of cut off. The narrow in-game views fit as they are.
if (!location.hash && Math.min(screen.width, innerWidth) < 900) document.querySelector('meta[name=viewport]').content = 'width=1100'

addEventListener('DOMContentLoaded', () => {
  document.title = 'Dota Improviser: browser demo'
  const style = document.createElement('style')
  style.textContent = `
    .demo-note { position: fixed; z-index: 9999; right: 14px; bottom: 36px; display: flex; flex-wrap: wrap; align-items: center; gap: 12px; max-width: calc(100vw - 28px);
      padding: 10px 14px; background: #15161a; border: 1px solid #d9b66c; border-radius: 8px; color: #eae5da; font: 500 13px/1.4 system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
    .demo-note a { color: #f0d699; font-weight: 700; }
    .demo-note button { background: none; border: 0; color: #bcb5a7; font: 600 13px system-ui, sans-serif; cursor: pointer; padding: 4px; }
    html.overlay-doc .overlay-view { max-width: 460px; margin: 0 auto; }`
  const note = document.createElement('div')
  note.className = 'demo-note'
  note.setAttribute('role', 'note')
  const back = Object.assign(document.createElement('a'), { href: '../', textContent: 'Back to website' })
  const hide = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Hide' })
  hide.addEventListener('click', () => note.remove())
  note.append('Demo with made-up games · © personal use only', back, hide)
  document.head.append(style)
  document.body.append(note)
})
