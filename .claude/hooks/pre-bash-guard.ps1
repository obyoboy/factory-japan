# PreToolUse Hook: Block dangerous Bash commands
param()

$json = [Console]::In.ReadToEnd()
try {
    $data = $json | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $data.tool_input.command
if (-not $cmd) { exit 0 }

$blocked = @(
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

foreach ($pattern in $blocked) {
    if ($cmd -match [regex]::Escape($pattern)) {
        $msg = "[BLOCKED] Dangerous command detected`nPattern : $pattern`nCommand : $cmd`n`nIf you need to run this, execute it directly in your terminal."
        @{ 'continue' = $false; stopReason = $msg } | ConvertTo-Json -Compress
        exit 0
    }
}

exit 0
