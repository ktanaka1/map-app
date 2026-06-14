# アーキテクチャ

## 技術スタック

- **プラットフォーム**: Web（PWA）
- **言語**: TypeScript（フロント・バック統一）
- **フロントエンド**: React + Vite
- **バックエンド**: Express + Socket.IO
- **データ管理**: インメモリ（MVP方針・2026-06確定。セッションは24時間TTLの短命データのためDBを使わない。将来の履歴機能でPostgreSQL + Prismaを再検討、schema.prismaはドラフトとして保管）
- **外部API**: Google Places API（飲食店検索・クチコミ取得）
- **インフラ**: Vercel（フロント）+ Hugging Face Spaces（バックエンド・Docker）
- **設計パターン**: モノリス（レイヤードアーキテクチャ）

## 選定理由

- **TypeScript統一**: フロント・バックで型定義を共有し、リアルタイム通信のデータ構造の不整合を防止
- **React + Vite**: SEO不要のSPAに最適。軽量・高速ビルドでMVPの開発速度を優先
- **Express + Socket.IO**: WebSocketのルーム機能がセッション管理に直結。自動再接続で不安定な回線にも対応
- **インメモリ管理**: セッション・投票は24時間で消える短命データであり、MVPでは速度優先でDBを持たない。サーバー再起動での消失は許容（将来の履歴機能でPostgreSQL + Prismaを再検討）
- **Google Places API**: 周辺検索・クチコミ・評価をワンストップで提供。GPS連携が標準機能
- **Vercel + Hugging Face Spaces**: フロントはCDN配信で高速。バックエンドはHF Spaces（Docker / CPU Basic）を採用。カード登録不要の無料枠でWebSocket対応・常時稼働（48時間無アクセスでスリープ、HTTPアクセスで自動復帰）

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
│   │   ├── services/          # ビジネスロジック（セッションはインメモリ管理）
│   │   ├── socket/            # Socket.IO イベントハンドラ
│   │   ├── types/             # 型定義
│   │   └── index.ts           # エントリーポイント
│   ├── prisma/
│   │   └── schema.prisma      # 未使用（将来の履歴機能用ドラフト）
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
