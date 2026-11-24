// Cliente de consola para probar el servidor de señalización sin interfaz.
// Uso:  node scripts/cliente.js ws://localhost:8081/cliente  [nombre]
// Lo que escribas se envía como mensaje de chat; lo que llegue del otro nodo se imprime.
const readline = require('readline');
const WebSocket = require('ws');

const url = process.argv[2] || 'ws://localhost:8081/cliente';
const nombre = process.argv[3] || 'consola';
const ws = new WebSocket(url);

ws.on('open', () => {
  console.log(`Conectado a ${url} como "${nombre}". Escribe y presiona Enter (Ctrl+C para salir).`);
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (linea) => {
    if (!linea.trim()) return;
    ws.send(JSON.stringify({ type: 'chat', from: nombre, payload: { text: linea } }));
  });
  rl.on('close', () => setTimeout(() => ws.close(), 500)); // fin de la entrada (Ctrl+D o pipe)
});

ws.on('message', (datos) => {
  const m = JSON.parse(datos);
  if (m.type === 'chat') console.log(`<< [${m.origin}] ${m.from}: ${m.payload.text}`);
  else if (m.type === 'presence') console.log(`** El otro nodo está ${m.payload.peer}`);
  else if (m.type === 'ack') console.log(`   (entregado al par: ${m.delivered ? 'sí' : 'en cola'})`);
  else console.log('<<', m);
});

ws.on('close', () => { console.log('Conexión cerrada'); process.exit(0); });
ws.on('error', (e) => { console.error('Error:', e.message); process.exit(1); });
