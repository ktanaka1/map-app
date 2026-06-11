# server（Express + Socket.IO）のデプロイ用イメージ。Hugging Face Spaces / Koyeb / Fly.io 共用
# ビルドコンテキストはリポジトリルート（npm workspaces のため shared/ が必要）

# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY shared/ shared/
RUN npm ci -w server

COPY server/tsconfig.json server/
COPY server/src server/src
RUN npm run build -w server

# ── Runtime stage ────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY shared/package.json shared/
RUN npm ci -w server --omit=dev

COPY --from=build /app/server/dist server/dist

# Hugging Face Spaces は非rootユーザー（uid 1000）での実行を推奨。node:alpine の node ユーザーが uid 1000
USER node

EXPOSE 3000
CMD ["node", "server/dist/index.js"]
