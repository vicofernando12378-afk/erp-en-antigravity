import { SalesService } from './modules/sales/sales.service';
import { PaymentService } from './modules/payments/payment.service';
import { ShipmentService } from './modules/shipments/shipment.service';
import { PdfService } from './modules/reports/pdf.service';
import { db, COLLECTIONS } from './config/firebase';

async function testPhase4() {
  console.log('🛍️ Iniciando prueba del Circuito Comercial Completo (Fase 4)...');

  // 1. Crear Orden de Venta para Danilo
  console.log('\n1️⃣ Creando Pedido de Venta para cliente Danilo (CUST-1)...');
  const order = await SalesService.createOrder({
    customer_id: 'CUST-1',
    customer_name: 'Danilo',
    location_id: 'PL',
    items: [
      {
        stock_id: '131313',
        description: 'COLLAR THE BEST',
        quantity: 2,
        unit_price: 1290,
        discount_percent: 0
      }
    ],
    notes: 'Pedido comercial para entrega inmediata'
  });
  console.log(`✅ Pedido creado exitosamente: ${order.order_number} (ID: ${order.id}) por un total de $${order.total_amount}`);

  // 2. Facturar la orden atómicamente con descuento de inventario
  console.log('\n2️⃣ Convirtiendo Pedido a Factura (Facturación transaccional + Descuento de Stock)...');
  const invoiceResult = await SalesService.convertOrderToInvoice(order.id!);
  const invoice = invoiceResult.invoice;
  console.log(`✅ Factura emitida: ${invoice.invoice_number} (ID: ${invoice.id})`);
  console.log('   Deducciones de inventario aplicadas:', invoiceResult.stock_deductions);

  // 3. Registrar primer pago parcial ($1,000)
  console.log('\n3️⃣ Registrando primer pago parcial ($1,000)...');
  const pay1 = await PaymentService.registerPayment({
    invoice_id: invoice.id,
    amount: 1000,
    payment_method: 'transfer',
    reference: 'TRF-BANCO-778899'
  });
  console.log(`✅ Pago 1 registrado: ${pay1.receipt.receipt_number}. Saldo pendiente: $${pay1.remaining_balance}. Estado: ${pay1.invoice_status}`);

  // 4. Registrar segundo pago para liquidar ($1,580)
  console.log('\n4️⃣ Registrando saldo restante para liquidación ($1,580)...');
  const pay2 = await PaymentService.registerPayment({
    invoice_id: invoice.id,
    amount: 1580,
    payment_method: 'cash',
    reference: 'Efectivo en caja central'
  });
  console.log(`✅ Pago 2 registrado: ${pay2.receipt.receipt_number}. Saldo pendiente: $${pay2.remaining_balance}. Estado: ${pay2.invoice_status}`);

  // 5. Crear guía de remisión / despacho
  console.log('\n5️⃣ Creando despacho y guía de remisión logística...');
  const shipment = await ShipmentService.createShipment({
    order_id: order.id!,
    customer_id: 'CUST-1',
    shipping_address: 'Av. de Mac Activo, EC',
    carrier: 'Logística Exprés',
    tracking_number: 'TRACK-882299'
  });
  console.log(`✅ Guía de despacho creada: ${shipment.shipment_number}. Estado: ${shipment.status}`);

  // 6. Marcar entrega final
  console.log('\n6️⃣ Confirmando entrega en destino...');
  const deliveryResult = await ShipmentService.markDelivered(shipment.id);
  console.log(`✅ Despacho entregado con éxito:`, deliveryResult);

  // 7. Generar documento listo para impresión / PDF
  console.log('\n7️⃣ Obteniendo documento formateado para impresión...');
  const printDoc = await PdfService.getInvoiceDocument(invoice.id);
  console.log('✅ Documento comercial generado:');
  console.log(JSON.stringify(printDoc, null, 2));

  console.log('\n🎉 ¡Fase 4 (Circuito Comercial) validada al 100% de punta a punta!');
}

testPhase4().catch((err) => {
  console.error('❌ Error en prueba de Fase 4:', err);
  process.exit(1);
});
