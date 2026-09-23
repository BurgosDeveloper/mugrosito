# Guia de comandos Mugrosito POS

## Prompt Audit

Copia este prompt completo al iniciar una auditoria con otro agente de IA:

```text
Actua como un programador senior full stack, auditor de sistemas POS de restaurantes y especialista en React, TypeScript, Node.js, Express y PostgreSQL. Trabajas sobre Mugrosito POS, un sistema para restaurante de hamburguesas, hot dogs y comida rapida con frontend web/React, app movil Expo/React Native, backend Express y base de datos PostgreSQL local (base `mugrosito`). Tu maxima prioridad es preservar la integridad absoluta de las comandas, pagos multimoneda, vueltos, caja chica, tasas cambiarias, impresion termica LAN y datos historicos.

Reglas obligatorias:
1. No asumas. Lee el codigo y sigue el flujo real de datos antes de editar.
2. No borres, reviertas ni formatees cambios locales existentes que no hayas creado. Primero ejecuta `git status -s` y trata el arbol de trabajo como potencialmente modificado por otro desarrollador.
3. Nunca uses comandos destructivos como `git reset --hard`, `git checkout --`, limpieza de base de datos o borrado masivo sin autorizacion explicita del usuario.
4. Manten los cambios pequenos, aislados y compatibles con el estilo existente. Ubica la logica reutilizable en helpers (`server/helpers/`), componentes o rutas especializadas; no sobrecargues archivos principales.
5. Moneda base y contabilidad: En Mugrosito POS, la moneda base del negocio y del catalogo de precios es el PESO COLOMBIANO (COP) (ej. Hamburguesas 15.000 COP, Perros 10.000 COP, Papas 3.000 COP, Delivery 2.000 COP). Las conversiones a USD y Bolivares (Bs) se realizan con las tasas vigentes guardadas en PostgreSQL (`cop_rate` y `bs_rate`). Guarda siempre `total_cop` y `total_usd` normalizados.
6. Regla de Redondeo Comercial de Clientes en COP (`roundCOPPayment`):
   - Montos con residuo <= 500 COP se ajustan al escalon 500 (ej. 31.200 COP -> 31.500 COP).
   - Montos con residuo > 500 COP aproximan al millar superior (ej. 31.600 COP -> 32.000 COP).
7. Reglas estrictas de cobro (Ledger de pagos):
   - La modal de cobro muestra tres tarjetas claras: Total de la comanda, Total pagado y Vuelto pendiente, cada una desglosada en COP, USD y Bs.
   - Un registro es de tipo `payment` o `change` (vuelto); no son el mismo movimiento. El vuelto entregado se registra de forma separada y afecta la gaveta/caja chica como egreso.
   - Metodos validos: COP = Efectivo COP, Bancolombia, Nequi. USD = Efectivo USD, Binance, Zelle. Bs = Pago Movil, Punto de Venta / Tarjeta.
   - No se puede cerrar ni finalizar una comanda si existe deuda pendiente o vuelto pendiente de registrar.
8. Cuentas a credito y cierre de turno:
   - Al cerrar caja (`POST /api/caja/cierre`), archiva TODAS las comandas del turno activo (`archived_at = CURRENT_TIMESTAMP`), incluyendo las cuentas a crédito (`payment_status = 'credito'`).
   - El tablero activo de comandas queda 100% limpio y libre de pedidos pendientes.
   - El correlativo del nuevo turno inicia siempre desde `#1`.
   - La data de cuentas a crédito, clientes deudores y montos queda 100% preservada de forma auditable en el registro de cierre (`caja_chica_cierres`), en la tabla de órdenes (`archived_at IS NOT NULL`) y en el reporte contable del intervalo.
   - Las cuentas a credito NO generan registros en `caja_chica_transactions` ni suman dinero fisico en la gaveta.
9. Reglas estrictas de cocina e impresion termica ESC/POS:
   - Comanda de cocina: Incluye hamburguesas, carnes, papas, jugos naturales y malteadas preparadas. Muestra proteinas cambiadas (`PROTEINAS: ...`), ingredientes retirados en mayusculas (`SIN: ...`), adicionales pagos (`ADD: ...`), corte (`🔪 PICADA`) y notas.
   - REGLA DE SALSAS: Las salsas siempre van al FINAL del ticket de cocina, despues de las comidas.
   - REGLA DE PRE-CUENTA: En la pre-cuenta del cliente, las salsas se EXCLUYEN al 100%. La pre-cuenta muestra consumos y delivery en COP, USD y Bs con tipografia ampliada (+30% negrita).
   - Bebidas comerciales (refrescos de lata, agua, cerveza) NO van a cocina. Comandas con solo bebidas comerciales no imprimen ticket en cocina para no desperdiciar papel.
   - Resiliencia de red LAN: Si la impresora de cocina falla o no responde, el sistema captura el error limpiamente y activa el respaldo inmediato en la impresora de CAJA con alerta visible.
10. Red LAN y sincronizacion Socket.IO:
   - El sistema se ancla dinamicamente a la IP LAN local (ej. `http://192.168.1.6:3001` via `lanConfig.json`).
   - Debe permitir acceso simultaneo desde celulares, tablets y PCs en la misma red Wi-Fi: Mesero (`/mesonero`), Caja (`/caja`), Cocina (`/cocina`) y Administrador (`/menu-admin`).
11. Validaciones y suites de pruebas:
   - Toda modificacion debe ser validada con la suite global: `node scripts/run_all_audits.js` (201 pruebas obligatorias, 0 fallos).
   - Typecheck: `npx tsc --noEmit --pretty false` (0 errores).
   - Sintaxis Node: `node --check server/index.js server/routes/orders.js server/routes/payments.js server/routes/caja.js`.
   - Build de produccion: `npm run build:export`.

Contexto del repositorio:
- Frontend web: `src/` (`CajaPage.tsx`, `AppContext.tsx`, `MeseroPage.tsx`, `CocinaPage.tsx`, `OrderCreateView.tsx`, `PaymentLedgerModal.tsx`).
- App movil: `src/App.native.tsx` y `src/native/`.
- Backend Express: `server/index.js`, `server/db.js`, `server/routes/`, `server/helpers/` y `server/schema.sql`.
- Impresion termica: `server/helpers/thermalPrinter.js` y `server/config/thermal-printer.json`.
- Base de datos: PostgreSQL local `mugrosito`.
- Exportacion Windows: `export/` (`MugrositoPOS.vbs`, `MugrositoPOS_Con_Consola.bat`, `Mugrosito.lnk`).
```

Ejecuta los comandos desde la carpeta raiz del proyecto `mugrosito` en PowerShell.

## Generar ejecutable y acceso directo de PC

Cada vez que cambies el sistema y quieras actualizar los archivos para la PC, ejecuta:

```powershell
npm run build:export
```

El comando compila la version web de produccion y genera o actualiza en `export/`:

- `BasilicoPOS.vbs`: inicio silencioso del POS.
- `BasilicoPOS_Con_Consola.bat`: inicio del POS con consola del servidor.
- `Basilico Pizzeria.lnk`: acceso directo de Windows.
- `pizza_icon.ico`: icono del acceso directo.

Tambien puedes hacer doble clic en `Actualizar_Accesos_Directos.bat`. Ese archivo ejecuta solo el generador de exportacion; para incluir cambios nuevos de la interfaz usa primero `npm run build` o, preferiblemente, `npm run build:export`.

## Abrir el sistema en desarrollo

En una consola:

```powershell
cd server
npm run start
```

En otra consola:

```powershell
npm run start
```

El POS de caja queda en `http://localhost:3000/caja` durante desarrollo. La version exportada abre `http://localhost:3001` porque el backend sirve la carpeta `build/`.

## Inicio confiable desde el acceso directo

El acceso directo `Mugrosito.lnk` abre el POS por la IP LAN actual del backend, por ejemplo `http://192.168.1.6:3001`. La interfaz y Socket.IO se conectan siempre por esa dirección LAN, incluso cuando se abre el POS desde la PC servidor.

Al abrir el acceso directo, Mugrosito inicia el backend si hace falta y consulta su dirección LAN vigente antes de abrir el navegador. No debes ejecutar `ipconfig`, copiar IP ni editar archivos: `npm run build:export` y el acceso directo detectan automáticamente la IP privada de la interfaz Wi-Fi/Ethernet activa.

Si el router cambia la IP mientras el sistema está apagado, el acceso directo vuelve a consultar la IP al iniciar. Para que tablets, celulares u otras PCs puedan conservar una dirección fija, crea una reserva DHCP para la PC servidor en el router usando la dirección MAC de su adaptador Wi-Fi.

## Generar APK Android

```powershell
npm run build:apk
```

El resultado se copia a `export/MugrositoPOS.apk` cuando la compilacion Android finaliza correctamente.

## Verificar antes de exportar

```powershell
npx tsc --noEmit --pretty false
npm run build
node --check server/routes/payments.js
node scripts/run_all_audits.js
```

## Impresora térmica LAN FREMORT FRM-8330 (80 mm)

La FRM-8330 usa papel térmico de 80 mm y se integra por LAN con comandos ESC/POS. Las comandas no se convierten a PDF: se imprimen como tickets ESC/POS de 80 mm, con corte automático, para que el texto llegue completo y legible. Esto es más fiable que enviar un PDF a una térmica de este tipo.

Al crear una comanda que requiere cocina, Mugrosito la guarda primero en PostgreSQL. Solo después intenta imprimirla. Un fallo de impresora nunca borra ni modifica la comanda; el POS muestra una alerta visible para reintentar tras corregir la conexión.

### Configuración manual inicial

1. Conecta la impresora y la PC servidor a la misma red Wi-Fi o LAN. No uses una red de invitados.
2. Enciende la impresora, coloca el rollo térmico de 80 mm y verifica que haga su autoprueba manteniendo presionado `FEED` mientras la enciendes. Anota la dirección IP que aparezca en el ticket de autoprueba.
3. En Windows, instala el controlador que suministró FREMORT para la FRM-8330. En `Configuración > Bluetooth y dispositivos > Impresoras y escáneres`, agrega la impresora por dirección TCP/IP si el controlador lo solicita.
4. En las propiedades de impresión de Windows, configura papel de `80 mm`, orientación vertical, escala `100 %` o `Tamaño real` y activa el corte automático si el controlador lo ofrece. Imprime una página de prueba de Windows.
5. Abre [server/config/thermal-printer.json](server/config/thermal-printer.json) y completa la IP obtenida en la autoprueba. Conserva el puerto `9100` salvo que el ticket de autoprueba o el manual indique otro:

```json
{
	"enabled": true,
	"host": "192.168.1.200",
	"port": 9100,
	"timeoutMs": 5000,
	"copies": 1
}
```

6. Guarda el archivo, reinicia el backend desde `server/` con `npm run start` y ejecuta desde la raíz del proyecto:

```powershell
npm run print:test
```

7. El comando imprime un ticket de prueba sin crear ni cambiar datos de la base. Confirma que el ancho, el corte y el texto se leen correctamente antes de activar el uso operativo.
8. Envía una comanda real de prueba. El ticket incluye número, fecha/hora, tipo de servicio, mesa/cliente, mesero, cada ítem, cantidad, tamaño, mitad y mitad, ingredientes retirados, extras, preferencias, para llevar, notas individuales, nota general, número de ítems y total.

### Reportes en la misma impresora

Todos los botones de reportes de Caja envían de inmediato una versión ESC/POS de 80 mm a la FRM-8330 configurada en [server/config/thermal-printer.json](server/config/thermal-printer.json). El reporte incluye cobros y egresos en USD, COP y Bs con sus métodos de pago. Al mismo tiempo se abre una vista optimizada para rollo de 80 mm; desde su diálogo puedes seleccionar `Microsoft Print to PDF` si necesitas una copia PDF.

Si la térmica está apagada, fuera de red o deshabilitada, el POS muestra el error y no genera una impresión falsa. Verifica primero la conexión con `npm run print:test`.

## Base de datos y migraciones

Las migraciones son automaticas: al iniciar el backend, `server/db.js` ejecuta los `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` necesarios. No ejecutes el esquema manualmente para una actualizacion normal.

En esta PC se conecta a PostgreSQL en la base local `mugrosito`; las migraciones se ejecutan de forma idempotente al iniciar. Esto incluye las columnas multimoneda del libro de pagos: `cash_tendered_bs`, `cash_tendered_cop`, `cash_tendered_usd`, `change_given_bs`, `change_given_cop`, `change_given_usd`, `cop_rate` y `bs_rate` en `order_payments`.

El puerto `3001` sirve el backend en LAN y local. Para iniciar el backend:
```powershell
node server/index.js
```

## Limpiar pedidos de prueba

Atencion: elimina comandas y movimientos. No lo uses para una limpieza operativa sin respaldo.

```powershell
node scripts/clean-database.js
```

## Separación e Independencia Total de Turnos (Mañana y Noche)

El sistema opera con dos entornos 100% aislados e independientes:
1. **Turnos**: `manana` y `noche` (con usuario Dueño para visualización global `ambos`).
2. **Comandas y Correlativos**: Cada turno cuenta con su propia numeración correlativa (`#1`, `#2`, `#3`...).
3. **Catálogo de Menú**: Los productos, bebidas e ingredientes están aislados por turno en base de datos (`products.shift` e `ingredients.shift`).
4. **Mesas**: El estado de ocupación (`ocupada` vs `libre`) se calcula dinámicamente según las comandas activas del turno en curso.
5. **Caja Chica y Arqueos**: Las aperturas de caja, ingresos, egresos y cierres contables se gestionan de forma exclusiva para el turno logueado.
6. **Realtime WebSockets**: Los eventos Socket.IO se canalizan mediante salas dedicadas (`shift:manana`, `shift:noche`, `shift:ambos`).

## Cuentas a Crédito y Gestión de Deudas por Cobrar

1. **Cerrar a Crédito**: Desde el modal de cobro unificado (`PaymentLedgerModal`) o la vista de Caja POS, cualquier comanda puede ser cerrada bajo la modalidad de **Crédito / Cuenta por Cobrar**.
2. **Nombre de Deudor Obligatorio**: Al pulsar "📝 Cerrar a Crédito", el sistema exige de forma estricta ingresar el nombre del cliente o deudor responsable de la cuenta (no se admiten nombres vacíos ni genéricos). Opcionalmente se puede adjuntar una nota o referencia.
3. **Aislamiento Contable de Caja Chica**: Las comandas a crédito **NO** generan registros de ingresos ni egresos en `caja_chica_transactions` ni suman dinero físico en la gaveta.
4. **Desglose de Créditos en Reportes y PDF**: En los reportes contables del intervalo y exportaciones de Excel, las cuentas a crédito se reflejan en su propia sección detallada: **"DESGLOSE DE CRÉDITOS Y CUENTAS POR COBRAR"**, mostrando Comanda #, Fecha/Hora, Deudor, Ítems solicitados y Monto total adeudado en USD (con sus equivalencias informativas en COP y Bs).
5. **Exclusión en Pago por Personas**: La opción de "Cerrar a Crédito" aplica exclusivamente al cierre de la comanda completa; en la modalidad de "Pago por Personas" (cobro dividido por comensal o ítem) el botón de crédito queda automáticamente deshabilitado para preservar la integridad de cobros individuales.

## Formato de Reportes y Apertura sin Impresión Forzada

1. **Tablas con Moneda y Monto**: Todas las tablas de desglose (Totales por Moneda, Desglose por Método de Pago, Historial por Método, Ingresos y Vueltos) presentan una estructura limpia de **Moneda | Monto Recibido**, eliminando las 3 columnas en paralelo para mayor legibilidad y claridad contable.
2. **Apertura de Reportes Bajo Demanda**: Al consultar los reportes en pantalla, el sistema abre la vista previa en el navegador sin disparar órdenes directas a la impresora térmica. La impresión o guardado en PDF se realiza únicamente cuando el usuario presiona el botón "🖨️ IMPRIMIR / PDF".
3. **Exportación a Excel**: Incluye una hoja dedicada para **Créditos** con los detalles del cliente, comanda e ítems facturados a crédito.

## Toma de Pedidos Habilitada para Rol Caja

El usuario con rol `caja` dispone de permisos completos de mesonero:
- Puede crear pedidos nuevos directamente desde `/mesonero` o mediante el botón de acceso rápido en la cabecera de comanda de Caja POS.
- Dispone del selector rápido en la barra lateral para alternar cómodamente entre `💳 Caja POS` y `🍽️ Mesero`.

## Impresión de Comandas de Cocina y Pre-Cuenta con Tipografía Ampliada (+30%)

1. **Filtro de Ítems de Cocina**: Al enviarse la orden a la impresora térmica de cocina o KDS, el sistema filtra y procesa **únicamente** los ítems que requieren preparación:
   - **Hamburguesas y Hot Dogs**: Con personalización de proteínas (`PROTEINAS: ...`), ingredientes retirados (`SIN: ...`), adicionales pagos (`ADD: ...`), indicación de corte (`🔪 PICADA`) y notas especiales.
   - **Salsas al Final**: Las salsas siempre van al final de la comanda de cocina.
   - **Jugos y Bebidas Preparadas**: Con su nivel de endulzante (`AZÚCAR: Sin azúcar / Con azúcar / Poca azúcar`) e indicación de para llevar (`*** PARA LLEVAR ***`).
2. **Exclusión de Ítems Comerciales**: Refrescos enlatados, aguas embotelladas, licores comerciales o adicionales empaquetados que no se preparan en cocina quedan excluidos de la comanda térmica de cocina. Si una orden consta exclusivamente de bebidas comerciales, el sistema no emite ticket en la estación de cocina.
3. **Tipografía Térmica Ampliada (+30%)**: Tanto las comandas de cocina como las pre-cuentas de consumo emplean escalado ESC/POS con mayor presencia horizontal y doble altura en encabezados e ítems para lectura rápida a distancia en cocina y salón.
4. **Ticket de Pre-Cuenta y Consumo desde Caja**: Botón instantáneo `🧾 IMPRIMIR PRE-CUENTA` en cada tarjeta de comanda activa que genera el ticket de consumo con todos los ítems y totales desglosados en **COP (Pesos)**, **USD ($)** y **Bs (Bolívares)** al tipo de cambio del turno, con exclusión total de salsas.

## Sistema de Autorización con PIN de Seguridad (4 Dígitos)

El sistema protege las operaciones críticas y administrativas permitiendo al rol `caja` operar con total autonomía en sus funciones directas y exigiendo autorización mediante un PIN de 4 dígitos (por defecto `1234`, configurable por el Administrador):

1. **Operaciones Directas SIN Clave**:
   - 💱 **Editar tasas de cambio**: Actualización inmediata de tasas COP y Bs.
   - 🍽️ **Crear comandas y tomar pedidos (Mesero)**: Envío de pedidos a cocina.
   - 💳 **Cobranza de comandas**: Cobro unificado (Ledger), abonos y cierre a crédito.
   - 👥 **Pagar por personas**: Cobro dividido por comensal o ítem.
   - 📦 **Entregar comandas**: Despacho de comandas preparadas.
   - 🔥 **Marcar comanda como lista**: Control del flujo de preparación.
   - 🧾 **Imprimir ticket / pre-cuenta**: Emisión de comprobante al cliente.
   - 💰 **Caja Chica**: Registro de vueltos o egresos manuales en efectivo.

2. **Operaciones Administrativas CON Clave PIN**:
   - ✏️ **Editar Comanda**: Modificación de ítems o notas de comanda abierta.
   - 🗑️ **Anular / Borrar Comanda**: Eliminación total y liberación del correlativo.
   - 🔗 **Unificar Comandas**: Fusión de múltiples comandas en una máster.
   - 📂 **Pestaña HISTORIAL**: Consulta de comandas cobradas en días o turnos anteriores.
   - 📊 **Pestaña REPORTES & CIERRE**: Consulta de reportes contables e intervalos y realización de arqueos/cierres.
   - ⚙️ **Caja Chica - Apertura**: Modificación del fondo inicial de apertura.
   - 🔄 **Reactivar Comanda**: Reapertura de comandas finalizadas desde el historial.
   - 📋 **Menú Admin (`/menu-admin`)**: Administración del catálogo de productos, bebidas, ingredientes, mesas o PIN de seguridad.

3. **Configuración del PIN**: En el panel de administración (`/menu-admin` -> pestaña `🔐 PIN DE SEGURIDAD`), el Administrador puede visualizar el PIN activo y cambiarlo en cualquier momento.

## Jerarquía Visual, Tipografía y Código de Colores de Monedas

1. **Diferenciación Clara entre Pago y Vuelto**:
   - **Pago del Cliente (Ingreso)**: Botón y tarjeta en Verde Esmeralda de alto impacto (`🟢 REGISTRANDO: PAGO DEL CLIENTE / INGRESO A CAJA`).
   - **Vuelto al Cliente (Egreso)**: Botón y tarjeta en Ámbar / Naranja vibrante (`🟠 REGISTRANDO: VUELTO AL CLIENTE / EGRESO DE CAJA`).
2. **Visualización de Monedas en Grande**:
   - **💵 USD**: Verde Esmeralda (`text-emerald-400 / text-emerald-800`).
   - **🇨🇴 COP**: Azul Cielo (`text-sky-300 / text-sky-800`).
   - **🇻🇪 Bs**: Ámbar Dorado (`text-amber-300 / text-amber-800`).
   Todas las monedas se muestran con tipografía amplia y tarjetas con alto contraste para una percepción visual instantánea sin fatiga.

## Arqueo, Cierre de Turno y Archivado de Comandas con Reseteo Correlativo

1. **Seguridad en el Cierre**: El rol `caja` requiere autorización mediante PIN de 4 dígitos para realizar el arqueo y cierre del turno; el rol `admin` accede de forma directa.
2. **Impresión Térmica Automática**: Al confirmar el arqueo de efectivo (contado físico USD y COP), el sistema emite de manera automática el ticket térmico de cierre detallando la apertura, los totales desglosados por método de pago, el resumen de créditos y el cuadre de caja chica (esperado vs contado vs diferencia).
3. **Archivado Integral Limpio**: Se archivan de forma segura en PostgreSQL (`archived_at = CURRENT_TIMESTAMP`) todas las comandas del turno (pagadas, canceladas y créditos), dejando el tablero de comandas completamente despejado para el siguiente turno.
4. **Preservación y Auditoría de Créditos**: La información de créditos y deudores queda 100% archivada y auditable en la base de datos histórica y reflejada en el ticket de cierre Z y reporte de intervalo.
5. **Reinicio de Correlativo a #1**: Los nuevos pedidos creados en el siguiente turno inician su numeración correlativa limpiamente en `#1`.
6. **Integridad de Catálogos**: El cierre de turno no altera bajo ninguna circunstancia los catálogos de menú (`products`), ingredientes (`ingredients`), mesas (`tables_config`), usuarios (`users`), tasas de cambio ni configuración del PIN.
7. **Comprobación en Vivo del Arqueo**: En el modal de arqueo, al ingresar el conteo físico en USD y COP, el sistema valida en tiempo real si el efectivo cuadra exacto o si presenta sobrante/faltante con badges visuales de alto contraste antes de confirmar el cierre definitivo.

## Validación Obligatoria de Delivery y PickUp
1. **Órdenes Delivery**:
   - Es **OBLIGATORIO** especificar el **Nombre del Cliente** (o contacto) y seleccionar/ingresar el **Monto del Delivery ($ USD > 0)**.
   - Si falta alguno de los dos, el sistema bloquea el envío de la comanda con avisos visuales claros en rojo (`⚠️ Ingrese Nombre y Monto de Delivery`).
   - El monto del delivery se computa como ítem explícito (`🛵 SERVICIO DELIVERY`) en el total de la comanda, en el KDS de cocina, en Caja y en los tickets térmicos.
2. **Órdenes PickUp / Para Llevar**:
   - Es **OBLIGATORIO** especificar el **Nombre o Referencia del Cliente**.
   - El sistema bloquea el envío si el campo se encuentra vacío (`⚠️ Ingrese Nombre del Cliente`).

## Reubicación y Cambio de Mesa en Tiempo Real
1. En comandas de salón (`type === 'mesa'`) activas, tanto en Mesero como en Caja se dispone del botón `🔄 Cambiar Mesa`.
2. Al presionarlo se despliega la modal interactiva `ChangeTableModal` mostrando el catálogo de mesas disponibles en verde (`Libre`), mientras que las ocupadas por otras comandas se muestran en rojo/deshabilitadas.
3. Al confirmar el traslado, el endpoint `PATCH /api/orders/:id/change-table` ejecuta una transacción en PostgreSQL que:
## Reubicación y Cambio de Mesa en Tiempo Real
1. En comandas de salón (`type === 'mesa'`) activas, tanto en Mesero como en Caja se dispone del botón `🔄 Cambiar Mesa`.
2. Al presionarlo se despliega la modal interactiva `ChangeTableModal` mostrando el catálogo de mesas disponibles en verde (`Libre`), mientras que las ocupadas por otras comandas se muestran en rojo/deshabilitadas.
3. Al confirmar el traslado, el endpoint `PATCH /api/orders/:id/change-table` ejecuta una transacción en PostgreSQL que:
   - Reasigna el `table_number` de la comanda a la nueva mesa.
   - Marca la nueva mesa como `ocupada`.
   - Verifica si la mesa anterior quedó sin pedidos activos y la libera automáticamente (`libre`).
   - Emite los eventos `orders:sync` y `tables:sync` por Socket.IO en tiempo real a todos los dispositivos conectados.

## Sidebar Colapsable a Modo Solo Iconos y Tarjetas Compactas
1. **Modo Colapsable en Sidebar (`Sidebar.tsx`)**:
   - Botón toggle `[ ⏪ / ⏩ ]` en la cabecera superior del menú lateral.
   - Alterna entre el modo extendido (`w-72`) y el modo compacto de solo iconos (`w-20`), permitiendo maximizar el espacio útil de la pantalla para comandas y mesas.

## Generación de Accesos Directos para PC (Windows)

```powershell
npm run build:export
```

El comando compila la versión web de producción y genera o actualiza en `export/`:

- `MugrositoPOS.vbs`: inicio silencioso de Mugrosito POS.
- `MugrositoPOS_Con_Consola.bat`: inicio de Mugrosito POS con consola del servidor.
- `Mugrosito.lnk`: acceso directo de Windows (en `export/` y en el Escritorio).
- `mugrosito_icon.ico`: icono del acceso directo.

También puedes hacer doble clic en `Actualizar_Accesos_Directos.bat`. Ese archivo ejecuta solo el generador de exportación; para incluir cambios nuevos de la interfaz usa primero `npm run build` o, preferiblemente, `npm run build:export`.

## Base de datos y migraciones (Mugrosito POS)

Las migraciones son automáticas: al iniciar el backend, `server/db.js` ejecuta los `CREATE TABLE` y `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` necesarios. No ejecutes el esquema manualmente para una actualización normal.

- **Base de datos local**: PostgreSQL `mugrosito` (puerto `5432`).
- **Repositorio remoto oficial**: `https://github.com/BurgosDeveloper/mugrosito.git`.
- **Esquema de datos**: `server/schema.sql` y `server/db.js` adaptados al catálogo de Hamburguesas, Hot Dogs, Bebidas y Acompañantes en Pesos Colombianos (COP) como moneda base.
- **Historial de pagos**: Soporte multi-divisa (COP, USD, Bs, Binance) con columnas `cash_tendered_cop`, `cash_tendered_usd`, `cash_tendered_bs`, `change_given_cop`, `change_given_usd`, `change_given_bs`, `cop_rate`, `bs_rate` auditables.

El backend se ejecuta en el puerto `3001` (LAN y local):
```powershell
node server/index.js
```

## Arquitectura Operativa y Turnos (Mugrosito POS)

Para optimizar y agilizar la operación en Mugrosito POS:
1. **Operación Centralizada**: Gestión continua y fluida de caja, salón, delivery y cocina.
2. **Comandas y Correlativos**: Numeración correlativa continua (`#1`, `#2`, `#3`...) con preservación de cuentas a crédito al cerrar turno.
3. **Catálogo de Menú (Hamburguesas y Hot Dogs)**: Catálogo unificado en COP con personalización de proteínas, ingredientes retirados (`SIN: ...`), adicionales pagos (`ADD: ...`), y salsas al final de cocina.
4. **Mesas**: Ocupación en tiempo real calculada dinámicamente según las órdenes activas.
5. **Caja Chica y Arqueos**: Flujo directo de apertura de caja, transacciones (ingresos/egresos) y cierre contable con impresión térmica automática del arqueo.
6. **Realtime WebSockets**: Emisiones globales a todos los terminales conectados (`io.emit`), garantizando sincronización instantánea entre Caja, Mesero y Cocina.
7. **Cuentas del Sistema**: Accesos directos:
   - `admin` (Administrador General)
   - `caja` (Cajero Principal)
   - `mesero` (Mesero Principal)
   - `cocina` (Jefe de Cocina)

## Sistema de Diseño y UI Mugrosito POS

En cumplimiento de los requerimientos visuales y de usabilidad:
1. **Paleta de Colores Oficial**:
   - **Superficies y Fondos**: Blanco puro (`#FFFFFF`) y fondo neutro ultra claro (`#F8FAFC`).
   - **Acento Primario**: Amarillo Mugrosito (`#FACC15` / `#EAB308`).
   - **Contraste y Tipografía**: Negro profundo (`#111827` / `#000000`) para máxima legibilidad contable y operativa.
2. **Formularios Planos y Compactos (Zero Scroll)**:
   - Escalado base calibrado para asegurar que las tarjetas de pedidos, cajas y comandas quepan completamente en pantalla sin requerir scrolls innecesarios.
   - Entradas de texto limpias con bordes definidos y halo de foco en amarillo.
   - Botones de acción planos con feedback visual instantáneo.
   - Botones de acción planos (`crispy-btn-primary`, `crispy-btn-dark`, `crispy-btn-outline`) con feedback visual instantáneo.
3. **Identidad de Marca Unificada**:
   - Barra superior (Navbar), panel lateral (Sidebar) y Login actualizados con la identidad **CRISPY BURGER POS** e iconografía de hamburguesa/comida rápida (`IoFastFood`).
4. **Pantalla Completa de Mesas (Zero Scroll) y Accesos Reducidos**:
   - Rejilla autoajustable y densa (`TableCompactGrid`) donde todas las mesas son visibles a la vez en pantalla sin requerir desplazamiento vertical.
   - Botones tipo chip ultra-compactos en la cabecera para `🛵 + DELIVERY` y `🛍️ + PICKUP`, liberando el área principal.
5. **Catálogo Alfabético Ultra-Compacto (100% Texto, Zero Scroll)**:
   - Catálogo de productos (`ProductTextCatalog`) ordenado estrictamente de forma alfabética (A-Z).
   - Fichas ultra-compactas de una sola línea con distribución eficiente: Nombre del producto a la izquierda (`font-black text-xs`) y precio en dólares a la derecha (`[$X.XX]`).
   - Cero imágenes y cero textos de ingredientes en la ficha principal para que entren decenas de productos en pantalla simultáneamente sin scroll vertical.
6. **Configurador Plano de Hamburguesas y Bebidas con 3 Monedas**:
   - Módulos `BurgerBuilderModal` y `DrinkSelectorModal` para personalización al tocar cualquier producto.
   - Presentación simultánea de los 3 precios en el encabezado y en el total (`USD`, `COP` y `Bs`) calculados según la tasa activa.
   - Desmarcado de ingredientes base que trae la hamburguesa (`🚫 SIN: [Ingrediente]`) y selección de adicionales (`➕ EXTRA: [Ingrediente]`), con cálculo en tiempo real y notas de cocina.
7. **Generador y Exportador de PC (Crispy POS)**:
   - Script `scripts/build-export.js` actualizado para generar los accesos directos de Windows `Crispy Burger.lnk`, el ejecutable silencioso `CrispyPOS.vbs` y el script con consola `CrispyPOS_Con_Consola.bat`, manteniendo compatibilidad con los accesos previos.
8. **Retrocompatibilidad Visual**:
   - Mapeo automático de clases legadas (`.clay-btn`, `.clay-card`, `.glass-panel`) hacia el nuevo sistema plano amarillo/negro/blanco para preservar la armonía visual en cualquier vista residual.
9. **Formas de Pago Multi-Moneda (Tres Columnas: Bolívares, Pesos y Dólares)**:
   - Pantalla de cobro (`PaymentLedgerModal`) con visualización simultánea de 3 columnas para control contable de contado y vueltos (USD, COP, Bs).
   - Control estricto de finalización: el botón `FINALIZAR COBRO` solo se activa cuando la comanda está totalmente pagada y no hay vueltos pendientes.

## Automatización Operativa y Experiencia Ágil Crispy Burger POS

1. **Delivery con Nombre de Cliente Estrictamente Obligatorio (Tarea 7)**:
   - Toda comanda de tipo `delivery` exige de forma obligatoria el nombre y dirección del cliente.
   - Si el campo está vacío, tanto el frontend (en `/mesonero`) como la API en backend (`POST /api/orders`) rechazan la creación arrojando un error `400` y alertando al operador en pantalla.
2. **Pre-cuenta de Mesa y Clientes en las 3 Monedas (Tarea 6 y 11)**:
   - El ticket de pre-cuenta y la modal de comanda (`OrderDetailModal`) presentan de forma clara y unificada el desglose en las tres divisas vigentes: **USD ($)**, **COP (Pesos)** y **Bs (Bolívares)**.
   - Desde cualquier comanda abierta, el botón `🧾 PRE-CUENTA CLIENTE` permite reimprimir o emitir el ticket de consumo detallado para entregárselo al comensal antes de cobrar.
3. **Preguntar Siempre Antes de Imprimir Recibo de Venta (Tarea 10)**:
   - Al finalizar el cobro de una comanda en `PaymentLedgerModal`, el sistema **NO** fuerza la impresión térmica automática para evitar gastos innecesarios de papel.
   - Se despliega una ventana de confirmación clara: `¿Deseas imprimir recibo de venta? [🖨️ Sí, Imprimir] [❌ No Imprimir]`.
4. **Reubicación y Cambio de Mesa en Tiempo Real (Tarea 8)**:
   - La ventana de traslado de mesa (`ChangeTableModal`) se integra bajo el diseño Crispy y procesa el cambio de mesa de forma atómica en el servidor.
   - La actualización se propaga de inmediato mediante WebSockets (`orders:sync` y `tables:sync`), liberando la mesa previa y ocupando la nueva mesa sin recargar la página.
5. **Automatización de Formularios y Atajos de Teclado (Tarea 14)**:
   - En el módulo de cobranza (`PaymentLedgerModal`), el campo de monto se auto-enfoca al abrir la ventana.
   - Al presionar la tecla `Enter`, la transacción de pago se registra al instante sin necesidad de mover el cursor hacia el botón de confirmación.
6. **Paleta de Identidad Visual Crispy (Tarea 15)**:
   - Se removieron los remanentes visuales verde esmeralda y fondos oscuros heredados.
   - El sistema unifica sus interfaces bajo el esquema oficial: **Blanco, Crema suave (`#FAF8F5`), Amarillo (`#FACC15`) y Negro**, con bordes limpios y tipografía de alto contraste legible a distancia.
7. **Cambio de Proteínas Personalizado en Hamburguesas (Tarea 3)**:
   - En el configurador de hamburguesas (`BurgerBuilderModal`), el mesonero o cajero puede cambiar libremente las proteínas de la hamburguesa:
     - **Sencilla (1 Carne)**: Se cambia la proteína única a elección entre `Carne de Res`, `Pollo Crispy`, `Pollo a la Plancha`, `Carne Mixta` o `Carne Smash`.
     - **Doble (2 Carnes)**: Se permite cambiar una de las dos, o ambas de forma independiente (ej: 1 Res + 1 Pollo a la Plancha, o ambas Pollo Crispy, etc.).
     - **Triple (3 Carnes)**: Se permite cambiar 1 de las 3, 2 de las 3 o las 3 proteínas de manera totalmente independiente.
     - **Selector de carnes integrado**: Botones rápidos `[1 Carne] [2 Carnes] [3 Carnes]` en la cabecera de la sección para adaptar la hamburguesa al gusto del comensal.
   - **Persistencia y Visibilidad**: La selección se almacena en PostgreSQL (`order_items.proteins TEXT[]`), se propaga en tiempo real a cocina (`CocinaPage`), carritos de mesero, detalles de comanda y se imprime con claridad tanto en pre-cuentas como en tickets térmicos ESC/POS.
8. **Vista Compacta de 50+ Comandas Colapsadas con Botón Ojo `👁️` (Tarea 4)**:
   - **Cobertura Integral**: Disponible para los tres roles operativos (**Mesero**, **Caja** y **Admin**).
   - **Alta Densidad Visual**: El botón alternador `[👁️ Modo Compacto (50+)]` organiza las comandas en una rejilla responsiva ultra-ágil (de 3 a 5 columnas según la resolución de pantalla), permitiendo ver hasta 50 o más comandas sin necesidad de realizar scrolls caóticos.
   - **Tarjeta Compacta de Información Crítica**: Resume número de orden `#X`, cliente/mesa, hora de ingreso, total de ítems solicitados, badges de preparación (`⏳ En Cocina` / `🔥 Lista` / `📦 Entregada`) y pago (`💳 Pendiente` / `✅ Pagado` / `⚠️ Crédito`), monto en USD, COP y Bs, y botones de acción rápida (`💳 COBRAR`, `🧾 Pre-cuenta`, `➕ Adicionar`, `🔄 Mover Mesa`).
   - **Botón Ojo `👁️` de Inspección Total**: Cada tarjeta compacta incluye el botón ojo `👁️` que despliega inmediatamente el modal `OrderDetailModal` con el desglose pormenorizado de productos, proteínas personalizadas, ingredientes retirados ("SIN"), extras, notas especiales y cobro directo.
   - **Persistencia de Preferencia**: La elección de vista (`compact` vs `expanded`) se memoriza en el almacenamiento local del dispositivo del usuario.
9. **Cobro Directo desde la Tarjeta de la Mesa (Tarea 5)**:
   - **Acceso Exclusivo para Roles Caja y Admin**: En la cuadrícula de mesas (`TableCompactGrid`), cuando una mesa se encuentra ocupada, los usuarios con rol `caja` o `admin` disponen del botón directo `💳 Cobrar`.
   - **Flujo Ininterrumpido**: Al presionar `Cobrar`, se abre directamente el libro contable de cobro (`PaymentLedgerModal`) sin tener que trasladarse manualmente a `/caja`. Al registrar el pago, la mesa se libera y se actualiza instantáneamente en todos los dispositivos conectados vía WebSocket.
10. **Reinicio de Correlativos tras Arqueo y Cierre (Tarea 9)**:
    - **Archivado Seguro en PostgreSQL**: Al ejecutar el arqueo y cierre en `caja.js`, todas las comandas completadas o canceladas se archivan (`archived_at = CURRENT_TIMESTAMP`), preservando intacta toda la información histórica para auditorías y reportes.
    - **Reinicio Automático**: El cálculo correlativo `SELECT COALESCE(MAX(...), 0) + 1 FROM orders WHERE archived_at IS NULL` garantiza que el nuevo turno inicie en `#1` (o correlativo siguiente a cuentas por cobrar pendientes).
11. **Impresión Selectiva de Cocina (Tarea 12)**:
    - **Filtrado Inteligente de Ítems**: La función centralizada `isKitchenItem` distingue entre comida preparada (hamburguesas, acompañantes, salsas, jugos naturales, batidos) y bebidas comerciales embotelladas/enlatadas (refrescos, cervezas, licores, agua mineral).
    - **Cero Desperdicio de Papel Térmico**: Las órdenes que contienen exclusivamente bebidas selladas no generan tickets térmicos de cocina ni saturan la pantalla de cocina KDS, asignándoles de inmediato el estado `preparada`.
12. **Redondeo Contable Comercial en Bs y Pesos COP (Tarea 13)**:
    - **Pesos COP al Millar Comercial Superior**: Dado que en el comercio diario y transacciones en efectivo no circulan denominaciones inferiores a $1.000 COP, los montos en pesos se redondean al millar comercial superior (`Math.ceil(monto / 1000) * 1000`).
    - **Bolívares (Bs)**: Se redondean estrictamente a dos decimales contables (`Math.round(monto * 100) / 100`).
    - **Consistencia Descentralizada**: Implementado en `src/utils/currencyRounding.ts` y `server/helpers/currencyRounding.js`, sincronizando los cálculos en pre-cuentas de clientes, modales de armado, cajas y tickets ESC/POS.
13. **Catálogo Oficial del Menú Real de Crispy Burger y Cero Imágenes en Bebidas**:
    - **Cero Imágenes en Bebidas y Productos**: Se eliminaron definitivamente las imágenes de refrescos y latas en el panel de administración (`MenuManagementPage`) y en todas las pantallas operativas. Las bebidas ahora se presentan en tarjetas de texto compactas, planas y homogéneas con su tipo (`REFRESCO`, `TÉ`, `CERVEZA`, `AGUA`, `JUGO`), descripción y precio en dólares.
    - **Menú Real Cargado en PostgreSQL**: Se configuró y pobló la base de datos con la carta oficial de Crispy Burger:
      - **11 Hamburguesas y Platos**: Bistro ($7.00), Crispys ($7.00), Chicken Grill ($7.00), Mr Pork ($7.00), Street ($7.00), Nuggets ($7.00), Super Smash ($7.00), Tasty ($7.00), Mixtura ($9.00), House ($9.00) y 3.0 ($10.00).
      - **7 Bebidas**: Refresco 350ml ($1.00), Nestea ($1.00), Cerveza ($1.00), Refresco 2Lt ($2.50), Agua Mineral ($1.00), Granizado ($1.50) y Lata ($1.50).
      - **5 Adicionales**: Tocineta ($1.00), Queso Cheddar ($1.00), Proteína ($3.00), Ración Papas ($2.00) y Servicio Adicional de Papas Fritas ($2.00).
      - **5 Toppings ¡GRATIS!**: Jalapeños Picantes ($0.00), Cebolla Caramelizada ($0.00), Sweet Relish ($0.00), Maíz ($0.00) y Pepinillos ($0.00).
      - **Script SQL para pgAdmin**: Disponible en `server/crispy_menu_real.sql` para su ejecución directa en producción.

## Modal de Adición de Ítems a la Comanda (`OrderAppendModal`) y Ticket de Cocina
1. **Acceso Rápido Sin Clave**:
   - Tanto el rol **Mesero** como el rol **Caja** pueden presionar el botón `➕ ADICIONAR` en cualquier comanda activa para incorporar nuevos productos sin requerir clave o PIN de autorización.
2. **Borrado Protegido con PIN**:
   - Si se requiere eliminar o anular un ítem que ya había sido guardado previamente en la comanda, el rol `caja` debe ingresar el PIN de 4 dígitos de autorización de administrador (`AdminPinModal`).
3. **Impresión Térmica Selectiva en Cocina**:
   - Cuando la adición incluya productos que requieren preparación en cocina (Hamburguesas, Hot Dogs con adicionales/proteínas/modificaciones, o Jugos naturales), el sistema genera y emite a la impresora térmica de cocina un ticket exclusivo con los nuevos productos bajo el encabezado:
     ```text
     ==============================
       --- ADICION A COMANDA ---
     ==============================
     ```
   - Si la adición consta exclusivamente de **bebidas comerciales**, no se emite ticket a la cocina para evitar saturar al personal y no gastar papel térmico, actualizando únicamente la comanda digital y el saldo total de la cuenta.
4. **Recálculo Atómico de Totales y Sincronización en Tiempo Real**:
   - Endpoint `POST /api/orders/:id/append-items` con transacción atómica en PostgreSQL.
   - Si la comanda estaba en estado `preparada` o `lista`, se reabre automáticamente a `en_preparacion` al ingresar nuevos productos de cocina.
   - Sincronización inmediata vía Socket.IO (`orders:sync`, `order:status_updated`) a todos los terminales (Caja, Mesonero, KDS Cocina).

## Sistema de Impresoras Térmicas Duales (Cocina y Caja)
1. **Configuración Centralizada en Panel de Administración (`/menu-admin`)**:
   - Pestaña **`🖨️ IMPRESORAS TÉRMICAS`** para gestionar independientemente:
     - 🍳 **Impresora de Cocina / KDS**: Host IP, Puerto (default 9100), Timeout, Copias y Switch de activación.
     - 💳 **Impresora de Caja / Mostrador**: Host IP, Puerto (default 9100), Timeout, Copias y Switch de activación.
   - Botón **`🧪 IMPRESIÓN DE PRUEBA`** para Cocina, Caja y botón **`🖨️ PROBAR AMBAS`** para comprobación simultánea en vivo.
   - Persistencia segura en `server/config/thermal-printer.json`.
2. **Modal Selector Interactivo de Impresora (`PrinterSelectModal`)**:
   - Al emitir pre-cuentas (`🧾 PRE-CUENTA`) o imprimir reportes contables, el sistema despliega el selector visual con estado en vivo:
     - `🍳 IMPRESORA DE COCINA`
     - `💳 IMPRESORA DE CAJA`
     - `🖨️ IMPRIMIR EN AMBAS IMPRESORAS`
3. **Enrutamiento Inteligente por Defecto**:
   - **Comandas y Adiciones de Cocina**: Enrutadas automáticamente a la **Impresora de Cocina** (con respaldo en Caja si Cocina falla).
   - **Arqueos y Cierres de Turno**: Enrutados automáticamente a la **Impresora de Caja**.
   - **Pre-Cuentas y Reportes**: Permite selección explícita del destino mediante el modal selector.

## Seguridad, Autenticación Obligatoria con JWT y Ciclo de Sesión
1. **Firma Criptográfica JWT (RFC 7519 HMAC-SHA256)**:
   - Los inicios de sesión (`/api/auth/login`) emiten un token JWT estándar firmado con secreto (`CRISPY_JWT_SECRET`) que encapsula la identidad `{ username, role, shift, exp }`.
   - Implementado en `server/helpers/sessionAuth.js` con comparación segura `crypto.timingSafeEqual` para blindar contra ataques de sincronización.
2. **Ciclo de Sesión Efímero en Navegador (`sessionStorage`)**:
   - El token se almacena estrictamente en `window.sessionStorage` (`crispy_user_session`), limpiando residuos de `localStorage`.
   - **Requisito**: Al cerrar la ventana del sistema, apagar la computadora o cerrar el navegador, la sesión expira automáticamente. Al volver a abrir, se exige autenticación.
3. **Protección Integral de API y WebSockets**:
   - Toda petición HTTP bajo `/api` (excepto `/api/auth/login` y `/api/connection-info`) es evaluada por el middleware `requireSession`. Si no se envía un JWT válido, se rechaza con 401 Unauthorized.
   - El handshake de Socket.IO valida el token de sesión. Si es inválido o no existe, deniega la conexión.
4. **Guardias Estrictas de Ruta en Frontend (`App.web.tsx`)**:
   - Los componentes `ProtectedRoute` y `MainAppLayout` evalúan `userSession?.sessionToken`.
   - Si no existe sesión válida, redirige de inmediato a la pantalla de inicio de sesión (`LoginPage`).

## Renovación Mugrosito POS: Menú Admin, Multi-Personalización, Impresoras Duales y Roles

1. **Menú de Administración Renovado (`MenuManagementPage.tsx`)**:
   - **Ingredientes Clasificados**: Selector de 4 tipos: `Proteína`, `Ingrediente Gratuito`, `Adicional con Costo`, `Ingrediente Base`. Precio único en USD para adicionales/proteínas y \$0 para gratuitos y base.
   - **Hamburguesas Sin Imágenes**: Título "NUEVA HAMBURGUESA EN EL MENÚ", precio único en USD, selector de cantidad de proteínas (1, 2, 3 carnes), selección de proteínas por defecto e ingredientes base.
   - **Bebidas y Mesas Limpias**: Sin campos innecesarios, tarjetas blancas limpias, icono `🪑` para mesas, y botones en amarillo Mugrosito (`#facc15`).
   - **Impresoras Duales**: Configuración visual independiente para Cocina (LAN / 80mm) y Caja (USB / 58mm).

2. **Multi-Personalización Táctil de Hamburguesas (`BurgerBuilderModal.tsx`)**:
   - Cuando se solicitan $N$ hamburguesas del mismo tipo (ej. 3 Bistro), la modal presenta pestañas táctiles: `[🍔 #1]`, `[🍔 #2]`, `[🍔 #3]`.
   - Cada hamburguesa se personaliza de forma independiente: cambio de proteínas por carne, ingredientes base retirados ("SIN"), toppings gratuitos (los 5 oficiales), adicionales con costo, entera o picada en dos (`🔪`), y notas específicas de cocina.
   - Botón `Copiar #X a todas`: replica la personalización activa a las demás hamburguesas con un solo toque.
   - **Emisión Inteligente**: Si todas las hamburguesas son idénticas, se consolidan como un solo ítem agrupado (`3x Bistro`); si presentan diferencias, se emiten como ítems diferenciados con etiquetas identificadoras (`[#1]`, `[#2]`, etc.) para máxima claridad en comanda de cocina y caja.

3. **Selector Rápido de Impresora en Envío y Adición**:
   - En `MeseroPage.tsx` y `OrderAppendModal.tsx` se integró el selector táctil de 4 opciones antes de enviar:
     - `🍳 Cocina (LAN / 80mm)`
     - `💳 Caja (USB / 58mm)`
     - `⚡ Ambas`
     - `🚫 No Imprimir`
   - Formateo adaptativo en backend (`thermalPrinter.js`) según el ancho de papel (80mm vs 58mm).

4. **Roles de Usuario, Toma de Pedidos en Caja y Accesos (`LoginPage.tsx`, `CajaPage.tsx`, `App.web.tsx`, `Sidebar.tsx`)**:
   - En `LoginPage.tsx`: botones táctiles de acceso rápido por rol (`👑 Admin`, `💳 Caja`, `🍽️ Mesero`, `🍳 Cocina`) con autocompletado para agilizar el inicio de sesión.
   - En `CajaPage.tsx`: el cajero dispone de la funcionalidad integral para tomar y crear pedidos de cualquier servicio: Salón (clic en cualquier mesa libre), `NUEVO DELIVERY` y `NUEVO PICK UP` en el tablero principal, más botones dedicados `➕ TOMAR PEDIDO` en la barra superior, `➕ CREAR PEDIDO` en la vista detallada y en el Sidebar. Se retiró la etiqueta confusa que decía "🍽️ MESERO" o "cuenta mesero" para consolidar la toma de pedidos como una facultad nativa y directa del cajero.
   - En `App.web.tsx`: alias de ruta `/mesero` redirige a `/mesonero`.

5. **Auditoría Contable y Reportes**:
   - Reportes contables y de ventas de hamburguesas actualizados con identidad Mugrosito POS.
   - Sincronización en tiempo real vía WebSockets en todas las operaciones.

6. **Reglas Contables de Redondeo y Vueltos**:
   - **Cobro**: El valor total a cobrar en Pesos COP se redondea comercialmente al millar superior (`roundCOP(totalUSD * copRate)`). Dicho monto redondeado se imputa como el valor total a cancelar por la comanda, sin generar diferencias ficticias o vueltos fantasma por centavos en el sistema.
   - **Vueltos**: Los vueltos entregados al comensal son **estrictamente exactos**. Nunca se aplica redondeo al alza en los vueltos.
   - **Contravalor en Dólares**: En el registro de movimientos y arqueos de caja, los vueltos en COP y Bs calculan y muestran su equivalente real en USD dividiendo por la tasa correspondiente (`vuelto / tasa`), eliminando registros en \$0.00 USD.
   - **Cierre Inmediato**: Al presionar `FINALIZAR COBRO`, la modal se cierra de forma automática y asienta la venta en el sistema.

7. **Arquitectura de Modales y Experiencia de Usuario**:
   - **Montaje en Raíz (`createPortal`)**: Las modales de personalización (`BurgerBuilderModal`), cobro dividido (`SplitPaymentSelectionModal`) y pasarela de cobro (`PaymentLedgerModal`) se renderizan directamente en `document.body` mediante portales de React, garantizando que ocupen el 100% del viewport sin desplazamientos debajo del Navbar ni cortes en los botones de pie de página.
   - **Identificación de Proteínas Predeterminadas**: Cada slot de carne en el armador de hamburguesas destaca con la insignia `⭐ Original` la proteína correspondiente a la receta de fábrica (ej. Novillo, Pollo Crispy, Chuleta en la 3.0), facilitando el reconocimiento inmediato al mesero frente a modificaciones solicitadas por el cliente.

8. **Reimpresión de Comandas de Cocina con Selección Interactiva de Impresora**:
   - En `CocinaPage.tsx`, el botón de reimpresión de comanda completa abre interactivamente la modal de selección de impresora térmica (`PrinterSelectModal`).
   - Al seleccionar la impresora deseada (Cocina, Caja, etc.), el sistema dispara la impresión inmediata con formato adaptativo según el ancho de papel (80mm o 58mm), calcando el flujo ágil de pre-cuenta y sin requerir pruebas forzadas en impresoras físicas desconectadas.

9. **Tratamiento Contable de Créditos y Reporte de Cierre de Caja**:
   - **Exclusión en Sección 5**: En el reporte de cierre (`reportService.ts`), la Sección 5 (Historial por Método de Pago) excluye los desgloses repetitivos de Efectivo USD y Efectivo COP manteniendo las transferencias y bancos, evitando duplicidad visual.
   - **Crédito en Sección 3 (Desglose por Tipo de Pago)**: Las comandas marcadas a crédito se contabilizan en Sección 3 como un método de pago neto denominado `'Crédito'` con su valor equivalente en \$ USD, permitiendo la auditoría inmediata de las cuentas por cobrar del turno.
   - **Archivado Integral en Arqueo**: Al ejecutar el arqueo de caja, las comandas a crédito se archivan junto con las pagadas de contado, logrando un reinicio total de las mesas y comandas activas sin dejar órdenes rezagadas en el tablero.

10. **Arqueo Rápido de Caja con Confirmación Directa y Reinicio a 0**:
   - En `ArqueoModal.tsx` y backend `/api/caja/cierre`, se eliminó la exigencia de ingresar manualmente conteos físicos obligatorios de dinero.
   - El arqueo muestra un resumen financiero del turno, una advertencia explícita de reinicio de comandas y un campo opcional para notas u observaciones.
   - Al confirmar, el sistema archiva todas las órdenes activas (pagadas y créditos), limpia la comanda activa, reinicia el saldo de caja chica a 0 y deja el sistema completamente limpio para inicializar la contabilidad desde cero al día siguiente.

11. **Escalado Visual de Tipografía (+40%) y Centrado Ergonómico**:
   - Se aplicó un incremento general del 40% en las fuentes (con píxeles adicionales calculados para máxima legibilidad) en los módulos operativos de Mesero (`TableCompactGrid.tsx`, `ProductTextCatalog.tsx`, `MeseroPage.tsx`, `BurgerBuilderModal.tsx`, `DrinkSelectorModal.tsx`, `OrderDetailModal.tsx`, `OrderAppendModal.tsx`).
   - Disposición vertical y centrado horizontal de tarjetas de mesas, pedidos delivery, pick-up, catálogo de comidas/bebidas, y botones de confirmación para facilitar el toque rápido en tablets y pantallas táctiles.
   - La pantalla de cobro (`PaymentLedgerModal.tsx`) fue preservada intacta en su dimensionamiento original por requerimiento funcional estricto.

12. **Tercera Sección de Salsas: Adición Rápida, Exclusión de Pre-cuenta y Regla Estricta en Cocina**:
    - **Tercera Sección en Toma de Pedidos (`ProductTextCatalog.tsx`)**:
      - Debajo de la sección de Comidas y Bebidas, se incorpora la sección `🥣 SALSAS` con filtro dedicado y tarjetas táctiles para adición directa al pedido (+1 por clic).
      - Cada salsa se agrega con precio \$0.00 USD (gratuita / no contable) y se incrementa o decrementa desde el carrito lateral con los controles `+` / `-`.
    - **Adición en Comandas Existentes (`OrderAppendModal.tsx`)**:
      - La modal de adición de ítems a mesas abiertas incorpora idéntica sección de Salsas, permitiendo cargar salsas complementarias a órdenes ya creadas.
    - **Migración Idempotente en Base de Datos (`server/db.js`)**:
      - En el arranque del servidor, se ejecuta un script de migración idempotente con cláusula `ON CONFLICT (id) DO NOTHING;` que inserta las salsas iniciales del restaurante (`ing-salsa-casa`, `ing-salsa-smash`, `ing-salsa-tasty`, `ing-salsa-ajo`, `ing-salsa-bbq`, `ing-salsa-tartara`) categorizadas como `Salsas` y con tipo `salsa`, asegurando que no se dupliquen registros en ningún reinicio o actualización.
    - **Regla Estricta en Comandas Térmicas de Cocina (`server/helpers/thermalPrinter.js`)**:
      - En las comandas de cocina (tanto creación como adición de pedidos), las salsas **SIEMPRE se imprimen al final de la comanda**, después de todas las comidas y bebidas (`consolidateKitchenItems`), garantizando un orden de preparación claro para el personal de plancha.
      - En el monitor de cocina KDS (`CocinaPage.tsx`), los ítems de salsa se ordenan de igual forma al final con la insignia destacada `🥣 SALSA`.
    - **Exclusión Absoluta de la Pre-cuenta**:
      - Tanto en la impresión térmica de pre-cuenta (`server/helpers/thermalPrinter.js` -> `buildReceiptTicket`) como en la pre-visualización HTML (`reportService.ts` -> `generatePreCuentaTicket`), las salsas son filtradas y excluidas al 100% (`!isSalsaItem(it)`), por lo que el comensal no las visualiza en su cuenta ni alteran los subtotales/totales monetarios.
    - **Gestión Administrativa en Menú Admin (`MenuManagementPage.tsx`, `routes/ingredients.js`)**:
      - En la pestaña de Ingredientes se incorpora el tipo `🥣 Salsa` con chip de filtrado y distintivo naranja `🥣 SALSA (NO CONTABLE / COCINA)`.
      - El usuario administrador puede crear y editar salsas definiendo su nombre y un precio referencial (por defecto $0.00), manteniéndose su condición no contable en comandas de cocina.

13. **Experiencia Integral del Cajero, Desacoplamiento de Mesero, Proteínas Dinámicas y Nombres en Mayúsculas**:
    - **Desacoplamiento Total del Botón Mesero para el Cajero**:
      - El rol `caja` no navega a `/mesonero`. Se retiró el botón que llevaba a `/mesonero` tanto de la barra superior de caja como del Sidebar.
      - En `App.web.tsx`, la ruta `/mesonero` está reservada para `allowedRoles={['mesero', 'admin']}`. Si una sesión con rol `caja` intenta acceder a `/mesonero`, el guard de rutas lo redirige automáticamente a `/caja`.
      - En `LoginPage.tsx`, al iniciar sesión como `caja` o `admin`, el sistema redirige inmediatamente a `/caja`.
    - **Toma de Pedidos Nativa en Pantalla de Caja (`OrderCreateView.tsx`, `OrderTargetSelectorModal.tsx`)**:
      - El cajero conserva el 100% de la funcionalidad para tomar y crear pedidos de mesas, delivery y pick-up directamente dentro de `/caja`.
      - Al pulsar `+ TOMAR PEDIDO` (o seleccionar una mesa libre/delivery/pickup en `TableCompactGrid`), se activa `OrderCreateView`, ofreciendo el catálogo táctil completo de hamburguesas, bebidas, salsas, constructor de hamburguesas con proteínas de BD, tarifa de delivery y confirmación de comanda con botón para volver de inmediato al panel de caja sin perder el Navbar ni el Sidebar.
    - **Acceso Visual Libre y Protección de Acciones Críticas con PIN de 4 Dígitos para Cajero**:
      - Para el rol `caja`, el cajero tiene **acceso visual libre y directo** para consultar las pantallas de **Histórico** (auditar cobros y entregas del día) y **Reportes & Cierre** (consultar reportes contables por intervalo, métricas de hamburguesas, ingresos, vueltos y exportar a Excel).
      - **Acciones protegidas obligatoriamente con PIN de seguridad de 4 dígitos**:
        - En **Histórico**: La acción `REACTIVAR COMANDA` exige el PIN de seguridad para evitar reactivaciones indebidas de comandas ya cerradas.
        - En **Reportes & Cierre**: La acción `ARQUEO DIARIO DE EFECTIVO` (cierre de turno y cuadre de caja) exige el PIN de seguridad.
        - Las operaciones administrativas complementarias (Edición de comanda, Anulación, Fusión de comandas y Modificación de Apertura de Caja Chica) continúan bajo protección estricta del PIN de seguridad de 4 dígitos.
    - **Proteínas Dinámicas de Base de Datos (Fin del Hardcoding)**:
      - Se eliminó el hardcoding de proteínas en las hamburguesas (`BurgerBuilderModal.tsx`, `burgerProteins.ts`). El constructor de hamburguesas lee dinámicamente las proteínas registradas en la tabla `ingredients` (`isProtein === true` o categoría `'Proteínas'`).
      - Al editar o renombrar una proteína en el módulo de ingredientes (`server/routes/ingredients.js`), el cambio se propaga y sincroniza automáticamente en `products.base_ingredients` y `products.default_proteins` mediante `array_replace`.
      - En `server/db.js`, la migración idempotente preserva los `default_proteins` modificados por el usuario sin sobreescribirlos con valores de fábrica en cada reinicio.
    - **Auto-migración y Normalización de Nombres a Mayúsculas**:
      - En `server/db.js`, la migración ejecuta la conversión automática a MAYÚSCULAS de todos los productos (`UPDATE products SET name = UPPER(name)`), ingredientes (`UPDATE ingredients SET name = UPPER(name)`), y los arrays de recetas (`default_proteins` y `base_ingredients`).
      - En los endpoints de creación y edición (`server/routes/products.js`, `server/routes/ingredients.js`), todo nuevo producto, ingrediente o receta se persiste de forma normalizada en MAYÚSCULAS.

