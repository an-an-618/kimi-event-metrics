import test from 'node:test'
import assert from 'node:assert/strict'
import { seed, example } from '../server/data.mjs'
import { baseline, processEvent, createDraft, startTask, resumeLatest, calculate, HttpError } from '../server/engine.mjs'
import { REQUEST } from '../server/data.mjs'
const now = '2026-11-21T12:00:00Z'
function started() { const s = seed(); const draft = createDraft(s, REQUEST, undefined, now); startTask(s, draft.draft.id, now); return s }
test('49 complete observations give 7 comparable samples for every weekday', () => {
  const s = seed()
  assert.equal(s.history.length, 49)
  for (let d = 20; d <= 26; d++) {
    const b = baseline(s, { business_date: `2026-11-${d}`, definition_version: 'metrics-v1' })
    assert.equal(b.samples, 7); assert.deepEqual(b.values, { dau: 100000, ctr: .08, completion: .95 })
  }
})
test('natural delegation is recognized but task starts only after confirmation', () => {
  const s = seed(), draft = createDraft(s, REQUEST, undefined, now)
  assert.equal(s.task, null); assert.ok(draft.draft)
  startTask(s, draft.draft.id, now); assert.equal(s.task.status, 'running')
  assert.equal(startTask(s, draft.draft.id, now).id, s.task.id)
})
test('normal snapshot is quiet; anomaly is calculated, grouped and notified', () => {
  const s = started()
  assert.equal(processEvent(s, example('normal', 'n')).status, 'normal'); assert.equal(s.messages.length, 0)
  assert.equal(processEvent(s, example('anomaly', 'a')).status, 'anomaly'); assert.equal(s.messages.length, 1)
  const e = s.incidents[0].evidence, m = e.metrics.find(m => m.key === 'ctr')
  assert.equal(m.current, .05); assert.equal(m.baseline, .08)
  assert.ok(Math.abs(m.absoluteDrop - .03) < 1e-10)
  assert.ok(Math.abs(m.relativeDrop - .375) < 1e-10)
  assert.equal(e.groups.rows[0].missingClicks, 30000)
  assert.equal(e.groups.rows[1].missingClicks, 0)
  assert.equal(e.metrics.filter(m => m.abnormal).length, 1)
})
test('same event is idempotent; conflicting content rejects without mutation', () => {
  const s = started(), e = example('anomaly', 'same'), first = processEvent(s, e)
  assert.deepEqual(processEvent(s, e), first); assert.equal(s.messages.length, 1); assert.equal(s.events.length, 1)
  const conflict = structuredClone(e); conflict.counts.clicks++
  assert.throws(() => processEvent(s, conflict), e => e instanceof HttpError && e.status === 409)
  assert.equal(s.messages.length, 1)
})
test('incomplete data is not a decline and cannot recover an active incident', () => {
  const s = started(); processEvent(s, example('anomaly', 'a'))
  assert.equal(processEvent(s, example('incomplete', 'inc')).status, 'incomplete')
  assert.equal(s.task.dataStatus, 'incomplete'); assert.equal(s.incidents[0].status, 'notified'); assert.equal(s.messages.length, 1)
})
test('same-day lower version and old dates cannot roll current state back', () => {
  const s = started(), high = example('anomaly', 'v3'); high.source_version = 3; processEvent(s, high)
  const low = example('normal', 'low'); low.business_date = high.business_date; low.source_version = 2
  assert.equal(processEvent(s, low).status, 'stale')
  assert.equal(processEvent(s, example('stale', 'old')).status, 'stale')
  assert.equal(s.task.latestEvidence.sourceVersion, 3); assert.equal(s.task.dataStatus, 'valid'); assert.equal(s.messages.length, 1)
})
test('missing, changed and inconsistent groups change analysis instead of fixed Android conclusion', () => {
  const s = started(), no = example('no-groups', 'no')
  processEvent(s, no); assert.equal(s.incidents[0].evidence.groups.valid, false)
  assert.ok(!s.messages[0].text.includes('Android'))
  const changed = example('anomaly', 'changed'); changed.source_version = 2
  changed.groups[0].clicks = 30000; changed.groups[1].clicks = 20000
  processEvent(s, changed)
  assert.match(s.messages[0].text, /Android 点击减少 18,000/); assert.match(s.messages[0].text, /iOS 点击减少 12,000/)
  const invalid = example('anomaly', 'bad-groups'); invalid.source_version = 3; invalid.groups.pop()
  processEvent(s, invalid); assert.equal(s.incidents[0].evidence.groups.valid, false)
  assert.ok(!s.messages[0].text.includes('Android'))
})
test('recovery updates same incident and only sends one recovery message', () => {
  const s = started(); processEvent(s, example('anomaly', 'a')); const id = s.incidents[0].id
  const e = example('recovery', 'r'); processEvent(s, e); processEvent(s, e)
  const r2 = example('recovery', 'r2'); r2.source_version = 2; processEvent(s, r2)
  assert.equal(s.incidents.length, 1); assert.equal(s.incidents[0].id, id); assert.equal(s.incidents[0].status, 'recovered')
  assert.equal(s.messages.length, 2); assert.equal(s.messages[0].type, 'recovery')
})
test('hysteresis preserves an incident between trigger and recovery thresholds', () => {
  const s = started(); processEvent(s, example('anomaly', 'a'))
  const middle = example('anomaly', 'middle'); middle.source_version = 2; middle.counts.clicks = 70000; delete middle.groups
  processEvent(s, middle); assert.equal(s.incidents[0].status, 'notified'); assert.equal(s.messages.length, 1)
  const high = example('anomaly', 'high'); high.source_version = 3; high.counts.clicks = 76000; delete high.groups
  processEvent(s, high); assert.equal(s.incidents[0].status, 'recovered')
})
test('pause stores but does not analyze; resume checks latest valid only', () => {
  const s = started(); s.task.status = 'paused'
  processEvent(s, example('anomaly', 'a')); processEvent(s, example('recovery', 'r'))
  assert.equal(s.messages.length, 0); assert.equal(s.task.checks, 0)
  s.task.status = 'running'; resumeLatest(s, now)
  assert.equal(s.messages.length, 0); assert.equal(s.task.latestEvidence.businessDate, '2026-11-22')
})
test('source failure visibly stops analysis and reconnect catches latest only', () => {
  const s = started(); s.source.connected = false; s.task.status = 'connection_error'
  assert.equal(processEvent(s, example('anomaly', 'a')).status, 'connection_error')
  assert.equal(s.messages.length, 0)
  s.source.connected = true; s.task.status = 'running'; resumeLatest(s, now)
  assert.equal(s.messages.length, 1)
})
test('invalid counts, definition mismatch and insufficient evidence are not business alerts', () => {
  for (const change of [e => e.counts.clicks = -1, e => e.counts.succeeded = 100001, e => e.definition_version = 'metrics-v2', e => e.counts.impressions = 500]) {
    const s = started(), e = example('normal', 'bad'); change(e); processEvent(s, e); assert.equal(s.messages.length, 0)
  }
  const s = started(); s.history = s.history.slice(0, 14)
  assert.equal(processEvent(s, example('normal', 'few')).status, 'insufficient'); assert.equal(s.messages.length, 0)
})
test('ratio baseline weights denominators rather than averaging rates', () => {
  const s = seed()
  for (const row of s.history) if (new Date(row.business_date).getUTCDay() === 5) { row.counts.impressions = 1000; row.counts.clicks = 100 }
  const fridays = s.history.filter(r => new Date(r.business_date).getUTCDay() === 5)
  fridays[0].counts.impressions = 100000; fridays[0].counts.clicks = 1000
  const b = baseline(s, example('normal', 'weight'))
  assert.ok(Math.abs(b.values.ctr - 1600 / 106000) < 1e-12)
})
test('acknowledged state stays active and muted items suppress further messages', () => {
  const s = started(); processEvent(s, example('anomaly', 'a'))
  s.incidents[0].status = 'known'; s.incidents[0].muted = true
  const same = example('anomaly', 'next'); same.source_version = 2; processEvent(s, same)
  assert.equal(s.incidents[0].status, 'known')
  processEvent(s, example('recovery', 'r'))
  assert.equal(s.incidents[0].status, 'recovered'); assert.equal(s.messages.length, 1)
})
