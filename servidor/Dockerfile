# Imagen base oficial de Node.js 22 sobre Alpine (liviana)
FROM node:22-alpine
# Carpeta de trabajo dentro del contenedor
WORKDIR /app
# Primero solo package.json para aprovechar la caché de capas
COPY package*.json ./
# Instala dependencias de producción (ws)
RUN npm install --omit=dev
# Copia el código del servidor
COPY server.js ./
# Documenta el puerto interno (EXPOSE no lo publica al anfitrión)
EXPOSE 8080
# Corre como usuario sin privilegios
USER node
# Comando que arranca el contenedor
CMD ["node", "server.js"]
