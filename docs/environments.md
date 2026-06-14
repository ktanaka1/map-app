# 環境情報

## 本番環境

|                   | URL                                            |
| ----------------- | ---------------------------------------------- |
| フロントエンド    | https://map-app-client-mmy6.vercel.app         |
| バックエンド      | https://ktanaka1-map-app.hf.space              |
| HF Space 管理画面 | https://huggingface.co/spaces/ktanaka1/map-app |

### フロントエンド（Vercel）

- **サービス**: Vercel（無料）
- **リポジトリ設定**: Root Directory = `client/`
- **SPAルーティング**: `vercel.json`（リポジトリルート）に rewrite ルールを記載

環境変数:

| 変数名            | 値                                  |
| ----------------- | ----------------------------------- |
| `VITE_API_URL`    | `https://ktanaka1-map-app.hf.space` |
| `VITE_SOCKET_URL` | `https://ktanaka1-map-app.hf.space` |

### バックエンド（Hugging Face Spaces）

- **サービス**: Hugging Face Spaces（Docker / CPU Basic 2vCPU・16GB RAM・無料）
- **アカウント**: ktanaka1
- **注意**: 48時間無アクセスでスリープ（最初のHTTPアクセスで自動復帰）

環境変数（Space Settings → Variables and secrets で管理）:

| 種類     | 変数名                  | 用途                             |
| -------- | ----------------------- | -------------------------------- |
| Secret   | `GOOGLE_PLACES_API_KEY` | Google Places API 認証           |
| Variable | `CLIENT_URL`            | CORS 許可オリジン（VercelのURL） |

`NODE_ENV=production` は Dockerfile 内で設定済み。

### バックエンドのデプロイ手順

HF Spaces はバイナリファイル（`client/ios` のアイコン PNG）を含む push を拒否するため、
`client/ios` を除外した単一コミットを force push する専用スクリプトを用意している。

```bash
./scripts/deploy-hf.sh
```

> `git push hf main` は通らない（バイナリ拒否のため）。必ずスクリプト経由で行う。

疎通確認:

```bash
curl https://ktanaka1-map-app.hf.space/health
# → {"status":"ok","timestamp":"..."}
```

---

## ローカル開発環境

```bash
# 依存関係インストール
npm install

# バックエンド起動（PORT=3001）
npm run dev --workspace=server

# フロントエンド起動
npm run dev --workspace=client
# → http://localhost:5173
```

環境変数ファイル（`.env` はリポジトリに含まれていない）:

**`server/.env`**

```
GOOGLE_PLACES_API_KEY=...
CLIENT_URL=http://localhost:5173
PORT=3001
```

**`client/.env`**

```
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
```
