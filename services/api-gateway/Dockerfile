# Multi-stage build for NestJS API Gateway

# Stage 1: Development/Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
