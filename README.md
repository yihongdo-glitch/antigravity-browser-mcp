# Antigravity Browser Controller 🌐⚡
> **Seamless Native Chrome Automation for AI Agents via Model Context Protocol (MCP)**  
> *免重启、免 CDP 端口调试、零幽灵窗口，让 AI 随心接管你日常已登录的 Chrome 浏览器。*

[![Author: yihongdo-glitch](https://img.shields.io/badge/Author-yihongdo--glitch-purple.svg)](https://github.com/yihongdo-glitch)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Protocol: MCP](https://img.shields.io/badge/Protocol-MCP%20v2.2-blue.svg)](https://modelcontextprotocol.io/)
[![Chrome: Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)

[English](#english) | [中文说明](#chinese)

---

<a name="chinese"></a>
## 💡 为什么需要它？(痛点对比)

目前主流的 AI 浏览器控制方案（Playwright / Selenium / 视觉截图 OS Control）普遍存在以下痛点：

| 痛点问题 | 传统 Playwright / CDP 方案 | Claude 视觉“操作电脑” | **Antigravity Browser Controller** |
| :--- | :--- | :--- | :--- |
| **日常登录态 (Cookie)** | 必须使用独立用户目录，掉登录态，极易触发滑块风控 | 必须在前台全屏操作，易受干扰 | **100% 继承你日常 Chrome 中所有网站的已登录状态** |
| **启动与配置** | 必须关闭所有现有 Chrome 进程，加 `--remote-debugging-port=9222` | 需要截屏 + 估算坐标，耗费高昂 Vision Token | **10 秒拖放扩展即装即用，零命令行启动参数** |
| **后台与锁屏** | 经常弹死白空白窗口（`about:blank`）遮挡屏幕 | 无法在后台运行；锁屏 (`Win+L`) 即瞎眼报错 | **纯静默后台与内存 DOM 操作，锁屏后全自动运行** |
| **前端框架兼容性** | 注入表单常因 React/Vue 受控组件虚拟 DOM 而无法提交 | 依靠坐标点击易偏 5 像素 | **重写 Native Setter，穿透并触发真实变更事件** |

---

## 🚀 10 秒极速上手

### 1. 克隆与安装扩展
```bash
git clone https://github.com/yihongdo-glitch/antigravity-browser-mcp.git
```
1. 打开 Chrome 地址栏输入并回车：`chrome://extensions/`
2. 打开右上角 **「开发者模式」** 开关。
3. 将本项目文件夹直接拖入该页面（或点击左上角「加载已解压的扩展程序」选择本项目目录）。
4. 工具栏出现紫色 Antigravity 图标即表示就绪！

### 2. 配置你的 AI 客户端 (MCP 一键挂载)

#### 在 Claude Desktop 中使用
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

#### 在 Cursor / Windsurf 中使用
在 MCP 设置中添加自定义 stdio 命令：
- **Name**: `antigravity-browser`
- **Command**: `python`
- **Args**: `path/to/antigravity-browser-mcp/bridge/mcp_server.py`

#### 在 Antigravity 中使用
已内置挂载至全局 `mcp_config.json`，开箱即用。

---

## 🛠️ MCP 核心工具能力一览 (11 项原子工具)

| 工具名 (Tool) | 描述 (Description) |
| :--- | :--- |
| `browser_list_tabs` | 列出当前 Chrome 中打开的所有标签页（ID、标题、网址、激活状态） |
| `browser_get_active_tab` | 获取当前正在浏览的活动标签页详情 |
| `browser_find_tab` | 按网址或标题关键词瞬间找到指定标签页（如搜索 `"zhipin.com"`） |
| `browser_click_element` | 模拟真实点击。不仅支持 CSS 选择器，还**支持直接按按钮文字点击**（如 `text="立即沟通"`） |
| `browser_fill_input` | 自动向表单输入文本，穿透 React/Vue 虚拟 DOM，100% 触发 input/change 事件 |
| `browser_query_elements` | 结构化读取页面指定 DOM 元素（文本、标签、链接、属性） |
| `browser_evaluate_script` | 在页面上下文执行任意 JS 脚本，底层自动绕过 CSP 安全限制 |
| `browser_take_screenshot` | 高清截图，即使浏览器在后台或电脑锁屏 (`Win+L`) 也能清晰截取 |
| `browser_navigate` | 控制标签页跳转到新网址 |
| `browser_create_tab` / `browser_close_tab` | 新建和关闭标签页 |

---

## 🏗️ 架构与安全设计

```text
  [ AI 客户端 (Claude / Cursor / Antigravity) ]
                       ▲
                       │ (MCP stdio / JSON-RPC 2.0)
                       ▼
          [ Python MCP Bridge Server ]
                       ▲
                       │ (ws://127.0.0.1:18888 本地环回通信)
                       ▼
     [ Chrome 扩展 (Manifest V3 Service Worker) ]
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
    [ DOM 注入引擎 ]     [ CDP 调试桥接 ]
   (零延迟、穿透框架)    (绕过CSP、锁屏快照)
```

> **🔒 隐私与安全承诺**：
> 本工具完全基于本地环回地址（`127.0.0.1`）进行进程间通讯，**不存在任何外部服务器、没有任何云端中继、零隐私数据上报**。你的所有账号 Cookie 和浏览数据绝不离开你的电脑本地。

---

<a name="english"></a>
## 🌐 English Overview

**Antigravity Browser Controller** is a lightweight, high-performance browser automation relay for modern AI Agents via Anthropic's **Model Context Protocol (MCP)**.

### Why not Playwright or Vision Computer Use?
* **Zero Auth Friction**: Inherits 100% of your real Chrome session (cookies, logins, 2FA) without launching sandboxed "ghost" windows or requiring `--remote-debugging-port`.
* **Zero Mouse Stealing**: Unlike vision-based OS automation (Claude Computer Use), this extension operates in silent background DOM space. You can keep typing, coding, or gaming without mouse cursor interruptions.
* **Immune to Lock Screen**: Continues executing flawlessly even when your screen is locked (`Win + L`).
* **Framework-Friendly**: Overrides native setters to properly trigger Vue / React controlled component states.

### Quick Setup
```bash
git clone https://github.com/yihongdo-glitch/antigravity-browser-mcp.git
```
1. Load this folder as an unpacked extension at `chrome://extensions/` (Enable Developer Mode).
2. Add the MCP server entry to your client config (`claude_desktop_config.json` or Cursor MCP settings):
```json
{
  "mcpServers": {
    "antigravity-browser": {
      "command": "python",
      "args": ["path/to/antigravity-browser-mcp/bridge/mcp_server.py"]
    }
  }
}
```

---

## 📄 License
This project is licensed under the [MIT License](./LICENSE) - created by [@yihongdo-glitch](https://github.com/yihongdo-glitch). Free for personal and commercial use.
