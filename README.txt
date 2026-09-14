QR通信 v0.53 PWA

概要
- 通常QRコードの表示・読み取り
- QR通信プロトコルによるテキスト／ファイルの複数QRブロック転送
- 受信時はカメラ起動後、認識枠内へQRコードを合わせて「読取開始」を押してから認識開始
- 読取開始後は約300ms待って端末のブレが収まってから認識する
- QR通信開始後は後続ブロックを連続受信
- 通常QR読み取り完了後は認識したQR画像を表示
- ホーム画面にアプリURLのQRコードを表示
- 画面にバージョン番号 v0.53 を常時表示

v0.50 changes
- BARコード読み取り機能を削除
- html5-qrcode / ZXing / BarcodeDetector 関連コードを削除
- QR読み取りを jsQR の単純な構成へ戻した
- 空文字のQR誤検出は成功扱いせず読み取りを継続
- Service Workerキャッシュをv0.50へ更新


v0.51 changes
- 通常QR表示画面にPNG画像コピーボタンを追加
- 受信開始案内をiPhoneで2行に収まりやすいフォントサイズへ調整
- 単独QR読み取り完了表示をiPhoneで1行に収まるフォントサイズへ調整
- Service Workerキャッシュをv0.51へ更新


v0.52 changes
- 通常QR画像コピー成功時に「コピーしました」を約1.2秒表示
- 横画面でカメラ映像下部に黒領域が出る問題を修正（カメラ枠内videoのmax-height制限を解除）
- Service Workerキャッシュをv0.52へ更新


v0.53 changes
- 仕様書v0.54に基づくハンドシェーク通信を実装
- QR通信の新規送信をProtocol Version 02へ更新し、Version 01受信互換を維持
- 送信画面に「一定間隔自動」「ハンドシェーク」の2方式を追加
- HandshakeはSession ID 4B、Total/Block番号 2B、ACK Block番号 2Bに対応（最大65535 Block）
- Handshake受信時はOutカメラで開始Blockを仮認識後、Inカメラへ自動切替
- Block 1 / ACK 1を使った位置合わせフェーズを追加
- ACK 1認識中は送信QRを赤枠表示し、その間だけ「通信再開」ボタンを表示
- ACK QRは受信画面に同一内容を2×2の4個表示
- Block 2以降はACK確認後に次Blockへ進むStop-and-Wait方式
- 最終ACKは受信画面に保持し、送信側は最終ACK認識で「送信完了」表示
- Total=1ではOutカメラ受信だけで完了し、Inカメラ切替・ACK・位置合わせを省略
- JPEGを含む一般ファイルを保持したまま転送でき、255 Block超はHandshakeのみ対応
- Service Workerキャッシュと登録URLをv0.53へ統一
