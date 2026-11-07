import { db, COLLECTIONS } from '../../config/firebase';
import { ErpPayment } from '../../types/models';

export interface RegisterPaymentDto {
  invoice_id: string;
  amount: number;
  payment_method: string; // 'cash' | 'transfer' | 'card' | 'yape'
  reference?: string;
  user_id?: string;
}

export class PaymentService {
  /**
   * Registro atómico de pago/cobranza con actualización de saldo en factura
   */
  static async registerPayment(dto: RegisterPaymentDto) {
    if (dto.amount <= 0) {
      throw new Error('El monto de pago debe ser mayor a 0.');
    }

    const invoiceRef = db.collection(COLLECTIONS.INVOICES).doc(dto.invoice_id);
    const paymentRef = db.collection(COLLECTIONS.PAYMENTS).doc();

    return await db.runTransaction(async (transaction) => {
      const invSnap = await transaction.get(invoiceRef);
      if (!invSnap.exists) {
        throw new Error(`La factura ${dto.invoice_id} no existe.`);
      }

      const invData = invSnap.data()!;
      const totalAmount = invData.total_amount || 0;
      const currentPaid = invData.paid_amount || 0;
      const remainingBalance = totalAmount - currentPaid;

      if (dto.amount > remainingBalance) {
        throw new Error(
          `El monto ingresado ($${dto.amount}) excede el saldo pendiente ($${remainingBalance}).`
        );
      }

      const newPaidAmount = currentPaid + dto.amount;
      const newStatus = newPaidAmount >= totalAmount ? 'paid' : 'partial';

      // 1. Actualizar estado de la Factura
      transaction.update(invoiceRef, {
        paid_amount: newPaidAmount,
        payment_status: newStatus,
        updated_at: new Date()
      });

      // 2. Crear comprobante de Recibo de Pago
      const receiptDoc: ErpPayment = {
        id: paymentRef.id,
        invoice_id: dto.invoice_id,
        customer_id: invData.customer_id,
        payment_method: dto.payment_method,
        amount: dto.amount,
        payment_date: new Date().toISOString().split('T')[0],
        reference: dto.reference || '',
        receipt_number: `REC-PAY-${Date.now().toString().slice(-6)}`,
        created_at: new Date()
      };
      transaction.set(paymentRef, receiptDoc);

      return {
        success: true,
        receipt: receiptDoc,
        previous_paid: currentPaid,
        new_paid: newPaidAmount,
        remaining_balance: totalAmount - newPaidAmount,
        invoice_status: newStatus
      };
    });
  }
}
