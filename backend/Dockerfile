# ---------- 构建阶段 ----------
FROM node:20-alpine AS build
WORKDIR /app
# Prisma 引擎需要 OpenSSL：alpine 默认不带，缺失会退化为 openssl-1.1.x 引擎，
# 运行时找不到 libssl.so.1.1 而直接报错
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# tini 负责转发信号 / 回收僵尸进程，配合 index.ts 的优雅退出；openssl 提供 libssl.so.3（Prisma 引擎依赖）
RUN apk add --no-cache tini openssl

COPY package*.json ./
# prisma CLI 属于运行期依赖：容器内需要执行 `npx prisma migrate deploy`
RUN npm ci --omit=dev && npm cache clean --force

# 复用构建阶段生成的 Prisma Client（含查询引擎二进制）
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
