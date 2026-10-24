#!/bin/bash
# 各iMacで実行：Chrome をキオスク(全画面)で起動して展示ページを開く
#   使い方: ./kiosk-mac.sh 192.168.0.200        (サーバのIP)
#           ./kiosk-mac.sh 192.168.0.200:8080 2-5 (座席を明示する場合)
#   サーバから直接: curl -s http://192.168.0.200:8080/kiosk.sh | bash
set -eu
SERVER="${1:-${UNIVFES_SERVER:-}}"
[ -n "$SERVER" ] || { echo "サーバのIP[:ポート] を指定してください" >&2; exit 1; }
case "$SERVER" in *:*) ;; *) SERVER="$SERVER:8080" ;; esac
URL="http://$SERVER/"
[ -n "${2:-}" ] && URL="$URL?seat=$2"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="/tmp/univfes-kiosk"
[ -x "$CHROME" ] || { echo "Google Chrome が /Applications にありません" >&2; exit 1; }

# 既存のキオスクを終了
pkill -f "user-data-dir=$PROFILE" 2>/dev/null || true
sleep 1

# 音量・スリープ対策
osascript -e 'set volume output volume 60' -e 'set volume without output muted' || true
pkill -x caffeinate 2>/dev/null || true
nohup caffeinate -dimsu >/dev/null 2>&1 &

# --unsafely-treat-insecure-origin-as-secure : http でもカメラを使えるようにする
# --use-fake-ui-for-media-stream            : カメラ許可ダイアログを自動承認
# --autoplay-policy=no-user-gesture-required: クリック無しで音を鳴らす
nohup "$CHROME" \
  --user-data-dir="$PROFILE" \
  --kiosk \
  --no-first-run --no-default-browser-check \
  --disable-session-crashed-bubble --disable-infobars --noerrdialogs \
  --disable-translate --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --unsafely-treat-insecure-origin-as-secure="http://$SERVER" \
  "$URL" >/dev/null 2>&1 &
echo "起動しました: $URL"
