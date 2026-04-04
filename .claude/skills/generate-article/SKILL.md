# Skill: generate-article — article.json 生成

## 概要

`drafts/topic.json` のトピックをもとに、英語・タガログ語・ベトナム語の3言語記事データを
以下のJSONスキーマで出力する。

**出力はJSONのみ。マークダウンのコードフェンス（` ```json ` など）・説明文・余分な空白を含めないこと。**

---

## 出力スキーマ

```json
{
  "slug": "topic.jsonのidフィールドをそのまま使う",
  "lastUpdated": "YYYY-MM-DD（今日の日付）",
  "readTimeMinutes": 5,
  "languages": {
    "en": {
      "title": "英語タイトル",
      "metaDescription": "150〜160文字の英語説明文（HTMLタグなし）",
      "badge": "カテゴリバッジ名",
      "excerpt": "冒頭段落プレーンテキスト（HTMLタグなし、1〜3文）",
      "image": {
        "url": "../images/articles/slug関連キーワード.jpg",
        "alt": "画像の説明（英語）"
      },
      "bodyHtml": "<h2>1. セクション</h2><p>本文</p>..."
    },
    "tl": {
      "title": "タガログ語タイトル",
      "metaDescription": "タガログ語説明文",
      "badge": "バッジ（英語と同じ）",
      "excerpt": "冒頭段落（タガログ語・プレーンテキスト）",
      "image": {
        "url": "../images/articles/slug関連キーワード.jpg",
        "alt": "画像の説明（タガログ語）"
      },
      "bodyHtml": "<h2>1. セクション</h2><p>本文</p>..."
    },
    "vi": {
      "title": "ベトナム語タイトル",
      "metaDescription": "ベトナム語説明文",
      "badge": "バッジ（英語と同じ）",
      "excerpt": "冒頭段落（ベトナム語・プレーンテキスト）",
      "image": {
        "url": "../images/articles/slug関連キーワード.jpg",
        "alt": "画像の説明（ベトナム語）"
      },
      "bodyHtml": "<h2>1. セクション</h2><p>本文</p>..."
    }
  }
}
```

---

## bodyHtml の仕様

- **H2セクション**: 5〜8個、番号付き（1. / 2. / ...）
- **必須コンポーネント（各1個以上）**:

```html
<div class="tip-box"><strong>Tip</strong> 実践的なアドバイスをここに書く。</div>

<div class="warning-box"><strong>Warning</strong> トラブルや解雇につながる注意をここに書く。</div>

<table class="key-table">
  <thead><tr><th>カラムA</th><th>カラムB</th></tr></thead>
  <tbody>
    <tr><td>...</td><td>...</td></tr>
  </tbody>
</table>
```

- `<script>` タグ・`javascript:` プロトコルは絶対に含めないこと
- 英語で1200〜2000語相当の内容量
- タガログ語・ベトナム語は英語と同等の内容量（翻訳調にしない、自然な表現で）

---

## バッジカテゴリ一覧

`Culture` / `Rules` / `Safety` / `Communication` / `Pay & Benefits` / `Daily Life` / `Visa & Documents` / `Useful Japanese`

---

## 画像URL のルール

- 形式: `../images/articles/{スラッグ関連キーワード}.jpg`
- 例: トピックが「出欠ルール」なら `../images/articles/attendance-rules.jpg`
- 3言語すべて同じ URL を使う

---

## フィールド別注意事項

| フィールド | 注意 |
|---|---|
| `slug` | topic.json の `id` をそのまま使う（変更しない） |
| `lastUpdated` | 今日の日付（YYYY-MM-DD形式） |
| `readTimeMinutes` | 4〜8の整数 |
| `excerpt` | プレーンテキストのみ（HTMLタグなし） |
| `metaDescription` | プレーンテキストのみ（HTMLタグなし）、150〜160文字 |
| `bodyHtml` | HTMLのみ（tip-box・warning-box・key-tableを含む） |
| `badge` | 上記バッジカテゴリ一覧から選ぶ |

---

## ライティングガイドライン

- **トーン**: 直接的・実用的・共感的。翻訳調にしない
- **日本語用語**: 初出時は必ず 日本語（ローマ字）で表記（例: 班長 / hanchō）
- タガログ語・ベトナム語は英語の翻訳ではなく、読者が自然に読める表現で書く
