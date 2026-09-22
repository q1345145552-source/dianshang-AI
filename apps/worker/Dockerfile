FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22.23.2-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# 不用 root 跑
RUN addgroup -S -g 1001 app \
 && adduser -S -D -H -u 1001 -G app app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
USER app
CMD ["node", "dist/index.js"]
