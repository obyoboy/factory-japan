#!/bin/bash
# PostToolUse Hook: HTMLファイルの構文チェック + style.cssパス確認
INPUT=$(cat)

powershell -NoProfile -Command "
param()
\$data = \$null
try {
    \$data = '\$INPUT' | ConvertFrom-Json
} catch {
    exit 0
}

\$filePath = \$data.tool_input.file_path
if (-not \$filePath) { exit 0 }
if (-not \$filePath.EndsWith('.html')) { exit 0 }
if (-not (Test-Path \$filePath)) { exit 0 }

\$content = Get-Content \$filePath -Raw -Encoding UTF8
\$filename = Split-Path \$filePath -Leaf
\$warnings = @()

# 基本構造チェック
if (\$content -notmatch '<!DOCTYPE html>') {
    \$warnings += '<!DOCTYPE html> がありません'
}
if (\$content -notmatch '<html lang=') {
    \$warnings += '<html> タグに lang 属性がありません'
}
if (\$content -notmatch '<meta charset=') {
    \$warnings += '<meta charset> がありません'
}

# style.css パス整合性チェック
if (\$content -match 'style\.css') {
    if (\$content -notmatch '\"\.\.\/style\.css\"') {
        \$warnings += \"style.css のパスが '../style.css' ではありません\"
    }
}

# 記事ページ固有チェック（index.html は除外）
if (\$filename -ne 'index.html') {
    if (\$content -notmatch 'article-header') {
        \$warnings += 'article-header セクションがありません'
    }
    if (\$content -notmatch 'article-body') {
        \$warnings += 'article-body クラスがありません'
    }
    if (\$content -notmatch '<footer') {
        \$warnings += '<footer> がありません'
    }
}

if (\$warnings.Count -eq 0) { exit 0 }

\$bulletList = (\$warnings | ForEach-Object { \"  • \$_\" }) -join \"\`n\"
\$msg = \"⚠️ HTMLチェック警告 [\$filename]\`n\" + \$bulletList
@{ systemMessage = \$msg } | ConvertTo-Json -Compress
exit 0
"
