FROM node:22-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM node:22-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY server.js ./
COPY --from=builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
CMD ["node", "server.js"]
