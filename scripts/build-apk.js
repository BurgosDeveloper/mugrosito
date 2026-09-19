const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🌭 ==========================================');
console.log('🌭 COMPILADOR AUTOMATICO APK - MUGROSITO');
console.log('🌭 ==========================================\n');

const projectRoot = path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');

const env = { ...process.env };
if (!env.JAVA_HOME && fs.existsSync('C:\\Program Files\\Android\\Android Studio\\jbr')) {
  env.JAVA_HOME = 'C:\\Program Files\\Android\\Android Studio\\jbr';
  console.log('☕ Usando JDK de Android Studio:', env.JAVA_HOME);
}
if (!env.ANDROID_HOME && fs.existsSync('C:\\Users\\Burgos\\AppData\\Local\\Android\\Sdk')) {
  env.ANDROID_HOME = 'C:\\Users\\Burgos\\AppData\\Local\\Android\\Sdk';
  console.log('📱 Usando Android SDK:', env.ANDROID_HOME);
}

console.log('\n🔨 Compilando APK nativo Kiosk Fullscreen para Mesero...');
const build = spawnSync('cmd.exe', ['/c', 'gradlew.bat', 'assembleDebug'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
});

if (build.status !== 0) {
  console.error('\n❌ Error durante el ensamblado de Gradle.');
  process.exit(1);
}

const srcApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const exportDir = path.join(projectRoot, 'export');
const destApk = path.join(exportDir, 'Mugrosito_Mesero.apk');
const fallbackApk = path.join(exportDir, 'CrispyBurger_Mesero.apk');

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

if (fs.existsSync(srcApk)) {
  fs.copyFileSync(srcApk, destApk);
  fs.copyFileSync(srcApk, fallbackApk);
  const stats = fs.statSync(destApk);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
  console.log('\n✅ ========================================================');
  console.log('✅ ¡APK GENERADO EXITOSAMENTE!');
  console.log('✅ Archivo listo en: ' + destApk);
  console.log('✅ Tamaño: ' + sizeMb + ' MB');
  console.log('✅ Modo: Kiosk Fullscreen Inmersivo (Sin barra de navegador)');
  console.log('✅ ========================================================\n');
} else {
  console.error('\n❌ No se encontro el archivo app-debug.apk generado.');
  process.exit(1);
}
