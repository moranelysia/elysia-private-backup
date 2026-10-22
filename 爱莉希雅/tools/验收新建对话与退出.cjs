/**
 * 新建对话与退出确认的 Electron 真渲染验收。
 * 模型接口故意延迟 1.2 秒：面板必须先出现，且只能发起一次请求。
 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow } = require('electron')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-dialog-ui-'))
const 输出目录 = path.join(项目根, '.cache')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
app.setPath('userData', path.join(临时根, 'Electron'))

function 等待(毫秒) { return new Promise((完成) => setTimeout(完成, 毫秒)) }
function 断言(条件, 说明, 详情 = '') {
  if (!条件) throw new Error(`${说明}${详情 ? `：${详情}` : ''}`)
  console.log('✓ ' + 说明)
}

app.whenReady().then(async () => {
  let 窗口
  try {
    窗口 = new BrowserWindow({
      width: 620,
      height: 560,
      show: false,
      backgroundColor: '#fffafd',
      webPreferences: {
        preload: path.join(__dirname, '验收对话交互预载.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        offscreen: true,
      },
    })
    await 窗口.loadFile(path.join(项目根, 'renderer', 'index.html'))
    await 等待(80)
    fs.mkdirSync(输出目录, { recursive: true })

    const 立即状态 = await 窗口.webContents.executeJavaScript(`(async () => {
      localStorage.removeItem('elysia:model-list:v1')
      const 面板 = document.getElementById('选模型')
      const 开始 = performance.now()
      document.getElementById('开新对话').click()
      return {
        用时: performance.now() - 开始,
        已打开: !面板.classList.contains('收着'),
        加载提示: !!面板.querySelector('.模型加载'),
        模式按钮: 面板.querySelectorAll('[data-模式]').length,
      }
    })()`)
    断言(立即状态.已打开, '模型面板在网络返回前已经打开')
    断言(立即状态.用时 < 50, '点击处理与面板打开少于 50ms', `${立即状态.用时.toFixed(1)}ms`)
    断言(立即状态.加载提示, '慢网络期间显示紧凑加载状态')
    断言(立即状态.模式按钮 === 0, '新建面板不再包含模式选择')

    await 等待(1250)
    const 模型状态 = await 窗口.webContents.executeJavaScript(`(() => ({
      模型按钮: [...document.querySelectorAll('#选模型 [data-模型]')].map((一) => 一.dataset.模型),
      说明: document.querySelector('.选模型说明')?.textContent || '',
      面板矩形: (() => { const r = document.getElementById('选模型').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height } })(),
    }))()`)
    断言(模型状态.模型按钮.length === 3, '模型名单返回后原位更新为三个选择')
    断言(模型状态.说明.includes('沿用当前的聊天模式'), '界面明确说明模式自动继承')
    const 模型图 = await 窗口.webContents.capturePage()
    fs.writeFileSync(path.join(输出目录, 'UI-新建对话模型选择.png'), 模型图.toPNG())

    await 窗口.webContents.executeJavaScript(`document.querySelector('#选模型 [data-模型="deepseek-flash"]').click()`)
    await 等待(40)
    const 调用状态 = await 窗口.webContents.executeJavaScript(`window.爱莉.验收状态()`)
    断言(调用状态.模型请求次数 === 1, '启动刷新与点击共用同一个模型请求')
    断言(调用状态.新对话参数.length === 1, '选择模型只创建一段新对话')
    断言(调用状态.新对话参数[0].length === 1 && 调用状态.新对话参数[0][0] === 'deepseek-flash', '创建时只传模型，不再传模式')

    await 窗口.webContents.executeJavaScript(`document.getElementById('退出').click()`)
    await 等待(260)
    const 退出状态 = await 窗口.webContents.executeJavaScript(`(() => {
      const 卡 = document.querySelector('.退出确认卡')
      const r = 卡.getBoundingClientRect()
      return {
        有遮罩: !!document.querySelector('.退出确认遮罩'),
        卡宽: r.width,
        中心偏差: Math.abs((r.left + r.width / 2) - innerWidth / 2),
        聊天确认卡: document.querySelectorAll('.聊天区 .确认卡').length,
        默认焦点: document.activeElement?.className || '',
      }
    })()`)
    断言(退出状态.有遮罩, '退出确认使用独立应用内遮罩')
    断言(退出状态.卡宽 <= 340 && 退出状态.中心偏差 < 2, '退出确认卡紧凑居中', JSON.stringify(退出状态))
    断言(退出状态.聊天确认卡 === 0, '退出确认不再插入聊天流')
    断言(退出状态.默认焦点 === '继续运行', '默认焦点落在安全操作')
    // 隐藏的 Electron 验收窗会暂停 CSS 动画；截图夹具固定到动画完成态，不修改正式样式。
    await 窗口.webContents.executeJavaScript(`(() => {
      const 遮罩 = document.querySelector('.退出确认遮罩')
      const 卡 = document.querySelector('.退出确认卡')
      const 模型面板 = document.getElementById('选模型')
      遮罩.style.animation = 'none'; 遮罩.style.opacity = '1'
      卡.style.animation = 'none'; 卡.style.opacity = '1'; 卡.style.transform = 'none'
      模型面板.style.transition = 'none'; 模型面板.style.opacity = '0'; 模型面板.style.visibility = 'hidden'
    })()`)
    await 等待(40)
    const 退出图 = await 窗口.webContents.capturePage()
    fs.writeFileSync(path.join(输出目录, 'UI-退出确认.png'), 退出图.toPNG())

    await 窗口.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))`)
    await 等待(20)
    const 收尾 = await 窗口.webContents.executeJavaScript(`({
      确认已收: !document.querySelector('.退出确认遮罩'),
      ...window.爱莉.验收状态(),
    })`)
    断言(收尾.确认已收 && 收尾.收起次数 === 0 && 收尾.全部关掉次数 === 0, 'Esc 只取消确认，不误收窗口或退出')
    console.log(`✓ 截图：${path.join(输出目录, 'UI-新建对话模型选择.png')}`)
    console.log(`✓ 截图：${path.join(输出目录, 'UI-退出确认.png')}`)
  } catch (错误) {
    console.error('✗ ' + (错误.stack || 错误.message))
    process.exitCode = 1
  } finally {
    try { if (窗口 && !窗口.isDestroyed()) 窗口.destroy() } catch { /* 继续退出 */ }
    try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 截图优先 */ }
    app.quit()
    setTimeout(() => process.exit(process.exitCode || 0), 500).unref()
  }
})

setTimeout(() => app.exit(2), 20000).unref()
