# Kimi · 事件触发自动化：业务核心指标异动监测

**合成业务数据；规则与语言部分为演示，触发、计算及状态真实运行。**

Kimi AI 产品经理笔试第二题的可操作原型。用户用自然语言委托，确认后持续跟进；正常数据不打扰，值得处理的变化由后台主动分析并写入站内消息。业务指标监测是通用持续委托能力的一项代表场景。

## 体验

- 本地完整前后端：`http://localhost:5180`
- [114.48 秒真实主流程录屏](public/demo/main-flow.mp4)；启动后可打开 `/demo.html` 内嵌播放。
- [首页](delivery/01-delegation.png) · [确认委托](delivery/02-confirmation.png) · [正常保持安静](delivery/03-normal-quiet.png) · [另一个会话收到告警](delivery/04-other-chat-alert.png) · [分析](delivery/05-alert-analysis.png) · [恢复](delivery/06-recovery.png) · [手机](delivery/07-mobile-analysis.png)
- 公网完整前后端：[kimi-event-metrics.vercel.app](https://kimi-event-metrics.vercel.app)
- [公网录屏播放页](https://kimi-event-metrics.vercel.app/demo.html) · [GitHub 代码](https://github.com/an-an-618/kimi-event-metrics)

## 启动

要求 Node.js 24（使用内置 `node:sqlite`）。

```bash
npm ci
npm run dev
```

开发模式同一个 Node 服务提供 Vite 页面与真实 API。生产模式：

```bash
npm run build
npm start
```

默认端口 `5180`，可用 `PORT` 覆盖。本地数据写入 `data/kimi-metrics.sqlite`，后端重启后恢复。没有 `file://` 离线版：本原型需要运行后端才能处理事件。

设置 `DATABASE_URL` 或 `POSTGRES_URL` 可使用 PostgreSQL。表 `kimi_metric_demo_states` 按演示空间保存状态；每次变更在事务和行锁中完成，事件幂等结果、当前事项和消息一起提交。GET 查询只读取，不启动检测。

Vercel 会部署 `api/index.mjs`，所有 `/api/*` 路径转入同一后端入口。在 webhook 请求内完成处理，不使用响应结束后的计时器或不可靠后台任务。**Vercel 必须连接 PostgreSQL 才保证跨实例持久化；没有数据库时会清楚显示临时 SQLite 的限制，冷启动或扩容可能丢失状态。** 本地进程停止或电脑关机后不再接收事件。

本项目公网部署已连接独立 Neon PostgreSQL 免费数据库，真实健康检查返回 `storage: postgres`、`persistent: true`；不依赖本地电脑持续运行。免费服务可能存在冷启动延迟，不承诺生产服务等级。

## 主流程

1. 首页编辑预置自然语言委托，发送后核对目标、数据源、同星期比较与只读分析权限。
2. 点击“开始持续跟进”，由服务端建立任务。用户无需填写 webhook、cron、SQL 或条件表达式。
3. 产品画面外的“演示数据源”代表上游业务平台。选择正常快照，点击“通过 HTTP 投递”，确认更新检查时间且消息为空。
4. 前往“另一个演示会话”。投递异常快照，服务端计算并保存消息，前台轮询后出现未读与站内提示。
5. 打开主动消息、查看分析，可复算 8% → 5%、下降 3 个百分点与相对下降 37.5%。展开趋势、原始计数、分组、事实、假设和待查项。
6. 重投同一事件，返回原处理结果，不重复通知。点击“已知，继续跟踪”不意味着恢复。
7. 投递恢复快照，更新同一事项，并发送一次恢复消息。

“继续拆分”只能说明现有平台数据和缺失维度，不伪造应用版本、入口或用户分组。静音抑制该事项后续消息，包括恢复消息；事项本身仍会更新。暂停后保存最新有效快照但不分析，恢复时只检查最新有效状态，不逐个补发过期告警。

## 从另一个终端投递事件

打开“演示数据源”→“从另一个终端投递”，复制当前演示空间标识。每个浏览器使用独立标识；curl 不带该请求头时会使用 `demo` 空间，不能触发另一个浏览器空间的任务。

将 `<当前演示空间>` 替换为面板显示的值：

公网投递时，将以下命令中的 `http://localhost:5180` 替换为 `https://kimi-event-metrics.vercel.app`。请求头与 JSON 不变。

```bash
curl -X POST 'http://localhost:5180/api/events/metrics' \
  -H 'Content-Type: application/json' \
  -H 'X-Demo-Workspace: <当前演示空间>' \
  --data-binary '{
    "event_id": "terminal-anomaly-001",
    "source": "demo-business",
    "business_date": "2026-11-21",
    "source_version": 1,
    "complete": true,
    "definition_version": "metrics-v1",
    "counts": {
      "dau": 100000, "impressions": 1000000, "clicks": 50000,
      "initiated": 100000, "succeeded": 95000
    },
    "groups": [
      {"name":"Android","impressions":600000,"clicks":18000,"baseline_impressions":600000,"baseline_clicks":48000},
      {"name":"iOS","impressions":400000,"clicks":32000,"baseline_impressions":400000,"baseline_clicks":32000}
    ],
    "releases": [{"platform":"Android","date":"2026-11-21","label":"Android 6.2.0 灰度发布（合成记录）"}]
  }'
```

也可从 `GET /api/examples/normal`、`anomaly`、`incomplete`、`no-groups`、`recovery`、`stale` 获得合成快照。面板支持自由编辑后投递。对同统计日进行新的修订需要提高 `source_version`，使用新的 `event_id`。

## 合成数据与判断

`server/data.mjs` 生成 2026-10-02 至 2026-11-19 的 49 天历史；每周 7 天使用该周同一组计数，因此每个星期都有 7 个可比完整样本。

| 指标 | 定义 | 历史基线 | 正常 11-20 | 异常 11-21 | 恢复 11-22 |
|---|---|---:|---:|---:|---:|
| DAU | 日活跃用户数 | 100,000 | 100,200 | 100,000 | 100,100 |
| 内容点击率 | 点击 / 曝光 | 8% | 8.1% | 5% | 8% |
| 任务完成率 | 成功任务 / 发起任务 | 95% | 95.2% | 95% | 95% |

七周 DAU 为 98000、101000、99000、102000、100000、99500、100500；曝光均为 1000000，点击为 79000、80000、81000、78000、82000、80000、80000；发起任务均为 100000，成功为 94000、95000、96000、95000、94000、96000、95000。

最近 7 个同星期完整观测用于基线，比例计算为总分子 / 总分母。后续已接收的有效观测可进入未来的可比历史。同日修订仅保留最新版本；当前观测不包含在自己的基线中。

- DAU 相对下降至少 20%。
- 比例相对下降至少 20%，且绝对下降至少 1 个百分点。
- 已有异常回升至对应同星期基线的 95% 及以上时恢复；中间区间保持原异常，数据缺失不算恢复。
- 分母少于 1000 或同星期样本不足 7 个：证据不足，不产生业务下跌告警。
- 校验业务日期、完整性、指标定义、来源版本与计数。计数必须为非负安全整数，点击不得超过曝光，成功不得超过发起。
- Android 本次 18000 / 600000 = 3%，历史 48000 / 600000 = 8%；iOS 本次与历史均为 32000 / 400000 = 8%。分组当前与历史汇总均须与整体对应，否则不作确定的平台结论。

这些是 **demo 简化策略**，不声称适合所有业务或具备生产级统计显著性。Android 点击减少 30000 只解释本例影响范围；合成发布记录只支持“需要进一步核验与发布是否相关”，不构成根因。

## 状态与接口

三类状态独立保存：任务（运行 / 暂停 / 连接异常 / 结束）、数据（待更新 / 不完整 / 有效 / 不合法 / 证据不足）、异常事项（已确认 / 已通知 / 已知并跟踪 / 恢复）。过期事件单独记录，不把当前有效数据退回过期状态。

| 接口 | 行为 |
|---|---|
| `POST /api/delegations` | 保存会话，规则识别委托并生成待确认卡 |
| `POST /api/tasks` | 使用 `draftId` 确认并建立任务 |
| `GET /api/tasks`、`GET /api/state` | 只读查询任务或完整演示状态 |
| `POST /api/tasks/:id/status` | `status` 为 `running`、`paused`、`ended` |
| `POST /api/tasks/:id/rules` | 调整简单阈值，下一次完整更新生效 |
| `POST /api/events/metrics` | 真实 webhook，校验 → 计算 → 更新事项 → 保存消息 |
| `GET /api/incidents`、`GET /api/messages` | 只读查询事项与主动消息 |
| `POST /api/incidents/:id` | `action` 为 `acknowledge` 或 `mute` |
| `POST /api/messages/:id` | 标为已读 |
| `POST /api/source` | 演示连接失效与重连，`connected` 为布尔值 |
| `POST /api/reset` | 只清理当前演示空间 |
| `GET /api/health` | 检查真实存储类型和持久性 |

同一 `event_id` 与相同内容返回一致结果；冲突内容返回 HTTP 409。同统计日非更新版本不能覆盖已有数据；旧日期事件只记录，不让当前状态倒退。单个请求最多 100KB；每个演示空间最多 2000 个事件，达到上限须重置。演示空间标识用于隔离合成演示，不是生产身份鉴权。

## Harness 与评测边界

执行链路：委托识别与确认 → 数据连接 → 事件校验 / 幂等 / 版本 → 基线与数值检测 → 持续事项上下文 → 只读影响分析 → 事务保存 → 站内主动交付 → 用户确认 / 静音 / 恢复。

已实现的 harness 包括来源与口径校验、阈值与迟滞、幂等事件账本、暂停 / 恢复、数据不足降级、事实与假设分离、事务状态保存、只读前台同步。没有通用模型推理、任意数据连接、任务调度市场、生产授权或云端长期目标规划。

可用于后续线上评测的指标：漏报与误报率、正常数据打扰率、重复消息率、触发到交付延迟、未读后的查看 / 确认率、分组证据一致率、恢复正确率、幂等冲突率、暂停期间违规提醒率。合成测试只能证明确定性场景和实现行为，不能证明真实业务异常检测效果或用户价值。

## 实际验证

`npm test`：14 项数值、幂等、版本、迟滞、分组和状态测试通过。实际 Playwright 浏览器与独立 HTTP 请求：18 项检查通过，包含进程真正重启后的持久性；6 种视口为 1440×900、1280×800、1024×768、768×1024、390×844、320×740。

已验证：自然语言确认后建任务、正常安静、切换会话后后台触发、可复算分析、缺失维度不伪造、确认不恢复、重复 / 不完整 / 旧日期 / 旧版本、同事项恢复与重复恢复、刷新状态、自由输入、暂停与只查最新、连接失效 / 重连、阈值保存、删除与修改分组、GET 不触发检测、SQLite 重启恢复、实际截图布局复核。浏览器未捕获 JavaScript 错误为 0。完整机器结果见 [浏览器验证结果](delivery/浏览器验证结果.json)。

2026-11-21（北京时间）完成[独立 Ubuntu / Chromium 公网验收](https://github.com/an-an-618/kimi-event-metrics/actions/runs/44805213328)：17 项全部通过，真实 PostgreSQL 持久化存储、HTTP webhook 与站内消息均在公网运行，114.48 秒 MP4 可播放。证据见 [公网机器结果](delivery/public/results.json)、[公网首页](delivery/public/01-public-home.png)、[后台提醒](delivery/public/03-public-background-alert.png)、[分析](delivery/public/04-public-analysis.png)、[手机分析](delivery/public/06-public-mobile-messages.png)。

尚未验证真实 Safari / Firefox、企业源数据、真实模型或线上用户效果。

公网验收脚本 `scripts/public-qa.py` 从真实 Chromium 页面开始委托，通过独立 HTTP 客户端投递事件，并读取服务端状态。HTTPS 验收要求 `/api/health` 返回 `storage: postgres` 与 `persistent: true`；包含 17 项检查、并发重复投递、6 种视口与录屏实际播放。GitHub Actions 的 `Public deployment acceptance` 支持手动运行，截图和 JSON 结果保存为 `public-acceptance-evidence`。工作流成功结果才代表对应部署已通过验收。

```bash
python -m pip install playwright
python -m playwright install chromium
DEMO_URL=https://kimi-event-metrics.vercel.app python scripts/public-qa.py
```

## 代码

```text
src/                  React / TypeScript 界面与只读同步
server/data.mjs       完整合成历史、快照
server/engine.mjs     纯数值判断、事件账本、异常与消息
server/store.mjs      SQLite / PostgreSQL 事务存储
server/handler.mjs    真实 HTTP API
server/local.mjs      本地完整前后端服务
api/index.mjs         Vercel 后端入口
tests/                数值与状态回归测试
public/demo.html      内嵌录屏页
public/demo/          真实录屏 MP4
delivery/             真实截图和验证记录
```
