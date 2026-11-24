## Sesión 1 — 2026-11-13 · 2.5 h
- **Qué hice:** lectura de la guía del laboratorio y revisión de los temas del Bloque A (contenedores vs. máquinas virtuales y redes de Docker). Armé un borrador de notas con definiciones básicas y el esquema general de lo que pedía el informe.
- **Problema:** al comparar redes de Docker (`bridge`, `host`, `overlay`, `none`), no tenía claro cuándo basta con una red `bridge` definida por el usuario frente a usar la red por defecto o `overlay`, ni cómo funciona exactamente la resolución por nombre de servicio.
- **Solución:** revisé la documentación de redes de Docker y dejé anotado usar una red `bridge` propia para los dos nodos, ya que ahí sí se activa el DNS interno para resolver nombres de contenedor sin depender de IPs fijas.
- **Uso de IA:** usé IA para aclarar dudas puntuales sobre diferencias entre tipos de red de Docker y pedir ejemplos de cómo estructurar las respuestas del Bloque A.

## Sesión 2 — 2026-11-16 · 3.0 h
- **Qué hice:** estudié los Bloques B y C (WebRTC, señalización, SDP/oferta/respuesta, ICE/STUN/TURN, NAT y WebSockets frente a polling o alternativas) y avancé en la redacción del borrador del informe de investigación.
- **Problema:** me enredé un poco separando qué hace STUN, qué hace TURN y qué viaja por el canal de señalización antes de que exista la conexión P2P.
- **Solución:** separé el flujo en dos etapas en mis notas: primero el intercambio de SDP y candidatos ICE por WebSocket para descubrir rutas y negociar medios, y luego el tráfico directo (o relevado si la red lo bloquea) entre navegadores.
- **Uso de IA:** utilicé IA para revisar que no estuviera mezclando conceptos de señalización con transporte de medios y para corregir redacción de párrafos del informe.

## Sesión 3 — 2026-11-20 · 4.5 h
- **Qué hice:** monté el servidor de señalización en Node.js con `ws`, el `Dockerfile` y el `docker-compose.yml` con dos nodos en la red `mensajero-net`, y probé envío y recepción de mensajes por consola con `wscat` viendo los logs de ambos lados.
- **Problema:** al detener los contenedores (`docker compose down`) el proceso no terminaba con `SIGTERM`, porque la conexión WebSocket abierta con el otro nodo mantenía vivo el servidor HTTP; Docker esperaba 10 s y lo mataba con `SIGKILL`.
- **Solución:** manejador de `SIGTERM`/`SIGINT` que cierra la conexión saliente al par y todas las conexiones entrantes antes de `servidor.close()`.
- **Problema:** si `nodo-a` arranca antes que `nodo-b`, la primera conexión falla (`ECONNREFUSED`).
- **Solución:** reconexión automática cada 2 s y cola de mensajes pendientes. Se prefirió a `depends_on`, porque los dos nodos dependen uno del otro.
- **Uso de IA:** se usó un asistente de IA (Claude) para revisar la estructura del servidor y redactar el README; el código fue probado y entendido por mí.