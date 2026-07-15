# Detached Amplify CreateApp retry — every 10 min, up to 6 hours.
# Writes progress to scripts\amplify-retry.log; on success writes the appId
# to scripts\amplify-app-id.txt and exits.
$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $PSScriptRoot 'amplify-retry.log'
$out = Join-Path $PSScriptRoot 'amplify-app-id.txt'

$envFile = Get-Content (Join-Path $root 'input.env')
foreach ($line in $envFile) {
  if ($line -match '^AWS_ACCESS_KEY_ID=(.+)$') { $env:AWS_ACCESS_KEY_ID = $Matches[1].Trim() }
  if ($line -match '^AWS_SECRET_ACCESS_KEY=(.+)$') { $env:AWS_SECRET_ACCESS_KEY = $Matches[1].Trim() }
}

$rules = '[{"source":"</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|svg|txt|map|json|webmanifest)$)([^.]+$)/>","status":"200","target":"/index.html"},{"source":"/<*>","status":"404-200","target":"/index.html"}]'
$rulesFile = Join-Path $PSScriptRoot 'amplify-rules.json'
Set-Content -Path $rulesFile -Value $rules -Encoding ascii

for ($i = 1; $i -le 36; $i++) {
  $r = aws amplify create-app --region us-west-2 --name skillexchange --custom-rules "file://$rulesFile" --tags Project=skillexchange,ManagedBy=terraform --no-cli-pager 2>&1 | Out-String
  if ($r -match '"appId":\s*"([^"]+)"') {
    Add-Content $log "$(Get-Date -Format HH:mm:ss) CREATED $($Matches[1])"
    Set-Content $out $Matches[1]
    exit 0
  }
  Add-Content $log "$(Get-Date -Format HH:mm:ss) attempt $i throttled"
  Start-Sleep -Seconds 600
}
Add-Content $log "EXHAUSTED"
