"""Real browser and independent HTTP acceptance checks against a running deployment."""
import concurrent.futures
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
import uuid
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("DEMO_URL", "http://localhost:5180").rstrip("/")
OUT = Path(os.environ.get("QA_OUTPUT", "public-qa-results"))
OUT.mkdir(parents=True, exist_ok=True)
KEY = "qa-" + uuid.uuid4().hex[:16]
results, errors = [], []


def http(path, payload=None, workspace=None, expected=200):
    request = urllib.request.Request(
        BASE + "/api/" + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "X-Demo-Workspace": workspace or KEY},
    )
    try:
        response = urllib.request.urlopen(request, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        data = json.loads(response.read())
        assert response.status == expected, (path, response.status, data)
        return data


def event(kind, identifier, version=None, day=None):
    data = http("examples/" + kind)
    data["event_id"] = identifier
    if version is not None:
        data["source_version"] = version
    if day:
        data["business_date"] = day
    return data


def check(name, **evidence):
    results.append({"check": name, "status": "PASS", **evidence})
    print("PASS", name, flush=True)


def persistence_signature(state, workspace):
    return {
        "workspace": workspace,
        "task": state["task"]["id"] if state["task"] else None,
        "incidents": [i["id"] for i in state["incidents"]],
        "messages": [m["id"] for m in state["messages"]],
        "events": [e["id"] for e in state["events"]],
    }


def screenshot(page, name):
    # Wait only for the finite entrance animation to finish before capturing pixels.
    page.locator("body").evaluate(
        "e => Promise.all(document.getAnimations().filter(a => "
        "a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})))"
    )
    page.screenshot(path=str(OUT / name), full_page=True)


try:
    health = http("health")
    assert health["ok"] and health["persistent"], health
    if BASE.startswith("https://"):
        assert health["storage"] == "postgres", health
    check("真实后端健康与持久化存储", health=health)
    expected_persistence = os.environ.get("EXPECTED_PERSISTENCE", "").strip()
    if expected_persistence:
        previous = json.loads(expected_persistence)
        persisted = http("state", workspace=previous["workspace"])
        assert persistence_signature(persisted, previous["workspace"]) == previous
        check("后端重新部署后原任务、事项、消息及事件标识完整保留")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        context.add_init_script(
            "localStorage.setItem('kimi-metrics:workspace', " + json.dumps(KEY) + ")"
        )
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE, wait_until="networkidle", timeout=60000)
        screenshot(page, "01-public-home.png")
        page.get_by_role("button", name="发送", exact=True).click()
        expect(page.get_by_role("button", name="开始持续跟进", exact=True)).to_be_visible()
        assert http("state")["task"] is None
        page.get_by_role("button", name="开始持续跟进", exact=True).click()
        expect(page.locator(".task-card")).to_be_visible()
        assert http("state")["task"]["status"] == "running"
        check("浏览器自然语言确认后建立服务端任务")

        page.get_by_role("button", name="持续任务", exact=True).click()
        page.get_by_role("button", name="演示数据源", exact=True).click()
        page.get_by_role("button", name="正常", exact=True).click()
        expect(page.locator("#event-payload")).not_to_have_value("")
        page.get_by_role("button", name="通过 HTTP 投递", exact=True).click()
        expect(page.locator(".event-response")).to_contain_text('"status": "normal"', timeout=15000)
        expect(page.locator(".metrics-row")).to_contain_text("100,200")
        assert http("state")["messages"] == []
        page.get_by_role("button", name="关闭演示数据源").click()
        screenshot(page, "02-public-normal.png")
        check("演示面板真实 HTTP 正常更新且保持安静")

        page.get_by_role("button", name="另一个演示会话", exact=True).click()
        expect(page.locator(".conversation")).to_contain_text("暂时不能完成这个请求")
        anomaly = event("anomaly", "public-anomaly")
        first = http("events/metrics", anomaly)
        assert first["status"] == "anomaly"
        expect(page.locator(".unread-count")).to_have_text("1", timeout=15000)
        expect(page.locator(".proactive-toast")).to_contain_text("内容点击率出现值得关注的下降")
        screenshot(page, "03-public-background-alert.png")
        check("另一个会话内收到独立 HTTP 事件产生的后台消息")

        page.locator(".proactive-toast").get_by_role("button", name="Kimi", exact=False).click()
        expect(page.locator(".message-detail")).to_contain_text("37.5%")
        expect(page.locator(".message-detail")).to_contain_text("3 个百分点")
        page.get_by_role("button", name="查看分析", exact=True).click()
        expect(page.locator(".evidence-panel")).to_contain_text("30,000")
        expect(page.locator(".evidence-panel")).to_contain_text("时间接近不构成因果证明")
        s = http("state")
        evidence = s["incidents"][0]["evidence"]
        assert evidence.get("analyzedAt")
        expect(page.locator(".evidence-source")).to_contain_text("分析更新")
        metric = next(m for m in evidence["metrics"] if m["key"] == "ctr")
        assert abs(metric["baseline"] - .08) < 1e-10
        assert abs(metric["current"] - .05) < 1e-10
        assert abs(metric["relativeDrop"] - .375) < 1e-10
        assert abs(metric["absoluteDrop"] - .03) < 1e-10
        assert sum(g["clicks"] for g in evidence["groups"]["rows"]) == 50000
        screenshot(page, "04-public-analysis.png")
        check("公网可复算基线、下降与分组证据", ctr=metric)
        page.get_by_role("button", name="继续拆分", exact=True).click()
        expect(page.locator(".split-note")).to_contain_text("没有应用版本")
        page.get_by_role("button", name="已知，继续跟踪", exact=True).click()
        assert http("state")["incidents"][0]["status"] == "known"
        check("缺失维度不伪造，已知不代表恢复")

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            repeated = list(executor.map(lambda _: http("events/metrics", anomaly), range(4)))
        assert all(r == first for r in repeated)
        assert len(http("state")["messages"]) == 1
        conflict = dict(anomaly, counts=dict(anomaly["counts"], clicks=51000))
        assert "error" in http("events/metrics", conflict, expected=409)
        check("并发重复事件幂等且冲突内容返回 409")

        assert http("events/metrics", event("incomplete", "public-incomplete"))["status"] == "incomplete"
        s = http("state")
        assert s["task"]["dataStatus"] == "incomplete"
        assert s["incidents"][0]["status"] == "known" and len(s["messages"]) == 1
        assert http("events/metrics", event("stale", "public-old"))["status"] == "stale"
        check("不完整不下跌告警、不恢复，旧日期不倒退")
        recovery = event("recovery", "public-recovery", 2)
        assert http("events/metrics", recovery)["status"] == "recovery"
        assert http("events/metrics", recovery)["status"] == "recovery"
        assert http("events/metrics", event("recovery", "public-low-version", 1))["status"] == "stale"
        s = http("state")
        assert len(s["incidents"]) == 1 and s["incidents"][0]["status"] == "recovered"
        assert len(s["messages"]) == 2
        check("恢复沿用同事项、只通知一次且旧版本不能覆盖")
        expect(page.locator(".proactive-toast")).to_contain_text("已恢复", timeout=15000)
        page.locator(".proactive-toast").get_by_role("button", name="Kimi", exact=False).click()
        expect(page.locator(".message-detail")).to_contain_text("达到同星期基线的 100%")
        screenshot(page, "05-public-recovery.png")
        page.reload(wait_until="networkidle")
        expect(page.locator(".message-detail")).to_contain_text("已恢复")
        check("刷新同步持久化任务、消息和阅读状态")

        page.get_by_role("button", name="新建对话", exact=False).click()
        page.get_by_role("textbox", name="输入你的委托或问题").fill("帮我看看今天的天气")
        page.get_by_role("button", name="发送", exact=True).click()
        expect(page.locator(".conversation")).to_contain_text("不调用真实 Kimi 模型")
        page.get_by_role("button", name="持续任务", exact=True).click()
        page.get_by_role("button", name="暂停任务", exact=True).click()
        expect(page.locator(".status")).to_contain_text("已暂停")
        assert http("events/metrics", event("anomaly", "public-paused", 2, "2026-11-23"))["status"] == "paused"
        assert http("events/metrics", event("recovery", "public-latest", 3, "2026-11-24"))["status"] == "paused"
        assert len(http("state")["messages"]) == 2
        page.get_by_role("button", name="恢复任务", exact=True).click()
        expect(page.locator(".task-card")).to_contain_text("2026-11-24")
        assert len(http("state")["messages"]) == 2
        check("自由输入可用；暂停不分析；恢复只检查最新状态")
        http("source", {"connected": False})
        expect(page.locator(".task-card")).to_contain_text("连接异常", timeout=15000)
        expect(page.locator(".data-warning")).to_contain_text("数据源连接失效")
        http("source", {"connected": True})
        expect(page.locator(".status")).to_contain_text("持续跟进中", timeout=15000)
        page.get_by_role("button", name="判断依据", exact=True).click()
        page.get_by_label("相对下降阈值").select_option("0.25")
        page.get_by_role("button", name="保存调整", exact=True).click()
        assert http("state")["task"]["rules"]["relativeDrop"] == .25
        check("源失效可见、重连恢复、规则可调整并保存")

        other = KEY + "-groups"
        draft = http("delegations", {"text": "帮我持续关注 DAU、点击率和任务完成率"}, other)
        http("tasks", {"draftId": draft["draft"]["id"]}, other)
        http("events/metrics", event("no-groups", "public-no-groups"), other)
        s = http("state", workspace=other)
        assert not s["incidents"][0]["evidence"]["groups"]["valid"]
        assert "Android" not in s["messages"][0]["text"]
        changed = event("anomaly", "public-changed-groups", 2)
        changed["groups"][0]["clicks"] = 30000
        changed["groups"][1]["clicks"] = 20000
        http("events/metrics", changed, other)
        s = http("state", workspace=other)
        assert "18,000" in s["messages"][0]["text"] and "12,000" in s["messages"][0]["text"]
        check("删除或修改分组会真实改变分析")

        latest = http("state")["messages"][0]["id"]
        viewports = [(1440, 900), (1280, 800), (1024, 768), (768, 1024), (390, 844), (320, 740)]
        for width, height in viewports:
            page.set_viewport_size({"width": width, "height": height})
            for route in ["tasks", "messages/" + latest, "home"]:
                page.goto(BASE + "/#" + route, wait_until="networkidle")
                if route.startswith("messages"):
                    page.get_by_role("button", name="查看分析", exact=True).click()
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, route)
                if width == 390:
                    screenshot(page, "06-public-mobile-" + route.split("/")[0] + ".png")
        check("6 种桌面与手机尺寸无页面横向溢出", viewports=viewports)
        before = http("state")
        for path in ["state", "tasks", "incidents", "messages"]:
            http(path)
        after = http("state")
        assert before == after
        check("前台 GET 查询全部只读")
        page.goto(BASE + "/demo.html", wait_until="networkidle")
        duration = page.locator("video").evaluate(
            "async v => {if(v.readyState < 1) await new Promise(r => "
            "v.addEventListener('loadedmetadata',r,{once:true})); return v.duration}"
        )
        assert 90 <= duration <= 120, duration
        page.locator("video").evaluate("v => {v.muted=true; return v.play()}")
        page.wait_for_function("document.querySelector('video').currentTime > 1")
        check("公网 114 秒真实流程 MP4 可实际播放", duration=duration)
        assert not errors, errors
        check("浏览器 JavaScript 错误为 0")
        browser.close()
    http("reset", {}, other)
    print("ALL PASS", len(results), flush=True)
finally:
    OUT.joinpath("results.json").write_text(json.dumps({
        "url": BASE, "workspace": KEY, "checks": results, "javascriptErrors": errors,
    }, ensure_ascii=False, indent=2))
    if any(r["check"] == "浏览器 JavaScript 错误为 0" for r in results):
        OUT.joinpath("persistence-signature.json").write_text(
            json.dumps(persistence_signature(http("state"), KEY))
        )
