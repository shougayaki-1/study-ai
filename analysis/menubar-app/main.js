const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, Tray } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { LogService, classifyLog, manualLogName } = require('./lib/log-service');
const { PlistManager } = require('./lib/plist-manager');

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 30_000;
const WINDOW_WIDTH = 390;
const WINDOW_HEIGHT = 650;

let tray;
let window;
let plist;
let logs;
let projectRoot;
let manualRun = null;
let scheduledRunning = false;
let scheduledStartedAt = null;
let pollTimer;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on('second-instance', () => showWindow());

app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock.hide();

  plist = new PlistManager();
  projectRoot = await resolveProjectRoot(plist.plistPath);
  logs = new LogService(path.join(projectRoot, 'analysis', 'tmp'));

  createWindow();
  createTray();
  registerIpc();

  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }

  await pollScheduledProcess(false);
  pollTimer = setInterval(() => pollScheduledProcess(true), POLL_INTERVAL_MS);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(pollTimer);
});
app.on('window-all-closed', () => {});

function createWindow() {
  window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#f6f4ef',
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) window.hide();
  });
  window.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'trayTemplate.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Study AI Nightly');
  tray.on('click', () => (window.isVisible() ? window.hide() : showWindow()));
  tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
    { label: '開く', click: showWindow },
    { type: 'separator' },
    { label: '終了', click: () => app.quit() },
  ])));
}

function showWindow() {
  if (!window || !tray) return;
  const trayBounds = tray.getBounds();
  const windowBounds = window.getBounds();
  const display = require('electron').screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const x = Math.round(Math.min(Math.max(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2, display.workArea.x), display.workArea.x + display.workArea.width - windowBounds.width));
  const y = Math.round(trayBounds.y + trayBounds.height + 6);
  window.setPosition(x, y, false);
  window.show();
  window.focus();
}

function registerIpc() {
  ipcMain.handle('app:get-state', async () => ({
    config: await plist.getConfig(),
    status: currentStatus(),
    logs: await logs.list(),
    loginItemEnabled: app.isPackaged ? app.getLoginItemSettings().openAtLogin : false,
    packaged: app.isPackaged,
  }));
  ipcMain.handle('config:set-engine', async (_event, engine) => plist.setEngine(engine));
  ipcMain.handle('config:set-schedule', async (_event, value) => plist.setSchedule(value?.hour, value?.minute));
  ipcMain.handle('config:set-enabled', async (_event, enabled) => plist.setEnabled(Boolean(enabled)));
  ipcMain.handle('logs:list', async () => logs.list());
  ipcMain.handle('logs:read', async (_event, name) => logs.read(name));
  ipcMain.handle('run:start', async () => startManualRun());
}

function currentStatus() {
  if (manualRun) return { running: true, trigger: 'manual', startedAt: manualRun.startedAt };
  if (scheduledRunning) return { running: true, trigger: 'scheduled', startedAt: scheduledStartedAt };
  return { running: false, trigger: null, startedAt: null };
}

async function startManualRun() {
  if (manualRun) throw new Error('手動実行はすでに実行中です');
  const config = await plist.getConfig();
  const scriptPath = path.join(projectRoot, 'analysis', 'run-nightly.sh');
  await fsp.access(scriptPath, fs.constants.X_OK);
  await fsp.mkdir(path.join(projectRoot, 'analysis', 'tmp'), { recursive: true });

  const name = manualLogName();
  const logPath = path.join(projectRoot, 'analysis', 'tmp', name);
  const output = fs.createWriteStream(logPath, { flags: 'wx' });
  const child = spawn(scriptPath, [], {
    cwd: projectRoot,
    env: { ...process.env, STUDY_AI_AGENT_CLI: config.engine },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  manualRun = { child, name, logPath, startedAt: new Date().toISOString(), tail: '' };
  notify('夜間分析を開始しました', `${config.engine} で手動実行しています`);
  broadcast('run:status', currentStatus());

  const onData = (chunk) => {
    output.write(chunk);
    manualRun.tail = `${manualRun.tail}${chunk.toString('utf8')}`.split('\n').slice(-200).join('\n');
    broadcast('run:output', { name, chunk: chunk.toString('utf8'), tail: manualRun.tail });
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (error) => {
    onData(Buffer.from(`\n[menubar-app] 起動エラー: ${error.message}\n`));
  });
  child.on('close', async (code, signal) => {
    output.end();
    const finished = manualRun;
    manualRun = null;
    let content = finished?.tail || '';
    try { content = await fsp.readFile(logPath, 'utf8'); } catch {}
    const status = code === 0 && classifyLog(content) !== 'failure' ? 'success' : 'failure';
    notify(status === 'success' ? '夜間分析が完了しました' : '夜間分析に失敗しました', signal ? `シグナル: ${signal}` : `終了コード: ${code ?? '不明'}`);
    broadcast('run:status', currentStatus());
    broadcast('logs:changed', await logs.list());
  });

  return { started: true, name, status: currentStatus() };
}

async function pollScheduledProcess(shouldNotify) {
  if (manualRun) return;
  let running = false;
  try {
    await execFileAsync('/usr/bin/pgrep', ['-f', 'analysis/run-nightly.sh']);
    running = true;
  } catch (error) {
    if (error.code !== 1) console.error('pgrep failed:', error.message);
  }

  if (running === scheduledRunning) return;
  scheduledRunning = running;
  if (running) {
    scheduledStartedAt = new Date().toISOString();
    if (shouldNotify) notify('夜間分析を開始しました', 'スケジュール実行を検知しました');
  } else {
    scheduledStartedAt = null;
    if (shouldNotify) {
      const latest = await logs.latest('scheduled');
      notify(latest?.status === 'failure' ? '夜間分析に失敗しました' : '夜間分析が完了しました', 'スケジュール実行が終了しました');
      broadcast('logs:changed', await logs.list());
    }
  }
  broadcast('run:status', currentStatus());
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body }).show();
}

function broadcast(channel, payload) {
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

async function resolveProjectRoot(plistPath) {
  const candidates = [process.env.STUDY_AI_PROJECT_ROOT, process.cwd(), path.resolve(__dirname, '../..')].filter(Boolean);
  try {
    const plistText = await fsp.readFile(plistPath, 'utf8');
    const match = plistText.match(/([^<\n]+\/analysis\/run-nightly\.sh)/);
    if (match) candidates.unshift(path.dirname(path.dirname(decodeXml(match[1].trim()))));
  } catch {}

  candidates.push(path.join(os.homedir(), 'Documents', 'GitHub', 'study-ai'));
  for (const candidate of [...new Set(candidates)]) {
    try {
      await fsp.access(path.join(candidate, 'analysis', 'run-nightly.sh'));
      return candidate;
    } catch {}
  }
  throw new Error('study-ai プロジェクトが見つかりません。STUDY_AI_PROJECT_ROOT を設定してください。');
}

function decodeXml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}
