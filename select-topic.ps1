# select-topic.ps1
# topics.json から未使用・最高優先度のトピックを選んで drafts/topic.json に書き出す

param(
    [string]$TopicsFile  = "topics.json",
    [string]$UsedFile    = "used-topics.json",
    [string]$OutputFile  = "drafts/topic.json"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = $PSScriptRoot

function Read-JsonFile([string]$path, [string]$label) {
    if (-not (Test-Path $path)) {
        Write-Error "$label not found: $path"
        exit 1
    }
    $raw = Get-Content $path -Raw -Encoding UTF8
    try {
        return $raw | ConvertFrom-Json
    } catch {
        Write-Error "Invalid JSON in $label ($path): $_"
        exit 1
    }
}

$topicsPath  = Join-Path $repoRoot $TopicsFile
$usedPath    = Join-Path $repoRoot $UsedFile
$outputPath  = Join-Path $repoRoot $OutputFile

# topics.json を読み込む
$topics = Read-JsonFile $topicsPath "topics.json"
if (-not ($topics -is [System.Array])) {
    Write-Error "topics.json must be an array"
    exit 1
}

# used-topics.json を読み込む（なければ空配列）
if (Test-Path $usedPath) {
    $usedIds = Read-JsonFile $usedPath "used-topics.json"
    if (-not ($usedIds -is [System.Array])) {
        $usedIds = @()
    }
} else {
    $usedIds = @()
}

# 未使用トピックをフィルタリング
$unusedTopics = $topics | Where-Object { $_.id -notin $usedIds }

if ($null -eq $unusedTopics -or @($unusedTopics).Count -eq 0) {
    Write-Error "No unused topics available. Add new topics to topics.json or review used-topics.json."
    exit 1
}

# 最高優先度を選ぶ
$unusedArray  = @($unusedTopics)
$maxPriority  = ($unusedArray | Measure-Object -Property priority -Maximum).Maximum
$candidates   = @($unusedArray | Where-Object { $_.priority -eq $maxPriority })

# 候補からランダムに1つ選択
$selected = $candidates | Get-Random

# drafts/ ディレクトリがなければ作成
$outputDir = Split-Path $outputPath
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# UTF-8 BOMなしで書き出す
$json = $selected | ConvertTo-Json -Depth 5
$utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, ($json + "`n"), $utf8NoBOM)

Write-Host "Selected topic : $($selected.id)"
Write-Host "Topic          : $($selected.topic)"
Write-Host "Category       : $($selected.category)"
Write-Host "Priority       : $($selected.priority)"
Write-Host "Saved to       : $($OutputFile)"
