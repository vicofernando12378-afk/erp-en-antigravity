export interface ErpItem {
  id?: string;
  stock_id: string; // SKU o Código interno (ej: 'ITM-001')
  description: string;
  category_id?: string;
  category_name?: string;
  units?: string;
  item_type?: string; // 'simple' | 'variable'
  barcode?: string;
  purchase_price: number;
  sale_price: number;
  stocks: { [location_id: string]: number }; // Stock por almacén
  total_stock: number;
  min_stock?: number;
  is_active: boolean;
  created_at: any;
  updated_at: any;
}

export interface ErpLocation {
  id?: string;
  loc_code: string;
  location_name: string;
  delivery_address?: string;
  phone?: string;
  email?: string;
  is_default: boolean;
  created_at: any;
}

export interface ErpStockMove {
  id?: string;
  stock_id: string;
  location_id: string;
  trans_type: 'purchase_receive' | 'sale_invoice' | 'transfer_in' | 'transfer_out' | 'adjustment';
  trans_id?: string;
  qty: number;
  reference?: string;
  user_id?: string;
  created_at: any;
}

export interface ErpCustomer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  tax_id?: string; // DNI / RUC
  billing_address?: string;
  branches: Array<{
    branch_id: string;
    branch_name: string;
    contact_name?: string;
    shipping_address?: string;
  }>;
  created_at: any;
}

export interface ErpSupplier {
  id?: string;
  supp_name: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  created_at: any;
}

export interface ErpSalesOrderItem {
  stock_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total: number;
}

export interface ErpSalesOrder {
  id?: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  location_id: string;
  order_date: string;
  status: 'draft' | 'confirmed' | 'invoiced' | 'cancelled';
  items: ErpSalesOrderItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  created_at: any;
}

export interface ErpInvoice {
  id?: string;
  invoice_number: string;
  order_id?: string;
  customer_id: string;
  customer_name: string;
  location_id: string;
  invoice_date: string;
  due_date?: string;
  items: ErpSalesOrderItem[];
  total_amount: number;
  paid_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_at: any;
}

export interface ErpPayment {
  id?: string;
  invoice_id: string;
  customer_id: string;
  payment_method: string;
  amount: number;
  payment_date: string;
  reference?: string;
  receipt_number: string;
  created_at: any;
}
