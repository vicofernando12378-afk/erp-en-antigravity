import { db, COLLECTIONS } from '../../config/firebase';
import { ErpSalesOrder, ErpSalesOrderItem, ErpStockMove } from '../../types/models';

export interface CreateOrderDto {
  customer_id: string;
  customer_name: string;
  location_id: string;
  order_date?: string;
  items: Array<{
    stock_id: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    tax_percent?: number;
  }>;
  notes?: string;
  user_id?: string;
}

export class SalesService {
  /**
   * Crear nueva Orden de Venta / Pedido comercial
   */
  static async createOrder(dto: CreateOrderDto) {
    const orderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc();

    const items: ErpSalesOrderItem[] = dto.items.map(item => {
      const discount = item.discount_percent || 0;
      const baseTotal = item.quantity * item.unit_price;
      const lineTotal = baseTotal - (baseTotal * (discount / 100));

      return {
        stock_id: item.stock_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_percent: discount,
        tax_percent: item.tax_percent || 0,
        line_total: lineTotal
      };
    });

    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
    const taxAmount = 0; // Configurable según régimen
    const totalAmount = subtotal + taxAmount;

    const orderDoc: ErpSalesOrder = {
      id: orderRef.id,
      order_number: `SO-${Date.now().toString().slice(-6)}`,
      customer_id: dto.customer_id,
      customer_name: dto.customer_name,
      location_id: dto.location_id,
      order_date: dto.order_date || new Date().toISOString().split('T')[0],
      status: 'confirmed',
      items: items,
      subtotal: subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes: dto.notes || '',
      created_at: new Date()
    };

    await orderRef.set(orderDoc);
    return orderDoc;
  }

  /**
   * Conversión atómica de Pedido a Factura con descuento de stock y ledger inmutable
   */
  static async convertOrderToInvoice(orderId: string, userId?: string) {
    const orderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc(orderId);
    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc();

    return await db.runTransaction(async (transaction) => {
      const orderSnap = await transaction.get(orderRef);
      if (!orderSnap.exists) {
        throw new Error(`La orden de venta ${orderId} no existe.`);
      }

      const orderData = orderSnap.data() as ErpSalesOrder;
      if (orderData.status === 'invoiced') {
        throw new Error(`La orden ${orderData.order_number} ya fue facturada previamente.`);
      }

      // 1. Validar y descontar stock atómicamente para cada ítem vendido
      const stockDeductions: any[] = [];

      for (const item of orderData.items) {
        const itemDocId = `ITM-${item.stock_id}`;
        const itemRef = db.collection(COLLECTIONS.ITEMS).doc(itemDocId);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists) {
          throw new Error(`El producto ITM-${item.stock_id} no existe en catálogo.`);
        }

        const itemData = itemSnap.data()!;
        const currentStocks = itemData.stocks || {};
        const locationStock = currentStocks[orderData.location_id] || 0;

        if (locationStock < item.quantity) {
          throw new Error(
            `Stock insuficiente en almacén ${orderData.location_id} para ${item.description}. Disponible: ${locationStock}, Requerido: ${item.quantity}.`
          );
        }

        const newLocationStock = locationStock - item.quantity;
        const newTotalStock = (itemData.total_stock || 0) - item.quantity;
        currentStocks[orderData.location_id] = newLocationStock;

        // Descontar inventario
        transaction.update(itemRef, {
          stocks: currentStocks,
          total_stock: newTotalStock,
          updated_at: new Date()
        });

        // Registrar movimiento inmutable en el ledger
        const moveRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();
        const moveDoc: ErpStockMove = {
          id: moveRef.id,
          stock_id: item.stock_id,
          location_id: orderData.location_id,
          trans_type: 'sale_invoice',
          trans_id: invoiceRef.id,
          qty: -item.quantity,
          reference: `Factura ${invoiceRef.id} (Pedido ${orderData.order_number})`,
          user_id: userId || 'system',
          created_at: new Date()
        };
        transaction.set(moveRef, moveDoc);

        stockDeductions.push({
          stock_id: item.stock_id,
          deducted_qty: item.quantity,
          remaining_stock: newLocationStock
        });
      }

      // 2. Crear documento de Factura
      const invoiceDoc = {
        id: invoiceRef.id,
        invoice_number: `INV-${Date.now().toString().slice(-6)}`,
        order_id: orderData.id,
        order_reference: orderData.order_number,
        customer_id: orderData.customer_id,
        customer_name: orderData.customer_name,
        location_id: orderData.location_id,
        invoice_date: new Date().toISOString().split('T')[0],
        items: orderData.items,
        total_amount: orderData.total_amount,
        paid_amount: 0,
        payment_status: 'unpaid',
        created_at: new Date()
      };
      transaction.set(invoiceRef, invoiceDoc);

      // 3. Marcar la orden como facturada
      transaction.update(orderRef, {
        status: 'invoiced',
        invoice_id: invoiceRef.id,
        updated_at: new Date()
      });

      return {
        success: true,
        invoice: invoiceDoc,
        stock_deductions: stockDeductions
      };
    });
  }
}
