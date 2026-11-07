import { db, COLLECTIONS } from '../../config/firebase';

export class PdfService {
  /**
   * Generar estructura formateada lista para impresión o render de Factura
   */
  static async getInvoiceDocument(invoiceId: string) {
    const invSnap = await db.collection(COLLECTIONS.INVOICES).doc(invoiceId).get();
    if (!invSnap.exists) {
      throw new Error(`Factura ${invoiceId} no encontrada.`);
    }

    const invoice = invSnap.data()!;
    const custSnap = await db.collection(COLLECTIONS.CUSTOMERS).doc(invoice.customer_id).get();
    const customer = custSnap.exists ? custSnap.data() : { name: invoice.customer_name };

    return {
      document_type: 'FACTURA ELECTRÓNICA',
      invoice_number: invoice.invoice_number,
      order_reference: invoice.order_reference,
      date: invoice.invoice_date,
      company: {
        name: 'ERP STOCKPILE CORP',
        tax_id: 'RUC 20601234567',
        address: 'Av. Empresarial 123, Lima, Perú'
      },
      customer: {
        id: invoice.customer_id,
        name: customer?.name || invoice.customer_name,
        email: customer?.email || '',
        phone: customer?.phone || '',
        address: customer?.billing_address || ''
      },
      items: (invoice.items || []).map((it: any, idx: number) => ({
        item_no: idx + 1,
        sku: it.stock_id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: `${it.discount_percent || 0}%`,
        total: it.line_total
      })),
      financials: {
        total_amount: invoice.total_amount,
        paid_amount: invoice.paid_amount,
        balance_due: (invoice.total_amount || 0) - (invoice.paid_amount || 0),
        status: invoice.payment_status.toUpperCase()
      }
    };
  }
}
