/*══════════════════════════════════════════════════════════════
  enisuru ── 注文一覧（design01）へのテキスト保存
  ・対象は「注文一覧」シートのみ（「注文一覧_therapico」は変更しません）
  ・項目は v21 のフォームに合わせて刷新
  ・画像保存（Drive）は今までのコードをそのまま使い、行のURL列だけ更新します
  使い方：
   1) このコードを Apps Script に貼る
   2) SPREADSHEET_ID を設定（getActiveSpreadsheet が使えるならそのままでも可）
   3) 一度だけ setupOrderSheet() を実行（既存内容をクリアし、新しい見出しを設定）
   4) doPost で action='submitOrder' のとき handleSubmitOrder(data) を呼ぶ
   5) 画像保存後に writeImageUrls(orderId, photoUrl, previewUrl) を呼ぶ
══════════════════════════════════════════════════════════════*/

const SHEET_NAME = '注文一覧';            // ← この1枚のみ対象
// const SPREADSHEET_ID = 'ここにスプレッドシートID';  // 必要なら指定

// 列見出し（この順序で1行＝1注文を保存）
const ORDER_HEADERS = [
  '注文番号','注文日時',
  'お名前','メール','電話','郵便番号','住所',
  'タイトル','作家名','場所','日付','本文','写真の説明',
  '強調したいところ','消したい・ぼかしたい背景','その他のご要望','補足・ご要望',
  'Q1_この写真を選んだ理由','Q2_誰に届けたい','Q3_何が写っているか',
  'Q4_どんな存在か','Q5_当時の時間','Q6_思い出すこと','Q7_伝えたいこと',
  'スタイル','種類・サイズ','背景色名','背景色HEX','背景色No','向き',
  'SNS掲載可否','enisuruメッセージ',
  '原画URL','プレビューURL'
];

// payloadのキー → 見出し の対応
function rowFromData(d, orderId, submittedAt){
  const map = {
    '注文番号': orderId,
    '注文日時': submittedAt,
    'お名前': d.userName, 'メール': d.email, '電話': d.phone, '郵便番号': d.zip, '住所': d.address,
    'タイトル': d.title, '作家名': d.author, '場所': d.place, '日付': d.date, '本文': d.body, '写真の説明': d.descr,
    '強調したいところ': d.emphasis, '消したい・ぼかしたい背景': d.removeBg, 'その他のご要望': d.otherWish, '補足・ご要望': d.message,
    'Q1_この写真を選んだ理由': d.q1, 'Q2_誰に届けたい': d.q2, 'Q3_何が写っているか': d.q3,
    'Q4_どんな存在か': d.q4, 'Q5_当時の時間': d.q5, 'Q6_思い出すこと': d.q6, 'Q7_伝えたいこと': d.q7,
    'スタイル': d.style, '種類・サイズ': d.sku, '背景色名': d.colorName, '背景色HEX': d.colorHex, '背景色No': d.colorNo, '向き': d.orientation,
    'SNS掲載可否': d.snsConsent, 'enisuruメッセージ': d.interpretation,
    '原画URL': '', 'プレビューURL': ''
  };
  return ORDER_HEADERS.map(h => (map[h] === undefined || map[h] === null) ? '' : map[h]);
}

function getOrderSheet(){
  const ss = (typeof SPREADSHEET_ID !== 'undefined' && SPREADSHEET_ID)
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  return sh;
}

// ── 一度だけ実行：既存内容をすべてクリアして新しい見出しを設定 ──
function setupOrderSheet(){
  const sh = getOrderSheet();
  sh.clearContents();
  sh.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

// ── 注文番号の発行 ──
function makeOrderId(){
  const now = new Date();
  return 'ENI-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
}

// ── 注文送信（テキスト保存） ──
function handleSubmitOrder(d){
  const sh = getOrderSheet();
  // 見出しが無ければ作る（保険）
  if (sh.getLastRow() === 0){
    sh.getRange(1, 1, 1, ORDER_HEADERS.length).setValues([ORDER_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const orderId = makeOrderId();
  const submittedAt = d.submittedAt || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  sh.appendRow(rowFromData(d, orderId, submittedAt));
  return { success: true, orderId: orderId };
}

// ── 画像URLを後から該当行へ書き込む（Drive保存は既存コードのまま） ──
function writeImageUrls(orderId, photoUrl, previewUrl){
  const sh = getOrderSheet();
  const values = sh.getDataRange().getValues();        // [0]=見出し
  const idCol = ORDER_HEADERS.indexOf('注文番号');
  const pCol  = ORDER_HEADERS.indexOf('原画URL');
  const vCol  = ORDER_HEADERS.indexOf('プレビューURL');
  for (let r = 1; r < values.length; r++){
    if (String(values[r][idCol]) === String(orderId)){
      if (photoUrl)   sh.getRange(r + 1, pCol + 1).setValue(photoUrl);
      if (previewUrl) sh.getRange(r + 1, vCol + 1).setValue(previewUrl);
      return true;
    }
  }
  return false;
}

/*────────── doPost 連携例 ──────────
function doPost(e){
  const d = JSON.parse(e.postData.contents);

  if (d.action === 'submitOrder'){
    const res = handleSubmitOrder(d);                  // ← テキスト保存（注文一覧のみ）
    // 必要なら res.shopifyUrl = '...';
    return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
  }

  if (d.action === 'savePhotos'){
    // ▼ ここは「今まで通り」Driveへ保存するコードをそのまま使う
    //    既存処理で得た公開URLを下の writeImageUrls に渡すだけでOK
    const photoUrl   = saveToDrive_(d.orderId, d.photoBase64,   '_original');  // 既存の保存関数
    const previewUrl = saveToDrive_(d.orderId, d.previewBase64, '_preview');   // 既存の保存関数
    writeImageUrls(d.orderId, photoUrl, previewUrl);   // ← 行のURL列だけ更新
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }

  // generatePreviews / generateCaption は今まで通り
}
──────────────────────────────────*/
