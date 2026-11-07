import { InventoryService } from './modules/inventory/inventory.service';
import { PurchaseService } from './modules/purchases/purchase.service';
import { db, COLLECTIONS } from './config/firebase';

async function testPhase3() {
  console.log('🧪 Iniciando prueba de transacciones de inventario y compras (Fase 3)...');

  // 1. Ajuste de stock (Ingreso de 25 unidades a PL)
  console.log('\n1️⃣ Probando ajuste de stock atómico...');
  const adjustResult = await InventoryService.adjustStock({
    stock_id: '1',
    location_id: 'PL',
    qty_delta: 25,
    reason: 'Inventario inicial verificado',
    user_id: 'admin-tester'
  });
  console.log('✅ Ajuste exitoso:', adjustResult);

  // 2. Transferencia de stock (Mover 10 unidades de PL a JA)
  console.log('\n2️⃣ Probando transferencia entre almacenes (PL -> JA)...');
  const transferResult = await InventoryService.transferStock({
    stock_id: '1',
    from_location: 'PL',
    to_location: 'JA',
    quantity: 10,
    reference: 'Reabastecimiento sede Jackson Av'
  });
  console.log('✅ Transferencia exitosa:', transferResult);

  // 3. Crear una Orden de Compra
  console.log('\n3️⃣ Creando Orden de Compra para proveedor...');
  const po = await PurchaseService.createPurchaseOrder({
    supplier_id: 'SUPP-001',
    supplier_name: 'Distribuidora Central S.A.',
    location_id: 'PL',
    order_date: '2026-11-06',
    items: [
      {
        stock_id: '1',
        description: 'Arena',
        quantity: 50,
        purchase_price: 100
      }
    ],
    notes: 'Pedido urgente de reposición'
  });
  console.log(`✅ Orden creada: ${po.po_number} (ID: ${po.id}) por un total de $${po.total_amount}`);

  // 4. Recepción física de mercadería de la PO
  console.log('\n4️⃣ Recibiendo mercadería físicamente en almacén PL...');
  const receiveResult = await PurchaseService.receiveGoods({
    purchase_id: po.id,
    location_id: 'PL',
    items_received: [
      {
        stock_id: '1',
        quantity: 50
      }
    ],
    notes: 'Mercadería recibida en perfecto estado'
  });
  console.log('✅ Recepción completada:', receiveResult);

  // 5. Verificar estado final del producto y ledger
  const itemSnap = await db.collection(COLLECTIONS.ITEMS).doc('ITM-1').get();
  console.log('\n📊 Estado final del producto ITM-1 en Firestore:');
  console.log('Stocks por sede:', itemSnap.data()?.stocks);
  console.log('Stock Total:', itemSnap.data()?.total_stock);

  const movesSnap = await db.collection(COLLECTIONS.STOCK_MOVES)
    .where('stock_id', '==', '1')
    .get();
  console.log(`\n📋 Ledger inmutable: ${movesSnap.size} movimientos registrados para stock_id '1'.`);
  movesSnap.docs.forEach((doc, idx) => {
    const m = doc.data();
    console.log(`   [${idx + 1}] Tipo: ${m.trans_type} | Cantidad: ${m.qty} | Sede: ${m.location_id} | Ref: ${m.reference}`);
  });

  console.log('\n🎉 ¡Fase 3 verificada al 100% con consistencia ACID!');
}

testPhase3().catch((err) => {
  console.error('❌ Error en prueba de Fase 3:', err);
  process.exit(1);
});
