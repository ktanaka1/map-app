# ADR-001: フロント・バックをTypeScriptで統一

## 状況

フロントエンド（React）とバックエンド（Express + Socket.IO）の言語選定が必要。

## 選択肢

- TypeScript統一: フロント・バック同一言語、型共有可能
- TypeScript + Go: バックエンドの並行処理に強い
- TypeScript + Python: AI/ML連携に強い

## 決定

TypeScript統一

## 理由

リアルタイム同期（Socket.IO）で投票イベント・セッション情報等のデータ構造をフロント・バックで共有する必要がある。shared/types/ で型定義を一元管理し、不整合を防止する。WebSocket通信はNode.jsが最も得意な領域であり、パフォーマンス面でも問題ない。
