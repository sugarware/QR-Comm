QR通信 v0.1 試作版

内容:
- index.html
- app.js
- manifest.json
- sw.js

実装済み:
- 送る／受ける／設定の基本UI
- 通常QR生成
- QR通信プロトコルのブロック生成
  開始: Start Magic 4B + Version 1B + Type 1B + Total 1B + Block 1B
  継続: Short Magic 2B + Block 1B
- 64/128/256/512 B Payload設定
- ECC L/M/Q/H設定
- テキスト／ファイル入力
- カメラによるQR読取
- 通常QRとQR通信開始ブロックの自動判定
- QR通信ブロックの再構成
- コピー／ファイル保存
- PWA manifest / service worker

初期試作版で未実装:
- 音ACK/NAKによる自動ブロック切替
  現在は送信画面の←/→で手動切替し、まずQR通信プロトコルと実機読取を評価する。

注意:
- QR生成/読取ライブラリは初回起動時にCDNから読み込む構成。
- カメラ利用にはHTTPSまたはlocalhostが必要。
- GitHub Pages等へ配置して実機確認することを想定。
