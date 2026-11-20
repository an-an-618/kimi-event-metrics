import { store } from './store.mjs'
import { seed, example } from './data.mjs'
import { HttpError, processEvent, createDraft, startTask, resumeLatest, log } from './engine.mjs'
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = '', size = 0
  for await (const chunk of req) { size += chunk.length; if (size > 100000) throw new HttpError(413, '请求超过 100KB'); raw += chunk }
  try { return JSON.parse(raw || '{}') } catch { throw new HttpError(400, 'JSON 格式错误') }
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const respond = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)) }
  try {
    const url = new URL(req.url, 'http://demo')
    const path = url.searchParams.has('route') ? `/api/${url.searchParams.get('route')}` : url.pathname
    const key = req.headers['x-demo-workspace'] || 'demo'
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new HttpError(422, '演示空间标识不合法')
    const db = await store(), now = new Date().toISOString()
    if (req.method === 'GET') {
      if (path === '/api/health') return respond(200, { ok: true, storage: db.mode, persistent: db.persistent, version: '1.0.0' })
      if (path.startsWith('/api/examples/')) return respond(200, example(path.split('/').at(-1)))
      const s = await db.read(key)
      if (path === '/api/state') return respond(200, { ...s, storage: db.mode, persistent: db.persistent, workspace: key })
      if (path === '/api/tasks') return respond(200, { tasks: s.task ? [s.task] : [] })
      if (path === '/api/messages') return respond(200, { messages: s.messages })
      if (path === '/api/incidents') return respond(200, { incidents: s.incidents })
      throw new HttpError(404, '接口不存在')
    }
    if (!['POST', 'PATCH'].includes(req.method)) throw new HttpError(405, '请求方法不支持')
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw new HttpError(415, '请使用 application/json')
    const input = await body(req)
    const result = await db.mutate(key, s => {
      if (path === '/api/events/metrics') return processEvent(s, input, now)
      if (path === '/api/delegations') return createDraft(s, input.text, input.sessionId, now)
      if (path === '/api/tasks') return startTask(s, input.draftId, now)
      if (path === '/api/reset') { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, seed()); return { reset: true } }
      if (path === '/api/source') {
        if (typeof input.connected !== 'boolean') throw new HttpError(422, 'connected 必须是布尔值')
        s.source.connected = input.connected
        if (s.task && s.task.status !== 'ended') {
          s.task.status = input.connected ? s.task.desiredStatus : s.task.desiredStatus === 'paused' ? 'paused' : 'connection_error'
          if (input.connected && s.task.status === 'running') resumeLatest(s, now)
        }
        log(s, input.connected ? 'connected' : 'connection_error', input.connected ? '演示数据源已恢复连接。' : '演示数据源失效；任务不会继续显示监控正常。', null, now)
        return { connected: input.connected }
      }
      if (path.startsWith('/api/tasks/') && path.endsWith('/status')) {
        const task = s.task
        if (!task || task.id !== path.split('/')[3]) throw new HttpError(404, '持续任务不存在')
        if (!['running', 'paused', 'ended'].includes(input.status)) throw new HttpError(422, '任务状态不合法')
        if (task.status === 'ended') throw new HttpError(409, '已结束任务不能恢复，请建立新委托')
        task.desiredStatus = input.status; task.status = !s.source.connected && input.status === 'running' ? 'connection_error' : input.status
        log(s, input.status, input.status === 'paused' ? '用户暂停了持续任务。' : input.status === 'ended' ? '用户结束了持续任务。' : '恢复任务，只核对最新有效状态，不补发中间过期告警。', null, now)
        if (task.status === 'running') resumeLatest(s, now)
        return task
      }
      if (path.startsWith('/api/tasks/') && path.endsWith('/rules')) {
        if (!s.task || s.task.id !== path.split('/')[3]) throw new HttpError(404, '持续任务不存在')
        const { relativeDrop, absoluteDrop, recovery } = input
        if (![relativeDrop, absoluteDrop, recovery].every(Number.isFinite) || relativeDrop < 0.05 || relativeDrop > 0.8 || absoluteDrop < 0.001 || absoluteDrop > 0.1 || recovery < 0.85 || recovery > 1 || recovery <= 1 - relativeDrop) throw new HttpError(422, '阈值不合法；恢复阈值必须高于触发边界')
        Object.assign(s.task.rules, { relativeDrop, absoluteDrop, recovery })
        log(s, 'rules', '判断依据已调整，从下一次完整更新起使用。', null, now); return s.task.rules
      }
      if (path.startsWith('/api/incidents/')) {
        const i = s.incidents.find(i => i.id === path.split('/')[3])
        if (!i) throw new HttpError(404, '异常事项不存在')
        if (input.action === 'acknowledge') { if (i.status !== 'recovered') i.status = 'known'; i.acknowledgedAt = now }
        else if (input.action === 'mute') i.muted = !i.muted
        else throw new HttpError(422, '事项操作不支持')
        return i
      }
      if (path.startsWith('/api/messages/')) {
        const m = s.messages.find(m => m.id === path.split('/')[3])
        if (!m) throw new HttpError(404, '消息不存在')
        m.read = true; return m
      }
      throw new HttpError(404, '接口不存在')
    })
    respond(200, result)
  } catch (e) {
    if (!e.status) console.error('API failure:', e.message)
    respond(e.status || 503, { error: e.status ? e.message : '服务或存储暂时不可用，请稍后再试。' })
  }
}
