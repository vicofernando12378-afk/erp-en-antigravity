import { onRequest } from 'firebase-functions/v2/https';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { db, COLLECTIONS } from './config/firebase';

import { InventoryService } from './modules/inventory/inventory.service';
import { PurchaseService } from './modules/purchases/purchase.service';
import { SalesService } from './modules/sales/sales.service';
import { PaymentService } from './modules/payments/payment.service';
import { ShipmentService } from './modules/shipments/shipment.service';
import { PdfService } from './modules/reports/pdf.service';
import { UserService } from './modules/users/user.service';
import { authGuard, roleGuard, AuthenticatedRequest } from './middleware/authGuard';
import { onStockAlert } from './triggers/onStockAlert';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Normalizar prefijos para soportar rewrites de Firebase Hosting (/api, /api/v1, /v1)
app.use((req: Request, _res: Response, next) => {
  if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/');
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.replace('/api/', '/');
  } else if (req.url.startsWith('/v1/')) {
    req.url = req.url.replace('/v1/', '/');
  }
  next();
});

// CSRF dummy endpoint para compatibilidad
app.get('/csrf', (_req: Request, res: Response) => {
  res.json({ token: 'crm-erps-csrf-token' });
});

// Healthcheck
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'ERP-CRM Serverless Backend',
    region: 'us-central1',
    timestamp: new Date().toISOString()
  });
});

// List items con paginación estricta para Free Tier (default 20)
app.get('/items', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.ITEMS)
      .limit(limit)
      .get();

    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: items.length, items });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar nuevo Producto en Catálogo e Ingreso Inicial de Inventario
app.post('/items', async (req: Request, res: Response) => {
  try {
    const { stock_id, description, category_name, purchase_price, sale_price, location_id = 'PL', initial_stock = 0, units = 'uds' } = req.body;
    if (!stock_id || !description) {
      res.status(400).json({ error: 'stock_id y description son obligatorios.' });
      return;
    }

    const docId = `ITM-${stock_id}`;
    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(docId);
    const existing = await itemRef.get();
    if (existing.exists) {
      res.status(400).json({ error: `El producto con código SKU ${stock_id} ya existe.` });
      return;
    }

    const initStockNum = Math.max(0, Number(initial_stock) || 0);
    const itemData = {
      id: docId,
      stock_id: String(stock_id),
      description: String(description),
      category_name: String(category_name || 'General'),
      units: String(units || 'uds'),
      purchase_price: Number(purchase_price) || 0,
      sale_price: Number(sale_price) || 0,
      stocks: {
        [location_id]: initStockNum
      },
      total_stock: initStockNum,
      is_active: true,
      created_at: new Date()
    };

    const batch = db.batch();
    batch.set(itemRef, itemData);

    if (initStockNum > 0) {
      const moveRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();
      batch.set(moveRef, {
        id: moveRef.id,
        stock_id: String(stock_id),
        loc_code: String(location_id),
        trans_type: 'INITIAL_STOCK',
        qty: initStockNum,
        price: Number(purchase_price) || 0,
        reference: `initial_${stock_id}`,
        notes: 'Ingreso inicial al registrar producto en catálogo',
        created_at: new Date()
      });
    }

    await batch.commit();
    res.status(201).json(itemData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List customers con paginación estricta
app.get('/customers', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.CUSTOMERS)
      .limit(limit)
      .get();

    const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: customers.length, customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List sales orders con paginación estricta
app.get('/orders', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.SALES_ORDERS)
      .limit(limit)
      .get();

    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: orders.length, orders });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- FASE 3: MÓDULOS TRANSACCIONALES (INVENTARIO Y COMPRAS) ---

// Ajuste atómico de stock (ingreso / merma)
app.post('/inventory/adjust', async (req: Request, res: Response) => {
  try {
    const result = await InventoryService.adjustStock(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Transferencia atómica entre almacenes
app.post('/inventory/transfer', async (req: Request, res: Response) => {
  try {
    const result = await InventoryService.transferStock(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Crear Orden de Compra (PO)
app.post('/purchases', async (req: Request, res: Response) => {
  try {
    const po = await PurchaseService.createPurchaseOrder(req.body);
    res.status(201).json(po);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Órdenes de Compra
app.get('/purchases', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.PURCHASES).limit(limit).get();
    const purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: purchases.length, purchases });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Recepción física de mercadería de PO (impacto en stock)
app.post('/purchases/:id/receive', async (req: Request, res: Response) => {
  try {
    const result = await PurchaseService.receiveGoods({
      purchase_id: String(req.params.id),
      location_id: req.body.location_id,
      items_received: req.body.items_received,
      user_id: req.body.user_id,
      notes: req.body.notes
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Ledger de movimientos de inventario (auditoría inmutable)
app.get('/stock-moves', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.STOCK_MOVES)
      .limit(limit)
      .get();
    const moves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: moves.length, moves });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- FASE 4: MÓDULO COMERCIAL (VENTAS, FACTURACIÓN, PAGOS Y DESPACHOS) ---

// Crear Pedido de Venta
app.post('/orders', async (req: Request, res: Response) => {
  try {
    const order = await SalesService.createOrder(req.body);
    res.status(201).json(order);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Convertir Pedido en Factura atómicamente con descuento de stock
app.post('/orders/:id/invoice', async (req: Request, res: Response) => {
  try {
    const result = await SalesService.convertOrderToInvoice(String(req.params.id), req.body.user_id);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Facturas
app.get('/invoices', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.INVOICES).limit(limit).get();
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: invoices.length, invoices });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Documento formateado de Factura para impresión / PDF
app.get('/invoices/:id/print', async (req: Request, res: Response) => {
  try {
    const doc = await PdfService.getInvoiceDocument(String(req.params.id));
    res.json(doc);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Registrar Cobranza / Pago a Factura
app.post('/invoices/:id/pay', async (req: Request, res: Response) => {
  try {
    const result = await PaymentService.registerPayment({
      invoice_id: String(req.params.id),
      amount: Number(req.body.amount),
      payment_method: req.body.payment_method || 'cash',
      reference: req.body.reference,
      user_id: req.body.user_id
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Recibos de Pago
app.get('/payments', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.PAYMENTS).limit(limit).get();
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: payments.length, payments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Crear Guía de Remisión / Despacho de Pedido
app.post('/orders/:id/ship', async (req: Request, res: Response) => {
  try {
    const shipment = await ShipmentService.createShipment({
      order_id: String(req.params.id),
      customer_id: req.body.customer_id,
      shipping_address: req.body.shipping_address,
      carrier: req.body.carrier,
      tracking_number: req.body.tracking_number,
      notes: req.body.notes,
      user_id: req.body.user_id
    });
    res.status(201).json(shipment);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Despachos
app.get('/shipments', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.SHIPMENTS).limit(limit).get();
    const shipments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: shipments.length, shipments });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Marcar despacho como entregado
app.post('/shipments/:id/deliver', async (req: Request, res: Response) => {
  try {
    const result = await ShipmentService.markDelivered(String(req.params.id));
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- SUBMÓDULOS EXPANDIDOS: PROVEEDORES, RECEPCIONES, TRASLADOS, REPORTES Y SETTINGS ---

// Listar Proveedores
app.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.SUPPLIERS).limit(limit).get();
    const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: suppliers.length, suppliers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Crear o Actualizar Proveedor
app.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `SUPP-${Date.now().toString().slice(-4)}`;
    const suppRef = db.collection(COLLECTIONS.SUPPLIERS).doc(id);
    const data = {
      id,
      supp_name: req.body.supp_name,
      email: req.body.email || '',
      phone: req.body.phone || '',
      address: req.body.address || '',
      tax_id: req.body.tax_id || '',
      updated_at: new Date(),
      created_at: new Date()
    };
    await suppRef.set(data, { merge: true });
    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Historial de Recepciones de Mercadería
app.get('/receives', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.RECEIVES).limit(limit).get();
    const receives = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: receives.length, receives });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Listar Historial de Traslados de Inventario
app.get('/transfers', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const snapshot = await db.collection(COLLECTIONS.STOCK_TRANSFERS).limit(limit).get();
    const transfers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: transfers.length, transfers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Listar Almacenes / Sedes
app.get('/locations', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.LOCATIONS).get();
    const locations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: locations.length, locations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Suite de Reportes: Stock Valorizado en Mano (Costo, Venta, Margen)
app.get('/reports/stock-on-hand', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.ITEMS).get();
    let totalQty = 0;
    let costValue = 0;
    let retailValue = 0;

    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      const qty = data.total_stock || 0;
      const purchasePrice = data.purchase_price || 0;
      const salePrice = data.sale_price || 0;
      const itemCostVal = qty * purchasePrice;
      const itemRetailVal = qty * salePrice;
      const profitVal = itemRetailVal - itemCostVal;

      totalQty += qty;
      costValue += itemCostVal;
      retailValue += itemRetailVal;

      return {
        id: doc.id,
        stock_id: data.stock_id,
        description: data.description,
        category: data.category_name || 'General',
        stocks: data.stocks || {},
        total_stock: qty,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        cost_value: itemCostVal,
        retail_value: itemRetailVal,
        profit_value: profitVal,
        margin_percent: itemRetailVal > 0 ? ((profitVal / itemRetailVal) * 100).toFixed(1) : '0.0'
      };
    });

    const profitValue = retailValue - costValue;
    const overallMargin = retailValue > 0 ? ((profitValue / retailValue) * 100).toFixed(1) : '0.0';

    res.json({
      summary: {
        total_items: items.length,
        total_units: totalQty,
        cost_value: costValue,
        retail_value: retailValue,
        profit_value: profitValue,
        margin_percent: overallMargin
      },
      items
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Suite de Reportes: Resumen Comercial
app.get('/reports/sales-summary', async (req: Request, res: Response) => {
  try {
    const [ordersSnap, invoicesSnap, paymentsSnap] = await Promise.all([
      db.collection(COLLECTIONS.SALES_ORDERS).get(),
      db.collection(COLLECTIONS.INVOICES).get(),
      db.collection(COLLECTIONS.PAYMENTS).get()
    ]);

    const totalOrders = ordersSnap.size;
    let totalInvoiced = 0;
    let totalPaid = 0;

    invoicesSnap.docs.forEach(d => {
      const data = d.data();
      totalInvoiced += (data.total_amount || 0);
      totalPaid += (data.paid_amount || 0);
    });

    res.json({
      total_orders: totalOrders,
      total_invoices: invoicesSnap.size,
      total_payments_recorded: paymentsSnap.size,
      total_invoiced_amount: totalInvoiced,
      total_collected_amount: totalPaid,
      outstanding_balance: totalInvoiced - totalPaid
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Configuración de Empresa (Settings)
app.get('/settings', async (req: Request, res: Response) => {
  try {
    const docSnap = await db.collection(COLLECTIONS.SETTINGS).doc('general').get();
    if (!docSnap.exists) {
      const defaultSettings = {
        company_name: 'StockPile ERP Corp',
        tax_id: 'RUC 20601234567',
        phone: '+51 987 654 321',
        email: 'contacto@stockpile-erp.com',
        address: 'Av. Principal 123, Lima, Perú',
        default_currency: 'USD',
        currency_symbol: '$',
        default_tax_rate: 18,
        stock_threshold_alert: 10
      };
      await db.collection(COLLECTIONS.SETTINGS).doc('general').set(defaultSettings);
      res.json(defaultSettings);
      return;
    }
    res.json(docSnap.data());
    return;
  } catch (error: any) {
    res.status(500).json({ error: error.message });
    return;
  }
});

app.post('/settings', async (req: Request, res: Response) => {
  try {
    await db.collection(COLLECTIONS.SETTINGS).doc('general').set(req.body, { merge: true });
    res.json({ success: true, settings: req.body });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Listar Miembros del Equipo
app.get('/users/list', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection(COLLECTIONS.USERS).get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ count: users.length, users });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- FASE 5: AUTENTICACIÓN, GESTIÓN DE USUARIOS Y RBAC ---

// Crear Usuario y asignar Claims de Rol (Solo Administradores)
app.post('/users', authGuard, roleGuard(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await UserService.createUser(req.body);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener perfil y permisos del usuario en sesión
app.get('/users/me', authGuard, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await UserService.getUserProfile(req.user!.uid);
    res.json(profile);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cloud Function v2 con restricciones estrictas de Free Tier (Modo MissyPO)
export { app };
export { onStockAlert };
export const api = onRequest(
  {
    region: 'us-central1',
    minInstances: 0,      // Scale to zero mandatorio
    maxInstances: 1,      // Circuit breaker en pruebas
    memory: '256MiB',     // Consumo mínimo de RAM
    timeoutSeconds: 30,   // Timeout corto
    concurrency: 80,      // Reuso eficiente de vCPU
  },
  app
);
