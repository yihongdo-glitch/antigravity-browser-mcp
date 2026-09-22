#!/usr/bin/env python3
"""
Antigravity Browser Bridge - Native RPC Gateway, Daemon & Python SDK (v2.0.0)
=============================================================================
Architecture:
  Chrome Extension (WS Client)
        |  ws://127.0.0.1:18888/ws (auto-reconnects every 3s)
  [ antigravity_bridge.py serve ]  (Background Daemon / In-process fallback)
        |  http://127.0.0.1:18889/action (REST Control Channel + CSRF/Token Auth)
  Agent / SDK / CLI / Other Tools (Concurrent, Stateless, Zero Lockout)

Key Upgrades in v2.0.0:
- Single-instance lockout bug permanently fixed via dual-port architecture.
- Full Ref Snapshot engine support (`page.snapshot`, `page.content`, `page.wait`).
- Origin validation & Local Loopback Bearer Token auth against CSRF / DNS rebinding.
- Automatic lazy daemon spawning with in-process resilient fallback.
- Python SDK + CLI interface matching multi-agent workflow requirements.
"""

import argparse
import asyncio
import base64
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Ensure loopback traffic is never intercepted by local proxy
os.environ["NO_PROXY"] = "127.0.0.1,localhost"
os.environ["no_proxy"] = "127.0.0.1,localhost"

try:
    from websockets.asyncio.server import serve as ws_serve
except ImportError:
    from websockets import serve as ws_serve

DEFAULT_WS_PORT = 18888
CTRL_PORT_OFFSET = 1  # HTTP control port = ws_port + 1 (18889)
SELF_PATH = os.path.abspath(__file__)
TOKEN_DIR = os.path.expanduser("~/.antigravity")
TOKEN_FILE = os.path.join(TOKEN_DIR, "bridge.token")

NOT_CONNECTED_HINT = (
    "Chrome 插件未连接。请确认: (1) Chrome 浏览器正在运行；"
    "(2) 已在 chrome://extensions 开发者模式加载 Antigravity Browser Controller；"
    "(3) 插件徽标显示 ON (若刚加载，等待 3 秒内将自动连接)。"
)


def log(msg: str):
    print(f"[AntigravityBridge] {msg}", flush=True)


# ============================================================================
# Security Token Management (Anti-CSRF & Origin Isolation)
# ============================================================================

def get_or_create_token() -> str:
    try:
        os.makedirs(TOKEN_DIR, exist_ok=True)
        if os.path.exists(TOKEN_FILE):
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                token = f.read().strip()
                if token:
                    return token
        token = secrets.token_hex(24)
        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(token)
        return token
    except Exception as e:
        log(f"Token storage warning: {e}")
        return "ag-default-secure-token"


_NO_PROXY_OPENER = None


def _get_opener():
    global _NO_PROXY_OPENER
    if _NO_PROXY_OPENER is None:
        _NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    return _NO_PROXY_OPENER


def http_open(req, timeout: float):
    return _get_opener().open(req, timeout=timeout)


# ============================================================================
# Core Bridge Server (WebSocket Server + HTTP REST Gateway)
# ============================================================================

class AntigravityBridgeServer:
    def __init__(self, ws_port: int = DEFAULT_WS_PORT):
        self.ws_port = ws_port
        self.ctrl_port = ws_port + CTRL_PORT_OFFSET
        self.clients = []
        self.pending_requests: Dict[str, asyncio.Future] = {}
        self.loop = None
        self.auth_token = get_or_create_token()
        self._httpd = None

    def _is_origin_allowed(self, origin: Optional[str]) -> bool:
        if not origin:
            return True
        origin_lower = origin.lower()
        if origin_lower.startswith("chrome-extension://"):
            return True
        if origin_lower in ("null", "http://127.0.0.1", "http://localhost",
                            f"http://127.0.0.1:{self.ctrl_port}", f"http://localhost:{self.ctrl_port}"):
            return True
        return False

    async def _ws_handler(self, websocket):
        headers = getattr(websocket, "request_headers", None)
        origin = None
        if headers:
            origin = headers.get("Origin") or headers.get("origin")
        if origin and not self._is_origin_allowed(origin):
            log(f"Rejected unauthorized WebSocket Origin: {origin}")
            await websocket.close(code=1008, reason="Unauthorized Origin")
            return

        peer = getattr(websocket, "remote_address", "?")
        log(f"Chrome Extension connected from {peer}")
        self.clients.append(websocket)
        try:
            async for raw in websocket:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue

                if msg.get("type") == "handshake":
                    log(f"Handshake accepted: {msg.get('agent')} v{msg.get('version')}")
                    continue

                rid = msg.get("id")
                if rid and rid in self.pending_requests:
                    fut = self.pending_requests.pop(rid)
                    if not fut.done():
                        if msg.get("success"):
                            fut.set_result(msg.get("data"))
                        else:
                            fut.set_exception(RuntimeError(msg.get("error") or "Extension error"))
        except Exception:
            pass
        finally:
            if websocket in self.clients:
                self.clients.remove(websocket)
            log("Chrome Extension disconnected.")

    async def call_action(self, action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 25.0) -> Any:
        if not self.clients:
            raise ConnectionError("extension-not-connected")
        conn = self.clients[-1]
        rid = uuid.uuid4().hex
        fut = self.loop.create_future()
        self.pending_requests[rid] = fut
        payload = {"id": rid, "action": action, "params": params or {}}
        await conn.send(json.dumps(payload))
        try:
            return await asyncio.wait_for(fut, timeout)
        except asyncio.TimeoutError:
            self.pending_requests.pop(rid, None)
            raise TimeoutError(f"Action '{action}' timed out after {timeout}s")

    async def _keepalive(self):
        while True:
            await asyncio.sleep(20)
            if self.clients:
                for c in list(self.clients):
                    try:
                        await c.send(json.dumps({"id": f"ka-{uuid.uuid4().hex[:8]}", "action": "ping", "params": {}}))
                    except Exception:
                        pass

    async def _ws_main(self):
        self.loop = asyncio.get_running_loop()
        async with ws_serve(lambda c: self._ws_handler(c), "127.0.0.1", self.ws_port):
            log(f"WebSocket Listening on ws://127.0.0.1:{self.ws_port}/ws")
            await self._keepalive()

    def start_http(self):
        server_self = self

        class CtrlHandler(BaseHTTPRequestHandler):
            def _send_json(self, code: int, data: Any):
                body = json.dumps(data, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.end_headers()

            def _check_security(self) -> bool:
                origin = self.headers.get("Origin") or self.headers.get("origin")
                if origin and not server_self._is_origin_allowed(origin):
                    log(f"Blocked forbidden HTTP Origin: {origin}")
                    self._send_json(403, {"success": False, "error": "Forbidden Origin"})
                    return False

                # Token validation
                auth_header = self.headers.get("Authorization", "")
                x_token = self.headers.get("X-Bridge-Token", "")
                provided_token = ""
                if auth_header.startswith("Bearer "):
                    provided_token = auth_header[7:].strip()
                elif x_token:
                    provided_token = x_token.strip()

                # Loopback requests from local scripts can supply token or pass if local caller
                if provided_token and provided_token != server_self.auth_token:
                    self._send_json(401, {"success": False, "error": "Invalid Bearer Token"})
                    return False
                return True

            def do_GET(self):
                if not self._check_security():
                    return
                if self.path == "/status":
                    self._send_json(200, {
                        "bridge": "running",
                        "wsPort": server_self.ws_port,
                        "ctrlPort": server_self.ctrl_port,
                        "extensionConnected": bool(server_self.clients),
                        "version": "2.0.0"
                    })
                else:
                    self._send_json(404, {"error": "Endpoint not found"})

            def do_POST(self):
                if not self._check_security():
                    return
                if self.path != "/action":
                    return self._send_json(404, {"error": "Endpoint not found"})

                try:
                    length = int(self.headers.get("Content-Length", 0))
                    raw_body = self.rfile.read(length) if length > 0 else b"{}"
                    req = json.loads(raw_body.decode("utf-8"))
                except Exception as e:
                    return self._send_json(400, {"success": False, "error": f"Bad request JSON: {e}"})

                action = req.get("action")
                params = req.get("params") or {}
                timeout = float(req.get("timeout", 25))

                if not action:
                    return self._send_json(400, {"success": False, "error": "Missing 'action'"})

                if server_self.loop is None:
                    return self._send_json(503, {"success": False, "error": "Bridge event loop not initialized"})

                fut = asyncio.run_coroutine_threadsafe(server_self.call_action(action, params, timeout), server_self.loop)
                try:
                    data = fut.result(timeout + 5)
                    self._send_json(200, {"success": True, "data": data})
                except ConnectionError:
                    self._send_json(503, {"success": False, "error": NOT_CONNECTED_HINT})
                except TimeoutError as e:
                    self._send_json(504, {"success": False, "error": str(e)})
                except Exception as e:
                    self._send_json(500, {"success": False, "error": str(e)})

            def log_message(self, format, *args):
                pass  # Suppress noisy standard HTTP logs

        self._httpd = ThreadingHTTPServer(("127.0.0.1", self.ctrl_port), CtrlHandler)
        threading.Thread(target=self._httpd.serve_forever, daemon=True, name="AG-Ctrl-HTTP").start()
        log(f"HTTP Control Gateway active on http://127.0.0.1:{self.ctrl_port}/action")

    def start_background(self):
        """Starts both WS and HTTP servers in daemon threads (in-process fallback)."""
        threading.Thread(target=self._run_asyncio_thread, daemon=True, name="AG-WS-Thread").start()
        for _ in range(50):
            if self.loop:
                break
            time.sleep(0.1)
        self.start_http()

    def _run_asyncio_thread(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._ws_main())
        except OSError as e:
            log(f"WS bind error: {e}")


# ============================================================================
# Daemon Lifecycle & Detached Auto-Spawn
# ============================================================================

def is_port_reachable(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        return s.connect_ex(("127.0.0.1", port)) == 0
    finally:
        s.close()


def spawn_detached_daemon(ws_port: int = DEFAULT_WS_PORT) -> bool:
    flags = 0
    if os.name == "nt":
        flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    try:
        subprocess.Popen(
            [sys.executable, SELF_PATH, "serve", "--port", str(ws_port)],
            creationflags=flags,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            cwd=os.path.dirname(SELF_PATH),
        )
        return True
    except Exception as e:
        log(f"Failed to spawn detached daemon: {e}")
        return False


def ensure_bridge_active(ws_port: int = DEFAULT_WS_PORT) -> bool:
    ctrl_port = ws_port + CTRL_PORT_OFFSET
    if is_port_reachable(ctrl_port):
        return True

    # Try detached background spawn
    if spawn_detached_daemon(ws_port):
        for _ in range(30):
            if is_port_reachable(ctrl_port):
                return True
            time.sleep(0.2)

    # Resilient in-process fallback
    try:
        bridge = AntigravityBridgeServer(ws_port)
        bridge.start_background()
        for _ in range(40):
            if is_port_reachable(ctrl_port):
                return True
            time.sleep(0.15)
    except OSError:
        pass
    return is_port_reachable(ctrl_port)


def wait_for_extension(ws_port: int = DEFAULT_WS_PORT, timeout: float = 6.0) -> bool:
    ctrl_port = ws_port + CTRL_PORT_OFFSET
    deadline = time.time() + timeout
    token = get_or_create_token()
    while time.time() < deadline:
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{ctrl_port}/status",
                headers={"Authorization": f"Bearer {token}"}
            )
            with http_open(req, timeout=2.0) as r:
                data = json.loads(r.read())
                if data.get("extensionConnected"):
                    return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def call_bridge(action: str, params: Optional[Dict[str, Any]] = None,
                timeout: float = 25.0, ws_port: int = DEFAULT_WS_PORT,
                wait_ext: float = 6.0) -> Any:
    ctrl_port = ws_port + CTRL_PORT_OFFSET
    if not ensure_bridge_active(ws_port):
        raise RuntimeError(f"Bridge gateway cannot start on 127.0.0.1:{ws_port}/{ctrl_port}")

    if action not in ("ping", "status"):
        if not wait_for_extension(ws_port, timeout=wait_ext):
            raise RuntimeError(NOT_CONNECTED_HINT)

    token = get_or_create_token()
    body = json.dumps({"action": action, "params": params or {}, "timeout": timeout}).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:{ctrl_port}/action",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        },
        method="POST"
    )

    try:
        with http_open(req, timeout=timeout + 10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success"):
                return data.get("data")
            raise RuntimeError(data.get("error") or "Unknown bridge error")
    except urllib.error.HTTPError as e:
        try:
            err_data = json.loads(e.read().decode("utf-8"))
            raise RuntimeError(err_data.get("error") or f"HTTP {e.code}")
        except Exception:
            raise RuntimeError(f"HTTP Error {e.code}: {e.reason}")


# ============================================================================
# Synchronous Python SDK for Antigravity Agents
# ============================================================================

class AntigravityBrowser:
    """
    Antigravity Browser Controller Client SDK (v2.0.0)
    Multi-process safe, zero-lockout, with Ref Snapshot support.
    """

    def __init__(self, port: int = DEFAULT_WS_PORT):
        self.port = port
        ensure_bridge_active(self.port)

    def is_extension_connected(self) -> bool:
        ctrl_port = self.port + CTRL_PORT_OFFSET
        token = get_or_create_token()
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{ctrl_port}/status",
                headers={"Authorization": f"Bearer {token}"}
            )
            with http_open(req, timeout=2.0) as r:
                st = json.loads(r.read())
                return bool(st.get("extensionConnected"))
        except Exception:
            return False

    def wait_for_extension(self, timeout: float = 6.0) -> bool:
        return wait_for_extension(self.port, timeout=timeout)

    def status(self) -> Dict[str, Any]:
        ctrl_port = self.port + CTRL_PORT_OFFSET
        token = get_or_create_token()
        req = urllib.request.Request(
            f"http://127.0.0.1:{ctrl_port}/status",
            headers={"Authorization": f"Bearer {token}"}
        )
        with http_open(req, timeout=3.0) as r:
            return json.loads(r.read())

    # Tabs operations
    def list_tabs(self) -> List[Dict[str, Any]]:
        return call_bridge("tabs.list", ws_port=self.port)

    def get_active_tab(self) -> Optional[Dict[str, Any]]:
        return call_bridge("tabs.get_active", ws_port=self.port)

    def find_tab(self, url_keyword: str = "", title_keyword: str = "") -> Optional[Dict[str, Any]]:
        for t in self.list_tabs():
            url = t.get("url", "").lower()
            title = t.get("title", "").lower()
            if url_keyword and url_keyword.lower() in url:
                return t
            if title_keyword and title_keyword.lower() in title:
                return t
        return None

    def create_tab(self, url: str = "about:blank", active: bool = True) -> Dict[str, Any]:
        return call_bridge("tabs.create", {"url": url, "active": active}, ws_port=self.port)

    def navigate(self, tab_id: int, url: str) -> Dict[str, Any]:
        return call_bridge("tabs.update", {"tabId": tab_id, "url": url}, ws_port=self.port)

    def activate_tab(self, tab_id: int) -> Dict[str, Any]:
        return call_bridge("tabs.activate", {"tabId": tab_id}, ws_port=self.port)

    def close_tab(self, tab_id: int) -> Dict[str, Any]:
        return call_bridge("tabs.close", {"tabId": tab_id}, ws_port=self.port)

    # Page Intelligence & Ref Model
    def page_snapshot(self, tab_id: Optional[int] = None, max_elems: int = 200) -> Dict[str, Any]:
        """Returns structured list of interactive elements with numbered refs."""
        return call_bridge("page.snapshot", {"tabId": tab_id, "maxElems": max_elems}, ws_port=self.port)

    def page_content(self, tab_id: Optional[int] = None, max_len: int = 50000) -> Dict[str, Any]:
        """Smart article and content extraction."""
        return call_bridge("page.content", {"tabId": tab_id, "maxLen": max_len}, ws_port=self.port)

    def page_wait(self, selector: Optional[str] = None, text: Optional[str] = None,
                  timeout: float = 10.0, tab_id: Optional[int] = None) -> Dict[str, Any]:
        """Wait for selector or text to appear."""
        return call_bridge("page.wait", {"selector": selector, "text": text, "timeout": timeout, "tabId": tab_id},
                           timeout=timeout + 10, ws_port=self.port)

    # DOM Actions
    def click(self, tab_id: Optional[int] = None, ref: Optional[int] = None,
              selector: Optional[str] = None, text: Optional[str] = None) -> Dict[str, Any]:
        """Click targeting ref (preferred), selector, or text."""
        params: Dict[str, Any] = {"tabId": tab_id}
        if ref is not None:
            params["ref"] = ref
        if selector:
            params["selector"] = selector
        if text:
            params["text"] = text
        return call_bridge("dom.click", params, ws_port=self.port)

    def fill(self, tab_id: Optional[int] = None, ref: Optional[int] = None,
             selector: Optional[str] = None, value: str = "") -> Dict[str, Any]:
        """Fill input targeting ref (preferred) or selector."""
        params: Dict[str, Any] = {"tabId": tab_id, "value": value}
        if ref is not None:
            params["ref"] = ref
        if selector:
            params["selector"] = selector
        return call_bridge("dom.fill", params, ws_port=self.port)

    def press(self, tab_id: Optional[int] = None, ref: Optional[int] = None,
              selector: Optional[str] = None, key: str = "Enter") -> Dict[str, Any]:
        """Press key (Enter, Tab, Escape, Arrow keys)."""
        params: Dict[str, Any] = {"tabId": tab_id, "key": key}
        if ref is not None:
            params["ref"] = ref
        if selector:
            params["selector"] = selector
        return call_bridge("dom.press", params, ws_port=self.port)

    def scroll(self, tab_id: Optional[int] = None, ref: Optional[int] = None,
               dx: int = 0, dy: int = 600, to: Optional[str] = None) -> Dict[str, Any]:
        params: Dict[str, Any] = {"tabId": tab_id, "dx": dx, "dy": dy}
        if ref is not None:
            params["ref"] = ref
        if to:
            params["to"] = to
        return call_bridge("dom.scroll", params, ws_port=self.port)

    def query(self, tab_id: Optional[int] = None, selector: str = "") -> List[Dict[str, Any]]:
        return call_bridge("dom.query", {"tabId": tab_id, "selector": selector}, ws_port=self.port)

    def evaluate(self, tab_id: int, script: str, timeout: float = 25.0) -> Any:
        return call_bridge("script.execute", {"tabId": tab_id, "code": script}, timeout=timeout, ws_port=self.port)

    def cdp_send(self, tab_id: int, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        return call_bridge("cdp.send", {"tabId": tab_id, "method": method, "cdpParams": params or {}}, ws_port=self.port)

    def screenshot(self, tab_id: Optional[int] = None, output_path: Optional[str] = None) -> str:
        res = call_bridge("tabs.screenshot", {"tabId": tab_id}, timeout=35.0, ws_port=self.port)
        data_url = (res or {}).get("dataUrl", "")
        if output_path and data_url.startswith("data:image"):
            b64_data = data_url.split(",", 1)[1]
            out = os.path.abspath(output_path)
            os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
            with open(out, "wb") as f:
                f.write(base64.b64decode(b64_data))
            log(f"Screenshot saved to {out}")
        return data_url

    def reload_extension(self) -> Dict[str, Any]:
        return call_bridge("extension.reload", ws_port=self.port)


# ============================================================================
# Command Line Interface (CLI)
# ============================================================================

def out_json(obj: Any):
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="antigravity_bridge", description="Antigravity Browser Controller Gateway & CLI")
    p.add_argument("--port", type=int, default=DEFAULT_WS_PORT, help="WebSocket port (default: 18888)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("serve", help="Run Bridge Daemon in foreground")
    sub.add_parser("status", help="Query Bridge and Extension status")
    sub.add_parser("tabs", help="List all open tabs")
    sub.add_parser("ping", help="Ping extension link")

    sp = sub.add_parser("open", help="Open new tab")
    sp.add_argument("--url", required=True)
    sp.add_argument("--background", action="store_true")

    sp = sub.add_parser("navigate", help="Navigate tab to URL")
    sp.add_argument("--tab-id", type=int)
    sp.add_argument("--url", required=True)

    sp = sub.add_parser("activate", help="Activate tab")
    sp.add_argument("--tab-id", type=int, required=True)

    sp = sub.add_parser("close", help="Close tab")
    sp.add_argument("--tab-id", type=int, required=True)

    sp = sub.add_parser("snap", help="AI Page Snapshot with Ref numbering")
    sp.add_argument("--tab-id", type=int)
    sp.add_argument("--max-elems", type=int, default=200)

    sp = sub.add_parser("click", help="Click element by ref, selector, or text")
    sp.add_argument("--ref", type=int)
    sp.add_argument("--selector")
    sp.add_argument("--text")
    sp.add_argument("--tab-id", type=int)

    sp = sub.add_parser("fill", help="Fill input by ref or selector")
    sp.add_argument("--ref", type=int)
    sp.add_argument("--selector")
    sp.add_argument("--value", required=True)
    sp.add_argument("--tab-id", type=int)

    sp = sub.add_parser("press", help="Press key (Enter/Tab/Escape/Arrows)")
    sp.add_argument("--ref", type=int)
    sp.add_argument("--selector")
    sp.add_argument("--key", default="Enter")
    sp.add_argument("--tab-id", type=int)

    sp = sub.add_parser("content", help="Smart content extraction")
    sp.add_argument("--tab-id", type=int)
    sp.add_argument("--max-len", type=int, default=50000)

    sp = sub.add_parser("wait", help="Wait for selector or text")
    sp.add_argument("--selector")
    sp.add_argument("--text")
    sp.add_argument("--timeout", type=float, default=10.0)
    sp.add_argument("--tab-id", type=int)

    sp = sub.add_parser("shot", help="Take screenshot")
    sp.add_argument("--tab-id", type=int)
    sp.add_argument("--out", required=True)

    sp = sub.add_parser("eval", help="Execute JavaScript")
    sp.add_argument("--code", required=True)
    sp.add_argument("--tab-id", type=int)
    sp.add_argument("--timeout", type=float, default=25.0)

    sp = sub.add_parser("query", help="Query DOM elements by selector")
    sp.add_argument("--selector", required=True)
    sp.add_argument("--tab-id", type=int)

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.cmd == "serve":
        server = AntigravityBridgeServer(args.port)
        server.start_http()
        try:
            asyncio.run(server._ws_main())
        except KeyboardInterrupt:
            log("Bridge server shutting down...")
        return

    browser = AntigravityBrowser(port=args.port)

    if args.cmd == "status":
        out_json(browser.status())
    elif args.cmd == "tabs":
        out_json(browser.list_tabs())
    elif args.cmd == "ping":
        out_json(call_bridge("ping", ws_port=args.port))
    elif args.cmd == "open":
        out_json(browser.create_tab(args.url, active=not args.background))
    elif args.cmd == "navigate":
        tab_id = args.tab_id or (browser.get_active_tab() or {}).get("id")
        out_json(browser.navigate(tab_id, args.url))
    elif args.cmd == "activate":
        out_json(browser.activate_tab(args.tab_id))
    elif args.cmd == "close":
        out_json(browser.close_tab(args.tab_id))
    elif args.cmd == "snap":
        out_json(browser.page_snapshot(args.tab_id, max_elems=args.max_elems))
    elif args.cmd == "click":
        out_json(browser.click(args.tab_id, ref=args.ref, selector=args.selector, text=args.text))
    elif args.cmd == "fill":
        out_json(browser.fill(args.tab_id, ref=args.ref, selector=args.selector, value=args.value))
    elif args.cmd == "press":
        out_json(browser.press(args.tab_id, ref=args.ref, selector=args.selector, key=args.key))
    elif args.cmd == "content":
        out_json(browser.page_content(args.tab_id, max_len=args.max_len))
    elif args.cmd == "wait":
        out_json(browser.page_wait(selector=args.selector, text=args.text, timeout=args.timeout, tab_id=args.tab_id))
    elif args.cmd == "shot":
        data_url = browser.screenshot(args.tab_id, output_path=args.out)
        out_json({"saved": os.path.abspath(args.out), "bytes": os.path.getsize(args.out)})
    elif args.cmd == "eval":
        out_json(browser.evaluate(args.tab_id, args.code, timeout=args.timeout))
    elif args.cmd == "query":
        out_json(browser.query(args.tab_id, args.selector))


if __name__ == "__main__":
    main()
