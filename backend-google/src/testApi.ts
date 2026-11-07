import { app } from './index';
import * as http from 'http';

async function testApi() {
  const server = http.createServer(app);
  
  await new Promise<void>((resolve) => {
    server.listen(3333, () => {
      console.log('📡 Servidor de pruebas iniciado en http://localhost:3333');
      resolve();
    });
  });

  const endpoints = ['/health', '/items', '/customers', '/orders'];

  for (const ep of endpoints) {
    console.log(`\n🔍 Probando GET ${ep}...`);
    const res = await fetch(`http://localhost:3333${ep}`);
    const data = await res.json();
    console.log(`HTTP ${res.status} OK:`, JSON.stringify(data, null, 2));
  }

  server.close(() => {
    console.log('\n🛑 Servidor de pruebas cerrado correctamente.');
  });
}

testApi().catch((err) => {
  console.error('❌ Error probando API:', err);
  process.exit(1);
});
