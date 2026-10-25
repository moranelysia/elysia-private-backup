# No key in arguments, history, source, or output. One request / 256 output tokens / 20 seconds.
$ErrorActionPreference = 'Stop'
$taskSecret = Read-Host 'DeepSeek API Key (hidden; one paid request max)' -AsSecureString
$taskPointer = [IntPtr]::Zero
$taskPrevious = [Environment]::GetEnvironmentVariable('ELYSIA_HEADLESS_API_KEY', 'Process')
try {
    $taskPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
    [Environment]::SetEnvironmentVariable('ELYSIA_HEADLESS_API_KEY', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer), 'Process')
    & node (Join-Path $PSScriptRoot 'test-headless-live.cjs') --live
    $taskExit = $LASTEXITCODE
} finally {
    [Environment]::SetEnvironmentVariable('ELYSIA_HEADLESS_API_KEY', $taskPrevious, 'Process')
    if ($taskPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer) }
    $taskSecret.Dispose()
}
exit $taskExit
