"""
Antigravity Browser Controller - Official Model Context Protocol (MCP) Server (v2.0.0)
Allows any AI Agent (Antigravity, Claude Desktop, Cursor, Cline, OpenCode) to control
the user's everyday Chrome browser with complete login cookies, zero-lockout, and Ref Snapshots.
"""

import os
import sys
from typing import Any, Dict, List, Optional
from mcp.server.mcpserver import MCPServer

# Ensure bridge directory is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from antigravity_bridge import AntigravityBrowser

mcp = MCPServer(
    name="antigravity-browser",
    description="Dedicated Native Browser Controller for Antigravity Agent. Connects directly to everyday Chrome with Ref Snapshot, smart content extraction, and zero-lockout architecture.",
    version="2.0.0"
)

_browser_instance: Optional[AntigravityBrowser] = None


def get_browser() -> AntigravityBrowser:
    global _browser_instance
    if _browser_instance is None:
        _browser_instance = AntigravityBrowser()
    if not _browser_instance.is_extension_connected():
        _browser_instance.wait_for_extension(timeout=3.0)
    return _browser_instance


# ---------------- Tab Management ----------------

@mcp.tool()
def browser_list_tabs() -> List[Dict[str, Any]]:
    """List all open tabs in the user's Chrome browser."""
    return get_browser().list_tabs()


@mcp.tool()
def browser_get_active_tab() -> Optional[Dict[str, Any]]:
    """Get information about the currently active tab."""
    return get_browser().get_active_tab()


@mcp.tool()
def browser_find_tab(url_keyword: str = "", title_keyword: str = "") -> Optional[Dict[str, Any]]:
    """Find an open tab matching a URL substring or title keyword (e.g. 'zhipin.com', 'github.com')."""
    return get_browser().find_tab(url_keyword=url_keyword, title_keyword=title_keyword)


@mcp.tool()
def browser_create_tab(url: str = "about:blank", active: bool = True) -> Dict[str, Any]:
    """Open a new tab in the user's browser with the specified URL."""
    return get_browser().create_tab(url=url, active=active)


@mcp.tool()
def browser_navigate(tab_id: int, url: str) -> Dict[str, Any]:
    """Navigate an existing tab to a new URL."""
    return get_browser().navigate(tab_id=tab_id, url=url)


@mcp.tool()
def browser_close_tab(tab_id: int) -> Dict[str, Any]:
    """Close a specific browser tab by its tab ID."""
    return get_browser().close_tab(tab_id=tab_id)


# ---------------- Page Intelligence & Ref Model ----------------

@mcp.tool()
def browser_page_snapshot(tab_id: Optional[int] = None, max_elems: int = 200) -> Dict[str, Any]:
    """
    AI Page Snapshot: Analyzes visible interactive elements on the page, assigning a unique numbered ref (e.g. [1], [2]...) to each button, link, input, and interactive component.
    Always use this tool first to 'see' the page before performing click or fill actions.
    """
    return get_browser().page_snapshot(tab_id=tab_id, max_elems=max_elems)


@mcp.tool()
def browser_page_content(tab_id: Optional[int] = None, max_len: int = 50000) -> Dict[str, Any]:
    """
    Smart Content Extraction: Intelligently extracts the primary article/content body of the page, discarding ads and irrelevant navigation.
    """
    return get_browser().page_content(tab_id=tab_id, max_len=max_len)


@mcp.tool()
def browser_page_wait(selector: Optional[str] = None, text: Optional[str] = None, timeout: float = 10.0, tab_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Wait until a specific CSS selector or text snippet appears on the page.
    """
    return get_browser().page_wait(selector=selector, text=text, timeout=timeout, tab_id=tab_id)


# ---------------- DOM Actions ----------------

@mcp.tool()
def browser_click_element(ref: Optional[int] = None, selector: Optional[str] = None, text: Optional[str] = None, tab_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Click an element on the page.
    - ref (recommended): Numbered element ref obtained from browser_page_snapshot.
    - selector: Standard CSS selector.
    - text: Visible text. Automatically resolved using deepest leaf-node matching to avoid outer container traps.
    """
    return get_browser().click(tab_id=tab_id, ref=ref, selector=selector, text=text)


@mcp.tool()
def browser_fill_input(value: str, ref: Optional[int] = None, selector: Optional[str] = None, tab_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Fill text into an input or textarea element.
    - ref (recommended): Numbered element ref obtained from browser_page_snapshot.
    - selector: Standard CSS selector.
    Automatically bypasses React/Vue synthetic event restrictions.
    """
    return get_browser().fill(tab_id=tab_id, ref=ref, selector=selector, value=value)


@mcp.tool()
def browser_press_key(key: str = "Enter", ref: Optional[int] = None, selector: Optional[str] = None, tab_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Press a keyboard key ('Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace', etc.) on an element or the currently active document.
    """
    return get_browser().press(tab_id=tab_id, ref=ref, selector=selector, key=key)


@mcp.tool()
def browser_scroll_page(ref: Optional[int] = None, dx: int = 0, dy: int = 600, to: Optional[str] = None, tab_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Scroll the page or scroll a specific ref element into view.
    - to: 'top' or 'bottom'
    - dx/dy: pixel offset (default dy=600)
    """
    return get_browser().scroll(tab_id=tab_id, ref=ref, dx=dx, dy=dy, to=to)


@mcp.tool()
def browser_query_elements(tab_id: int, selector: str) -> List[Dict[str, Any]]:
    """
    Query DOM elements matching a CSS selector. Returns tag, id, text, value, and visibility.
    """
    return get_browser().query(tab_id=tab_id, selector=selector)


# ---------------- CDP, Script & Screenshot ----------------

@mcp.tool()
def browser_evaluate_script(tab_id: int, script: str) -> Any:
    """
    Execute arbitrary JavaScript code in the context of the page, automatically falling back to debugger CDP if blocked by CSP.
    """
    return get_browser().evaluate(tab_id=tab_id, script=script)


@mcp.tool()
def browser_take_screenshot(tab_id: Optional[int] = None, output_path: Optional[str] = None) -> str:
    """
    Capture high-fidelity screenshot via CDP. Works seamlessly even when Chrome is minimized, covered, or the Windows screen is locked (Win+L).
    """
    return get_browser().screenshot(tab_id=tab_id, output_path=output_path)


@mcp.tool()
def browser_send_cdp(tab_id: int, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """
    Direct Chrome DevTools Protocol (CDP) escape hatch. Send any raw CDP method and parameters.
    """
    return get_browser().cdp_send(tab_id=tab_id, method=method, params=params)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
