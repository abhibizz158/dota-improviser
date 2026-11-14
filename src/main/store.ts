import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { MatchReview, SourceResult } from '../shared/model.js'

function openDb(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS responses (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
  `)
  return db
}

export class Store {
  private db: DatabaseSync
  private readonly path: string

  constructor(path: string) {
    this.path = path
    mkdirSync(dirname(path), { recursive: true })
    this.db = openDb(path)
  }

  /** node:sqlite's handle can go bad without this process doing anything wrong — a cloud-synced Documents
   * folder (OneDrive's "Files On-Demand" is on by default for many Windows accounts) can swap the real file
   * out for an online-only placeholder mid-session, and antivirus/backup tools can transiently lock it. Rather
   * than leave every later call wedged on "unable to open database file" for the rest of the session, reopen
   * once and retry before actually failing. */
  private run<T>(fn: (db: DatabaseSync) => T): T {
    try { return fn(this.db) }
    catch (error) {
      if (!(error instanceof Error) || !/unable to open database file/i.test(error.message)) throw error
      try { this.db.close() } catch { /* already broken; nothing to clean up */ }
      mkdirSync(dirname(this.path), { recursive: true })
      this.db = openDb(this.path)
      return fn(this.db)
    }
  }

  get<T>(key: string): T | undefined {
    return this.run((db) => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
      return row ? JSON.parse(String(row.value)) as T : undefined
    })
  }

  set(key: string, value: unknown) {
    this.run((db) => db.prepare('INSERT OR REPLACE INTO settings VALUES (?, ?)').run(key, JSON.stringify(value)))
  }

  cached<T>(key: string): SourceResult<T> | undefined {
    return this.run((db) => {
      const row = db.prepare('SELECT value, updated FROM responses WHERE key = ?').get(key)
      return row ? { data: JSON.parse(String(row.value)) as T, updatedAt: Number(row.updated), stale: false } : undefined
    })
  }

  savedReviews() {
    return this.run((db) => db.prepare("SELECT value FROM responses WHERE key LIKE '/matches/%'").all()
      .map((row) => JSON.parse(String(row.value)) as MatchReview))
  }

  put<T>(key: string, value: T): SourceResult<T> {
    const updatedAt = Date.now()
    this.run((db) => db.prepare('INSERT OR REPLACE INTO responses VALUES (?, ?, ?)').run(key, JSON.stringify(value), updatedAt))
    return { data: value, updatedAt, stale: false }
  }

  invalidate(key: string) {
    this.run((db) => db.prepare('DELETE FROM responses WHERE key = ?').run(key))
  }

  invalidatePrefix(prefix: string) {
    this.run((db) => db.prepare('DELETE FROM responses WHERE key LIKE ?').run(prefix + '%'))
  }

  /** Keys under `prefix` whose stored value is JSON-truthy (not "", 0, false, null) — e.g. pending replay-parse jobs. */
  keysWithPrefix(prefix: string): string[] {
    return this.run((db) => db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all(prefix + '%')
      .filter((row) => { try { return Boolean(JSON.parse(String(row.value))) } catch { return false } })
      .map((row) => String(row.key).slice(prefix.length)))
  }

  clear() {
    this.run((db) => { db.exec('BEGIN; DELETE FROM responses; DELETE FROM settings; COMMIT;'); db.exec('VACUUM;') })
  }

  close() { this.db.close() }
}
