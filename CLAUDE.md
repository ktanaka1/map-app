# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

場所×キーワードで飲食店を検索し、複数人がリアルタイムで投票してお店を1つに決めるWebアプリ。参加者はQRコードまたはリンクシェアでセッションに参加し、全員一致でお店を決める。

## 技術スタック

- **フロントエンド**: React + Vite（TypeScript）→ Vercel にデプロイ
- **バックエンド**: Express + Socket.IO（TypeScript）→ デプロイ先検討中（旧Railway）
- **データ管理**: インメモリ（MVP方針。セッションは24時間TTLの短命データのためDB不使用。`server/prisma/schema.prisma` は将来の履歴機能用ドラフトとして未使用のまま保管）
- **外部API**: Google Places API（飲食店検索・クチコミ・GPS周辺検索）
- **モノレポ管理**: npm workspaces（root `package.json`）

## ディレクトリ構成

```
map-app/
├── client/          # React + Vite
│   └── src/
│       ├── components/   # UIコンポーネント
│       ├── pages/        # ページ単位のコンポーネント
│       ├── hooks/        # カスタムフック（Socket.IO接続等）
│       ├── services/     # API呼び出し・Socket通信
│       └── types/        # 型定義
├── server/          # Express + Socket.IO
│   └── src/
│       ├── routes/       # Express ルーティング
│       ├── services/     # ビジネスロジック（セッションはインメモリ管理）
│       ├── socket/       # Socket.IOイベントハンドラ
│       └── types/        # 型定義
│   └── prisma/
│       └── schema.prisma # 未使用（将来の履歴機能用ドラフト）
└── shared/          # フロント・バック共通の型定義
    └── types/
        ├── session.ts    # セッション・投票関連
        └── restaurant.ts # 飲食店・クチコミ関連
```

## 重要な設計ルール

### リアルタイム通信

- Socket.IO の**ルーム機能**でセッションを管理する（1セッション = 1ルーム）
- セッションイベントの型定義は必ず `shared/types/session.ts` で管理し、フロント・バックで共有する
- 参加者が1人でも離脱したらセッションを終了する

### 投票ロジック

- 全員一致のみキープ。1人でもNGなら除外
- 全候補が除外された場合、キープ数最多の店をフォールバック表示する

### セッション参加フロー

- ホストがセッション作成 → QRコード＋リンクの両方を表示
- 参加者はどちらかで入室 → 参加者確定後にキーワード入力フェーズへ

## 開発コマンド

```bash
# 依存関係インストール（ルートで実行、全ワークスペースに適用）
npm install

# フロントエンド開発サーバー
npm run dev --workspace=client

# バックエンド開発サーバー
npm run dev --workspace=server
```

## 環境変数

```bash
# server/.env
GOOGLE_PLACES_API_KEY=...
CLIENT_URL=http://localhost:5173   # CORS設定用

# client/.env
VITE_API_URL=http://localhost:3000
VITE_SOCKET_URL=http://localhost:3000
```

## テストポリシー

- **フレームワーク**: Jest（フロント・バック共通）
- **テストファイル**: 実装ファイルと同じディレクトリに `*.test.ts` として配置
- **必須カバレッジ**: `server/src/services/` の投票ロジック（全員一致判定・フォールバック）
- **外部API・DBはモック**: Google Places API と Prisma は必ずモックして使用
- テスト実行: `npm test --workspace=server` / `npm test --workspace=client`

## 参照ドキュメント

- `docs/service-overview.md` — サービス概要・ユーザーフロー・仕様詳細
- `docs/architecture.md` — 技術スタック・選定理由
- `docs/architecture-decisions/` — 主要な技術判断の記録
- `docs/specs/` — 機能仕様書（Phase B以降に追加）
