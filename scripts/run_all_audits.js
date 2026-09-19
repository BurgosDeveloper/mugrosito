/**
 * Master test runner to execute all 8 audit test suites sequentially
 * and generate a global verification summary.
 */

const { execSync } = require('child_process');
const path = require('path');

const suites = [
  { file: 'test_mugrosito_cop_primary_accounting.js', name: 'Contabilidad Base COP y Conversiones' },
  { file: 'test_reports_and_items_audit.js', name: 'Auditoría de Ítems, Proteínas y Reportes' },
  { file: 'test_complete_accounting.js', name: 'Caja Chica, Gaveta y Redondeo Comercial' },
  { file: 'test_merge_and_transfer.js', name: 'Fusión de Órdenes y Transferencia de Servicios' },
  { file: 'test_e2e_full_cycle.js', name: 'Ciclo E2E Completo en Red LAN' },
  { file: 'test_cierre_and_credits.js', name: 'Cierre de Turno y Preservación de Créditos' },
  { file: 'test_guia_md_scenarios.js', name: 'Escenarios Operativos Obligatorios de GUIA.md' },
  { file: 'test_thermal_printing_simulation.js', name: 'Impresión Térmica ESC/POS y Conectividad LAN' }
];

console.log('======================================================================');
console.log('   🚀 EJECUTANDO AUDITORÍA GLOBAL DE PUNTA A PUNTA (8 SUITES)');
console.log('======================================================================\n');

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

console.log('\n======================================================================');
console.log('                 RESUMEN GENERAL DE AUDITORÍA');
console.log('======================================================================');

let totalTestsPassed = 0;
let totalTestsFailed = 0;

for (const r of results) {
  totalTestsPassed += r.passed;
  totalTestsFailed += r.failed;
  const statusIcon = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`${statusIcon} ${r.name.padEnd(48)} | ${r.passed} PASSED | ${r.failed} FAILED`);
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
