const portInput = document.getElementById('port-input');
const btnSavePort = document.getElementById('btn-save-port');
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const tabTitle = document.getElementById('tab-title');
const tabUrl = document.getElementById('tab-url');
const btnPing = document.getElementById('btn-ping');
const btnReload = document.getElementById('btn-reload');
const logBox = document.getElementById('log-box');

function log(msg) {
  logBox.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
}

// Update UI Connection Status
async function checkConnectionStatus() {
  const badge = await chrome.action.getBadgeText({});
  if (badge === 'ON') {
    statusPill.className = 'status-pill connected';
    statusText.textContent = '已连接';
  } else if (badge === '...') {
    statusPill.className = 'status-pill disconnected';
    statusText.textContent = '连接中...';
  } else {
    statusPill.className = 'status-pill disconnected';
    statusText.textContent = '未连接';
  }
}

// Load Active Tab Info
async function loadActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      tabTitle.textContent = tab.title || '(无标题)';
      tabUrl.textContent = tab.url || '(无网址)';
    } else {
      tabTitle.textContent = '未找到活动标签页';
      tabUrl.textContent = '-';
    }
  } catch (err) {
    tabTitle.textContent = '获取失败';
    tabUrl.textContent = err.message;
  }
}

// Load Config
chrome.storage.local.get(['port'], (res) => {
  if (res.port) {
    portInput.value = res.port;
  }
});

// Save Port
btnSavePort.addEventListener('click', () => {
  const p = parseInt(portInput.value, 10);
  if (!p || p < 1024 || p > 65535) {
    alert('请输入有效的端口号 (1024 - 65535)');
    return;
  }
  chrome.storage.local.set({ port: p }, () => {
    log(`端口已保存为 ${p}，正在尝试重连...`);
    setTimeout(checkConnectionStatus, 1000);
  });
});

// Ping Test
btnPing.addEventListener('click', async () => {
  log('正在发送 Ping...');
  const port = parseInt(portInput.value, 10) || 18888;
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 'popup-ping', action: 'ping' }));
    };
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      log(`收到 Pong! 延迟: ${Date.now() - (data.pong || Date.now())}ms`);
      ws.close();
      checkConnectionStatus();
    };
    ws.onerror = () => {
      log('Ping 失败：未检测到 Antigravity Python 服务');
      checkConnectionStatus();
    };
  } catch (err) {
    log(`错误: ${err.message}`);
  }
});

// Reload / Reconnect
btnReload.addEventListener('click', () => {
  log('触发后台服务重新连接...');
  chrome.runtime.reload();
  setTimeout(checkConnectionStatus, 1500);
});

// Init
checkConnectionStatus();
loadActiveTab();
setInterval(checkConnectionStatus, 2000);
