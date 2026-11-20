export const REQUEST = '帮我持续关注业务的 DAU、内容点击率和任务完成率。每天数据更新后检查，有值得处理的异动就先分析影响范围，再提醒我；正常时不用每天汇报。'
export const METRICS = { dau: 'DAU', ctr: '内容点击率', completion: '任务完成率' }
export const DEFAULT_RULES = { relativeDrop: 0.2, absoluteDrop: 0.01, recovery: 0.95, minDenominator: 1000, samples: 7 }
const weekDau = [98000, 101000, 99000, 102000, 100000, 99500, 100500]
const weekClicks = [79000, 80000, 81000, 78000, 82000, 80000, 80000]
const weekSuccess = [94000, 95000, 96000, 95000, 94000, 96000, 95000]
export function history() {
  return Array.from({ length: 49 }, (_, i) => ({
    business_date: new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10),
    source_version: 1, complete: true, definition_version: 'metrics-v1',
    counts: { dau: weekDau[Math.floor(i / 7)], impressions: 1000000, clicks: weekClicks[Math.floor(i / 7)], initiated: 100000, succeeded: weekSuccess[Math.floor(i / 7)] },
  }))
}
export function seed() {
  return {
    schema: 1, source: { id: 'demo-business', name: '演示业务数据源', connected: true },
    history: history(), snapshots: [], cursor: null, task: null, incidents: [], messages: [],
    events: [], logs: [], sessions: [], drafts: [],
  }
}
export function example(kind, id = `evt-${kind}-${Date.now()}`) {
  const event = {
    event_id: id, source: 'demo-business', business_date: '2026-11-20', source_version: 1,
    complete: true, definition_version: 'metrics-v1',
    counts: { dau: 100200, impressions: 1000000, clicks: 81000, initiated: 100000, succeeded: 95200 },
  }
  if (['anomaly', 'no-groups'].includes(kind)) {
    event.business_date = '2026-11-21'
    event.counts = { dau: 100000, impressions: 1000000, clicks: 50000, initiated: 100000, succeeded: 95000 }
    if (kind !== 'no-groups') {
      event.groups = [
        { name: 'Android', impressions: 600000, clicks: 18000, baseline_impressions: 600000, baseline_clicks: 48000 },
        { name: 'iOS', impressions: 400000, clicks: 32000, baseline_impressions: 400000, baseline_clicks: 32000 },
      ]
      event.releases = [{ platform: 'Android', date: '2026-11-21', label: 'Android 6.2.0 灰度发布（合成记录）' }]
    }
  }
  if (kind === 'incomplete') { event.business_date = '2026-11-22'; event.complete = false; event.counts.clicks = 0 }
  if (kind === 'recovery') {
    event.business_date = '2026-11-22'
    event.counts = { dau: 100100, impressions: 1000000, clicks: 80000, initiated: 100000, succeeded: 95000 }
  }
  if (kind === 'stale') { event.business_date = '2026-11-19'; event.source_version = 1 }
  return event
}
