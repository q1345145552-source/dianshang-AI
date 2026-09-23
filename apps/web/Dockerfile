FROM node:22.23.2-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22.23.2-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js 的转发规则是在构建的时候就写进路由清单的，不是运行时读。
# 所以这个值必须在这里就给对，否则会落成默认的 localhost，
# 而容器里的 localhost 指的是它自己，转发必然失败。
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN npm run build

FROM node:22.23.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# 不用 root 跑
RUN addgroup -S -g 1001 app \
 && adduser -S -D -H -u 1001 -G app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
