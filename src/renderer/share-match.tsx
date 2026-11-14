import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import type { AppApi } from '../shared/model'
import { Dialog, Feedback, clock } from './ui'

type ShareStats = {
  hero: string; at: number; status: string; role?: string | null; mode?: string | null;
  kills: number | null; deaths: number | null; assists: number | null; gpm: number | null; xpm: number | null; lastHits: number | null;
  performance?: { score: number | null; at: number }
}

function summary(stats: ShareStats) {
  const kda = [stats.kills, stats.deaths, stats.assists]
  const metrics = [
    kda.some((value) => value != null) ? kda.map((value) => value ?? '—').join('/') + ' K/D/A' : null,
    stats.gpm == null ? null : stats.gpm + ' GPM',
    stats.xpm == null ? null : stats.xpm + ' XPM',
    stats.lastHits == null ? null : stats.lastHits + ' last hits',
  ].filter(Boolean).join(' · ')
  return [
    [stats.hero, stats.role, stats.mode, stats.status, clock(stats.at)].filter(Boolean).join(' · '),
    metrics,
    stats.performance?.score != null && `Personal pace ${stats.performance.score}/100 at ${clock(stats.performance.at)}`,
  ].filter(Boolean).join('\n')
}

export function ShareMatch({ api, stats, compact = false }: { api: Pick<AppApi, 'copyShareText'>; stats: ShareStats; compact?: boolean }) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState({ message: '', error: false })
  return <>
    <button className={compact ? 'text-button' : 'button secondary'} type="button" onClick={() => {
      setFeedback({ message: '', error: false })
      setText(summary(stats))
    }}><Share2 size={15} /> Share stats</button>
    {text && <Dialog title="Share your match stats" onClose={() => setText('')}>
      <div className="settings-dialog"><p>Copy this snapshot to paste into a message or post.</p>
        <pre className="share-preview">{text}</pre>
        <button className="button primary" type="button" onClick={() => {
          void api.copyShareText(text).then(() => setFeedback({ message: 'Copied to clipboard.', error: false })).catch(() =>
            setFeedback({ message: 'Could not copy automatically. Select the preview to copy it.', error: true }))
        }}><Copy size={15} /> Copy summary</button>
        <Feedback {...feedback} />
      </div>
    </Dialog>}
  </>
}
