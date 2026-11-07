import { db, COLLECTIONS } from '../../config/firebase';

export interface CreateShipmentDto {
  order_id: string;
  customer_id: string;
  shipping_address: string;
  carrier?: string;
  tracking_number?: string;
  notes?: string;
  user_id?: string;
}

export class ShipmentService {
  /**
   * Crear guía de remisión / despacho logístico
   */
  static async createShipment(dto: CreateShipmentDto) {
    const orderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc(dto.order_id);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      throw new Error(`La orden ${dto.order_id} no existe.`);
    }

    const orderData = orderSnap.data()!;
    const shipmentRef = db.collection(COLLECTIONS.SHIPMENTS).doc();

    const shipmentDoc = {
      id: shipmentRef.id,
      shipment_number: `SHIP-${Date.now().toString().slice(-6)}`,
      order_id: dto.order_id,
      order_number: orderData.order_number,
      customer_id: dto.customer_id,
      customer_name: orderData.customer_name,
      shipping_address: dto.shipping_address,
      items: orderData.items,
      carrier: dto.carrier || 'Envío propio',
      tracking_number: dto.tracking_number || '',
      status: 'dispatched', // 'dispatched' | 'in_transit' | 'delivered'
      dispatched_at: new Date(),
      created_by: dto.user_id || 'system',
      created_at: new Date()
    };

    await shipmentRef.set(shipmentDoc);
    return shipmentDoc;
  }

  /**
   * Marcar despacho como entregado
   */
  static async markDelivered(shipmentId: string) {
    const shipmentRef = db.collection(COLLECTIONS.SHIPMENTS).doc(shipmentId);
    await shipmentRef.update({
      status: 'delivered',
      delivered_at: new Date(),
      updated_at: new Date()
    });

    return { success: true, shipment_id: shipmentId, status: 'delivered' };
  }
}
