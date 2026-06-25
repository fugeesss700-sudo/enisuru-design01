# CLAUDE.md — enisuru-design01
# enisuru 一般向けフロント
# Last updated: 2026-06-25

---

## プロジェクト概要

- **本番URL:** https://enisuru-design01.vercel.app
- **スタック:** シングルHTML SPA（index.html）
- **バックエンド:** Google Apps Script（別系統・別デプロイ）
- **ローカルパス:** `/Users/mm4/enisuru-design01/`

---

## ⚠️ 最重要：GAS_ENDPOINT を絶対に混同しない

| 用途 | GAS_ENDPOINT |
|---|---|
| **design01用（正）** | `AKfycbxWJoX8h0444...d6Kr5p_bqvQ` |
| **therapico旧値（使用禁止）** | `AKfycbwLfDbPSg8h...` |

design01 の index.html に therapico 旧値を使うと注文データが混線する。作業前に必ず確認。

---

## デプロイフロー（フロントとGASで完全に別）

### フロント（enisuru-design01）
**方式: git push → Vercel自動デプロイ（数秒〜数十秒）**

```bash
# Step 1: 最新HTMLをリポジトリにコピー
cp ~/Downloads/最新.html /Users/mm4/enisuru-design01/index.html
cd /Users/mm4/enisuru-design01

# Step 2: GAS_ENDPOINTがdesign01用か確認（必須）
grep "GAS_ENDPOINT" index.html
# → AKfycbxWJoX8h0444...d6Kr5p_bqvQ であること

# Step 3: コミット＆プッシュ
git add index.html && git commit -m "enisuru vXX" && git push

# Step 4: デプロイ確認
vercel ls   # → ● Ready になっているか確認
```

### バックエンド（enisuru-GAS）
**方式: clasp push → clasp deploy（URLを変えない）**

```bash
cd /Users/mm4/enisuru-gas

# Step 1: コードをGASへ送信
clasp push

# Step 2: 既存デプロイを更新（-i を必ず付ける）
clasp deploy -i AKfycbxWJoX8h0444...d6Kr5p_bqvQ

# Step 3: アクセス権確認
# Apps Scriptエディタ → デプロイの管理 → アクセス権が「全員」か確認
```

**`-i` を省略すると新しいURLが発行され、フロント側のGAS_ENDPOINTを書き換える羽目になる。必ず `-i` を付ける。**

---

## デプロイ前チェックリスト

- [ ] `GAS_ENDPOINT` が design01 用（`AKfycbxWJoX8h0444...`）か確認
- [ ] `vercel ls` で ● Ready 表示を確認
- [ ] GAS変更時：`clasp deploy -i <ID>` まで完了しているか
- [ ] GAS Web Appのアクセス権が「全員」か確認

---

## 過去のヒヤリハット

| 事象 | 原因 | 対処 |
|---|---|---|
| `Unknown action` エラー | clasp pushだけで終わった（deployを忘れた） | `clasp deploy -i <ID>` まで実行 |
| GAS_ENDPOINTの混在 | therapico旧値を誤使用 | design01用IDに修正して再デプロイ |
| HTTP 403 | GASアクセス権が「全員」でない | Apps Scriptエディタで修正 |

---

## ロールバック

- フロント: Vercelダッシュボード → enisuru-design01 → 前のデプロイを「Promote」
- GAS: 前バージョンIDで `clasp deploy -i <旧ID>` を実行

---

## 守る線

- 注文一覧シートは design01 用のみ参照。therapico 系のシートには触れない
- Script Properties（GEMINI_API_KEY / ANTHROPIC_API_KEY / SHOPIFY_DOMAIN）は設定済み。上書きしない
