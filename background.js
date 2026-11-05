/**
 * Antigravity Browser Controller - Background Service Worker (v2.1.0)
 * Native Agentic Browser Automation Bridge.
 *
 * Key Capabilities:
 * - Persistent WebSocket connection to Python Bridge (default: ws://127.0.0.1:18888/ws)
 * - Low-Token Accessibility-inspired Element Ref Snapshot (`page.snapshot`) with smart <select> folding
 * - Deepest leaf-node DOM resolution for text clicks (fixes wrapper div trap)
 * - React/Vue synthetic event bypass for controlled input & native <select> (`dom.select`)
 * - CDP escape hatch (`chrome.debugger`) for CSP bypass, lock-screen screenshot, element clipping, and mobile viewport emulation
 */

const DEFAULT_PORT = 18888;
const AGENT_NAME = 'antigravity-browser-extension';
const VERSION = '2.1.0';

let ws = null;
let reconnectTimer = null;
let isConnecting = false;
const emulatedTabs = new Set();

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
    // Already attached by someone or active viewport emulation — proceed
  }
  try {
    return await fn();
  } finally {
    if (attachedByUs && !emulatedTabs.has(tabId)) {
      try { await chrome.debugger.detach({ tabId }); } catch (e) { /* ignore */ }
    }
  }
}

try {
  chrome.debugger.onDetach.addListener((source) => {
    if (source && source.tabId) emulatedTabs.delete(source.tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    emulatedTabs.delete(tabId);
  });
} catch (e) {}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ---------------- Page Snapshot (Ref Architecture - Low Token v2.1) ---------------- */
function snapshotInPage(maxElems, maxTextLen, includeBodyPreview) {
  if (!window.__agRefs) window.__agRefs = {};
  const refs = window.__agRefs;
  let counter = window.__agRefCounter || 0;

  const interactiveSelector = [
    'a[href]', 'button', 'input', 'textarea', 'select', 'summary',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    '[role="checkbox"]', '[role="switch"]', '[role="textbox"]', '[role="combobox"]',
    '[onclick]', '[contenteditable="true"]', '[contenteditable=""]'
  ].join(',');

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden]')) return false;
    let parent = el.parentElement;
    while (parent) {
      const closedDetails = parent.closest('details:not([open])');
      if (!closedDetails) break;
      const summary = closedDetails.querySelector(':scope > summary');
      if (!summary || (!summary.contains(el) && summary !== el)) {
        return false;
      }
      parent = closedDetails.parentElement;
    }
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
  }

  function describeElement(el) {
    counter += 1;
    refs[counter] = el;
    window.__agRefCounter = counter;

    const tag = el.tagName.toLowerCase();
    let text = '';
    let optionsCount = undefined;
    let optionsPreview = undefined;

    if (tag === 'select') {
      // Avoid dumping all <option> texts (e.g. 90+ years) into text!
      const selectedOpt = (el.selectedOptions && el.selectedOptions[0]) || (el.options && el.options[el.selectedIndex]) || null;
      text = (selectedOpt ? selectedOpt.text : (el.getAttribute('aria-label') || el.title || '')).trim();
      const opts = Array.from(el.options || []);
      optionsCount = opts.length;
      optionsPreview = opts.slice(0, 5).map(o => ({
        value: o.value,
        text: (o.text || '').trim().slice(0, 30),
        selected: !!o.selected
      }));
    } else {
      try {
        text = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.title || el.alt || '').trim();
      } catch (e) {}
    }
    text = text.replace(/\s+/g, ' ').slice(0, 100);

    const item = {
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
    if (optionsCount !== undefined) {
      item.optionsCount = optionsCount;
      item.optionsPreview = optionsPreview;
    }
    return item;
  }

  const elements = Array.from(document.querySelectorAll(interactiveSelector));
  const out = [];
  const optionCountByParent = new WeakMap();
  let skippedRoleOptions = 0;

  for (const el of elements) {
    if (out.length >= maxElems) break;
    if (!isElementVisible(el)) continue;
    // Cap custom [role="option"] items per parent container to prevent 90-item dropdown floods
    if (el.getAttribute('role') === 'option' && el.parentElement) {
      const prevCount = optionCountByParent.get(el.parentElement) || 0;
      if (prevCount >= 12) {
        skippedRoleOptions += 1;
        continue;
      }
      optionCountByParent.set(el.parentElement, prevCount + 1);
    }
    out.push(describeElement(el));
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(h => isElementVisible(h) && h.innerText && h.innerText.trim())
    .slice(0, 30)
    .map(h => ({
      level: parseInt(h.tagName[1], 10),
      text: h.innerText.replace(/\s+/g, ' ').trim().slice(0, 120)
    }));

  let bodyText = '';
  let textTruncated = false;
  const limit = (typeof maxTextLen === 'number' && maxTextLen >= 0) ? maxTextLen : 500;

  if (includeBodyPreview !== false && limit > 0) {
    function isSelectRendered(sel) {
      return isElementVisible(sel);
    }

    function hasRenderedSelect(el) {
      if (!el || !el.querySelector) return false;
      if (el.tagName && el.tagName.toLowerCase() === 'select') return isSelectRendered(el);
      const selects = el.querySelectorAll('select');
      for (const s of selects) {
        if (isSelectRendered(s)) return true;
      }
      return false;
    }

    function extractBodyTextWithoutSelectOptions(root) {
      if (!root) return '';
      if (!hasRenderedSelect(root)) {
        return root.innerText || '';
      }
      const blockTags = new Set([
        'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'table', 'thead', 'tbody', 'tr', 'blockquote', 'pre', 'form', 'fieldset', 'hr',
        'details', 'summary'
      ]);
      const parts = [];
      function walk(node) {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const val = node.nodeValue;
          if (val) parts.push(val);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
        if (tag === 'br') {
          parts.push('\n');
          return;
        }
        if (node.hidden) return;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return;
        if (style.display !== 'contents' && node.getClientRects().length === 0) return;

        // Closed <details>: only its direct <summary> child (or browser default label) is visible in layout
        if (tag === 'details' && !node.open) {
          const summary = node.querySelector(':scope > summary');
          parts.push('\n');
          if (summary) {
            walk(summary);
          } else {
            parts.push(node.innerText || '');
          }
          parts.push('\n');
          return;
        }

        if (tag === 'select') {
          if (!isSelectRendered(node)) return;
          const opts = Array.from(node.options || []);
          if (!opts.length) return;
          const curOpt = (node.selectedOptions && node.selectedOptions[0]) || opts[node.selectedIndex] || null;
          const curTxt = curOpt ? (curOpt.text || '').trim() : (node.value || '');
          if (curTxt) parts.push(` [${curTxt}] `);
          return;
        }

        const isBlock = blockTags.has(tag) || style.display === 'block' || style.display === 'flex' || style.display === 'grid';
        // Fast path: if this subtree contains no rendered <select>, use native innerText directly
        if (!hasRenderedSelect(node)) {
          if (isBlock) parts.push('\n');
          parts.push(node.innerText || '');
          if (isBlock) parts.push('\n');
          return;
        }

        if (isBlock) parts.push('\n');
        for (const child of node.childNodes) {
          walk(child);
        }
        if (isBlock) parts.push('\n');
      }
      walk(root);
      return parts.join('');
    }

    const rawBody = extractBodyTextWithoutSelectOptions(document.body);
    bodyText = rawBody.replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const suffix = '...[truncated]';
    textTruncated = bodyText.length > limit;
    if (textTruncated) {
      bodyText = limit > suffix.length
        ? bodyText.slice(0, limit - suffix.length) + suffix
        : bodyText.slice(0, limit);
    }
  }

  const result = {
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
    note: 'Use click/fill/select_option/press targeting {"ref": N}. Refs valid until page navigates.'
  };
  if (skippedRoleOptions > 0) {
    result.skippedRoleOptions = skippedRoleOptions;
  }
  return result;
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
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
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

function selectInPage(sel, ref, value, text, index) {
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

  if (!el) return { __agError: `Select element not found (ref=${ref}, selector=${sel})` };

  const tag = el.tagName.toLowerCase();
  if (tag !== 'select') {
    return {
      __agError: `Element is <${tag}>, not a native <select> (ref=${ref}, selector=${sel}). For custom UI dropdowns, click the trigger first, then click the option text.`
    };
  }

  const opts = Array.from(el.options || []);
  if (!opts.length) {
    return { __agError: `<select> has 0 options (ref=${ref}, selector=${sel})` };
  }

  let targetOpt = null;
  if (index !== null && index !== undefined) {
    const idx = Number(index);
    if (Number.isInteger(idx) && idx >= 0 && idx < opts.length) {
      targetOpt = opts[idx];
    }
  } else if (value !== null && value !== undefined) {
    const valStr = String(value);
    targetOpt = opts.find(o => o.value === valStr)
      || (valStr !== '' ? opts.find(o => (o.text || '').trim() === valStr.trim()) : null);
  } else if (text !== null && text !== undefined && String(text) !== '') {
    const txtStr = String(text).trim();
    targetOpt = opts.find(o => (o.text || '').trim() === txtStr)
      || opts.find(o => (o.text || '').trim().includes(txtStr))
      || opts.find(o => o.value === txtStr);
  }

  if (!targetOpt) {
    const sample = opts.slice(0, 8).map(o => `${o.value}("${(o.text || '').trim()}")`).join(', ');
    return {
      __agError: `Option not found in <select> (value=${value}, text=${text}, index=${index}). Total options=${opts.length}, sample=[${sample}]`
    };
  }

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  if (el.focus) el.focus();

  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(el, targetOpt.value);
  } else {
    el.value = targetOpt.value;
  }
  targetOpt.selected = true;
  el.selectedIndex = targetOpt.index;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return {
    selected: true,
    value: el.value,
    text: (targetOpt.text || '').trim(),
    selectedIndex: el.selectedIndex,
    optionsCount: opts.length
  };
}

function getElementClipInPage(sel, ref) {
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
  if (!el) return { __agError: `Element for screenshot clip not found (ref=${ref}, selector=${sel})` };

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) {
    return { __agError: `Element has zero dimensions (${r.width}x${r.height})` };
  }
  return {
    x: Math.max(0, Math.floor(r.left + window.scrollX)),
    y: Math.max(0, Math.floor(r.top + window.scrollY)),
    width: Math.ceil(r.width),
    height: Math.ceil(r.height),
    scale: 1
  };
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
        const tab = await chrome.tabs.get(tabId);
        let clip = null;
        if (params.ref || params.selector) {
          if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
          clip = await inject(tabId, getElementClipInPage, [params.selector || null, params.ref || null]);
        }
        const snap = await withDebugger(tabId, async () => {
          await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
          const cdpOpts = {
            format: params.format || 'png',
            quality: params.quality || 80
          };
          if (clip) {
            cdpOpts.clip = clip;
          }
          // For background (non-active) tabs, Chromium compositor may suspend surface frames.
          // Enabling focus emulation and captureBeyondViewport forces immediate Blink paint without waiting 35s.
          if (!tab.active) {
            try {
              await chrome.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', { enabled: true });
            } catch (e) {}
            cdpOpts.captureBeyondViewport = true;
          }
          try {
            return await Promise.race([
              chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', cdpOpts),
              new Promise((_, reject) => setTimeout(() => reject(new Error('surface-timeout')), 4000))
            ]);
          } catch (err) {
            return await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
              ...cdpOpts,
              captureBeyondViewport: true
            });
          }
        });
        return sendReply(id, true, {
          dataUrl: `data:image/png;base64,${snap.data}`,
          tabId,
          clipped: !!clip,
          clip: clip || null
        });
      }

      /* ---- Page Intelligence & Ref Snapshot ---- */
      case 'page.snapshot': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const maxElems = params.maxElems || 200;
        const maxTextLen = (params.maxTextLen !== undefined && params.maxTextLen !== null) ? params.maxTextLen : 500;
        const includeBodyPreview = params.includeBodyPreview !== false;
        const snap = await inject(tabId, snapshotInPage, [maxElems, maxTextLen, includeBodyPreview]);
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
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) {
          throw new Error(`Cannot wait on restricted browser URL: ${tab.url}`);
        }
        const start = Date.now();
        while (Date.now() - start < timeout * 1000) {
          const ok = await inject(tabId, waitCheckInPage, [selector || null, text || null]);
          if (ok) {
            return sendReply(id, true, {
              waited: Number(((Date.now() - start) / 1000).toFixed(2)),
              found: true,
              selector: selector || null,
              text: text || null
            });
          }
          await sleep(400);
        }
        // Gather diagnostic context on timeout so the Agent knows exactly why it failed
        let diag = { url: tab.url, title: tab.title, readyState: 'unknown' };
        try {
          diag = await inject(tabId, () => ({
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            bodySample: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)
          }));
        } catch (e) {}
        const targetDesc = [
          selector ? `selector="${selector}"` : null,
          text ? `text="${text}"` : null
        ].filter(Boolean).join(' and ');
        return sendReply(
          id,
          false,
          null,
          `Timeout after ${timeout}s waiting for ${targetDesc} on page "${diag.title}" (${diag.url}, readyState=${diag.readyState})`
        );
      }
      case 'page.set_viewport': {
        const tabId = await resolveTabId(params.tabId);
        const width = Number(params.width || 0);
        const height = Number(params.height || 812);
        const mobile = params.mobile !== false;
        const scale = Number(params.scale || (mobile ? 2 : 1));
        const reset = !!params.reset || width <= 0;

        if (reset) {
          emulatedTabs.delete(tabId);
          try {
            await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
          } catch (e) {}
          try {
            await chrome.debugger.detach({ tabId });
          } catch (e) {}
          return sendReply(id, true, { tabId, reset: true, mode: 'desktop_default' });
        }

        emulatedTabs.add(tabId);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
        } catch (e) {
          // Already attached
        }
        await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: scale,
          mobile
        });
        return sendReply(id, true, {
          tabId,
          width,
          height,
          mobile,
          scale,
          mode: mobile ? 'mobile_emulation' : 'custom_viewport'
        });
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
      case 'dom.select': {
        const tabId = await resolveTabId(params.tabId);
        const tab = await chrome.tabs.get(tabId);
        if (isRestrictedUrl(tab.url)) throw new Error(`Restricted page: ${tab.url}`);
        const res = await inject(tabId, selectInPage, [
          params.selector || null,
          params.ref || null,
          params.value !== undefined ? params.value : null,
          params.text !== undefined ? params.text : null,
          params.index !== undefined ? params.index : null
        ]);
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
