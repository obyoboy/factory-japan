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
├── index.html          # 言語選択ページ
├── style.css           # 共通スタイルシート — 理由がなければ変更しない
├── en/                 # 英語記事
├── tl/                 # タガログ語記事
├── vi/                 # ベトナム語記事
└── .claude/skills/     # 各エージェントのスキル定義
    ├── research/       # リサーチ手順
    ├── write-article/  # 記事執筆手順
    ├── publish/        # GitHub push手順
    └── quality-check/  # 品質チェック手順
```

**命名規則:** 3言語すべて同じslugを使う（例: `en/how-to-read-japanese-payslip.html`）
**style.css:** 各記事から `../style.css` で参照する

---

## 班長エージェント（オーケストレーター）

**起動コマンド：「記事を作って」または「班長、記事を1本作成してください」**

### 動作フロー

```
[1] リサーチエージェントに指示
    → 品質チェック①（.claude/skills/quality-check/SKILL.md 参照）
[2] 英語・タガログ語・ベトナム語ライターに同時指示
    → 品質チェック②（同上）
[3] 投稿エージェントに指示
    → 品質チェック③（同上）
[4] 班長レポートを日本語で出力
```

### 各エージェントの役割と参照Skill

| エージェント | 役割 | 参照Skill |
|---|---|---|
| リサーチ | テーマ・キーワード選定 → JSON出力 | `.claude/skills/research/SKILL.md` |
| 英語ライター | `en/{slug}.html` 作成 + `en/index.html` 更新 | `.claude/skills/write-article/SKILL.md` |
| タガログ語ライター | `tl/{slug}.html` 作成 + `tl/index.html` 更新 | `.claude/skills/write-article/SKILL.md` |
| ベトナム語ライター | `vi/{slug}.html` 作成 + `vi/index.html` 更新 | `.claude/skills/write-article/SKILL.md` |
| 投稿 | git commit & push → Vercel自動デプロイ | `.claude/skills/publish/SKILL.md` |

### 注意事項
- 各チェックで問題が見つかった場合、承認なしに次のステップへ進まない
- 差し戻しは各エージェントにつき最大2回。2回後もNGはユーザーに報告して停止
- レポートは必ず日本語で出力する
