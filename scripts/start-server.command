#!/bin/bash
# サーバ用のMacでダブルクリック：展示サーバを起動する（このウィンドウを閉じると停止）
cd "$(dirname "$0")/.." || exit 1

# 使う Node の場所（見つかった最初のもの）
#   1. 環境変数 NODE_DIR
#   2. このリポジトリのフォルダと同じ場所に置いた node/bin（インストールせずに展開した Node）
#      例：/Volumes/DATA/node/bin と /Volumes/DATA/UnivFes2026
for d in "${NODE_DIR:-}" "$(pwd)/../node/bin"; do
  if [ -n "$d" ] && [ -x "$d/node" ]; then
    PATH="$d:$PATH"
    break
  fi
done

if ! command -v node >/dev/null 2>&1; then
  for p in /usr/local/bin /opt/homebrew/bin "$HOME"/node-*/bin; do [ -x "$p/node" ] && PATH="$p:$PATH"; done
fi
command -v node >/dev/null 2>&1 || { echo "node が見つかりません"; read -r -p "Enterで閉じる"; exit 1; }
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$MAJOR" -ge 18 ] || { echo "Node.js 18 以上が必要です（現在 $(node -v)）"; read -r -p "Enterで閉じる"; exit 1; }

# サーバ実行中はスリープさせない
caffeinate -dims -w $$ &

while true; do
  node server/server.js
  echo "サーバが停止しました。3秒後に再起動します（止めるにはこのウィンドウを閉じる）"
  sleep 3
done
