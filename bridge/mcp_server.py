"""
Antigravity Browser Controller - Official Model Context Protocol (MCP) Server (v2.1.0)
Allows any AI Agent (Antigravity, Claude Code, Claude Desktop, Cursor, Cline, OpenCode) to control
the user's everyday Chrome browser with complete login cookies, zero-lockout, Low-Token Ref Snapshots,
safe temp-dir screenshots, native <select> option picking, and mobile viewport simulation.
"""

import os
import sys
from typing import Any, Callable, Dict, List, Optional
from mcp.server.mcpserver import MCPServer

# Ensure bridge directory is on sys.path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from antigravity_bridge import AntigravityBrowser, DEFAULT_WS_PORT

mcp = MCPServer(
    name="antigravity-browser",
    description=(
        "Dedicated Native Browser Controller for AI Agents (v2.1.0). "
        "Connects directly to everyday Chrome with Low-Token Ref Snapshot, zero-base64 safe screenshots, "
        "native <select> option tool, mobile viewport simulation, and transparent error diagnostics."
    ),
    version="2.1.0",
)

_browser_instance: Optional[AntigravityBrowser] = None


def get_browser() -> AntigravityBrowser:
    global _browser_instance
    port = int(os.environ.get("ANTIGRAVITY_BRIDGE_PORT", DEFAULT_WS_PORT))
    if _browser_instance is None or _browser_instance.port != port:
        _browser_instance = AntigravityBrowser(port=port)
    if not _browser_instance.is_extension_connected():
        _browser_instance.wait_for_extension(timeout=3.0)
    return _browser_instance


def _safe_run(action_name: str, fn: Callable[[], Any]) -> Any:
    """
    Wraps bridge calls so that any timeout, missing selector, or connection error
    is returned as a structured JSON dictionary with explicit reason instead of
    being masked by MCP client UI as a generic 'Error executing tool'.
    """
    try:
        return fn()
    except Exception as e:
        return {
            "ok": False,
            "action": action_name,
            "error": str(e),
        }


# ---------------- Tab Management ----------------

@mcp.tool()
def browser_list_tabs() -> Any:
    """List all open tabs in the user's Chrome browser."""
    return _safe_run("browser_list_tabs", lambda: get_browser().list_tabs())


@mcp.tool()
def browser_get_active_tab() -> Any:
    """Get information about the currently active tab."""
    return _safe_run("browser_get_active_tab", lambda: get_browser().get_active_tab())


@mcp.tool()
def browser_find_tab(url_keyword: str = "", title_keyword: str = "") -> Any:
    """Find an open tab matching a URL substring or title keyword (e.g. 'zhipin.com', 'github.com')."""
    return _safe_run(
        "browser_find_tab",
        lambda: get_browser().find_tab(url_keyword=url_keyword, title_keyword=title_keyword),
    )


@mcp.tool()
def browser_create_tab(url: str = "about:blank", active: bool = True) -> Dict[str, Any]:
    """Open a new tab in the user's browser with the specified URL."""
    return _safe_run("browser_create_tab", lambda: get_browser().create_tab(url=url, active=active))


@mcp.tool()
def browser_navigate(tab_id: int, url: str) -> Dict[str, Any]:
    """Navigate an existing tab to a new URL."""
    return _safe_run("browser_navigate", lambda: get_browser().navigate(tab_id=tab_id, url=url))


@mcp.tool()
def browser_close_tab(tab_id: int) -> Dict[str, Any]:
    """Close a specific browser tab by its tab ID."""
    return _safe_run("browser_close_tab", lambda: get_browser().close_tab(tab_id=tab_id))


# ---------------- Page Intelligence & Ref Model ----------------

@mcp.tool()
def browser_page_snapshot(
    tab_id: Optional[int] = None,
    max_elems: int = 200,
    max_text_len: int = 500,
    include_body_preview: bool = True,
) -> Dict[str, Any]:
    """
    AI Page Snapshot (Low-Token v2.1): Analyzes visible interactive elements on the page,
    assigning a unique numbered ref (e.g. [1], [2]...) to each button, link, input, and <select>.
    - Automatically folds <select> dropdowns to only show current value + 5 sample options (no 90-year option flood).
    - Set include_body_preview=False or max_text_len=0 when you only need element refs to save tokens.
    """
    return _safe_run(
        "browser_page_snapshot",
        lambda: get_browser().page_snapshot(
            tab_id=tab_id,
            max_elems=max_elems,
            max_text_len=max_text_len,
            include_body_preview=include_body_preview,
        ),
    )


@mcp.tool()
def browser_page_content(tab_id: Optional[int] = None, max_len: int = 50000) -> Dict[str, Any]:
    """
    Smart Content Extraction: Intelligently extracts the primary article/content body of the page,
    discarding ads and irrelevant navigation.
    """
    return _safe_run("browser_page_content", lambda: get_browser().page_content(tab_id=tab_id, max_len=max_len))


@mcp.tool()
def browser_page_wait(
    selector: Optional[str] = None,
    text: Optional[str] = None,
    timeout: float = 10.0,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Wait until a specific CSS selector or text snippet appears on the page.
    If it times out, returns explicit diagnostic details (timeout duration, target, current page URL/title, and readyState).
    """
    return _safe_run(
        "browser_page_wait",
        lambda: get_browser().page_wait(selector=selector, text=text, timeout=timeout, tab_id=tab_id),
    )


@mcp.tool()
def browser_set_viewport(
    width: int = 375,
    height: int = 812,
    mobile: bool = True,
    scale: float = 2.0,
    reset: bool = False,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Simulate mobile screen dimensions (default: 375x812 iPhone viewport) or custom viewport size on a tab.
    - Pass reset=True (or width=0) to restore the tab back to normal desktop layout.
    """
    return _safe_run(
        "browser_set_viewport",
        lambda: get_browser().set_viewport(
            tab_id=tab_id, width=width, height=height, mobile=mobile, scale=scale, reset=reset
        ),
    )


# ---------------- DOM Actions ----------------

@mcp.tool()
def browser_click_element(
    ref: Optional[int] = None,
    selector: Optional[str] = None,
    text: Optional[str] = None,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Click an element on the page.
    - ref (recommended): Numbered element ref obtained from browser_page_snapshot.
    - selector: Standard CSS selector.
    - text: Visible text. Automatically resolved using deepest leaf-node matching to avoid outer container traps.
    """
    return _safe_run(
        "browser_click_element",
        lambda: get_browser().click(tab_id=tab_id, ref=ref, selector=selector, text=text),
    )


@mcp.tool()
def browser_fill_input(
    value: str,
    ref: Optional[int] = None,
    selector: Optional[str] = None,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fill text into an input or textarea element.
    - ref (recommended): Numbered element ref obtained from browser_page_snapshot.
    - selector: Standard CSS selector.
    Automatically bypasses React/Vue synthetic event restrictions.
    """
    return _safe_run(
        "browser_fill_input",
        lambda: get_browser().fill(tab_id=tab_id, ref=ref, selector=selector, value=value),
    )


@mcp.tool()
def browser_select_option(
    value: Optional[str] = None,
    text: Optional[str] = None,
    index: Optional[int] = None,
    ref: Optional[int] = None,
    selector: Optional[str] = None,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Select an <option> inside a native <select> dropdown (e.g. year/month/day/hour pickers) without writing custom JS.
    - Target the <select> using ref (preferred, from browser_page_snapshot) or CSS selector.
    - Specify the desired option by value (option[value]), visible text (e.g. '1990年'), or 0-based index.
    - Automatically dispatches bubbling 'input' and 'change' events for React/Vue forms.
    """
    return _safe_run(
        "browser_select_option",
        lambda: get_browser().select_option(
            tab_id=tab_id, ref=ref, selector=selector, value=value, text=text, index=index
        ),
    )


@mcp.tool()
def browser_press_key(
    key: str = "Enter",
    ref: Optional[int] = None,
    selector: Optional[str] = None,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Press a keyboard key ('Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace', etc.) on an element or the currently active document.
    """
    return _safe_run(
        "browser_press_key",
        lambda: get_browser().press(tab_id=tab_id, ref=ref, selector=selector, key=key),
    )


@mcp.tool()
def browser_scroll_page(
    ref: Optional[int] = None,
    dx: int = 0,
    dy: int = 600,
    to: Optional[str] = None,
    tab_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Scroll the page or scroll a specific ref element into view.
    - to: 'top' or 'bottom'
    - dx/dy: pixel offset (default dy=600)
    """
    return _safe_run(
        "browser_scroll_page",
        lambda: get_browser().scroll(tab_id=tab_id, ref=ref, dx=dx, dy=dy, to=to),
    )


@mcp.tool()
def browser_query_elements(tab_id: int, selector: str) -> Any:
    """
    Query DOM elements matching a CSS selector. Returns tag, id, text, value, and visibility.
    """
    return _safe_run(
        "browser_query_elements",
        lambda: get_browser().query(tab_id=tab_id, selector=selector),
    )


# ---------------- CDP, Script & Screenshot ----------------

@mcp.tool()
def browser_evaluate_script(tab_id: int, script: str) -> Any:
    """
    Execute arbitrary JavaScript code in the context of the page, automatically falling back to debugger CDP if blocked by CSP.
    """
    return _safe_run(
        "browser_evaluate_script",
        lambda: get_browser().evaluate(tab_id=tab_id, script=script),
    )


@mcp.tool()
def browser_take_screenshot(
    tab_id: Optional[int] = None,
    output_path: Optional[str] = None,
    ref: Optional[int] = None,
    selector: Optional[str] = None,
    return_base64: bool = False,
) -> Dict[str, Any]:
    """
    Capture high-fidelity screenshot via CDP (works even when Chrome is minimized or screen is locked).
    - Zero-Token-Bloat Default: Saves PNG to disk and returns ONLY {'savedPath', 'bytes', 'tabId', 'clipped'} (~30 tokens instead of 110k-char base64).
    - Git Repo Protection: Defaults to %TEMP%/antigravity_screenshots and automatically redirects paths inside Git repositories to temp dir.
    - Optional Element Clipping: Pass ref or selector to capture only a specific DOM element/card.
    """
    return _safe_run(
        "browser_take_screenshot",
        lambda: get_browser().screenshot(
            tab_id=tab_id,
            output_path=output_path,
            ref=ref,
            selector=selector,
            return_base64=return_base64,
        ),
    )


@mcp.tool()
def browser_send_cdp(tab_id: int, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """
    Direct Chrome DevTools Protocol (CDP) escape hatch. Send any raw CDP method and parameters.
    """
    return _safe_run(
        "browser_send_cdp",
        lambda: get_browser().cdp_send(tab_id=tab_id, method=method, params=params),
    )


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
