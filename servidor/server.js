// Servidor de señalización del mensajero WebRTC — Primer avance (sin interfaz)
//
// Cada nodo (contenedor) corre este mismo programa. Tiene dos rutas WebSocket:
//   /cliente -> donde se conectan los usuarios locales (hoy wscat o scripts/cliente.js,
//               en la fase 3 el navegador).
//   /par     -> donde se conecta el OTRO nodo para enviarle mensajes.
//
// Cada nodo abre una conexión SALIENTE hacia el otro nodo usando su NOMBRE de servicio
// (ej. ws://nodo-b:8080/par). El DNS interno de Docker traduce ese nombre a la IP.
// Nunca hay una IP escrita en el código: todo llega por variables de entorno.

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const NOMBRE_NODO = process.env.NODE_NAME || 'nodo-local';
const PUERTO = parseInt(process.env.PORT || '8080', 10);
const URL_PAR = process.env.PEER_URL || ''; // ej. ws://nodo-b:8080/par
const REINTENTO_MS = 2000;

// Tipos de mensaje admitidos. chat ya se usa; offer/answer/ice se usarán en la fase 3
// para la videollamada (el servidor solo los reenvía, nunca los interpreta).
const TIPOS = new Set(['chat', 'offer', 'answer', 'ice', 'hangup', 'presence']);

function log(...args) {
  console.log(`[${new Date().toISOString()}] [${NOMBRE_NODO}]`, ...args);
}

function crearMensaje(tipo, datos = {}) {
  return {
    id: crypto.randomUUID(),
    type: tipo,
    from: datos.from || NOMBRE_NODO,
    to: datos.to || null,
    origin: NOMBRE_NODO,
    payload: datos.payload ?? null,
    ts: Date.now(),
  };
}

// ---------- Clientes locales ----------
const clientes = new Set();

function enviarAClientes(msg) {
  const texto = JSON.stringify(msg);
  for (const c of clientes) if (c.readyState === WebSocket.OPEN) c.send(texto);
}

// ---------- Conexión saliente hacia el otro nodo ----------
let socketPar = null;
let parConectado = false;
const pendientes = []; // mensajes que esperan a que el par esté disponible

function conectarAlPar() {
  if (!URL_PAR) {
    log('PEER_URL vacío: este nodo funciona solo.');
    return;
  }
  log(`Conectando al par en ${URL_PAR} ...`);
  socketPar = new WebSocket(URL_PAR, { headers: { 'x-node-name': NOMBRE_NODO } });

  socketPar.on('open', () => {
    parConectado = true;
    log(`Conectado al par ${URL_PAR}`);
    enviarAClientes(crearMensaje('presence', { payload: { peer: 'online' } }));
    while (pendientes.length) socketPar.send(pendientes.shift());
  });

  socketPar.on('close', () => {
    if (parConectado) {
      log('Se perdió la conexión con el par.');
      enviarAClientes(crearMensaje('presence', { payload: { peer: 'offline' } }));
    }
    parConectado = false;
    setTimeout(conectarAlPar, REINTENTO_MS); // reconexión automática
  });

  socketPar.on('error', (err) => {
    log(`No se pudo conectar al par (${err.code || err.message}); reintento en ${REINTENTO_MS} ms`);
  });
}

function enviarAlPar(msg) {
  const texto = JSON.stringify(msg);
  if (parConectado && socketPar.readyState === WebSocket.OPEN) {
    socketPar.send(texto);
    return true;
  }
  pendientes.push(texto);
  return false;
}

// ---------- Procesamiento de un mensaje que llega de un cliente local ----------
function procesarDeCliente(datos, wsCliente) {
  let entrada;
  try {
    entrada = JSON.parse(datos);
  } catch {
    // Si alguien escribe texto plano en wscat, lo tratamos como chat.
    entrada = { type: 'chat', payload: { text: datos.toString() } };
  }
  if (!TIPOS.has(entrada.type)) {
    wsCliente.send(JSON.stringify(crearMensaje('error', { payload: { reason: `tipo desconocido: ${entrada.type}` } })));
    return;
  }
  const msg = crearMensaje(entrada.type, entrada);
  log(`ENVIADO   -> par | ${msg.type} | ${JSON.stringify(msg.payload)}`);
  const entregado = enviarAlPar(msg);
  if (!entregado) log('El par no está disponible: mensaje en cola.');
  wsCliente.send(JSON.stringify({ type: 'ack', id: msg.id, delivered: entregado }));
}

// ---------- Servidor HTTP + WebSocket ----------
const servidor = http.createServer((req, res) => {
  // GET /health: estado del nodo.  POST /send: enviar un chat con curl.
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ node: NOMBRE_NODO, peer: URL_PAR, peerConnected: parConectado, clients: clientes.size }));
  }
  if (req.method === 'POST' && req.url === '/send') {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      let texto;
      try { texto = JSON.parse(cuerpo).text; } catch { texto = cuerpo; }
      const msg = crearMensaje('chat', { from: 'curl', payload: { text: texto } });
      log(`ENVIADO   -> par | chat (HTTP) | ${JSON.stringify(msg.payload)}`);
      const entregado = enviarAlPar(msg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: msg.id, delivered: entregado }));
    });
    return;
  }
  res.writeHead(404);
  res.end('Ruta no encontrada\n');
});

const wssClientes = new WebSocketServer({ noServer: true });
const wssPar = new WebSocketServer({ noServer: true });

servidor.on('upgrade', (req, socket, head) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  if (ruta === '/cliente') wssClientes.handleUpgrade(req, socket, head, (ws) => wssClientes.emit('connection', ws, req));
  else if (ruta === '/par') wssPar.handleUpgrade(req, socket, head, (ws) => wssPar.emit('connection', ws, req));
  else socket.destroy();
});

wssClientes.on('connection', (ws) => {
  clientes.add(ws);
  log(`Cliente local conectado (total: ${clientes.size})`);
  ws.send(JSON.stringify(crearMensaje('presence', { payload: { peer: parConectado ? 'online' : 'offline' } })));
  ws.on('message', (datos) => procesarDeCliente(datos, ws));
  ws.on('close', () => {
    clientes.delete(ws);
    log(`Cliente local desconectado (total: ${clientes.size})`);
  });
});

wssPar.on('connection', (ws, req) => {
  const quien = req.headers['x-node-name'] || req.socket.remoteAddress;
  log(`El nodo ${quien} se conectó a /par`);
  ws.on('message', (datos) => {
    let msg;
    try { msg = JSON.parse(datos); } catch { return log('Mensaje del par inválido, descartado'); }
    log(`RECIBIDO  <- ${msg.origin} | ${msg.type} | ${JSON.stringify(msg.payload)}`);
    enviarAClientes(msg); // se entrega a los usuarios conectados a este nodo
  });
  ws.on('close', () => log(`El nodo ${quien} cerró su conexión a /par`));
});

servidor.listen(PUERTO, () => {
  log(`Servidor de señalización escuchando en el puerto ${PUERTO}`);
  conectarAlPar();
});

// Apagado limpio cuando Docker detiene el contenedor
let cerrando = false;
function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  log(`${senal} recibido, cerrando conexiones.`);
  if (socketPar) { socketPar.removeAllListeners('close'); socketPar.terminate(); }
  for (const ws of [...wssClientes.clients, ...wssPar.clients]) ws.terminate();
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
