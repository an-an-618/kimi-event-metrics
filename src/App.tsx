import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowUpRight, Bell, BellOff, BookOpen, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Copy, Download, ExternalLink, FileText, History, Link2, LoaderCircle, MessageSquare, Mic, MoreHorizontal, PanelLeft, Pause, Play, Plus, Radio, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Sparkles, SquarePen, TrendingDown, TriangleAlert, X, Zap } from 'lucide-react'
import type { Evidence, Incident, Message, Metric, Rules, State, Task } from './types'

const REQUEST = '帮我持续关注业务的 DAU、内容点击率和任务完成率。每天数据更新后检查，有值得处理的异动就先分析影响范围，再提醒我；正常时不用每天汇报。'
const names: Record<string, string> = { dau: 'DAU', ctr: '内容点击率', completion: '任务完成率' }
const taskLabels: Record<string, string> = { running: '持续跟进中', paused: '已暂停', connection_error: '连接异常', ended: '已结束' }
const dataLabels: Record<string, string> = { waiting: '待更新', incomplete: '数据不完整', valid: '数据有效', insufficient: '证据不足', invalid: '数据不合法' }
const issueLabels: Record<string, string> = { confirmed: '已确认', notified: '已通知', known: '已知 · 继续跟踪', recovered: '已恢复' }
const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`
const value = (m: Metric, n: number) => m.key === 'dau' ? fmt(n) : pct(n)
const date = (s?: string | null) => s ? new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未检查'
const savedWorkspace = localStorage.getItem('kimi-metrics:workspace') || `demo-${crypto.randomUUID().slice(0, 8)}`
localStorage.setItem('kimi-metrics:workspace', savedWorkspace)

async function api(path: string, input?: unknown, method = 'POST') {
  const r = await fetch(`/api/${path}`, { method: input === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', 'X-Demo-Workspace': savedWorkspace }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) })
  const result = await r.json()
  if (!r.ok) throw new Error(result.error || `请求失败 (${r.status})`)
  return result
}
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'home')
  useEffect(() => { const change = () => setRoute(location.hash.slice(1) || 'home'); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change) }, [])
  return [route, (r: string) => { location.hash = r }] as const
}
function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Tab') {
        const all = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href]')
        if (all?.length) { const first = all[0], last = all[all.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() } }
      }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); before?.focus() }
  }, [close])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><div className={`modal ${wide ? 'wide' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" aria-label="关闭弹层" onClick={close}><X size={19} /></button></header>{children}</div></div>
}
function Trend({ evidence, metric }: { evidence: Evidence; metric: Metric }) {
  const rows = evidence.baseline.observations
  const values = [...rows.map(r => r[metric.key as 'dau' | 'ctr' | 'completion']), metric.current]
  const max = metric.key === 'dau' ? Math.max(...values) * 1.2 : metric.key === 'completion' ? 1 : Math.max(...values, .1) * 1.15
  const y = (n: number) => 135 - n / max * 108
  const x = (i: number) => 42 + i * 64
  const points = values.map((n, i) => `${x(i)},${y(n)}`).join(' ')
  return <div className="trend"><div className="section-heading"><h3>同星期趋势</h3><span>最近 7 个可比观测 + 本次</span></div><svg viewBox="0 0 540 174" role="img" aria-label={`${metric.name}历史基线与本次趋势`}>
    {[0, .5, 1].map(r => <g key={r}><line x1="42" x2="510" y1={y(max * r)} y2={y(max * r)} stroke="#ededed" /><text x="32" y={y(max * r) + 4} textAnchor="end" fill="#999" fontSize="10">{metric.key === 'dau' ? `${Math.round(max * r / 1000)}k` : `${Math.round(max * r * 100)}%`}</text></g>)}
    <line x1="42" x2="510" y1={y(metric.baseline)} y2={y(metric.baseline)} stroke="#999" strokeDasharray="4 4" />
    <polyline points={points} fill="none" stroke="#b6b6b6" strokeWidth="2" />
    <line x1={x(6)} y1={y(values[6])} x2={x(7)} y2={y(values[7])} stroke={metric.abnormal ? '#b87736' : '#404040'} strokeWidth="2.5" />
    {values.map((n, i) => <circle key={i} cx={x(i)} cy={y(n)} r={i === 7 ? 4 : 2.5} fill={i === 7 ? metric.abnormal ? '#b87736' : '#404040' : '#a0a0a0'}><title>{i === 7 ? evidence.businessDate : rows[i].date}：{value(metric, n)}</title></circle>)}
    {[0, 3, 6, 7].map(i => <text key={i} x={x(i)} y="159" fontSize="10" fill="#999" textAnchor="middle">{i === 7 ? '本次' : rows[i].date.slice(5)}</text>)}
  </svg><div className="legend"><span><i />同星期观测</span><span><i className="dashed" />基线 {value(metric, metric.baseline)}</span></div></div>
}
function EvidencePanel({ evidence, metricKey }: { evidence: Evidence; metricKey: string }) {
  const m = evidence.metrics.find(m => m.key === metricKey)!
  const groups = evidence.groups
  const affected = groups.rows.filter(g => g.missingClicks > 0)
  const relevantReleases = evidence.releases.filter(r => affected.some(g => g.name === r.platform))
  return <div className="evidence-panel">
    <Trend evidence={evidence} metric={m} />
    <section><div className="section-heading"><h3>原始计数与计算</h3><span>完整数据 · {evidence.businessDate}</span></div><div className="table-scroll"><table><thead><tr><th>指标</th><th>本次原始计数</th><th>同星期基线</th><th>本次值</th></tr></thead><tbody>{evidence.metrics.map(item => <tr key={item.key}><td>{item.name}</td><td>{item.key === 'dau' ? fmt(evidence.counts.dau) : item.key === 'ctr' ? `${fmt(evidence.counts.clicks)} / ${fmt(evidence.counts.impressions)}` : `${fmt(evidence.counts.succeeded)} / ${fmt(evidence.counts.initiated)}`}</td><td>{value(item, item.baseline)}</td><td className={item.abnormal ? 'warm-text' : ''}>{value(item, item.current)}</td></tr>)}</tbody></table></div>
      <p className="calculation">{m.key === 'dau' ? `相对下降 = (${fmt(m.baseline)} − ${fmt(m.current)}) / ${fmt(m.baseline)} = ${pct(m.relativeDrop)}` : `绝对下降 = ${pct(m.baseline)} − ${pct(m.current)} = ${+(m.absoluteDrop * 100).toFixed(2)} 个百分点；相对下降 = (${pct(m.baseline)} − ${pct(m.current)}) / ${pct(m.baseline)} = ${pct(m.relativeDrop)}`}</p>
      <p className="muted small">基线取最近 {evidence.baseline.samples} 个同星期完整观测。比例使用总分子 / 总分母：点击 {fmt(evidence.baseline.sums.clicks)} / 曝光 {fmt(evidence.baseline.sums.impressions)}；成功 {fmt(evidence.baseline.sums.succeeded)} / 发起 {fmt(evidence.baseline.sums.initiated)}。</p>
    </section>
    {m.key === 'ctr' && <section><div className="section-heading"><h3>影响范围 · 平台分组</h3><span>按已有数据拆分</span></div>{groups.valid ? <><div className="table-scroll"><table><thead><tr><th>平台</th><th>曝光 / 点击</th><th>基线点击率</th><th>本次点击率</th><th>点击减少</th></tr></thead><tbody>{groups.rows.map(g => <tr key={g.name}><td>{g.name}</td><td>{fmt(g.impressions)} / {fmt(g.clicks)}</td><td>{pct(g.baselineRate)}</td><td className={g.missingClicks > 0 ? 'warm-text' : ''}>{pct(g.rate)}</td><td>{fmt(g.missingClicks)}</td></tr>)}</tbody></table></div><p className="small muted">分组汇总：{fmt(groups.rows.reduce((n, g) => n + g.impressions, 0))} 次曝光、{fmt(groups.rows.reduce((n, g) => n + g.clicks, 0))} 次点击，与总量一致。{affected.map(g => `${g.name} 点击减少 ${fmt(g.missingClicks)}`).join('；')}。这是影响范围，不能证明根因。</p></> : <p className="insufficient-note"><CircleHelp size={17} />{groups.reason}</p>}</section>}
    <section className="conclusions"><div><span className="fact-label">已确认</span><p>{m.name}本次为 {value(m, m.current)}，同星期基线为 {value(m, m.baseline)}。其他指标：{evidence.metrics.filter(x => x.key !== metricKey).map(x => `${x.name} ${value(x, x.current)}${x.abnormal ? '也达到触发阈值' : '未触发下降阈值'}`).join('；')}。</p></div><div><span className="fact-label">影响范围</span><p>{m.key === 'ctr' && groups.valid ? affected.length ? `${affected.map(g => g.name).join('、')} 的点击减少，解释了本例总点击减少的范围。` : '当前分组没有直接解释整体变化，需继续核对。' : '缺少足够的可核对分组证据，暂不能确定。'}</p></div><div><span className="fact-label">可能原因</span><p>{m.key === 'ctr' && relevantReleases.length ? `${relevantReleases.map(r => r.label).join('；')} 与统计日一致。需要进一步核验与发布是否相关，时间接近不构成因果证明。` : '已有数据不足以判断原因，不能把变化直接归因到产品发布或用户行为。'}</p></div><div><span className="fact-label">下一步动作</span><p>核对埋点口径、数据完整性与流量构成；补充应用版本和入口维度，再验证影响范围。默认只读分析，不修改业务配置。</p></div></section>
    <footer className="evidence-source"><ShieldCheck size={15} /><span>来源：演示业务数据源 · metrics-v1 · 来源版本 {evidence.sourceVersion}<br />业务日期 {evidence.businessDate}；历史样本 {evidence.baseline.dates[0]} 至 {evidence.baseline.dates.at(-1)}</span></footer>
  </div>
}
function TaskCard({ task, state, changeStatus, showRules, go, compact = false }: { task: Task; state: State; changeStatus: (status: string) => void; showRules: () => void; go: (r: string) => void; compact?: boolean }) {
  const active = state.incidents.filter(i => i.taskId === task.id && i.status !== 'recovered')
  const badData = !['waiting', 'valid'].includes(task.dataStatus)
  return <div className={`task-card ${compact ? 'compact' : ''}`}><div className="task-card-heading"><div className={`task-symbol ${active.length ? 'warm' : ''}`}><Radio size={20} /></div><div><h3>业务核心指标异动监测</h3><p>异常时分析并提醒，正常时保持安静</p></div><span className={`status ${task.status === 'connection_error' ? 'warm-text' : ''}`}><i className={task.status === 'running' ? 'running-dot' : ''} />{taskLabels[task.status]}</span></div><div className="metrics-row">{(task.latestEvidence?.metrics || [{ key: 'dau', name: 'DAU' }, { key: 'ctr', name: '内容点击率' }, { key: 'completion', name: '任务完成率' }]).map(m => <div key={m.key}><span>{m.name}</span>{'current' in m ? <strong className={m.abnormal ? 'warm-text' : ''}>{value(m as Metric, m.current)}</strong> : <strong className="awaiting">待更新</strong>}{'baseline' in m && <small>同星期基线 {value(m as Metric, m.baseline)}</small>}</div>)}</div><div className="task-check"><Clock3 size={14} /><span>最近成功检查：{task.lastSuccessfulDate || '等待首次完整数据'}{task.lastCheckedAt && <span className="check-clock"> · {date(task.lastCheckedAt)}</span>}</span></div>
    {(badData || task.status === 'connection_error') && <div className="data-warning"><TriangleAlert size={16} /><span>{task.status === 'connection_error' ? '数据源连接失效，暂时无法继续跟进。' : `${dataLabels[task.dataStatus]}：${task.dataReason}`}</span></div>}
    {active.length > 0 && <button className="issue-link" onClick={() => go(`messages/${state.messages.find(m => m.incidentId === active[0].id)?.id || ''}`)}><TrendingDown size={15} />{active.length} 项变化仍在跟踪 · {issueLabels[active[0].status]}<ChevronRight size={15} /></button>}
    <div className="task-card-footer"><span><Link2 size={13} />演示业务数据源</span><div><button onClick={showRules}><Settings2 size={14} />判断依据</button>{task.status !== 'ended' && <button onClick={() => changeStatus(task.status === 'paused' ? 'running' : 'paused')}>{task.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{task.status === 'paused' ? '恢复任务' : '暂停任务'}</button>}</div></div></div>
}

export default function App() {
  const [state, setState] = useState<State | null>(null), [route, go] = useRoute()
  const [nav, setNav] = useState(innerWidth > 760), [controls, setControls] = useState(false), [modal, setModal] = useState<string | null>(null)
  const [draftText, setDraftText] = useState(REQUEST), [chatText, setChatText] = useState(''), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [toastMessage, setToastMessage] = useState<Message | null>(null)
  const [expanded, setExpanded] = useState(false), [split, setSplit] = useState(false), [search, setSearch] = useState('')
  const [payload, setPayload] = useState(''), [response, setResponse] = useState(''), [eventBusy, setEventBusy] = useState(false)
  const [rules, setRules] = useState<Rules>({ relativeDrop: .2, absoluteDrop: .01, recovery: .95, minDenominator: 1000, samples: 7 })
  const lastPayload = useRef<unknown>(null), knownMessages = useRef<Set<string> | null>(null), polling = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const readState = async () => {
    const fresh = await api('state') as State
    const newly = fresh.messages.find(m => !m.read && knownMessages.current && !knownMessages.current.has(m.id))
    if (newly) setToastMessage(newly)
    knownMessages.current = new Set(fresh.messages.map(m => m.id)); setState(fresh); setError('')
    return fresh
  }
  useEffect(() => {
    let alive = true
    const sync = async () => { if (polling.current) return; polling.current = true; try { if (alive) await readState() } catch (e) { if (alive) setError((e as Error).message) } finally { polling.current = false } }
    void sync(); const timer = setInterval(sync, 1200)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  useEffect(() => { setExpanded(false); setSplit(false); if (innerWidth <= 760) setNav(false) }, [route])
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4200); return () => clearTimeout(t) }, [notice])
  const act = async (path: string, input: unknown) => { setBusy(true); try { const r = await api(path, input); await readState(); return r } catch (e) { setNotice((e as Error).message); return null } finally { setBusy(false) } }
  const session = state?.sessions.find(s => route === `chat/${s.id}`)
  const message = state?.messages.find(m => route === `messages/${m.id}`)
  const incident = state?.incidents.find(i => i.id === message?.incidentId)
  useEffect(() => {
    if (message && !message.read) {
      void api(`messages/${message.id}`, { read: true }).then(() => readState()).catch(e => setNotice(e.message))
      setToastMessage(null)
    }
  }, [message?.id])
  const unread = state?.messages.filter(m => !m.read).length || 0
  const currentTask = state?.task
  const changeStatus = async (status: string) => { if (currentTask) await act(`tasks/${currentTask.id}/status`, { status }) }
  const showRules = () => { if (currentTask) setRules({ ...currentTask.rules }); setModal('rules') }
  const openMessage = async (m: Message) => { go(`messages/${m.id}`); setToastMessage(null); if (!m.read) await act(`messages/${m.id}`, { read: true }) }
  const submit = async () => {
    const text = route === 'home' ? draftText : chatText
    if (!text.trim() || busy) return
    const r = await act('delegations', { text, sessionId: session?.id })
    if (r) { setChatText(''); go(`chat/${r.sessionId}`) }
  }
  const loadExample = async (kind: string) => {
    if (kind === 'duplicate' && lastPayload.current) { setPayload(JSON.stringify(lastPayload.current, null, 2)); setResponse('同一事件标识与内容。投递后后端返回原处理结果，不重复通知。'); return }
    try {
      const data = await api(`examples/${kind}`)
      if (state?.events.length && kind !== 'stale') {
        const existing = state.events.filter(e => e.date === data.business_date)
        data.source_version = Math.max(0, ...existing.map(e => e.version || 0)) + 1
      }
      if (kind === 'low-version') {
        const latest = state?.events.at(-1)
        if (latest) { data.business_date = latest.date; data.source_version = Math.max(1, latest.version - 1) }
      }
      setPayload(JSON.stringify(data, null, 2)); setResponse('')
    } catch (e) { setResponse((e as Error).message) }
  }
  const sendEvent = async () => {
    setEventBusy(true)
    try { const data = JSON.parse(payload); const r = await api('events/metrics', data); lastPayload.current = data; setResponse(`HTTP 200 · ${JSON.stringify(r, null, 2)}`); await readState() }
    catch (e) { setResponse(`投递失败：${(e as Error).message}`) } finally { setEventBusy(false) }
  }
  const composer = (home: boolean) => <div className={`composer-wrap ${home ? 'home-composer' : ''}`}><div className="composer"><textarea ref={inputRef} aria-label="输入你的委托或问题" value={home ? draftText : chatText} onChange={e => home ? setDraftText(e.target.value) : setChatText(e.target.value)} placeholder={home ? '尽管问，或交给我持续跟进…' : '继续对话…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() } }} /><div className="composer-tools"><button className="icon-button" aria-label="添加附件" onClick={() => setNotice('演示数据通过上游 HTTP 投递；本原型暂不解析附件。')}><Plus size={22} /></button><div><button className="model-button" onClick={() => setNotice('语言理解与叙述使用场景规则和模板；没有调用真实模型。')}>演示模型<ChevronDown size={13} /></button><button className="icon-button" aria-label="语音输入" onClick={() => setNotice('本原型未接入语音识别，请直接输入文本。')}><Mic size={17} /></button><button className="send-button" aria-label="发送" disabled={busy || !(home ? draftText : chatText).trim()} onClick={() => void submit()}>{busy ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div></div></div>{home && <><div className="tool-tray"><button onClick={() => setNotice('演示仅实现业务指标持续跟进；项目能力未接入。')}><BookOpen size={15} />选择项目<ChevronDown size={12} /></button><button onClick={() => setModal('about')}><Link2 size={15} />数据连接<span className="tiny-label">演示</span></button></div><div className="capabilities"><button className="chosen" onClick={() => { setDraftText(REQUEST); inputRef.current?.focus() }}><Radio size={15} />持续跟进</button><button onClick={() => setNotice('深度研究不在本原型范围内。')}><Search size={15} />深度研究</button><button onClick={() => setNotice('文档处理不在本原型范围内。')}><FileText size={15} />文档</button><button onClick={() => setModal('about')}><MoreHorizontal size={16} />更多</button></div></>}</div>
  const title = route === 'home' ? '新建对话' : route.startsWith('chat/') ? session?.title || '对话' : route === 'tasks' ? '持续任务' : route.startsWith('messages') ? '消息' : '演示历史'
  return <div className="app-shell">
    <div className="demo-toolbar"><div><span className="prototype-tag">产品原型</span><span className="toolbar-name">Kimi · 事件触发自动化</span><span className="toolbar-status"><i className={error ? 'offline-dot' : ''} />{error ? '服务连接中断' : state ? '后台已连接' : '正在连接后台'}</span></div><div><a href="/demo.html" className="video-link"><Play size={13} />演示录屏</a><button onClick={() => setModal('about')}><CircleHelp size={15} /><span>演示说明</span></button><button className={controls ? 'selected' : ''} onClick={() => setControls(!controls)}><Settings2 size={15} /><span>演示数据源</span><ChevronDown size={12} /></button></div></div>
    <div className="product-frame">
      {nav && <div className="mobile-nav-cover" onClick={() => setNav(false)} />}
      <aside className={`sidebar ${nav ? 'open' : 'closed'}`}><div className="sidebar-top"><span className="sidebar-brand">KIMI</span><button className="icon-button" aria-label="折叠导航" onClick={() => setNav(false)}><PanelLeft size={19} /></button></div><button className="new-chat" onClick={() => { setDraftText(''); go('home') }}><SquarePen size={17} />新建对话<span>⌘ K</span></button><nav><button className={route === 'tasks' ? 'active' : ''} onClick={() => go('tasks')}><Radio size={18} /><span>持续任务</span>{currentTask && currentTask.status !== 'ended' && <i className={`nav-task-dot ${currentTask.status === 'connection_error' ? 'warning-dot' : ''}`} />}</button><button className={route.startsWith('messages') ? 'active' : ''} onClick={() => go('messages')}><Bell size={18} /><span>消息</span>{unread > 0 && <b className="unread-count">{unread}</b>}</button><button className={route === 'history' ? 'active' : ''} onClick={() => go('history')}><History size={18} /><span>演示历史</span></button></nav><div className="sidebar-chats"><div className="sidebar-section-label">最近对话<button className="icon-button" aria-label="搜索演示会话" onClick={() => setModal('search')}><Search size={14} /></button></div>{state?.sessions.slice(0, 8).map(s => <button key={s.id} className={route === `chat/${s.id}` ? 'active' : ''} onClick={() => go(`chat/${s.id}`)}>{s.title}</button>)}<button className="other-chat" onClick={async () => { const r = await act('delegations', { text: '帮我整理这周的阅读计划。' }); if (r) go(`chat/${r.sessionId}`) }}><MessageSquare size={14} />另一个演示会话</button></div><div className="sidebar-bottom"><div className="avatar">K</div><div><strong>演示体验</strong><small>无需登录 · 合成数据</small></div><button className="icon-button" aria-label="更多演示设置" onClick={() => setModal('about')}><MoreHorizontal size={18} /></button></div></aside>
      <main className="main"><header className="page-header"><div>{!nav && <button className="icon-button" aria-label="展开导航" onClick={() => setNav(true)}><PanelLeft size={19} /></button>}<span>{title}</span>{route.startsWith('chat/') && currentTask?.sessionId === session?.id && <span className="header-following">持续跟进</span>}</div><button className="header-help" onClick={() => setModal('about')}><ShieldCheck size={14} />只读分析</button></header>
        {error && <div className="connection-banner"><TriangleAlert size={16} />{error}。前台没有重新触发分析；恢复连接后将读取后台结果。<button onClick={() => void readState().catch(() => {})}>重试连接</button></div>}
        {state && !state.persistent && <div className="connection-banner">此部署使用临时存储，冷启动或扩容后可能丢失状态；完整持久化版本请本地运行或连接 PostgreSQL。</div>}
        <div className="workspace-scroll">
        {route === 'home' && <div className="home"><div className="home-heading"><h1>KIMI</h1><p>尽管问，或交给我持续跟进</p></div>{composer(true)}<button className="home-prompt" onClick={() => { setDraftText(REQUEST); inputRef.current?.focus() }}><Sparkles size={14} />试试：业务指标有变化时，先分析再提醒<ArrowUpRight size={13} /></button></div>}
        {route.startsWith('chat/') && <div className="conversation"><div className="conversation-date">演示对话 · 消息已由服务端保存</div>{session?.messages.map(turn => <div className={`turn ${turn.role}`} key={turn.id}>{turn.role === 'assistant' && <div className="assistant-avatar">K</div>}<div className="turn-content"><p>{turn.text}</p>{turn.draftId && state && <>{currentTask?.draftId === turn.draftId ? <TaskCard task={currentTask} state={state} compact changeStatus={changeStatus} showRules={showRules} go={go} /> : <div className="confirmation-card"><div className="confirmation-heading"><Radio size={20} /><h3>持续关注业务指标</h3></div><div className="metric-tags"><span>DAU</span><span>内容点击率</span><span>任务完成率</span></div><ul><li><Link2 size={15} /><span>连接演示业务数据源</span></li><li><History size={15} /><span>与最近 7 个同星期完整观测比较</span></li><li><ShieldCheck size={15} /><span>异常时先进行只读分析，再发站内消息</span></li><li><Pause size={15} /><span>随时暂停与调整；正常时不用每天汇报</span></li></ul><div className="confirmation-footer"><button className="text-button" onClick={() => setModal('preview-rules')}>查看判断依据</button><button className="primary" disabled={busy} onClick={() => void act('tasks', { draftId: turn.draftId })}>开始持续跟进<ArrowUpRight size={14} /></button></div></div>}</>}</div></div>)}{!session && <p className="empty">此会话不存在，可新建对话继续体验。</p>}{composer(false)}</div>}
        {route === 'tasks' && <div className="page-content tasks-page"><div className="page-intro"><div><h1>持续任务</h1><p>交给 Kimi 跟进，值得处理时再回来。</p></div><span className="quiet-label">{currentTask?.status === 'running' ? '正常更新保持安静' : '你的持续委托'}</span></div>{currentTask && state ? <><TaskCard task={currentTask} state={state} changeStatus={changeStatus} showRules={showRules} go={go} /><div className="task-context"><h3>你的委托</h3><p>{currentTask.request}</p><button className="text-button" onClick={() => go(`chat/${currentTask.sessionId}`)}>回到委托对话<ArrowUpRight size={14} /></button></div><div className="task-record"><div className="section-heading"><h3>最近运行</h3><span>{currentTask.checks} 次有效检查</span></div>{state.logs.slice(0, 6).map(l => <div className="record-row" key={l.id}><span className={`record-dot ${['anomaly', 'connection_error'].includes(l.type) ? 'warning-dot' : ''}`} /><div><p>{l.text}</p><small>{l.businessDate ? `业务日期 ${l.businessDate} · ` : ''}{date(l.at)}</small></div></div>)}</div><button className="end-task text-button" disabled={currentTask.status === 'ended'} onClick={() => setModal('end')}>结束此任务</button></> : <div className="empty-state"><Radio size={30} /><h2>还没有持续任务</h2><p>用一句话交代目标，Kimi 会识别跟进范围。</p><button className="primary" onClick={() => { setDraftText(REQUEST); go('home') }}>建立业务指标跟进<ArrowUpRight size={14} /></button></div>}</div>}
        {route.startsWith('messages') && <div className={`messages-page ${message ? 'with-detail' : ''}`}><div className="message-list"><div className="page-intro"><div><h1>消息</h1><p>{unread ? `${unread} 条未读，来自持续任务` : '值得处理的变化，会在这里收到。'}</p></div></div>{state?.messages.length ? state.messages.map(m => <button key={m.id} className={`message-item ${m.id === message?.id ? 'selected' : ''}`} onClick={() => void openMessage(m)}><div className={`message-icon ${m.type === 'alert' ? 'warm' : ''}`}>{m.type === 'alert' ? <TrendingDown size={17} /> : <CheckCheck size={17} />}</div><div><div className="message-item-title"><strong>{m.title}</strong>{!m.read && <i className="unread-dot" />}</div><p>{m.text}</p><small>{m.businessDate} · {m.type === 'alert' ? '异常分析' : '恢复更新'}</small></div></button>) : <div className="message-empty"><Bell size={28} /><h2>暂时没有需要打扰你的变化</h2><p>正常更新保持安静。异常被后台确认后，Kimi 会主动发来分析。</p></div>}</div>{message && incident && <article className="message-detail"><button className="detail-back text-button" onClick={() => go('messages')}><ChevronLeft size={15} />全部消息</button><div className="proactive-label"><span className="assistant-avatar">K</span><strong>Kimi</strong><span>主动发来的消息</span><time>{date(message.createdAt)}</time></div><h1>{message.title}</h1><p className="message-summary">{message.text}</p><div className="message-facts">{(message.evidence || incident.evidence).metrics.filter(m => m.key === incident.metric).map(m => <div key={m.key}><span>本次 {value(m, m.current)}</span><span>同星期基线 {value(m, m.baseline)}</span><span className={m.abnormal ? 'warm-text' : ''}>{message.type === 'recovery' ? `达到基线 ${pct(m.current / m.baseline)}` : `相对下降 ${pct(m.relativeDrop)}`}</span></div>)}</div><p className="message-boundary">{incident.status === 'recovered' && message.type !== 'recovery' ? '本事项后来已恢复；这条消息保留当时的分析证据。' : '这是合成数据的只读分析，影响范围不构成根因证明。'}</p><div className="analysis-toggle"><button className="primary subtle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><FileText size={15} />{expanded ? '收起分析' : '查看分析'}<ChevronDown size={14} className={expanded ? 'rotated' : ''} /></button><span>{issueLabels[incident.status]}{incident.muted ? ' · 已静音' : ''}</span></div>{expanded && <EvidencePanel evidence={message.evidence || incident.evidence} metricKey={incident.metric} />}<div className="message-actions"><button onClick={() => setSplit(!split)}><Plus size={14} />继续拆分</button><button disabled={busy || incident.status === 'recovered' || incident.status === 'known'} onClick={() => void act(`incidents/${incident.id}`, { action: 'acknowledge' })}><Check size={14} />{incident.status === 'known' ? '已知 · 继续跟踪' : '已知，继续跟踪'}</button><button disabled={busy} onClick={() => void act(`incidents/${incident.id}`, { action: 'mute' })}><BellOff size={14} />{incident.muted ? '取消静音' : '静音本事项'}</button><button disabled={busy || currentTask?.status === 'paused'} onClick={() => void changeStatus('paused')}><Pause size={14} />暂停任务</button></div>{split && <div className="split-note"><CircleHelp size={17} /><div><strong>继续拆分需要补充数据</strong><p>已有数据{(message.evidence || incident.evidence).groups.valid ? '只支持按平台比较' : '没有可核对的分组维度'}。没有应用版本、流量入口或用户新老维度，不能进一步生成这些结论。建议先核对埋点，再补充相应分组快照。</p></div></div>}<button className="message-source text-button" onClick={() => go('tasks')}><Radio size={14} />来自“业务核心指标异动监测”<ArrowUpRight size={13} /></button></article>}</div>}
        {route === 'history' && <div className="page-content"><div className="page-intro"><div><h1>演示历史</h1><p>服务端记录的真实检查与状态变化。</p></div><button className="text-button" onClick={() => setModal('about')}><CircleHelp size={15} />查看技术记录</button></div>{state?.logs.length ? state.logs.map(l => <div className="record-row history-row" key={l.id}><span className={`record-dot ${['anomaly', 'connection_error'].includes(l.type) ? 'warning-dot' : ''}`} /><div><p>{l.text}</p><small>{l.businessDate ? `业务日期 ${l.businessDate} · ` : ''}{date(l.at)}</small></div></div>) : <div className="empty-state"><History size={28} /><p>建立委托后，这里会记录真实运行过程。</p></div>}</div>}
        </div><footer className="product-disclaimer">合成业务数据；规则与语言部分为演示，触发、计算及状态真实运行。</footer>
      </main>
    </div>
    {controls && <aside className="demo-panel" aria-label="演示数据源"><header><div><span className="eyebrow">模拟上游业务平台</span><h2>投递业务数据</h2></div><button className="icon-button" aria-label="关闭演示数据源" onClick={() => setControls(false)}><X size={18} /></button></header><p>通过真实 HTTP POST 提交快照。服务端独立判断，前台仅同步结果。</p><div className="scenario-buttons">{[['normal', '正常'], ['anomaly', '异常'], ['incomplete', '不完整'], ['duplicate', '重复投递'], ['low-version', '旧版本'], ['stale', '过期日期'], ['no-groups', '缺少分组'], ['recovery', '恢复']].map(([k, label]) => <button key={k} onClick={() => void loadExample(k)}>{label}</button>)}</div><label className="payload-label" htmlFor="event-payload">数据快照 <span>可编辑分组与原始计数</span></label><textarea id="event-payload" className="payload-editor" spellCheck={false} value={payload} onChange={e => setPayload(e.target.value)} placeholder="先选择一种合成快照…" /><button className="primary deliver-button" onClick={() => void sendEvent()} disabled={!payload || eventBusy}>{eventBusy ? <LoaderCircle size={15} className="spin" /> : <Zap size={15} />}通过 HTTP 投递</button>{response && <pre className="event-response" role="status">{response}</pre>}<div className="demo-source-actions"><button className="text-button" onClick={() => void act('source', { connected: !state?.source.connected })}><Link2 size={14} />{state?.source.connected ? '模拟连接失效' : '恢复数据源连接'}</button><button className="text-button" onClick={() => setModal('reset')}><RotateCcw size={14} />重置演示</button></div><details><summary>从另一个终端投递</summary><p className="small muted">当前演示空间：{savedWorkspace}</p><pre>{`curl -X POST '${location.origin}/api/events/metrics' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Demo-Workspace: ${savedWorkspace}' \\\n  --data-binary @snapshot.json`}</pre><button className="text-button" onClick={() => { navigator.clipboard.writeText(payload).then(() => setNotice('已复制快照，保存为 snapshot.json 后可用 curl 投递。')).catch(() => setNotice('复制失败，可直接选中快照文本复制。')) }}><Copy size={13} />复制当前快照</button></details></aside>}
    {toastMessage && <div className="proactive-toast" role="status"><div className={`message-icon ${toastMessage.type === 'alert' ? 'warm' : ''}`}>{toastMessage.type === 'alert' ? <TrendingDown size={18} /> : <CheckCheck size={18} />}</div><button onClick={() => void openMessage(toastMessage)}><strong>Kimi · {toastMessage.title}</strong><span>后台已完成分析，点击查看<ArrowUpRight size={12} /></span></button><button className="icon-button" aria-label="关闭消息提醒" onClick={() => setToastMessage(null)}><X size={15} /></button></div>}
    {notice && <div className="notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {modal && <Modal title={modal === 'rules' || modal === 'preview-rules' ? '判断依据' : modal === 'about' ? '演示说明' : modal === 'search' ? '搜索演示会话' : modal === 'end' ? '结束持续任务' : '重置演示'} wide={modal === 'about'} close={() => setModal(null)}>
      {(modal === 'rules' || modal === 'preview-rules') && <div className="rules-content"><p>以下是 demo 简化策略，不代表适合所有业务或具有生产级统计显著性。</p><div className="rule-explanation"><h3>使用可比历史，解释每一次变化</h3><p>最近 7 个同星期完整观测。比例指标采用总分子 / 总分母，分母少于 1,000 或样本不足时不下强结论。</p></div><div className="rule-fields"><label>相对下降至少<select aria-label="相对下降阈值" value={rules.relativeDrop} disabled={modal === 'preview-rules'} onChange={e => setRules({ ...rules, relativeDrop: +e.target.value })}>{[.1, .15, .2, .25, .3].map(n => <option key={n} value={n}>{pct(n)}</option>)}</select></label><label>比例指标同时绝对下降至少<select aria-label="绝对下降阈值" value={rules.absoluteDrop} disabled={modal === 'preview-rules'} onChange={e => setRules({ ...rules, absoluteDrop: +e.target.value })}>{[.005, .01, .015, .02].map(n => <option key={n} value={n}>{n * 100} 个百分点</option>)}</select></label><label>恢复至对应基线的<select aria-label="恢复阈值" value={rules.recovery} disabled={modal === 'preview-rules'} onChange={e => setRules({ ...rules, recovery: +e.target.value })}>{[.9, .95, 1].map(n => <option key={n} value={n}>{pct(n)}</option>)}</select></label></div><p className="small muted">DAU 只使用相对下降规则。触发与恢复使用不同阈值，中间区间维持原事项；缺失数据不算恢复。调整将在下一次完整更新时生效。</p>{modal === 'rules' && <button className="primary" disabled={busy} onClick={async () => { const r = await act(`tasks/${currentTask?.id}/rules`, rules); if (r) { setModal(null); setNotice('判断依据已保存，下一次完整更新时生效。') } }}>保存调整</button>}</div>}
      {modal === 'about' && <div className="about-content"><div className="real-boundary"><ShieldCheck size={20} /><div><h3>触发、计算、状态与站内通知真实运行</h3><p>业务数据全部合成；语言理解和叙述使用场景规则与模板，没有调用真实 Kimi 模型。前台轮询只读取后台结果。</p></div></div><div className="architecture"><span>上游 HTTP 快照</span><ChevronRight size={16} /><span>校验与数值检测</span><ChevronRight size={16} /><span>事务保存与通知</span><ChevronRight size={16} /><span>前台只读同步</span></div><dl className="about-list"><div><dt>数据</dt><dd>49 天完整历史，2026-10-02 至 2026-11-19。日期快进是合成业务时间。</dd></div><div><dt>状态存储</dt><dd>{state?.storage === 'postgres' ? 'PostgreSQL 持久化；任务、事件、事项、消息在事务中保存，服务重启后恢复。' : state?.persistent ? '本地 SQLite 持久化；后端重启后任务与消息可恢复。电脑关机或本地服务停止后不再接收事件。' : '临时 SQLite；Vercel 冷启动或扩容可能丢失状态，需要连接 PostgreSQL 才能保证跨实例持续保存。'}</dd></div><div><dt>幂等与版本</dt><dd>同 event_id 重投返回原结果，内容冲突拒绝。旧日期与同日非更新版本仅记录，不覆盖当前状态。</dd></div><div><dt>权限边界</dt><dd>只读分析与站内消息；不修改业务配置、不发送外部邮件、不执行生产操作。演示空间并非账号鉴权。</dd></div><div><dt>通知策略</dt><dd>首次异常发一次，同事项更新不重复推送；恢复发一次。确认不等于恢复，静音抑制该事项后续消息。</dd></div><div><dt>演示空间</dt><dd><code>{savedWorkspace}</code> · 每个浏览器独立；curl 请携带这个空间标识。</dd></div></dl><details className="technical-logs"><summary>接口与执行记录（{state?.events.length || 0} 个事件）</summary><code>POST /api/events/metrics · GET /api/state · GET /api/messages</code>{state?.events.slice(-8).reverse().map(e => <div key={e.id}><code>{e.id}</code><span>{e.date} · v{e.version} · {e.result.status}</span></div>)}</details><p className="small muted">分析中“发布记录与统计日相同”只能作为待核验线索，不构成根因。无版本维度不会伪造更细结论。</p><a className="text-button" href="/demo.html">观看真实主流程录屏<ExternalLink size={13} /></a></div>}
      {modal === 'search' && <div className="search-content"><input autoFocus aria-label="搜索会话" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索合成演示会话…" />{state?.sessions.filter(s => s.title.includes(search)).map(s => <button key={s.id} onClick={() => { go(`chat/${s.id}`); setModal(null) }}><MessageSquare size={16} />{s.title}</button>)}</div>}
      {(modal === 'reset' || modal === 'end') && <div className="confirm-content"><p>{modal === 'reset' ? '只清理当前演示空间的合成任务、事件、会话与消息，不影响其他应用或其他演示空间。' : '结束后不再分析新事件或发送提醒。之后可以用新的自然语言委托建立任务。'}</p><div><button className="secondary" onClick={() => setModal(null)}>取消</button><button className="primary" disabled={busy} onClick={async () => { if (modal === 'reset') { const r = await act('reset', {}); if (r) { lastPayload.current = null; knownMessages.current = new Set(); setDraftText(REQUEST); setPayload(''); setResponse(''); setToastMessage(null); go('home'); setModal(null) } } else { await changeStatus('ended'); setModal(null) } }}>{modal === 'reset' ? '重置当前演示' : '结束任务'}</button></div></div>}
    </Modal>}
  </div>
}
