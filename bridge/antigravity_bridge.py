"""
Antigravity Browser Bridge - Native Extension RPC Server & Python SDK
Allows Antigravity Agents to directly control Chrome without CDP port flags, ghost browsers, or window-focus dependencies.
"""

import asyncio
import json
import logging
import os
import sys
import threading
import time
import uuid
from typing import Any, Dict, List, Optional
import websockets

logging.basicConfig(level=logging.INFO, format="[%(asctime)s][AntigravityBridge] %(message)s")
logger = logging.getLogger("AntigravityBridge")

DEFAULT_PORT = 18888


class AntigravityBridgeServer:
    def __init__(self, host: str = "127.0.0.1", port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.clients = set()
        self.pending_requests: Dict[str, asyncio.Future] = {}
        self.server = None
        self.loop = None
        self.is_running = False

    async def _handler(self, websocket):
        logger.info(f"Chrome Extension connected from {websocket.remote_address}!")
        self.clients.add(websocket)
        try:
            async for raw_msg in websocket:
                try:
                    msg = json.loads(raw_msg)
                    msg_type = msg.get("type")
                    if msg_type == "handshake":
                        logger.info(f"Handshake received: {msg.get('agent')} v{msg.get('version')}")
                        continue

                    msg_id = msg.get("id")
                    if msg_id and msg_id in self.pending_requests:
                        future = self.pending_requests.pop(msg_id)
                        if not future.done():
                            if msg.get("success"):
                                future.set_result(msg.get("data"))
                            else:
                                future.set_exception(RuntimeError(msg.get("error") or "Unknown extension error"))
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {raw_msg[:100]}")
        except websockets.exceptions.ConnectionClosed:
            logger.info("Chrome Extension disconnected.")
        finally:
            self.clients.discard(websocket)

    async def call_action(self, action: str, params: Optional[Dict[str, Any]] = None, timeout: float = 15.0) -> Any:
        if not self.clients:
            raise ConnectionError("No Chrome Extension connected. Please ensure Chrome is open and Antigravity Extension is loaded.")

        # Pick active client
        ws = next(iter(self.clients))
        req_id = str(uuid.uuid4())
        payload = {
            "id": req_id,
            "action": action,
            "params": params or {}
        }

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self.pending_requests[req_id] = future

        await ws.send(json.dumps(payload))
        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self.pending_requests.pop(req_id, None)
            raise TimeoutError(f"Extension action '{action}' timed out after {timeout}s")

    async def start(self):
        self.loop = asyncio.get_running_loop()
        self.server = await websockets.serve(self._handler, self.host, self.port)
        self.is_running = True
        logger.info(f"Antigravity Bridge Server listening on ws://{self.host}:{self.port}/ws")

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.is_running = False
            logger.info("Bridge Server stopped.")


class AntigravityBrowser:
    """
    Synchronous Python Client SDK for Antigravity Browser Controller Extension.
    Can be used directly in any Python script, task, or agent skill.
    """
    _instance = None
    _lock = threading.Lock()

    def __init__(self, port: int = DEFAULT_PORT):
        self.port = port
        self.server = AntigravityBridgeServer(port=port)
        self._loop = None
        self._thread = None
        self._ensure_server_running()

    def _ensure_server_running(self):
        # Check if already running in this process or port occupied
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        res = sock.connect_ex(("127.0.0.1", self.port))
        sock.close()

        if res == 0:
            # Port is already bound by another process or existing bridge
            logger.info(f"Bridge already listening on port {self.port}.")
            return

        # Start server in background daemon thread
        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop.run_until_complete(self.server.start())
            self._loop.run_forever()

        self._thread = threading.Thread(target=run_loop, daemon=True, name="AntigravityBridgeServerThread")
        self._thread.start()
        time.sleep(0.5)

    def _run_coroutine(self, coro):
        if self._loop and self._loop.is_running():
            future = asyncio.run_coroutine_threadsafe(coro, self._loop)
            return future.result()
        else:
            return asyncio.run(coro)

    def is_extension_connected(self) -> bool:
        return len(self.server.clients) > 0

    def wait_for_extension(self, timeout: float = 10.0) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            if self.is_extension_connected():
                return True
            time.sleep(0.3)
        return False

    def list_tabs(self) -> List[Dict[str, Any]]:
        return self._run_coroutine(self.server.call_action("tabs.list"))

    def get_active_tab(self) -> Optional[Dict[str, Any]]:
        return self._run_coroutine(self.server.call_action("tabs.get_active"))

    def find_tab(self, url_keyword: str = "", title_keyword: str = "") -> Optional[Dict[str, Any]]:
        tabs = self.list_tabs()
        for t in tabs:
            url = t.get("url", "")
            title = t.get("title", "")
            if url_keyword and url_keyword.lower() in url.lower():
                return t
            if title_keyword and title_keyword.lower() in title.lower():
                return t
        return None

    def create_tab(self, url: str = "about:blank", active: bool = True) -> Dict[str, Any]:
        return self._run_coroutine(self.server.call_action("tabs.create", {"url": url, "active": active}))

    def navigate(self, tab_id: int, url: str) -> Dict[str, Any]:
        return self._run_coroutine(self.server.call_action("tabs.update", {"tabId": tab_id, "url": url}))

    def close_tab(self, tab_id: int) -> Dict[str, Any]:
        return self._run_coroutine(self.server.call_action("tabs.close", {"tabId": tab_id}))

    def evaluate(self, tab_id: int, script: str) -> Any:
        return self._run_coroutine(self.server.call_action("script.execute", {"tabId": tab_id, "code": script}))

    def click(self, tab_id: int, selector: str = "", text: str = "") -> Dict[str, Any]:
        return self._run_coroutine(self.server.call_action("dom.click", {"tabId": tab_id, "selector": selector, "text": text}))

    def fill(self, tab_id: int, selector: str, value: str) -> Dict[str, Any]:
        return self._run_coroutine(self.server.call_action("dom.fill", {"tabId": tab_id, "selector": selector, "value": value}))

    def query(self, tab_id: int, selector: str) -> List[Dict[str, Any]]:
        return self._run_coroutine(self.server.call_action("dom.query", {"tabId": tab_id, "selector": selector}))

    def screenshot(self, tab_id: Optional[int] = None, output_path: Optional[str] = None) -> str:
        """Captures screenshot and returns base64 string or writes to output_path."""
        import base64
        res = self._run_coroutine(self.server.call_action("tabs.screenshot", {"tabId": tab_id}))
        data_url = res.get("dataUrl", "")
        if output_path and data_url.startswith("data:image/png;base64,"):
            b64_data = data_url.split(",", 1)[1]
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(base64.b64decode(b64_data))
            logger.info(f"Screenshot saved to {output_path}")
        return data_url

    def reload_extension(self) -> Dict[str, Any]:
        """Requests Chrome to reload the extension background worker."""
        return self._run_coroutine(self.server.call_action("extension.reload"))


if __name__ == "__main__":
    print("=" * 60)
    print(" Antigravity Browser Controller Bridge Server")
    print("=" * 60)
    server = AntigravityBridgeServer()
    asyncio.run(server.start())
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        print("\nStopping Antigravity Bridge Server...")
