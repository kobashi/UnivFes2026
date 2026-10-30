# 運用メモ（UnivFes2026 の PC実習室）

この展示を実際に設置した教室での手順です。一般的な使い方は [README](../README.md) を参照してください。

## 部屋とネットワーク

- 4列 × 10台の iMac。列1・列4は壁側を向き、列2・列3は中央通路を挟んで向かい合います（README の「部屋の配置」のとおり）。
- 各列の1番は、4列とも部屋の同じ側の端にあります（`rowReverse` は全列 `false`）。

| 役割 | IPアドレス |
|---|---|
| サーバ（教卓のiMac） | `192.168.112.70` |
| 列1 の 1〜10番 | `192.168.112.1` 〜 `.10` |
| 列2 の 1〜10番 | `192.168.112.11` 〜 `.20` |
| 列3 の 1〜10番 | `192.168.112.21` 〜 `.30` |
| 列4 の 1〜10番 | `192.168.112.31` 〜 `.40` |

`config.json` は既定値（`octetStart: 1`）のままで、この割り当てになります。

## 教卓iMac（サーバ）

教卓iMacは再起動で元に戻る設定のため、Node.js とリポジトリは消えない領域 `/Volumes/THAWSPACE` に置いています。

| もの | 場所 |
|---|---|
| Node.js | `/Volumes/THAWSPACE/node/bin` |
| リポジトリ | `/Volumes/THAWSPACE/UnivFes2026` |

`scripts/start-server.command` は、リポジトリと同じ場所にある `node` フォルダを自動で探すので、`/Volumes/THAWSPACE/node` がそのまま使われます。

### 起動

1. Finder で `/Volumes/THAWSPACE/UnivFes2026/scripts/start-server.command` をダブルクリックします。
2. 管理画面 `http://192.168.112.70:8080/admin` を開きます。

### ターミナルで `node` を使う（任意）

```bash
echo 'export PATH="/Volumes/THAWSPACE/node/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

ホームフォルダが凍結されている場合、この設定は再起動で消えます。残したい場合は、凍結を解除した状態で設定してから凍結し直します。

### 更新（教卓iMacには git がないので ZIP で入れ替える）

1. サーバのウィンドウを閉じて、サーバを止めます（展示用iMacは止めなくてよい）。
2. GitHub で Code › Download ZIP を選んでダウンロードします。
3. ターミナルで入れ替えます。ZIP のファイル名と展開後のフォルダ名は、ブランチ名によって変わります。
   ```bash
   cd /Volumes/THAWSPACE
   mv UnivFes2026 UnivFes2026-old
   ditto -x -k ~/Downloads/UnivFes2026-<ブランチ名>.zip .
   mv UnivFes2026-<ブランチ名> UnivFes2026
   cd UnivFes2026
   chmod +x scripts/*.command scripts/*.sh
   xattr -dr com.apple.quarantine .
   ```
4. 管理画面の「端末の間隔」を保存したことがある場合は、`geometry.json` を引き継ぎます。`config.json` は新しい版を使い、自分で変えた箇所だけ書き直します。
   ```bash
   cp /Volumes/THAWSPACE/UnivFes2026-old/geometry.json /Volumes/THAWSPACE/UnivFes2026/
   ```
5. `start-server.command` で起動し直し、全台が緑に戻ってから管理画面の「全台リロード」を押します。

## 展示用iMac（40台）

```bash
curl -s http://192.168.112.70:8080/kiosk.sh | bash
```

- 再起動すると展示は消えるので、そのときは実行し直します。
- 凍結されたiMacでは、Chrome のカメラ許可も再起動で消えます。凍結を解除した状態で許可してから、凍結し直してください。
