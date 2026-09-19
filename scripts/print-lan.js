const { getLanConnectionInfo, writeLanConfig } = require('../server/helpers/lan');

const connectionInfo = getLanConnectionInfo();
const lanConfigFile = writeLanConfig(connectionInfo);
const lanIp = connectionInfo.lanIp || 'SIN IP LAN';
const backendUrl = connectionInfo.backendUrl || 'No disponible';

console.log('\n============================================================');
console.log(' 🌭 MUGROSITO POS - SERVIDOR Y AUTO-DETECCIÓN LAN');
console.log('============================================================');
console.log(`  Red LAN Host IP:  ${backendUrl}`);
console.log(`  Interfaz activa:  ${connectionInfo.interfaceName || 'No disponible'}`);
console.log(`  Configuración:   ${lanConfigFile}`);
console.log('\n  Acceso directo en Android / Tablets / Celulares en la misma red Wi-Fi:');
console.log(`  - Mesero:        ${backendUrl}/mesonero`);
console.log(`  - Cajero POS:    ${backendUrl}/caja`);
console.log(`  - Cocina KDS:    ${backendUrl}/cocina`);
console.log(`  - Administrador: ${backendUrl}/menu-admin`);
console.log('============================================================\n');
