import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { seed } from './data.mjs'
let singleton, initializing
export async function store() {
  if (singleton) return singleton
  if (!initializing) initializing = initialize().catch(error => { initializing = undefined; throw error })
  return initializing
}
async function initialize() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (url) {
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 12000 })
    await pool.query('CREATE TABLE IF NOT EXISTS kimi_metric_demo_states (workspace TEXT PRIMARY KEY, data JSONB NOT NULL)')
    singleton = {
      mode: 'postgres', persistent: true,
      async read(key) { const r = await pool.query('SELECT data FROM kimi_metric_demo_states WHERE workspace=$1', [key]); return r.rows[0]?.data ?? seed() },
      async mutate(key, fn) {
        const c = await pool.connect()
        try {
          await c.query('BEGIN')
          await c.query('INSERT INTO kimi_metric_demo_states (workspace,data) VALUES ($1,$2) ON CONFLICT DO NOTHING', [key, JSON.stringify(seed())])
          const r = await c.query('SELECT data FROM kimi_metric_demo_states WHERE workspace=$1 FOR UPDATE', [key])
          const s = r.rows[0].data, result = fn(s)
          await c.query('UPDATE kimi_metric_demo_states SET data=$2 WHERE workspace=$1', [key, JSON.stringify(s)])
          await c.query('COMMIT')
          return result
        } catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
      },
    }
  } else {
    const { DatabaseSync } = await import('node:sqlite')
    const path = process.env.SQLITE_PATH || (process.env.VERCEL ? '/tmp/kimi-metrics.sqlite' : resolve('data/kimi-metrics.sqlite'))
    mkdirSync(dirname(path), { recursive: true })
    const db = new DatabaseSync(path)
    db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS states (workspace TEXT PRIMARY KEY, data TEXT NOT NULL)')
    const get = db.prepare('SELECT data FROM states WHERE workspace=?'), put = db.prepare('INSERT INTO states (workspace,data) VALUES (?,?) ON CONFLICT(workspace) DO UPDATE SET data=excluded.data')
    singleton = {
      mode: process.env.VERCEL ? 'ephemeral-sqlite' : 'sqlite', persistent: !process.env.VERCEL,
      async read(key) { const row = get.get(key); return row ? JSON.parse(row.data) : seed() },
      async mutate(key, fn) {
        db.exec('BEGIN IMMEDIATE')
        try { const row = get.get(key); const s = row ? JSON.parse(row.data) : seed(); const result = fn(s); put.run(key, JSON.stringify(s)); db.exec('COMMIT'); return result }
        catch (e) { db.exec('ROLLBACK'); throw e }
      },
    }
  }
  return singleton
}
