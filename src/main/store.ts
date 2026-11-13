import { DatabaseSync } from 'node:sqlite'
import type { MatchReview, SourceResult } from '../shared/model.js'

export class Store {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS responses (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
    `)
  }

  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(String(row.value)) as T : undefined
  }

  set(key: string, value: unknown) {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(key, JSON.stringify(value))
  }

  cached<T>(key: string): SourceResult<T> | undefined {
    const row = this.db.prepare('SELECT value, updated FROM responses WHERE key = ?').get(key)
    return row ? { data: JSON.parse(String(row.value)) as T, updatedAt: Number(row.updated), stale: false } : undefined
  }

  savedReviews() {
    return this.db.prepare("SELECT value FROM responses WHERE key LIKE '/matches/%'").all()
      .map((row) => JSON.parse(String(row.value)) as MatchReview)
  }

  put<T>(key: string, value: T): SourceResult<T> {
    const updatedAt = Date.now()
    this.db.prepare('INSERT OR REPLACE INTO responses VALUES (?, ?, ?)').run(key, JSON.stringify(value), updatedAt)
    return { data: value, updatedAt, stale: false }
  }

  invalidate(key: string) {
    this.db.prepare('DELETE FROM responses WHERE key = ?').run(key)
  }

  invalidatePrefix(prefix: string) {
    this.db.prepare('DELETE FROM responses WHERE key LIKE ?').run(prefix + '%')
  }

  /** Keys under `prefix` whose stored value is JSON-truthy (not "", 0, false, null) — e.g. pending replay-parse jobs. */
  keysWithPrefix(prefix: string): string[] {
    return this.db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all(prefix + '%')
      .filter((row) => { try { return Boolean(JSON.parse(String(row.value))) } catch { return false } })
      .map((row) => String(row.key).slice(prefix.length))
  }

  clear() {
    this.db.exec('BEGIN; DELETE FROM responses; DELETE FROM settings; COMMIT;')
    this.db.exec('VACUUM;')
  }

  close() { this.db.close() }
}
