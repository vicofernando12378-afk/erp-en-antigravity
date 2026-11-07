# StockPileCloud — ERP & CRM Serverless

Modernización serverless de nivel empresarial basada en la funcionalidad completa de Stockpile v1.7, desplegada sobre infraestructura Google Cloud Serverless y Firebase bajo políticas de costo cero (Free Tier).

🌐 **Acceso en Producción:** [https://crm-erps.web.app](https://crm-erps.web.app)  
⚡ **API Endpoint:** [https://us-central1-crm-erps.cloudfunctions.net/api](https://us-central1-crm-erps.cloudfunctions.net/api)

---

## 🏛️ Arquitectura del Sistema

El proyecto está diseñado bajo arquitectura hexagonal y patrones serverless desacoplados:

- **Frontend (SPA):** React 18 + TypeScript + Vite + Tailwind CSS + Lucide Icons. Desplegado en **Firebase Hosting**.
- **Backend (API Serverless):** Node.js 22 + TypeScript + Express + Firebase Functions v2. Desplegado en **Google Cloud Functions v2** (región `us-central1`).
- **Base de Datos NoSQL Transaccional:** **Google Cloud Firestore** (multirregión `nam5`) con transacciones atómicas `runTransaction` para control de stock e integridad de saldos.
- **Background Event Triggers:** Cloud Function `onStockAlert` disparada automáticamente en Firestore para alertas de quiebre de stock.
- **Políticas Free Tier (Modo MissyPO):** `minInstances: 0`, `maxInstances: 1`, `memory: 256MiB`, `timeoutSeconds: 30`, y ciclo de vida de limpieza de artefactos en Google Artifact Registry para garantizar $0 de costo operacional.

---

## 📦 Módulos y Funcionalidades (100% Paridad con Stockpile v1.7)

1. **Dashboard Ejecutivo:** Métricas en tiempo real de valor de inventario, ventas, órdenes pendientes y alertas de bajo stock.
2. **Inventario y Productos (`/items`):**
   - Catálogo maestro de productos con imágenes, códigos SKU y categorías.
   - Botón interactivo `+ Registrar Nuevo Producto` con stock inicial y costo.
   - Botón interactivo `+ Ingresar Stock` para compras directas o recepciones manuales en almacén.
   - Ajustes manuales atómicos de inventario por almacén con auditoría.
3. **Traslados entre Almacenes (`/transfers`):**
   - Movimientos atómicos entre almacenes con registro en el libro mayor inmutable `erp_stock_moves`.
4. **Clientes y Sucursales (`/customers`):**
   - Gestión integral de clientes, líneas de crédito, contactos y sucursales.
5. **Ventas y Facturación:**
   - **Pedidos de Venta (`/orders`):** Ciclo comercial completo desde borrador a cotización y orden confirmada.
   - **Facturas Emitidas (`/invoices`):** Conversión atómica desde órdenes o venta directa con descuento de stock.
   - **Cobros y Recibos (`/payments`):** Cobros totales y parciales con conciliación automática de saldos pendientes.
   - **Despachos y Guías (`/shipments`):** Registro de guías de remisión y control de entregas a clientes.
6. **Abastecimiento y Compras:**
   - **Proveedores (`/suppliers`):** Directorio de proveedores, condiciones comerciales y catálogo de compras.
   - **Órdenes de Compra (`/purchases`):** Modal interactivo `+ Nueva Orden de Compra` con selección de proveedor, almacén destino y líneas de producto.
   - **Recepciones de Mercadería (`/receives`):** Módulo `📥 Recibir Mercadería` con incremento atómico de stock e impacto en kardex.
7. **Suite de Reportes Financieros y Operativos:**
   - Reportes de existencias valorizadas, rotación, ventas por período, saldos por cobrar y exportación PDF/CSV.
8. **Configuración y Roles (RBAC):**
   - Configuración empresarial y control de permisos granulares por rol.

---

## 🛠️ Comandos de Desarrollo y Validación

### Frontend (`/frontend`)
```bash
cd frontend
npm install
npm run build      # Verificación TypeScript + compilación Vite
npm run dev        # Servidor de desarrollo local
```

### Backend (`/backend-google`)
```bash
cd backend-google
npm install
npm run build      # Verificación TypeScript (tsc)
npm run migrate    # Script ETL para importar datos SQL heredados a Firestore
```

### Despliegue a Producción (Firebase CLI)
```bash
firebase deploy --only hosting               # Despliegue de Frontend
firebase deploy --only functions:erp-crm     # Despliegue de Cloud Functions
```

---

## 🔒 Reglas de Seguridad y Autonomía

Este repositorio opera bajo el protocolo estricto de [.antigravityrules](.antigravityrules), con validación obligatoria antes de despliegue, inmutabilidad de proyectos compartidos y sincronización continua con el grafo de conocimiento (**Graphify**) y memoria persistente (**Engram**).
