// ============================================================
// enisuru GAS — design01 v1.0
// GAS Web App for enisuru-design01
//
// Script Properties に設定が必要:
//   GEMINI_API_KEY    : Google AI Studio の API キー
//   ANTHROPIC_API_KEY : Anthropic API キー (caption に使用)
//
// 定数 DRIVE_FOLDER_ID: 写真保存用 Drive フォルダ ID
//   → 新規フォルダを作成して下の定数を書き換えてください
//
// デプロイ設定:
//   種類: ウェブアプリ
//   アクセス: 全員
// ============================================================

const GEMINI_MODEL = 'gemini-2.5-flash-image';

// 注文保存先
const SPREADSHEET_ID    = '1x-_7Xqd-bs_4r6UogT6iEVAhy-3eXOYj0S8a7caYJjI';
const DRIVE_FOLDER_ID   = 'ここを書き換えてください'; // ★ 新規フォルダ作成後にIDを設定
const ORDER_SHEET_NAME  = '注文一覧_design01';

// 注文シートのカラム定義: { header: シート見出し, key: ペイロードキー }
// key が null の列 (写真/プレビュー Drive URL) は submitOrder では空文字で書き、
// savePhotos が orderId 行を見つけて後から埋める。
const ORDER_COLUMNS = [
  { header: '注文番号',             key: 'orderId' },
  { header: '受付日時',             key: 'submittedAt' },
  { header: 'お名前',               key: 'userName' },
  { header: 'メールアドレス',       key: 'email' },
  { header: '電話番号',             key: 'phone' },
  { header: '用途',                 key: 'usecaseLabel' },
  { header: '仕上げモード',         key: 'mode' },
  { header: 'SKU',                  key: 'sku' },
  { header: '向き',                 key: 'orientation' },
  { header: '被写体',               key: 'q1' },
  { header: '選んだ理由',           key: 'q2' },
  { header: '贈り物',               key: 'giftTo' },
  { header: 'キャプション種別',     key: 'candidateType' },
  { header: 'タイトル',             key: 'title' },
  { header: '本文',                 key: 'body' },
  { header: '作者名',               key: 'author' },
  { header: '場所',                 key: 'place' },
  { header: '日付',                 key: 'date' },
  { header: '写真Drive URL',        key: null },
  { header: 'プレビューDrive URL',  key: null }
];

// ------------------------------------------------------------
// エントリーポイント
// ------------------------------------------------------------
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'generatePreviews') {
      return handleGeneratePreviews(body);
    } else if (action === 'generateCaption') {
      return handleGenerateCaption(body);
    } else if (action === 'submitOrder') {
      return handleSubmitOrder(body);
    } else if (action === 'savePhotos') {
      return handleSavePhotos(body);
    } else {
      return jsonResponse({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('enisuru design01 GAS endpoint is running (v1.0)')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ------------------------------------------------------------
// generatePreviews — Gemini で写真を油絵変換
// ------------------------------------------------------------
function handleGeneratePreviews(body) {
  const photos  = body.photos  || [];
  const orient  = body.orient  || 'landscape';
  const subject = body.subject || '';
  const style   = body.style   || 'enisuru';

  const previews = photos.map(function(photo) {
    try {
      const imgBase64 = callGemini(photo.data, photo.mimeType, orient, subject, style);
      return { success: true, data: imgBase64 };
    } catch (err) {
      return { success: false, message: err.toString() };
    }
  });

  return jsonResponse({ success: true, previews: previews });
}

function callGemini(base64Data, mimeType, orient, subject, style) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY が Script Properties に設定されていません');

  const resolvedStyle = style || 'enisuru';
  const prompt = buildPrompt(orient, subject, resolvedStyle);
  console.log('[callGemini] model=' + GEMINI_MODEL + ' style=' + resolvedStyle + ' orient=' + orient + ' base64Len=' + (base64Data ? base64Data.length : 0));

  const reqBody = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } }
      ]
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT']
    }
  };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            + GEMINI_MODEL + ':generateContent?key=' + apiKey;

  const response = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(reqBody),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  if (code !== 200) {
    console.error('[callGemini] HTTP ' + code + ' body=' + text.slice(0, 500));
    throw new Error('Gemini API エラー ' + code + ' (model=' + GEMINI_MODEL + '): ' + text.slice(0, 300));
  }

  const data = JSON.parse(text);

  function findImage(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.inlineData  && obj.inlineData.data)  return obj.inlineData.data;
    if (obj.inline_data && obj.inline_data.data) return obj.inline_data.data;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var val = obj[keys[i]];
      if (val && typeof val === 'object') {
        var found = findImage(val);
        if (found) return found;
      }
    }
    return null;
  }

  var imgData = findImage(data.candidates);
  if (!imgData) {
    var finishReason = (data.candidates && data.candidates[0] && data.candidates[0].finishReason) || 'unknown';
    throw new Error('Gemini から画像が返りませんでした (finishReason: ' + finishReason + ')');
  }

  return imgData;
}

function buildPrompt(orient, subject, style) {
  var orientLabel = orient === 'portrait' ? 'portrait / vertical' : 'landscape / horizontal';
  var subjectLine = subject ? 'Subject context: ' + subject + '\n' : '';

  return 'Transform this photograph into a warm, nostalgic oil painting in enisuru style.\n\n'
    + subjectLine
    + 'Canvas orientation: ' + orientLabel + '\n\n'
    + 'Style:\n'
    + '- Traditional hand-painted oil painting on white canvas\n'
    + '- Warm, nostalgic color palette — slightly golden, aged tones\n'
    + '- Gentle impasto texture with visible, expressive brushwork\n'
    + '- Soft background; clear, recognizable subject in focus\n'
    + '- Emotional quality: personal, heartfelt, warm — like a treasured memory\n\n'
    + 'Do NOT add text, watermarks, frames, or new objects.\n'
    + 'Maintain original composition exactly.\n'
    + 'Must look like a real hand-crafted oil painting — not digital art or a photo filter.';
}

// ------------------------------------------------------------
// generateCaption — Anthropic Claude でキャプション生成
// ------------------------------------------------------------
function handleGenerateCaption(body) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonResponse({ success: false, error: 'ANTHROPIC_API_KEY が未設定です' });

  const prompt = body.prompt || '';

  const reqBody = {
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  };

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(reqBody),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const respText = response.getContentText();
  if (code !== 200) {
    return jsonResponse({ success: false, error: 'Anthropic API エラー ' + code + ': ' + respText.slice(0, 300) });
  }

  const data = JSON.parse(respText);
  const text = (data.content && data.content[0] && data.content[0].text || '').trim();

  const j1 = text.indexOf('{');
  const j2 = text.lastIndexOf('}');
  if (j1 < 0 || j2 < 0) {
    return jsonResponse({ success: false, error: 'JSON not found in response', raw: text.slice(0, 500) });
  }
  let result;
  try {
    result = JSON.parse(text.slice(j1, j2 + 1));
  } catch (e) {
    return jsonResponse({ success: false, error: 'JSON parse error: ' + e.toString(), raw: text.slice(0, 500) });
  }

  return jsonResponse({ success: true, result: result });
}

// ------------------------------------------------------------
// submitOrder — 注文を Sheet に追記し orderId を返す
//   注文番号: DES-YYYYMMDD-{連番3桁}
// ------------------------------------------------------------
function handleSubmitOrder(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheetName = body.sheetName || ORDER_SHEET_NAME;
    const headerRow = ORDER_COLUMNS.map(function(c) { return c.header; });
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headerRow);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(headerRow);
    }

    // 当日(JST)の DES-YYYYMMDD-* 行をカウントして連番を決める
    const now = new Date();
    const ymd = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
    const prefix = 'DES-' + ymd + '-';
    let dailyCount = 0;
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        const v = String(ids[i][0] || '');
        if (v.indexOf(prefix) === 0) dailyCount++;
      }
    }
    const orderId = prefix + Utilities.formatString('%03d', dailyCount + 1);

    const enriched = Object.assign({}, body, { orderId: orderId });
    if (!enriched.submittedAt) enriched.submittedAt = now.toISOString();

    const row = ORDER_COLUMNS.map(function(c) {
      if (!c.key) return ''; // 写真/プレビュー Drive URL は savePhotos が後で埋める
      const v = enriched[c.key];
      if (v === undefined || v === null) return '';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return v;
    });
    sheet.appendRow(row);

    console.log('[handleSubmitOrder] orderId=' + orderId + ' sheet=' + sheetName);
    return jsonResponse({ success: true, orderId: orderId });
  } catch (err) {
    console.error('[handleSubmitOrder] ' + err);
    return jsonResponse({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// savePhotos — orderId サブフォルダを切って画像保存し、Sheet の URL 列を埋める
// ------------------------------------------------------------
function handleSavePhotos(body) {
  const orderId = body.orderId || '';
  if (!orderId) return jsonResponse({ success: false, error: 'orderId が指定されていません' });
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf('ここを書き換え') === 0) {
    return jsonResponse({ success: false, error: 'DRIVE_FOLDER_ID が未設定です (GAS の定数を更新してください)' });
  }

  try {
    const parent = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const it = parent.getFoldersByName(orderId);
    const subFolder = it.hasNext() ? it.next() : parent.createFolder(orderId);

    let photoUrl = '';
    let previewUrl = '';

    if (body.photoBase64) {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.photoBase64),
        'image/jpeg',
        'original.jpg'
      );
      photoUrl = subFolder.createFile(blob).getUrl();
    }
    if (body.previewBase64) {
      const blob = Utilities.newBlob(
        Utilities.base64Decode(body.previewBase64),
        'image/png',
        'preview.png'
      );
      previewUrl = subFolder.createFile(blob).getUrl();
    }

    try {
      updateOrderRowWithPhotoUrls(orderId, photoUrl, previewUrl);
    } catch (sheetErr) {
      console.error('[handleSavePhotos] Sheet 更新失敗 (画像は保存済): ' + sheetErr);
    }

    console.log('[handleSavePhotos] orderId=' + orderId + ' photo=' + (photoUrl ? 'OK' : '-') + ' preview=' + (previewUrl ? 'OK' : '-'));
    return jsonResponse({ success: true, orderId: orderId, photoUrl: photoUrl, previewUrl: previewUrl });
  } catch (err) {
    console.error('[handleSavePhotos] ' + err);
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function updateOrderRowWithPhotoUrls(orderId, photoUrl, previewUrl) {
  if (!photoUrl && !previewUrl) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(ORDER_SHEET_NAME);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const idCol  = headers.indexOf('注文番号') + 1;
    const pCol   = headers.indexOf('写真Drive URL') + 1;
    const pvCol  = headers.indexOf('プレビューDrive URL') + 1;
    if (idCol === 0) return;

    const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (ids[i][0] === orderId) {
        const rowNum = i + 2;
        if (photoUrl   && pCol  > 0) sheet.getRange(rowNum, pCol).setValue(photoUrl);
        if (previewUrl && pvCol > 0) sheet.getRange(rowNum, pvCol).setValue(previewUrl);
        return;
      }
    }
    console.warn('[updateOrderRowWithPhotoUrls] orderId=' + orderId + ' に一致する行なし');
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
