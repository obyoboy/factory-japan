# CLAUDE.md — Work in Japan Factory Guide

## プロジェクト概要

**目的:** 日本の工場で働く外国人向けハウツーサイトの記事を自動生成・自動投稿する  
**サイト名:** Work in Japan Factory Guide  
**ターゲット:** 日本の工場で働く・働きたい外国人  
**対応言語:** 英語（en）・タガログ語（tl）・ベトナム語（vi）  
**GitHubリポジトリ:** https://github.com/obyoboy/factory-japan  
**デプロイ:** Vercel（mainブランチへのpushで自動反映）

---

## ⚠️ Claude Code の役割は「article.json の生成」だけ

```
drafts/topic.json を読んで → drafts/article.json を書き出す
```

**HTML生成・index.html更新・git push はすべてスクリプトが行う。Claude Code は絶対に手を出さない。**

---

## パイプライン全体像

```
node scripts/run-pipeline.js --generate-with-claude
  │
  ├─ [Script] select-topic.js
  │           topics.json から未使用・最高優先度のトピックを選択
  │           → drafts/topic.json に保存
  │
  ├─ [Claude] claude -p "..."   ← Claude Code の仕事はここだけ
  │           drafts/topic.json を読んで article.json を生成
  │           → drafts/article.json に保存
  │
  ├─ [Script] validate-article.js → generate-article.js
  │           article.json を検証 → en/ tl/ vi/ に HTML を生成
  │
  ├─ [Script] update-index-cards.js
  │           各言語の index.html にカードを追加
  │
  ├─ [Script] mark-topic-used.js
  │           used-topics.json にトピックIDを追記
  │
  └─ [Script] git add . → git commit → git push origin main
              Vercel が自動デプロイ
```

### 手動2段階モード（記事を確認してから投稿したい場合）

```bash
# Step 1: トピック選択のみ
node scripts/run-pipeline.js
# → drafts/topic.json が生成され、Claude Code への指示が表示される

# Step 2: Claude Code で article.json を生成したあと、投稿
node scripts/run-pipeline.js
# → article.json が存在するので自動的に続きから実行
```

---

## Claude Code の作業手順

### Step 1: スキル定義を読む

```bash
cat .claude/skills/generate-article/SKILL.md
```

### Step 2: topic.json を読む

```bash
cat drafts/topic.json
```

### Step 3: article.json を生成して保存

スキル定義のスキーマに従い `drafts/article.json` を作成する。

**出力ルール（厳守）:**
- `drafts/article.json` に直接書き込む
- JSONのみ。マークダウンコードフェンス（` ```json ` 等）禁止
- 説明文・コメント・余分なテキスト一切禁止
- UTF-8 BOMなしで保存

### Step 4: 完了を報告して終了

```
drafts/article.json を保存しました。
slug: {slug}
```

**これで終了。以降はスクリプトが自動で処理する。**

---

## フォルダ構成

```
factory-japan/
├── CLAUDE.md               # このファイル
├── topics.json             # トピックプール（スクリプトが参照）
├── used-topics.json        # 使用済みトピックID（スクリプトが管理）
├── published-slugs.json    # 公開済みslug（スクリプトが管理）
├── drafts/
│   ├── topic.json          # スクリプトが書く → Claude が読む
│   └── article.json        # Claude が書く → スクリプトが読む
├── templates/              # HTMLテンプレート（スクリプトが使う）
├── scripts/
│   ├── run-pipeline.js     # メインオーケストレーター ★
│   ├── select-topic.js     # トピック選択
│   ├── validate-article.js # article.json バリデーション
│   ├── generate-article.js # HTML生成
│   ├── update-index-cards.js # index.html更新
│   ├── mark-topic-used.js  # 使用済み記録
│   └── build-published-slugs.js # スラッグ一覧再構築
├── en/ tl/ vi/             # 生成済み記事HTML（スクリプトが書く）
├── run.ps1                 # Windows: ワンコマンド実行
├── run.sh                  # Mac/Linux: ワンコマンド実行
└── .claude/skills/
    └── generate-article/
        └── SKILL.md        # article.json 生成仕様 ★必読
```

**命名規則:** 3言語すべて同じslugを使う（例: `en/how-to-read-japanese-payslip.html`）  
**style.css:** 各記事から `../style.css` で参照する

---

## 注意事項

- `style.css` は絶対に変更しない
- `en/index.html` `tl/index.html` `vi/index.html` は触らない（スクリプトが更新）
- `git` コマンドは実行しない（スクリプトが実行）
- `topics.json` `used-topics.json` `published-slugs.json` は触らない
