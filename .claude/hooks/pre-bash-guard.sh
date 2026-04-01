#!/bin/bash
# PreToolUse Hook: 危険なBashコマンドを自動ブロック
INPUT=$(cat)

powershell -NoProfile -Command "
param()
\$data = \$null
try {
    \$data = '\$INPUT' | ConvertFrom-Json
} catch {
    exit 0
}

\$cmd = \$data.tool_input.command
if (-not \$cmd) { exit 0 }

\$blocked = @(
    'rm -rf',
    'rm -fr',
    'rm -r /',
    'git push --force',
    'git push -f ',
    'git reset --hard',
    'git clean -f',
    'git branch -D',
    'DROP TABLE',
    'DROP DATABASE'
)

foreach (\$pattern in \$blocked) {
    if (\$cmd -match [regex]::Escape(\$pattern)) {
        \$msg = \"⛔ 危険なコマンドをブロックしました\`n  パターン : \$pattern\`n  コマンド : \$cmd\`n\`n実行が必要な場合はユーザーが直接ターミナルで実行してください。\"
        @{ continue = \$false; stopReason = \$msg } | ConvertTo-Json -Compress
        exit 0
    }
}
exit 0
"
