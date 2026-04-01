# Stop Hook: Check for uncommitted article files before stopping
param()

$repoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $repoRoot) { exit 0 }

Set-Location $repoRoot

$gitStatus = git status --porcelain 2>$null
$uncommitted = $gitStatus | Where-Object { $_ -match '(en|tl|vi)/.+\.html' } | ForEach-Object {
    ($_ -split '\s+', 2)[1]
}

if (-not $uncommitted) { exit 0 }

$count = @($uncommitted).Count
$preview = (@($uncommitted) | Select-Object -First 5 | ForEach-Object { "    $_" }) -join "`n"
$extra = $count - 5

$msg = "[Stop Check] $count uncommitted article file(s) found:`n"
$msg += $preview
if ($extra -gt 0) { $msg += "`n    ... and $extra more" }
$msg += "`n`n  Please run: git add & git push`n  (Or ignore this warning if intentional)"

@{ systemMessage = $msg } | ConvertTo-Json -Compress
exit 0
