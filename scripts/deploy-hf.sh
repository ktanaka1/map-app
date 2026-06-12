#!/usr/bin/env bash
# Hugging Face Spaces へのデプロイ
#
# HF はバイナリファイル（client/ios のアイコンPNG等）を含む push を拒否するため、
# client/ios を除外した履歴なしの単一コミットを作って force push する。
# main ブランチと作業ツリーには一切影響しない。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

export GIT_INDEX_FILE="$(mktemp)"
git read-tree main
git rm -r --cached --quiet client/ios
TREE=$(git write-tree)
COMMIT=$(git commit-tree "$TREE" -m "deploy: HF Spaces用（iOSプロジェクトを除外）")
unset GIT_INDEX_FILE

git push -f hf "${COMMIT}:refs/heads/main"
echo "deployed: https://ktanaka1-map-app.hf.space"
