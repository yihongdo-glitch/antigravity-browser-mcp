"""
Antigravity Browser Controller - Official Model Context Protocol (MCP) Server
Allows any AI Agent (Antigravity, Claude Desktop, Cursor, Cline) to directly control
the user's everyday Chrome browser with all existing logins and sessions.
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
    description="Dedicated Native Browser Controller for Antigravity Agent. Connects directly to the user's daily Chrome instance with full login cookies.",
    version="1.0.0"
)

# Global browser bridge instance
_browser_instance: Optional[AntigravityBrowser] = None


def get_browser() -> AntigravityBrowser:
    global _browser_instance
    if _browser_instance is None:
        _browser_instance = AntigravityBrowser()
    if not _browser_instance.is_extension_connected():
        _browser_instance.wait_for_extension(timeout=3.0)
    return _browser_instance


@mcp.tool()
def browser_list_tabs() -> List[Dict[str, Any]]:
    """
    List all open tabs in the user's Chrome browser.
    Returns a list of tab objects containing id, title, url, active, and windowId.
    """
    browser = get_browser()
    return browser.list_tabs()


@mcp.tool()
def browser_get_active_tab() -> Optional[Dict[str, Any]]:
    """
    Get information about the currently active tab in the user's browser.
    """
    browser = get_browser()
    return browser.get_active_tab()


@mcp.tool()
def browser_find_tab(url_keyword: str = "", title_keyword: str = "") -> Optional[Dict[str, Any]]:
    """
    Find an open tab matching a URL substring or title keyword (e.g. 'zhipin.com', 'github', 'zhihu').
    """
    browser = get_browser()
    return browser.find_tab(url_keyword=url_keyword, title_keyword=title_keyword)


@mcp.tool()
def browser_create_tab(url: str = "about:blank", active: bool = True) -> Dict[str, Any]:
    """
    Open a new tab in the user's browser with the specified URL.
    """
    browser = get_browser()
    return browser.create_tab(url=url, active=active)


@mcp.tool()
def browser_navigate(tab_id: int, url: str) -> Dict[str, Any]:
    """
    Navigate an existing tab to a new URL.
    """
    browser = get_browser()
    return browser.navigate(tab_id=tab_id, url=url)


@mcp.tool()
def browser_close_tab(tab_id: int) -> Dict[str, Any]:
    """
    Close a specific browser tab by its tab ID.
    """
    browser = get_browser()
    return browser.close_tab(tab_id=tab_id)


@mcp.tool()
def browser_query_elements(tab_id: int, selector: str) -> List[Dict[str, Any]]:
    """
    Query DOM elements matching a CSS selector from a tab.
    Returns element tag, text content, value, visibility, and attributes.
    """
    browser = get_browser()
    return browser.query(tab_id=tab_id, selector=selector)


@mcp.tool()
def browser_click_element(tab_id: int, selector: str = "", text: str = "") -> Dict[str, Any]:
    """
    Click a button, link, or element on the page either by CSS selector or by matching visible text (e.g. text='立即沟通').
    Dispatches full pointerdown, mousedown, mouseup, click event chain.
    """
    browser = get_browser()
    return browser.click(tab_id=tab_id, selector=selector, text=text)


@mcp.tool()
def browser_fill_input(tab_id: int, selector: str, value: str) -> Dict[str, Any]:
    """
    Fill text into an input or textarea element on the page.
    Automatically triggers React/Vue synthetic events and input/change listeners.
    """
    browser = get_browser()
    return browser.fill(tab_id=tab_id, selector=selector, value=value)


@mcp.tool()
def browser_evaluate_script(tab_id: int, script: str) -> Any:
    """
    Execute arbitrary JavaScript code in the context of the page, automatically bypassing CSP restrictions.
    """
    browser = get_browser()
    return browser.evaluate(tab_id=tab_id, script=script)


@mcp.tool()
def browser_take_screenshot(tab_id: Optional[int] = None, output_path: Optional[str] = None) -> str:
    """
    Capture a high-fidelity screenshot of the tab. Works even when Chrome is minimized, covered, or screen is locked.
    If output_path is provided, saves the PNG file to disk. Returns data URL or path.
    """
    browser = get_browser()
    return browser.screenshot(tab_id=tab_id, output_path=output_path)


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
