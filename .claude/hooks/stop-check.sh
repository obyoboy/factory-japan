#!/bin/bash
# Stop Hook: 未コミット記事ファイルの確認

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0
cd "$REPO_ROOT" || exit 0

UNCOMMITTED=$(git status --porcelain 2>/dev/null \
  | grep -E "(en|tl|vi)/.+\.html" \
  | awk '{print $NF}' || true)

[ -z "$UNCOMMITTED" ] && exit 0

COUNT=$(echo "$UNCOMMITTED" | grep -c "." || true)
PREVIEW=$(echo "$UNCOMMITTED" | head -5 | sed 's/^/    /')
EXTRA=$(( COUNT - 5 ))

powershell -NoProfile -Command "
\$count = $COUNT
\$preview = @'
$PREVIEW
'@
\$extra = $EXTRA

\$msg = \"⚠️ 停止前確認: 未コミットの記事ファイルが \$count 件あります\`n\"
\$msg += \$preview.Trim()
if (\$extra -gt 0) { \$msg += \"\`n    ... 他 \$extra 件\" }
\$msg += \"\`n\`n  git add & git push を実行してから終了してください。\"
\$msg += \"\`n  （問題なければそのまま終了してもかまいません）\"
@{ systemMessage = \$msg } | ConvertTo-Json -Compress
"
exit 0
