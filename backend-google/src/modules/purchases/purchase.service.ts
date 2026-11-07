import { db, COLLECTIONS } from '../../config/firebase';
import { ErpStockMove } from '../../types/models';

export interface CreatePurchaseDto {
  supplier_id: string;
  supplier_name: string;
  location_id: string;
  order_date: string;
  items: Array<{
    stock_id: string;
    description: string;
    quantity: number;
    purchase_price: number;
  }>;
  notes?: string;
  user_id?: string;
}

export interface ReceiveGoodsDto {
  purchase_id: string;
  location_id: string;
  items_received: Array<{
    stock_id: string;
    quantity: number;
  }>;
  user_id?: string;
  notes?: string;
}

export class PurchaseService {
  /**
   * Crear nueva Orden de Compra (PO)
   */
  static async createPurchaseOrder(dto: CreatePurchaseDto) {
    const poRef = db.collection(COLLECTIONS.PURCHASES).doc();

    const items = dto.items.map(item => ({
      ...item,
      line_total: item.quantity * item.purchase_price,
      received_qty: 0
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.line_total, 0);

    const poDoc = {
      id: poRef.id,
      po_number: `PO-${Date.now().toString().slice(-6)}`,
      supplier_id: dto.supplier_id,
      supplier_name: dto.supplier_name,
      location_id: dto.location_id,
      order_date: dto.order_date || new Date().toISOString().split('T')[0],
      status: 'pending', // 'pending' | 'partially_received' | 'received' | 'cancelled'
      items: items,
      total_amount: totalAmount,
      notes: dto.notes || '',
      created_by: dto.user_id || 'system',
      created_at: new Date()
    };

    await poRef.set(poDoc);
    return poDoc;
  }

  /**
   * Recepción física de mercadería con actualización transaccional de inventario
   */
  static async receiveGoods(dto: ReceiveGoodsDto) {
    const poRef = db.collection(COLLECTIONS.PURCHASES).doc(dto.purchase_id);
    const receiveRef = db.collection(COLLECTIONS.RECEIVES).doc();

    return await db.runTransaction(async (transaction) => {
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists) {
        throw new Error(`La Orden de Compra ${dto.purchase_id} no existe.`);
      }

      const poData = poSnap.data()!;
      if (poData.status === 'received') {
        throw new Error('Esta Orden de Compra ya fue recibida en su totalidad.');
      }

      // 1. Validar y actualizar stock de cada producto recibido
      const stockUpdates: any[] = [];

      for (const recItem of dto.items_received) {
        if (recItem.quantity <= 0) continue;

        const itemRef = db.collection(COLLECTIONS.ITEMS).doc(`ITM-${recItem.stock_id}`);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists) {
          throw new Error(`El producto ITM-${recItem.stock_id} no existe en catálogo.`);
        }

        const itemData = itemSnap.data()!;
        const currentStocks = itemData.stocks || {};
        const currentLocStock = currentStocks[dto.location_id] || 0;
        const newLocStock = currentLocStock + recItem.quantity;
        const newTotalStock = (itemData.total_stock || 0) + recItem.quantity;

        currentStocks[dto.location_id] = newLocStock;

        // Actualizar producto
        transaction.update(itemRef, {
          stocks: currentStocks,
          total_stock: newTotalStock,
          updated_at: new Date()
        });

        // Registrar movimiento de stock
        const moveRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();
        const moveDoc: ErpStockMove = {
          id: moveRef.id,
          stock_id: recItem.stock_id,
          location_id: dto.location_id,
          trans_type: 'purchase_receive',
          trans_id: receiveRef.id,
          qty: recItem.quantity,
          reference: `Recepción de PO ${poData.po_number}`,
          user_id: dto.user_id || 'system',
          created_at: new Date()
        };
        transaction.set(moveRef, moveDoc);

        stockUpdates.push({
          stock_id: recItem.stock_id,
          received_qty: recItem.quantity,
          new_stock: newLocStock
        });
      }

      // 2. Actualizar estado de la Orden de Compra
      const updatedPoItems = poData.items.map((pi: any) => {
        const receivedNow = dto.items_received.find(r => r.stock_id === pi.stock_id);
        const addQty = receivedNow ? receivedNow.quantity : 0;
        const newReceivedTotal = (pi.received_qty || 0) + addQty;
        return {
          ...pi,
          received_qty: newReceivedTotal
        };
      });

      const allItemsFullyReceived = updatedPoItems.every((pi: any) => (pi.received_qty || 0) >= pi.quantity);
      const newPoStatus = allItemsFullyReceived ? 'received' : 'partially_received';

      transaction.update(poRef, {
        items: updatedPoItems,
        status: newPoStatus,
        updated_at: new Date()
      });

      // 3. Crear comprobante de recepción
      const receiveDoc = {
        id: receiveRef.id,
        receive_number: `REC-${Date.now().toString().slice(-6)}`,
        purchase_id: dto.purchase_id,
        po_number: poData.po_number,
        location_id: dto.location_id,
        items_received: dto.items_received,
        notes: dto.notes || '',
        received_by: dto.user_id || 'system',
        created_at: new Date()
      };
      transaction.set(receiveRef, receiveDoc);

      return {
        success: true,
        receive_id: receiveRef.id,
        receive_number: receiveDoc.receive_number,
        po_status: newPoStatus,
        stock_updates: stockUpdates
      };
    });
  }
}
