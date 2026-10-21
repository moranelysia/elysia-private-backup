'use strict'

const { execSync } = require('node:child_process')

function PowerShell字符串(值) {
  return String(值).replace(/'/g, "''")
}

/** 返回指定 Windows 进程正在运行的实例数。 */
function 在跑几个(名字) {
  const 纯名 = String(名字).replace(/\.exe$/i, '')

  try {
    const 输出 = execSync(
      `powershell -NoProfile -Command "@(Get-Process -Name '${PowerShell字符串(纯名)}' -ErrorAction SilentlyContinue).Count"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 个数 = parseInt(String(输出).trim(), 10)
    if (Number.isFinite(个数)) return 个数
  } catch {
    /* PowerShell 不可用时退到 tasklist */
  }

  try {
    const 输出 = execSync('tasklist /NH', {
      encoding: 'latin1',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    })
    return 输出
      .split('\n')
      .filter((行) => 行.toLowerCase().includes(纯名.toLowerCase())).length
  } catch {
    return 0
  }
}

function 有进程(名字) {
  return 在跑几个(名字) > 0
}

/** 保留最早启动的桌宠，关闭后来多开的实例。 */
function 收掉多余的桌宠() {
  try {
    const 输出 = execSync(
      `powershell -NoProfile -Command "Get-Process -Name 'Bongo Cat Mver' -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -Skip 1 | ForEach-Object { $_.Id }"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 },
    )
    const 要收的 = String(输出)
      .split(/\s+/)
      .map((值) => parseInt(值, 10))
      .filter((值) => Number.isFinite(值))

    for (const 进程号 of 要收的) {
      try {
        process.kill(进程号)
        console.log('  收掉了多出来的那只（进程 ' + 进程号 + '）')
      } catch (错误) {
        console.log('  收不掉 ' + 进程号 + ': ' + 错误.message)
      }
    }
    return 要收的.length
  } catch (错误) {
    console.log('  收尾的时候出错: ' + 错误.message)
    return 0
  }
}

module.exports = { 在跑几个, 有进程, 收掉多余的桌宠 }
