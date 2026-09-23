const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const port = 3001;
const startupTimeoutMs = 15000;
const retryDelayMs = 250;

function killOldPosInstances() {
  try {
    const cmdNode = 'wmic process where "name=\'node.exe\'" get commandline,processid';
    const outNode = execSync(cmdNode, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const nodeLines = outNode.split('\n');
    for (const line of nodeLines) {
      if (line.toLowerCase().includes('mugrosito') || line.toLowerCase().includes('crispy') || line.toLowerCase().includes('basilico') || line.toLowerCase().includes('server/index.js')) {
        const match = line.trim().match(/(\d+)$/);
        if (match && Number(match[1]) !== process.pid) {
          try { execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}

  try {
    const cmdNetstat = 'netstat -ano | findstr :3001';
    const outNetstat = execSync(cmdNetstat, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const netLines = outNetstat.split('\n');
    for (const line of netLines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && Number(pid) !== process.pid) {
          try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}

  try {
    const cmdTask = 'tasklist /v /fo csv';
    const outTask = execSync(cmdTask, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const taskLines = outTask.split('\n');
    for (const line of taskLines) {
      if (/Mugrosito|Crispy Burger POS|Basilico/i.test(line)) {
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (match && match[2] && Number(match[2]) !== process.pid) {
          try { execSync(`taskkill /F /PID ${match[2]}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

function getConnectionInfo() {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/connection-info', timeout: 2500 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`El backend respondió con estado ${response.statusCode}.`));
          return;
        }
        try {
          const connectionInfo = JSON.parse(body);
          if (!connectionInfo.backendUrl) {
            connectionInfo.backendUrl = `http://localhost:${port}`;
          }
          if (connectionInfo.app !== 'mugrosito' && connectionInfo.app !== 'crispy') throw new Error('El backend respondiendo no pertenece a Mugrosito.');
          resolve(connectionInfo);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('El backend no respondió a tiempo.')));
    request.once('error', reject);
  });
}

function startBackend() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function tryOpenBrowser(executable, args) {
  return new Promise((resolve) => {
    const browser = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    browser.once('error', () => resolve(false));
    browser.once('spawn', () => {
      browser.unref();
      resolve(true);
    });
  });
}

async function openPos(backendUrl) {
  const args = [`--app=${backendUrl}`, '--new-window'];
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    'chrome.exe',
    'msedge.exe',
  ];

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    if (await tryOpenBrowser(candidate, args)) return;
  }

  if (await tryOpenBrowser('cmd.exe', ['/c', 'start', '', backendUrl])) return;
  throw new Error('No se encontró un navegador para abrir Mugrosito.');
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      return await getConnectionInfo();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error('Mugrosito no pudo iniciar el backend LAN. Revisa PostgreSQL y la conexión de red.');
}

async function launch() {
  // 1. Si el backend ya está activo y respondiendo, abrir directamente el navegador
  try {
    const connectionInfo = await getConnectionInfo();
    const targetUrl = connectionInfo.backendUrl || `http://localhost:${port}`;
    console.log('✅ Servidor POS ya activo en:', targetUrl);
    await openPos(targetUrl);
    return;
  } catch (err) {
    console.log('El servidor POS no está activo aún. Iniciando...');
  }

  // 2. Si no responde, asegurar puerto 3001 e iniciar backend
  killOldPosInstances();
  startBackend();

  // 3. Esperar a que el backend esté listo
  const connectionInfo = await waitForBackend();
  const targetUrl = connectionInfo.backendUrl || `http://localhost:${port}`;
  console.log('✅ Servidor POS iniciado en:', targetUrl);
  await openPos(targetUrl);
}

launch().catch((error) => {
  console.error('Error al iniciar Mugrosito:', error.message);
  try {
    const safeMsg = String(error.message || 'Error desconocido').replace(/'/g, '').replace(/"/g, '');
    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safeMsg}', 'Mugrosito POS - Error de Inicio', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)"`, { stdio: 'ignore' });
  } catch (e) {}
  process.exitCode = 1;
});