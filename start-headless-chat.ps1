param([ValidateSet('--live','--demo')][string]$Mode = '--live')
$ErrorActionPreference = 'Stop'
if ($Mode -eq '--live') {
  $secure = Read-Host 'DeepSeek API key (hidden)' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $env:ELYSIA_TRIAL_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
try { & node (Join-Path $PSScriptRoot 'start-headless-chat.cjs') $Mode; exit $LASTEXITCODE }
finally { Remove-Item Env:ELYSIA_TRIAL_API_KEY -ErrorAction SilentlyContinue }
