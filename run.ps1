# run.ps1 — ワンコマンド全自動実行（Windows PowerShell）
# 使い方: .\run.ps1
# 依存  : node (Node.js), claude (Claude Code CLI)

param(
    [switch]$SkipBuildPublished
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = $PSScriptRoot
$pipelineScript = Join-Path $repoRoot "scripts\run-pipeline.js"

if (-not (Test-Path $pipelineScript)) {
    Write-Error "run-pipeline.js が見つかりません: $pipelineScript"
    exit 1
}

$nodeArgs = @($pipelineScript, "--generate-with-claude")

if ($SkipBuildPublished) {
    $nodeArgs += "--skip-build-published"
}

Write-Host ""
Write-Host "=== Work in Japan Factory Guide — Article Pipeline ===" -ForegroundColor Cyan
Write-Host "Mode: 全自動（トピック選択 → Claude生成 → HTML出力 → git push）"
Write-Host ""

& node @nodeArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Pipeline failed (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
}
