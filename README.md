---
title: map-app server
emoji: 🍽️
colorFrom: orange
colorTo: red
sdk: docker
app_port: 3000
pinned: false
---

# map-app

場所×キーワードで飲食店を検索し、複数人がリアルタイムで投票してお店を1つに決めるWebアプリ。

- **フロントエンド**: React + Vite → Vercel
- **バックエンド**: Express + Socket.IO → Hugging Face Spaces（Docker、このリポジトリのDockerfileでビルド）
- 詳細は `docs/service-overview.md` / `docs/architecture.md` を参照

> 冒頭のYAMLメタデータは Hugging Face Spaces 用のデプロイ設定です（GitHub上では無視して問題ありません）。
