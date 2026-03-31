# CLAUDE.md — Work in Japan Factory Guide

## プロジェクト概要

**目的:** 日本の工場で働く外国人向けハウツーサイトの記事を自動生成・自動投稿する

**サイト名:** Work in Japan Factory Guide
**ターゲット:** 日本の工場で働く・働きたい外国人
**記事言語:** 英語（すべての記事・コンテンツ）
**GitHubリポジトリ:** https://github.com/obyoboy/factory-japan
**デプロイ:** Vercel（mainブランチへのpushで自動反映）

---

## エージェント構成

3つのエージェントが順番に動作する。

### 1. リサーチエージェント
**役割:** 記事テーマとターゲットキーワードを決める

タスク：
- 既存のHTMLファイルを確認して、まだ書かれていないテーマを見つける
- 外国人工場労働者に役立つトピックを1つ選ぶ
- メインキーワードを選定する（ロングテール・低競合を優先）
- 出力：`{ topic, primary_keyword, secondary_keywords[], slug, badge_category }`

記事テーマの候補：
- 残業（zangyō）のルールと仕組み
- 日本の給与明細の読み方
- 工場で使える日本語フレーズ集
- 契約途中で辞めたらどうなるか
- 派遣（haken）と直接雇用の違い
- 5S（整理・整頓・清掃・清潔・躾）の実際
- 健康診断について知っておくこと
- 会社の寮（dormitory）の使い方

### 2. ライターエージェント
**役割:** 記事をHTMLファイルとして執筆する

タスク：
- 英語で1200〜2000ワードの記事を書く
- 下記の記事フォーマットに従う
- `{slug}.html` としてプロジェクトルートに保存する
- `index.html` の `#articles` セクションに新記事のリンクを追加する

### 3. 投稿エージェント
**役割:** 完成した記事をGitHubにpushしてVercelに反映させる

タスク：
- `git add {slug}.html index.html`
- `git commit -m "Add article: {title}"`
- `git push origin main`
- VercelはpushをトリガーにAuto Deploy — 手動操作は不要

---

## 記事のHTMLフォーマット

すべての記事はこの構造に従うこと。既存の記事ファイルを参考にすること。

### ファイル命名規則
- 小文字・ハイフン区切りのスラッグ
- 例：`how-to-read-japanese-payslip.html`

### テンプレート

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{150〜160文字の説明文}">
  <title>{記事タイトル} | Work in Japan Factory Guide</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

<!-- ===== HEADER ===== -->
<header>
  <div class="header-inner">
    <div class="site-logo"><a href="index.html" style="color:#fff;text-decoration:none;">Work in Japan <span>Factory</span> Guide</a></div>
    <nav>
      <ul>
        <li><a href="index.html">Home</a></li>
        <li><a href="index.html#topics">Topics</a></li>
        <li><a href="index.html#articles">Articles</a></li>
        <li><a href="index.html#about">About</a></li>
      </ul>
    </nav>
  </div>
</header>

<!-- ===== ARTICLE HEADER ===== -->
<div class="article-header">
  <div class="container">
    <span class="badge">{カテゴリ}</span>
    <h1>{記事タイトル}</h1>
    <p class="article-meta">Last updated: {月 年} &nbsp;|&nbsp; {X} min read</p>
  </div>
</div>

<!-- ===== ARTICLE BODY ===== -->
<article class="article-body">

  <p>{冒頭段落 — 読者が共感できる状況から始める}</p>

  <h2>1. {セクションタイトル}</h2>
  <p>{本文}</p>

  <!-- 役立つアドバイスにはtip-boxを使う -->
  <div class="tip-box">
    <strong>Tip</strong>
    {実践的なアドバイス}
  </div>

  <!-- 避けるべきことにはwarning-boxを使う -->
  <div class="warning-box">
    <strong>Warning</strong>
    {やると解雇・トラブルになること}
  </div>

  <!-- 比較・用語リストにはkey-tableを使う -->
  <table class="key-table">
    <thead>
      <tr><th>カラムA</th><th>カラムB</th></tr>
    </thead>
    <tbody>
      <tr><td>...</td><td>...</td></tr>
    </tbody>
  </table>

  <!-- h2セクションを必要な数だけ繰り返す（目安5〜8セクション） -->

  <h2>{最終セクション}: まとめ</h2>
  <p>{締めの段落 — 読者を励ます内容}</p>

</article>

<!-- ===== FOOTER ===== -->
<footer>
  <div class="container">
    <p>&copy; 2026 Work in Japan Factory Guide. For informational purposes only.</p>
  </div>
</footer>

</body>
</html>
```

### バッジカテゴリ（記事ごとに1つ選ぶ）
- `Culture`
- `Rules`
- `Safety`
- `Communication`
- `Pay & Benefits`
- `Daily Life`
- `Visa & Documents`
- `Useful Japanese`

---

## ライティングガイドライン

- **トーン:** 直接的・実用的・共感的 — 日本の工場勤務に不安を感じている読者に向けて書く
- **文章レベル:** 英語が母国語でない読者にも読みやすい平易な英語（イディオムや難しい語彙は避ける）
- **日本語用語:** 初出時は必ず日本語と読み方を併記する（例：team leader (班長 / hanchō)）
- **構造:** 番号付きのH2セクションで読みやすくする
- **ボックス:** `tip-box` は実践的なアドバイス、`warning-box` は解雇やトラブルにつながること
- **テーブル:** 比較や用語リストには `key-table` を使う
- 無駄な文章は書かない — 1文1文が読者の役に立つ内容にする

---

## ファイル構成

```
factory-japan/
├── index.html                          # トップページ（新記事追加時に#articlesを更新）
├── style.css                           # 共通スタイルシート — 理由がなければ変更しない
├── about-japanese-factory-culture.html
├── factory-safety-culture.html
├── japanese-factory-rules.html
├── working-with-japanese-colleagues.html
├── {新記事}.html                        # ライターエージェントが追加
└── CLAUDE.md
```

---

## Gitワークフロー

```bash
# 新記事を書いた後：
git add {slug}.html index.html
git commit -m "Add article: {記事タイトル}"
git push origin main
# VercelがAuto Deploy — 追加操作不要
```

ブランチ：`main`
リモート：`https://github.com/obyoboy/factory-japan.git`
