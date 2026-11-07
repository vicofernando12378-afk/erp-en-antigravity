import { db, COLLECTIONS } from '../../config/firebase';
import { ErpStockMove } from '../../types/models';

export interface AdjustStockDto {
  stock_id: string;
  location_id: string;
  qty_delta: number; // Positivo para ingreso, negativo para egreso
  reason: string;
  user_id?: string;
}

export interface TransferStockDto {
  stock_id: string;
  from_location: string;
  to_location: string;
  quantity: number;
  reference?: string;
  user_id?: string;
}

export class InventoryService {
  /**
   * Ajuste atómico de stock (Ingreso o Merma/Egreso) con ledger inmutable
   */
  static async adjustStock(dto: AdjustStockDto) {
    const itemDocId = `ITM-${dto.stock_id}`;
    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(itemDocId);
    const moveRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();

    return await db.runTransaction(async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists) {
        throw new Error(`El producto ITM-${dto.stock_id} no existe.`);
      }

      const itemData = itemSnap.data()!;
      const currentStocks = itemData.stocks || {};
      const currentLocStock = currentStocks[dto.location_id] || 0;
      const newLocStock = currentLocStock + dto.qty_delta;

      if (newLocStock < 0) {
        throw new Error(
          `Stock insuficiente en almacén ${dto.location_id}. Stock actual: ${currentLocStock}, se intentó descontar: ${Math.abs(dto.qty_delta)}.`
        );
      }

      currentStocks[dto.location_id] = newLocStock;
      const newTotalStock = (itemData.total_stock || 0) + dto.qty_delta;

      // 1. Actualizar el producto
      transaction.update(itemRef, {
        stocks: currentStocks,
        total_stock: newTotalStock,
        updated_at: new Date()
      });

      // 2. Insertar movimiento en el ledger inmutable
      const moveDoc: ErpStockMove = {
        id: moveRef.id,
        stock_id: dto.stock_id,
        location_id: dto.location_id,
        trans_type: 'adjustment',
        qty: dto.qty_delta,
        reference: dto.reason,
        user_id: dto.user_id || 'system',
        created_at: new Date()
      };
      transaction.set(moveRef, moveDoc);

      return {
        success: true,
        stock_id: dto.stock_id,
        location_id: dto.location_id,
        previous_stock: currentLocStock,
        new_stock: newLocStock,
        total_stock: newTotalStock,
        movement_id: moveRef.id
      };
    });
  }

  /**
   * Transferencia atómica de stock entre dos almacenes
   */
  static async transferStock(dto: TransferStockDto) {
    if (dto.quantity <= 0) {
      throw new Error('La cantidad a transferir debe ser mayor a 0.');
    }
    if (dto.from_location === dto.to_location) {
      throw new Error('El almacén de origen y destino no pueden ser el mismo.');
    }

    const itemDocId = `ITM-${dto.stock_id}`;
    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(itemDocId);
    const transferRef = db.collection(COLLECTIONS.STOCK_TRANSFERS).doc();
    const moveOutRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();
    const moveInRef = db.collection(COLLECTIONS.STOCK_MOVES).doc();

    return await db.runTransaction(async (transaction) => {
      const itemSnap = await transaction.get(itemRef);
      if (!itemSnap.exists) {
        throw new Error(`El producto ITM-${dto.stock_id} no existe.`);
      }

      const itemData = itemSnap.data()!;
      const currentStocks = itemData.stocks || {};
      const originStock = currentStocks[dto.from_location] || 0;

      if (originStock < dto.quantity) {
        throw new Error(
          `Stock insuficiente en almacén de origen ${dto.from_location}. Disponible: ${originStock}, Solicitado: ${dto.quantity}.`
        );
      }

      currentStocks[dto.from_location] = originStock - dto.quantity;
      currentStocks[dto.to_location] = (currentStocks[dto.to_location] || 0) + dto.quantity;

      // 1. Actualizar existencias en almacenes
      transaction.update(itemRef, {
        stocks: currentStocks,
        updated_at: new Date()
      });

      // 2. Registro de transferencia
      transaction.set(transferRef, {
        id: transferRef.id,
        stock_id: dto.stock_id,
        from_location: dto.from_location,
        to_location: dto.to_location,
        quantity: dto.quantity,
        reference: dto.reference || 'Traslado entre almacenes',
        user_id: dto.user_id || 'system',
        created_at: new Date()
      });

      // 3. Movimiento de salida (transfer_out)
      transaction.set(moveOutRef, {
        id: moveOutRef.id,
        stock_id: dto.stock_id,
        location_id: dto.from_location,
        trans_type: 'transfer_out',
        qty: -dto.quantity,
        reference: `Traslado a ${dto.to_location} (Ref: ${transferRef.id})`,
        created_at: new Date()
      });

      // 4. Movimiento de entrada (transfer_in)
      transaction.set(moveInRef, {
        id: moveInRef.id,
        stock_id: dto.stock_id,
        location_id: dto.to_location,
        trans_type: 'transfer_in',
        qty: dto.quantity,
        reference: `Traslado desde ${dto.from_location} (Ref: ${transferRef.id})`,
        created_at: new Date()
      });

      return {
        success: true,
        transfer_id: transferRef.id,
        stock_id: dto.stock_id,
        from_location: dto.from_location,
        to_location: dto.to_location,
        quantity: dto.quantity,
        new_from_stock: currentStocks[dto.from_location],
        new_to_stock: currentStocks[dto.to_location]
      };
    });
  }
}
