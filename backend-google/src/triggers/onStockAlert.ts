import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../config/firebase';

/**
 * Trigger reactivo: Notificación automática cuando el stock cae por debajo del mínimo
 */
export const onStockAlert = onDocumentWritten(
  {
    document: 'erp_items/{itemId}',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 1
  },
  async (event) => {
    const afterData = event.data?.after.data();
    if (!afterData) return; // Documento eliminado

    const minStock = afterData.min_stock || 10;
    const totalStock = afterData.total_stock || 0;

    if (totalStock <= minStock) {
      console.warn(`⚠️ ALERTA DE STOCK BAJO: ${afterData.description} (SKU: ${afterData.stock_id}) tiene solo ${totalStock} unidades (Mínimo: ${minStock}).`);

      const alertRef = db.collection('erp_alerts').doc();
      await alertRef.set({
        id: alertRef.id,
        item_id: event.params.itemId,
        stock_id: afterData.stock_id,
        description: afterData.description,
        current_stock: totalStock,
        min_stock: minStock,
        type: 'low_stock',
        status: 'pending_restock',
        timestamp: new Date()
      });
    }
  }
);
