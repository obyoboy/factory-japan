# PostToolUse Hook: HTML structure check + style.css path validation
param()

$json = [Console]::In.ReadToEnd()
try {
    $data = $json | ConvertFrom-Json
} catch {
    exit 0
}

$filePath = $data.tool_input.file_path
if (-not $filePath) { exit 0 }
if (-not $filePath.EndsWith('.html')) { exit 0 }
if (-not (Test-Path $filePath)) { exit 0 }

$content = Get-Content $filePath -Raw -Encoding UTF8
$filename = Split-Path $filePath -Leaf
$warnings = @()

# Basic structure
if ($content -notmatch '<!DOCTYPE html>') {
    $warnings += 'Missing <!DOCTYPE html>'
}
if ($content -notmatch '<html lang=') {
    $warnings += 'Missing lang attribute on <html> tag'
}
if ($content -notmatch '<meta charset=') {
    $warnings += 'Missing <meta charset>'
}

# style.css path check
if ($content -match 'style\.css') {
    if ($content -notmatch '"\.\.\/style\.css"') {
        $warnings += "style.css path should be '../style.css'"
    }
}

# Article page checks (skip index.html)
if ($filename -ne 'index.html') {
    if ($content -notmatch 'article-header') {
        $warnings += 'Missing article-header section'
    }
    if ($content -notmatch 'article-body') {
        $warnings += 'Missing article-body class'
    }
    if ($content -notmatch '<footer') {
        $warnings += 'Missing <footer>'
    }
}

if ($warnings.Count -eq 0) { exit 0 }

$bulletList = ($warnings | ForEach-Object { "  - $_" }) -join "`n"
$msg = "[HTML Check] Warnings in $filename`n" + $bulletList
@{ systemMessage = $msg } | ConvertTo-Json -Compress
exit 0
