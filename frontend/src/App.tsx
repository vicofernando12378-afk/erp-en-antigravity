import React, { useState } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CustomersView } from './views/CustomersView';
import { InventoryView } from './views/InventoryView';
import { SalesOrdersView } from './views/SalesOrdersView';
import { InvoicesView } from './views/InvoicesView';
import { PaymentsView } from './views/PaymentsView';
import { ShipmentsView } from './views/ShipmentsView';
import { SuppliersView } from './views/SuppliersView';
import { PurchasesView } from './views/PurchasesView';
import { ReceivesView } from './views/ReceivesView';
import { TransfersView } from './views/TransfersView';
import { ReportsView } from './views/ReportsView';
import { SettingsView } from './views/SettingsView';
import { TeamView } from './views/TeamView';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  const titles: Record<string, string> = {
    dashboard: 'Panel de Control Principal',
    customers: 'Directorio de Clientes',
    inventory: 'Control de Inventario y Stock',
    orders: 'Pedidos de Venta',
    invoices: 'Facturación y Cuentas por Cobrar',
    payments: 'Gestión de Cobros y Recibos',
    shipments: 'Despachos y Guías de Envío',
    suppliers: 'Directorio de Proveedores',
    purchases: 'Órdenes de Compra y Abastecimiento',
    receives: 'Recepciones de Mercancía en Almacén',
    transfers: 'Traslados entre Almacenes',
    reports: 'Suite Analítica y Reportes',
    settings: 'Configuración y Empresa',
    team: 'Equipo de Trabajo y Roles (RBAC)',
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView onNavigate={setCurrentView} />;
      case 'customers':
        return <CustomersView />;
      case 'inventory':
        return <InventoryView />;
      case 'orders':
        return <SalesOrdersView />;
      case 'invoices':
        return <InvoicesView />;
      case 'payments':
        return <PaymentsView />;
      case 'shipments':
        return <ShipmentsView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchases':
        return <PurchasesView />;
      case 'receives':
        return <ReceivesView onNavigate={setCurrentView} />;
      case 'transfers':
        return <TransfersView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      case 'team':
        return <TeamView />;
      default:
        return <DashboardView onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      {/* Modern Sidebar */}
      <Sidebar currentView={currentView} onSelectView={setCurrentView} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={titles[currentView] || 'StockPile Cloud'} />
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
