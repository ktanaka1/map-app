# App Store 審査メモ（Review Notes）

App Store Connect の **「App 審査情報 → メモ（App Review Information → Notes）」** に貼る原稿と、
その運用ガイド。狙いは **Guideline 4.2 Minimum Functionality** のリジェクト回避
（＝「これは WebView でラップしただけのサイトでは？」と判定されないこと）。

戦略の詳細は `architecture-decisions/ADR-005-stay-capacitor-vs-react-native.md` を参照。

## 4.2 対策の3本柱（このメモの前提）

1. **Solo モードで審査員が1人でも完全なフローを体験できる**
   — 審査は基本「審査員1人・1台」。本アプリの真価は複数人投票だが、ソロ審査だと
   体感できず「ただの検索サイト」に見えるのが最大リスク。
   → トップの「ひとりで決める」から、キーワード入力 → 検索 → キープ/除外投票 → 決定
   まで1人で完結できることを**メモの冒頭で明示し、まずそこを触らせる**。
2. **ネイティブ機能の存在を具体的に列挙** — カメラQRスキャン／共有シート／ハプティクス／スワイプ。
3. **複数人体験はデモ動画で補完** — 実機2〜3台での同期投票を録画し、限定公開URLをメモに添える。

## App Store Connect に貼る原稿（英語推奨・コピペ用）

> **About this app**
> This app helps a group of people decide on one restaurant together by voting in
> real time. Each participant joins a shared session (via QR code or a shared link),
> everyone contributes search keywords, then each person keeps/rejects candidate
> restaurants. The app keeps only the restaurants everyone agrees on.
>
> **How to fully evaluate it with a single device (Solo mode)**
> The multi-user value needs several phones, but you can experience the complete core
> flow alone:
>
> 1. On the top screen, enter a name and tap **"ひとりで決める" (Decide by yourself / Solo)**.
> 2. Add one or more keywords (e.g. ramen, izakaya) and search.
> 3. Swipe right to keep / left to reject each restaurant (haptic feedback fires).
> 4. The app shows the decided restaurant and a native iOS share sheet to share it.
>
> **Native iOS features used**
>
> - Camera: in-app QR scanner to join a session ("QRコードで参加" on the top screen).
> - Native share sheet (UIActivityViewController) to share the invite link / decided restaurant.
> - Haptic feedback on swipe voting.
>
> **Multi-user demo**
> A short video of a real multi-device session is here: <DEMO_VIDEO_URL>
>
> **Notes**
>
> - Participants do NOT need to install the app; they can join instantly via a web link,
>   which is intentional (low-friction joining is core to the product).
> - Backend: <BACKEND_URL> (sessions are short-lived, kept in memory, 24h TTL).
> - No login/account is required to evaluate the app.

## 日本語版（必要なら併記）

> このアプリは、複数人がリアルタイム投票で行く飲食店を1つに決めるためのものです。
> QRコード／リンクで同じセッションに参加し、全員でキーワードを出して検索、各自がキープ/除外で
> 投票し、全員一致の店だけが残ります。
>
> **1台で全機能を確認する方法（Solo モード）**
> 真価は複数人ですが、中核フローは1人で完結できます：
>
> 1. トップで名前を入れ「ひとりで決める」を選択
> 2. キーワード（例: ラーメン）を追加して検索
> 3. 右スワイプでキープ／左スワイプで除外（ハプティクス連動）
> 4. 決定店が表示され、ネイティブ共有シートで共有できます
>
> ネイティブ機能: カメラQRスキャン（「QRコードで参加」）／ネイティブ共有シート／スワイプ投票のハプティクス。
> 複数人デモ動画: <DEMO_VIDEO_URL>
> 参加者はアプリ不要でWebリンクから即参加できます（低摩擦な参加が本サービスの核）。

## 提出前チェックリスト

- [ ] `<DEMO_VIDEO_URL>` を実機2〜3台で撮った同期投票デモの限定公開URLに差し替え
- [ ] `<BACKEND_URL>` を本番バックエンドURLに差し替え（deploy-status 参照）
- [ ] バックエンドが起動中か確認（HF Spaces は48時間無アクセスでスリープ → 審査前にアクセスして復帰させる）
- [ ] Solo モードで一連のフローが本番URLで通ることを確認
- [ ] カメラQRスキャンが実機で動作（権限ダイアログに上記の説明文が出る）
- [ ] 共有シートが実機で起動（AirDrop/LINE 等が並ぶ）

## デモ動画の撮り方（推奨カット）

1. ホストがセッション作成 → QR表示
2. 別端末が標準カメラ or アプリ内スキャナでQR読取 → 即参加
3. 全員でキーワード入力
4. 各自がスワイプ投票（票が同期して揃っていく様子）
5. 全員一致で1店に決定 → 共有シートで共有
   （30〜60秒。複数端末が同時に動いて同期している画が4.2対策として効く）
