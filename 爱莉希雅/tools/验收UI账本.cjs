/**
 * 阶段 5 账本视觉夹具：在固定 208×236 的隔离 Electron 窗口中生成前后截图，
 * 比较关键矩形并验证按钮、Esc、文字选择边界和轻量材质。不会触碰真实用量或设置。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前').replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用玻璃 = process.env.ELYSIA_UI_DISABLE_LEDGER_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-ledger-'))
const 输出目录 = path.join(项目根, '.cache')
const 截图路径 = path.join(输出目录, `UI阶段5-账本-${标签}.png`)
const 快照路径 = path.join(输出目录, `UI阶段5-账本-${标签}.json`)

app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

app.whenReady().then(async () => {
  let 窗口
  try {
    窗口 = new BrowserWindow({
      width: 208, height: 236,
      minWidth: 208, maxWidth: 208, minHeight: 236, maxHeight: 236,
      show: false, frame: false, resizable: false, maximizable: false, fullscreenable: false,
      backgroundColor: '#fffafc',
      webPreferences: {
        preload: path.join(__dirname, '验收账本预载.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false,
      },
    })
    await 窗口.loadFile(path.join(项目根, 'renderer', '账本.html'))
    if (禁用玻璃) {
      await 窗口.webContents.executeJavaScript(`document.querySelector('link[href="账本-粉色玻璃.css"]')?.remove()`)
    }
    await 等待(300)

    const 快照 = await 窗口.webContents.executeJavaScript(`(async () => {
      const 取矩形 = (选择器) => {
        const 矩形 = document.querySelector(选择器).getBoundingClientRect()
        return { x: Math.round(矩形.x), y: Math.round(矩形.y), width: Math.round(矩形.width), height: Math.round(矩形.height) }
      }
      const 取样式 = (选择器) => {
        const 样式 = getComputedStyle(document.querySelector(选择器))
        return {
          background: 样式.background, border: 样式.border, boxShadow: 样式.boxShadow,
          backdropFilter: 样式.backdropFilter || 样式.webkitBackdropFilter || '',
          transition: 样式.transition, userSelect: 样式.userSelect,
        }
      }
      document.getElementById('看流水').click()
      document.getElementById('收起').click()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise((resolve) => requestAnimationFrame(resolve))
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rectangles: {
          body: 取矩形('body'), header: 取矩形('.顶'), close: 取矩形('.关'),
          mainValue: 取矩形('.大数'), groups: 取矩形('.两组'), group: 取矩形('.组'),
          details: 取矩形('.明细'), footer: 取矩形('.底'), flow: 取矩形('#看流水'),
        },
        styles: {
          body: 取样式('body'), header: 取样式('.顶'), group: 取样式('.组'),
          close: 取样式('.关'), flow: 取样式('#看流水'),
        },
        calls: window.账本.取调用(),
        overlayLoaded: !!document.querySelector('link[href="账本-粉色玻璃.css"]'),
        selectable: { body: getComputedStyle(document.body).userSelect },
      }
    })()`)

    if (快照.viewport.width !== 208 || 快照.viewport.height !== 236) throw new Error('账本视口尺寸变化：' + JSON.stringify(快照.viewport))
    if (快照.calls.打开账本文件 !== 1 || 快照.calls.收起来 !== 2) throw new Error('账本按钮或 Esc 行为回归：' + JSON.stringify(快照.calls))
    if (快照.selectable.body !== 'none') throw new Error('账本固定文字恢复成可选择状态')

    if (标签 === '改造后') {
      const 改造前路径 = path.join(输出目录, 'UI阶段5-账本-改造前.json')
      if (!fs.existsSync(改造前路径)) throw new Error('缺少账本改造前布局快照')
      const 改造前 = JSON.parse(fs.readFileSync(改造前路径, 'utf8'))
      if (JSON.stringify(快照.rectangles) !== JSON.stringify(改造前.rectangles)) {
        throw new Error(`账本布局发生变化：改造前=${JSON.stringify(改造前.rectangles)} 改造后=${JSON.stringify(快照.rectangles)}`)
      }
      if (!快照.overlayLoaded) throw new Error('账本粉色玻璃覆盖层未加载')
      if (快照.styles.body.backdropFilter !== 'none' || 快照.styles.group.backdropFilter !== 'none') {
        throw new Error('账本内部不应使用背景模糊')
      }
      if (/\ball\b/i.test(快照.styles.close.transition) || /\ball\b/i.test(快照.styles.flow.transition)) {
        throw new Error('账本按钮仍在使用 transition: all')
      }
    }

    fs.mkdirSync(输出目录, { recursive: true })
    const 图片 = await 窗口.webContents.capturePage()
    fs.writeFileSync(截图路径, 图片.toPNG())
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ 阶段 5 账本 ${标签}截图：${截图路径}`)
    console.log(`✓ 阶段 5 账本 ${标签}快照：${快照路径}`)
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (窗口 && !窗口.isDestroyed()) 窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 验收结果优先 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 300).unref()
  }
})

setTimeout(() => app.exit(2), 10000).unref()
