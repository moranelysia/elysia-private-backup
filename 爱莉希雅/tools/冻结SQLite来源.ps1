param([Parameter(Mandatory=$true)][string]$Profile,[Parameter(Mandatory=$true)][string]$OutputParent)
$ErrorActionPreference='Stop'
$handles=New-Object 'System.Collections.Generic.List[System.IO.FileStream]'
try {
  $runner=Join-Path $PSScriptRoot '演练SQLite全量影子.cjs'
  $project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  function Assert-Stopped {
    $writers=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -notmatch '^(powershell|pwsh|cmd)\.exe$' -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($project,[StringComparison]::OrdinalIgnoreCase)) -or ($_.Name -match '^(electron|node|node_repl)\.exe$|爱莉|elysia' -and $_.CommandLine -and ($_.CommandLine.IndexOf($project,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.CommandLine -match 'start-all\.(cmd|cjs)|启动桌宠\.cjs|启动无界面核心'))) })
    if($writers.Count -ne 0){throw 'SQLITE_FREEZE_PROJECT_RUNNING'}
  }
  Assert-Stopped
  $node=(Get-Command node -ErrorAction Stop).Source
  $planText=& $node $runner --plan $Profile
  if($LASTEXITCODE -ne 0){throw 'SQLITE_FREEZE_PLAN_FAILED'}
  $plan=($planText -join "`n") | ConvertFrom-Json
  if(-not $plan.文件 -or $plan.文件.Count -gt 4000){throw 'SQLITE_FREEZE_PLAN_INVALID'}
  if(-not [IO.Path]::IsPathRooted($OutputParent)){throw 'SQLITE_FREEZE_PATH_INVALID'}
  $parent=[IO.Path]::GetFullPath($OutputParent)
  if(-not (Test-Path -LiteralPath $parent)){[IO.Directory]::CreateDirectory($parent) | Out-Null}
  # 用独立探针验证共享锁确实拒绝写打开，探针中没有正式数据。
  $probe=Join-Path $parent ('lock-probe-'+[guid]::NewGuid().ToString('N')+'.tmp')
  [IO.File]::WriteAllText($probe,'probe')
  $h=[IO.File]::Open($probe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try { & $node $runner --probe-lock $probe; if($LASTEXITCODE -ne 0){throw 'SQLITE_FREEZE_LOCK_UNAVAILABLE'} } finally { $h.Dispose();Remove-Item -LiteralPath $probe }
  foreach($entry in $plan.文件){$h=[IO.File]::Open($entry.源路径,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$handles.Add($h)}
  Assert-Stopped
  Write-Output ('F3C_SOURCE_LOCKS '+$handles.Count)
  & $node $runner --run $Profile $parent $plan.指纹
  if($LASTEXITCODE -ne 0){throw 'SQLITE_FREEZE_REHEARSAL_FAILED'}
  Assert-Stopped
} catch { Write-Output 'F3C_FREEZE_FAILED';exit 1 }
finally { foreach($h in $handles){$h.Dispose()} }
