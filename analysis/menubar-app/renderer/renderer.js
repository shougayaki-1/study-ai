const elements = {
  statusBadge: document.querySelector('#statusBadge'), elapsed: document.querySelector('#elapsed'),
  engine: document.querySelector('#engine'), runButton: document.querySelector('#runButton'),
  liveOutput: document.querySelector('#liveOutput'), scheduleEnabled: document.querySelector('#scheduleEnabled'),
  scheduleTime: document.querySelector('#scheduleTime'), history: document.querySelector('#history'),
  refreshLogs: document.querySelector('#refreshLogs'), message: document.querySelector('#message'),
  logDialog: document.querySelector('#logDialog'), logTitle: document.querySelector('#logTitle'),
  logContent: document.querySelector('#logContent'), closeDialog: document.querySelector('#closeDialog'),
};

let status = { running: false, trigger: null, startedAt: null };
let elapsedTimer;
let busy = false;

initialize().catch(showError);

async function initialize() {
  const state = await window.nightly.getState();
  elements.engine.value = state.config.engine;
  elements.scheduleEnabled.checked = state.config.enabled;
  elements.scheduleTime.value = `${pad(state.config.hour)}:${pad(state.config.minute)}`;
  updateStatus(state.status);
  renderLogs(state.logs);

  window.nightly.onRunStatus(updateStatus);
  window.nightly.onRunOutput(({ tail }) => {
    elements.liveOutput.hidden = false;
    elements.liveOutput.textContent = tail;
    elements.liveOutput.scrollTop = elements.liveOutput.scrollHeight;
  });
  window.nightly.onLogsChanged(renderLogs);
}

elements.engine.addEventListener('change', () => withBusy(async () => {
  await window.nightly.setEngine(elements.engine.value);
  showMessage('エンジンを更新しました');
}));

elements.runButton.addEventListener('click', () => withBusy(async () => {
  elements.liveOutput.textContent = '';
  elements.liveOutput.hidden = false;
  const result = await window.nightly.startRun();
  updateStatus(result.status);
}));

elements.scheduleTime.addEventListener('change', () => withBusy(async () => {
  const [hour, minute] = elements.scheduleTime.value.split(':').map(Number);
  await window.nightly.setSchedule(hour, minute);
  showMessage('実行時刻を更新しました');
}));

elements.scheduleEnabled.addEventListener('change', () => withBusy(async () => {
  const config = await window.nightly.setEnabled(elements.scheduleEnabled.checked);
  elements.scheduleEnabled.checked = config.enabled;
  showMessage(config.enabled ? '自動実行を有効にしました' : '自動実行を停止しました');
}));

elements.refreshLogs.addEventListener('click', () => withBusy(async () => renderLogs(await window.nightly.listLogs())));
elements.closeDialog.addEventListener('click', () => elements.logDialog.close());

function updateStatus(nextStatus) {
  status = nextStatus;
  elements.statusBadge.className = `badge ${status.running ? 'running' : 'idle'}`;
  elements.statusBadge.querySelector('b').textContent = status.running
    ? `実行中（${status.trigger === 'manual' ? '手動' : '定期'}）` : '待機中';
  elements.runButton.disabled = status.running || busy;
  clearInterval(elapsedTimer);
  updateElapsed();
  if (status.running) elapsedTimer = setInterval(updateElapsed, 1_000);
}

function updateElapsed() {
  if (!status.running || !status.startedAt) { elements.elapsed.textContent = ''; return; }
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(status.startedAt).getTime()) / 1_000));
  elements.elapsed.textContent = `経過 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderLogs(logs) {
  elements.history.replaceChildren();
  if (!logs.length) {
    const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'ログはまだありません';
    elements.history.append(empty); return;
  }
  for (const log of logs) {
    const button = document.createElement('button'); button.className = 'history-item';
    const title = document.createElement('strong'); title.textContent = formatDate(log.timestamp);
    const meta = document.createElement('span'); meta.className = 'history-meta'; meta.textContent = `${log.trigger === 'manual' ? '手動' : '定期'} · ${formatBytes(log.size)}`;
    const result = document.createElement('span'); result.className = `result ${log.status}`; result.textContent = statusText(log.status);
    button.append(title, meta, result);
    button.addEventListener('click', () => openLog(log.name));
    elements.history.append(button);
  }
}

async function openLog(name) {
  try {
    const log = await window.nightly.readLog(name);
    elements.logTitle.textContent = name;
    elements.logContent.textContent = log.content || '（空のログ）';
    elements.logDialog.showModal();
  } catch (error) { showError(error); }
}

async function withBusy(action) {
  if (busy) return;
  busy = true; elements.runButton.disabled = true; elements.message.textContent = '';
  try { await action(); } catch (error) { showError(error); }
  finally { busy = false; elements.runButton.disabled = status.running; }
}

function showError(error) { elements.message.textContent = error?.message || String(error); }
function showMessage(message) { elements.message.textContent = message; setTimeout(() => { if (elements.message.textContent === message) elements.message.textContent = ''; }, 2_500); }
function pad(value) { return String(value).padStart(2, '0'); }
function formatDate(value) { return new Intl.DateTimeFormat('ja-JP', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)); }
function formatBytes(bytes) { return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`; }
function statusText(value) { return value === 'success' ? '成功' : value === 'failure' ? '失敗' : '不明'; }
