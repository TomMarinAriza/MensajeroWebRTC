# Mensajero WebRTC — Sistemas Distribuidos (UTP)

**Estado: primer avance (fase 2), sin interfaz.** Dos contenedores Docker, cada uno con un servidor de señalización WebSocket, que se encuentran por nombre en una red bridge propia e intercambian mensajes de texto desde la consola.

## Requisitos

- Docker Engine 24+ con Docker Compose v2 (`docker compose version`)
- Opcional para probar: `wscat` (`npm install -g wscat`) o Node.js 18+ para `scripts/cliente.js`

## Estructura

```
servidor/            Código del servidor de señalización + Dockerfile
  server.js
  package.json
  Dockerfile
scripts/cliente.js   Cliente de consola para pruebas
docker-compose.yml   Dos nodos (nodo-a, nodo-b) en la red mensajero-net
docs/uml/            Fuentes Mermaid (.mmd) y PNG de los diagramas UML
docs/informe.pdf     Informe de investigación (fuente: docs/informe.md)
BITACORA.md          Bitácora de sesiones
```

## Ejecutar

```bash
docker compose up --build        # levanta nodo-a y nodo-b
docker compose logs -f           # en otra terminal: logs de ambos nodos
docker compose down              # detener y borrar contenedores y red
```

## Puertos

| Servicio | Puerto interno | Puerto publicado en el anfitrión | Rutas |
|---|---|---|---|
| nodo-a | 8080 | 8081 | `ws://localhost:8081/cliente`, `GET /health`, `POST /send` |
| nodo-b | 8080 | 8082 | `ws://localhost:8082/cliente`, `GET /health`, `POST /send` |

Entre contenedores, cada nodo se conecta al otro por `ws://nodo-a:8080/par` / `ws://nodo-b:8080/par` (nombre de servicio, resuelto por el DNS interno de Docker). La ruta `/par` no se usa desde el anfitrión.

## Probar el avance

**1. Los dos nodos se ven por nombre**

```bash
docker compose exec nodo-a ping -c 2 nodo-b
docker compose exec nodo-a wget -qO- http://nodo-b:8080/health
curl localhost:8081/health    # "peerConnected": true
```

**2. Chat entre consolas** (dos terminales)

```bash
# Terminal 1 (usuario en nodo-a)
wscat -c ws://localhost:8081/cliente
> {"type":"chat","from":"ana","payload":{"text":"hola desde A"}}

# Terminal 2 (usuario en nodo-b)
wscat -c ws://localhost:8082/cliente
```

También se puede escribir texto plano en wscat; se envía como chat. Alternativa sin wscat:

```bash
cd servidor && npm install && cd ..
NODE_PATH=servidor/node_modules node scripts/cliente.js ws://localhost:8081/cliente ana
```

**3. Enviar con curl**

```bash
curl -X POST localhost:8082/send -d '{"text":"hola con curl desde B"}'
```

**4. Ver en los logs** las líneas `ENVIADO -> par` en un nodo y `RECIBIDO <- nodo-x` en el otro.

**5. Reconexión:** `docker compose stop nodo-b` → nodo-a registra "Se perdió la conexión con el par" y reintenta cada 2 s; `docker compose start nodo-b` → se reconecta solo y entrega los mensajes que quedaron en cola.

## Formato de los mensajes de señalización

```json
{
  "id": "uuid",
  "type": "chat | offer | answer | ice | hangup | presence",
  "from": "usuario que lo originó",
  "to": "destinatario (null = el otro extremo)",
  "origin": "nodo que lo recibió del cliente",
  "payload": { "text": "..." },
  "ts": 1732400000000
}
```

`offer`, `answer` e `ice` ya son aceptados y reenviados; en la fase 3 llevarán el SDP y los candidatos ICE de la videollamada. El servidor nunca interpreta su contenido, solo lo retransmite.

## Problemas conocidos

- Aún sin interfaz web ni HTTPS (fase 3). En la fase 3 se agrega un proxy HTTPS para que el navegador pueda usar cámara y micrófono fuera de `localhost`.
- La cola de mensajes pendientes vive en memoria: si el nodo se reinicia se pierde.
