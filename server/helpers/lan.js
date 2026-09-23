const fs = require('fs');
const os = require('os');
const path = require('path');

const PRIVATE_IPV4 = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
const EXCLUDED_INTERFACES = /(vpn|virtual|vethernet|vmware|vbox|loopback|bluetooth|radmin|hamachi|tailscale|zerotier|docker|wsl|npcap|tap|tun|teredo|isatap|p2p)/i;

function getInterfaceScore(entry) {
  let score = 50;
  const name = (entry.interfaceName || '').toLowerCase();
  // Wi-Fi / WLAN prioridad máxima en laptops y terminales móviles
  if (/(wi-?fi|wlan|inal[aá]mbric|wireless)/i.test(name)) score -= 30;
  else if (/(ethernet|lan|conexi[oó]n de [aá]rea local)/i.test(name)) score -= 20;

  // Subredes residenciales y comerciales más comunes (192.168.x.x > 10.x.x.x > 172.x.x.x)
  if (/^192\.168\./.test(entry.address)) score -= 15;
  else if (/^10\./.test(entry.address)) score -= 10;
  else if (/^172\./.test(entry.address)) score -= 5;

  return score;
}

function getLanConnectionInfo(port = 3001) {
  const configuredIp = (process.env.MUGROSITO_LAN_IP || process.env.CRISPY_LAN_IP || process.env.BASILICO_LAN_IP || '').trim();
  if (PRIVATE_IPV4.test(configuredIp)) {
    return {
      lanIp: configuredIp,
      backendUrl: `http://${configuredIp}:${port}`,
      interfaceName: 'Configurada manualmente',
      detectedAt: new Date().toISOString(),
    };
  }

  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) => (entries || [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal && PRIVATE_IPV4.test(entry.address))
      .map((entry) => ({ interfaceName: name, address: entry.address })))
    .filter((entry) => !EXCLUDED_INTERFACES.test(entry.interfaceName))
    .sort((left, right) => getInterfaceScore(left) - getInterfaceScore(right));

  const selected = candidates[0];
  if (!selected) {
    return {
      lanIp: '127.0.0.1',
      backendUrl: `http://localhost:${port}`,
      interfaceName: 'Localhost (Modo Local / Sin Wi-Fi activa)',
      detectedAt: new Date().toISOString(),
      isFallback: true,
    };
  }

  return {
    lanIp: selected.address,
    backendUrl: `http://${selected.address}:${port}`,
    interfaceName: selected.interfaceName,
    detectedAt: new Date().toISOString(),
  };
}

function writeLanConfig(connectionInfo) {
  const configDir = path.join(__dirname, '../../src/config');
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = path.join(configDir, 'lanConfig.json');
  fs.writeFileSync(configFile, `${JSON.stringify(connectionInfo, null, 2)}\n`);
  return configFile;
}

module.exports = { getLanConnectionInfo, writeLanConfig };