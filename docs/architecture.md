# アーキテクチャ

## 技術スタック

- **プラットフォーム**: Web（PWA）
- **言語**: TypeScript（フロント・バック統一）
- **フロントエンド**: React + Vite
- **バックエンド**: Express + Socket.IO
- **データベース**: PostgreSQL
- **ORM**: Prisma
- **外部API**: Google Places API（飲食店検索・クチコミ取得）
- **インフラ**: Vercel（フロント）+ Railway（バックエンド + DB）
- **設計パターン**: モノリス（レイヤードアーキテクチャ）

## 選定理由

- **TypeScript統一**: フロント・バックで型定義を共有し、リアルタイム通信のデータ構造の不整合を防止
- **React + Vite**: SEO不要のSPAに最適。軽量・高速ビルドでMVPの開発速度を優先
- **Express + Socket.IO**: WebSocketのルーム機能がセッション管理に直結。自動再接続で不安定な回線にも対応
- **PostgreSQL + Prisma**: 投票データのリレーション管理に強い。スキーマから型自動生成で開発体験◎
- **Google Places API**: 周辺検索・クチコミ・評価をワンストップで提供。GPS連携が標準機能
- **Vercel + Railway**: フロントはCDN配信で高速、バックエンドはWebSocket対応の常時稼働サーバー

## ディレクトリ構成

```
map-app/
├── client/                    # React + Vite（フロントエンド）
│   ├── src/
│   │   ├── components/        # UIコンポーネント
│   │   ├── pages/             # ページ単位のコンポーネント
│   │   ├── hooks/             # カスタムフック（Socket.IO接続等）
│   │   ├── services/          # API呼び出し・Socket通信
│   │   ├── types/             # 型定義
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── server/                    # Express + Socket.IO（バックエンド）
│   ├── src/
│   │   ├── routes/            # Express ルーティング
│   │   ├── services/          # ビジネスロジック
│   │   ├── repositories/      # DBアクセス（Prisma経由）
│   │   ├── socket/            # Socket.IO イベントハンドラ
│   │   ├── types/             # 型定義
│   │   └── index.ts           # エントリーポイント
│   ├── prisma/
│   │   └── schema.prisma      # DBスキーマ定義
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                    # フロント・バック共通の型定義
│   └── types/
│       ├── session.ts         # セッション・投票関連の型
│       └── restaurant.ts      # 飲食店・クチコミ関連の型
│
├── docs/                      # ドキュメント
│   ├── service-overview.md
│   ├── architecture.md
│   ├── specs/
│   └── architecture-decisions/
│
├── CLAUDE.md
├── .gitignore
└── package.json               # ワークスペース設定（npm workspaces）
```
