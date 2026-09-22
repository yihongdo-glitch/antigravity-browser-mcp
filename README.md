# Antigravity Browser Controller 🌐⚡ (v2.0.0)
> **Seamless Native Chrome Automation for AI Agents via Model Context Protocol (MCP)**  
> *免重启、免 CDP 端口调试、零幽灵窗口，让 AI 随心接管你日常已登录的 Chrome 浏览器。*

[![Author: yihongdo-glitch](https://img.shields.io/badge/Author-yihongdo--glitch-purple.svg)](https://github.com/yihongdo-glitch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-MCP%20v2.2-blue.svg)](https://modelcontextprotocol.io/)
[![Chrome: Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-emerald.svg)](https://github.com/yihongdo-glitch/antigravity-browser-mcp)

[English](#english) | [中文说明](#chinese)

---

<a name="english"></a>
## 🌐 English Documentation

### 💡 Why Antigravity Browser Controller v2.0? (The Problem It Solves)

Current AI browser automation approaches—such as Playwright, Selenium, and vision-based OS "Computer Use"—suffer from critical friction points in real-world workflows:

| Challenges | Traditional Playwright / CDP | Claude Vision "Computer Use" | **Antigravity Browser Controller v2.0** |
| :--- | :--- | :--- | :--- |
| **Element Addressing** | Fragile CSS selectors / XPath guessing; easily broken by obfuscated class names | Takes heavy screenshot & guesses coordinates; burns high-cost Vision tokens | **Ref Snapshot (`page.snapshot`): Numbered refs (`[12] button 'Submit'`), 85% token reduction, zero selector brittleness** |
| **Login Persistence (Cookies)** | Requires separate profile; loses sessions; triggers aggressive captchas/bot blocks | Operates in active desktop foreground; disrupted by user input | **100% inherits your existing Chrome logins (no re-auth, bypasses captchas)** |
| **Multi-Agent Concurrency** | Single debugger port locks out secondary agents | Fullscreen lock; cannot share mouse | **Dual-port decoupled architecture (WS:18888 + HTTP:18889): concurrent, stateless, zero-lockout** |
| **Background & Lock Screen** | Creates blank `about:blank` ghost windows that hijack focus | Cannot run in background; fails immediately when screen is locked (`Win+L`) | **Runs silently in memory & DOM; continues operating even when Windows is locked** |
| **Modern Web Frameworks** | Form fills fail to trigger React / Vue synthetic state changes | Coordinate clicks are prone to 5px offsets on dynamic or scrolling pages | **Overrides native setters to guarantee 100% reliable React / Vue event dispatching** |
| **Security & CSRF** | Unauthenticated local ports expose browser to malicious websites | N/A | **Origin isolation + Localhost Bearer Token auth (`~/.antigravity/bridge.token`)** |

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

##### 1. Claude Desktop (`claude_desktop_config.json`)
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
| `browser_page_snapshot` | `tab_id`, `max_elems` | **AI Page Eyes**: Analyzes visible interactive elements, assigning unique numbered refs (`[1]`, `[2]`). Use before click/fill! |
| `browser_page_content` | `tab_id`, `max_len` | **Smart Content Extraction**: Cleanly extracts main article body text while discarding noise. |
| `browser_page_wait` | `selector`, `text`, `timeout` | Waits until a specific CSS selector or visible text snippet appears on the page. |
| `browser_click_element` | `ref`, `selector`, `text` | Clicks an element. Prioritizes `ref`, followed by deepest leaf-node text match and interactive ancestor escalation. |
| `browser_fill_input` | `value`, `ref`, `selector` | Injects text into inputs/textareas while bypassing React/Vue synthetic DOM barriers. |
| `browser_press_key` | `key`, `ref`, `selector` | Simulates keyboard key presses (`Enter`, `Tab`, `Escape`, `ArrowDown`, etc.). Submits forms automatically on Enter. |
| `browser_scroll_page` | `ref`, `dx`, `dy`, `to` | Scrolls the page or scrolls a specific element ref into view (`to="top"` or `to="bottom"`). |
| `browser_list_tabs` | *none* | Lists all open tabs in your Chrome window (ID, title, URL, active state). |
| `browser_get_active_tab` | *none* | Retrieves metadata of the currently focused browser tab. |
| `browser_find_tab` | `url_keyword`, `title_keyword` | Instantly finds an open tab matching a URL or title substring (e.g., `'zhipin.com'`, `'github'`). |
| `browser_evaluate_script` | `tab_id`, `script` | Executes arbitrary JavaScript in the page context, automatically bypassing page CSP restrictions. |
| `browser_take_screenshot` | `tab_id`, `output_path` | Captures high-fidelity page screenshots—works even when Chrome is minimized or screen is locked. |
| `browser_send_cdp` | `tab_id`, `method`, `params` | Direct Chrome DevTools Protocol escape hatch. |
| `browser_navigate` | `tab_id`, `url` | Navigates the specified tab to a new URL. |
| `browser_create_tab` | `url`, `active` | Opens a new browser tab. |
| `browser_close_tab` | `tab_id` | Closes a specific tab by ID. |

---

### 🏗️ Architecture & Privacy Guarantee

```text
  [ AI Clients: Claude Desktop / Cursor / Antigravity / CLI Scripts ]
                         ▲
                         │ (HTTP POST REST Gateway: http://127.0.0.1:18889/action)
                         │ (Authenticated via ~/.antigravity/bridge.token)
                         ▼
        [ Antigravity Bridge Daemon & WebSocket Hub ]
                         ▲
                         │ (Local WebSocket: ws://127.0.0.1:18888/ws)
                         │ (Origin-filtered: chrome-extension:// ONLY)
                         ▼
   [ Chrome Extension v2.0 (Manifest V3 Service Worker) ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ Isolated World DOM Sandbox ]    [ Chrome DevTools Protocol (CDP) ]
- window.__agRefs (Ref Model)     - CSP Bypass Runtime.evaluate
- Leaf-Node Precision Engine      - Lock-Screen Silent Screenshot
- Controlled Component Bypass
```

> **🔒 Privacy Commitment**:
> All communication happens strictly over the local loopback interface (`127.0.0.1`) with origin filtering and token authentication. **No external servers, no cloud relays, zero telemetry, zero analytics.** Your account cookies, session tokens, and browsing data never leave your local machine.

---

<a name="chinese"></a>
## 🇨🇳 中文说明文档

### 💡 为什么选择 Antigravity Browser Controller v2.0？(痛点对比)

目前主流的 AI 浏览器控制方案（Playwright / Selenium / 视觉截图 OS Control）普遍存在以下痛点：

| 痛点维度 | 传统 Playwright / CDP 方案 | Claude 视觉“操作电脑” | **Antigravity Browser Controller v2.0** |
| :--- | :--- | :--- | :--- |
| **元素定位与寻址** | 脆弱的 CSS 选择器/XPath，页面动态哈希 class 变动即失效 | 截全屏估算物理坐标，极耗高额视觉 Token | **Ref 编号快照 (`page.snapshot`)：将可交互元素直接编号为 `[12] button '立即沟通'`，Token 暴降 85%，零盲猜** |
| **日常登录态 (Cookie)** | 必须使用独立用户目录，掉登录态，极易触发滑块风控 | 必须在前台全屏操作，易受外界干扰 | **100% 继承你日常 Chrome 中所有网站的已登录状态** |
| **多 Agent 并发与锁死** | 调试端口互斥，二次拉起直接端口冲突崩溃 | 独占物理桌面，无法并发 | **双端口解耦 (WS:18888 + HTTP:18889)：无状态 HTTP 控制网关，多 Agent/脚本并发零锁死** |
| **后台与锁屏** | 经常弹死白空白窗口（`about:blank`）遮挡屏幕 | 无法在后台运行；锁屏 (`Win+L`) 即报错崩溃 | **纯静默后台与内存 DOM 操作，锁屏后全自动运行** |
| **前端框架兼容性** | 注入表单常因 React/Vue 受控组件虚拟 DOM 而无法提交 | 依靠物理坐标点击易偏 5 像素 | **重写 Native Setter，穿透并触发真实变更事件** |
| **本地网络安全** | 本地无鉴权端口，易受网页 CSRF / DNS Rebinding 攻击 | 无 | **严格 Origin 校验 + 本地 Bearer Token 随机密钥 (`~/.antigravity/bridge.token`)** |

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

##### 1. 在 Claude Desktop 中使用
在 `claude_desktop_config.json` 的 `mcpServers` 节点中添加：
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
| `browser_page_snapshot` | `tab_id`, `max_elems` | **AI 页面之眼**：智能分析当前页面的所有可见交互元素，分配唯一编号 Ref（如 `[1]`, `[2]`...），点击/填写前必调！ |
| `browser_page_content` | `tab_id`, `max_len` | **智能正文抽取**：自动识别文章/主内容容器，剥离无关导航和噪音。 |
| `browser_page_wait` | `selector`, `text`, `timeout` | 异步等待指定选择器或文字在页面中渲染完成。 |
| `browser_click_element` | `ref`, `selector`, `text` | 精准点击。优先支持 Ref 编号，文本模式具备**最深叶子节点匹配 + 向上交互语义穿透**，杜绝点偏死容器。 |
| `browser_fill_input` | `value`, `ref`, `selector` | 自动输入文本，支持 Ref 编号，穿透 React/Vue 虚拟 DOM，100% 触发 input/change 事件。 |
| `browser_press_key` | `key`, `ref`, `selector` | 模拟按键（`Enter`, `Tab`, `Escape`, 箭头按键等）。在 input 上按 Enter 自动触发表单提交。 |
| `browser_scroll_page` | `ref`, `dx`, `dy`, `to` | 滚动页面或将指定 Ref 元素居中对齐，支持 `to="top"` / `to="bottom"`。 |
| `browser_list_tabs` | *无* | 列出当前 Chrome 中打开的所有标签页（ID、标题、网址、激活状态）。 |
| `browser_get_active_tab` | *无* | 获取当前正在浏览的活动标签页详情。 |
| `browser_find_tab` | `url_keyword`, `title_keyword` | 按网址或标题关键词瞬间找到指定标签页（如搜索 `"zhipin.com"`）。 |
| `browser_evaluate_script` | `tab_id`, `script` | 在页面上下文执行任意 JS 脚本，底层自动绕过 CSP 安全限制。 |
| `browser_take_screenshot` | `tab_id`, `output_path` | 高清截图，即使浏览器在后台或电脑锁屏 (`Win+L`) 也能清晰截取。 |
| `browser_send_cdp` | `tab_id`, `method`, `params` | 直接发送 Chrome DevTools Protocol 指令（逃生舱）。 |
| `browser_navigate` | `tab_id`, `url` | 控制标签页跳转到新网址。 |
| `browser_create_tab` | `url`, `active` | 新建标签页。 |
| `browser_close_tab` | `tab_id` | 关闭指定标签页。 |

---

### 🏗️ 架构与安全设计

```text
  [ AI 客户端 (Claude / Cursor / Antigravity / 脚本) ]
                         ▲
                         │ (无状态 HTTP REST 网关: http://127.0.0.1:18889/action)
                         │ (Bearer Token 鉴权: ~/.antigravity/bridge.token)
                         ▼
        [ Python 桥服务守护进程 (WebSocket + HTTP) ]
                         ▲
                         │ (ws://127.0.0.1:18888/ws 本地环回)
                         │ (Origin 过滤: 仅放行 chrome-extension://)
                         ▼
      [ Chrome 扩展 v2.0 (Manifest V3 Service Worker) ]
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
[ 页面 Isolated DOM 沙箱 ]          [ CDP 调试桥接 ]
- window.__agRefs (Ref 快照模型)    - 绕过 CSP 注入
- 叶子节点精准穿透引擎              - 锁屏后台静默快照
- React/Vue 受控组件穿透
```

> **🔒 隐私与安全承诺**：
> 本工具完全基于本地环回地址（`127.0.0.1`）进行进程间通讯，具备 Origin 来源过滤与本地 Bearer Token 鉴权机制。**不存在任何外部服务器、没有任何云端中继、零隐私数据上报**。你的所有账号 Cookie 和浏览数据绝不离开你的电脑本地。

---

## 📄 License
This project is licensed under the [MIT License](./LICENSE) - created by [@yihongdo-glitch](https://github.com/yihongdo-glitch). Free for personal and commercial use.
