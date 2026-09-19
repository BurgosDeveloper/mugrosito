const fs = require('fs');
const os = require('os');
const path = require('path');

const PRIVATE_IPV4 = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/;
const EXCLUDED_INTERFACES = /(vpn|virtual|vmware|vbox|loopback|bluetooth|radmin)/i;

function interfacePriority(name) {
  if (/(ethernet|lan|conexi[oó]n de [aá]rea local|red)/i.test(name)) return 0;
  if (/(wi-?fi|wlan)/i.test(name)) return 1;
  return 2;
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
    .sort((left, right) => interfacePriority(left.interfaceName) - interfacePriority(right.interfaceName));

  const selected = candidates[0];
  return {
    lanIp: selected?.address || '',
    backendUrl: selected ? `http://${selected.address}:${port}` : '',
    interfaceName: selected?.interfaceName || '',
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