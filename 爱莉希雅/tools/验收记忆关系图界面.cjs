/**
 * 用真实 Electron 主窗口做只读视觉验收：打开关系图、聚焦一张有连接的卡片并截图。
 * 关系数据来自当前数据目录；测试不拖动画布、不建立关系，所以不会写关系或布局。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-memory-graph-visual-'))
const 日志文件 = path.join(项目根, '.cache', '验收-长期记忆关系图.log')
fs.mkdirSync(path.dirname(日志文件), { recursive: true })
fs.writeFileSync(日志文件, '开始\n', 'utf8')
function 日志(文字) { fs.appendFileSync(日志文件, `${new Date().toISOString()} ${文字}\n`, 'utf8') }
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
app.setPath('userData', path.join(临时根, 'Electron'))

function 等(毫秒) { return new Promise((resolve) => setTimeout(resolve, 毫秒)) }

app.whenReady().then(async () => {
  日志('app ready')
  let 窗口
  try {
    窗口 = new BrowserWindow({
      width: 1100, height: 760, show: false, backgroundColor: '#fffafd',
      webPreferences: { preload: path.join(__dirname, '验收记忆关系图预载.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    })
    窗口.webContents.on('console-message', (_事件, ...参数) => 日志('renderer console：' + 参数.map((一) => typeof 一 === 'string' ? 一 : JSON.stringify(一)).join(' | ')))
    窗口.webContents.on('render-process-gone', (_事件, 细节) => 日志('renderer gone：' + JSON.stringify(细节)))
    await 窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))
    窗口.show()
    日志('测试窗口加载完成')
    await 等(300)
    const 状态 = await 窗口.webContents.executeJavaScript(`(async () => {
      if (typeof 开记忆管理 === 'function') 开记忆管理()
      else { const mask = document.getElementById('记忆管理遮罩'); mask.classList.remove('收着'); mask.setAttribute('aria-hidden', 'false') }
      await new Promise(r => setTimeout(r, 500))
      document.querySelector('[data-长期视图="关系图"]').click()
      await new Promise(r => setTimeout(r, 1200))
      const firstLine = document.querySelector('.关系图连线')
      const focusKey = firstLine && firstLine.dataset.从键
      const focusCard = focusKey && [...document.querySelectorAll('.关系图卡片')].find(card => card.dataset.键 === focusKey)
      if (focusCard) focusCard.click()
      await new Promise(r => setTimeout(r, 800))
      const cards = document.querySelectorAll('.关系图卡片').length
      const lines = document.querySelectorAll('.关系图连线').length
      const panel = document.querySelector('.记忆管理面板')
      const viewport = document.querySelector('.关系图视口')
      const selected = document.querySelector('.关系图卡片.选中记忆')
      const related = document.querySelectorAll('.关系图卡片.关联记忆').length
      const focusedLines = document.querySelectorAll('.关系图连线.焦点关系').length
      const dimmed = document.querySelectorAll('.关系图卡片.非关联记忆').length
      const selectedRect = selected && selected.getBoundingClientRect()
      const viewportRect = viewport && viewport.getBoundingClientRect()
      const centerDistance = selectedRect && viewportRect ? Math.hypot(
        selectedRect.left + selectedRect.width / 2 - (viewportRect.left + viewportRect.width / 2),
        selectedRect.top + selectedRect.height / 2 - (viewportRect.top + viewportRect.height / 2)
      ) : 9999
      const cardStyle = selected && getComputedStyle(selected)
      const worldTransform = document.querySelector('.关系图世界')?.style.transform || ''
      const mask = document.getElementById('记忆管理遮罩')
      return {
        cards, lines, related, focusedLines, dimmed, selected: !!selected,
        centerDistance: Math.round(centerDistance), cardWidth: selectedRect ? Math.round(selectedRect.width) : 0,
        cardHeight: selectedRect ? Math.round(selectedRect.height) : 0,
        glassBlur: cardStyle ? cardStyle.backdropFilter || cardStyle.webkitBackdropFilter : '',
        worldTransform, hasScale: worldTransform.includes('scale('), zoomButtons: [...document.querySelectorAll('.关系图工具栏 button')].filter(b => /放大|缩小/.test(b.title + b.textContent)).length,
        graphMode: panel.classList.contains('图谱模式'), panelWidth: Math.round(panel.getBoundingClientRect().width),
        viewportHeight: viewport ? Math.round(viewport.getBoundingClientRect().height) : 0,
        maskHidden: mask.classList.contains('收着'), maskOpacity: getComputedStyle(mask).opacity, hasPainter: typeof 画长期记忆关系图 === 'function'
      }
    })()`)
    日志('界面状态：' + JSON.stringify(状态))
    if (!状态.graphMode || 状态.cards < 1 || 状态.lines < 1 || !状态.selected || 状态.related < 1 || 状态.focusedLines < 1 || 状态.centerDistance > 4 || 状态.cardWidth !== 260 || 状态.cardHeight !== 132 || !状态.glassBlur.includes('blur') || 状态.hasScale || 状态.zoomButtons || 状态.panelWidth < 700 || 状态.viewportHeight < 300 || 状态.maskHidden || 状态.maskOpacity !== '1') throw new Error('图谱没有正确展开或聚焦：' + JSON.stringify(状态))
    const 图 = await 窗口.webContents.capturePage()
    const 输出 = path.join(项目根, '.cache', '验收-长期记忆关系图.png')
    fs.mkdirSync(path.dirname(输出), { recursive: true })
    fs.writeFileSync(输出, 图.toPNG())
    日志('截图完成：' + 输出)
    console.log('✓ Electron 关系图已聚焦关联记忆：' + JSON.stringify(状态))
    console.log('✓ 截图：' + 输出)
  } catch (错误) {
    日志('失败：' + (错误.stack || 错误.message))
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (窗口 && !窗口.isDestroyed()) 窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 截图结果更重要 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
  }
})

setTimeout(() => {
  日志('全局超时，强制退出')
  app.exit(2)
}, 20000).unref()
