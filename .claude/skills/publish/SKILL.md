# Skill: publish — GitHubへのpushとVercel反映確認

## 概要
3言語の完成記事と更新済みindex.htmlをGitにコミットし、mainブランチへpushする。
VercelはmainブランチへのpushをトリガーにAuto Deployするため、手動操作は不要。

---

## 手順

### Step 1: ファイルをステージング

```bash
cd /path/to/factory-japan

# 新記事（3言語）
git add en/{slug}.html tl/{slug}.html vi/{slug}.html

# 更新されたトップページ（3言語）
git add en/index.html tl/index.html vi/index.html

# ルートindex.htmlに変更があった場合のみ追加
# git add index.html
```

### Step 2: コミット

```bash
git commit -m "Add article ({slug}): EN + TL + VI"
```

コミットメッセージの形式：`Add article ({slug}): EN + TL + VI`

### Step 3: Push

```bash
git push origin main
```

### Step 4: 結果確認

push成功後、以下を確認してレポートする：
- `git log --oneline -1` でコミットハッシュを取得
- push出力に `main -> main` が含まれているか

---

## リポジトリ情報

| 項目 | 値 |
|---|---|
| リモート | `https://github.com/obyoboy/factory-japan.git` |
| ブランチ | `main` |
| デプロイ | Vercel（pushで自動反映） |

---

## 注意事項
- `git push --force` は絶対に使わない
- pushエラーが出た場合はエラー内容をそのまま班長エージェントに報告する
- LF/CRLFの警告（`warning: LF will be replaced by CRLF`）は無視してよい
