import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from './context/AppContext';
import { PaymentMethod, OrderItem, Product, MOCK_EXTRAS, ExtraIngredient } from './data/mockData';

const NativeAppContent: React.FC = () => {
  const {
    userSession,
    login,
    logout,
    products,
    ingredients,
    extras,
    tables,
    orders,
    createOrder,
    processPayment,
    updateOrderStatus,
    queryCajaAI,
    isConnected,
    syncError,
    backendUrl,
    updateServerIp,
  } = useApp();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Login Form States
  const [loginUser, setLoginUser] = useState('basilico');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  // Server IP Modal State
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [serverIpInput, setServerIpInput] = useState(backendUrl);

  // Estados Mesero
  const [activeOrderTarget, setActiveOrderTarget] = useState<{
    type: 'mesa' | 'delivery' | 'pickup';
    tableNumber?: number;
    title: string;
  } | null>(null);

  const [activeCategory, setActiveCategory] = useState<string>('Todas');
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [kitchenNotes, setKitchenNotes] = useState<string>('');

  // Modal 1: Personalización de Pizza
  const [configuringPizza, setConfiguringPizza] = useState<Product | null>(null);
  const [pizzaSize, setPizzaSize] = useState<'Grande' | 'Pequeña'>('Grande');
  const [pizzaIsHalfHalf, setPizzaIsHalfHalf] = useState<boolean>(false);
  const [pizzaHalf1, setPizzaHalf1] = useState<Product | null>(null);
  const [pizzaHalf2, setPizzaHalf2] = useState<Product | null>(null);
  const [pizzaHalf1Removed, setPizzaHalf1Removed] = useState<string[]>([]);
  const [pizzaHalf2Removed, setPizzaHalf2Removed] = useState<string[]>([]);
  const [pizzaHalf1Extras, setPizzaHalf1Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaHalf2Extras, setPizzaHalf2Extras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaRemovedIngredients, setPizzaRemovedIngredients] = useState<string[]>([]);
  const [pizzaExtras, setPizzaExtras] = useState<{ name: string; price: number }[]>([]);
  const [pizzaIsTakeaway, setPizzaIsTakeaway] = useState<boolean>(false);
  const [isExtrasModalOpen, setIsExtrasModalOpen] = useState<boolean>(false);
  const [extrasTargetHalf, setExtrasTargetHalf] = useState<'full' | 'half1' | 'half2'>('full');

  // Modal 2: Preferencia de Azúcar en Jugos
  const [configuringJugo, setConfiguringJugo] = useState<Product | null>(null);

  // Kitchen Sub-Tabs
  const [kitchenTab, setKitchenTab] = useState<'pendientes' | 'listas'>('pendientes');

  // Asistente IA Texto Caja
  const [aiInput, setAiInput] = useState('');
  const [aiChatLogs, setAiChatLogs] = useState<{ sender: 'user' | 'bot'; text: string }[]>([
    { sender: 'bot', text: '🤖 Asistente de Caja listo. Escribe tu consulta.' },
  ]);

  const categories = ['Todas', 'Pizzas', 'Bebidas'];

  const availableExtras: ExtraIngredient[] = ingredients.filter((i) => i.isExtraForPizza);

  // Handle Login Submit
  const handleLoginSubmit = async () => {
    setLoginError(null);
    const res = await login(loginUser, loginPass);
    if (!res.success) {
      setLoginError(res.error || 'Credenciales inválidas');
    }
  };

  const handleSaveServerIp = () => {
    updateServerIp(serverIpInput);
    setIsServerModalOpen(false);
  };

  // NATIVE LOGIN SCREEN IF UNAUTHENTICATED
  if (!userSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#F4FAF6" />
        <ScrollView contentContainerStyle={styles.loginScroll}>
          <View style={styles.loginCard}>
            <View style={styles.brandIconBox}>
              <Ionicons name="pizza-outline" size={40} color="#10b981" />
            </View>

            <Text style={styles.loginTitle}>BASILICO PIZZERIA</Text>
            <Text style={styles.loginSub}>Ingresa tu usuario y contraseña para acceder al sistema.</Text>

            {/* STATUS BADGE */}
            <View style={[styles.statusBadge, isConnected ? styles.statusBadgeConnected : styles.statusBadgeOffline]}>
              <Ionicons
                name={isConnected ? 'wifi-outline' : 'wifi-outline'}
                size={14}
                color={isConnected ? '#10b981' : '#0A4E36'}
              />
              <Text style={[styles.statusBadgeText, { color: isConnected ? '#10b981' : '#0A4E36' }]}>
                {isConnected ? '🟢 EN VIVO - CONECTADO A PC' : '🔴 DESCONECTADO / REVISAR SERVIDOR'}
              </Text>
            </View>

            {/* SERVER CONFIG BUTTON */}
            <TouchableOpacity
              style={styles.serverConfigBtn}
              onPress={() => {
                setServerIpInput(backendUrl);
                setIsServerModalOpen(true);
              }}
            >
              <Ionicons name="hardware-chip-outline" size={16} color="#0A4E36" />
              <Text style={styles.serverConfigBtnText}>IP SERVIDOR PC: {backendUrl}</Text>
              <Ionicons name="create-outline" size={14} color="#28513E" />
            </TouchableOpacity>

            {loginError && (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={18} color="#0A4E36" />
                <Text style={styles.errorText}>{loginError}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Usuario:</Text>
              <TextInput
                style={styles.darkInput}
                value={loginUser}
                onChangeText={setLoginUser}
                placeholder="Nombre de usuario"
                placeholderTextColor="#666"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contraseña:</Text>
              <TextInput
                style={styles.darkInput}
                value={loginPass}
                onChangeText={setLoginPass}
                placeholder="Ingresa tu contraseña"
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLoginSubmit}>
              <Text style={styles.loginBtnText}>INGRESAR AL SISTEMA</Text>
              <Ionicons name="arrow-forward-outline" size={18} color="#070707" />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* MODAL CONFIGURACIÓN DE IP DEL SERVIDOR */}
        <Modal visible={isServerModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.serverModalContent}>
              <View style={styles.modalHeader}>
                <Ionicons name="server-outline" size={24} color="#10b981" />
                <Text style={styles.modalTitle}>CONFIGURAR IP DEL SERVIDOR PC</Text>
              </View>

              <Text style={styles.serverModalSub}>
                Escribe la IP local de tu PC donde está ejecutándose el backend de Basilico Pizzeria.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>IP / Dirección del Servidor:</Text>
                <TextInput
                  style={styles.darkInput}
                  value={serverIpInput}
                  onChangeText={setServerIpInput}
                  placeholder="Ej: 192.168.1.4 o 192.168.1.4:3001"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>

              <TouchableOpacity style={styles.saveIpBtn} onPress={handleSaveServerIp}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#070707" />
                <Text style={styles.saveIpBtnText}>CONECTAR Y GUARDAR IP</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelIpBtn} onPress={() => setIsServerModalOpen(false)}>
                <Text style={styles.cancelIpBtnText}>CANCELAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  const activeRole = userSession.role;

  // Acciones Mesero
  const handleOpenMenuModal = (type: 'mesa' | 'delivery' | 'pickup', tableNumber?: number, title?: string) => {
    setActiveOrderTarget({
      type,
      tableNumber,
      title: title || (type === 'delivery' ? 'Orden Delivery' : type === 'pickup' ? 'Orden PickUp' : `Mesa #${tableNumber}`),
    });
    setCartItems([]);
    setCustomerName('');
    setKitchenNotes('');
  };

  const allPizzaProducts = products.filter((p) => p.category === 'Pizzas');

  const handleSelectProduct = (product: Product) => {
    if (product.category === 'Pizzas') {
      setConfiguringPizza(product);
      setPizzaSize('Grande');
      setPizzaIsHalfHalf(false);
      setPizzaHalf1(product);
      setPizzaHalf2(allPizzaProducts.find((p) => p.id !== product.id) || product);
      setPizzaHalf1Removed([]);
      setPizzaHalf2Removed([]);
      setPizzaHalf1Extras([]);
      setPizzaHalf2Extras([]);
      setPizzaRemovedIngredients([]);
      setPizzaExtras([]);
      setPizzaIsTakeaway(activeOrderTarget?.type === 'pickup' || activeOrderTarget?.type === 'delivery');
    } else if (product.category === 'Bebidas' && product.drinkType === 'jugo') {
      setConfiguringJugo(product);
    } else {
      addSimpleItemToCart(product);
    }
  };

  const addSimpleItemToCart = (product: Product, sugarPreference?: 'Con azúcar' | 'Sin azúcar' | 'Poca azúcar' | string) => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1,
      sugarPreference,
    };
    setCartItems((prev) => [...prev, newItem]);
  };

  const handleConfirmPizzaAdd = () => {
    if (!configuringPizza) return;

    let basePrice = configuringPizza.price;
    let smallPrice = configuringPizza.priceSmall ?? (configuringPizza.price > 4 ? configuringPizza.price - 4.00 : configuringPizza.price);

    if (pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2) {
      basePrice = Math.max(pizzaHalf1.price, pizzaHalf2.price);
      const small1 = pizzaHalf1.priceSmall ?? (pizzaHalf1.price > 4 ? pizzaHalf1.price - 4.00 : pizzaHalf1.price);
      const small2 = pizzaHalf2.priceSmall ?? (pizzaHalf2.price > 4 ? pizzaHalf2.price - 4.00 : pizzaHalf2.price);
      smallPrice = Math.max(small1, small2);
    }

    const effectiveBasePrice = pizzaSize === 'Pequeña' ? smallPrice : basePrice;
    const combinedExtras = pizzaIsHalfHalf ? [...pizzaHalf1Extras, ...pizzaHalf2Extras] : pizzaExtras;
    const extrasTotal = combinedExtras.reduce((sum, e) => sum + e.price, 0);
    const finalPrice = Math.max(2.00, effectiveBasePrice + extrasTotal);

    const productName = pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2
      ? `Pizza 1/2 ${pizzaHalf1.name.replace('Pizza ', '')} + 1/2 ${pizzaHalf2.name.replace('Pizza ', '')} (${pizzaSize})`
      : `${configuringPizza.name} (${pizzaSize})`;

    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: configuringPizza.id,
      productName,
      price: finalPrice,
      quantity: 1,
      size: pizzaSize,
      isHalfHalf: pizzaIsHalfHalf,
      halfDetails: pizzaIsHalfHalf && pizzaHalf1 && pizzaHalf2 ? {
        half1Name: pizzaHalf1.name,
        half2Name: pizzaHalf2.name,
        half1Removed: pizzaHalf1Removed,
        half2Removed: pizzaHalf2Removed,
        half1Extras: pizzaHalf1Extras,
        half2Extras: pizzaHalf2Extras,
      } : undefined,
      removedIngredients: pizzaIsHalfHalf ? [] : pizzaRemovedIngredients,
      extras: pizzaIsHalfHalf ? [] : pizzaExtras,
      isTakeaway: pizzaIsTakeaway,
    };

    setCartItems((prev) => [...prev, newItem]);
    setConfiguringPizza(null);
  };

  const toggleRemovedIngredient = (ingName: string) => {
    setPizzaRemovedIngredients((prev) =>
      prev.includes(ingName) ? prev.filter((i) => i !== ingName) : [...prev, ingName]
    );
  };

  const toggleExtraIngredient = (extra: ExtraIngredient) => {
    const extraObj = { name: extra.name, price: extra.priceUSD };
    if (extrasTargetHalf === 'half1') {
      setPizzaHalf1Extras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    } else if (extrasTargetHalf === 'half2') {
      setPizzaHalf2Extras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    } else {
      setPizzaExtras((prev) =>
        prev.some((e) => e.name === extra.name)
          ? prev.filter((e) => e.name !== extra.name)
          : [...prev, extraObj]
      );
    }
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const cartTotalUSD = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const [isSubmittingNative, setIsSubmittingNative] = useState(false);

  const showSyncError = (error: unknown) => {
    Alert.alert('Acción no sincronizada', error instanceof Error ? error.message : 'No se pudo confirmar la operación en el servidor.');
  };

  const handleConfirmOrder = async () => {
    if (!activeOrderTarget || cartItems.length === 0 || isSubmittingNative) return;
    setIsSubmittingNative(true);
    try {
      await createOrder({
        type: activeOrderTarget.type,
        tableNumber: activeOrderTarget.tableNumber,
        customerName: customerName || undefined,
        kitchenNotes: kitchenNotes || undefined,
        items: cartItems,
        totalUSD: cartTotalUSD,
      });

      setActiveOrderTarget(null);
      setCartItems([]);
      Alert.alert('¡Comanda Enviada!', `Orden enviada a Cocina y Caja (${activeOrderTarget.title})`);
    } catch (error) {
      Alert.alert('Comanda no enviada', error instanceof Error ? error.message : 'No se pudo guardar la comanda en el servidor.');
    } finally {
      setIsSubmittingNative(false);
    }
  };

  const handleSendAiMessage = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim();
    setAiChatLogs((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setAiInput('');
    const botReply = await queryCajaAI(userMsg);
    setAiChatLogs((prev) => [...prev, { sender: 'bot', text: botReply }]);
  };

  const requiresKitchenPrepNative = (order: any): boolean => {
    if (!order || !order.items || order.items.length === 0) return false;
    if (order.type === 'delivery' || order.type === 'pickup') return true;
    return order.items.some((it: any) => {
      const nameLower = (it.productName || '').toLowerCase();
      const isSoda =
        nameLower.includes('coca') ||
        nameLower.includes('pepsi') ||
        nameLower.includes('refresco') ||
        nameLower.includes('gaseosa') ||
        nameLower.includes('nestea') ||
        nameLower.includes('agua') ||
        nameLower.includes('7up') ||
        nameLower.includes('sprite');
      if (isSoda) return false;
      return true;
    });
  };

  // Kitchen Orders Filtering (Pizzas, Jugos, Alcohol)
  const kitchenOrdersNative = orders.filter((o) => requiresKitchenPrepNative(o) && o.status !== 'fusionada');
  const pendingKitchenOrders = kitchenOrdersNative.filter((o) => o.status === 'en_preparacion');
  const readyKitchenOrders = kitchenOrdersNative.filter((o) => o.status === 'preparada');
  const displayedKitchenOrders = kitchenTab === 'listas' ? readyKitchenOrders : pendingKitchenOrders;

  const activeComandas = orders.filter((o) => !(o.status === 'entregada' && o.paymentStatus === 'pagado') && o.status !== 'fusionada');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4FAF6" />

      {/* HEADER / NAVBAR */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSidebarOpen(true)}>
          <Ionicons name="menu-outline" size={24} color="#173D2D" />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Image source={require('../assets/icon.png')} style={{ width: 26, height: 26, borderRadius: 6 }} resizeMode="contain" />
          <Text style={styles.brandName}>MUGROSITO</Text>
          <View style={styles.badgeTag}>
            <Text style={styles.badgeTagText}>{isConnected ? 'EN VIVO' : 'OFFLINE'}</Text>
          </View>
        </View>

        <View style={styles.roleBadge}>
          <Ionicons
            name={
              activeRole === 'caja' ? 'card-outline' :
              activeRole === 'cocina' ? 'flame-outline' :
              activeRole === 'admin' ? 'shield-checkmark-outline' : 'restaurant-outline'
            }
            size={12}
            color={activeRole === 'cocina' ? '#0A4E36' : '#10b981'}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.roleBadgeText}>
            {activeRole.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* MAIN CONTENT AREA */}
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 110 }}>
        
        {/* ROL 1: MESERO */}
        {(activeRole === 'mesero' || activeRole === 'admin' || activeRole === 'caja') && (
          <View style={styles.screenSection}>
            <View style={styles.bannerCardWeb}>
              <View style={styles.bannerIconSquare}>
                <Ionicons name="restaurant-outline" size={24} color="#10b981" />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.bannerTitleWeb}>Mesero</Text>
                  <View style={styles.realtimePill}>
                    <Text style={styles.realtimePillText}>EN VIVO</Text>
                  </View>
                </View>
                <Text style={styles.bannerSubWeb}>
                  Selecciona Delivery, PickUp o una Mesa para tomar el pedido con el menú de pizzas.
                </Text>
              </View>
            </View>

            {/* Special Orders */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <Ionicons name="bag-handle-outline" size={18} color="#10b981" />
              <Text style={styles.sectionHeadingWeb}>ORDENES ESPECIALES (DELIVERY & PICKUP)</Text>
            </View>

            <View style={{ gap: 12 }}>
              <TouchableOpacity
                style={styles.specialCardWeb}
                onPress={() => handleOpenMenuModal('delivery', undefined, 'Orden Delivery')}
              >
                <View style={[styles.specialIconSquare, { backgroundColor: '#E7F5ED', borderColor: '#10b981' }]}>
                  <Ionicons name="car-outline" size={26} color="#102A20" />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={[styles.miniPill, { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.4)' }]}>
                    <Text style={[styles.miniPillText, { color: '#10b981' }]}>DOMICILIO</Text>
                  </View>
                  <Text style={styles.specialTitleWeb}>NUEVO DELIVERY</Text>
                  <Text style={styles.specialSubWeb}>Envío directo a casa del cliente con dirección y notas.</Text>
                </View>

                <View style={styles.plusCircleBtn}>
                  <Ionicons name="add" size={20} color="#10b981" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.specialCardWeb}
                onPress={() => handleOpenMenuModal('pickup', undefined, 'Orden PickUp')}
              >
                <View style={[styles.specialIconSquare, { backgroundColor: '#2d1a04', borderColor: '#0A4E36' }]}>
                  <Ionicons name="walk-outline" size={26} color="#102A20" />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={[styles.miniPill, { backgroundColor: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                    <Text style={[styles.miniPillText, { color: '#0A4E36' }]}>PARA LLEVAR</Text>
                  </View>
                  <Text style={styles.specialTitleWeb}>NUEVO PICKUP</Text>
                  <Text style={styles.specialSubWeb}>El cliente retira directamente en la pizzería.</Text>
                </View>

                <View style={[styles.plusCircleBtn, { borderColor: '#0A4E36' }]}>
                  <Ionicons name="add" size={20} color="#0A4E36" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Tables Grid */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
              <Ionicons name="grid-outline" size={18} color="#10b981" />
              <Text style={styles.sectionHeadingWeb}>MAPA DE MESAS (SALÓN PRINCIPAL)</Text>
            </View>

            <View style={styles.tableGridWeb}>
              {tables.map((t) => {
                const activeOrder = orders.find(
                  (o) => o.tableNumber === t.number && o.status !== 'entregada' && o.status !== 'cancelado' && o.status !== 'fusionada' && o.paymentStatus !== 'credito'
                );
                const isReady = activeOrder?.status === 'preparada';
                const isOccupied = !!activeOrder;

                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.tableCardWebItem,
                      {
                        borderColor: isReady ? '#10b981' : isOccupied ? '#0A4E36' : 'rgba(255, 255, 255, 0.12)',
                        backgroundColor: isReady ? 'rgba(16, 185, 129, 0.1)' : '#F4FAF6',
                      },
                    ]}
                    onPress={() => handleOpenMenuModal('mesa', t.number, `Mesa #${t.number}`)}
                  >
                    <View style={styles.tableCardTopRow}>
                      <View style={styles.tablePizzaIconBox}>
                        <Ionicons name="pizza-outline" size={20} color={isReady ? '#10b981' : isOccupied ? '#0A4E36' : '#10b981'} />
                      </View>

                      <View
                        style={[
                          styles.tableBadgePill,
                          {
                            backgroundColor: isReady ? '#10b981' : isOccupied ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            borderColor: isReady ? '#10b981' : isOccupied ? '#0A4E36' : 'rgba(16, 185, 129, 0.4)',
                          },
                        ]}
                      >
                        <Text style={[styles.tableBadgeText, { color: isReady ? '#F4FAF6' : isOccupied ? '#0A4E36' : '#10b981' }]}>
                          {isReady ? '¡LISTA!' : isOccupied ? 'OCUPADA' : 'LIBRE'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.tableTitleText}>Mesa #{t.number}</Text>
                    <Text style={styles.tableCapText}>Capacidad: {t.capacity} Personas</Text>

                    <View style={styles.tableCardFooter}>
                      <Text style={styles.tableFooterAction}>ABRIR PEDIDO</Text>
                      <Ionicons name="add" size={16} color="#10b981" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ROL 2: CAJA */}
        {(activeRole === 'caja' || activeRole === 'admin') && (
          <View style={styles.screenSection}>
            <View style={styles.bannerCardWeb}>
              <View style={styles.bannerIconSquare}>
                <Ionicons name="card-outline" size={24} color="#10b981" />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.bannerTitleWeb}>Caja</Text>
                  <View style={styles.realtimePill}>
                    <Text style={styles.realtimePillText}>EN VIVO</Text>
                  </View>
                </View>
                <Text style={styles.bannerSubWeb}>
                  Control dual de comandas, cobro multimoneda y entrega a cliente.
                </Text>
              </View>
            </View>

            <Text style={styles.sectionHeadingWeb}>COMANDAS ACTIVAS ({activeComandas.length})</Text>

            {activeComandas.map((ord) => {
              const isPrepared = ord.status === 'preparada';
              const isPaid = ord.paymentStatus === 'pagado';
              const typeIcon = ord.type === 'mesa' ? '🍽️' : ord.type === 'pickup' ? '🛍️' : '🛵';
              const typeLabel = ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Llevar' : 'Delivery';

              return (
                <View key={ord.id} style={[styles.posCard, isPrepared && { borderColor: '#10b981', borderWidth: 2 }]}>
                  {/* Header Row */}
                  <View style={styles.posHeader}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#102A20', fontSize: 20, fontWeight: '900' }}>🧾 COMANDA #{ord.orderNumber}</Text>
                        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                          <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '900' }}>{typeIcon} {typeLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#28513E', fontSize: 14, fontWeight: 'bold', marginTop: 4 }}>
                        👤 Cliente: {ord.customerName || typeLabel}
                      </Text>
                      <Text style={{ color: '#28513E', fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>
                        🧑‍🍳 Mesero: {ord.waiterName || 'Mesero'}
                      </Text>
                    </View>

                    <Text style={{ color: '#102A20', fontWeight: '900', fontSize: 12, backgroundColor: isPrepared ? '#DDF2E5' : '#E7F5ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: isPrepared ? '#6ee7b7' : '#fcd34d' }}>
                      {isPrepared ? '🔥 ¡LISTA!' : '⏳ EN COCINA'}
                    </Text>
                  </View>

                  {/* Kitchen Notes Box */}
                  {ord.kitchenNotes ? (
                    <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginVertical: 4 }}>
                      <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: 'bold' }}>📝 Nota de Cocina: {ord.kitchenNotes}</Text>
                    </View>
                  ) : null}

                  {/* Items Cards List */}
                  <View style={{ gap: 8, marginVertical: 4 }}>
                    {ord.items.map((it) => (
                      <View key={it.id} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216,230,223,0.15)', padding: 10, gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <View style={{ backgroundColor: '#E7F5ED', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#10b981' }}>
                              <Text style={{ color: '#10b981', fontSize: 16, fontWeight: '900' }}>{it.productName.includes('Pizza') || it.productName.includes('Mitad') ? '🍕' : '🥤'} {it.quantity}x</Text>
                            </View>
                            <Text style={{ color: '#102A20', fontSize: 18, fontWeight: 'bold', flex: 1 }}>
                              {it.productName} {it.size ? `(${it.size})` : ''}
                            </Text>
                          </View>
                          <Text style={{ color: '#10b981', fontSize: 14, fontWeight: '900' }}>
                            ${(it.price * it.quantity).toFixed(2)}
                          </Text>
                        </View>

                        {/* Takeaway Indicator */}
                        {it.isTakeaway && (
                          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
                            <Text style={{ color: '#0A4E36', fontSize: 10, fontWeight: '900' }}>📦 PARA LLEVAR</Text>
                          </View>
                        )}

                        {/* 1/2 + 1/2 Pizza Breakdown */}
                        {it.isHalfHalf && it.halfDetails && (
                          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', gap: 4, marginTop: 4 }}>
                            <Text style={{ color: '#0A4E36', fontSize: 14, fontWeight: '900' }}>🌓 DESGLOSE 1/2 Y 1/2:</Text>
                            <Text style={{ color: '#102A20', fontSize: 14, fontWeight: 'bold' }}>
                              • 1ra Mitad: {it.halfDetails.half1Name}
                              {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 ? `\n   🚫 SIN: ${it.halfDetails.half1Removed.join(', ')}` : ''}
                              {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 ? `\n   ➕ EXTRAS: ${it.halfDetails.half1Extras.map((e) => e.name).join(', ')}` : ''}
                            </Text>
                            <Text style={{ color: '#102A20', fontSize: 14, fontWeight: 'bold' }}>
                              • 2da Mitad: {it.halfDetails.half2Name}
                              {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 ? `\n   🚫 SIN: ${it.halfDetails.half2Removed.join(', ')}` : ''}
                              {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 ? `\n   ➕ EXTRAS: ${it.halfDetails.half2Extras.map((e) => e.name).join(', ')}` : ''}
                            </Text>
                          </View>
                        )}

                        {/* Standard Base Ingredient Removals */}
                        {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                          <Text style={{ color: '#0A4E36', fontSize: 14, fontWeight: 'bold' }}>
                            🚫 SIN: {it.removedIngredients.join(', ')}
                          </Text>
                        )}

                        {/* Standard Extras */}
                        {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                          <Text style={{ color: '#0A4E36', fontSize: 14, fontWeight: 'bold' }}>
                            ➕ EXTRAS: {it.extras.map((e) => e.name).join(', ')}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Footer Totals */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                    <Text style={{ color: '#10b981', fontSize: 17, fontWeight: '900' }}>💵 Total: ${ord.totalUSD.toFixed(2)} USD</Text>
                    <Text style={{ color: isPaid ? '#10b981' : '#0A4E36', fontWeight: '900', fontSize: 11, backgroundColor: isPaid ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: isPaid ? '#10b981' : '#0A4E36' }}>
                      {isPaid ? `✓ PAGADO (${ord.paymentMethod})` : '⚠️ PENDIENTE PAGO'}
                    </Text>
                  </View>

                  {/* Action Buttons */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    {!isPaid ? (
                      <TouchableOpacity
                        style={[styles.btnPrimary, { paddingVertical: 12 }]}
                        onPress={async () => {
                          try {
                            await processPayment(ord.id, 'Efectivo USD');
                            Alert.alert('¡Pago Cobrado!', `Orden ${ord.orderNumber} cobrada exitosamente.`);
                          } catch (error) {
                            showSyncError(error);
                          }
                        }}
                      >
                        <Ionicons name="card-outline" size={16} color="#070707" style={{ marginRight: 6 }} />
                        <Text style={styles.btnPrimaryText}>COBRAR (${ord.totalUSD.toFixed(2)} USD)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnPrimary, { paddingVertical: 12, backgroundColor: '#E7F5ED', borderWidth: 1, borderColor: '#10b981' }]}
                        onPress={async () => {
                          try {
                            await updateOrderStatus(ord.id, 'entregada');
                          } catch (error) {
                            showSyncError(error);
                          }
                        }}
                      >
                        <Ionicons name="checkmark-done-circle" size={18} color="#10b981" style={{ marginRight: 6 }} />
                        <Text style={[styles.btnPrimaryText, { color: '#10b981' }]}>MARCAR COMO ENTREGADA</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Asistente IA Texto Caja */}
            <Text style={styles.sectionHeadingWeb}>ASISTENTE IA DE TEXTO PARA CAJA</Text>
            <View style={styles.aiBox}>
              {aiChatLogs.map((log, idx) => (
                <Text key={idx} style={{ color: log.sender === 'user' ? '#10b981' : '#173D2D', fontSize: 11, marginBottom: 4 }}>
                  {log.sender === 'user' ? 'Tú: ' : ''}{log.text}
                </Text>
              ))}

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                <TextInput
                  style={styles.darkInput}
                  placeholder="Ej: ¿Cuántas pizzas vendidas?"
                  placeholderTextColor="#666"
                  value={aiInput}
                  onChangeText={setAiInput}
                />
                <TouchableOpacity style={styles.btnPrimarySmall} onPress={handleSendAiMessage}>
                  <Ionicons name="send" size={14} color="#070707" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ROL 3: COCINA */}
        {(activeRole === 'cocina' || activeRole === 'admin') && (
          <View style={styles.screenSection}>
            <View style={styles.bannerCardWeb}>
              <View style={[styles.bannerIconSquare, { backgroundColor: '#2d1a04', borderColor: '#0A4E36' }]}>
                <Ionicons name="flame-outline" size={24} color="#0A4E36" />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.bannerTitleWeb}>Cocina</Text>
                  <View style={[styles.realtimePill, { borderColor: '#0A4E36' }]}>
                    <Text style={[styles.realtimePillText, { color: '#0A4E36' }]}>EN VIVO</Text>
                  </View>
                </View>
                <Text style={styles.bannerSubWeb}>
                  Monitoreo visual en vivo. Al marcar listo se envía a Comandas Listas.
                </Text>
              </View>
            </View>

            {/* Kitchen Sub Tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
              <TouchableOpacity
                onPress={() => setKitchenTab('pendientes')}
                style={[styles.miniPill, { backgroundColor: kitchenTab === 'pendientes' ? '#0A4E36' : 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8 }]}
              >
                <Text style={{ color: kitchenTab === 'pendientes' ? '#F4FAF6' : '#102A20', fontWeight: 'bold', fontSize: 11 }}>
                  COMANDAS EN COCINA ({pendingKitchenOrders.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setKitchenTab('listas')}
                style={[styles.miniPill, { backgroundColor: kitchenTab === 'listas' ? '#10b981' : 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8 }]}
              >
                <Text style={{ color: kitchenTab === 'listas' ? '#F4FAF6' : '#102A20', fontWeight: 'bold', fontSize: 11 }}>
                  COMANDAS LISTAS ({readyKitchenOrders.length})
                </Text>
              </TouchableOpacity>
            </View>

            {displayedKitchenOrders.map((ord) => {
              const isPrepared = ord.status === 'preparada';
              const typeIcon = ord.type === 'mesa' ? '🍽️' : ord.type === 'pickup' ? '🛍️' : '🛵';
              const typeLabel = ord.type === 'mesa' ? `Mesa #${ord.tableNumber}` : ord.type === 'pickup' ? 'PickUp / Llevar' : 'Delivery';

              return (
                <View key={ord.id} style={[styles.kdsCard, isPrepared && { borderColor: '#10b981', borderWidth: 2 }]}>
                  {/* Header Row */}
                  <View style={styles.posHeader}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#102A20', fontSize: 17, fontWeight: '900' }}>📜 {ord.orderNumber}</Text>
                        <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                          <Text style={{ color: '#0A4E36', fontSize: 10, fontWeight: '900' }}>{typeIcon} {typeLabel}</Text>
                        </View>
                      </View>
                      <Text style={{ color: '#28513E', fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>
                        👤 Cliente: {ord.customerName || typeLabel} • 🧑‍🍳 Mesero: {ord.waiterName || 'Mesero'}
                      </Text>
                    </View>

                    <Text style={{ color: '#102A20', fontWeight: '900', fontSize: 12, backgroundColor: isPrepared ? '#DDF2E5' : '#E7F5ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: isPrepared ? '#6ee7b7' : '#fcd34d' }}>
                      {isPrepared ? '🔥 ¡LISTA!' : '⏳ EN COCINA'}
                    </Text>
                  </View>

                  {/* Kitchen Notes Box */}
                  {ord.kitchenNotes && (
                    <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', marginVertical: 4 }}>
                      <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: 'bold' }}>📝 Nota de Cocina: {ord.kitchenNotes}</Text>
                    </View>
                  )}

                  {/* Items Cards List */}
                  <View style={{ gap: 8, marginVertical: 4 }}>
                    {((ord.type === 'delivery' || ord.type === 'pickup')
                      ? (ord.items || [])
                      : (ord.items || []).filter((it: any) => {
                          const nameLower = (it.productName || '').toLowerCase();
                          const isSoda =
                            nameLower.includes('coca') ||
                            nameLower.includes('pepsi') ||
                            nameLower.includes('refresco') ||
                            nameLower.includes('gaseosa') ||
                            nameLower.includes('nestea') ||
                            nameLower.includes('agua') ||
                            nameLower.includes('7up') ||
                            nameLower.includes('sprite');
                          return !isSoda;
                        })
                    ).map((it) => (
                      <View key={it.id} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216,230,223,0.15)', padding: 10, gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <View style={{ backgroundColor: '#E7F5ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#10b981' }}>
                              <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '900' }}>{it.productName.includes('Pizza') ? '🍕' : '🥤'} {it.quantity}x</Text>
                            </View>
                            <Text style={{ color: '#102A20', fontSize: 15, fontWeight: 'bold', flex: 1 }}>
                              {it.productName} {it.size ? `(${it.size})` : ''}
                            </Text>
                          </View>
                          {it.isTakeaway && (
                            <View style={{ backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' }}>
                              <Text style={{ color: '#0A4E36', fontSize: 10, fontWeight: '900' }}>📦 PARA LLEVAR</Text>
                            </View>
                          )}
                        </View>

                        {/* 1/2 + 1/2 Pizza Breakdown */}
                        {it.isHalfHalf && it.halfDetails && (
                          <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', gap: 2, marginTop: 2 }}>
                            <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: '900' }}>🌓 DESGLOSE 1/2 Y 1/2:</Text>
                            <Text style={{ color: '#102A20', fontSize: 11, fontWeight: 'bold' }}>
                              • 1ra Mitad: {it.halfDetails.half1Name}
                              {it.halfDetails.half1Removed && it.halfDetails.half1Removed.length > 0 ? ` (🚫 SIN: ${it.halfDetails.half1Removed.join(', ')})` : ''}
                              {it.halfDetails.half1Extras && it.halfDetails.half1Extras.length > 0 ? ` (➕ EXTRAS: ${it.halfDetails.half1Extras.map((e) => e.name).join(', ')})` : ''}
                            </Text>
                            <Text style={{ color: '#102A20', fontSize: 11, fontWeight: 'bold' }}>
                              • 2da Mitad: {it.halfDetails.half2Name}
                              {it.halfDetails.half2Removed && it.halfDetails.half2Removed.length > 0 ? ` (🚫 SIN: ${it.halfDetails.half2Removed.join(', ')})` : ''}
                              {it.halfDetails.half2Extras && it.halfDetails.half2Extras.length > 0 ? ` (➕ EXTRAS: ${it.halfDetails.half2Extras.map((e) => e.name).join(', ')})` : ''}
                            </Text>
                          </View>
                        )}

                        {!it.isHalfHalf && it.removedIngredients && it.removedIngredients.length > 0 && (
                          <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: 'bold' }}>
                            🚫 SIN: {it.removedIngredients.join(', ')}
                          </Text>
                        )}

                        {!it.isHalfHalf && it.extras && it.extras.length > 0 && (
                          <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: 'bold' }}>
                            ➕ EXTRAS: {it.extras.map((e) => e.name).join(', ')}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>

                  {!isPrepared && (
                    <TouchableOpacity
                      style={[styles.btnPrimary, { paddingVertical: 12, marginTop: 4 }]}
                      onPress={async () => {
                        try {
                          await updateOrderStatus(ord.id, 'preparada');
                          Alert.alert('¡Comanda Lista!', 'Enviada a Comandas Listas.');
                        } catch (error) {
                          showSyncError(error);
                        }
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#070707" style={{ marginRight: 6 }} />
                      <Text style={styles.btnPrimaryText}>MARCAR COMO LISTA EN COCINA</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

      </ScrollView>

      {/* FULL MENU MODAL PARA MESERO */}
      <Modal visible={!!activeOrderTarget} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeOrderTarget?.title}</Text>
              <TouchableOpacity onPress={() => setActiveOrderTarget(null)}>
                <Ionicons name="close" size={24} color="#173D2D" />
              </TouchableOpacity>
            </View>

            {/* Inputs: Customer Reference & Kitchen Notes */}
            <View style={{ gap: 8, marginVertical: 8 }}>
              <TextInput
                style={styles.darkInput}
                placeholder="Nombre o Referencia del Cliente"
                placeholderTextColor="#666"
                value={customerName}
                onChangeText={setCustomerName}
              />
              <TextInput
                style={styles.darkInput}
                placeholder="Nota u Observación para Cocina"
                placeholderTextColor="#666"
                value={kitchenNotes}
                onChangeText={setKitchenNotes}
              />
            </View>

            {/* Categories */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 44, marginVertical: 6 }} contentContainerStyle={{ alignItems: 'center' }}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catPill, activeCategory === cat && styles.catPillActive]}
                  onPress={() => setActiveCategory(cat)}
                >
                  <Text style={[styles.catPillText, activeCategory === cat && styles.catPillTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Products List */}
            <ScrollView style={{ flex: 1 }}>
              {products
                .filter((p) => activeCategory === 'Todas' || p.category === activeCategory)
                .map((product) => (
                  <TouchableOpacity key={product.id} style={styles.productRow} onPress={() => handleSelectProduct(product)}>
                    <Image
                      source={{
                        uri: product.image
                          ? product.image.startsWith('/uploads/')
                            ? `${backendUrl}${product.image}`
                            : product.image.replace('http://localhost:3001', backendUrl)
                          : 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80',
                      }}
                      style={styles.prodImg}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prodName}>{product.name}</Text>
                      <Text style={styles.prodPrice}>${product.price.toFixed(2)} USD</Text>
                    </View>
                    <View style={styles.btnPrimarySmall}>
                      <Text style={styles.btnPrimaryText}>+ PEDIR</Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Cart Preview */}
            {cartItems.length > 0 && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', padding: 10, marginTop: 8 }}>
                <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '900', marginBottom: 6, letterSpacing: 1 }}>📋 RESUMEN ({cartItems.length} ITEMS)</Text>
                <ScrollView style={{ maxHeight: 160 }}>
                  {cartItems.map((item) => (
                    <View key={item.id} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>🍕 {item.productName}</Text>
                          {item.size ? <Text style={{ color: '#93c5fd', fontSize: 11, fontWeight: '900', backgroundColor: 'rgba(59,130,246,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' }}>📐 {item.size}</Text> : null}
                          {item.isTakeaway ? <Text style={{ color: '#fcd34d', fontSize: 11, fontWeight: '900', backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' }}>📦 LLEVAR</Text> : null}
                        </View>
                        <Text style={{ color: '#10b981', fontSize: 13, fontWeight: '900' }}>${item.price.toFixed(2)}</Text>
                      </View>

                      {item.isHalfHalf && item.halfDetails ? (
                        <View style={{ marginLeft: 6, marginTop: 4, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: 6 }}>
                          <Text style={{ color: '#0A4E36', fontSize: 11, fontWeight: '900' }}>🌓 MITAD Y MITAD:</Text>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                            • 1ra: {item.halfDetails.half1Name}
                            {item.halfDetails.half1Removed && item.halfDetails.half1Removed.length > 0 ? ` 🚫 SIN: ${item.halfDetails.half1Removed.join(', ')}` : ''}
                            {item.halfDetails.half1Extras && item.halfDetails.half1Extras.length > 0 ? ` ➕ EXTRAS: ${item.halfDetails.half1Extras.map(e => e.name).join(', ')}` : ''}
                          </Text>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                            • 2da: {item.halfDetails.half2Name}
                            {item.halfDetails.half2Removed && item.halfDetails.half2Removed.length > 0 ? ` 🚫 SIN: ${item.halfDetails.half2Removed.join(', ')}` : ''}
                            {item.halfDetails.half2Extras && item.halfDetails.half2Extras.length > 0 ? ` ➕ EXTRAS: ${item.halfDetails.half2Extras.map(e => e.name).join(', ')}` : ''}
                          </Text>
                        </View>
                      ) : null}

                      {!item.isHalfHalf && item.removedIngredients && item.removedIngredients.length > 0 ? (
                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700', marginLeft: 6, marginTop: 2 }}>🚫 SIN: {item.removedIngredients.join(', ')}</Text>
                      ) : null}
                      {!item.isHalfHalf && item.extras && item.extras.length > 0 ? (
                        <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700', marginLeft: 6, marginTop: 2 }}>➕ EXTRAS: {item.extras.map(e => e.name).join(', ')}</Text>
                      ) : null}
                      {item.sugarPreference ? (
                        <Text style={{ color: '#7dd3fc', fontSize: 11, fontWeight: '700', marginLeft: 6, marginTop: 2 }}>🥤 {item.sugarPreference}</Text>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <Text style={{ color: '#10b981', fontWeight: 'bold', fontSize: 16 }}>
                Total: ${cartTotalUSD.toFixed(2)} USD ({cartItems.length} items)
              </Text>

              <TouchableOpacity
                style={[styles.btnPrimary, { height: 48, marginBottom: 8, opacity: cartItems.length === 0 || isSubmittingNative ? 0.5 : 1 }]}
                disabled={cartItems.length === 0 || isSubmittingNative}
                onPress={handleConfirmOrder}
              >
                <Text style={styles.btnPrimaryText}>{isSubmittingNative ? 'ENVIANDO...' : 'ENVIAR COMANDA A COCINA'}</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* MODAL PERSONALIZACIÓN DE PIZZA (MOBILE) */}
      <Modal visible={!!configuringPizza} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{configuringPizza?.name}</Text>
              <TouchableOpacity onPress={() => setConfiguringPizza(null)}>
                <Ionicons name="close" size={24} color="#173D2D" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingVertical: 10 }}>
              {/* TAMAÑO DE PIZZA */}
              <Text style={{ color: '#0A4E36', fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                📏 TAMAÑO DE LA PIZZA:
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  onPress={() => setPizzaSize('Grande')}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: pizzaSize === 'Grande' ? '#10b981' : 'rgba(216,230,223,0.2)',
                    backgroundColor: pizzaSize === 'Grande' ? 'rgba(16,185,129,0.2)' : '#F4FAF6',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: pizzaSize === 'Grande' ? '#10b981' : '#173D2D', fontWeight: '900', fontSize: 13 }}>
                    🍕 Grande (12")
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPizzaSize('Pequeña')}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: pizzaSize === 'Pequeña' ? '#10b981' : 'rgba(216,230,223,0.2)',
                    backgroundColor: pizzaSize === 'Pequeña' ? 'rgba(16,185,129,0.2)' : '#F4FAF6',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: pizzaSize === 'Pequeña' ? '#10b981' : '#173D2D', fontWeight: '900', fontSize: 13 }}>
                    🍕 Pequeña (8") (${(configuringPizza?.priceSmall ?? (configuringPizza ? Math.max(2, configuringPizza.price - 4) : 0)).toFixed(2)} USD)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* TIPO DE SABOR: COMPLETA O MITAD Y MITAD */}
              <Text style={{ color: '#0A4E36', fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                🌓 DIVISIÓN DE SABORES:
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  onPress={() => setPizzaIsHalfHalf(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: !pizzaIsHalfHalf ? '#0A4E36' : 'rgba(216,230,223,0.2)',
                    backgroundColor: !pizzaIsHalfHalf ? 'rgba(245,158,11,0.2)' : '#F4FAF6',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: !pizzaIsHalfHalf ? '#0A4E36' : '#173D2D', fontWeight: '900', fontSize: 12 }}>
                    🍕 Completa (1 Sabor)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPizzaIsHalfHalf(true)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: pizzaIsHalfHalf ? '#0A4E36' : 'rgba(216,230,223,0.2)',
                    backgroundColor: pizzaIsHalfHalf ? 'rgba(245,158,11,0.2)' : '#F4FAF6',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: pizzaIsHalfHalf ? '#0A4E36' : '#173D2D', fontWeight: '900', fontSize: 12 }}>
                    🌓 Mitad y Mitad (2 Sabores)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* CONDICIONAL: MITAD Y MITAD O COMPLETA */}
              {pizzaIsHalfHalf ? (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', gap: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#0A4E36', fontSize: 12, fontWeight: '900' }}>
                    🌓 DESGLOSE E INGREDIENTES DE CADA MITAD:
                  </Text>

                  {/* 1RA MITAD */}
                  <View style={{ backgroundColor: '#F4FAF6', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 6 }}>
                    <Text style={{ color: '#0A4E36', fontSize: 12, fontWeight: '900' }}>1ra Mitad (Sabor A):</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                      {allPizzaProducts.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setPizzaHalf1(p)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: pizzaHalf1?.id === p.id ? '#E7F5ED' : 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: pizzaHalf1?.id === p.id ? '#10b981' : 'transparent',
                            marginRight: 6,
                          }}
                        >
                          <Text style={{ color: pizzaHalf1?.id === p.id ? '#10b981' : '#173D2D', fontSize: 11, fontWeight: 'bold' }}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={{ color: '#28513E', fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>Ingredientes Base 1ra Mitad (Toca para marcar SIN):</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {(pizzaHalf1?.baseIngredients || ['Salsa', 'Queso', 'Orégano']).map((ing) => {
                        const isRemoved = pizzaHalf1Removed.includes(ing);
                        return (
                          <TouchableOpacity
                            key={ing}
                            onPress={() => setPizzaHalf1Removed((prev) => prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing])}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: isRemoved ? '#0A4E36' : '#10b981',
                              backgroundColor: isRemoved ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                            }}
                          >
                            <Text style={{ color: isRemoved ? '#0A4E36' : '#10b981', fontSize: 10, fontWeight: 'bold' }}>
                              {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Extras for 1st Half */}
                    <TouchableOpacity
                      onPress={() => { setExtrasTargetHalf('half1'); setIsExtrasModalOpen(true); }}
                      style={{ backgroundColor: 'rgba(147, 51, 234, 0.2)', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#0A4E36', alignItems: 'center', marginTop: 4 }}
                    >
                      <Text style={{ color: '#e9d5ff', fontWeight: 'bold', fontSize: 11 }}>➕ EXTRAS 1RA MITAD ({pizzaHalf1Extras.length})</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 2DA MITAD */}
                  <View style={{ backgroundColor: '#F4FAF6', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 6 }}>
                    <Text style={{ color: '#0A4E36', fontSize: 12, fontWeight: '900' }}>2da Mitad (Sabor B):</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                      {allPizzaProducts.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => setPizzaHalf2(p)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: pizzaHalf2?.id === p.id ? '#E7F5ED' : 'rgba(255,255,255,0.05)',
                            borderWidth: 1,
                            borderColor: pizzaHalf2?.id === p.id ? '#10b981' : 'transparent',
                            marginRight: 6,
                          }}
                        >
                          <Text style={{ color: pizzaHalf2?.id === p.id ? '#10b981' : '#173D2D', fontSize: 11, fontWeight: 'bold' }}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <Text style={{ color: '#28513E', fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>Ingredientes Base 2da Mitad (Toca para marcar SIN):</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {(pizzaHalf2?.baseIngredients || ['Salsa', 'Queso', 'Orégano']).map((ing) => {
                        const isRemoved = pizzaHalf2Removed.includes(ing);
                        return (
                          <TouchableOpacity
                            key={ing}
                            onPress={() => setPizzaHalf2Removed((prev) => prev.includes(ing) ? prev.filter((i) => i !== ing) : [...prev, ing])}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: isRemoved ? '#0A4E36' : '#10b981',
                              backgroundColor: isRemoved ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                            }}
                          >
                            <Text style={{ color: isRemoved ? '#0A4E36' : '#10b981', fontSize: 10, fontWeight: 'bold' }}>
                              {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Extras for 2nd Half */}
                    <TouchableOpacity
                      onPress={() => { setExtrasTargetHalf('half2'); setIsExtrasModalOpen(true); }}
                      style={{ backgroundColor: 'rgba(147, 51, 234, 0.2)', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#0A4E36', alignItems: 'center', marginTop: 4 }}
                    >
                      <Text style={{ color: '#e9d5ff', fontWeight: 'bold', fontSize: 11 }}>➕ EXTRAS 2DA MITAD ({pizzaHalf2Extras.length})</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* PIZZA COMPLETA BASE INGREDIENTS & EXTRAS */
                <View style={{ gap: 8, marginBottom: 14 }}>
                  <Text style={{ color: '#173D2D', fontSize: 11, fontWeight: 'bold' }}>
                    INGREDIENTES BASE (Toca para marcar SIN):
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(configuringPizza?.baseIngredients || ['Salsa', 'Queso', 'Orégano']).map((ing) => {
                      const isRemoved = pizzaRemovedIngredients.includes(ing);
                      return (
                        <TouchableOpacity
                          key={ing}
                          onPress={() => toggleRemovedIngredient(ing)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: isRemoved ? '#0A4E36' : '#10b981',
                            backgroundColor: isRemoved ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          }}
                        >
                          <Text style={{ color: isRemoved ? '#0A4E36' : '#10b981', fontSize: 11, fontWeight: 'bold' }}>
                            {isRemoved ? `🚫 SIN ${ing}` : `✓ ${ing}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={() => { setExtrasTargetHalf('full'); setIsExtrasModalOpen(true); }}
                    style={{ backgroundColor: 'rgba(147, 51, 234, 0.3)', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#0A4E36', alignItems: 'center', marginTop: 6 }}
                  >
                    <Text style={{ color: '#e9d5ff', fontWeight: 'bold', fontSize: 12 }}>➕ AGREGAR ADICIONALES / EXTRAS ({pizzaExtras.length})</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F4FAF6', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.15)', marginBottom: 14 }}>
                <Text style={{ color: '#102A20', fontWeight: 'bold', fontSize: 12 }}>📦 Empacar esta Pizza para Llevar</Text>
                <Switch value={pizzaIsTakeaway} onValueChange={setPizzaIsTakeaway} thumbColor="#10b981" />
              </View>
            </ScrollView>

            <TouchableOpacity style={[styles.btnPrimary, { flex: 0, height: 50, marginTop: 10, marginBottom: 20 }]} onPress={handleConfirmPizzaAdd}>
              <Text style={styles.btnPrimaryText}>AGREGAR A COMANDA</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* MODAL SELECCIÓN DE EXTRAS (MOBILE) */}
      <Modal visible={isExtrasModalOpen} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {extrasTargetHalf === 'half1'
                  ? `Extras (1ra Mitad: ${pizzaHalf1?.name})`
                  : extrasTargetHalf === 'half2'
                  ? `Extras (2da Mitad: ${pizzaHalf2?.name})`
                  : 'Extras para Toda la Pizza'}
              </Text>
              <TouchableOpacity onPress={() => setIsExtrasModalOpen(false)}>
                <Ionicons name="close" size={24} color="#173D2D" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, paddingVertical: 10 }}>
              {availableExtras.map((extra) => {
                const isSelected =
                  extrasTargetHalf === 'half1'
                    ? pizzaHalf1Extras.some((e) => e.name === extra.name)
                    : extrasTargetHalf === 'half2'
                    ? pizzaHalf2Extras.some((e) => e.name === extra.name)
                    : pizzaExtras.some((e) => e.name === extra.name);

                return (
                  <TouchableOpacity
                    key={extra.id}
                    onPress={() => toggleExtraIngredient(extra)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isSelected ? '#0A4E36' : 'rgba(216,230,223,0.15)',
                      backgroundColor: isSelected ? 'rgba(147, 51, 234, 0.25)' : '#F4FAF6',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#102A20', fontWeight: 'bold', fontSize: 13 }}>{extra.name}</Text>
                    <Text style={{ color: '#10b981', fontWeight: '900', fontSize: 12 }}>+${extra.priceUSD.toFixed(2)} USD</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.btnPrimary} onPress={() => setIsExtrasModalOpen(false)}>
              <Text style={styles.btnPrimaryText}>LISTO (APLICAR ADICIONALES)</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* SIDEBAR DRAWER MODAL CON LOGOUT */}
      <Modal visible={isSidebarOpen} animationType="slide" transparent={true}>
        <View style={styles.drawerOverlay}>
          <SafeAreaView style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>MENÚ DE NAVEGACIÓN</Text>
              <TouchableOpacity onPress={() => setIsSidebarOpen(false)}>
                <Ionicons name="close" size={24} color="#173D2D" />
              </TouchableOpacity>
            </View>

            <View style={styles.statusBox}>
              <Ionicons name="wifi" size={16} color="#10b981" />
              <Text style={{ color: syncError ? '#0A4E36' : '#10b981', fontWeight: 'bold', fontSize: 12 }}>
                {syncError || (isConnected ? `Conectado (${userSession.username})` : 'Conectando...')}
              </Text>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={() => { setIsSidebarOpen(false); logout(); }}>
              <Ionicons name="log-out-outline" size={18} color="#0A4E36" style={{ marginRight: 6 }} />
              <Text style={{ color: '#0A4E36', fontWeight: 'bold', fontSize: 13 }}>CERRAR SESIÓN</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

      {/* MODAL PREFERENCIA DE AZÚCAR EN JUGOS (MOBILE) */}
      <Modal visible={!!configuringJugo} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalContainer, { maxHeight: 380 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>
                  PREFERENCIA DE AZÚCAR
                </Text>
                <Text style={styles.modalTitle}>{configuringJugo?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setConfiguringJugo(null)}>
                <Ionicons name="close" size={24} color="#173D2D" />
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 12, gap: 10 }}>
              <Text style={{ color: '#28513E', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                Selecciona cómo desea el cliente preparar este jugo:
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (configuringJugo) {
                    addSimpleItemToCart(configuringJugo, 'Con azúcar');
                    setConfiguringJugo(null);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  borderWidth: 1,
                  borderColor: '#10b981',
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 20 }}>🍬</Text>
                <View>
                  <Text style={{ color: '#0A4E36', fontWeight: '900', fontSize: 13 }}>CON AZÚCAR</Text>
                  <Text style={{ color: '#28513E', fontSize: 10, fontWeight: 'bold' }}>Preparación normal con azúcar</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (configuringJugo) {
                    addSimpleItemToCart(configuringJugo, 'Poca azúcar');
                    setConfiguringJugo(null);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  borderWidth: 1,
                  borderColor: '#f59e0b',
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 20 }}>🥄</Text>
                <View>
                  <Text style={{ color: '#78350f', fontWeight: '900', fontSize: 13 }}>POCA AZÚCAR</Text>
                  <Text style={{ color: '#92400e', fontSize: 10, fontWeight: 'bold' }}>Toque ligero de azúcar</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (configuringJugo) {
                    addSimpleItemToCart(configuringJugo, 'Sin azúcar');
                    setConfiguringJugo(null);
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  borderWidth: 1,
                  borderColor: '#ef4444',
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 20 }}>🍋</Text>
                <View>
                  <Text style={{ color: '#7f1d1d', fontWeight: '900', fontSize: 13 }}>SIN AZÚCAR</Text>
                  <Text style={{ color: '#991b1b', fontSize: 10, fontWeight: 'bold' }}>100% natural, sin añadir azúcar</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.cancelIpBtn, { marginTop: 4 }]} onPress={() => setConfiguringJugo(null)}>
              <Text style={styles.cancelIpBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

export default function App() {
  return (
    <AppProvider>
      <NativeAppContent />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4FAF6', paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0 },
  loginScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', maxWidth: 400, backgroundColor: '#0B2A1A80', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)', padding: 24, alignItems: 'center', gap: 14 },
  brandIconBox: { width: 70, height: 70, borderRadius: 20, backgroundColor: '#E7F5ED', borderWidth: 1, borderColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  loginTitle: { color: '#102A20', fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  loginSub: { color: '#173D2D', fontSize: 11, textAlign: 'center', opacity: 0.7 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239, 68, 68, 0.2)', borderWidth: 1, borderColor: '#0A4E36', padding: 10, borderRadius: 12, width: '100%' },
  errorText: { color: '#0A4E36', fontSize: 11, fontWeight: 'bold' },
  inputGroup: { width: '100%', gap: 4 },
  inputLabel: { color: '#173D2D', fontSize: 11, fontWeight: 'bold' },
  darkInput: { backgroundColor: '#F4FAF6', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)', color: '#102A20', fontSize: 12, paddingHorizontal: 14, paddingVertical: 10, width: '100%', fontWeight: 'bold' },
  loginBtn: { width: '100%', backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6 },
  loginBtnText: { color: '#F4FAF6', fontSize: 12, fontWeight: '900' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, width: '100%', justifyContent: 'center' },
  statusBadgeConnected: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10b981' },
  statusBadgeOffline: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#0A4E36' },
  serverConfigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: 'rgba(251, 191, 36, 0.1)', borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.4)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  serverConfigBtnText: { color: '#0A4E36', fontSize: 11, fontWeight: 'bold' },
  serverModalContent: { width: '90%', maxWidth: 400, backgroundColor: '#F4FAF6', borderRadius: 24, borderWidth: 1, borderColor: '#10b981', padding: 20, gap: 14 },
  serverModalSub: { color: '#28513E', fontSize: 11, lineHeight: 16 },
  saveIpBtn: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  saveIpBtnText: { color: '#F4FAF6', fontSize: 12, fontWeight: 'bold' },
  cancelIpBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelIpBtnText: { color: '#28513E', fontSize: 11, fontWeight: 'bold' },
  navbar: { height: 60, backgroundColor: '#F4FAF6', borderBottomWidth: 1, borderBottomColor: 'rgba(216, 230, 223, 0.15)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  iconBtn: { padding: 8, backgroundColor: '#E7F5ED', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)' },
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E7F5ED', borderWidth: 1, borderColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  brandName: { color: '#102A20', fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  badgeTag: { backgroundColor: '#E7F5ED', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#10b981' },
  badgeTagText: { color: '#10b981', fontSize: 8, fontWeight: '900' },
  roleBadge: { backgroundColor: '#E7F5ED', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#10b981' },
  roleBadgeText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  content: { flex: 1, padding: 16 },
  screenSection: { gap: 14 },
  bannerCardWeb: { backgroundColor: '#E7F5ED', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIconSquare: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#F4FAF6', borderWidth: 1, borderColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  bannerTitleWeb: { color: '#102A20', fontSize: 16, fontWeight: '900' },
  realtimePill: { backgroundColor: 'rgba(16, 185, 129, 0.2)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  realtimePillText: { color: '#10b981', fontSize: 8, fontWeight: '900' },
  bannerSubWeb: { color: '#173D2D', fontSize: 11, opacity: 0.7, marginTop: 2 },
  sectionHeadingWeb: { color: '#173D2D', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  specialCardWeb: { backgroundColor: '#F4FAF6', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  specialIconSquare: { width: 50, height: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miniPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  miniPillText: { fontSize: 8, fontWeight: '900' },
  specialTitleWeb: { color: '#102A20', fontSize: 15, fontWeight: '900', marginTop: 2 },
  specialSubWeb: { color: '#173D2D', fontSize: 10, opacity: 0.6, marginTop: 1 },
  plusCircleBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', alignItems: 'center', justifyContent: 'center' },
  tableGridWeb: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tableCardWebItem: { width: '48%', borderRadius: 20, borderWidth: 1, padding: 12, gap: 4 },
  tableCardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tablePizzaIconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E7F5ED', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center', justifyContent: 'center' },
  tableBadgePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  tableBadgeText: { fontSize: 8, fontWeight: '900' },
  tableTitleText: { color: '#102A20', fontSize: 15, fontWeight: '900', marginTop: 4 },
  tableCapText: { color: '#173D2D', fontSize: 10, opacity: 0.6 },
  tableCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.1)', paddingTop: 8, marginTop: 6 },
  tableFooterAction: { color: '#10b981', fontSize: 10, fontWeight: '900' },
  posCard: { backgroundColor: '#F4FAF6', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)', padding: 14, gap: 8, marginBottom: 10 },
  posHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  posTitle: { color: '#102A20', fontSize: 15, fontWeight: 'bold' },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold' },
  itemListBg: { backgroundColor: '#0B2A1A40', padding: 10, borderRadius: 12 },
  itemLineText: { color: '#173D2D', fontSize: 12, marginBottom: 2 },
  totalUSDVal: { color: '#10b981', fontSize: 15, fontWeight: '900' },
  btnPrimary: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnPrimaryText: { color: '#F4FAF6', fontSize: 13, fontWeight: '900' },
  btnPrimarySmall: { backgroundColor: '#10b981', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  btnSecondary: { flex: 1, backgroundColor: '#E7F5ED', borderWidth: 1, borderColor: '#0A4E36', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  btnSecondaryText: { color: '#0A4E36', fontSize: 10, fontWeight: 'bold' },
  kdsCard: { backgroundColor: '#F4FAF6', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)', padding: 14, gap: 10, marginBottom: 10 },
  aiBox: { backgroundColor: '#0B2A1A40', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(216, 230, 223, 0.2)', padding: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(244,250,246,0.98)' },
  modalContainer: { flex: 1, padding: 16, paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(216,230,223,0.15)' },
  modalTitle: { color: '#102A20', fontSize: 16, fontWeight: 'bold' },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(11,42,26,0.4)', borderWidth: 1, borderColor: 'rgba(216,230,223,0.15)', marginRight: 8, height: 36, justifyContent: 'center', alignItems: 'center' },
  catPillActive: { backgroundColor: '#E7F5ED', borderColor: '#10b981' },
  catPillText: { color: '#173D2D', fontSize: 12, fontWeight: 'bold' },
  catPillTextActive: { color: '#10b981', fontWeight: 'bold' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F4FAF6', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(216,230,223,0.15)', padding: 10, marginBottom: 8 },
  prodImg: { width: 44, height: 44, borderRadius: 10 },
  prodName: { color: '#102A20', fontSize: 13, fontWeight: 'bold' },
  prodPrice: { color: '#10b981', fontSize: 12, fontWeight: 'bold' },
  modalFooter: { borderTopWidth: 1, borderTopColor: 'rgba(216,230,223,0.15)', paddingTop: 12, paddingBottom: 20, gap: 10 },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(244,250,246,0.98)' },
  drawerContainer: { flex: 1, padding: 20, gap: 12 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  drawerTitle: { color: '#102A20', fontSize: 14, fontWeight: 'bold' },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E7F5ED', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#10b981' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: '#0A4E36', padding: 12, borderRadius: 14, marginTop: 10 },
});
