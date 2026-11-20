import { createHash, randomUUID } from 'node:crypto'
import { DEFAULT_RULES, METRICS } from './data.mjs'

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const uuid = prefix => `${prefix}-${randomUUID()}`
const dateOK = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const countOK = n => Number.isSafeInteger(n) && n >= 0
const canonical = x => x && typeof x === 'object' ? Array.isArray(x) ? x.map(canonical) : Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x
export const digest = event => createHash('sha256').update(JSON.stringify(canonical(event))).digest('hex')
export function log(s, type, text, date, now) {
  s.logs.unshift({ id: uuid('log'), type, text, businessDate: date ?? null, at: now })
  s.logs = s.logs.slice(0, 250)
}
export function validate(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new HttpError(422, '事件必须是 JSON 对象')
  if (typeof event.event_id !== 'string' || !/^[\w.-]{1,100}$/.test(event.event_id)) throw new HttpError(422, 'event_id 必须是 1–100 位字母、数字、点、横线或下划线')
  if (!dateOK(event.business_date)) return ['invalid', '业务日期不合法']
  if (event.source !== 'demo-business') return ['invalid', '数据源不匹配']
  if (!Number.isSafeInteger(event.source_version) || event.source_version < 1) return ['invalid', '来源版本必须是正整数']
  if (event.definition_version !== 'metrics-v1') return ['invalid', '指标定义版本不匹配']
  if (typeof event.complete !== 'boolean') return ['invalid', '缺少完整性标识']
  if (!event.complete) return ['incomplete', '上游标记数据尚未完整，暂不判断业务变化']
  const c = event.counts
  if (!c || !['dau', 'impressions', 'clicks', 'initiated', 'succeeded'].every(k => countOK(c[k]))) return ['invalid', '原始计数必须完整且为非负安全整数']
  if (c.clicks > c.impressions || c.succeeded > c.initiated) return ['invalid', '点击不能超过曝光，成功任务不能超过发起任务']
  if (c.impressions < 1000 || c.initiated < 1000) return ['insufficient', '比例指标分母不足 1,000，证据不足']
  return ['valid', '数据完整且校验通过']
}
export function baseline(s, event, rules = DEFAULT_RULES) {
  const weekday = new Date(event.business_date).getUTCDay()
  const byDate = new Map()
  for (const row of [...s.history, ...s.snapshots]) {
    if (row.business_date < event.business_date && row.complete && row.definition_version === event.definition_version && new Date(row.business_date).getUTCDay() === weekday) {
      const old = byDate.get(row.business_date)
      if (!old || row.source_version > old.source_version) byDate.set(row.business_date, row)
    }
  }
  const rows = [...byDate.values()].filter(r => validate({ ...r, source: 'demo-business', event_id: 'history' })[0] === 'valid').sort((a, b) => b.business_date.localeCompare(a.business_date)).slice(0, rules.samples)
  if (rows.length < rules.samples) return { sufficient: false, samples: rows.length, dates: rows.map(r => r.business_date) }
  const sums = Object.fromEntries(['dau', 'impressions', 'clicks', 'initiated', 'succeeded'].map(k => [k, rows.reduce((n, r) => n + r.counts[k], 0)]))
  return {
    sufficient: true, samples: rows.length, dates: rows.map(r => r.business_date).sort(),
    values: { dau: sums.dau / rows.length, ctr: sums.clicks / sums.impressions, completion: sums.succeeded / sums.initiated },
    sums, observations: [...rows].reverse().map(r => ({ date: r.business_date, ctr: r.counts.clicks / r.counts.impressions, dau: r.counts.dau, completion: r.counts.succeeded / r.counts.initiated })),
  }
}
function groupsFor(event, base) {
  if (!Array.isArray(event.groups) || event.groups.length === 0) return { valid: false, reason: '未提供分组数据，暂时无法判断平台影响范围。', rows: [] }
  const rows = event.groups
  if (rows.length > 20 || !rows.every(g => typeof g.name === 'string' && g.name.length > 0 && g.name.length <= 60 && ['impressions', 'clicks', 'baseline_impressions', 'baseline_clicks'].every(k => countOK(g[k])) && g.impressions >= 1000 && g.baseline_impressions >= 1000 && g.clicks <= g.impressions && g.baseline_clicks <= g.baseline_impressions) || new Set(rows.map(g => g.name)).size !== rows.length) return { valid: false, reason: '分组字段不合法或样本不足，暂时无法判断平台影响范围。', rows: [] }
  const sum = k => rows.reduce((n, g) => n + g[k], 0)
  if (sum('impressions') !== event.counts.impressions || sum('clicks') !== event.counts.clicks || Math.abs(sum('baseline_impressions') - base.sums.impressions / base.samples) > 0.01 || Math.abs(sum('baseline_clicks') - base.sums.clicks / base.samples) > 0.01) return { valid: false, reason: '分组与整体计数或同星期基线不一致，不能据此确定影响范围。', rows: [] }
  return { valid: true, reason: null, rows: rows.map(g => ({ ...g, rate: g.clicks / g.impressions, baselineRate: g.baseline_clicks / g.baseline_impressions, missingClicks: g.baseline_clicks - g.clicks })) }
}
export function calculate(s, event, rules) {
  const base = baseline(s, event, rules)
  if (!base.sufficient) return { sufficient: false, baseline: base }
  const c = event.counts
  const values = { dau: c.dau, ctr: c.clicks / c.impressions, completion: c.succeeded / c.initiated }
  const metrics = Object.keys(METRICS).map(key => {
    const reference = base.values[key], current = values[key]
    const relativeDrop = reference > 0 ? (reference - current) / reference : 0
    const absoluteDrop = reference - current
    return { key, name: METRICS[key], current, baseline: reference, relativeDrop, absoluteDrop, abnormal: reference > 0 && relativeDrop + 1e-12 >= rules.relativeDrop && (key === 'dau' || absoluteDrop + 1e-12 >= rules.absoluteDrop), recovered: reference > 0 && current + 1e-12 >= reference * rules.recovery }
  })
  return {
    sufficient: true, businessDate: event.business_date, sourceVersion: event.source_version, eventId: event.event_id,
    counts: structuredClone(c), baseline: base, metrics, groups: groupsFor(event, base), releases: Array.isArray(event.releases) ? event.releases.filter(r => typeof r.label === 'string' && r.label.length <= 200 && r.date === event.business_date && typeof r.platform === 'string').slice(0, 10) : [],
    rules: { ...rules },
  }
}
const percent = n => `${+(n * 100).toFixed(2)}%`
function messageCopy(metric, evidence, restored = false) {
  if (restored) return `${metric.name}已回升至${metric.key === 'dau' ? metric.current.toLocaleString('zh-CN') : percent(metric.current)}，达到同星期基线的 ${+(metric.current / metric.baseline * 100).toFixed(1)}%。本事项已恢复。`
  const change = metric.key === 'dau' ? `相对下降 ${percent(metric.relativeDrop)}` : `下降 ${+(metric.absoluteDrop * 100).toFixed(2)} 个百分点，相对下降 ${percent(metric.relativeDrop)}`
  const locations = evidence.groups.valid && metric.key === 'ctr' ? evidence.groups.rows.filter(g => g.missingClicks > 0).map(g => `${g.name} 点击减少 ${g.missingClicks.toLocaleString('zh-CN')}`).join('；') : ''
  return `${metric.name}从同星期基线 ${metric.key === 'dau' ? metric.baseline.toLocaleString('zh-CN') : percent(metric.baseline)} 降至 ${metric.key === 'dau' ? metric.current.toLocaleString('zh-CN') : percent(metric.current)}，${change}。${locations ? `${locations}，这是影响范围线索，原因仍待核验。` : '影响范围需要进一步核验。'}`
}
function notify(s, incident, metric, evidence, type, now) {
  if (incident.muted) return
  const message = { id: uuid('msg'), taskId: s.task.id, incidentId: incident.id, type, title: type === 'recovery' ? `${metric.name}已恢复` : `${metric.name}出现值得关注的下降`, text: messageCopy(metric, evidence, type === 'recovery'), evidence: structuredClone(evidence), read: false, createdAt: now, businessDate: evidence.businessDate }
  s.messages.unshift(message)
  if (type === 'alert') incident.status = 'notified'
}
export function analyze(s, event, now) {
  const task = s.task
  const evidence = calculate(s, event, task.rules)
  task.lastReceivedAt = now
  if (!evidence.sufficient) { task.dataStatus = 'insufficient'; task.dataReason = `只有 ${evidence.baseline.samples} 个同星期可比样本，需要 ${task.rules.samples} 个。`; log(s, 'insufficient', task.dataReason, event.business_date, now); return { status: 'insufficient', reason: task.dataReason } }
  task.dataStatus = 'valid'; task.dataReason = '数据完整且校验通过'; task.lastCheckedAt = now; task.lastSuccessfulDate = event.business_date; task.latestEvidence = evidence
  let opened = 0, recovered = 0, tracked = 0
  for (const metric of evidence.metrics) {
    let incident = s.incidents.find(i => i.taskId === task.id && i.metric === metric.key && i.status !== 'recovered')
    if (!incident && metric.abnormal) {
      incident = { id: uuid('issue'), taskId: task.id, metric: metric.key, status: 'confirmed', muted: false, openedAt: now, openedDate: event.business_date, updatedAt: now, evidence, updates: [{ date: event.business_date, current: metric.current, baseline: metric.baseline }] }
      s.incidents.unshift(incident); notify(s, incident, metric, evidence, 'alert', now); opened++
    } else if (incident) {
      incident.evidence = evidence; incident.updatedAt = now
      incident.updates.push({ date: event.business_date, current: metric.current, baseline: metric.baseline })
      incident.updates = incident.updates.slice(-50)
      if (metric.recovered) { incident.status = 'recovered'; incident.recoveredAt = now; notify(s, incident, metric, evidence, 'recovery', now); recovered++ }
      else { tracked++; const original = s.messages.find(m => m.incidentId === incident.id && m.type === 'alert'); if (original) { original.text = messageCopy(metric, evidence); original.businessDate = event.business_date; original.evidence = structuredClone(evidence) } }
    }
  }
  task.checks = (task.checks ?? 0) + 1
  const status = opened ? 'anomaly' : recovered ? 'recovery' : tracked ? 'tracking' : 'normal'
  log(s, status, status === 'normal' ? '三项指标均在演示判断范围内；保持安静，未发送业务消息。' : status === 'anomaly' ? `确认 ${opened} 项新异常，已完成只读分析并写入站内消息。` : status === 'recovery' ? `更新 ${recovered} 项恢复，沿用原异常事项。` : '继续更新同一异常事项，没有重复提醒。', event.business_date, now)
  return { status, opened, recovered, tracked, business_date: event.business_date, metrics: evidence.metrics }
}
export function processEvent(s, event, now = new Date().toISOString()) {
  validate(event) // Validate envelope before fingerprint lookup.
  const hash = digest(event), prior = s.events.find(e => e.id === event.event_id)
  if (prior) {
    if (prior.hash !== hash) throw new HttpError(409, '同一 event_id 携带不同内容，已拒绝；请使用新的事件标识')
    return structuredClone(prior.result)
  }
  if (s.events.length >= 2000) throw new HttpError(409, '演示空间已达到 2,000 个事件，请重置后再演示')
  const [quality, reason] = validate(event)
  const record = result => { s.events.push({ id: event.event_id, hash, date: event.business_date, version: event.source_version, receivedAt: now, result }); return result }
  const stale = dateOK(event.business_date) && Number.isSafeInteger(event.source_version) && s.cursor && (event.business_date < s.cursor.date || (event.business_date === s.cursor.date && event.source_version <= s.cursor.version))
  if (stale) { log(s, 'stale', '旧日期或非更新版本已记录，未覆盖当前数据和事项。', event.business_date, now); return record({ status: 'stale', reason: '旧日期或较低/相同版本，不覆盖当前状态' }) }
  if (quality !== 'invalid') s.cursor = { date: event.business_date, version: event.source_version }
  if (quality === 'valid') {
    s.snapshots = s.snapshots.filter(r => r.business_date !== event.business_date)
    s.snapshots.push(structuredClone(event)); s.snapshots = s.snapshots.slice(-100)
  }
  if (!s.source.connected) { log(s, 'connection_error', '数据源连接失效，未执行分析或业务提醒。', event.business_date, now); return record({ status: 'connection_error' }) }
  if (!s.task || s.task.status === 'ended') { log(s, 'waiting', '快照已接收；尚无运行中的持续任务。', event.business_date, now); return record({ status: 'no_task', quality }) }
  s.task.lastReceivedAt = now
  if (s.task.status === 'paused') { log(s, 'paused', '任务暂停中，仅保存最新有效快照，未执行分析或业务提醒。', event.business_date, now); return record({ status: 'paused', quality }) }
  if (quality !== 'valid') {
    s.task.dataStatus = quality; s.task.dataReason = reason
    log(s, quality, reason, event.business_date, now)
    return record({ status: quality, reason })
  }
  return record(analyze(s, event, now))
}
export function resumeLatest(s, now) {
  const latest = s.snapshots.at(-1)
  if (latest && s.cursor && latest.business_date === s.cursor.date && latest.source_version === s.cursor.version) return analyze(s, latest, now)
  if (s.task && s.cursor) { s.task.dataStatus = 'incomplete'; s.task.dataReason = '最近一份快照没有足够有效证据；等待下一次完整更新。' }
  return { status: 'waiting' }
}
export function parseDelegation(text) {
  return typeof text === 'string' && /(持续|监控|关注|跟进)/.test(text) && /(DAU|日活)/i.test(text) && /(点击率|CTR)/i.test(text) && /(完成率)/.test(text)
}
export function createDraft(s, text, sessionId, now) {
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw new HttpError(422, '请输入 1–5,000 字的请求')
  let session = s.sessions.find(c => c.id === sessionId)
  if (!session) { session = { id: uuid('chat'), title: text.slice(0, 22), messages: [], createdAt: now }; s.sessions.unshift(session) }
  session.messages.push({ id: uuid('turn'), role: 'user', text, at: now })
  const matched = parseDelegation(text)
  let draft = null
  if (matched && (!s.task || s.task.status === 'ended')) { draft = { id: uuid('draft'), sessionId: session.id, request: text, rules: { ...DEFAULT_RULES }, at: now }; s.drafts.push(draft) }
  const reply = draft ? '我会持续关注这三项业务指标。每次完整数据更新后，先与同星期历史比较；值得处理时分析影响范围，再在这里提醒你。正常更新保持安静。\n开始前，确认一下跟进范围。' : matched ? '这项持续任务已经建立。你可以在“持续任务”中暂停、恢复或调整判断依据。' : '这份原型只模拟业务指标持续跟进，不调用真实 Kimi 模型。你的消息已保存；我暂时不能完成这个请求，但离开本会话不会中断后台任务。'
  session.messages.push({ id: uuid('turn'), role: 'assistant', text: reply, draftId: draft?.id ?? null, at: now })
  return { sessionId: session.id, draft }
}
export function startTask(s, draftId, now) {
  const draft = s.drafts.find(d => d.id === draftId)
  if (!draft) throw new HttpError(404, '没有可确认的委托')
  if (s.task && s.task.status !== 'ended') { if (s.task.draftId === draftId) return s.task; throw new HttpError(409, '演示空间已有持续任务') }
  s.task = { id: uuid('task'), draftId, sessionId: draft.sessionId, title: '业务核心指标异动监测', request: draft.request, status: s.source.connected ? 'running' : 'connection_error', desiredStatus: 'running', dataStatus: 'waiting', dataReason: '等待上游更新完整数据', rules: { ...draft.rules }, createdAt: now, lastCheckedAt: null, lastSuccessfulDate: null, checks: 0 }
  log(s, 'started', '持续跟进已开启；异常时先进行只读分析，再通知。', null, now)
  if (s.source.connected) resumeLatest(s, now)
  return s.task
}
