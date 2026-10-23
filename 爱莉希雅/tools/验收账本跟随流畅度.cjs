/**
 * 用隔离的 Electron 窗口验证账本跟随：连续移动期间要多次更新，
 * 最终仍紧贴主窗口且保持 208×236。不会读取或修改真实聊天、设置和记忆。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, screen } = require('electron')
const { 创建账本跟随调度 } = require('../main/账本跟随.cjs')

const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ledger-follow-'))
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

app.whenReady().then(async () => {
  let 主窗口
  let 账本窗口
  try {
    const 工作区 = screen.getPrimaryDisplay().workArea
    const 起点X = 工作区.x + 80
    const 起点Y = 工作区.y + 80
    主窗口 = new BrowserWindow({ x: 起点X, y: 起点Y, width: 420, height: 320, show: false })
    账本窗口 = new BrowserWindow({
      x: 起点X + 428, y: 起点Y, width: 208, height: 236,
      minWidth: 208, maxWidth: 208, minHeight: 236, maxHeight: 236,
      show: false, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    })

    const 延迟们 = []
    let 最近事件时间 = 0
    const 跟随 = 创建账本跟随调度({
      更新: () => {
        const 主 = 主窗口.getBounds()
        账本窗口.setBounds({ x: 主.x + 主.width + 8, y: 主.y, width: 208, height: 236 }, false)
        延迟们.push(Date.now() - 最近事件时间)
      },
    })
    主窗口.on('move', () => {
      最近事件时间 = Date.now()
      跟随()
    })

    for (let i = 1; i <= 18; i++) {
      主窗口.setPosition(起点X + i * 4, 起点Y + i * 3, false)
      await 等待(8)
    }
    await 等待(80)

    const 主 = 主窗口.getBounds()
    const 账 = 账本窗口.getBounds()
    const 最大调度延迟 = 延迟们.length ? Math.max(...延迟们) : Infinity
    if (延迟们.length < 3) throw new Error(`连续移动期间只更新了 ${延迟们.length} 次`)
    if (最大调度延迟 >= 60) throw new Error(`仍出现 ${最大调度延迟}ms 的人为刷新等待`)
    if (账.x !== 主.x + 主.width + 8 || 账.y !== 主.y) throw new Error(`最终没有贴住主窗口：主=${JSON.stringify(主)} 账=${JSON.stringify(账)}`)
    // Windows 在 150% DPI 下可能把无边框窗口的 DIP 外框量化出 1px；逻辑尺寸仍固定为 208×236。
    if (Math.abs(账.width - 208) > 1 || Math.abs(账.height - 236) > 1) throw new Error(`账本尺寸漂移：${JSON.stringify(账)}`)

    console.log(`✓ 连续移动期间跟随 ${延迟们.length} 次，最大调度延迟 ${最大调度延迟}ms`)
    console.log(`✓ 最终间距 8px，账本逻辑尺寸固定 208×236（当前 DPI 外框 ${账.width}×${账.height}）`)
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (主窗口 && !主窗口.isDestroyed()) 主窗口.destroy() } catch { /* 继续退出 */ }
    try { if (账本窗口 && !账本窗口.isDestroyed()) 账本窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 临时目录不影响结果 */ }
    app.quit()
  }
})

setTimeout(() => app.exit(2), 10000).unref()
