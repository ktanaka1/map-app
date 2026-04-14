# ADR-002: リアルタイム同期にSocket.IOを採用

## 状況
複数人がスマホを同期してリアルタイム投票する機能がコア要件。

## 選択肢
- Express + Socket.IO: ルーム機能・自動再接続が組み込み済み
- Hono + ws: 軽量だがWebSocket周りは自前実装が多い
- Fastify + Socket.IO: Expressより高速だが情報量が少ない

## 決定
Express + Socket.IO

## 理由
Socket.IOのルーム機能がセッション管理（QR/リンクで参加→ルームに入室）に直結する。自動再接続機能が外出先の不安定な回線に対応。実績と情報量が最多で、MVP開発速度を優先。
