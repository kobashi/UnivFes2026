#!/bin/bash
# 各iMacで実行：Chrome をキオスク(全画面)で起動して展示ページを開く
#   使い方: ./kiosk-mac.sh 192.168.0.200        (サーバのIP)
#           ./kiosk-mac.sh 192.168.0.200:8080 2-5 (座席を明示する場合)
set -eu
SERVER="${1:?サーバのIP[:ポート] を指定してください}"
case "$SERVER" in *:*) ;; *) SERVER="$SERVER:8080" ;; esac
URL="http://$SERVER/"
[ -n "${2:-}" ] && URL="$URL?seat=$2"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="/tmp/univfes-kiosk"

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
