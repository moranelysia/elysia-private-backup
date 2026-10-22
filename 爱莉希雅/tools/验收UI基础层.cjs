/**
 * 阶段 1 的真实 Electron 视觉夹具。
 *
 * 同一个脚本在改造前后各运行一次，保持窗口尺寸、内容和展开状态一致；
 * 除了写入 .cache 下的截图与布局快照，不读写真实对话、记忆或设置。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 标签 = String(process.env.ELYSIA_UI_CAPTURE_LABEL || '当前')
  .replace(/[^\u4e00-\u9fffA-Za-z0-9_-]/g, '') || '当前'
const 禁用玻璃 = process.env.ELYSIA_UI_DISABLE_GLASS === '1'
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-ui-foundation-'))
const 输出目录 = path.join(项目根, '.cache')
const 截图路径 = path.join(输出目录, `UI阶段1-${标签}.png`)
const 快照路径 = path.join(输出目录, `UI阶段1-${标签}.json`)

process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) {
  return new Promise((resolve) => setTimeout(resolve, 毫秒))
}

app.whenReady().then(async () => {
  let 窗口
  try {
    窗口 = new BrowserWindow({
      // 与 main.js 的正式主窗口初始尺寸保持一致。
      width: 620,
      height: 560,
      show: false,
      backgroundColor: '#fffafd',
      webPreferences: {
        preload: path.join(__dirname, '验收记忆关系图预载.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    })
    await 窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))
    if (禁用玻璃) {
      await 窗口.webContents.executeJavaScript(`(() => {
        const 样式 = document.querySelector('link[href="粉色玻璃.css"]')
        if (样式) 样式.disabled = true
      })()`)
    }
    await 等待(900)

    const 快照 = await 窗口.webContents.executeJavaScript(`(() => {
      const 详情 = document.getElementById('状态详情')
      const 详情开关 = document.getElementById('状态详情开关')
      详情.classList.remove('收着')
      详情开关.setAttribute('aria-expanded', 'true')
      document.getElementById('状态').textContent = '在的 · 聊天'
      document.getElementById('对话列表').innerHTML = [
        '<div class="对话行"><button class="对话 当前"><span class="对话标题">今天的计划</span><span class="对话小字">刚刚 · 12 条 · flash</span></button></div>',
        '<div class="对话行"><button class="对话"><span class="对话标题">记忆系统优化</span><span class="对话小字">昨天 · 38 条 · flash</span></button></div>',
        '<div class="对话行"><button class="对话 临时"><span class="对话标题">临时想法</span><span class="对话小字">本次运行 · 临时</span></button></div>'
      ].join('')

      const 取矩形 = (选择器) => {
        const 元素 = document.querySelector(选择器)
        const 矩形 = 元素.getBoundingClientRect()
        return {
          x: Math.round(矩形.x), y: Math.round(矩形.y),
          width: Math.round(矩形.width), height: Math.round(矩形.height),
        }
      }
      const 取样式 = (选择器) => {
        const 样式 = getComputedStyle(document.querySelector(选择器))
        return {
          background: 样式.background,
          border: 样式.border,
          boxShadow: 样式.boxShadow,
          backdropFilter: 样式.backdropFilter || 样式.webkitBackdropFilter || '',
          transition: 样式.transition,
        }
      }
      详情开关.click()
      const 详情已收起 = 详情.classList.contains('收着') && 详情开关.getAttribute('aria-expanded') === 'false'
      详情开关.click()
      const 详情已展开 = !详情.classList.contains('收着') && 详情开关.getAttribute('aria-expanded') === 'true'
      const 输入框 = document.getElementById('输入')
      输入框.focus()
      const 输入可聚焦 = document.activeElement === 输入框
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rectangles: {
          topbar: 取矩形('.顶栏'),
          sidebar: 取矩形('.侧栏'),
          statusCard: 取矩形('.侧栏状态'),
          composer: 取矩形('.输入区'),
          input: 取矩形('#输入'),
          send: 取矩形('#发送'),
        },
        styles: {
          topbar: 取样式('.顶栏'),
          sidebar: 取样式('.侧栏'),
          statusCard: 取样式('.侧栏状态'),
          composer: 取样式('.输入区'),
          topButton: 取样式('.小按钮'),
          modeButton: 取样式('.模式按钮'),
          input: 取样式('#输入'),
          send: 取样式('#发送'),
        },
        overlayLoaded: !![...document.styleSheets].find((表) => String(表.href || '').endsWith('/%E7%B2%89%E8%89%B2%E7%8E%BB%E7%92%83.css') || String(表.href || '').endsWith('/粉色玻璃.css')),
        interaction: { 详情已收起, 详情已展开, 输入可聚焦 },
      }
    })()`)

    if (!快照.interaction.详情已收起 || !快照.interaction.详情已展开 || !快照.interaction.输入可聚焦) {
      throw new Error('常驻区交互回归失败：' + JSON.stringify(快照.interaction))
    }
    if (标签 === '改造后') {
      const 改造前路径 = path.join(输出目录, 'UI阶段1-改造前.json')
      if (!fs.existsSync(改造前路径)) throw new Error('缺少改造前布局快照')
      const 改造前 = JSON.parse(fs.readFileSync(改造前路径, 'utf8'))
      if (JSON.stringify(快照.rectangles) !== JSON.stringify(改造前.rectangles)) {
        throw new Error(`布局发生变化：改造前=${JSON.stringify(改造前.rectangles)} 改造后=${JSON.stringify(快照.rectangles)}`)
      }
      if (!快照.overlayLoaded || 快照.styles.statusCard.backdropFilter !== 'none') {
        throw new Error('粉色玻璃覆盖层未生效，或状态卡仍在重复模糊')
      }
      if (/\ball\b/i.test(快照.styles.topButton.transition) || /\ball\b/i.test(快照.styles.modeButton.transition)) {
        throw new Error('高频按钮仍在使用 transition: all')
      }
    }

    fs.mkdirSync(输出目录, { recursive: true })
    const 图片 = await 窗口.webContents.capturePage()
    fs.writeFileSync(截图路径, 图片.toPNG())
    fs.writeFileSync(快照路径, JSON.stringify(快照, null, 2) + '\n', 'utf8')
    console.log(`✓ UI 阶段 1 ${标签}截图：${截图路径}`)
    console.log(`✓ UI 阶段 1 ${标签}快照：${快照路径}`)
    console.log(JSON.stringify(快照))
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (窗口 && !窗口.isDestroyed()) 窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 保留验收结果优先 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
  }
})

setTimeout(() => app.exit(2), 20000).unref()
