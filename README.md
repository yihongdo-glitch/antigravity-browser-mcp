# Antigravity Browser Controller 🌐⚡ (v2.1.0)
> **Seamless Native Chrome Automation for AI Agents via Model Context Protocol (MCP)**  
> *免重启、免 CDP 端口调试、零幽灵窗口、超低 Token 开销，让 AI 随心接管你日常已登录的 Chrome 浏览器。*

[![Author: yihongdo-glitch](https://img.shields.io/badge/Author-yihongdo--glitch-purple.svg)](https://github.com/yihongdo-glitch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-MCP%20v2.2-blue.svg)](https://modelcontextprotocol.io/)
[![Chrome: Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Version: 2.1.0](https://img.shields.io/badge/Version-2.1.0-emerald.svg)](https://github.com/yihongdo-glitch/antigravity-browser-mcp)

[English](#english) | [中文说明](#chinese)

---

<a name="english"></a>
## 🌐 English Documentation

### 💡 Why Antigravity Browser Controller v2.1? (The Problem It Solves)

Current AI browser automation approaches—such as Playwright, Selenium, and vision-based OS "Computer Use"—suffer from critical friction points in real-world workflows:

| Challenges | Traditional Playwright / CDP | Claude Vision "Computer Use" | **Antigravity Browser Controller v2.1** |
| :--- | :--- | :--- | :--- |
| **Element Addressing & Token Cost** | Fragile CSS selectors / XPath guessing; easily broken by obfuscated class names | Takes heavy screenshot & guesses coordinates; burns high-cost Vision tokens | **Low-Token Ref Snapshot (`page.snapshot`): Numbered refs (`[12] button 'Submit'`), smart `<select>` option folding, 85%+ token reduction** |
| **Screenshot Context Bloat** | Dumps raw base64 or pollutes Git working tree | High token cost per frame | **Zero-Base64 Bloat (`browser_take_screenshot`): Saves to `%TEMP%/antigravity_screenshots`, auto-protects Git repos, returns ~30-token metadata receipt** |
| **Login Persistence (Cookies)** | Requires separate profile; loses sessions; triggers aggressive captchas/bot blocks | Operates in active desktop foreground; disrupted by user input | **100% inherits your existing Chrome logins (no re-auth, bypasses captchas)** |
| **Multi-Agent Concurrency** | Single debugger port locks out secondary agents | Fullscreen lock; cannot share mouse | **Dual-port decoupled architecture (WS:18888 + HTTP:18889): concurrent, stateless, zero-lockout** |
| **Background & Lock Screen** | Creates blank `about:blank` ghost windows that hijack focus | Cannot run in background; fails immediately when screen is locked (`Win+L`) | **Runs silently in memory & DOM; continues operating even when Windows is locked** |
| **Modern Web Frameworks & Forms** | Form fills fail to trigger React / Vue synthetic state changes | Coordinate clicks are prone to 5px offsets on dynamic or scrolling pages | **Native setter bypass for inputs + dedicated `browser_select_option` for `<select>` dropdowns** |
| **Security & CSRF** | Unauthenticated local ports expose browser to malicious websites | N/A | **Mandatory Bearer Token auth (`~/.antigravity/bridge.token`), strict Origin whitelist (null blocked), zero wildcard CORS, WS handshake origin check & pinned extension ID** |

---

### ✨ What's New in v2.1.0
1. **Zero-Base64 Bloat & Git-Safe Screenshots (`browser_take_screenshot`)**:
   - Returns a lightweight metadata dictionary (`{"savedPath", "bytes", "tabId", "clipped"}`, ~30 tokens) instead of dumping 110,000+ characters of Base64 into the LLM context.
   - Defaults to `%TEMP%/antigravity_screenshots` and automatically redirects relative paths or paths inside Git repositories to the system temp directory so screenshots never pollute `git status`.
   - Supports element-level clipping via `ref` or `selector`.
2. **Low-Token Page Snapshot (`browser_page_snapshot`)**:
   - Native `<select>` dropdowns (e.g., 90+ birth-year options) no longer dump all option texts into `text` or `bodyTextPreview`. Instead, each `<select>` reports its current selection, `optionsCount`, and a 5-item `optionsPreview`.
   - Configurable `max_text_len` (default `500`) and `include_body_preview` (`True`/`False`).
3. **Native Dropdown Selection (`browser_select_option`)**:
   - Select any `<option>` in a `<select>` element by `value`, visible `text`, or 0-based `index` (targeting `ref` or `selector`), automatically dispatching `input` and `change` events for React/Vue forms.
4. **Mobile Viewport Simulation (`browser_set_viewport`)**:
   - Switch any logged-in tab to mobile dimensions (default `375x812`, `mobile=True`) via persistent CDP device emulation, or pass `reset=True` to restore desktop layout.
5. **Transparent Error Diagnostics**:
   - Fixed HTTP 500 error masking and wrapped MCP tools so timeouts or missing selectors return explicit JSON diagnostics (`timeout`, `target`, `url`, `title`, `readyState`) instead of generic `"Error executing tool"` messages.

---

### 🚀 10-Second Quickstart

#### Step 1: Install the Chrome Extension
```bash
git clone https://github.com/yihongdo-glitch/antigravity-browser-mcp.git
```
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle **Developer mode** in the top-right corner to **ON**.
3. Drag and drop the cloned project folder directly into the extensions page (or click **Load unpacked** and select the folder).
4. The purple Antigravity icon will appear in your Chrome toolbar.

#### Step 2: Configure Your AI Client (One-Click MCP Integration)

##### 1. Claude Desktop / Claude Code (`claude_desktop_config.json` / `.claude.json`)
Add the following to your `mcpServers` object:
```json
{
  "mcpServers": {
    "antigravity-browser": {
      "command": "python",
      "args": [
        "path/to/antigravity-browser-mcp/bridge/mcp_server.py"
      ]
    }
  }
}
```

##### 2. Cursor / Windsurf
In **Settings -> Features -> MCP**, add a new stdio server:
* **Name**: `antigravity-browser`
* **Type**: `command`
* **Command**: `python path/to/antigravity-browser-mcp/bridge/mcp_server.py`

##### 3. Antigravity IDE
Pre-registered in `mcp_config.json`, fully plug-and-play.

---

### 🛠️ MCP Tools Reference (Full Capabilities)

| Tool Name | Key Parameters | Description |
| :--- | :--- | :--- |
| `browser_page_snapshot` | `tab_id`, `max_elems`, `max_text_len`, `include_body_preview` | **AI Page Eyes (Low-Token)**: Analyzes visible interactive elements with numbered refs (`[1]`, `[2]`) and smart `<select>` folding. |
| `browser_page_content` | `tab_id`, `max_len` | **Smart Content Extraction**: Cleanly extracts main article body text while discarding noise. |
| `browser_page_wait` | `selector`, `text`, `timeout`, `tab_id` | Waits until a CSS selector or visible text snippet appears; returns rich diagnostics on timeout. |
| `browser_set_viewport` | `width`, `height`, `mobile`, `reset`, `tab_id` | Simulates mobile screen layout (default `375x812`) or resets back to desktop layout (`reset=True`). |
| `browser_click_element` | `ref`, `selector`, `text`, `tab_id` | Clicks an element. Prioritizes `ref`, followed by deepest leaf-node text match and interactive ancestor escalation. |
| `browser_fill_input` | `value`, `ref`, `selector`, `tab_id` | Injects text into inputs/textareas while bypassing React/Vue synthetic DOM barriers. |
| `browser_select_option` | `value`, `text`, `index`, `ref`, `selector`, `tab_id` | Selects an `<option>` in a native `<select>` dropdown by value, visible text, or index with React/Vue event dispatch. |
| `browser_press_key` | `key`, `ref`, `selector`, `tab_id` | Simulates keyboard key presses (`Enter`, `Tab`, `Escape`, `ArrowDown`, etc.). Submits forms automatically on Enter. |
| `browser_scroll_page` | `ref`, `dx`, `dy`, `to`, `tab_id` | Scrolls the page or scrolls a specific element ref into view (`to="top"` or `to="bottom"`). |
| `browser_list_tabs` | *none* | Lists all open tabs in your Chrome window (ID, title, URL, active state). |
| `browser_get_active_tab` | *none* | Retrieves metadata of the currently focused browser tab. |
| `browser_find_tab` | `url_keyword`, `title_keyword` | Instantly finds an open tab matching a URL or title substring (e.g., `'zhipin.com'`, `'github'`). |
| `browser_evaluate_script` | `tab_id`, `script` | Executes arbitrary JavaScript in the page context, automatically bypassing page CSP restrictions. |
| `browser_take_screenshot` | `tab_id`, `output_path`, `ref`, `selector` | Captures full-page or element-clipped screenshots to `%TEMP%/antigravity_screenshots` and returns lightweight file metadata. |
| `browser_send_cdp` | `tab_id`, `method`, `params` | Direct Chrome DevTools Protocol escape hatch. |
| `browser_navigate` | `tab_id`, `url` | Navigates the specified tab to a new URL. |
| `browser_create_tab` | `url`, `active` | Opens a new browser tab. |
| `browser_close_tab` | `tab_id` | Closes a specific tab by ID. |

---

### 🏗️ Architecture & Privacy Guarantee

```text
  [ AI Clients: Claude Code / Claude Desktop / Cursor / Antigravity / CLI ]
                         ▲
                         │ (HTTP POST REST Gateway: http://127.0.0.1:18889/action)
                         │ (Authenticated via ~/.antigravity/bridge.token)
                         ▼
        [ Antigravity Bridge Daemon & WebSocket Hub ]
                         ▲
                         │ (Local WebSocket: ws://127.0.0.1:18888/ws)
                         │ (Handshake Origin Pinned: chrome-extension://<EXTENSION_ID>)
                         ▼
   [ Chrome Extension v2.1 (Manifest V3 Service Worker) ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ Isolated World DOM Sandbox ]    [ Chrome DevTools Protocol (CDP) ]
- window.__agRefs (Ref Model)     - CSP Bypass Runtime.evaluate
- Smart <select> Folding & Pick   - Lock-Screen & Clipped Screenshot
- Controlled Component Bypass     - Mobile Viewport Emulation (375x812)
```

> **🔒 Privacy & Security Hardening**:
> - **Mandatory Token Authentication**: Every request to the HTTP REST control gateway (`18889`) must provide a valid token via `Authorization: Bearer <token>` or `X-Bridge-Token: <token>`. Missing or invalid tokens are immediately rejected with HTTP `401 Unauthorized`.
> - **WebSocket Handshake Origin Validation & Extension ID Pinning**: WebSocket connections on port `18888` strictly validate the `Origin` header during the HTTP opening handshake, immediately rejecting unauthorized origins (such as malicious webpages or `null`) with HTTP `403 Forbidden`. Wildcard `chrome-extension://` prefix acceptance has been eliminated; connections are strictly pinned to the specific extension ID configured via `ANTIGRAVITY_EXTENSION_ID` or `~/.antigravity/extension.id`.
> - **Strict Origin Isolation & Zero Wildcard CORS**: Wildcard `Access-Control-Allow-Origin: *` has been completely eliminated. Requests with `Origin: null` (such as sandboxed iframes or `file://` contexts) are strictly blocked with HTTP `403 Forbidden`. CORS response headers are strictly reflected only for explicitly whitelisted origins (`chrome-extension://`, `127.0.0.1`, `localhost`).
> - **Fail-Secure Token Management**: Cryptographically secure random tokens (`secrets.token_hex(24)`) are persisted to `~/.antigravity/bridge.token`. The daemon strictly halts execution if token persistence or read fails, completely eliminating fallback to default static tokens.
> - **100% Local Loopback**: All communication happens strictly over the local loopback interface (`127.0.0.1`). **No external servers, no cloud relays, zero telemetry, zero analytics.** Your account cookies, session tokens, and browsing data never leave your local machine.

---

<a name="chinese"></a>
## 🇨🇳 中文说明文档

### 💡 为什么选择 Antigravity Browser Controller v2.1？(痛点对比)

目前主流的 AI 浏览器控制方案（Playwright / Selenium / 视觉截图 OS Control）普遍存在以下痛点：

| 痛点维度 | 传统 Playwright / CDP 方案 | Claude 视觉“操作电脑” | **Antigravity Browser Controller v2.1** |
| :--- | :--- | :--- | :--- |
| **元素定位与 Token 消耗** | 脆弱的 CSS 选择器/XPath，页面动态哈希 class 变动即失效 | 截全屏估算物理坐标，极耗高额视觉 Token | **低 Token Ref 快照 (`page.snapshot`)：可交互元素编号为 `[12] button`，`<select>` 下拉框智能折叠，Token 暴降 85%+** |
| **截图上下文爆炸与仓库污染** | 截图返回 Base64 撑爆上下文，或误写入 Git 仓库目录 | 每帧消耗高额视觉额度 | **零 Base64 膨胀截图 (`browser_take_screenshot`)：默认存至 `%TEMP%/antigravity_screenshots`，自动拦截 Git 仓库路径，仅返回 ~30 Token 路径回执** |
| **日常登录态 (Cookie)** | 必须使用独立用户目录，掉登录态，极易触发滑块风控 | 必须在前台全屏操作，易受外界干扰 | **100% 继承你日常 Chrome 中所有网站的已登录状态** |
| **多 Agent 并发与锁死** | 调试端口互斥，二次拉起直接端口冲突崩溃 | 独占物理桌面，无法并发 | **双端口解耦 (WS:18888 + HTTP:18889)：无状态 HTTP 控制网关，多 Agent/脚本并发零锁死** |
| **后台与锁屏** | 经常弹死白空白窗口（`about:blank`）遮挡屏幕 | 无法在后台运行；锁屏 (`Win+L`) 即报错崩溃 | **纯静默后台与内存 DOM 操作，锁屏后全自动运行** |
| **前端框架与下拉表单** | 注入表单常因 React/Vue 受控组件虚拟 DOM 而无法提交 | 依靠物理坐标点击易偏 5 像素 | **重写 Native Setter + 新增 `browser_select_option` 原生下拉选择，100% 触发框架变更事件** |
| **本地网络安全** | 本地无鉴权端口，易受网页 CSRF / DNS Rebinding 攻击 | 无 | **强制 Bearer Token 鉴权 + 严格来源白名单（封杀 null）+ 消除通配符 CORS + WS 握手强校验与专属扩展 ID 绑定** |

---

### ✨ v2.1.0 核心升级亮点
1. **截图零 Base64 膨胀 + Git 仓库防污染保护 (`browser_take_screenshot`)**：
   - 默认只返回结构化落盘回执（`{"savedPath", "bytes", "tabId", "clipped"}`，仅约 30 Tokens），彻底告别单张截图塞回 11 万字符 Base64 撑爆上下文的问题。
   - 默认落盘至 `%TEMP%\antigravity_screenshots`；若传入相对路径或位于 Git 仓库内的路径，自动重定向至系统临时目录，物理级杜绝测试截图污染代码仓库。
   - 新增支持按 `ref` 或 `selector` 进行局部元素/卡片精准裁剪截图。
2. **页面快照瘦身与 `<select>` 智能折叠 (`browser_page_snapshot`)**：
   - 针对包含几十上百个 `<option>` 的下拉框（如 90+ 年份选择器），不再把全部选项拼接进 `text` 和 `bodyTextPreview`，而是仅返回当前选中项、`optionsCount` 及前 5 项预览。
   - 支持自定义 `max_text_len`（默认 500 字）与 `include_body_preview=False` 开关，获取元素坐标时不再为大段正文重复买单。
3. **原生下拉框选择工具 (`browser_select_option`)**：
   - 无需手写 JS，直接通过 `ref` 或 `selector` 定位 `<select>`，按选项 `value`、可见文字 `text`（如 `"1990年"`）或序号 `index` 一键选中，自动派发 `input` 与 `change` 事件。
4. **手机屏幕宽度模拟 (`browser_set_viewport`)**：
   - 基于持久化 CDP 设备仿真，支持将已登录标签页一键切换为手机视口（默认 `375x812`），或传 `reset=True` 恢复桌面排版，轻松验收移动端 UI。
5. **全链路透明报错诊断**：
   - 修复 HTTP 500 错误吞噬问题；当 `browser_page_wait` 等工具超时或未找到元素时，直接返回包含等待时长、目标选择器/文字、当前页面 URL/标题与 `readyState` 的明文诊断字典，告别模糊的“执行出错”。

---

### 🚀 10 秒极速上手

#### 步骤 1：安装 Chrome 扩展
```bash
git clone https://github.com/yihongdo-glitch/antigravity-browser-mcp.git
```
1. 打开 Chrome 地址栏输入并回车：`chrome://extensions/`
2. 打开右上角 **「开发者模式」** 开关。
3. 将本项目文件夹直接拖入该页面（或点击左上角「加载已解压的扩展程序」选择本项目目录）。
4. 工具栏出现紫色 Antigravity 图标即表示就绪！

#### 步骤 2：配置你的 AI 客户端 (MCP 一键挂载)

##### 1. 在 Claude Desktop / Claude Code 中使用
在 `claude_desktop_config.json` 或 `.claude.json` 的 `mcpServers` 节点中添加：
```json
{
  "mcpServers": {
    "antigravity-browser": {
      "command": "python",
      "args": [
        "path/to/antigravity-browser-mcp/bridge/mcp_server.py"
      ]
    }
  }
}
```

##### 2. 在 Cursor / Windsurf 中使用
在 **Settings -> Features -> MCP** 中添加自定义 stdio 命令：
- **Name**: `antigravity-browser`
- **Command**: `python`
- **Args**: `path/to/antigravity-browser-mcp/bridge/mcp_server.py`

##### 3. 在 Antigravity 中使用
已内置挂载至全局 `mcp_config.json`，开箱即用。

---

### 🛠️ MCP 核心工具能力一览

| 工具名 (Tool) | 关键参数 (Params) | 描述 (Description) |
| :--- | :--- | :--- |
| `browser_page_snapshot` | `tab_id`, `max_elems`, `max_text_len`, `include_body_preview` | **AI 页面之眼（低 Token 版）**：分析当前页面可见交互元素并分配编号 Ref（`[1]`, `[2]`），自动折叠 `<select>` 选项噪音。 |
| `browser_page_content` | `tab_id`, `max_len` | **智能正文抽取**：自动识别文章/主内容容器，剥离无关导航和噪音。 |
| `browser_page_wait` | `selector`, `text`, `timeout`, `tab_id` | 异步等待指定选择器或文字出现；超时返回包含当前 URL、标题与状态的详细诊断。 |
| `browser_set_viewport` | `width`, `height`, `mobile`, `reset`, `tab_id` | 模拟手机屏幕宽度（默认 `375x812`），或传 `reset=True` 恢复桌面默认宽度。 |
| `browser_click_element` | `ref`, `selector`, `text`, `tab_id` | 精准点击。优先支持 Ref 编号，文本模式具备**最深叶子节点匹配 + 向上交互语义穿透**，杜绝点偏死容器。 |
| `browser_fill_input` | `value`, `ref`, `selector`, `tab_id` | 自动输入文本，支持 Ref 编号，穿透 React/Vue 虚拟 DOM，100% 触发 input/change 事件。 |
| `browser_select_option` | `value`, `text`, `index`, `ref`, `selector`, `tab_id` | 原生选择 `<select>` 下拉框选项（支持按值、可见文字或序号），自动触发 React/Vue 表单变更事件。 |
| `browser_press_key` | `key`, `ref`, `selector`, `tab_id` | 模拟按键（`Enter`, `Tab`, `Escape`, 箭头按键等）。在 input 上按 Enter 自动触发表单提交。 |
| `browser_scroll_page` | `ref`, `dx`, `dy`, `to`, `tab_id` | 滚动页面或将指定 Ref 元素居中对齐，支持 `to="top"` / `to="bottom"`。 |
| `browser_list_tabs` | *无* | 列出当前 Chrome 中打开的所有标签页（ID、标题、网址、激活状态）。 |
| `browser_get_active_tab` | *无* | 获取当前正在浏览的活动标签页详情。 |
| `browser_find_tab` | `url_keyword`, `title_keyword` | 按网址或标题关键词瞬间找到指定标签页（如搜索 `"zhipin.com"`）。 |
| `browser_evaluate_script` | `tab_id`, `script` | 在页面上下文执行任意 JS 脚本，底层自动绕过 CSP 安全限制。 |
| `browser_take_screenshot` | `tab_id`, `output_path`, `ref`, `selector` | 高清全页或局部元素截图，默认存入 `%TEMP%\antigravity_screenshots` 并只返回轻量路径信息。 |
| `browser_send_cdp` | `tab_id`, `method`, `params` | 直接发送 Chrome DevTools Protocol 指令（逃生舱）。 |
| `browser_navigate` | `tab_id`, `url` | 控制标签页跳转到新网址。 |
| `browser_create_tab` | `url`, `active` | 新建标签页。 |
| `browser_close_tab` | `tab_id` | 关闭指定标签页。 |

---

### 🏗️ 架构与安全设计

```text
  [ AI 客户端 (Claude Code / Claude Desktop / Cursor / Antigravity / 脚本) ]
                         ▲
                         │ (无状态 HTTP REST 网关: http://127.0.0.1:18889/action)
                         │ (Bearer Token 鉴权: ~/.antigravity/bridge.token)
                         ▼
        [ Python 桥服务守护进程 (WebSocket + HTTP) ]
                         ▲
                         │ (ws://127.0.0.1:18888/ws 本地环回)
                         │ (握手阶段 Origin 精确绑定: chrome-extension://<EXTENSION_ID>)
                         ▼
      [ Chrome 扩展 v2.1 (Manifest V3 Service Worker) ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ 页面 Isolated DOM 沙箱 ]          [ CDP 调试桥接 ]
- window.__agRefs (Ref 快照模型)    - 绕过 CSP 注入
- <select> 智能折叠与原生选择        - 锁屏后台静默/局部裁剪截图
- React/Vue 受控组件穿透            - 375x812 移动端视口模拟
```

> **🔒 隐私与深度安全加固**：
> - **HTTP 控制通道强制鉴权**：访问 REST 控制网关（`18889`）的每个请求必须携带有效令牌（`Authorization: Bearer <token>` 或 `X-Bridge-Token: <token>`），未提供或令牌错误一律返回 HTTP `401 Unauthorized`。
> - **WebSocket 握手期强校验与专属扩展 ID 绑定**：端口 `18888` 的 WebSocket 服务在 HTTP 握手阶段即对 `Origin` 进行强校验，非法来源（如恶意网页或 `null`）直接拒绝（`403 Forbidden`），绝不先建连后断开；彻底废除 `chrome-extension://` 宽泛前缀通配，仅精确放行通过 `ANTIGRAVITY_EXTENSION_ID` 环境变量或 `~/.antigravity/extension.id` 绑定的专属扩展 ID。
> - **严格 Origin 来源隔离与 CORS 强化**：彻底移除 `Access-Control-Allow-Origin: *` 通配符；明确封杀沙箱 iframe 与本地文件发出的 `Origin: null`（直接拦截并返回 HTTP `403 Forbidden`）；仅对显式白名单来源（`chrome-extension://`、`127.0.0.1`、`localhost`）响应对应 CORS 头。
> - **安全失败退出原则 (Fail-Secure)**：采用加密级随机令牌生成（`secrets.token_hex(24)`）并持久化至 `~/.antigravity/bridge.token`。杜绝硬编码后门密钥降级，读写令牌失败时主动报错退出。
> - **纯本地进程环回**：所有交互严格限制在 `127.0.0.1` 本地回环接口。**无任何外部服务器、无任何云端中继、零隐私数据收集**，保护浏览器数据与日常 Cookie 绝对安全。

---

## 📄 License
This project is licensed under the [MIT License](./LICENSE) - created by [@yihongdo-glitch](https://github.com/yihongdo-glitch). Free for personal and commercial use.
