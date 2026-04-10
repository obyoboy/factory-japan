# run.ps1
# Wrapper script for the article pipeline (Windows PowerShell)

param(
    [switch]$SkipBuildPublished,
    [switch]$SkipImageFetch,
    [ValidateSet("single", "until-claude-limit")]
    [string]$RunMode = "single",
    [switch]$UntilClaudeLimit
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = $PSScriptRoot
$pipelineScript = Join-Path $repoRoot "scripts\run-pipeline.js"

if (-not (Test-Path $pipelineScript)) {
    Write-Error "run-pipeline.js not found: $pipelineScript"
    exit 1
}

if ($UntilClaudeLimit) {
    $RunMode = "until-claude-limit"
}

$nodeArgs = @($pipelineScript, "--generate-with-claude", "--run-mode", $RunMode)

if ($SkipBuildPublished) {
    $nodeArgs += "--skip-build-published"
}

if ($SkipImageFetch) {
    $nodeArgs += "--skip-image-fetch"
} else {
    $nodeArgs += "--fetch-image-with-pexels"
}

Write-Host ""
Write-Host "=== Work in Japan Factory Guide | Article Pipeline ===" -ForegroundColor Cyan
Write-Host "Run mode: $RunMode"
Write-Host ""

& node @nodeArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Pipeline failed (exit code $LASTEXITCODE)"
    exit $LASTEXITCODE
}
