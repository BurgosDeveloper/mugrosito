const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const exportDir = path.join(rootDir, 'export');
const assetsDir = path.join(rootDir, 'assets');

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

// Auto-detect and update LAN IP in lanConfig.json
console.log('📡 Detectando IP LAN de la computadora...');
try {
  execSync('node scripts/print-lan.js', { cwd: rootDir, stdio: 'inherit' });
} catch (e) {}

// Ensure frontend production build folder exists
const buildDir = path.join(rootDir, 'build');
if (!fs.existsSync(buildDir)) {
  console.log('📦 Compilando la aplicación Web (npm run build)...');
  try {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  } catch (e) {
    console.warn('⚠️ Error al compilar web:', e.message);
  }
}

// Function to wrap PNG buffer into valid Windows ICO format (22-byte header + PNG)
function convertPngToIco(pngBuffer) {
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Image type 1 (ICO)
  icoHeader.writeUInt16LE(1, 4); // Number of images (1)
  
  icoHeader.writeUInt8(0, 6); // Width (0 = 256px)
  icoHeader.writeUInt8(0, 7); // Height (0 = 256px)
  icoHeader.writeUInt8(0, 8); // Color count (0)
  icoHeader.writeUInt8(0, 9); // Reserved
  icoHeader.writeUInt16LE(1, 10); // Color planes (1)
  icoHeader.writeUInt16LE(32, 12); // Bits per pixel (32)
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // Image size
  icoHeader.writeUInt32LE(22, 18); // Image offset (22)
  
  return Buffer.concat([icoHeader, pngBuffer]);
}

// 1. Asegurar icono de Crispy Burger en formato PNG y formato ICO válido de Windows
// 1. Asegurar icono de Mugrosito en formato PNG y formato ICO válido de Windows
const srcIcon = path.join(assetsDir, 'icon.png');
const exportPngIcon = path.join(exportDir, 'mugrosito_icon.png');
const exportIcoIcon = path.join(exportDir, 'mugrosito_icon.ico');
const fallbackPngIcon = path.join(exportDir, 'crispy_icon.png');
const fallbackIcoIcon = path.join(exportDir, 'crispy_icon.ico');
const legacyPngIcon = path.join(exportDir, 'pizza_icon.png');
const legacyIcoIcon = path.join(exportDir, 'pizza_icon.ico');

if (fs.existsSync(srcIcon)) {
  const pngBuffer = fs.readFileSync(srcIcon);
  fs.writeFileSync(exportPngIcon, pngBuffer);
  fs.writeFileSync(fallbackPngIcon, pngBuffer);
  fs.writeFileSync(legacyPngIcon, pngBuffer);
  const icoBuffer = convertPngToIco(pngBuffer);
  fs.writeFileSync(exportIcoIcon, icoBuffer);
  fs.writeFileSync(fallbackIcoIcon, icoBuffer);
  fs.writeFileSync(legacyIcoIcon, icoBuffer);
}

// 2. Generar archivos ejecutables VBS y BAT que abren el POS con la IP LAN vigente.
const mugrositoVbsPath = path.join(exportDir, 'MugrositoPOS.vbs');
const crispyVbsPath = path.join(exportDir, 'CrispyPOS.vbs');
const vbsContent = `' =========================================================
' MUGROSITO POS - EJECUTABLE DE ESCRITORIO PC
' =========================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

strPath = fso.GetParentFolderName(WScript.ScriptFullName)
strRoot = fso.GetParentFolderName(strPath)

' El lanzador Node espera el backend y abre el navegador con su IP LAN actual.
WshShell.Run "cmd /c cd /d """ & strRoot & """ && node scripts\\launch-pos.js", 0, False
`;
fs.writeFileSync(mugrositoVbsPath, vbsContent);
fs.writeFileSync(crispyVbsPath, vbsContent);

// Generar también script .BAT de inicio directo con consola
const mugrositoBatPath = path.join(exportDir, 'MugrositoPOS_Con_Consola.bat');
const crispyBatPath = path.join(exportDir, 'CrispyPOS_Con_Consola.bat');
const batContent = `@echo off
title SERVIDOR & POS MUGROSITO
cd /d "%~dp0.."
node scripts\\launch-pos.js
`;
fs.writeFileSync(mugrositoBatPath, batContent);
fs.writeFileSync(crispyBatPath, batContent);

// 3. Crear accesos directos actualizados para export/ y el Escritorio de Windows.
const psScriptPath = path.join(rootDir, 'create_shortcut.ps1');
const psScriptContent = `
$WshShell = New-Object -ComObject WScript.Shell
$desktopDir = [Environment]::GetFolderPath('Desktop')

# Eliminar accesos directos legados si existen
$legacyShortcuts = @(
  "${exportDir.replace(/\\/g, '\\\\')}\\Basilico Pizzeria.lnk",
  "${exportDir.replace(/\\/g, '\\\\')}\\BasilicoPOS.vbs",
  "${exportDir.replace(/\\/g, '\\\\')}\\BasilicoPOS_Con_Consola.bat",
  (Join-Path $desktopDir 'Basilico Pizzeria.lnk')
)
foreach ($legacy in $legacyShortcuts) {
  if (Test-Path -LiteralPath $legacy) {
    Remove-Item -LiteralPath $legacy -Force -ErrorAction SilentlyContinue
  }
}

$shortcutConfigs = @(
  @{ Path = "${exportDir.replace(/\\/g, '\\\\')}\\Mugrosito.lnk"; Target = "${mugrositoVbsPath.replace(/\\/g, '\\\\')}"; Desc = "Mugrosito - Sistema POS & KDS" },
  @{ Path = (Join-Path $desktopDir 'Mugrosito.lnk'); Target = "${mugrositoVbsPath.replace(/\\/g, '\\\\')}"; Desc = "Mugrosito - Sistema POS & KDS" },
  @{ Path = "${exportDir.replace(/\\/g, '\\\\')}\\Crispy Burger.lnk"; Target = "${mugrositoVbsPath.replace(/\\/g, '\\\\')}"; Desc = "Mugrosito POS" }
)
$timestamp = Get-Date
foreach ($cfg in $shortcutConfigs) {
  $Shortcut = $WshShell.CreateShortcut($cfg.Path)
  $Shortcut.TargetPath = $cfg.Target
  $Shortcut.WorkingDirectory = "${rootDir.replace(/\\/g, '\\\\')}"
  $Shortcut.IconLocation = "${exportIcoIcon.replace(/\\/g, '\\\\')}"
  $Shortcut.Description = $cfg.Desc
  $Shortcut.Save()
  if (Test-Path -LiteralPath $cfg.Path) {
    $shortcutItem = Get-Item -LiteralPath $cfg.Path
    $shortcutItem.CreationTime = $timestamp
    $shortcutItem.LastWriteTime = $timestamp
  }
}

$launcherPaths = @(
  "${mugrositoVbsPath.replace(/\\/g, '\\\\')}",
  "${mugrositoBatPath.replace(/\\/g, '\\\\')}",
  "${crispyVbsPath.replace(/\\/g, '\\\\')}",
  "${crispyBatPath.replace(/\\/g, '\\\\')}"
)
foreach ($launcherPath in $launcherPaths) {
  if (Test-Path -LiteralPath $launcherPath) {
    $launcherItem = Get-Item -LiteralPath $launcherPath
    $launcherItem.CreationTime = $timestamp
    $launcherItem.LastWriteTime = $timestamp
  }
}
`;

fs.writeFileSync(psScriptPath, psScriptContent);

try {
  execSync(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, { stdio: 'inherit' });
} catch (e) {
  console.log('Advertencia al crear acceso directo PowerShell:', e.message);
} finally {
  if (fs.existsSync(psScriptPath)) {
    fs.unlinkSync(psScriptPath);
  }
}

const exportedLauncherPaths = [mugrositoVbsPath, mugrositoBatPath, crispyVbsPath, crispyBatPath];
for (const launcherPath of exportedLauncherPaths) {
  if (fs.existsSync(launcherPath)) {
    const timestamp = new Date();
    fs.utimesSync(launcherPath, timestamp, timestamp);
  }
}

console.log('\n============================================================');
console.log(' 🌭 MUGROSITO POS - ARCHIVOS DE EXPORTACIÓN Y EJECUTABLE');
console.log('============================================================');
console.log(` 📂 Carpeta Export: ${exportDir}`);
console.log(` 💻 Ejecutable Silencioso PC: ${mugrositoVbsPath}`);
console.log(` 💻 Ejecutable Consola PC: ${mugrositoBatPath}`);
console.log(` 🔗 Acceso Directo PC: ${path.join(exportDir, 'Mugrosito.lnk')}`);
console.log(` 🖼️ Icono oficial: ${exportIcoIcon}`);
console.log('============================================================\n');
