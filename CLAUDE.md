# CLAUDE.md — Work in Japan Factory Guide

## プロジェクト概要

**目的:** 日本の工場で働く外国人向けハウツーサイトの記事を自動生成・自動投稿する

**サイト名:** Work in Japan Factory Guide
**ターゲット:** 日本の工場で働く・働きたい外国人
**対応言語:** 英語（en）・タガログ語（tl）・ベトナム語（vi）
**GitHubリポジトリ:** https://github.com/obyoboy/factory-japan
**デプロイ:** Vercel（mainブランチへのpushで自動反映）

---

## フォルダ構成

```
factory-japan/
├── index.html                  # ルートトップ（言語選択ページ）
├── style.css                   # 共通スタイルシート — 理由がなければ変更しない
├── en/                         # 英語記事
│   ├── index.html              # 英語トップページ
│   ├── about-japanese-factory-culture.html
│   ├── factory-safety-culture.html
│   ├── japanese-factory-rules.html
│   ├── working-with-japanese-colleagues.html
│   ├── how-to-read-japanese-payslip.html
│   └── {新記事}.html
├── tl/                         # タガログ語記事
│   ├── index.html              # タガログ語トップページ
│   └── {新記事}.html
├── vi/                         # ベトナム語記事
│   ├── index.html              # ベトナム語トップページ
│   └── {新記事}.html
└── CLAUDE.md
```

### 言語別フォルダの命名規則
- フォルダ名：`en/` `tl/` `vi/`
- 記事ファイル名：3言語すべて**同じslug**を使う
  - 例：`en/how-to-read-japanese-payslip.html`
  - 例：`tl/how-to-read-japanese-payslip.html`
  - 例：`vi/how-to-read-japanese-payslip.html`
- style.cssへのパスは各記事から `../style.css` で参照する

---

## ルートindex.html（言語選択ページ）

`index.html` はサイトのエントリーポイントとして、3言語へのリンクを表示する。

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Work in Japan Factory Guide – Choose Your Language</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
<header>
  <div class="header-inner">
    <div class="site-logo">Work in Japan <span>Factory</span> Guide</div>
  </div>
</header>
<section class="hero">
  <div class="container">
    <h1>Choose Your Language</h1>
    <p>Select the language you want to read the guides in.</p>
    <div class="lang-selector">
      <a href="en/index.html" class="btn">English</a>
      <a href="tl/index.html" class="btn">Filipino (Tagalog)</a>
      <a href="vi/index.html" class="btn">Tiếng Việt</a>
    </div>
  </div>
</section>
<footer>
  <div class="container">
    <p>&copy; 2026 Work in Japan Factory Guide.</p>
  </div>
</footer>
</body>
</html>
```

---

## エージェント構成

班長エージェントが全体を統括し、リサーチ→3言語ライター（同時）→投稿の順で指示を出す。

---

### 班長エージェント（オーケストレーター）

**起動コマンド：「班長、記事を1本作成してください」**

**役割:** 全エージェントの監督・品質管理・作業レポート出力

#### 動作フロー

```
START
  ↓
[1] リサーチエージェントに指示
  ↓
[品質チェック①] リサーチ結果を確認
  - 既存記事とテーマが重複していないか（en/フォルダのファイル一覧と照合）
  - slugが既存ファイル名と被っていないか
  - キーワードがターゲット読者に適切か
  → NG → リサーチエージェントに差し戻し（理由を明示）
  → OK ↓
[2] 英語・タガログ語・ベトナム語ライターに同時指示（同じトピック・slugを渡す）
  ↓
[品質チェック②] 3言語それぞれの記事を確認
  各言語について以下を確認：
  - 文字数が適切か（英語：1200〜2000語 / タガログ語・ベトナム語：同等の内容量）
  - HTMLフォーマットが正しいか（header/article-header/article-body/footer）
  - H2セクションが5〜8個あるか
  - tip-box・warning-box・key-tableが少なくとも1つずつ使われているか
  - 日本語用語の初出に読み仮名（ローマ字）が付いているか
  - style.cssのパスが `../style.css` になっているか
  - 各言語のindex.htmlに新記事リンクが追加されているか
  → NG → 該当言語のライターに差し戻し（修正箇所を具体的に指示）
  → 3言語すべてOK ↓
[3] 投稿エージェントに指示（3言語分まとめてpush）
  ↓
[品質チェック③] push結果を確認
  - git pushが成功したか
  - git logで3言語分のファイルがコミットに含まれているか
  → NG → 投稿エージェントに差し戻し（エラー内容を明示）
  → OK ↓
[作業レポート出力]
  END
```

#### 作業レポートの形式（全完了後に日本語で出力）

```
## 班長レポート

### 作成記事
- タイトル（EN）：{title}
- タイトル（TL）：{title}
- タイトル（VI）：{title}
- ファイル名：{slug}.html（en/ tl/ vi/ 各フォルダ）
- カテゴリ：{badge}

### 各エージェントの作業結果
- リサーチ：完了（差し戻し回数：{n}回）
- 英語ライター：完了（差し戻し回数：{n}回）
- タガログ語ライター：完了（差し戻し回数：{n}回）
- ベトナム語ライター：完了（差し戻し回数：{n}回）
- 投稿：完了（コミットハッシュ：{hash}）

### 品質チェック結果
- テーマ重複：なし
- フォーマット（EN / TL / VI）：適合 / 適合 / 適合
- 日本語読み仮名：すべて付与済み
- GitHub push：成功

### 備考
{気になった点・次回への改善提案があれば記載}
```

#### 注意事項
- 各チェックで問題が見つかった場合は、**承認なしに次のステップへ進まない**
- 差し戻しは最大2回まで。2回修正後もNGの場合はユーザーに報告して作業を停止する
- レポートは必ず日本語で出力する

---

### 1. リサーチエージェント
**役割:** 記事テーマとターゲットキーワードを決める

タスク：
- `en/` フォルダの既存HTMLファイルを確認して、まだ書かれていないテーマを見つける
- 外国人工場労働者に役立つトピックを1つ選ぶ
- メインキーワードを選定する（ロングテール・低競合を優先）
- 出力：`{ topic, primary_keyword, secondary_keywords[], slug, badge_category, title_en, title_tl, title_vi }`

記事テーマの候補：
- 残業（zangyō）のルールと仕組み
- 工場で使える日本語フレーズ集
- 契約途中で辞めたらどうなるか
- 派遣（haken）と直接雇用の違い
- 5S（整理・整頓・清掃・清潔・躾）の実際
- 健康診断について知っておくこと
- 会社の寮（dormitory）の使い方

### 2. 英語ライターエージェント
**役割:** `en/` フォルダに英語記事を作成する

タスク：
- 英語で1200〜2000ワードの記事を書く
- `en/{slug}.html` として保存する
- `en/index.html` の `#articles` セクションに新記事のリンクを追加する
- style.cssのパスは `../style.css`

### 3. タガログ語ライターエージェント
**役割:** `tl/` フォルダにタガログ語記事を作成する

タスク：
- タガログ語（Filipino）で記事を書く（英語記事と同等の内容・構成）
- `tl/{slug}.html` として保存する
- `tl/index.html` の `#articles` セクションに新記事のリンクを追加する
- style.cssのパスは `../style.css`
- 日本語用語はローマ字読みを必ず付ける

### 4. ベトナム語ライターエージェント
**役割:** `vi/` フォルダにベトナム語記事を作成する

タスク：
- ベトナム語で記事を書く（英語記事と同等の内容・構成）
- `vi/{slug}.html` として保存する
- `vi/index.html` の `#articles` セクションに新記事のリンクを追加する
- style.cssのパスは `../style.css`
- 日本語用語はローマ字読みを必ず付ける

### 5. 投稿エージェント
**役割:** 3言語分の完成記事をGitHubにpushしてVercelに反映させる

タスク：
```bash
git add en/{slug}.html tl/{slug}.html vi/{slug}.html
git add en/index.html tl/index.html vi/index.html
git add index.html  # ルートindex.htmlに変更があった場合
git commit -m "Add article ({slug}): EN + TL + VI"
git push origin main
```
- VercelはpushをトリガーにAuto Deploy — 手動操作は不要

---

## 記事のHTMLフォーマット

すべての記事はこの構造に従うこと。既存の `en/` フォルダの記事を参考にすること。

### テンプレート

```html
<!DOCTYPE html>
<html lang="{en|tl|vi}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{150〜160文字の説明文}">
  <title>{記事タイトル} | Work in Japan Factory Guide</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>

<!-- ===== HEADER ===== -->
<header>
  <div class="header-inner">
    <div class="site-logo"><a href="../{en|tl|vi}/index.html" style="color:#fff;text-decoration:none;">Work in Japan <span>Factory</span> Guide</a></div>
    <nav>
      <ul>
        <li><a href="../{en|tl|vi}/index.html">Home</a></li>
        <li><a href="../{en|tl|vi}/index.html#topics">Topics</a></li>
        <li><a href="../{en|tl|vi}/index.html#articles">Articles</a></li>
        <li><a href="../index.html">🌐 Language</a></li>
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

  <div class="tip-box">
    <strong>Tip</strong>
    {実践的なアドバイス}
  </div>

  <div class="warning-box">
    <strong>Warning</strong>
    {やると解雇・トラブルになること}
  </div>

  <table class="key-table">
    <thead>
      <tr><th>カラムA</th><th>カラムB</th></tr>
    </thead>
    <tbody>
      <tr><td>...</td><td>...</td></tr>
    </tbody>
  </table>

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
- **文章レベル:** 各言語の母国語話者が自然に読めるレベルで書く（翻訳調にしない）
- **日本語用語:** 初出時は必ず日本語と読み方を併記する（例：team leader (班長 / hanchō)）
- **構造:** 番号付きのH2セクションで読みやすくする
- **ボックス:** `tip-box` は実践的なアドバイス、`warning-box` は解雇やトラブルにつながること
- **テーブル:** 比較や用語リストには `key-table` を使う
- 無駄な文章は書かない — 1文1文が読者の役に立つ内容にする

---

## Gitワークフロー

```bash
# 新記事（3言語）を追加した後：
git add en/{slug}.html tl/{slug}.html vi/{slug}.html
git add en/index.html tl/index.html vi/index.html
git commit -m "Add article ({slug}): EN + TL + VI"
git push origin main
# VercelがAuto Deploy — 追加操作不要
```

ブランチ：`main`
リモート：`https://github.com/obyoboy/factory-japan.git`
