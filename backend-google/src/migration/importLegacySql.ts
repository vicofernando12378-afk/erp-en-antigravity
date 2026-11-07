import * as fs from 'fs';
import * as path from 'path';
import { db, COLLECTIONS } from '../config/firebase';

interface SqlRow {
  [column: string]: any;
}

function parseSqlInserts(sqlContent: string, tableName: string): SqlRow[] {
  const regex = new RegExp(`INSERT INTO \`${tableName}\` \\((.*?)\\) VALUES([\\s\\S]*?);`);
  const match = regex.exec(sqlContent);
  if (!match) return [];

  const columns = match[1]
    .split(',')
    .map(c => c.trim().replace(/`/g, ''));

  const valuesBlock = match[2].trim();
  const rawRows: string[] = [];

  // Parse tuples ( ... )
  let depth = 0;
  let inString = false;
  let quoteChar = '';
  let startIdx = -1;

  for (let i = 0; i < valuesBlock.length; i++) {
    const char = valuesBlock[i];
    const prevChar = i > 0 ? valuesBlock[i - 1] : '';

    if ((char === "'" || char === '"') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inString = false;
      }
    } else if (!inString) {
      if (char === '(') {
        depth++;
        if (depth === 1) startIdx = i + 1;
      } else if (char === ')') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          rawRows.push(valuesBlock.slice(startIdx, i));
          startIdx = -1;
        }
      }
    }
  }

  const rows: SqlRow[] = [];

  for (const rawRow of rawRows) {
    const values: any[] = [];
    let current = '';
    let inQuote = false;
    let quote = '';

    for (let i = 0; i < rawRow.length; i++) {
      const char = rawRow[i];
      const prevChar = i > 0 ? rawRow[i - 1] : '';

      if ((char === "'" || char === '"') && prevChar !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quote = char;
        } else if (char === quote) {
          inQuote = false;
        } else {
          current += char;
        }
      } else if (char === ',' && !inQuote) {
        values.push(cleanVal(current));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(cleanVal(current));

    const rowObj: SqlRow = {};
    columns.forEach((col, idx) => {
      rowObj[col] = values[idx];
    });
    rows.push(rowObj);
  }

  return rows;
}

function cleanVal(v: string): any {
  const trimmed = v.trim();
  if (trimmed === 'NULL') return null;
  if (/^'-?\d+(\.\d+)?'$/.test(trimmed)) return Number(trimmed.slice(1, -1));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  return trimmed;
}

export async function runMigration() {
  console.log('🚀 Iniciando proceso ETL de migración a Firestore (crm-erps)...');
  
  const sqlFilePath = path.resolve(__dirname, '../../../rencodie_pedidos.sql');
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`Archivo SQL no encontrado en: ${sqlFilePath}`);
  }

  const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
  const batch = db.batch();

  // 1. Locations
  console.log('📍 Parseando almacenes (locations)...');
  const rawLocations = parseSqlInserts(sqlContent, 'location');
  const locationMap = new Map<string, string>(); // loc_code -> docId

  for (const loc of rawLocations) {
    const locRef = db.collection(COLLECTIONS.LOCATIONS).doc(loc.loc_code || `LOC-${loc.id}`);
    locationMap.set(loc.loc_code, locRef.id);

    batch.set(locRef, {
      id: locRef.id,
      legacy_id: loc.id,
      loc_code: loc.loc_code,
      location_name: loc.location_name,
      delivery_address: loc.delivery_address || '',
      phone: loc.phone || '',
      email: loc.email || '',
      is_default: loc.loc_code === 'PL',
      is_active: loc.inactive === 0,
      created_at: loc.created_at ? new Date(loc.created_at) : new Date(),
    });
  }
  console.log(`   ✅ ${rawLocations.length} almacenes preparados.`);

  // 2. Categories
  console.log('🏷️ Parseando categorías...');
  const rawCategories = parseSqlInserts(sqlContent, 'stock_category');
  const categoryMap = new Map<number, string>();
  for (const cat of rawCategories) {
    categoryMap.set(cat.category_id, cat.description);
  }

  // 3. Prices
  const rawSalePrices = parseSqlInserts(sqlContent, 'sale_prices');
  const salePriceMap = new Map<string, number>();
  for (const sp of rawSalePrices) {
    if (!salePriceMap.has(String(sp.stock_id)) || sp.price > 0) {
      salePriceMap.set(String(sp.stock_id), Number(sp.price) || 0);
    }
  }

  const rawPurchasePrices = parseSqlInserts(sqlContent, 'purchase_prices');
  const purchasePriceMap = new Map<string, number>();
  for (const pp of rawPurchasePrices) {
    if (!purchasePriceMap.has(String(pp.stock_id)) || pp.price > 0) {
      purchasePriceMap.set(String(pp.stock_id), Number(pp.price) || 0);
    }
  }

  // 4. Items (stock_master)
  console.log('📦 Parseando catálogo de productos (stock_master)...');
  const rawItems = parseSqlInserts(sqlContent, 'stock_master');
  for (const item of rawItems) {
    const stockId = String(item.stock_id);
    const itemRef = db.collection(COLLECTIONS.ITEMS).doc(`ITM-${stockId}`);

    const itemDoc = {
      id: itemRef.id,
      stock_id: stockId,
      description: item.description,
      long_description: item.long_description || '',
      category_id: String(item.category_id),
      category_name: categoryMap.get(item.category_id) || 'General',
      units: item.units || 'Each',
      purchase_price: purchasePriceMap.get(stockId) || 0,
      sale_price: salePriceMap.get(stockId) || 0,
      stocks: {
        'PL': 100, // Stock base para testing
        'JA': 50
      },
      total_stock: 150,
      is_active: item.inactive === 0,
      created_at: item.created_at ? new Date(item.created_at) : new Date(),
    };

    batch.set(itemRef, itemDoc);
  }
  console.log(`   ✅ ${rawItems.length} productos preparados.`);

  // 5. Customers & Branches
  console.log('👥 Parseando clientes (debtors_master) y sucursales (cust_branch)...');
  const rawCustomers = parseSqlInserts(sqlContent, 'debtors_master');
  const rawBranches = parseSqlInserts(sqlContent, 'cust_branch');

  for (const cust of rawCustomers) {
    const custRef = db.collection(COLLECTIONS.CUSTOMERS).doc(`CUST-${cust.debtor_no}`);
    const branches = rawBranches
      .filter(b => b.debtor_no === cust.debtor_no)
      .map(b => ({
        branch_id: String(b.branch_code),
        branch_name: b.br_name,
        contact_name: b.br_contact || '',
        shipping_address: `${b.shipping_street || ''} ${b.shipping_city || ''} ${b.shipping_state || ''}`.trim(),
        country_code: b.shipping_country_id || 'PE'
      }));

    batch.set(custRef, {
      id: custRef.id,
      legacy_debtor_no: cust.debtor_no,
      name: cust.name,
      email: cust.email || '',
      phone: cust.phone || '',
      vat_no: cust.vat_no || '',
      billing_address: cust.address || '',
      branches: branches,
      is_active: cust.inactive === 0,
      created_at: cust.created_at ? new Date(cust.created_at) : new Date(),
    });
  }
  console.log(`   ✅ ${rawCustomers.length} clientes preparados con sus sucursales.`);

  // 5b. Proveedores
  console.log('🏭 Parseando proveedores (suppliers)...');
  const rawSuppliers = parseSqlInserts(sqlContent, 'suppliers');
  for (const supp of rawSuppliers) {
    const suppRef = db.collection(COLLECTIONS.SUPPLIERS).doc(`SUPP-${supp.supplier_id}`);
    batch.set(suppRef, {
      id: suppRef.id,
      legacy_supplier_id: supp.supplier_id,
      supp_name: supp.supp_name,
      email: supp.email || '',
      address: supp.address || '',
      contact: supp.contact || '',
      city: supp.city || '',
      state: supp.state || '',
      zipcode: supp.zipcode || '',
      country: supp.country || 'PE',
      is_active: supp.inactive === 0,
      created_at: supp.created_at ? new Date(supp.created_at) : new Date(),
    });
  }
  console.log(`   ✅ ${rawSuppliers.length} proveedores preparados.`);

  // 6. Sales Orders & Invoices
  console.log('📑 Parseando pedidos y facturas (sales_orders)...');
  const rawOrders = parseSqlInserts(sqlContent, 'sales_orders');
  const rawOrderDetails = parseSqlInserts(sqlContent, 'sales_order_details');

  for (const ord of rawOrders) {
    const details = rawOrderDetails
      .filter(d => d.order_no === ord.order_no)
      .map(d => ({
        stock_id: String(d.stock_id),
        description: d.description,
        quantity: Number(d.quantity) || 1,
        unit_price: Number(d.unit_price) || 0,
        discount_percent: Number(d.discount_percent) || 0,
        line_total: (Number(d.quantity) || 1) * (Number(d.unit_price) || 0)
      }));

    // trans_type: 201 = Sales Order, 202 = Invoice
    if (ord.trans_type === 201) {
      const orderRef = db.collection(COLLECTIONS.SALES_ORDERS).doc(ord.reference || `SO-${ord.order_no}`);
      batch.set(orderRef, {
        id: orderRef.id,
        order_number: ord.reference || `SO-${ord.order_no}`,
        customer_id: `CUST-${ord.debtor_no}`,
        location_id: ord.from_stk_loc || 'PL',
        order_date: ord.ord_date,
        status: ord.total > 0 ? 'confirmed' : 'draft',
        items: details,
        total_amount: Number(ord.total) || 0,
        paid_amount: Number(ord.paid_amount) || 0,
        comments: ord.comments || '',
        created_at: ord.created_at ? new Date(ord.created_at) : new Date(),
      });
    } else if (ord.trans_type === 202) {
      const invRef = db.collection(COLLECTIONS.INVOICES).doc(ord.reference || `INV-${ord.order_no}`);
      batch.set(invRef, {
        id: invRef.id,
        invoice_number: ord.reference || `INV-${ord.order_no}`,
        order_reference: ord.order_reference || '',
        customer_id: `CUST-${ord.debtor_no}`,
        location_id: ord.from_stk_loc || 'PL',
        invoice_date: ord.ord_date,
        items: details,
        total_amount: Number(ord.total) || 0,
        paid_amount: Number(ord.paid_amount) || 0,
        payment_status: ord.paid_amount >= ord.total ? 'paid' : (ord.paid_amount > 0 ? 'partial' : 'unpaid'),
        comments: ord.comments || '',
        created_at: ord.created_at ? new Date(ord.created_at) : new Date(),
      });
    }
  }
  console.log(`   ✅ ${rawOrders.length} documentos de venta/facturas preparados.`);

  // 7. Commit batch atómico a Firestore
  console.log('💾 Ejecutando batch commit atómico en Firestore...');
  await batch.commit();
  console.log('🎉 ¡Migración completada con éxito en Firestore (crm-erps)!');
}

// Ejecutar si se invoca directamente
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error durante la migración:', err);
      process.exit(1);
    });
}
