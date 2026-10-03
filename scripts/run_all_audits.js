/**
 * Master test runner to execute all audit test suites sequentially
 * and generate a global verification summary.
 */

const http = require('http');
const { execSync, spawn } = require('child_process');
const path = require('path');

const suites = [
  { file: 'test_mugrosito_cop_primary_accounting.js', name: 'Contabilidad Base COP y Conversiones' },
  { file: 'test_reports_and_items_audit.js', name: 'Auditoría de Ítems, Proteínas y Reportes' },
  { file: 'test_complete_accounting.js', name: 'Caja Chica, Gaveta y Redondeo Comercial' },
  { file: 'test_task2_ledger_consistency.js', name: 'Consistencia Exacta de Montos y Cobro en COP' },
  { file: 'test_split_by_person_flow.js', name: 'Flujo de Cobro Dividido por Persona' },
  { file: 'test_deep_money_and_items_audit.js', name: 'Auditoría Profunda de Dinero e Ítems al 100%' },
  { file: 'test_merge_and_transfer.js', name: 'Fusión de Órdenes y Transferencia de Servicios' },
  { file: 'test_e2e_full_cycle.js', name: 'Ciclo E2E Completo en Red LAN' },
  { file: 'test_cierre_and_credits.js', name: 'Cierre de Turno y Archivado de Créditos' },
  { file: 'test_comprehensive_credit_and_money_audit.js', name: 'Auditoría 100% Crédito, Dinero e Ítems en Cierre' },
  { file: 'test_reopen_and_deliver_flow.js', name: 'Reapertura, Entrega y Liberación Inmediata de Mesas' },
  { file: 'test_guia_md_scenarios.js', name: 'Escenarios Operativos Obligatorios de GUIA.md' },
  { file: 'test_thermal_printing_simulation.js', name: 'Impresión Térmica ESC/POS y Conectividad LAN' }
];

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3001/api/connection-info', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning() {
  const isRunning = await checkServer();
  if (isRunning) {
    console.log('ℹ️ Servidor backend ya se encuentra activo en puerto 3001.\n');
    return null;
  }
  console.log('🚀 Iniciando servidor backend temporal para pruebas de integración...');
  const serverProc = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
    detached: false
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ok = await checkServer();
    if (ok) {
      console.log('✅ Servidor backend listo para pruebas en puerto 3001.\n');
      return serverProc;
    }
  }
  console.warn('⚠️ No se pudo confirmar el inicio del servidor backend tras 10 segundos.\n');
  return serverProc;
}

async function main() {
  console.log('======================================================================');
  console.log(`   🚀 EJECUTANDO AUDITORÍA GLOBAL DE PUNTA A PUNTA (${suites.length} SUITES)`);
  console.log('======================================================================\n');

  const spawnedServer = await ensureServerRunning();

  let totalSuitesPassed = 0;
  let totalSuitesFailed = 0;
  const results = [];

  for (const suite of suites) {
    process.stdout.write(`⏳ Ejecutando ${suite.name} (${suite.file})... `);
    const suitePath = path.join(__dirname, suite.file);
    try {
      const output = execSync(`node "${suitePath}"`, {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Parse pass/fail counts from stdout
      const passMatch = output.match(/(\d+)\s+PASSED/i) || output.match(/(\d+)\s+PRUEBAS APROBADAS/i);
      const failMatch = output.match(/(\d+)\s+FAILED/i) || output.match(/(\d+)\s+FALLIDAS/i);
      const passed = passMatch ? parseInt(passMatch[1], 10) : (output.match(/✅\s+\[PASS\]/g) || []).length;
      const failed = failMatch ? parseInt(failMatch[1], 10) : (output.match(/❌\s+\[FAIL\]/g) || []).length;

      if (failed === 0 && passed > 0) {
        console.log(`✅ [${passed} PASSED]`);
        totalSuitesPassed++;
        results.push({ name: suite.name, file: suite.file, passed, failed, status: 'PASSED' });
      } else {
        console.log(`❌ [${passed} PASSED, ${failed} FAILED]`);
        totalSuitesFailed++;
        results.push({ name: suite.name, file: suite.file, passed, failed, status: 'FAILED' });
      }
    } catch (err) {
      console.log(`❌ [ERROR EXCEPCIÓN]`);
      console.error(err.stdout || err.stderr || err.message);
      totalSuitesFailed++;
      results.push({ name: suite.name, file: suite.file, passed: 0, failed: 1, status: 'ERROR' });
    }
  }

  if (spawnedServer) {
    try {
      spawnedServer.kill();
    } catch (_) {}
  }

  console.log('\n======================================================================');
  console.log('                 RESUMEN GENERAL DE AUDITORÍA');
  console.log('======================================================================');

  let totalTestsPassed = 0;
  let totalTestsFailed = 0;

  for (const r of results) {
    totalTestsPassed += r.passed;
    totalTestsFailed += r.failed;
    const statusIcon = r.status === 'PASSED' ? '✅' : '❌';
    console.log(`${statusIcon} ${r.name.padEnd(52)} | ${r.passed} PASSED | ${r.failed} FAILED`);
  }

  console.log('----------------------------------------------------------------------');
  console.log(`TOTAL PRUEBAS: ${totalTestsPassed} PASSED | ${totalTestsFailed} FAILED en ${suites.length} SUITES`);
  console.log('======================================================================\n');

  if (totalSuitesFailed > 0 || totalTestsFailed > 0) {
    console.error('❌ La auditoría ha detectado fallos.');
    process.exit(1);
  } else {
    console.log('🎉 ¡TODAS LAS SUITES Y PRUEBAS PASARON AL 100%! SISTEMA LISTO PARA PRODUCCIÓN.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Error fatal ejecutando auditorías:', err);
  process.exit(1);
});
