#!/usr/bin/env bash
# Hugging Face Spaces へのデプロイ
#
# Space は public のため、サーバー実行に必要なファイルだけを push する:
# - docs/・CLAUDE.md・scripts/ は内部ドキュメントなので公開しない
# - client/ は Docker ビルドの npm workspaces 解決に必要な package.json のみ残す
#   （HF がバイナリ push を拒否する client/ios のアイコンPNG等もこれで除外される）
# 履歴なしの単一コミットを作って force push する。main ブランチと作業ツリーには一切影響しない。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

export GIT_INDEX_FILE="$(mktemp)"
git read-tree main
git rm -r --cached --quiet client docs scripts CLAUDE.md .claude
git update-index --add --cacheinfo "100644,$(git rev-parse main:client/package.json),client/package.json"
TREE=$(git write-tree)
COMMIT=$(git commit-tree "$TREE" -m "deploy: HF Spaces用（サーバー実行に必要なファイルのみ）")
unset GIT_INDEX_FILE

echo "── push されるファイル一覧 ──"
git ls-tree -r --name-only "$TREE"
echo "────────────────────────────"

git push -f hf "${COMMIT}:refs/heads/main"
echo "deployed: https://ktanaka1-map-app.hf.space"
