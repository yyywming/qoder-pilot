const { app, BrowserWindow, Tray, Menu, shell, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');

const BASE_PORT = 8790;
let child = null;
let win = null;
let tray = null;
let serverPort = BASE_PORT;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

app.setAppUserModelId('com.yyywming.qoderpilot');

function resPath(name) {
  return app.isPackaged ? path.join(process.resourcesPath, name) : path.join(__dirname, 'resources', name);
}
function hubDir() { return resPath('qoder-hub'); }
function pythonExe() { return path.join(resPath('python'), 'python.exe'); }
function dataDir() { return app.getPath('userData'); }
function accountsDir() { return path.join(dataDir(), 'accounts'); }
function logsDir() { return path.join(dataDir(), 'logs'); }

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function httpGet(url, timeout = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

async function isOurServer(port) {
  const r = await httpGet(`http://127.0.0.1:${port}/`, 1200);
  return r.status === 200 && /Qoder/i.test(r.body);
}

async function pickPort() {
  for (let p = BASE_PORT; p < BASE_PORT + 10; p++) {
    if (await portFree(p)) return p;
    if (await isOurServer(p)) return p;
  }
  return BASE_PORT;
}

async function waitServer(port, ms = 60000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const r = await httpGet(`http://127.0.0.1:${port}/api/health`, 1000);
    if (r.status === 200) return true;
    const root = await httpGet(`http://127.0.0.1:${port}/`, 1000);
    if (root.status === 200) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r2) => setTimeout(r2, 500));
  }
  return false;
}

function logTail(file, n = 15) {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
    return lines.slice(-n).join('\n');
  } catch { return ''; }
}

async function startServer() {
  fs.mkdirSync(accountsDir(), { recursive: true });
  fs.mkdirSync(logsDir(), { recursive: true });
  serverPort = await pickPort();
  if (await isOurServer(serverPort)) return true;

  const out = fs.openSync(path.join(logsDir(), 'gateway.log'), 'a');
  const err = fs.openSync(path.join(logsDir(), 'gateway.err.log'), 'a');
  const script = path.join(hubDir(), 'qoder_proxy.py');
  child = spawn(pythonExe(), [script, '--port', String(serverPort), '--accounts-dir', accountsDir()], {
    cwd: hubDir(),
    windowsHide: true,
    env: { ...process.env, QD_LOG_DIR: logsDir(), PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', out, err],
  });
  child.on('exit', (code) => {
    if (!quitting && code !== 0) {
      const tail = logTail(path.join(logsDir(), 'gateway.err.log'));
      dialog.showErrorBox('Qoder Pilot 服务退出', `退出码 ${code}\n\n${tail}`);
    }
  });
  const ok = await waitServer(serverPort);
  if (!ok) {
    const tail = logTail(path.join(logsDir(), 'gateway.err.log')) || logTail(path.join(logsDir(), 'gateway.log'));
    dialog.showErrorBox('Qoder Pilot 启动失败', `端口 ${serverPort} 未就绪。\n\n${tail}`);
  }
  return ok;
}

function stopServer() {
  if (!child || child.exitCode !== null) return;
  try { execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch {}
  child = null;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#0b1220',
    title: 'Qoder Pilot',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(`http://127.0.0.1:${serverPort}/`);
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'build', 'icon.ico'));
  tray.setToolTip('Qoder Pilot');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开控制台', click: showWindow },
    { label: '打开数据目录', click: () => shell.openPath(dataDir()) },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

app.on('before-quit', () => { quitting = true; stopServer(); });
app.on('window-all-closed', (e) => { e.preventDefault(); });

app.whenReady().then(async () => {
  const ok = await startServer();
  createWindow();
  createTray();
  if (!ok) win.show();
});
