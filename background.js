/**
 * Antigravity Browser Controller - Background Service Worker
 * Reverse-engineered & optimized for native agentic browser automation.
 */

const DEFAULT_PORT = 18888;
let ws = null;
let reconnectTimer = null;
let isConnecting = false;

// Set badge appearance
function updateBadge(status) {
  try {
    if (status === 'connected') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Green
    } else if (status === 'connecting') {
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Orange
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#6B7280' }); // Gray
    }
  } catch (err) {
    console.warn('[Antigravity] Failed to set badge:', err);
  }
}

// Get configured port
async function getPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['port'], (res) => {
      resolve(res.port || DEFAULT_PORT);
    });
  });
}

// Initialize WebSocket Connection
async function connectToBridge() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  isConnecting = true;
  updateBadge('connecting');

  const port = await getPort();
  const url = `ws://127.0.0.1:${port}/ws`;
  console.log(`[Antigravity] Connecting to bridge at ${url}...`);

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[Antigravity] Connected to Bridge on port ${port}!`);
      isConnecting = false;
      updateBadge('connected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // Send initial handshake
      ws.send(JSON.stringify({
        type: 'handshake',
        agent: 'antigravity-browser-extension',
        version: '1.0.0',
        timestamp: Date.now()
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (err) {
        console.error('[Antigravity] Failed to parse incoming message:', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[Antigravity] WebSocket error:', err);
    };

    ws.onclose = () => {
      console.log('[Antigravity] Disconnected from Bridge. Scheduling reconnect...');
      ws = null;
      isConnecting = false;
      updateBadge('disconnected');
      scheduleReconnect();
    };
  } catch (err) {
    console.error('[Antigravity] WebSocket connection attempt failed:', err);
    ws = null;
    isConnecting = false;
    updateBadge('disconnected');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToBridge();
  }, 3000);
}

// Send response back to Python Bridge
function sendReply(id, success, data = null, error = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = {
    id,
    success,
    data,
    error: error ? (error.message || String(error)) : null,
    timestamp: Date.now()
  };
  ws.send(JSON.stringify(payload));
}

// Command Dispatcher
async function handleMessage(msg) {
  const { id, action, params = {} } = msg;

  if (action === 'ping') {
    return sendReply(id, true, { pong: Date.now() });
  }

  try {
    switch (action) {
      // Tab Operations
      case 'tabs.list': {
        const tabs = await chrome.tabs.query({});
        const simplified = tabs.map(t => ({
          id: t.id,
          windowId: t.windowId,
          title: t.title,
          url: t.url,
          active: t.active,
          status: t.status,
          favIconUrl: t.favIconUrl
        }));
        return sendReply(id, true, simplified);
      }

      case 'tabs.get_active': {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!activeTab) {
          const [fallback] = await chrome.tabs.query({ active: true });
          return sendReply(id, true, fallback || null);
        }
        return sendReply(id, true, activeTab);
      }

      case 'tabs.create': {
        const newTab = await chrome.tabs.create({
          url: params.url || 'about:blank',
          active: params.active !== false
        });
        return sendReply(id, true, { tabId: newTab.id, url: newTab.url });
      }

      case 'tabs.update': {
        const updated = await chrome.tabs.update(params.tabId, {
          url: params.url,
          active: params.active
        });
        return sendReply(id, true, { tabId: updated.id, url: updated.url });
      }

      case 'tabs.close': {
        await chrome.tabs.remove(params.tabId);
        return sendReply(id, true, { closedTabId: params.tabId });
      }

      case 'tabs.screenshot': {
        let tabId = params.tabId;
        if (!tabId) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          tabId = activeTab?.id;
        }
        if (!tabId) throw new Error('No active tab found for screenshot');

        let attachedByUs = false;
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          attachedByUs = true;
        } catch (e) {
          // If already attached, continue
        }

        try {
          await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
          const snap = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
            format: 'png',
            quality: 80
          });
          const dataUrl = `data:image/png;base64,${snap.data}`;
          return sendReply(id, true, { dataUrl });
        } finally {
          if (attachedByUs) {
            try { await chrome.debugger.detach({ tabId }); } catch {}
          }
        }
      }

      // DOM & In-page Scripting
      case 'script.execute': {
        const { tabId, code } = params;
        if (!tabId) throw new Error('tabId is required');

        const tab = await chrome.tabs.get(tabId);
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('chrome-extension://'))) {
          throw new Error(`Cannot execute script on restricted page: ${tab.url}`);
        }

        let isCspError = false;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (scriptCode) => {
              try {
                return { success: true, result: (0, eval)(scriptCode) };
              } catch (e) {
                return { success: false, error: e.message, stack: e.stack };
              }
            },
            args: [code]
          });

          const execResult = results?.[0]?.result;
          if (execResult && execResult.success) {
            return sendReply(id, true, execResult.result);
          }
          if (execResult?.error?.includes('Content Security Policy')) {
            isCspError = true;
          } else if (execResult && !execResult.success) {
            return sendReply(id, false, null, execResult.error);
          }
        } catch (e) {
          if (e.message?.includes('Content Security Policy')) {
            isCspError = true;
          } else {
            return sendReply(id, false, null, e.message);
          }
        }

        // CSP Fallback: use chrome.debugger Runtime.evaluate which bypasses page CSP completely
        let attachedByUs = false;
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          attachedByUs = true;
        } catch (dbgAttachErr) {
          // If already attached, proceed
        }

        try {
          const cdpRes = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
            expression: code,
            returnByValue: true,
            awaitPromise: true
          });

          if (cdpRes.exceptionDetails) {
            const desc = cdpRes.exceptionDetails.exception?.description || cdpRes.exceptionDetails.text;
            return sendReply(id, false, null, desc);
          }
          return sendReply(id, true, cdpRes.result ? cdpRes.result.value : null);
        } finally {
          if (attachedByUs) {
            try { await chrome.debugger.detach({ tabId }); } catch {}
          }
        }
      }

      case 'dom.click': {
        const { tabId, selector, text } = params;
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, txt) => {
            let el = null;
            if (sel) {
              el = document.querySelector(sel);
            } else if (txt) {
              const all = Array.from(document.querySelectorAll('button, a, div, span, input[type="button"], input[type="submit"]'));
              el = all.find(e => e.innerText && e.innerText.trim().includes(txt));
            }

            if (!el) return { found: false };

            el.scrollIntoView({ behavior: 'instant', block: 'center' });

            const rect = el.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;

            const opts = { bubbles: true, cancelable: true, view: window, clientX, clientY };
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.focus();
            el.dispatchEvent(new PointerEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));

            return {
              found: true,
              tag: el.tagName,
              text: el.innerText ? el.innerText.slice(0, 100) : ''
            };
          },
          args: [selector || null, text || null]
        });

        const res = results?.[0]?.result;
        if (!res || !res.found) {
          return sendReply(id, false, null, `Element not found for selector "${selector}" or text "${text}"`);
        }
        return sendReply(id, true, res);
      }

      case 'dom.fill': {
        const { tabId, selector, value } = params;
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel, val) => {
            const el = document.querySelector(sel);
            if (!el) return { found: false };

            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.focus();

            // Set native value setter to bypass React/Vue synthetic events
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype,
              'value'
            )?.set;

            if (el instanceof HTMLInputElement && nativeInputValueSetter) {
              nativeInputValueSetter.call(el, val);
            } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
              nativeTextAreaValueSetter.call(el, val);
            } else {
              el.value = val;
            }

            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));

            return { found: true, currentVal: el.value };
          },
          args: [selector, value]
        });

        const res = results?.[0]?.result;
        if (!res || !res.found) {
          return sendReply(id, false, null, `Input element not found for selector "${selector}"`);
        }
        return sendReply(id, true, res);
      }

      case 'dom.query': {
        const { tabId, selector } = params;
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: (sel) => {
            const nodes = Array.from(document.querySelectorAll(sel));
            return nodes.map(n => ({
              tag: n.tagName,
              id: n.id,
              className: n.className,
              text: n.innerText ? n.innerText.slice(0, 300) : '',
              value: n.value,
              href: n.href,
              visible: n.offsetParent !== null
            }));
          },
          args: [selector]
        });
        return sendReply(id, true, results?.[0]?.result || []);
      }

      // Chrome DevTools Protocol (CDP) Bridge
      case 'cdp.attach': {
        const { tabId } = params;
        await chrome.debugger.attach({ tabId }, '1.3');
        return sendReply(id, true, { attachedTabId: tabId });
      }

      case 'cdp.send': {
        const { tabId, method, cdpParams = {} } = params;
        const result = await chrome.debugger.sendCommand({ tabId }, method, cdpParams);
        return sendReply(id, true, result);
      }

      case 'cdp.detach': {
        const { tabId } = params;
        await chrome.debugger.detach({ tabId });
        return sendReply(id, true, { detachedTabId: tabId });
      }

      case 'extension.reload': {
        sendReply(id, true, { reloading: true });
        setTimeout(() => chrome.runtime.reload(), 200);
        return;
      }

      default:
        return sendReply(id, false, null, `Unknown action: ${action}`);
    }
  } catch (err) {
    console.error(`[Antigravity] Action ${action} failed:`, err);
    return sendReply(id, false, null, err);
  }
}

// Keep service worker alive using chrome.alarms
chrome.alarms.create('antigravity-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'antigravity-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToBridge();
    }
  }
});

// Auto-start on extension load or browser startup
chrome.runtime.onStartup.addListener(connectToBridge);
chrome.runtime.onInstalled.addListener(connectToBridge);

// Listen to storage changes (e.g. port configuration updated in popup)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.port) {
    if (ws) {
      ws.close();
    }
    connectToBridge();
  }
});

// Immediate initial run
connectToBridge();
