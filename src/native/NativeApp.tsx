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
} from 'react-native';

export function NativeApp() {
  const [activeRoute, setActiveRoute] = useState<'mesonero' | 'caja' | 'cocina' | 'admin'>('mesonero');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Local state for orders
  const [selectedTable, setSelectedTable] = useState<number>(1);
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartTotal, setCartTotal] = useState<number>(0);

  const tables = [
    { number: 1, status: 'Ocupada', color: '#0A4E36' },
    { number: 2, status: 'Ocupada', color: '#0A4E36' },
    { number: 3, status: 'Por Cobrar', color: '#0A4E36' },
    { number: 4, status: 'Libre', color: '#10b981' },
    { number: 5, status: 'Libre', color: '#10b981' },
    { number: 6, status: 'Reservada', color: '#0A4E36' },
    { number: 7, status: 'Libre', color: '#10b981' },
    { number: 8, status: 'Libre', color: '#10b981' },
  ];

  const menuItems = [
    { id: '1', name: 'Margherita Especial', price: 12.0, desc: 'Salsa San Marzano, mozzarella, albahaca fresca' },
    { id: '2', name: 'Pepperoni Suprema', price: 14.5, desc: 'Abundante doble pepperoni crocante' },
    { id: '3', name: 'Prosciutto e Funghi', price: 16.0, desc: 'Jamón serrano, hongos silvestres' },
    { id: '4', name: 'Quattro Formaggi', price: 15.0, desc: 'Gorgonzola, parmesano, mozzarella, fontina' },
  ];

  const addToCart = (price: number) => {
    setCartCount((prev) => prev + 1);
    setCartTotal((prev) => prev + price);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4FAF6" />

      {/* NATIVE NAVBAR */}
      <View style={styles.navbar}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setIsSidebarOpen(true)}>
          <Text style={styles.menuBtnText}>☰</Text>
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Text style={styles.brandName}>BASILICO</Text>
          <View style={styles.badgeTag}>
            <Text style={styles.badgeTagText}>PIZZERIA</Text>
          </View>
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {activeRoute === 'mesonero' ? 'MESONERO' :
             activeRoute === 'caja' ? 'CAJERO POS' :
             activeRoute === 'cocina' ? 'COCINA KDS' : 'ADMIN'}
          </Text>
        </View>
      </View>

      {/* DYNAMIC NATIVE SCREEN VIEW */}
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* MESONERO SCREEN */}
        {activeRoute === 'mesonero' && (
          <View style={styles.screenContainer}>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>Módulo Mesonero • Salón Principal</Text>
              <Text style={styles.headerSubtitle}>Toma de comandas táctil. Las órdenes se envían a Caja POS.</Text>
            </View>

            {/* Table Map */}
            <Text style={styles.sectionTitle}>Mapa de Mesas (Salón Principal)</Text>
            <View style={styles.tableGrid}>
              {tables.map((t) => (
                <TouchableOpacity
                  key={t.number}
                  style={[
                    styles.tableCard,
                    selectedTable === t.number && styles.tableCardSelected,
                    { borderColor: t.color },
                  ]}
                  onPress={() => setSelectedTable(t.number)}
                >
                  <View style={[styles.statusDot, { backgroundColor: t.color }]} />
                  <Text style={styles.tableName}>Mesa {t.number}</Text>
                  <Text style={styles.tableStatus}>{t.status}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Menu Catalog */}
            <Text style={styles.sectionTitle}>Catálogo de Pizzas (Mesa #{selectedTable})</Text>
            {menuItems.map((item) => (
              <View key={item.id} style={styles.productCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.name}</Text>
                  <Text style={styles.productDesc}>{item.desc}</Text>
                  <Text style={styles.productPrice}>${item.price.toFixed(2)} USD</Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(item.price)}>
                  <Text style={styles.addBtnText}>+ AGREGAR</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* CAJA POS SCREEN */}
        {activeRoute === 'caja' && (
          <View style={styles.screenContainer}>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>Módulo Cajero POS • Cobranza</Text>
              <Text style={styles.headerSubtitle}>Procesa el pago. Al cobrar, se aprueba el envío a Cocina KDS.</Text>
            </View>

            <View style={styles.orderCardPOS}>
              <Text style={styles.posOrderTitle}>ORD-101 • Mesa #1</Text>
              <Text style={styles.posItemsText}>1x Margherita, 1x Pepperoni</Text>
              <Text style={styles.posTotalText}>Total: $26.50 USD</Text>

              <TouchableOpacity style={styles.payBtn} onPress={() => alert('¡Pago Procesado! Orden enviada a Cocina KDS.')}>
                <Text style={styles.payBtnText}>COBRAR & MANDAR A COCINA</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* COCINA KDS SCREEN */}
        {activeRoute === 'cocina' && (
          <View style={styles.screenContainer}>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>Pantalla KDS Cocina • Comandas Pagadas</Text>
              <Text style={styles.headerSubtitle}>Solo comandas cobradas en Caja POS.</Text>
            </View>

            <View style={styles.kdsCard}>
              <View style={styles.kdsHeader}>
                <Text style={styles.kdsOrderNum}>ORD-101 (Mesa #1)</Text>
                <View style={styles.timerBadge}>
                  <Text style={styles.timerText}>8m</Text>
                </View>
              </View>
              <Text style={styles.kdsItem}>• 1x Margherita (Sin Cebolla)</Text>
              <Text style={styles.kdsItem}>• 1x Pepperoni Suprema</Text>

              <TouchableOpacity style={styles.readyBtn} onPress={() => alert('Comanda marcada como Lista')}>
                <Text style={styles.readyBtnText}>MARCAR COMO LISTO</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ADMIN SCREEN */}
        {activeRoute === 'admin' && (
          <View style={styles.screenContainer}>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>Panel Administrador SaaS</Text>
              <Text style={styles.headerSubtitle}>Ingresos del día y control de inventario.</Text>
            </View>

            <View style={styles.kpiRow}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiTitle}>Ingresos Hoy</Text>
                <Text style={styles.kpiValue}>$119.50 USD</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiTitle}>Ventas POS</Text>
                <Text style={styles.kpiValue}>8 Ordenes</Text>
              </View>
            </View>
          </View>
        )}

      </ScrollView>

      {/* BOTTOM FLOATING CART BAR FOR MESONERO */}
      {activeRoute === 'mesonero' && cartCount > 0 && (
        <View style={styles.cartBar}>
          <Text style={styles.cartBarText}>Comanda ({cartCount} items)</Text>
          <TouchableOpacity style={styles.sendCajaBtn} onPress={() => alert(`Comanda de $${cartTotal.toFixed(2)} enviada a Caja POS`)}>
            <Text style={styles.sendCajaBtnText}>ENVIAR A CAJA (${cartTotal.toFixed(2)})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* NATIVE SLIDE-OVER SIDEBAR DRAWER MODAL */}
      <Modal visible={isSidebarOpen} animationType="slide" transparent={true}>
        <View style={styles.drawerOverlay}>
          <SafeAreaView style={styles.drawerContainer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>MENÚ DE ROLES & PANTALLAS</Text>
              <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.drawerSectionLabel}>SELECCIONA MÓDULO:</Text>

            <TouchableOpacity
              style={[styles.drawerItem, activeRoute === 'mesonero' && styles.drawerItemActive]}
              onPress={() => { setActiveRoute('mesonero'); setIsSidebarOpen(false); }}
            >
              <Text style={styles.drawerItemIcon}>🍽️</Text>
              <View>
                <Text style={styles.drawerItemTitle}>Módulo Mesonero</Text>
                <Text style={styles.drawerItemSub}>Mapa de mesas y toma de pedidos</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.drawerItem, activeRoute === 'caja' && styles.drawerItemActive]}
              onPress={() => { setActiveRoute('caja'); setIsSidebarOpen(false); }}
            >
              <Text style={styles.drawerItemIcon}>💳</Text>
              <View>
                <Text style={styles.drawerItemTitle}>Módulo Cajero POS</Text>
                <Text style={styles.drawerItemSub}>Cobro multimoneda y aprobación KDS</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.drawerItem, activeRoute === 'cocina' && styles.drawerItemActive]}
              onPress={() => { setActiveRoute('cocina'); setIsSidebarOpen(false); }}
            >
              <Text style={styles.drawerItemIcon}>🔥</Text>
              <View>
                <Text style={styles.drawerItemTitle}>Módulo Cocina KDS</Text>
                <Text style={styles.drawerItemSub}>Pizzas pagadas en horno con temporizador</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.drawerItem, activeRoute === 'admin' && styles.drawerItemActive]}
              onPress={() => { setActiveRoute('admin'); setIsSidebarOpen(false); }}
            >
              <Text style={styles.drawerItemIcon}>📊</Text>
              <View>
                <Text style={styles.drawerItemTitle}>Módulo Administrador</Text>
                <Text style={styles.drawerItemSub}>KPIs, inventario e IA Basilico</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.ratesBox}>
              <Text style={styles.ratesTitle}>Tasas del Día:</Text>
              <Text style={styles.ratesText}>1 USD = $3,100 COP | 1 Bs = 3.20 COP</Text>
            </View>

            <Text style={styles.drawerFooter}>MUGROSITO • POS RESTAURANTE</Text>
          </SafeAreaView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4FAF6',
  },
  navbar: {
    height: 60,
    backgroundColor: '#F4FAF6',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(216, 230, 223, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  menuBtn: {
    padding: 8,
    backgroundColor: '#E7F5ED',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
  },
  menuBtnText: {
    color: '#173D2D',
    fontSize: 20,
    fontWeight: 'bold',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    color: '#102A20',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  badgeTag: {
    backgroundColor: '#E7F5ED',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.3)',
  },
  badgeTagText: {
    color: '#173D2D',
    fontSize: 8,
    fontWeight: 'bold',
  },
  roleBadge: {
    backgroundColor: '#E7F5ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  roleBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  screenContainer: {
    gap: 16,
  },
  headerCard: {
    backgroundColor: '#E7F5ED',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
  },
  headerTitle: {
    color: '#102A20',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#173D2D',
    fontSize: 12,
    opacity: 0.7,
  },
  sectionTitle: {
    color: '#102A20',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tableCard: {
    width: '23%',
    backgroundColor: '#F4FAF6',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCardSelected: {
    backgroundColor: '#E7F5ED',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  tableName: {
    color: '#102A20',
    fontSize: 11,
    fontWeight: 'bold',
  },
  tableStatus: {
    color: '#173D2D',
    fontSize: 8,
    opacity: 0.7,
  },
  productCard: {
    backgroundColor: '#F4FAF6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.15)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  productName: {
    color: '#102A20',
    fontSize: 14,
    fontWeight: 'bold',
  },
  productDesc: {
    color: '#173D2D',
    fontSize: 10,
    opacity: 0.6,
    marginTop: 2,
  },
  productPrice: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 4,
  },
  addBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#F4FAF6',
    fontSize: 10,
    fontWeight: '900',
  },
  orderCardPOS: {
    backgroundColor: '#F4FAF6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
    padding: 16,
    gap: 8,
  },
  posOrderTitle: {
    color: '#102A20',
    fontSize: 16,
    fontWeight: 'bold',
  },
  posItemsText: {
    color: '#173D2D',
    fontSize: 12,
    opacity: 0.7,
  },
  posTotalText: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  payBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  payBtnText: {
    color: '#F4FAF6',
    fontSize: 12,
    fontWeight: '900',
  },
  kdsCard: {
    backgroundColor: '#F4FAF6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
    padding: 16,
    gap: 8,
  },
  kdsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kdsOrderNum: {
    color: '#102A20',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timerBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  timerText: {
    color: '#F4FAF6',
    fontSize: 12,
    fontWeight: 'bold',
  },
  kdsItem: {
    color: '#173D2D',
    fontSize: 13,
  },
  readyBtn: {
    backgroundColor: '#E7F5ED',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  readyBtnText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: '#F4FAF6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
    padding: 16,
  },
  kpiTitle: {
    color: '#173D2D',
    fontSize: 11,
    opacity: 0.6,
  },
  kpiValue: {
    color: '#102A20',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  cartBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#E7F5ED',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartBarText: {
    color: '#102A20',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sendCajaBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  sendCajaBtnText: {
    color: '#F4FAF6',
    fontSize: 11,
    fontWeight: '900',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 7, 7, 0.95)',
  },
  drawerContainer: {
    flex: 1,
    padding: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(216, 230, 223, 0.2)',
    marginBottom: 20,
  },
  drawerTitle: {
    color: '#102A20',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#E7F5ED',
    borderRadius: 12,
  },
  closeBtnText: {
    color: '#173D2D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  drawerSectionLabel: {
    color: '#173D2D',
    fontSize: 10,
    fontWeight: 'bold',
    opacity: 0.5,
    marginBottom: 12,
    letterSpacing: 1,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(11, 42, 26, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.15)',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  drawerItemActive: {
    backgroundColor: '#E7F5ED',
    borderColor: '#10b981',
  },
  drawerItemIcon: {
    fontSize: 22,
  },
  drawerItemTitle: {
    color: '#102A20',
    fontSize: 14,
    fontWeight: 'bold',
  },
  drawerItemSub: {
    color: '#173D2D',
    fontSize: 10,
    opacity: 0.6,
  },
  ratesBox: {
    marginTop: 'auto',
    backgroundColor: '#F4FAF6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(216, 230, 223, 0.2)',
    padding: 14,
    marginBottom: 16,
  },
  ratesTitle: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  ratesText: {
    color: '#173D2D',
    fontSize: 11,
  },
  drawerFooter: {
    color: '#173D2D',
    fontSize: 9,
    opacity: 0.4,
    textAlign: 'center',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
