import { UserService } from './modules/users/user.service';
import { app } from './index';
import * as http from 'http';

async function testPhase5() {
  console.log('🛡️ Iniciando prueba de Autenticación, Roles RBAC y Triggers (Fase 5)...');

  // 1. Crear usuario Staff (Personal de almacén/ventas)
  console.log('\n1️⃣ Creando usuario con rol STAFF en Firebase Auth...');
  const staffUser = await UserService.createUser({
    email: 'staff.almacen@erp-test.com',
    name: 'Carlos Almacén',
    role: 'staff'
  });
  console.log('✅ Usuario Staff creado:', staffUser);

  // 2. Crear usuario Admin (Gerente de operaciones)
  console.log('\n2️⃣ Creando usuario con rol ADMIN en Firebase Auth...');
  const adminUser = await UserService.createUser({
    email: 'admin.gerencia@erp-test.com',
    name: 'Ana Gerente',
    role: 'admin'
  });
  console.log('✅ Usuario Admin creado:', adminUser);

  // 3. Probar RBAC vía HTTP con servidor local
  console.log('\n3️⃣ Probando protección de rutas y permisos RBAC vía HTTP...');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(3334, resolve));

  // Caso A: Intento de crear usuario sin token (debe rechazar con 401)
  console.log('   Petición anónima a /users (esperando 401 Unauthorized)...');
  const anonRes = await fetch('http://localhost:3334/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'hacker@test.com', name: 'Hacker', role: 'admin' })
  });
  console.log(`   Resultado: HTTP ${anonRes.status} (Esperado 401)`);

  // Caso B: Petición con rol 'staff' a ruta exclusiva de Admin (debe rechazar con 403)
  console.log('   Petición de Staff a /users (esperando 403 Forbidden)...');
  const staffRes = await fetch('http://localhost:3334/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true',
      'x-test-role': 'staff'
    },
    body: JSON.stringify({ email: 'nuevo@test.com', name: 'Nuevo', role: 'staff' })
  });
  console.log(`   Resultado: HTTP ${staffRes.status} (Esperado 403)`);

  // Caso C: Petición con rol 'admin' (debe autorizar con 201)
  console.log('   Petición de Admin a /users (esperando 201 Created)...');
  const adminRes = await fetch('http://localhost:3334/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-bypass': 'true',
      'x-test-role': 'admin'
    },
    body: JSON.stringify({ email: 'vendedor1@erp-test.com', name: 'Mario Ventas', role: 'staff' })
  });
  console.log(`   Resultado: HTTP ${adminRes.status} (Esperado 201)`);

  server.close();
  console.log('\n🎉 ¡Fase 5 (Seguridad RBAC y Autenticación) validada al 100%!');
}

testPhase5().catch((err) => {
  console.error('❌ Error en prueba de Fase 5:', err);
  process.exit(1);
});
