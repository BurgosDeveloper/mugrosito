import React, { useState, useEffect } from 'react';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { OrderEditModal } from '../components/OrderEditModal';
import { PaymentLedgerModal } from '../components/PaymentLedgerModal';
import { SplitPaymentSelectionModal } from '../components/SplitPaymentSelectionModal';
import { ExchangeRateModal } from '../components/ExchangeRateModal';
import { AdminPinModal } from '../components/AdminPinModal';
import { OrderServiceTransferModal } from '../components/OrderServiceTransferModal';
import { OrderAppendModal } from '../components/OrderAppendModal';
import { PrinterSelectModal } from '../components/PrinterSelectModal';
import { TableCompactGrid } from '../modules/mesero/TableCompactGrid';
import { OrderCreateView, OrderTarget } from '../modules/mesero/OrderCreateView';
import { OrderTargetSelectorModal } from '../components/OrderTargetSelectorModal';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PaymentMethod, Order } from '../data/mockData';
import { reportService } from '../services/reportService';
import { exportToExcel, ReporteIntervaloData } from '../services/excelExportService';
import { roundCOP } from '../utils/currencyRounding';
import { areProteinsDefault, getCleanItemNote, formatRemovedIngredients } from '../utils/burgerProteins';
import {
  IoCard,
  IoCashOutline,
  IoCheckmarkDone,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoBarChartOutline,
  IoLockClosedOutline,
  IoDocumentTextOutline,
  IoTrendingUp,
  IoPersonOutline,
  IoSwapHorizontal,
  IoTrashOutline,
  IoPrintOutline,
} from 'react-icons/io5';

const HISTORIC_PAYMENT_METHODS: PaymentMethod[] = [
  'Efectivo USD', 'Zelle', 'Binance', 'Efectivo COP', 'Bancolombia', 'Nequi',
  'Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito', 'Mixto', 'Crédito',
];
const PHYSICAL_CASH_METHODS = new Set(['Efectivo USD', 'Efectivo COP']);

function paymentMovementLabels(payment: Order['paymentHistory'][number]) {
  const labels: string[] = [];
  if ((payment.cashTenderedUSD || 0) > 0) labels.push(`Entregó: $${payment.cashTenderedUSD!.toFixed(2)} USD`);
  if ((payment.cashTenderedCOP || 0) > 0) labels.push(`Entregó: ${payment.cashTenderedCOP!.toLocaleString()} COP`);
  if ((payment.cashTenderedBs || 0) > 0) labels.push(`Entregó: ${payment.cashTenderedBs!.toLocaleString()} Bs`);
  if ((payment.changeGivenUSD || 0) > 0) labels.push(`Vuelto: $${payment.changeGivenUSD!.toFixed(2)} USD`);
  if ((payment.changeGivenCOP || 0) > 0) labels.push(`Vuelto: ${payment.changeGivenCOP!.toLocaleString()} COP`);
  if ((payment.changeGivenBs || 0) > 0) labels.push(`Vuelto: ${payment.changeGivenBs!.toLocaleString()} Bs`);
  return labels;
}

export const CajaPage: React.FC = () => {
  const {
    tables,
    orders,
    exchangeRates,
    cajaChicaApertura,
    cajaChicaTransactions,
    updateOrderStatus,
    deleteOrder,
    aperturarCajaChica,
    addCajaTransaction,
    realizarCierreCaja,
    fetchReporteIntervalo,
    printReporteIntervalo,
    printOrderReceipt,
    reprintKitchenOrder,
    userSession,
    editOrder,
    deletePaymentEntry,
    reopenOrder,
    expandOrderItemsForSplit,
    products,
    ingredients,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSubTab = searchParams.get('tab') || 'comandas';
  const [cajaViewMode, setCajaViewMode] = useState<'tablero' | 'lista'>('tablero');

  // Toma de Pedidos Nativa en Caja
  const [activeOrderTarget, setActiveOrderTarget] = useState<OrderTarget | null>(null);
  const [isTargetSelectorOpen, setIsTargetSelectorOpen] = useState<boolean>(false);

  const filteredCajaTransactions = cajaChicaTransactions.filter(t => !t.shift || t.shift === 'ambos' || t.shift === userSession?.shift);
  const filteredApertura = cajaChicaApertura.shift && cajaChicaApertura.shift !== 'ambos' && cajaChicaApertura.shift !== userSession?.shift ? { usdCash: 0, copCash: 0 } : cajaChicaApertura;
  const isFirstApertura = !filteredApertura.openedAt && filteredApertura.usdCash === 0 && filteredApertura.copCash === 0;

  const [activeOrderForPay, setActiveOrderForPay] = useState<Order | null>(null);
  const [orderAppendModalOrder, setOrderAppendModalOrder] = useState<Order | null>(null);
  const [orderEditModalOrder, setOrderEditModalOrder] = useState<Order | null>(null);
  const [orderDetailModalOrder, setOrderDetailModalOrder] = useState<Order | null>(null);
  const [printerSelectOrder, setPrinterSelectOrder] = useState<Order | null>(null);
  const [printerSelectKitchenOrder, setPrinterSelectKitchenOrder] = useState<Order | null>(null);
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState<boolean>(false);
  const [isCompactView, setIsCompactView] = useState<boolean>(() => {
    return localStorage.getItem('mugrosito_caja_view_mode') !== 'expanded';
  });
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const toggleExpandOrder = (orderId: string) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  // States para confirmación e impresión de reportes de intervalo
  const [pendingReportChoice, setPendingReportChoice] = useState<{
    type: 'contable' | 'pizzas' | 'ingresos' | 'egresos' | 'cocina';
    title: string;
    generator: () => void;
  } | null>(null);

  const [printerSelectReport, setPrinterSelectReport] = useState<{
    type: 'contable' | 'pizzas' | 'ingresos' | 'egresos' | 'cocina';
    title: string;
    generator: () => void;
  } | null>(null);

  // Security PIN Modal State for Cashier Authorizations
  const [pinModalState, setPinModalState] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    actionName: string;
    onSuccess: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionName: '',
    onSuccess: () => {},
  });

  const requireAdminPin = (actionName: string, title: string, callback: () => void, description?: string) => {
    if (userSession?.role === 'admin') {
      callback();
    } else {
      setPinModalState({
        isOpen: true,
        title: title || '🔐 AUTORIZACIÓN DE ADMINISTRADOR',
        description: description || 'Ingrese el PIN de seguridad de 4 dígitos para autorizar:',
        actionName,
        onSuccess: callback,
      });
    }
  };

  // Multi-Order Table Payment & Merge state
  const [selectedOrderIdsForMultiPay, setSelectedOrderIdsForMultiPay] = useState<string[]>([]);

  // Pago dividido por ítems y persona.
  const [splitPaymentSelectionOrder, setSplitPaymentSelectionOrder] = useState<Order | null>(null);
  const [splitPaymentScope, setSplitPaymentScope] = useState<{ payerName: string; itemIds: string[] } | null>(null);
  const [isEditingSplitPayment, setIsEditingSplitPayment] = useState(false);

  // Modal de Cambio de Mesa
  const [tableChangeOrder, setTableChangeOrder] = useState<Order | null>(null);

  // Apertura de Caja Chica Modal
  const [isAperturaModalOpen, setIsAperturaModalOpen] = useState<boolean>(false);
  const [initUSD, setInitUSD] = useState<string>('');
  const [initCOP, setInitCOP] = useState<string>('');

  const handleOpenAperturaModal = () => {
    setInitUSD(filteredApertura.usdCash > 0 ? filteredApertura.usdCash.toString() : (filteredApertura.usdCash === 0 ? '0' : ''));
    setInitCOP(filteredApertura.copCash > 0 ? filteredApertura.copCash.toString() : (filteredApertura.copCash === 0 ? '0' : ''));
    setIsAperturaModalOpen(true);
  };

  useEffect(() => {
    if (isAperturaModalOpen) {
      setInitUSD(filteredApertura.usdCash > 0 ? filteredApertura.usdCash.toString() : (filteredApertura.usdCash === 0 ? '0' : ''));
      setInitCOP(filteredApertura.copCash > 0 ? filteredApertura.copCash.toString() : (filteredApertura.copCash === 0 ? '0' : ''));
    }
  }, [isAperturaModalOpen, filteredApertura.usdCash, filteredApertura.copCash]);

  // Cierre y Arqueo de Caja Chica Modal
  const [isCierreModalOpen, setIsCierreModalOpen] = useState<boolean>(false);
  const [cierreNotes, setCierreNotes] = useState<string>('');
  const [cierreError, setCierreError] = useState<string>('');
  const [isSubmittingCierre, setIsSubmittingCierre] = useState<boolean>(false);

  // Transaccion Manual Egreso / Ingreso
  const [isManualTxOpen, setIsManualTxOpen] = useState<boolean>(false);
  const [manualType, setManualType] = useState<'ingreso' | 'egreso'>('egreso');
  const [manualAmountUSD, setManualAmountUSD] = useState<string>('');
  const [manualCurrency, setManualCurrency] = useState<'USD' | 'COP' | 'Bs'>('USD');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<PaymentMethod>('Efectivo USD');
  const [manualDesc, setManualDesc] = useState<string>('');

  // Paginación para listas largas (Caja Chica e Histórico)
  const [cajaTxPage, setCajaTxPage] = useState<number>(1);
  const CAJA_TX_PAGE_SIZE = 10;
  const [historicoPage, setHistoricoPage] = useState<number>(1);
  const HISTORICO_PAGE_SIZE = 10;

  // Reporte por Intervalo State
  const [intervaloFrom, setIntervaloFrom] = useState<string>('');
  const [intervaloTo, setIntervaloTo] = useState<string>('');
  const [reporteIntervaloData, setReporteIntervaloData] = useState<ReporteIntervaloData | null>(null);
  const [isLoadingReporte, setIsLoadingReporte] = useState<boolean>(false);
  const [reporteError, setReporteError] = useState<string>('');

  // Comandas activas no finalizadas/pagadas totalmente (excluye canceladas, fusionadas, pagadas y créditos ya entregados)
  const activeComandas = orders.filter(
    (o) => o.status !== 'cancelado' && o.status !== 'fusionada' && !(o.status === 'entregada' && (o.paymentStatus === 'pagado' || o.paymentStatus === 'credito')) && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift)
  );
  const paidOrdersToday = orders.filter((o) => (o.paymentStatus === 'pagado' || o.paymentStatus === 'credito') && (!o.shift || o.shift === 'ambos' || o.shift === userSession?.shift));

  // Historico Filters
  const [historicoSearch, setHistoricoSearch] = useState<string>('');
  const [historicoMethodFilter, setHistoricoMethodFilter] = useState<'todos' | PaymentMethod>('todos');
  const [historicDetailOrder, setHistoricDetailOrder] = useState<Order | null>(null);

  const { mergeOrders } = useApp();

  const handleOpenPayModal = (order: Order) => {
    const hasSplit = (order.paymentHistory || []).some(
      (p) => Array.isArray(p.itemIds) && p.itemIds.length > 0
    ) || (order.items || []).some((it) => it.isPaidIndividually);

    if (hasSplit) {
      handleOpenSplitItemsModal(order);
      return;
    }
    setSplitPaymentScope(null);
    setActiveOrderForPay(order);
  };

  const handleToggleOrderForMultiPay = (id: string) => {
    setSelectedOrderIdsForMultiPay((prev) =>
      prev.includes(id) ? prev.filter((oId) => oId !== id) : [...prev, id]
    );
  };

  const handleOpenSplitItemsModal = async (order: Order) => {
    const hasGeneral = (order.paymentHistory || []).some(
      (p) => (!Array.isArray(p.itemIds) || p.itemIds.length === 0) &&
             ((p.amountPaidUSD || 0) > 0 || (p.cashTenderedCOP || 0) > 0 || (p.cashTenderedUSD || 0) > 0 || (p.cashTenderedBs || 0) > 0)
    );
    if (hasGeneral) {
      alert('Esta comanda ya tiene abonos generales registrados. Debes continuar el cobro desde la opción COBRAR.');
      return;
    }
    setSplitPaymentScope(null);
    setIsEditingSplitPayment(false);

    // Si la orden tiene ítems con cantidad > 1, expandirlos en filas individuales de 1x para cobro por persona
    const hasMultiQuantity = (order.items || []).some((it) => (Number(it.quantity) || 1) > 1);
    if (hasMultiQuantity && expandOrderItemsForSplit) {
      try {
        const expanded = await expandOrderItemsForSplit(order.id);
        if (expanded) {
          setSplitPaymentSelectionOrder(expanded);
          return;
        }
      } catch (err) {
        console.warn('Aviso: no se pudo expandir ítems en servidor:', err);
      }
    }
    setSplitPaymentSelectionOrder(order);
  };

  const handleConfirmSplitPaymentSelection = (payerName: string, itemIds: string[]) => {
    if (!splitPaymentSelectionOrder || itemIds.length === 0 || !payerName) return;
    setSplitPaymentScope({ payerName, itemIds });
    setIsEditingSplitPayment(false);
    setSplitPaymentSelectionOrder(null);
    setActiveOrderForPay(splitPaymentSelectionOrder);
  };

  const handleCancelSplitPaymentSelection = () => {
    const orderToResume = splitPaymentSelectionOrder;
    setSplitPaymentSelectionOrder(null);
    if (isEditingSplitPayment && splitPaymentScope && orderToResume) {
      setActiveOrderForPay(orderToResume);
    } else {
      setSplitPaymentScope(null);
    }
    setIsEditingSplitPayment(false);
  };

  const handleEditSplitPaymentSelection = async (order: Order) => {
    setActiveOrderForPay(null);
    setIsEditingSplitPayment(true);

    const hasMultiQuantity = (order.items || []).some((it) => (Number(it.quantity) || 1) > 1);
    if (hasMultiQuantity && expandOrderItemsForSplit) {
      try {
        const expanded = await expandOrderItemsForSplit(order.id);
        if (expanded) {
          setSplitPaymentSelectionOrder(expanded);
          return;
        }
      } catch (err) {
        console.warn('Aviso: no se pudo expandir ítems en edición:', err);
      }
    }
    setSplitPaymentSelectionOrder(order);
  };

  const handleClosePaymentLedger = () => {
    setActiveOrderForPay(null);
    setSplitPaymentScope(null);
  };

  const handleConfirmMergeOrders = async () => {
    if (selectedOrderIdsForMultiPay.length < 2) return;
    const [target, ...sources] = selectedOrderIdsForMultiPay;
    await mergeOrders(target, sources);
    setSelectedOrderIdsForMultiPay([]);
  };

  const handleAperturaSubmit = async () => {
    await aperturarCajaChica(parseFloat(initUSD) || 0, parseFloat(initCOP) || 0);
    setIsAperturaModalOpen(false);
  };

  const handleCierreSubmit = async () => {
    if (isSubmittingCierre) return;
    setIsSubmittingCierre(true);
    setCierreError('');
    try {
      await realizarCierreCaja(
        saldoEfectivoUSD,
        saldoEfectivoCOP,
        cierreNotes || 'Arqueo y reinicio de caja realizado'
      );
      setIsCierreModalOpen(false);
      setCierreNotes('');
    } catch (error) {
      setCierreError(error instanceof Error ? error.message : 'No se pudo registrar el arqueo y reinicio de caja.');
    } finally {
      setIsSubmittingCierre(false);
    }
  };

  const handleManualTxSubmit = async () => {
    const amount = parseFloat(manualAmountUSD);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const doSubmit = async () => {
      await addCajaTransaction({
        type: manualType,
        amountUSD: manualCurrency === 'USD' ? amount : 0,
        amountCOP: manualCurrency === 'COP' ? amount : 0,
        amountBs: manualCurrency === 'Bs' ? amount : 0,
        paymentMethod: manualPaymentMethod,
        description: manualDesc || (manualType === 'egreso' ? 'Vuelto / Cambio entregado' : 'Ingreso manual'),
      });
      setManualAmountUSD('');
      setManualCurrency('USD');
      setManualPaymentMethod('Efectivo USD');
      setManualDesc('');
      setIsManualTxOpen(false);
    };

    if (userSession?.role === 'caja') {
      const formattedAmount = manualCurrency === 'USD'
        ? `$${amount.toFixed(2)} USD`
        : manualCurrency === 'COP'
        ? `$${Math.round(amount).toLocaleString()} COP`
        : `Bs ${amount.toFixed(2)}`;
      requireAdminPin(
        `Registrar ${manualType === 'egreso' ? 'Egreso' : 'Ingreso'} (${formattedAmount})`,
        `🔐 CONFIRMAR ${manualType === 'egreso' ? 'EGRESO' : 'INGRESO'} MANUAL`,
        doSubmit,
        `Ingrese el PIN de seguridad de 4 dígitos para autorizar este ${manualType === 'egreso' ? 'egreso' : 'ingreso'} de ${formattedAmount} en caja chica:`
      );
    } else {
      await doSubmit();
    }
  };

  // Totales de Caja Chica
  const physicalCashTransactions = filteredCajaTransactions.filter((transaction) => PHYSICAL_CASH_METHODS.has(transaction.paymentMethod));

  const totalIngresosUSD = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountUSD, 0);

  const totalIngresosCOP = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountCOP, 0);

  const totalIngresosBs = filteredCajaTransactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amountBs, 0);

  const cashIngresosUSD = physicalCashTransactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + transaction.amountUSD, 0);

  const cashIngresosCOP = physicalCashTransactions
    .filter((transaction) => transaction.type === 'ingreso')
    .reduce((sum, transaction) => sum + transaction.amountCOP, 0);

  const cashEgresosUSD = physicalCashTransactions
    .filter((transaction) => transaction.type === 'egreso')
    .reduce((sum, transaction) => sum + transaction.amountUSD, 0);

  const cashEgresosCOP = physicalCashTransactions
    .filter((transaction) => transaction.type === 'egreso')
    .reduce((sum, transaction) => sum + transaction.amountCOP, 0);

  const saldoEfectivoUSD = filteredApertura.usdCash + cashIngresosUSD - cashEgresosUSD;
  const saldoEfectivoCOP = filteredApertura.copCash + cashIngresosCOP - cashEgresosCOP;

  const handleSelectSubTab = (tab: string) => {
    setSearchParams({ tab });
    if (tab === 'comandas') {
      setCajaViewMode('tablero');
    }
  };

  return (
    <div className="p-2.5 sm:p-3 w-full h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-gray-100 text-gray-900 space-y-2">
      {/* Header & Sub-Tabs Compact Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-white border border-gray-200 shadow-xs shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-yellow-400 border border-yellow-500 flex items-center justify-center text-black shadow-xs font-black">
            <IoCard className="text-lg" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <h1 className="text-sm font-black tracking-tight text-black">Caja POS</h1>
              <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-900 border border-green-300 text-[9px] font-black uppercase">
                EN VIVO
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Tab Selector & Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleSelectSubTab('comandas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'comandas' || activeSubTab === 'default'
                ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            <IoCard />
            <span>COMANDAS ({activeComandas.length})</span>
          </button>

          <button
            onClick={() => handleSelectSubTab('cajachica')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'cajachica'
                ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            <IoCashOutline />
            <span>CAJA CHICA</span>
          </button>

          <button
            onClick={() => handleSelectSubTab('historico')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'historico'
                ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            <IoTimeOutline />
            <span>HISTÓRICO ({paidOrdersToday.length})</span>
          </button>

          <button
            onClick={() => handleSelectSubTab('reportes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeSubTab === 'reportes'
                ? 'bg-yellow-400 text-black border border-yellow-500 shadow-xs'
                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            <IoBarChartOutline />
            <span>REPORTES & CIERRE</span>
          </button>

          <button
            onClick={() => setIsTargetSelectorOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 shadow-xs cursor-pointer"
            title="Crear y tomar nuevos pedidos para mesas, delivery o pick-up"
          >
            <span>📝</span>
            <span>+ TOMAR PEDIDO</span>
          </button>

          {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
            <button
              onClick={() => setIsExchangeModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 shadow-xs cursor-pointer"
              title="Actualizar tasas de cambio del turno (COP y Bs)"
            >
              <IoSwapHorizontal className="text-yellow-600" />
              <span>💱 TASAS</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: COMANDAS (TABLERO UNIFICADO EN 3 SECCIONES, VISTA DETALLADA O TOMA DE PEDIDOS) */}
      {(activeSubTab === 'comandas' || activeSubTab === 'default') && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeOrderTarget ? (
            <OrderCreateView
              target={activeOrderTarget}
              onClose={() => setActiveOrderTarget(null)}
            />
          ) : cajaViewMode === 'tablero' ? (
            <TableCompactGrid
              tables={tables}
              orders={orders}
              onSelectTarget={(type, tableNumber) => {
                setActiveOrderTarget({
                  type,
                  tableNumber,
                  title: type === 'mesa' ? `Mesa #${tableNumber}` : (type === 'delivery' ? 'Delivery' : 'Para Llevar (Pick-Up)')
                });
              }}
              onViewActiveOrder={(ord) => setOrderDetailModalOrder(ord)}
              onAppendOrder={(ord) => setOrderAppendModalOrder(ord)}
              canPay={true}
              onPayOrder={(ord) => handleOpenPayModal(ord)}
              onMarkDelivered={async (ord) => {
                await updateOrderStatus(ord.id, 'entregada');
                setOrderDetailModalOrder(null);
              }}
              onPrintReceipt={(ord) => setPrinterSelectOrder(ord)}
              onViewHistory={() => setCajaViewMode('lista')}
            />
          ) : (
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between pb-2 border-b border-gray-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setCajaViewMode('tablero')}
                  className="px-3 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white font-black text-xs transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <span>⬅️</span>
                  <span>VOLVER AL TABLERO (MESAS Y PEDIDOS)</span>
                </button>
                <div className="text-xs font-bold text-gray-500">
                  Total de Comandas: {activeComandas.length}
                </div>
              </div>
          {/* Order merge action bar */}
          {selectedOrderIdsForMultiPay.length > 0 && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black flex items-center justify-between shadow-2xl">
              <div className="flex items-center gap-3">
                <IoCard className="text-2xl shrink-0" />
                <div>
                  <div className="font-black text-sm">
                    {selectedOrderIdsForMultiPay.length} COMANDAS SELECCIONADAS PARA UNIFICAR
                  </div>
                  <div className="text-xs font-bold">
                    La primera comanda seleccionada será la comanda máster.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedOrderIdsForMultiPay([])}
                  className="px-3 py-1.5 rounded-xl bg-black/20 text-black font-bold text-xs hover:bg-black/30"
                >
                  DESMARCAR
                </button>
                {selectedOrderIdsForMultiPay.length >= 2 && (
                  <button
                    onClick={() => {
                      requireAdminPin(
                        `Unificar ${selectedOrderIdsForMultiPay.length} Comandas`,
                        'Autorizar Fusión de Comandas',
                        handleConfirmMergeOrders
                      );
                    }}
                    className="px-4 py-2.5 rounded-xl bg-purple-900 text-purple-200 font-black text-xs hover:bg-purple-800 shadow-xl border border-purple-500/40 flex items-center gap-1.5"
                  >
                    <span>🔗 UNIFICAR EN 1 COMANDA MÁSTER</span>
                    {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-400 text-xs" />}
                  </button>
                )}
              </div>

            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <IoCard className="text-yellow-600 text-xl" />
              <span>COMANDAS ACTIVAS EN SISTEMA</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Selector de Modo de Vista (Tarea 4) */}
              <button
                type="button"
                onClick={() => {
                  const next = !isCompactView;
                  setIsCompactView(next);
                  localStorage.setItem('mugrosito_caja_view_mode', next ? 'compact' : 'expanded');
                }}
                className={`px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 border transition-all cursor-pointer shadow-xs ${
                  isCompactView
                    ? 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
                title="Alternar vista compacta (50+ comandas) vs vista detallada"
              >
                <span>👁️</span>
                <span>{isCompactView ? 'Modo Compacto (50+)' : 'Modo Detallado'}</span>
              </button>

              <button
                onClick={() => setIsTargetSelectorOpen(true)}
                className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center gap-2 border border-yellow-500 shadow-sm transition-all cursor-pointer"
                title="Tomar y crear nuevos pedidos para mesas, delivery o pick-up"
              >
                <span>➕ CREAR PEDIDO</span>
              </button>

              <span className="text-xs text-gray-500 font-bold bg-gray-100 px-2.5 py-1.5 rounded-xl border border-gray-200">
                Total: {activeComandas.length}
              </span>
            </div>
          </div>

          {activeComandas.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-xs space-y-3">
              <IoCheckmarkDone className="text-4xl text-yellow-500 mx-auto" />
              <p className="text-xs text-gray-500 font-bold">No hay comandas pendientes por cobrar en este momento.</p>
              <button
                onClick={() => setIsTargetSelectorOpen(true)}
                className="px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs inline-flex items-center gap-2 border border-yellow-500 shadow-sm transition-all cursor-pointer"
              >
                <span>➕ Tomar Primer Pedido</span>
              </button>
            </div>
          ) : isCompactView ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {activeComandas.map((ord) => {
                const isPrepared = ord.status === 'preparada' || ord.status === 'entregada';
                const isPaid = ord.paymentStatus === 'pagado';
                const isDelivered = ord.status === 'entregada';
                const isSelectedForMultiPay = selectedOrderIdsForMultiPay.includes(ord.id);
                const isExpanded = expandedOrderIds.includes(ord.id);
                const paid = ord.paidAmountUSD || 0;
                const remaining = Math.max(0, ord.totalUSD - paid);
                const isDelivery = ord.type === 'delivery';
                const titleText = ord.type === 'mesa'
                  ? `Mesa #${ord.tableNumber}`
                  : (ord.customerName || (isDelivery ? 'Delivery' : 'Para Llevar'));

                if (!isExpanded) {
                  // MINICOMANDA: Solo número de mesa o nombre delivery/pickup, 3 montos en cada moneda y botón ojo que expande
                  return (
                    <div
                      key={ord.id}
                      className={`p-3.5 rounded-2xl border flex flex-col justify-between shadow-xs transition-all ${
                        isSelectedForMultiPay
                          ? 'bg-yellow-100 border-2 border-yellow-500 ring-2 ring-yellow-400'
                          : isPaid
                          ? 'bg-green-50/50 border-green-300'
                          : isPrepared
                          ? 'bg-yellow-50/60 border-yellow-400'
                          : 'bg-white border-gray-200 hover:border-yellow-400 hover:shadow-sm'
                      }`}
                    >
                      {/* Cabecera: Mesa/Nombre y Botón Ojo */}
                      <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-gray-100">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!isPaid && (
                            <input
                              type="checkbox"
                              checked={isSelectedForMultiPay}
                              onChange={() => handleToggleOrderForMultiPay(ord.id)}
                              className="w-4 h-4 accent-yellow-500 rounded cursor-pointer shrink-0"
                              title="Seleccionar para cobrar varias"
                            />
                          )}
                          <span className="text-base font-black text-black truncate" title={titleText}>
                            {titleText}
                          </span>
                        </div>

                        {/* Botón Ojito que expande esta comanda en el sitio */}
                        <button
                          type="button"
                          onClick={() => toggleExpandOrder(ord.id)}
                          className="px-2 py-1 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs transition-all border border-yellow-500 shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                          title="Expandir comanda completa"
                        >
                          <span>👁️</span>
                          <span className="text-[10px] font-extrabold">Ver</span>
                        </button>
                      </div>

                      {/* Los 3 montos en cada moneda */}
                      <div className="pt-2 space-y-1">
                        {(() => {
                          const totalCOP = ord.totalCOP || roundCOP(ord.totalUSD * exchangeRates.COP);
                          const totalUSD = ord.totalCOP ? (ord.totalCOP / (exchangeRates.COP || 3100)) : ord.totalUSD;
                          const totalBs = ord.totalCOP ? (ord.totalCOP / (exchangeRates.Bs || 3.2)) : ((ord.totalUSD * (exchangeRates.COP || 3100)) / (exchangeRates.Bs || 3.2));
                          return (
                            <>
                              <div className="text-lg font-black text-black leading-tight">
                                {Math.round(totalCOP).toLocaleString('es-CO')} <span className="text-xs font-bold text-gray-500">COP</span>
                              </div>
                              <div className="text-xs font-bold text-gray-700">
                                🇺🇸 ${totalUSD.toFixed(2)} USD
                              </div>
                              <div className="text-xs font-bold text-gray-700">
                                🇻🇪 {totalBs.toFixed(2)} Bs
                              </div>
                            </>
                          );
                        })()}
                      </div>

                      {/* Si ya está pagada y no entregada, botón rápido para marcarla como entregada y quitarla de pantalla */}
                      {isPaid && !isDelivered && (
                        <div className="pt-2 border-t border-gray-100 mt-2">
                          <button
                            type="button"
                            onClick={() => updateOrderStatus(ord.id, 'entregada')}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer animate-pulse"
                            title="Marcar como entregada para finalizar y quitar de activas"
                          >
                            <IoCheckmarkDone className="text-base" />
                            <span>📦 MARCAR ENTREGADA</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // SI ESTÁ EXPANDIDA: Muestra la comanda en modo completo con botón de Colapsar
                return (
                  <div
                    key={ord.id}
                    className={`col-span-1 md:col-span-2 p-4 rounded-2xl border shadow-md space-y-3 transition-all ${
                      isSelectedForMultiPay
                        ? 'bg-yellow-100 border-2 border-yellow-500 ring-2 ring-yellow-400'
                        : isPaid
                        ? 'bg-white border-green-300'
                        : isPrepared
                        ? 'bg-yellow-50/50 border-yellow-400'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {/* Header line con botón Colapsar */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-200 gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isPaid && (
                          <input
                            type="checkbox"
                            checked={isSelectedForMultiPay}
                            onChange={() => handleToggleOrderForMultiPay(ord.id)}
                            className="w-4 h-4 accent-yellow-500 rounded cursor-pointer"
                            title="Seleccionar para unificar comandas"
                          />
                        )}
                        <span className="text-2xl font-black text-black tracking-wide">#{ord.orderNumber}</span>
                        <span className="text-xs px-2.5 py-0.5 rounded-lg bg-yellow-400 text-black border border-yellow-500 font-black uppercase">
                          {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : (ord.type || 'mesa').toUpperCase()}
                        </span>
                        {ord.type === 'mesa' && !isPaid && !isDelivered && (
                          <button
                            type="button"
                            onClick={() => setTableChangeOrder(ord)}
                            className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-[10px] font-black flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                            title="Reubicar o cambiar mesa de salón"
                          >
                            <IoSwapHorizontal />
                            <span>Cambiar Mesa</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Botón Colapsar */}
                        <button
                          type="button"
                          onClick={() => toggleExpandOrder(ord.id)}
                          className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-yellow-400 text-black font-black text-xs transition-all border border-gray-300 hover:border-yellow-500 shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                          title="Colapsar a minicomanda"
                        >
                          <span>👁️</span>
                          <span className="text-[10px] font-extrabold">Colapsar</span>
                        </button>

                        {/* Dual Status Badges */}
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                              isPrepared
                                ? 'bg-green-100 text-green-900 border-green-300'
                                : 'bg-yellow-100 text-yellow-900 border-yellow-300 animate-pulse'
                            }`}
                          >
                            {isPrepared ? <IoCheckmarkCircle className="text-green-700" /> : <IoTimeOutline className="text-yellow-700" />}
                            <span>{isDelivered ? '📦 ENTREGADA' : isPrepared ? '🔥 LISTA' : '⏳ EN COCINA'}</span>
                          </span>

                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                              ord.paymentStatus === 'credito'
                                ? 'bg-yellow-100 text-yellow-900 border-yellow-400'
                                : isPaid
                                ? 'bg-green-100 text-green-900 border-green-300'
                                : 'bg-red-100 text-red-900 border-red-300'
                            }`}
                          >
                            {ord.paymentStatus === 'credito' ? (
                              <span>⚠️ A CRÉDITO</span>
                            ) : isPaid ? (
                              <>
                                <IoCard />
                                <span>💳 PAGADO</span>
                              </>
                            ) : (
                              <>
                                <IoCloseCircle />
                                <span>❌ PENDIENTE PAGO</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-800 font-extrabold break-words flex items-center gap-1.5">
                      <IoPersonOutline className="text-gray-500" />
                      <span>Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                    </p>

                    {ord.kitchenNotes && (
                      <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-gray-800 font-medium break-words flex items-start gap-1.5">
                        <IoDocumentTextOutline className="mt-0.5 shrink-0 text-yellow-700" />
                        <div><span className="font-bold">Nota Cocina:</span> {ord.kitchenNotes}</div>
                      </div>
                    )}

                    {/* Order Items Breakdown */}
                    <div className="space-y-1 bg-gray-50 p-2.5 rounded-xl border border-gray-200 max-h-44 overflow-y-auto">
                      {(ord.items || []).map((it) => (
                        <div key={it.id} className="space-y-0.5 text-xs border-b border-gray-100 pb-1 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start font-bold text-gray-900 gap-2">
                            <span className="break-words flex-1 flex items-center gap-1 text-xs">
                              <span className="font-black text-black">• {it.quantity}x</span>
                              <span className="font-bold">{it.productName}</span>
                              {it.isTakeaway && <span className="text-amber-700 font-bold ml-1 text-[10px]">(📦 LLEVAR)</span>}
                              {(it.isCut || it.cutPreference === 'Picada') ? (
                                <span className="text-red-700 font-black ml-1 text-[10px]">(🔪 PICADA)</span>
                              ) : (
                                <span className="text-gray-600 font-bold ml-1 text-[10px]">(🌭 ENTERO)</span>
                              )}
                              {it.isPaidIndividually && (
                                <span className="px-1.5 py-0.5 rounded bg-green-100 border border-green-300 text-green-900 text-[9px] font-black uppercase">
                                  ✓ PAGADO
                                </span>
                              )}
                            </span>
                            <span className="text-black font-black text-xs shrink-0">
                              {it.price >= 100
                                ? `${Math.round(it.price * it.quantity).toLocaleString('es-CO')} COP`
                                : `$${(it.price * it.quantity).toFixed(2)}`}
                            </span>
                          </div>

                          {it.sugarPreference && (
                            <p className="text-[10px] text-blue-700 font-bold ml-2">
                              🥤 Azúcar: {it.sugarPreference}
                            </p>
                          )}

                          {it.flavor && (
                            <p className="text-[10px] text-amber-800 font-bold ml-2">
                              🍹 Sabor: {it.flavor}
                            </p>
                          )}

                          {it.proteins && it.proteins.length > 0 && !areProteinsDefault(it.productName, it.proteins) && (
                            <p className="text-[10px] text-amber-800 font-bold ml-2">
                              🥩 Proteínas: {it.proteins.join(' + ')}
                            </p>
                          )}

                          {it.removedIngredients && it.removedIngredients.length > 0 && (
                            <p className="text-[10px] text-red-600 font-bold ml-2">
                              🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                            </p>
                          )}

                          {it.extras && it.extras.length > 0 && (
                            <div className="ml-2 text-[10px] text-gray-700 font-bold space-y-0.5">
                              {it.extras.map((ex, exIdx) => (
                                <div key={exIdx} className="flex justify-between">
                                  <span>➕ ADD: {ex.name}</span>
                                  {ex.price > 0 && <span>+${ex.price.toFixed(2)}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {getCleanItemNote(it.notes) && (
                            <p className="text-[10px] text-amber-900 font-bold ml-2">
                              📝 NOTA: {getCleanItemNote(it.notes)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Pricing breakdown & Multi-currency display */}
                    <div className="pt-2 border-t border-gray-200">
                      {(() => {
                        const totalCOP = ord.totalCOP || roundCOP(ord.totalUSD * exchangeRates.COP);
                        const totalUSD = ord.totalCOP ? (ord.totalCOP / (exchangeRates.COP || 3100)) : ord.totalUSD;
                        const totalBs = ord.totalCOP ? (ord.totalCOP / (exchangeRates.Bs || 3.2)) : ((ord.totalUSD * (exchangeRates.COP || 3100)) / (exchangeRates.Bs || 3.2));

                        return (
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs font-black text-gray-700 uppercase">Total Comanda:</span>
                            <div className="text-right">
                              <span className="text-xl font-black text-black">
                                {Math.round(totalCOP).toLocaleString('es-CO')} COP
                              </span>
                              <div className="text-xs font-bold text-gray-700">
                                🇺🇸 ${totalUSD.toFixed(2)} USD | 🇻🇪 {totalBs.toFixed(2)} Bs
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                      {!isPaid ? (
                        (() => {
                          const hasSplitPayments = (ord.paymentHistory || []).some(
                            (p) => Array.isArray(p.itemIds) && p.itemIds.length > 0
                          ) || (ord.items || []).some((it) => it.isPaidIndividually);

                          const hasGeneralPayments = (ord.paymentHistory || []).some(
                            (p) => (!Array.isArray(p.itemIds) || p.itemIds.length === 0) &&
                                   ((p.amountPaidUSD || 0) > 0 || (p.cashTenderedCOP || 0) > 0 || (p.cashTenderedUSD || 0) > 0 || (p.cashTenderedBs || 0) > 0)
                          );

                          return (
                            <>
                              <button
                                type="button"
                                disabled={hasSplitPayments}
                                onClick={() => handleOpenPayModal(ord)}
                                className={
                                  hasSplitPayments
                                    ? "flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-400 font-black text-xs flex items-center justify-center gap-1.5 border border-stone-300 cursor-not-allowed opacity-60 select-none"
                                    : "flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-sm flex items-center justify-center gap-2 border border-yellow-500 shadow-sm transition-all cursor-pointer"
                                }
                                title={hasSplitPayments ? "Esta comanda se está cobrando por personas. Usa el botón '👥 X PERSONAS'." : undefined}
                              >
                                <IoCashOutline className={`text-base ${hasSplitPayments ? 'text-stone-400' : ''}`} />
                                <span>
                                  {hasSplitPayments
                                    ? "COBRO BLOQUEADO (USA 'X PERSONAS')"
                                    : `COBRAR (${Math.round(ord.totalCOP ? (ord.totalCOP - (ord.paidAmountUSD || 0) * (exchangeRates.COP || 3100)) : ((remaining > 0 ? remaining : ord.totalUSD) * exchangeRates.COP)).toLocaleString('es-CO')} COP)`}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={hasGeneralPayments}
                                onClick={() => handleOpenSplitItemsModal(ord)}
                                className={
                                  hasGeneralPayments
                                    ? "py-2.5 px-3 rounded-xl bg-stone-100 text-stone-400 border border-stone-300 font-black text-xs flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60 select-none"
                                    : hasSplitPayments
                                    ? "py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer animate-pulse"
                                    : "py-2.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border-2 border-blue-300 font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                                }
                                title={
                                  hasGeneralPayments
                                    ? "Esta comanda ya tiene abonos generales registrados. Continúa desde 'COBRAR'."
                                    : "Cobro dividido por personas o ítems individuales"
                                }
                              >
                                <span>{hasSplitPayments ? '👥 CONTINUAR X PERSONAS' : '👥 X PERSONAS'}</span>
                              </button>
                            </>
                          );
                        })()
                      ) : (
                        <div className="py-2 px-3 rounded-xl bg-green-100 border border-green-300 text-green-900 text-xs font-black flex items-center gap-1">
                          <IoCheckmarkCircle className="text-base text-green-700" />
                          <span>💳 PAGADO</span>
                        </div>
                      )}

                      {/* Botón Entregar / Reactivar (Quita la comanda si se cobró o la reactiva) */}
                      {!isDelivered ? (
                        <button
                          type="button"
                          onClick={() => updateOrderStatus(ord.id, 'entregada')}
                          className={`py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                            isPaid
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-emerald-700 animate-pulse'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
                          }`}
                          title="Marcar orden como entregada (si está cobrada se retira de la pantalla)"
                        >
                          <IoCheckmarkDone className="text-base" />
                          <span>📦 MARCAR ENTREGADA</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateOrderStatus(ord.id, 'preparada')}
                          className="py-2.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          title="Reactivar comanda"
                        >
                          <span>↩️ REACTIVAR</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPrinterSelectOrder(ord)}
                        className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        title="Imprimir pre-cuenta del cliente"
                      >
                        <IoPrintOutline className="text-base" />
                        <span>Pre-cuenta</span>
                      </button>

                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => setOrderAppendModalOrder(ord)}
                          className="p-2.5 rounded-xl bg-yellow-100 hover:bg-yellow-200 text-yellow-900 border border-yellow-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          title="Adicionar productos a esta comanda"
                        >
                          <span>➕ Adicionar</span>
                        </button>
                      )}

                      {/* Botón Editar Comanda */}
                      {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                        <button
                          type="button"
                          onClick={() => {
                            requireAdminPin(
                              `Editar Comanda #${ord.orderNumber}`,
                              'Autorizar Edición de Comanda',
                              () => setOrderEditModalOrder(ord)
                            );
                          }}
                          className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          title="Editar comanda activa"
                        >
                          <span>✏️ Editar</span>
                          {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                        </button>
                      )}

                      {/* Botón Anular Comanda */}
                      {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                        <button
                          type="button"
                          onClick={() => {
                            requireAdminPin(
                              `Anular Comanda #${ord.orderNumber}`,
                              'Autorizar Anulación de Comanda',
                              async () => {
                                if (!window.confirm(`¿Seguro que deseas anular y eliminar completamente la comanda #${ord.orderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`)) return;
                                try {
                                  await deleteOrder(ord.id);
                                } catch (delError) {
                                  alert(delError instanceof Error ? delError.message : 'No se pudo anular la comanda');
                                }
                              }
                            );
                          }}
                          className="p-2.5 rounded-xl bg-red-100 hover:bg-red-600 hover:text-white text-red-700 border border-red-300 font-black text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          title="Anular comanda"
                        >
                          <IoTrashOutline className="text-sm" />
                          <span>🗑️ Anular</span>
                          {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-400 text-xs" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activeComandas.map((ord) => {
                const isPrepared = ord.status === 'preparada' || ord.status === 'entregada';
                const isPaid = ord.paymentStatus === 'pagado';
                const isDelivered = ord.status === 'entregada';
                const isSelectedForMultiPay = selectedOrderIdsForMultiPay.includes(ord.id);

                return (
                  <div
                    key={ord.id}
                    className={`p-4 rounded-2xl border shadow-sm space-y-3 transition-all ${
                      isSelectedForMultiPay
                        ? 'bg-yellow-100 border-2 border-yellow-500 ring-2 ring-yellow-400'
                        : isPaid
                        ? 'bg-white border-green-300'
                        : isPrepared
                        ? 'bg-yellow-50/50 border-yellow-400'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-gray-200">
                      <div className="flex items-center gap-2.5">
                        {!isPaid && (
                          <input
                            type="checkbox"
                            checked={isSelectedForMultiPay}
                            onChange={() => handleToggleOrderForMultiPay(ord.id)}
                            className="w-4 h-4 accent-yellow-500 rounded cursor-pointer"
                            title="Seleccionar para unificar comandas"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xl font-black text-black tracking-wide">#{ord.orderNumber}</span>
                            <span className="text-xs px-2.5 py-0.5 rounded-lg bg-yellow-400 text-black border border-yellow-500 font-black uppercase">
                              {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : (ord.type || 'mesa').toUpperCase()}
                            </span>
                            {ord.type === 'mesa' && !isPaid && !isDelivered && (
                              <button
                                type="button"
                                onClick={() => setTableChangeOrder(ord)}
                                className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-[10px] font-black flex items-center gap-1 shadow-xs transition-all"
                                title="Reubicar o cambiar mesa de salón"
                              >
                                <IoSwapHorizontal />
                                <span>Cambiar Mesa</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dual Status Badges */}
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            isPrepared
                              ? 'bg-green-100 text-green-900 border-green-300'
                              : 'bg-yellow-100 text-yellow-900 border-yellow-300 animate-pulse'
                          }`}
                        >
                          {isPrepared ? <IoCheckmarkCircle className="text-green-700" /> : <IoTimeOutline className="text-yellow-700" />}
                          <span>{isDelivered ? '📦 ENTREGADA' : isPrepared ? '🔥 LISTA' : '⏳ EN COCINA'}</span>
                        </span>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border flex items-center gap-1 ${
                            ord.paymentStatus === 'credito'
                              ? 'bg-yellow-100 text-yellow-900 border-yellow-400'
                              : isPaid
                              ? 'bg-green-100 text-green-900 border-green-300'
                              : 'bg-red-100 text-red-900 border-red-300'
                          }`}
                        >
                          {ord.paymentStatus === 'credito' ? (
                            <span>⚠️ A CRÉDITO</span>
                          ) : isPaid ? (
                            <>
                              <IoCard />
                              <span>💳 PAGADO</span>
                            </>
                          ) : (
                            <>
                              <IoCloseCircle />
                              <span>❌ PENDIENTE PAGO</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-gray-800 font-extrabold break-words flex items-center gap-1.5">
                      <IoPersonOutline className="text-gray-500" />
                      <span>Cliente: {ord.customerName || (ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Para Llevar' : 'Delivery')}</span>
                    </p>

                    {ord.kitchenNotes && (
                      <div className="p-2 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-gray-800 font-medium break-words flex items-start gap-1.5">
                        <IoDocumentTextOutline className="mt-0.5 shrink-0 text-yellow-700" />
                        <div><span className="font-bold">Nota Cocina:</span> {ord.kitchenNotes}</div>
                      </div>
                    )}

                    {/* Order Items Breakdown */}
                    <div className="space-y-1 bg-gray-50 p-2.5 rounded-xl border border-gray-200 max-h-44 overflow-y-auto">
                      {(ord.items || []).map((it) => (
                        <div key={it.id} className="space-y-0.5 text-xs border-b border-gray-100 pb-1 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start font-bold text-gray-900 gap-2">
                            <span className="break-words flex-1 flex items-center gap-1 text-xs">
                              <span className="font-black text-black">• {it.quantity}x</span>
                              <span className="font-bold">{it.productName}</span>
                              {it.isTakeaway && <span className="text-amber-700 font-bold ml-1 text-[10px]">(📦 LLEVAR)</span>}
                              {(it.isCut || it.cutPreference === 'Picada') ? (
                                <span className="text-red-700 font-black ml-1 text-[10px]">(🔪 PICADA)</span>
                              ) : (
                                <span className="text-gray-600 font-bold ml-1 text-[10px]">(🌭 ENTERO)</span>
                              )}
                              {it.isPaidIndividually && (
                                <span className="px-1.5 py-0.5 rounded bg-green-100 border border-green-300 text-green-900 text-[9px] font-black uppercase">
                                  ✓ PAGADO
                                </span>
                              )}
                            </span>
                            <span className="text-black font-black text-xs shrink-0">
                              {it.price >= 100
                                ? `${Math.round(it.price * it.quantity).toLocaleString('es-CO')} COP`
                                : `$${(it.price * it.quantity).toFixed(2)}`}
                            </span>
                          </div>

                          {it.sugarPreference && (
                            <p className="text-[10px] text-blue-700 font-bold ml-2">
                              🥤 Azúcar: {it.sugarPreference}
                            </p>
                          )}

                          {it.flavor && (
                            <p className="text-[10px] text-amber-800 font-bold ml-2">
                              🍹 Sabor: {it.flavor}
                            </p>
                          )}

                          {it.proteins && it.proteins.length > 0 && !areProteinsDefault(it.productName, it.proteins) && (
                            <p className="text-[10px] text-amber-800 font-bold ml-2">
                              🥩 Proteínas: {it.proteins.join(' + ')}
                            </p>
                          )}

                          {it.removedIngredients && it.removedIngredients.length > 0 && (
                            <p className="text-[10px] text-red-600 font-bold ml-2">
                              🚫 SIN: {formatRemovedIngredients(it.removedIngredients).join(', ')}
                            </p>
                          )}

                          {it.extras && it.extras.length > 0 && (
                            <div className="ml-2 text-[10px] text-gray-700 font-bold space-y-0.5">
                              {it.extras.map((ex, exIdx) => (
                                <div key={exIdx} className="flex justify-between">
                                  <span>➕ ADD: {ex.name}</span>
                                  {ex.price > 0 && <span>+${ex.price.toFixed(2)}</span>}
                                </div>
                              ))}
                            </div>
                          )}

                          {getCleanItemNote(it.notes) && (
                            <p className="text-[10px] text-amber-900 font-bold ml-2">
                              📝 NOTA: {getCleanItemNote(it.notes)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Pricing breakdown & Multi-currency display */}
                    {(() => {
                      const totalCOP = ord.totalCOP || roundCOP(ord.totalUSD * exchangeRates.COP);
                      const totalUSD = ord.totalCOP ? (ord.totalCOP / (exchangeRates.COP || 3100)) : ord.totalUSD;
                      const totalBs = ord.totalCOP ? (ord.totalCOP / (exchangeRates.Bs || 3.2)) : ((ord.totalUSD * (exchangeRates.COP || 3100)) / (exchangeRates.Bs || 3.2));
                      const paidCOP = (ord.paidAmountUSD || 0) * (exchangeRates.COP || 3100);
                      const remainingCOP = Math.max(0, totalCOP - paidCOP);
                      const paid = ord.paidAmountUSD || 0;

                      return (
                        <div className="space-y-1.5">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-yellow-50/80 p-2.5 rounded-xl border border-yellow-300 gap-2">
                            <div className="space-y-0.5 w-full sm:w-auto">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-black text-gray-900 bg-white border border-gray-300 px-2 py-0.5 rounded shadow-xs">
                                  🇺🇸 ${totalUSD.toFixed(2)} USD
                                </span>
                                <span className="text-xs font-black text-gray-900 bg-white border border-gray-300 px-2 py-0.5 rounded shadow-xs">
                                  🇻🇪 {totalBs.toFixed(2)} Bs
                                </span>
                              </div>
                              {paid > 0 && (
                                <div className="text-[10px] font-black text-green-700">
                                  Abonado: {Math.round(paidCOP).toLocaleString('es-CO')} COP | Pendiente: {Math.round(remainingCOP).toLocaleString('es-CO')} COP
                                </div>
                              )}
                            </div>
                            <div className="text-left sm:text-right w-full sm:w-auto">
                              <div className="text-xl font-black text-black leading-tight">
                                {Math.round(totalCOP).toLocaleString('es-CO')} <span className="text-xs font-bold text-gray-600">COP</span>
                              </div>
                              {remainingCOP > 0 && paid > 0 && (
                                <span className="text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 inline-block">
                                  Resta: {Math.round(remainingCOP).toLocaleString('es-CO')} COP
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Audit Panel: Payment History & Change Breakdown */}
                          {ord.paymentHistory && ord.paymentHistory.length > 0 && (
                            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 space-y-1 text-[10px]">
                              <div className="font-black text-gray-700 uppercase tracking-wider text-[9px]">
                                📜 HISTORIAL DE COBROS Y VUELTOS:
                              </div>
                              {ord.paymentHistory.map((pm, pmIdx) => (
                                <div key={pmIdx} className="flex flex-col border-b border-gray-100 pb-0.5 last:border-0">
                                  <div className="flex justify-between font-bold text-gray-900">
                                    <span>👤 {pm.payerName}: ${pm.amountPaidUSD.toFixed(2)} USD ({pm.paymentMethod})</span>
                                    <span className="text-gray-500 font-mono text-[9px]">{new Date(pm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {!isPrepared ? (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'preparada')}
                          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
                        >
                          <IoCheckmarkCircle className="text-base" />
                          <span>🔥 MARCAR LISTA</span>
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-[11px] font-black text-center flex items-center justify-center gap-1">
                          <IoCheckmarkCircle className="text-sm" />
                          <span>🔥 LISTA</span>
                        </div>
                      )}

                      {!isPaid ? (
                        (() => {
                          const hasSplitPayments = (ord.paymentHistory || []).some(
                            (p) => Array.isArray(p.itemIds) && p.itemIds.length > 0
                          ) || (ord.items || []).some((it) => it.isPaidIndividually);

                          const hasGeneralPayments = (ord.paymentHistory || []).some(
                            (p) => (!Array.isArray(p.itemIds) || p.itemIds.length === 0) &&
                                   ((p.amountPaidUSD || 0) > 0 || (p.cashTenderedCOP || 0) > 0 || (p.cashTenderedUSD || 0) > 0 || (p.cashTenderedBs || 0) > 0)
                          );

                          const totalCOP = ord.totalCOP || roundCOP(ord.totalUSD * exchangeRates.COP);
                          const paidCOP = (ord.paidAmountUSD || 0) * (exchangeRates.COP || 3100);
                          const remainingCOP = Math.max(0, totalCOP - paidCOP);

                          return (
                            <>
                              {hasSplitPayments ? (
                                <div
                                  className="w-full rounded-xl border border-stone-300 bg-stone-100 px-2 py-2.5 text-center text-xs font-black text-stone-400 select-none cursor-not-allowed"
                                  title="Esta comanda se está cobrando por personas. Continúa desde '👥 X PERSONAS'"
                                >
                                  COBRO BLOQUEADO
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleOpenPayModal(ord)}
                                  className="w-full py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center justify-center gap-1.5 border border-yellow-500 shadow-sm transition-all cursor-pointer"
                                >
                                  <IoCashOutline className="text-base" />
                                  <span>💳 COBRAR ({Math.round(remainingCOP > 0 ? remainingCOP : totalCOP).toLocaleString('es-CO')} COP)</span>
                                </button>
                              )}

                              <button
                                disabled={hasGeneralPayments}
                                onClick={() => handleOpenSplitItemsModal(ord)}
                                className={`w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all ${
                                  hasGeneralPayments
                                    ? "bg-stone-100 text-stone-400 border border-stone-300 cursor-not-allowed opacity-60 select-none"
                                    : hasSplitPayments
                                    ? "bg-yellow-400 hover:bg-yellow-500 text-black border-2 border-yellow-500 shadow-sm cursor-pointer animate-pulse"
                                    : "bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 cursor-pointer"
                                }`}
                                title={
                                  hasGeneralPayments
                                    ? "Esta comanda ya tiene abonos generales registrados. Continúa desde 'COBRAR'."
                                    : "Cobro dividido por personas o ítems individuales"
                                }
                              >
                                <span>{hasSplitPayments ? '👥 CONTINUAR X PERSONAS' : '👥 X PERSONAS'}</span>
                              </button>
                            </>
                          );
                        })()
                      ) : (
                        <div className="p-2 rounded-xl bg-green-100 border border-green-300 text-green-900 text-[11px] font-black text-center flex items-center justify-center gap-1 sm:col-span-2">
                          <IoCheckmarkCircle className="text-sm text-green-700" />
                          <span>💳 PAGADO</span>
                        </div>
                      )}

                      {!isDelivered ? (
                        <button
                          onClick={() => updateOrderStatus(ord.id, 'entregada')}
                          className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs flex items-center justify-center gap-1.5 border border-gray-300 transition-all"
                        >
                          <IoCheckmarkDone className="text-base text-gray-700" />
                          <span>📦 ENTREGAR</span>
                        </button>
                      ) : (
                        <div className="p-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-600 text-[11px] font-bold text-center">
                          📦 ENTREGADA
                        </div>
                      )}

                      {/* Botón Adicionar Productos a Comanda (Sin Clave) */}
                      {!isPaid && (
                        <button
                          onClick={() => setOrderAppendModalOrder(ord)}
                          className="w-full py-2.5 rounded-xl bg-yellow-100 hover:bg-yellow-200 text-black border border-yellow-300 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                          title="Adicionar nuevos productos a la comanda activa"
                        >
                          <span>➕ ADICIONAR</span>
                        </button>
                      )}

                      {/* Botón Imprimir Pre-Cuenta / Ticket Completo */}
                      <button
                        onClick={() => setPrinterSelectOrder(ord)}
                        className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                        title="Seleccionar impresora térmica para emitir ticket / pre-cuenta con precios en USD, COP y Bs"
                      >
                        <IoDocumentTextOutline className="text-base" />
                        <span>🧾 PRE-CUENTA</span>
                      </button>

                      {/* Botón Reimprimir Cocina */}
                      <button
                        onClick={() => setPrinterSelectKitchenOrder(ord)}
                        className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        title="Reimprimir comanda en impresora de cocina"
                      >
                        <IoPrintOutline className="text-base" />
                        <span>🖨️ COCINA</span>
                      </button>

                      {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                        <button
                          onClick={() => {
                            requireAdminPin(
                              `Editar Comanda #${ord.orderNumber}`,
                              'Autorizar Edición de Comanda',
                              () => setOrderEditModalOrder(ord)
                            );
                          }}
                          className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          <span>✏️ EDITAR</span>
                          {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                        </button>
                      )}

                      {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                        <button
                          onClick={() => {
                            requireAdminPin(
                              `Anular Comanda #${ord.orderNumber}`,
                              'Autorizar Anulación de Comanda',
                              async () => {
                                if (!window.confirm(`¿Seguro que deseas anular y eliminar completamente la comanda ${ord.orderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`)) return;
                                try {
                                  await deleteOrder(ord.id);
                                } catch (delError) {
                                  alert(delError instanceof Error ? delError.message : 'No se pudo anular la comanda');
                                }
                              }
                            );
                          }}
                          className="w-full py-2.5 rounded-xl bg-red-950/40 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                          title="Anular y borrar comanda por completo del sistema"
                        >
                          <IoTrashOutline className="text-sm" />
                          <span>🗑️ ANULAR</span>
                          {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-400 text-xs" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB HISTÓRICO DE COBROS DEL DÍA */}
      {activeSubTab === 'historico' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200 shadow-xs">
            <h2 className="text-lg font-black text-black flex items-center gap-2">
              <IoTimeOutline className="text-yellow-600 text-xl" />
              <span>HISTÓRICO DE COBROS Y ENTREGAS DEL DÍA</span>
            </h2>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="🔍 Buscar comanda o cliente..."
                value={historicoSearch}
                onChange={(e) => setHistoricoSearch(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs font-semibold focus:border-yellow-400 outline-none w-full sm:w-64"
              />

              <select
                value={historicoMethodFilter}
                onChange={(e) => setHistoricoMethodFilter(e.target.value as any)}
                className="px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs font-semibold focus:border-yellow-400 outline-none"
              >
                <option value="todos">Todos los Métodos</option>
                {HISTORIC_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </div>
          </div>

          {(() => {
            const filteredHistoric = paidOrdersToday.filter((o) => {
              if (o.status !== 'entregada') return false;
              const matchesSearch =
                !historicoSearch ||
                o.orderNumber.toLowerCase().includes(historicoSearch.toLowerCase()) ||
                (o.customerName || '').toLowerCase().includes(historicoSearch.toLowerCase());
              const matchesMethod = historicoMethodFilter === 'todos' || o.paymentMethod === historicoMethodFilter || o.paymentHistory?.some((payment) => payment.paymentMethod === historicoMethodFilter);
              return matchesSearch && matchesMethod;
            });

            if (filteredHistoric.length === 0) {
              return (
                <div className="p-12 text-center rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
                  <IoCheckmarkDone className="text-4xl text-yellow-500 mx-auto" />
                  <p className="text-xs text-gray-500 font-bold">No se encontraron comandas cobradas en este criterio.</p>
                </div>
              );
            }

            const totalHistoricPages = Math.max(1, Math.ceil(filteredHistoric.length / HISTORICO_PAGE_SIZE));
            const currentPage = Math.min(historicoPage, totalHistoricPages);
            const paginatedHistoric = filteredHistoric.slice(
              (currentPage - 1) * HISTORICO_PAGE_SIZE,
              currentPage * HISTORICO_PAGE_SIZE
            );

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {paginatedHistoric.map((ord) => (
                    <div 
                      key={ord.id} 
                      onClick={() => setHistoricDetailOrder(ord)}
                      className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs space-y-3 cursor-pointer hover:border-yellow-400 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-black">{ord.orderNumber}</span>
                            <span className="text-xs px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-800 border border-gray-200 font-black uppercase">
                              {ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : (ord.type || 'mesa').toUpperCase()}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 font-semibold mt-1 block">👤 Cliente: {ord.customerName || 'General'}</span>
                        </div>
                        <div className="text-right">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-green-100 text-green-900 border border-green-300">
                            💳 {ord.paymentHistory?.map((payment) => payment.paymentMethod).filter((method, index, methods) => methods.indexOf(method) === index).join(' + ') || ord.paymentMethod || 'PAGADO'}
                          </span>
                          <span className="text-lg font-black text-black block mt-1 bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500 text-center">${ord.totalUSD.toFixed(2)} USD</span>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-1.5 bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs font-semibold text-gray-900">
                        {(ord.items || []).map((it) => {
                          const itLineCOP = it.price >= 100 ? (it.price * it.quantity) : Math.round(it.price * it.quantity * (ord.copRateAtPayment || exchangeRates.COP || 3100));
                          return (
                            <div key={it.id} className="text-xs font-bold text-gray-800 flex justify-between border-b border-gray-200/60 pb-1 last:border-0">
                              <span>• {it.quantity}x {it.productName}</span>
                              <span className="text-black font-black">{Math.round(itLineCOP).toLocaleString('es-CO')} COP</span>
                            </div>
                          );
                        })}
                        {ord.type === 'delivery' && (((ord as any).deliveryFeeCOP || 0) > 0 || (ord.deliveryFeeUSD || 0) > 0) && (() => {
                          const delCOP = (ord as any).deliveryFeeCOP || (ord.deliveryFeeUSD && ord.deliveryFeeUSD >= 100 ? ord.deliveryFeeUSD : Math.round((ord.deliveryFeeUSD || 0) * (ord.copRateAtPayment || exchangeRates.COP || 3100)));
                          if (delCOP <= 0) return null;
                          return (
                            <div className="text-xs font-bold text-gray-800 flex justify-between border-t border-gray-200 pt-1">
                              <span>• Servicio delivery</span>
                              <span className="text-black font-black">{Math.round(delCOP).toLocaleString('es-CO')} COP</span>
                            </div>
                          );
                        })()}
                      </div>

                      {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                        <button
                          onClick={async (event) => {
                            event.stopPropagation();
                            requireAdminPin(
                              `Reactivar Comanda #${ord.orderNumber}`,
                              'Autorizar Reactivación de Comanda',
                              async () => {
                                await reopenOrder(ord.id);
                                setSearchParams({ tab: 'comandas' });
                              }
                            );
                          }}
                          className="w-full rounded-xl border border-yellow-400 bg-yellow-50 hover:bg-yellow-400 px-3 py-2 text-xs font-black text-black transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>REACTIVAR COMANDA</span>
                          {userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Controles de Paginación */}
                {totalHistoricPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-gray-200 text-xs shadow-xs">
                    <span className="text-gray-600 font-medium">
                      Página <strong className="text-black">{currentPage}</strong> de <strong className="text-black">{totalHistoricPages}</strong> ({filteredHistoric.length} comandas cobradas)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setHistoricoPage((prev) => Math.max(1, prev - 1))}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 border border-gray-300 font-bold transition-all"
                      >
                        ◀ Anterior
                      </button>
                      <button
                        type="button"
                        disabled={currentPage >= totalHistoricPages}
                        onClick={() => setHistoricoPage((prev) => Math.min(totalHistoricPages, prev + 1))}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 border border-gray-300 font-bold transition-all"
                      >
                        Siguiente ▶
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* SUB-TAB 2: CAJA CHICA & CONTROL DE FLUJO */}
      {activeSubTab === 'cajachica' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs text-gray-500 font-bold block uppercase">APERTURA EN CAJA (USD / COP)</span>
              <div className="text-2xl font-black text-black">${filteredApertura.usdCash.toFixed(2)} USD</div>
              <div className="text-xs text-gray-700 font-bold">${filteredApertura.copCash.toLocaleString()} COP</div>
              {(userSession?.role === 'admin' || userSession?.role === 'caja') && (
                <button
                  onClick={() => {
                    if (isFirstApertura) {
                      handleOpenAperturaModal();
                    } else {
                      requireAdminPin(
                        'Modificar Apertura de Caja',
                        'Autorizar Apertura de Caja',
                        () => handleOpenAperturaModal()
                      );
                    }
                  }}
                  className="mt-2 text-xs text-yellow-600 hover:text-yellow-700 font-black flex items-center gap-1 hover:underline"
                >
                  <span>{isFirstApertura ? '+ Registrar Fondo Inicial' : '+ Modificar Apertura'}</span>
                  {!isFirstApertura && userSession?.role === 'caja' && <IoLockClosedOutline className="text-amber-500 text-xs" />}
                </button>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs text-gray-500 font-bold block uppercase">INGRESOS TOTALES</span>
              <div className="text-2xl font-black text-black">+${totalIngresosUSD.toFixed(2)} USD</div>
              <div className="text-xs text-gray-700 font-bold">+{totalIngresosCOP.toLocaleString()} COP | +{totalIngresosBs.toLocaleString()} Bs</div>
              <div className="text-xs text-gray-500 font-medium">Cobros e ingresos manuales por método</div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-2">
              <span className="text-xs text-gray-500 font-bold block uppercase">SALDO DISPONIBLE EN EFECTIVO</span>
              <div className="text-3xl font-black text-black bg-yellow-100 px-2 py-0.5 rounded border border-yellow-300 inline-block">${saldoEfectivoUSD.toFixed(2)} USD</div>
              <div className="text-xs text-gray-700 font-bold">{saldoEfectivoCOP.toLocaleString()} COP</div>
              <div className="text-[10px] text-gray-500 leading-tight">Transferencias, tarjetas y Bs permanecen en el movimiento contable, no en el arqueo físico.</div>
              <button
                onClick={() => {
                  requireAdminPin(
                    'Registrar Movimiento en Caja Chica',
                    '🔐 AUTORIZACIÓN: MOVIMIENTO DE CAJA CHICA',
                    () => setIsManualTxOpen(true),
                    'Ingrese el PIN de seguridad de 4 dígitos para abrir el registro de egresos o ingresos:'
                  );
                }}
                className="mt-2 px-3 py-1.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black border border-yellow-500 text-xs font-black shadow-xs transition-all flex items-center gap-1.5"
              >
                <span>- Registrar Vuelto / Egreso</span>
                {userSession?.role === 'caja' && <IoLockClosedOutline className="text-black text-xs" />}
              </button>
            </div>
          </div>

          {/* Historial de Transacciones */}
          <div className="space-y-3">
            <h3 className="text-base font-black text-black uppercase tracking-wide">MOVIMIENTOS DE CAJA CHICA</h3>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-xs">
              <table className="w-full min-w-[860px] text-left text-xs text-gray-800">
                <thead className="bg-gray-100 text-gray-900 uppercase text-[10px] font-black border-b border-gray-200">
                  <tr>
                    <th className="p-3.5">Fecha / Hora</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Moneda</th>
                    <th className="p-3.5">Método de pago</th>
                    <th className="p-3.5">Monto</th>
                    <th className="p-3.5">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    const totalCajaTxPages = Math.max(1, Math.ceil(filteredCajaTransactions.length / CAJA_TX_PAGE_SIZE));
                    const currentTxPage = Math.min(cajaTxPage, totalCajaTxPages);
                    const paginatedTx = filteredCajaTransactions.slice(
                      (currentTxPage - 1) * CAJA_TX_PAGE_SIZE,
                      currentTxPage * CAJA_TX_PAGE_SIZE
                    );

                    if (paginatedTx.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-gray-400 font-bold">
                            No hay movimientos de caja chica registrados en este turno.
                          </td>
                        </tr>
                      );
                    }

                    return paginatedTx.map((tx) => {
                      const amounts = [
                        tx.amountUSD > 0 ? `$${tx.amountUSD.toFixed(2)} USD` : null,
                        tx.amountCOP > 0 ? `$${tx.amountCOP.toLocaleString()} COP` : null,
                        tx.amountBs > 0 ? `${tx.amountBs.toLocaleString()} Bs` : null,
                      ].filter(Boolean).join(' | ');

                      return (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="p-3.5 font-mono text-gray-600">{new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${tx.type === 'ingreso' ? 'bg-green-100 text-green-900 border-green-300' : 'bg-amber-100 text-amber-900 border-amber-300'}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold">{tx.currency}</td>
                          <td className="p-3.5 font-semibold">{tx.paymentMethod}</td>
                          <td className="p-3.5 font-black text-black">{amounts || '$0.00 USD'}</td>
                          <td className="p-3.5">
                            <div className="font-bold text-gray-900">{tx.orderReference}</div>
                            <div className="mt-0.5 text-[10px] text-gray-500">{tx.description}</div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>

              {/* Controles de Paginación Caja Chica */}
              {(() => {
                const totalCajaTxPages = Math.max(1, Math.ceil(filteredCajaTransactions.length / CAJA_TX_PAGE_SIZE));
                const currentTxPage = Math.min(cajaTxPage, totalCajaTxPages);
                if (totalCajaTxPages <= 1) return null;

                return (
                  <div className="flex items-center justify-between p-3 border-t border-gray-200 text-xs bg-gray-50">
                    <span className="text-gray-600 font-medium">
                      Página <strong className="text-black">{currentTxPage}</strong> de <strong className="text-black">{totalCajaTxPages}</strong> ({filteredCajaTransactions.length} movimientos)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={currentTxPage <= 1}
                        onClick={() => setCajaTxPage((prev) => Math.max(1, prev - 1))}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 border border-gray-300 font-bold transition-all"
                      >
                        ◀ Anterior
                      </button>
                      <button
                        type="button"
                        disabled={currentTxPage >= totalCajaTxPages}
                        onClick={() => setCajaTxPage((prev) => Math.min(totalCajaTxPages, prev + 1))}
                        className="px-3 py-1 rounded-lg bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-800 border border-gray-300 font-bold transition-all"
                      >
                        Siguiente ▶
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: REPORTES DE VENTAS & ARQUEO DE CIERRE DE CAJA */}
      {activeSubTab === 'reportes' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-black text-black flex items-center gap-2">
                <IoBarChartOutline className="text-yellow-600 text-xl" />
                <span>REPORTE DIARIO DE VENTAS & ARQUEO DE CAJA</span>
              </h2>
              <p className="text-xs text-gray-500 font-semibold mt-0.5">Genera reportes de cierre de turno y cuadre de dinero.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => {
                  setCierreError('');
                  setIsCierreModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center gap-2 border border-yellow-500 shadow-xs transition-all cursor-pointer"
              >
                <IoCashOutline className="text-base" />
                <span>ARQUEO DIARIO DE EFECTIVO</span>
              </button>
            </div>
          </div>

          {/* Panel de Reporte Contable por Intervalo */}
          <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-xs space-y-4">
              <h3 className="text-xs font-black text-black uppercase tracking-wider flex items-center gap-2">
                <IoBarChartOutline className="text-base text-yellow-600" />
                <span>REPORTE CONTABLE POR INTERVALO DE FECHAS</span>
              </h3>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    setIntervaloFrom(`${year}-${month}-${day}T00:00`);
                    setIntervaloTo(`${year}-${month}-${day}T23:59`);
                    setReporteError('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200"
                >
                  📅 Hoy Completo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const apDate = filteredApertura.openedAt ? new Date(filteredApertura.openedAt) : null;
                    if (apDate && !isNaN(apDate.getTime())) {
                      const apYear = apDate.getFullYear();
                      const apMonth = String(apDate.getMonth() + 1).padStart(2, '0');
                      const apDay = String(apDate.getDate()).padStart(2, '0');
                      const apHour = String(apDate.getHours()).padStart(2, '0');
                      const apMin = String(apDate.getMinutes()).padStart(2, '0');
                      setIntervaloFrom(`${apYear}-${apMonth}-${apDay}T${apHour}:${apMin}`);
                    } else {
                      setIntervaloFrom(`${year}-${month}-${day}T00:00`);
                    }
                    const curHour = String(now.getHours()).padStart(2, '0');
                    const curMin = String(now.getMinutes()).padStart(2, '0');
                    setIntervaloTo(`${year}-${month}-${day}T${curHour}:${curMin}`);
                    setReporteError('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-yellow-100 hover:bg-yellow-200 text-black text-xs font-black transition-all border border-yellow-300"
                >
                  🌅 Turno Actual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
                    const fYear = fourHoursAgo.getFullYear();
                    const fMonth = String(fourHoursAgo.getMonth() + 1).padStart(2, '0');
                    const fDay = String(fourHoursAgo.getDate()).padStart(2, '0');
                    const fHour = String(fourHoursAgo.getHours()).padStart(2, '0');
                    const fMin = String(fourHoursAgo.getMinutes()).padStart(2, '0');
                    const tYear = now.getFullYear();
                    const tMonth = String(now.getMonth() + 1).padStart(2, '0');
                    const tDay = String(now.getDate()).padStart(2, '0');
                    const tHour = String(now.getHours()).padStart(2, '0');
                    const tMin = String(now.getMinutes()).padStart(2, '0');
                    setIntervaloFrom(`${fYear}-${fMonth}-${fDay}T${fHour}:${fMin}`);
                    setIntervaloTo(`${tYear}-${tMonth}-${tDay}T${tHour}:${tMin}`);
                    setReporteError('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200"
                >
                  🕒 Últimas 4 Horas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const year = yesterday.getFullYear();
                    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
                    const day = String(yesterday.getDate()).padStart(2, '0');
                    setIntervaloFrom(`${year}-${month}-${day}T00:00`);
                    setIntervaloTo(`${year}-${month}-${day}T23:59`);
                    setReporteError('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-all border border-gray-200"
                >
                  ⏪ Ayer
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Fecha/Hora Inicio</label>
                  <input
                    type="datetime-local"
                    value={intervaloFrom}
                    onChange={(e) => { setIntervaloFrom(e.target.value); setReporteError(''); }}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-600 uppercase mb-1">Fecha/Hora Fin</label>
                  <input
                    type="datetime-local"
                    value={intervaloTo}
                    onChange={(e) => { setIntervaloTo(e.target.value); setReporteError(''); }}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-xs outline-none focus:border-yellow-400 font-semibold"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!intervaloFrom || !intervaloTo) { setReporteError('Selecciona ambas fechas.'); return; }
                    const fromDate = new Date(intervaloFrom);
                    const toDate = new Date(intervaloTo);
                    if (fromDate > toDate) { setReporteError('La fecha inicio debe ser menor o igual a la fecha fin.'); return; }
                    setIsLoadingReporte(true);
                    setReporteError('');
                    setReporteIntervaloData(null);
                    try {
                      const data = await fetchReporteIntervalo(intervaloFrom, intervaloTo);
                      const resolvedData: ReporteIntervaloData = {
                        ...data,
                        apertura: (data.apertura && (data.apertura.usdCash > 0 || data.apertura.copCash > 0))
                          ? data.apertura
                          : {
                              usdCash: filteredApertura.usdCash,
                              copCash: filteredApertura.copCash,
                              openedAt: filteredApertura.openedAt || new Date().toISOString()
                            }
                      };
                      setReporteIntervaloData(resolvedData);
                    } catch (e: any) {
                      setReporteError(e.message || 'Error al obtener reporte.');
                    } finally {
                      setIsLoadingReporte(false);
                    }
                  }}
                  disabled={isLoadingReporte}
                  className="px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs flex items-center justify-center gap-2 border border-yellow-500 shadow-xs transition-all"
                >
                  {isLoadingReporte ? (
                    <span className="animate-pulse">⏳ CARGANDO...</span>
                  ) : (
                    <><IoDocumentTextOutline /> <span>GENERAR REPORTE</span></>
                  )}
                </button>
                {reporteIntervaloData && (
                  <button
                    onClick={() => exportToExcel(reporteIntervaloData)}
                    className="px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
                  >
                    <IoDocumentTextOutline /> <span>EXPORTAR EXCEL (.xlsx)</span>
                  </button>
                )}
              </div>

              {reporteError && (
                <div className="text-red-700 text-xs font-bold bg-red-50 border border-red-200 rounded-xl p-3">
                  ⚠️ {reporteError}
                </div>
              )}

              {reporteIntervaloData && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <p className="text-xs text-gray-600 font-medium">El reporte fue generado. Haz clic para abrirlo y podrás revisarlo o imprimirlo según desees:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <button
                      onClick={() => {
                        const dataForReport: ReporteIntervaloData = {
                          ...reporteIntervaloData,
                          apertura: (reporteIntervaloData.apertura && (reporteIntervaloData.apertura.usdCash > 0 || reporteIntervaloData.apertura.copCash > 0))
                            ? reporteIntervaloData.apertura
                            : {
                                usdCash: filteredApertura.usdCash,
                                copCash: filteredApertura.copCash,
                                openedAt: filteredApertura.openedAt || new Date().toISOString()
                              }
                        };
                        setPendingReportChoice({
                          type: 'contable',
                          title: 'Reporte Contable Consolidado',
                          generator: () => reportService.generateReporteContable(dataForReport),
                        });
                      }}
                      className="px-4 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center justify-center gap-2 border border-yellow-500 shadow-xs"
                    >
                      <IoDocumentTextOutline /> REPORTE CONTABLE
                    </button>
                    <button
                      onClick={() => setPendingReportChoice({
                        type: 'pizzas',
                        title: 'Hamburguesas Vendidas e Ítems Facturados',
                        generator: () => reportService.generatePizzasSoldIntervalReport(reporteIntervaloData),
                      })}
                      className="px-4 py-3 rounded-xl bg-white hover:bg-yellow-50 text-gray-900 border border-gray-300 hover:border-yellow-400 font-black text-xs flex items-center justify-center gap-2 shadow-xs"
                    >
                      <span>🍔 HAMBURGUESAS</span>
                    </button>
                    <button
                      onClick={() => setPendingReportChoice({
                        type: 'ingresos',
                        title: 'Ingresos y Cobros por Método',
                        generator: () => reportService.generateIncomeIntervalReport(reporteIntervaloData),
                      })}
                      className="px-4 py-3 rounded-xl bg-white hover:bg-yellow-50 text-gray-900 border border-gray-300 hover:border-yellow-400 font-black text-xs flex items-center justify-center gap-2 shadow-xs"
                    >
                      <IoTrendingUp /> INGRESOS
                    </button>
                    <button
                      onClick={() => setPendingReportChoice({
                        type: 'egresos',
                        title: 'Vueltos y Egresos de Caja Chica',
                        generator: () => reportService.generateExpensesIntervalReport(reporteIntervaloData),
                      })}
                      className="px-4 py-3 rounded-xl bg-white hover:bg-yellow-50 text-gray-900 border border-gray-300 hover:border-yellow-400 font-black text-xs flex items-center justify-center gap-2 shadow-xs"
                    >
                      <IoCashOutline /> VUELTOS
                    </button>
                    <button
                      onClick={() => setPendingReportChoice({
                        type: 'cocina',
                        title: 'Tiempos y Comandas de Cocina',
                        generator: () => reportService.generateKitchenTimesIntervalReport(reporteIntervaloData),
                      })}
                      className="px-4 py-3 rounded-xl bg-white hover:bg-yellow-50 text-gray-900 border border-gray-300 hover:border-yellow-400 font-black text-xs flex items-center justify-center gap-2 shadow-xs"
                    >
                      <IoTimeOutline /> COCINA
                    </button>
                  </div>
                </div>
              )}

          </div>

        </div>
      )}

      {activeOrderForPay && (
        <PaymentLedgerModal
          order={orders.find((order) => order.id === activeOrderForPay.id) || activeOrderForPay}
          onClose={handleClosePaymentLedger}
          onViewOrder={(order) => setOrderDetailModalOrder(order)}
          paymentScope={splitPaymentScope || undefined}
          onEditPaymentScope={splitPaymentScope ? handleEditSplitPaymentSelection : undefined}
        />
      )}

      {splitPaymentSelectionOrder && (
        <SplitPaymentSelectionModal
          order={orders.find((order) => order.id === splitPaymentSelectionOrder.id) || splitPaymentSelectionOrder}
          initialPayerName={splitPaymentScope?.payerName}
          initialItemIds={splitPaymentScope?.itemIds}
          onCancel={handleCancelSplitPaymentSelection}
          onConfirm={handleConfirmSplitPaymentSelection}
          exchangeRates={exchangeRates}
        />
      )}

      {/* MODAL APERTURA CAJA CHICA */}
      {isAperturaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl space-y-5 text-black">
            <h3 className="text-lg font-black text-black border-b border-gray-200 pb-3">
              {isFirstApertura ? 'Registrar Fondo Inicial de Caja' : 'Modificar Apertura de Saldo Inicial'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Monto Inicial USD (Efectivo):</label>
                <input
                  type="number"
                  value={initUSD}
                  onChange={(e) => setInitUSD(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-bold outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Monto Inicial COP (Efectivo):</label>
                <input
                  type="number"
                  value={initCOP}
                  onChange={(e) => setInitCOP(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-bold outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsAperturaModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs border border-gray-300 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={handleAperturaSubmit}
                className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs border border-yellow-500 shadow-xs transition-all"
              >
                {isFirstApertura ? 'REGISTRAR FONDO' : 'GUARDAR CAMBIOS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ARQUEO DIARIO DE CAJA */}
      {isCierreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white border border-gray-200 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto text-black">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h3 className="text-lg font-black text-black flex items-center gap-2">
                <IoCashOutline className="text-yellow-600 text-xl" />
                <span>ARQUEO DIARIO Y REINICIO DE CAJA</span>
              </h3>
              <button
                onClick={() => { setIsCierreModalOpen(false); setCierreError(''); }}
                className="p-1 rounded-lg text-gray-400 hover:text-black font-black"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Banner de Advertencia */}
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-2.5 shadow-xs">
                <div className="flex items-center gap-2 font-black text-sm text-amber-900">
                  <span className="text-xl">⚠️</span>
                  <span>¡ADVERTENCIA DE REINICIO DE TURNO!</span>
                </div>
                <p className="text-xs font-bold leading-relaxed text-amber-900">
                  Al confirmar esta acción se ejecutará el cierre del turno y la puesta a cero del sistema:
                </p>
                <ul className="text-xs font-semibold list-disc list-inside space-y-1 text-amber-950 pl-1">
                  <li>Se archivarán todas las comandas del turno (la información histórica y contable queda 100% guardada y segura en la base de datos).</li>
                  <li>Se liberarán todas las mesas del salón.</li>
                  <li>Se reseteará la caja a 0 para el día siguiente inicializar con el sistema limpio para trabajar la contabilidad desde cero.</li>
                </ul>
              </div>

              {/* Tarjetas informativas de recaudación y ventas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <span className="text-[10px] font-black uppercase text-gray-500 block">Venta Facturada Turno</span>
                  <span className="text-base font-black text-black">${paidOrdersToday.reduce((sum, o) => sum + (o.totalUSD || 0), 0).toFixed(2)} USD</span>
                  <span className="text-[10px] text-gray-500 font-bold block">{paidOrdersToday.length} comanda(s) cobrada(s)</span>
                </div>
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <span className="text-[10px] font-black uppercase text-gray-500 block">Efectivo Físico en Gaveta</span>
                  <span className="text-sm font-black text-green-700 block">${saldoEfectivoUSD.toFixed(2)} USD</span>
                  <span className="text-xs font-black text-green-700 block">{Math.round(saldoEfectivoCOP).toLocaleString()} COP</span>
                </div>
              </div>

              {/* Indicador de Comandas Pendientes */}
              {activeComandas.length > 0 ? (
                <div className="p-3.5 rounded-xl bg-red-50 border-2 border-red-400 text-red-900 space-y-1">
                  <div className="flex items-center gap-2 font-black text-xs text-red-900">
                    <span className="text-base">⚠️</span>
                    <span>ATENCIÓN: HAY {activeComandas.length} COMANDA(S) SIN COBRAR</span>
                  </div>
                  <p className="text-[11px] font-semibold leading-relaxed text-red-800">
                    Existen comandas activas en salón o delivery aún sin cobrar. Si confirmas el cierre ahora, se archivarán sin sumar su dinero e ítems a las ventas facturadas. Te recomendamos cobrarlas o pasarlas a crédito antes del cierre.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center gap-2 text-xs font-bold">
                  <span className="text-base">✅</span>
                  <span>Todas las comandas del turno están cobradas al 100% (0 pendientes). Todos los montos e ítems están listos para el arqueo.</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Notas de Cierre / Observaciones (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ej: Cierre de turno finalizado con normalidad"
                  value={cierreNotes}
                  onChange={(e) => setCierreNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm outline-none focus:border-yellow-400"
                />
              </div>

              {cierreError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{cierreError}</div>}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setIsCierreModalOpen(false); setCierreError(''); }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs border border-gray-300 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={handleCierreSubmit}
                disabled={isSubmittingCierre}
                className="flex-1 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs border border-yellow-500 shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <IoCheckmarkCircle className="text-base" />
                <span>{isSubmittingCierre ? 'CONFIRMANDO Y REINICIANDO...' : 'CONFIRMAR Y REINICIAR CAJA'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOVIMIENTO MANUAL EGRESO / VUELTO */}
      {/* MODAL MOVIMIENTO MANUAL EGRESO / VUELTO */}
      {isManualTxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl space-y-5 text-black">
            <h3 className="text-lg font-black text-black border-b border-gray-200 pb-3">Registrar Movimiento Manual</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Tipo de Movimiento:</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as 'ingreso' | 'egreso')}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-semibold outline-none focus:border-yellow-400"
                >
                  <option value="egreso">Egreso / Vuelto / Gasto</option>
                  <option value="ingreso">Ingreso Manual</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Moneda:</label>
                  <select
                    value={manualCurrency}
                    onChange={(e) => {
                      const currency = e.target.value as 'USD' | 'COP' | 'Bs';
                      setManualCurrency(currency);
                      setManualPaymentMethod(currency === 'USD' ? 'Efectivo USD' : currency === 'COP' ? 'Efectivo COP' : 'Pago Móvil');
                    }}
                    className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-semibold outline-none focus:border-yellow-400"
                  >
                    <option value="USD">USD</option>
                    <option value="COP">COP</option>
                    <option value="Bs">Bs</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Método de pago:</label>
                  <select
                    value={manualPaymentMethod}
                    onChange={(e) => setManualPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-semibold outline-none focus:border-yellow-400"
                  >
                    {(manualCurrency === 'USD' ? ['Efectivo USD', 'Zelle', 'Binance'] : manualCurrency === 'COP' ? ['Efectivo COP', 'Bancolombia', 'Nequi'] : ['Pago Móvil', 'Tarjeta de Débito', 'Tarjeta de Crédito']).map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Monto {manualCurrency}:</label>
                <input
                  type="number"
                  placeholder={manualCurrency === 'USD' ? 'Ej: 5.00' : manualCurrency === 'COP' ? 'Ej: 20000' : 'Ej: 100'}
                  value={manualAmountUSD}
                  onChange={(e) => setManualAmountUSD(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm font-bold outline-none focus:border-yellow-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Motivo / Descripción:</label>
                <input
                  type="text"
                  placeholder="Ej: Vuelto entregado por pago en Divisas"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-300 text-gray-900 text-sm outline-none focus:border-yellow-400"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsManualTxOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs border border-gray-300 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={handleManualTxSubmit}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs border transition-all ${
                  manualType === 'egreso'
                    ? 'bg-red-500 text-white border-red-600 hover:bg-red-600 shadow-xs'
                    : 'bg-yellow-400 text-black border-yellow-500 hover:bg-yellow-500 shadow-xs'
                }`}
              >
                {manualType === 'egreso' ? 'REGISTRAR EGRESO' : 'REGISTRAR INGRESO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE COMANDA HISTÓRICA */}
      {historicDetailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar text-black">
            <div className="flex justify-between items-center border-b border-gray-200 pb-3">
              <div>
                <span className="text-[10px] font-black text-yellow-600 uppercase">Detalle Histórico</span>
                <h3 className="text-xl font-black text-black">{historicDetailOrder.orderNumber}</h3>
              </div>
              <button onClick={() => setHistoricDetailOrder(null)} className="text-gray-400 hover:text-black">
                <IoCloseCircle size={24} />
              </button>
            </div>
            
            <div className="space-y-2">
              {historicDetailOrder.items.map((it) => {
                const itLineCOP = it.price >= 100 ? (it.price * it.quantity) : Math.round(it.price * it.quantity * (historicDetailOrder.copRateAtPayment || exchangeRates.COP || 3100));
                return (
                  <div key={it.id} className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex justify-between items-center text-xs font-bold text-black">
                      <span>{it.quantity}x {it.productName}</span>
                      <span className="text-black font-black">{Math.round(itLineCOP).toLocaleString('es-CO')} COP</span>
                    </div>
                    {it.extras && it.extras.length > 0 && (
                      <div className="text-[10px] text-gray-500 mt-0.5">Extras: {it.extras.map(e => `${(e.quantity && e.quantity > 1) ? `${e.quantity}x ` : ''}${e.name}`).join(', ')}</div>
                    )}
                  </div>
                );
              })}
              {historicDetailOrder.type === 'delivery' && (((historicDetailOrder as any).deliveryFeeCOP || 0) > 0 || (historicDetailOrder.deliveryFeeUSD || 0) > 0) && (() => {
                const delCOP = (historicDetailOrder as any).deliveryFeeCOP || (historicDetailOrder.deliveryFeeUSD && historicDetailOrder.deliveryFeeUSD >= 100 ? historicDetailOrder.deliveryFeeUSD : Math.round((historicDetailOrder.deliveryFeeUSD || 0) * (historicDetailOrder.copRateAtPayment || exchangeRates.COP || 3100)));
                if (delCOP <= 0) return null;
                return (
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center text-xs font-bold text-black">
                    <span>Servicio delivery</span>
                    <span className="text-black font-black">{Math.round(delCOP).toLocaleString('es-CO')} COP</span>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const history = historicDetailOrder.paymentHistory || [];
              const totalGivenUSD = history.reduce((sum, p) => sum + (p.changeGivenUSD || 0), 0);
              const totalGivenCOP = history.reduce((sum, p) => sum + (p.changeGivenCOP || 0), 0);
              const totalGivenBs = history.reduce((sum, p) => sum + (p.changeGivenBs || 0), 0);

              const grandTotalChangeUSD = history.reduce((sum, p) => {
                const copR = p.copRate || exchangeRates.COP || 3100;
                const bsR = p.bsRate || exchangeRates.Bs || 3.2;
                const usd = p.changeGivenUSD || 0;
                const copUsd = copR > 0 ? (p.changeGivenCOP || 0) / copR : 0;
                const bsUsd = (copR > 0 && bsR > 0) ? ((p.changeGivenBs || 0) * bsR) / copR : 0;
                return sum + usd + copUsd + bsUsd;
              }, 0);

              return (
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                  <div className="flex justify-between text-xs text-gray-700">
                    <span>Total Cobrado:</span>
                    <span className="font-black text-black text-sm bg-yellow-400 px-2 py-0.5 rounded border border-yellow-500">${historicDetailOrder.totalUSD.toFixed(2)} USD</span>
                  </div>

                  <div className="pt-2 border-t border-gray-200 space-y-1">
                    {totalGivenUSD > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Vuelto Entregado (USD):</span>
                        <span className="font-bold text-black">${totalGivenUSD.toFixed(2)} USD</span>
                      </div>
                    )}
                    {totalGivenCOP > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Vuelto Entregado (COP):</span>
                        <span className="font-bold text-black">${totalGivenCOP.toLocaleString()} COP</span>
                      </div>
                    )}
                    {totalGivenBs > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Vuelto Entregado (Bs):</span>
                        <span className="font-bold text-black">{totalGivenBs.toFixed(2)} Bs</span>
                      </div>
                    )}
                    {totalGivenUSD === 0 && totalGivenCOP === 0 && totalGivenBs === 0 && (
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Vuelto Entregado:</span>
                        <span className="font-bold text-gray-800">$0.00 USD</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1.5 border-t border-gray-200 font-black">
                      <span className="text-gray-700">Total Vueltos Dados (USD Equiv.):</span>
                      <span className="text-black">${grandTotalChangeUSD.toFixed(2)} USD</span>
                    </div>
                  </div>

                  {history.length > 0 ? (
                    <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="text-[10px] font-black text-gray-700 uppercase tracking-wider">
                        💳 Desglose de Pagos ({history.length} pago{history.length > 1 ? 's' : ''}):
                      </div>
                      {history.map((p, idx) => (
                        <div key={p.id || idx} className="flex justify-between items-center text-xs p-2 rounded-lg bg-white border border-gray-200">
                          <div>
                            <span className="font-bold text-black block">#{idx + 1} {p.payerName || 'Cliente General'}</span>
                            <span className="text-[10px] text-gray-600 font-semibold">{p.paymentMethod}</span>
                            {paymentMovementLabels(p).length > 0 && <span className="text-[10px] text-gray-500 block mt-0.5">{paymentMovementLabels(p).join(' | ')}</span>}
                          </div>
                          <span className="font-black text-black">${(p.amountPaidUSD || 0).toFixed(2)} USD</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex justify-between text-xs text-gray-700 pt-1 border-t border-gray-200">
                      <span>Método de Pago:</span>
                      <span className="font-bold text-black">{historicDetailOrder.paymentMethod || 'Efectivo USD'}</span>
                    </div>
                  )}
                </div>
              );
            })()}
            
            <button
              onClick={() => setHistoricDetailOrder(null)}
              className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs border border-gray-300 transition-all"
            >
              CERRAR
            </button>
          </div>
        </div>
      )}

      {/* Componentes Modulares de Detalle y Edicion Completa */}
      {orderDetailModalOrder && (
        <OrderDetailModal
          order={orders.find(o => o.id === orderDetailModalOrder.id) || orderDetailModalOrder}
          isOpen={!!orderDetailModalOrder}
          onClose={() => setOrderDetailModalOrder(null)}
          exchangeRates={exchangeRates}
          onPayOrder={(ord) => handleOpenPayModal(ord)}
          onAppendOrder={(ord) => setOrderAppendModalOrder(ord)}
          onEditOrder={(ord) => {
            requireAdminPin(
              `Editar Comanda #${ord.orderNumber}`,
              'Autorizar Edición de Comanda',
              () => setOrderEditModalOrder(ord)
            );
          }}
          onChangeTable={(ord) => setTableChangeOrder(ord)}
          onSplitPayment={(ord) => handleOpenSplitItemsModal(ord)}
          onToggleDelivered={async (ord) => {
            const newStatus = ord.status === 'entregada' ? 'preparada' : 'entregada';
            await updateOrderStatus(ord.id, newStatus);
            if (newStatus === 'entregada') {
              setOrderDetailModalOrder(null);
            } else {
              setOrderDetailModalOrder((prev) => prev ? { ...prev, status: newStatus } : null);
            }
          }}
          onCancelOrder={(ord) => {
            requireAdminPin(
              `Anular Comanda #${ord.orderNumber}`,
              'Autorizar Anulación de Comanda',
              async () => {
                if (!window.confirm(`¿Seguro que deseas anular y eliminar completamente la comanda #${ord.orderNumber}? Se liberará su número correlativo y se borrarán todos sus registros.`)) return;
                try {
                  await deleteOrder(ord.id);
                  setOrderDetailModalOrder(null);
                } catch (delError) {
                  alert(delError instanceof Error ? delError.message : 'No se pudo anular la comanda');
                }
              }
            );
          }}
          onPrintReceipt={(ord) => setPrinterSelectOrder(ord)}
          onReprintKitchen={(ord) => setPrinterSelectKitchenOrder(ord)}
          userRole={userSession?.role}
        />
      )}

      {orderEditModalOrder && (
        <OrderEditModal
          order={orders.find(o => o.id === orderEditModalOrder.id) || orderEditModalOrder}
          isOpen={!!orderEditModalOrder}
          onClose={() => setOrderEditModalOrder(null)}
          products={products}
          ingredients={ingredients}
          exchangeRates={exchangeRates}
          onSaveEdit={async (orderId, payload) => {
            await editOrder(orderId, {
              ...payload,
              type: payload.type === 'llevar' ? 'pickup' : payload.type,
            });
            setOrderEditModalOrder(null);
          }}
          onDeletePaymentEntry={async (orderId, paymentId) => {
            const updatedOrder = await deletePaymentEntry(orderId, paymentId);
            setOrderEditModalOrder(updatedOrder);
            return updatedOrder;
          }}
          onDeleteOrder={deleteOrder}
        />
      )}

      {isExchangeModalOpen && (
        <ExchangeRateModal onClose={() => setIsExchangeModalOpen(false)} />
      )}

      {/* Modal de Autorización por PIN de Administrador */}
      <AdminPinModal
        isOpen={pinModalState.isOpen}
        title={pinModalState.title}
        description={pinModalState.description}
        actionName={pinModalState.actionName}
        onSuccess={pinModalState.onSuccess}
        onClose={() => setPinModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Modal de Cambio / Reubicación de Mesa o Servicio */}
      {tableChangeOrder && (
        <OrderServiceTransferModal
          order={tableChangeOrder}
          isOpen={!!tableChangeOrder}
          onClose={() => setTableChangeOrder(null)}
        />
      )}

      {/* Modal de Adición Rápida de Ítems a la Comanda */}
      {orderAppendModalOrder && (
        <OrderAppendModal
          order={orderAppendModalOrder}
          isOpen={!!orderAppendModalOrder}
          onClose={() => setOrderAppendModalOrder(null)}
        />
      )}

      {/* Modal Selector de Impresora Térmica para Pre-Cuenta */}
      <PrinterSelectModal
        isOpen={printerSelectOrder !== null}
        title={`🖨️ PRE-CUENTA COMANDA #${(printerSelectOrder?.orderNumber || '').replace(/^#+/, '')}`}
        jobDescription="Selecciona la impresora térmica donde deseas emitir el ticket de consumo"
        defaultTarget="caja"
        onClose={() => setPrinterSelectOrder(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectOrder) {
            await printOrderReceipt(printerSelectOrder.id, target);
          }
        }}
      />

      {/* Modal Selector de Impresora Térmica para Reimprimir Comanda de Cocina */}
      <PrinterSelectModal
        isOpen={printerSelectKitchenOrder !== null}
        title={`🖨️ REIMPRIMIR COMANDA #${(printerSelectKitchenOrder?.orderNumber || '').toString().replace(/^#+/, '')}`}
        jobDescription="Selecciona a qué impresora térmica deseas enviar la comanda completa de cocina"
        defaultTarget="cocina"
        onClose={() => setPrinterSelectKitchenOrder(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectKitchenOrder) {
            await reprintKitchenOrder(printerSelectKitchenOrder.id, target);
          }
        }}
      />

      {/* Modal de Confirmación de Impresión de Reporte */}
      {pendingReportChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 shadow-2xl space-y-4 text-black">
            <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-100 border border-yellow-300 flex items-center justify-center text-black text-xl font-black">
                <IoPrintOutline />
              </div>
              <div>
                <h3 className="text-base font-black text-black">¿Imprimir en Térmica?</h3>
                <p className="text-xs text-gray-500 font-semibold">{pendingReportChoice.title}</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 font-medium">
              ¿Deseas imprimir una copia física de este reporte en la impresora térmica además de abrir el PDF en pantalla?
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  const choice = pendingReportChoice;
                  setPendingReportChoice(null);
                  choice.generator();
                }}
                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs flex items-center justify-center gap-2 transition-all border border-gray-300"
              >
                <span>❌ NO, SOLO ABRIR PDF</span>
              </button>
              <button
                onClick={() => {
                  const choice = pendingReportChoice;
                  setPendingReportChoice(null);
                  setPrinterSelectReport(choice);
                }}
                className="px-4 py-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs flex items-center justify-center gap-2 border border-yellow-500 shadow-xs transition-all"
              >
                <IoPrintOutline className="text-base" />
                <span>🖨️ SÍ, IMPRIMIR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Impresora Térmica para Reporte de Intervalo */}
      <PrinterSelectModal
        isOpen={printerSelectReport !== null}
        title={`🖨️ ${printerSelectReport?.title.toUpperCase()}`}
        jobDescription="Selecciona la impresora térmica de destino para emitir este reporte"
        defaultTarget="caja"
        onClose={() => setPrinterSelectReport(null)}
        onSelectPrinter={async (target) => {
          if (printerSelectReport && reporteIntervaloData) {
            const dataForPrint: ReporteIntervaloData = {
              ...reporteIntervaloData,
              apertura: (reporteIntervaloData.apertura && (reporteIntervaloData.apertura.usdCash > 0 || reporteIntervaloData.apertura.copCash > 0))
                ? reporteIntervaloData.apertura
                : {
                    usdCash: filteredApertura.usdCash,
                    copCash: filteredApertura.copCash,
                    openedAt: filteredApertura.openedAt || new Date().toISOString()
                  }
            };
            printerSelectReport.generator();
            await printReporteIntervalo(printerSelectReport.type, dataForPrint, target);
          }
        }}
      />

      {/* Modal Selector de Destino para Toma de Pedido Nativa en Caja */}
      <OrderTargetSelectorModal
        isOpen={isTargetSelectorOpen}
        onClose={() => setIsTargetSelectorOpen(false)}
        tables={tables}
        orders={orders}
        onSelectTarget={(type, tableNumber, title) => {
          setActiveOrderTarget({
            type,
            tableNumber,
            title: title || (type === 'mesa' ? `Mesa #${tableNumber}` : (type === 'delivery' ? 'Delivery' : 'Para Llevar (Pick-Up)'))
          });
        }}
      />

    </div>
  );
};
