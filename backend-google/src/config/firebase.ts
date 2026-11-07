import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'crm-erps'
    });
  } else {
    admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || 'crm-erps'
    });
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();

// Helper para prefijos de colecciones
export const COLLECTIONS = {
  ITEMS: 'erp_items',
  LOCATIONS: 'erp_locations',
  STOCK_MOVES: 'erp_stock_moves',
  STOCK_TRANSFERS: 'erp_stock_transfers',
  CUSTOMERS: 'erp_customers',
  SUPPLIERS: 'erp_suppliers',
  PURCHASES: 'erp_purchases',
  RECEIVES: 'erp_receives',
  SALES_ORDERS: 'erp_sales_orders',
  INVOICES: 'erp_invoices',
  SHIPMENTS: 'erp_shipments',
  PAYMENTS: 'erp_payments',
  USERS: 'erp_users',
  SETTINGS: 'erp_settings',
} as const;
