/**
 * Antigravity Browser Controller - Background Service Worker (v2.0.0)
 * Native Agentic Browser Automation Bridge.
 *
 * Key Capabilities:
 * - Persistent WebSocket connection to Python Bridge (default: ws://127.0.0.1:18888/ws)
 * - Accessibility-inspired Element Ref Snapshot (`page.snapshot`) mapping interactive elements to numbered refs
 * - Deepest leaf-node DOM resolution for text clicks (fixes wrapper div trap)
 * - React/Vue synthetic event bypass for controlled input fields
 * - CDP escape hatch (`chrome.debugger`) for CSP bypass and lock-screen/minimized screenshot capture
 */

const DEFAULT_PORT = 18888;
const AGENT_NAME = 'antigravity-browser-extension';
const VERSION = '2.0.0';

let ws = null;
let reconnectTimer = null;
let isConnecting = false;

/* ---------------- Badge UI ---------------- */
function updateBadge(status) {
  try {
    if (status === 'connected') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981' }); // Emerald Green
    } else if (status === 'connecting') {
      chrome.action.setBadgeText({ text: '...' });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' }); // Amber
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#6B7280' }); // Cool Gray
    }
  } catch (err) {
    console.warn('[Antigravity] Badge error:', err);
  }
}

/* ---------------- Storage / Port ---------------- */
async function getPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['port'], (res) => {
      resolve(res.port || DEFAULT_PORT);
    });
  });
}

/* ---------------- WebSocket Connection ---------------- */
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

      ws.send(JSON.stringify({
        type: 'handshake',
        agent: AGENT_NAME,
        version: VERSION,
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
    console.error('[Antigravity] Connection attempt failed:', err);
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

function sendReply(id, success, data = null, error = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = {
    id,
    success,
    data: data === undefined ? null : data,
    error: error ? (error.message || String(error)) : null,
    timestamp: Date.now()
  };
  ws.send(JSON.stringify(payload));
}

/* ---------------- Helpers ---------------- */
function isRestrictedUrl(url) {
  return !!url && (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('chrome-devtools://')
  );
}

async function resolveTabId(tabId) {
  if (tabId) return tabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) {
    const [fallback] = await chrome.tabs.query({ active: true });
    if (!fallback) throw new Error('No active browser tab found');
    return fallback.id;
  }
  return tab.id;
}

async function inject(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args: args || []
  });
  const r = results?.[0]?.result;
  if (r && r.__agError) throw new Error(r.__agError);
  return r;
}

async function withDebugger(tabId, fn) {
  let attachedByUs = false;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attachedByUs = true;
  } catch (e) {
    // Already attached by someone or previous call — proceed
  }
  try {
    return await fn();
  } finally {
    if (attachedByUs) {
      try { await chrome.debugger.detach({ tabId }); } catch (e) { /* ignore */ }
    }
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ---------------- Page Snapshot (Ref Architecture) ---------------- */
function snapshotInPage(maxElems) {
  if (!window.__agRefs) window.__agRefs = {};
  const refs = window.__agRefs;
  let counter = window.__agRefCounter || 0;

  const interactiveSelector = [
    'a[href]', 'button', 'input', 'textarea', 'select', 'summary',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    '[role="checkbox"]', '[role="switch"]', '[role="textbox"]',
    '[onclick]', '[contenteditable="true"]', '[contenteditable=""]'
  ].join(',');

  function isElementVisible(el) {
    if (!el.isConnected) return false;
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function describeElement(el) {
    counter += 1;
    refs[counter] = el;
    window.__agRefCounter = counter;

    const tag = el.tagName.toLowerCase();
    let text = '';
    try {
      text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || el.alt || '').trim();
    } catch (e) {}
    text = text.replace(/\s+/g, ' ').slice(0, 100);

    return {
      ref: counter,
      tag,
      type: el.type || null,
      role: el.getAttribute('role') || null,
      name: el.name || null,
      id: el.id || null,
      text,
      href: tag === 'a' ? (el.href || null) : null,
      value: (tag === 'input' || tag === 'textarea' || tag === 'select') ? String(el.value || '').slice(0, 80) : null,
      placeholder: el.placeholder || null,
      disabled: !!el.disabled,
      selectorHint: el.id ? `#${el.id}` : (el.name ? `${tag}[name="${el.name}"]` : null)
    };
  }

  const elements = Array.from(document.querySelectorAll(interactiveSelector));
  const out = [];
  for (const el of elements) {
    if (out.length >= maxElems) break;
    if (!isElementVisible(el)) continue;
    out.push(describeElement(el));
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(h => h.innerText && h.innerText.trim())
    .slice(0, 30)
    .map(h => ({
      level: parseInt(h.tagName[1], 10),
      text: h.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)
    }));

  let bodyText = (document.body?.innerText || '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const textTruncated = bodyText.length > 2000;
  if (textTruncated) bodyText = bodyText.slice(0, 2000) + '...[truncated]';

  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    scroll: { x: window.scrollX, y: window.scrollY, height: document.documentElement.scrollHeight },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    headings,
    bodyTextPreview: bodyText,
    textTruncated,
    elements: out,
    elementCount: out.length,
    note: 'Use click/fill/press targeting {"ref": N}. Refs valid until page navigates.'
  };
}

/* ---------------- Smart Content Extractor ---------------- */
function contentInPage(maxLen) {
  const candidates = [
    'article', 'main', '[class*="article-body"]', '[class*="articleBody"]',
    '[class*="post-content"]', '[class*="entry-content"]', '[class*="content-body"]',
    '[role="main"]', '.content', '#content'
  ];
  let best = null, bestLen = 0;
  for (const sel of candidates) {
    for (const el of document.querySelectorAll(sel)) {
      const len = (el.textContent || '').length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    }
  }
  const target = best || document.body;
  let text = (target.textContent || '').replace(/\s+/g, ' ').trim();
  const truncated = text.length > maxLen;
  if (truncated) text = text.slice(0, maxLen) + '...[truncated]';
  return {
    title: document.title,
    url: location.href,
    source: best ? best.tagName.toLowerCase() : 'body',
    content: text,
    truncated,
    fullTextLength: (target.textContent || '').length
  };
}

/* ---------------- In-Page Action Helpers ---------------- */
function clickInPage(sel, txt, ref) {
  const refs = window.__agRefs || {};
  let el = null;

  if (ref) {
    el = refs[ref] || null;
    if (!el || !el.isConnected) {
      return { __agError: `Ref ${ref} is stale (page may have navigated). Re-run page.snapshot.` };
    }
  } else if (sel) {
    el = document.querySelector(sel);
  } else if (txt) {
    // FIX: Deepest Leaf-Node Priority Algorithm (avoids matching outer wrapper container divs)
    const candidates = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"], span, p, div, li, td'));
    const matched = candidates.filter(e => e.innerText && e.innerText.trim().includes(txt));

    let bestLeaf = null;
    for (const e of matched) {
      // Pick the node that does NOT have any matching child elements
      const hasMatchingChild = Array.from(e.children).some(child => child.innerText && child.innerText.trim().includes(txt));
      if (!hasMatchingChild) {
        bestLeaf = e;
        break;
      }
    }
    if (!bestLeaf && matched.length > 0) {
      bestLeaf = matched[matched.length - 1];
    }

    // Escalate to closest clickable ancestor if the leaf node is an inner span/label
    el = bestLeaf ? (bestLeaf.closest('button, a, input[type="button"], input[type="submit"], [role="button"], [role="link"]') || bestLeaf) : null;
  }

  if (!el) return { __agError: `Element not found (ref=${ref}, selector=${sel}, text=${txt})` };

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  if (el.focus) el.focus();
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));

  return { clicked: true, tag: el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 80) };
}

function fillInPage(sel, ref, value) {
  const refs = window.__agRefs || {};
  let el = null;

  if (ref) {
    el = refs[ref] || null;
    if (!el || !el.isConnected) {
      return { __agError: `Ref ${ref} is stale (page may have navigated). Re-run page.snapshot.` };
    }
  } else if (sel) {
    el = document.querySelector(sel);
  }

  if (!el) return { __agError: `Input element not found (ref=${ref}, selector=${sel})` };

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  if (el.focus) el.focus();

  if (el.isContentEditable) {
    el.textContent = '';
    document.execCommand && document.execCommand('insertText', false, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  } else {
    // React/Vue Controlled Input Prototype Setter Bypass
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? null
      : HTMLInputElement.prototype;

    if (proto) {
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(el, value) : (el.value = value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return { filled: true, currentVal: String(el.value || el.textContent || '').slice(0, 100) };
}

function pressInPage(sel, ref, key) {
  const refs = window.__agRefs || {};
  let el = null;
  if (ref) {
    el = refs[ref] || null;
    if (!el || !el.isConnected) return { __agError: `Ref ${ref} is stale. Re-run page.snapshot.` };
  } else if (sel) {
    el = document.querySelector(sel);
  }
  const target = el || document.activeElement || document.body;
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  if (el && el.focus) el.focus();

  const codeMap = {
    'Enter': ['Enter', 13], 'Tab': ['Tab', 9], 'Escape': ['Escape', 27],
    'ArrowDown': ['ArrowDown', 40], 'ArrowUp': ['ArrowUp', 38],
    'ArrowLeft': ['ArrowLeft', 37], 'ArrowRight': ['ArrowRight', 39],
    'Backspace': ['Backspace', 8], 'Delete': ['Delete', 46], ' ': ['Space', 32]
  };
  const [code, keyCode] = codeMap[key] || [key, 0];
  const base = { bubbles: true, cancelable: true, view: window, key, code, keyCode, which: keyCode };

  target.dispatchEvent(new KeyboardEvent('keydown', base));
  target.dispatchEvent(new KeyboardEvent('keyup', base));

  if (key === 'Enter' && el && el.form && (el.tagName === 'INPUT')) {
    try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (e) {}
  }
  return { pressed: key, on: target.tagName ? target.tagName.toLowerCase() : 'unknown' };
}

function scrollInPage(dx, dy, ref, to) {
  let el = null;
  if (ref) {
    el = (window.__agRefs || {})[ref];
    if (!el || !el.isConnected) return { __agError: `Ref ${ref} is stale. Re-run page.snapshot.` };
  }
  if (el) {
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    return { scrolledTo: (el.innerText || '').trim().slice(0, 80) };
  }
  if (to === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
  else if (to === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  else window.scrollBy({ left: dx || 0, top: dy || 0, behavior: 'instant' });
  return { scrollY: window.scrollY };
}

function waitCheckInPage(sel, txt) {
  if (sel && !document.querySelector(sel)) return false;
  if (txt && !((document.body?.innerText || '').includes(txt))) return false;
  return true;
}

/* ---------------- Command Dispatcher ---------------- */
async function handleMessage(msg) {
  const { id, action, params = {} } = msg;
  if (!id || !action) return;

  if (action === 'ping') {
    return sendReply(id, true, { pong: Date.now() });
  }

  if (action === 'status') {
    const port = await getPort();
    return sendReply(id, true, { connected: true, port, agent: AGENT_NAME, version: VERSION });
  }

  try {
    switch (action) {
      /* ---- Tabs ---- */
      case 'tabs.list': {
        const tabs = await chrome.tabs.query({});
        return sendReply(id, true, tabs.map(t => ({
          id: t.id, windowId: t.windowId, title: t.title, url: t.url,
          active: t.active, status: t.status, favIconUrl: t.favIconUrl
        })));
      }
      case 'tabs.get_active': {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return sendReply(id, true, tab || null);
      }
      case 'tabs.create': {
        const t = await chrome.tabs.create({ url: params.url || 'about:blank', active: params.active !== false });
        return sendReply(id, true, { tabId: t.id, url: t.pendingUrl || t.url });
      }
      case 'tabs.update': {
        const t = await chrome.tabs.update(params.tabId, { url: params.url, active: params.active !== false });
        return sendReply(id, true, { tabId: t.id, url: t.pendingUrl || t.url });
      }
      case 'tabs.close': {
        await chrome.tabs.remove(params.tabId);
        return sendReply(id, true, { closedTabId: params.tabId });
      }
      case 'tabs.activate': {
        await chrome.tabs.update(params.tabId, { active: true });
        try { await chrome.windows.update(params.windowId || chrome.windows.WINDOW_ID_CURRENT, { focused: true }); } catch (e) {}
        return sendReply(id, true, { activatedTabId: params.tabId });
      }
      case 'tabs.screenshot': {
        const tabId = await resolveTabId(params.tabId);
        const snap = await withDebugger(tabId, async () => {
          await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
          return chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
            format: params.format || 'png', quality: params.quality || 80
          });
        });
        return sendReply(id, true, { dataUrl: `data:image/png;base64,${snap.data}` });
      }

      /* ---- Page Intelligence & Ref Snapshot ---- */
      case 'page.snapshot': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const snap = await inject(tabId, snapshotInPage, [params.maxElems || 200]);
        return sendReply(id, true, snap);
      }
      case 'page.content': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const c = await inject(tabId, contentInPage, [params.maxLen || 50000]);
        return sendReply(id, true, c);
      }
      case 'page.wait': {
        const tabId = await resolveTabId(params.tabId);
        const { selector, text, timeout = 10 } = params;
        if (!selector && !text) throw new Error('page.wait requires selector or text');
        const start = Date.now();
        while (Date.now() - start < timeout * 1000) {
          const ok = await inject(tabId, waitCheckInPage, [selector || null, text || null]);
          if (ok) return sendReply(id, true, { waited: (Date.now() - start) / 1000, found: true });
          await sleep(400);
        }
        return sendReply(id, false, null, `Timeout ${timeout}s waiting for ${selector || text}`);
      }

      /* ---- DOM Actions (Ref Preferred) ---- */
      case 'dom.click': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const res = await inject(tabId, clickInPage, [params.selector || null, params.text || null, params.ref || null]);
        return sendReply(id, true, res);
      }
      case 'dom.fill': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const res = await inject(tabId, fillInPage, [params.selector || null, params.ref || null, params.value ?? '']);
        return sendReply(id, true, res);
      }
      case 'dom.press': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const res = await inject(tabId, pressInPage, [params.selector || null, params.ref || null, params.key || 'Enter']);
        return sendReply(id, true, res);
      }
      case 'dom.scroll': {
        const tabId = await resolveTabId(params.tabId);
        const res = await inject(tabId, scrollInPage, [params.dx || 0, params.dy || 0, params.ref || null, params.to || null]);
        return sendReply(id, true, res);
      }
      case 'dom.query': {
        const tabId = await resolveTabId(params.tabId);
        const res = await inject(tabId, (sel) => {
          const nodes = Array.from(document.querySelectorAll(sel));
          return nodes.slice(0, 100).map(n => ({
            tag: n.tagName.toLowerCase(), id: n.id, className: typeof n.className === 'string' ? n.className : '',
            text: (n.innerText || '').slice(0, 300), value: n.value, href: n.href,
            visible: n.getClientRects().length > 0
          }));
        }, [params.selector]);
        return sendReply(id, true, res);
      }

      /* ---- Script & CDP Escape Hatch ---- */
      case 'script.execute': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const code = params.code;
        if (!code) throw new Error('code is required');

        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (scriptCode) => {
              try { return { ok: true, result: (0, eval)(scriptCode) }; }
              catch (e) { return { ok: false, error: e.message }; }
            },
            args: [code]
          });
          const r = results?.[0]?.result;
          if (r?.ok) return sendReply(id, true, r.result);
          if (r && !r.ok && !String(r.error).includes('Content Security Policy')) {
            return sendReply(id, false, null, r.error);
          }
        } catch (e) {
          if (!String(e.message || '').includes('Content Security Policy')) {
            return sendReply(id, false, null, e.message || String(e));
          }
        }

        // CSP Fallback via Debugger Runtime.evaluate
        const cdpRes = await withDebugger(tabId, () => chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: code, returnByValue: true, awaitPromise: true
        }));
        if (cdpRes.exceptionDetails) {
          const desc = cdpRes.exceptionDetails.exception?.description || cdpRes.exceptionDetails.text;
          return sendReply(id, false, null, desc);
        }
        return sendReply(id, true, cdpRes.result ? cdpRes.result.value : null);
      }
      case 'cdp.send': {
        const tabId = await resolveTabId(params.tabId);
        const result = await withDebugger(tabId, () =>
          chrome.debugger.sendCommand({ tabId }, params.method, params.cdpParams || {}));
        return sendReply(id, true, result);
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

/* ---------------- Keepalive & Lifecycle ---------------- */
chrome.alarms.create('antigravity-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'antigravity-keepalive') {
    if (!ws || ws.readyState !== WebSocket.OPEN) connectToBridge();
  }
});

chrome.runtime.onStartup.addListener(connectToBridge);
chrome.runtime.onInstalled.addListener(connectToBridge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.port) {
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    connectToBridge();
  }
});

// Popup status query
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'antigravity.popup.status') {
    getPort().then(port => {
      sendResponse({
        connected: !!(ws && ws.readyState === WebSocket.OPEN),
        port, agent: AGENT_NAME, version: VERSION
      });
    });
    return true;
  }
  if (msg && msg.type === 'antigravity.popup.reconnect') {
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    connectToBridge();
    sendResponse({ ok: true });
    return false;
  }
});

connectToBridge();
