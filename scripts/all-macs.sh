#!/bin/bash
# 操作用PCから40台をまとめて起動/終了する（各iMacで「リモートログイン」を有効にし、
# 展示用ユーザで画面にログインしておくこと）
#   使い方: ./all-macs.sh start 192.168.0.200    (サーバIP)
#           ./all-macs.sh stop
# 環境変数: SUBNET(既定 192.168.0) / START(既定 1) / COUNT(既定 40) / USER_NAME(既定 現在のユーザ)
set -u
ACTION="${1:?start|stop}"
SERVER="${2:-}"
SUBNET="${SUBNET:-192.168.0}"
START="${START:-1}"
COUNT="${COUNT:-40}"
USER_NAME="${USER_NAME:-$USER}"
REMOTE_SCRIPT='~/univfes/kiosk-mac.sh'
DIR="$(cd "$(dirname "$0")" && pwd)"

for i in $(seq "$START" $((START + COUNT - 1))); do
  host="$USER_NAME@$SUBNET.$i"
  (
    case "$ACTION" in
      start)
        ssh -o ConnectTimeout=5 -o BatchMode=yes "$host" 'mkdir -p ~/univfes' &&
          scp -q "$DIR/kiosk-mac.sh" "$host:univfes/kiosk-mac.sh" &&
          ssh -o ConnectTimeout=5 -o BatchMode=yes "$host" "chmod +x $REMOTE_SCRIPT && $REMOTE_SCRIPT $SERVER" ;;
      stop)
        ssh -o ConnectTimeout=5 -o BatchMode=yes "$host" 'pkill -f user-data-dir=/tmp/univfes-kiosk; pkill -x caffeinate' ;;
    esac && echo "OK  $SUBNET.$i" || echo "NG  $SUBNET.$i"
  ) &
done
wait
