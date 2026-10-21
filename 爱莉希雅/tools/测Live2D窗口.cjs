/** 启动独立验收窗口；模型明确就绪后驱动表现和口型，并截一帧。 */
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const 根 = path.resolve(__dirname, '..')
const 输出 = path.resolve(process.argv[2] || path.join(app.getPath('temp'), 'elysia-live2d-v13-smoke.png'))
const 验手势 = process.argv.includes('--gesture')
const 验待机 = process.argv.includes('--idle')
const 验边缘 = process.argv.includes('--edge')
const 验口型 = process.argv.includes('--mouth')
const 验快聊 = process.argv.includes('--quick')
let 窗口 = null
let 已收尾 = false
const 收到手势 = []
let 收到快聊 = 0

function 收尾(码, 说明) {
  if (已收尾) return
  已收尾 = true
  if (说明) console.log(说明)
  try { 窗口?.destroy() } catch { /* 不影响退出 */ }
  app.exit(码)
}

async function 截图重试() {
  let 最后错误 = null
  for (let 次数 = 1; 次数 <= 3; 次数++) {
    try { return await 窗口.webContents.capturePage() }
    catch (错误) {
      最后错误 = 错误
      if (!/UnknownVizError/.test(String(错误)) || 次数 === 3) throw 错误
      await new Promise((完成) => setTimeout(完成, 350 * 次数))
    }
  }
  throw 最后错误
}

app.whenReady().then(() => {
  ipcMain.on('live2d-手势', (_事件, 数据) => 收到手势.push(数据))
  ipcMain.on('live2d-快聊切换', () => { 收到快聊++ })
  ipcMain.on('live2d-准备好了', async (事件) => {
    if (!窗口 || 事件.sender !== 窗口.webContents) return
    try {
      if (验待机) {
        窗口.webContents.send('live2d-表现', {
          版本: 1, 类型: '待机', 阶段: '待机', 强度: 0.2,
          温度: 0.72, 活跃度: 0.25, 表情: '', 表情来源: '验收',
        })
        await new Promise((完成) => setTimeout(完成, 650))
        const 第一帧 = await 窗口.webContents.executeJavaScript('window.__live2d待机摆动')
        await new Promise((完成) => setTimeout(完成, 750))
        const 第二帧 = await 窗口.webContents.executeJavaScript('window.__live2d待机摆动')
        assert.ok(第一帧 && 第二帧, '没有取得待机摆动状态')
        assert.ok(第一帧.权重 > 0.9 && 第二帧.权重 > 0.9, '待机摆动没有平滑进入')
        for (const 帧 of [第一帧, 第二帧]) {
          assert.equal(帧.容器X, 0, '待机时不应平移整个模型容器')
          assert.equal(帧.容器Y, 0, '待机时不应平移整个模型容器')
          assert.equal(帧.容器角度, 0, '待机时不应旋转整个模型容器')
          assert.ok(Math.abs(帧.身X) <= 2.2 && Math.abs(帧.身Y) <= 1.2 && Math.abs(帧.身Z) <= 1.5, '身体摆动超出安全范围')
          assert.ok(帧.头发倍率 > 1.55 && 帧.头发倍率 <= 1.6, '待机头发输出没有按预期放大')
          if (Math.abs(帧.原前发) > 0.0005) assert.ok(Math.abs(帧.前发) > Math.abs(帧.原前发) * 1.5, '前发待机摆动没有明显放大')
          if (Math.abs(帧.原后发) > 0.0005) assert.ok(Math.abs(帧.后发) > Math.abs(帧.原后发) * 1.5, '后发待机摆动没有明显放大')
        }
        const 身体变化 = Math.abs(第一帧.身X - 第二帧.身X) + Math.abs(第一帧.身Y - 第二帧.身Y) + Math.abs(第一帧.身Z - 第二帧.身Z)
        const 头发变化 = Math.abs(第一帧.前发 - 第二帧.前发) + Math.abs(第一帧.后发 - 第二帧.后发)
        assert.ok(身体变化 > 0.02, `两帧之间没有可测得的身体独立摆动：${JSON.stringify({ 第一帧, 第二帧 })}`)
        assert.ok(头发变化 > 0.0005, `两帧之间没有可测得的头发物理摆动：${JSON.stringify({ 第一帧, 第二帧 })}`)
        assert.ok(
          身体变化 + 头发变化 > 0.05,
          '两帧之间没有可测得的分层待机变化',
        )
        窗口.webContents.send('live2d-表现', {
          版本: 1, 类型: '思考', 阶段: '思考', 强度: 0.5,
          温度: 0.72, 活跃度: 0.45, 表情: '', 表情来源: '验收',
        })
        await new Promise((完成) => setTimeout(完成, 850))
        const 忙碌帧 = await 窗口.webContents.executeJavaScript('window.__live2d待机摆动')
        assert.ok(忙碌帧.权重 < 0.02, '思考阶段没有收起待机整体摆动')
        assert.ok(忙碌帧.头发倍率 < 1.02, '忙碌阶段没有撤回额外的待机头发倍率')
        收尾(0, `✓ Live2D 头发与身体分层摆动已生效且容器固定：${JSON.stringify({ 第一帧, 第二帧, 忙碌帧 })}`)
        return
      }
      窗口.webContents.send('live2d-表现', {
        版本: 1, 类型: '开心', 阶段: '完成', 强度: 0.9,
        温度: 0.9, 活跃度: 0.75, 表情: '点头', 表情来源: '验收',
      })
      窗口.webContents.send('live2d-说话', true)
      if (验快聊) {
        await 窗口.webContents.executeJavaScript(`document.getElementById('live2d').dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true, button: 0, buttons: 0, clientX: 180, clientY: 260,
        }))`)
        await new Promise((完成) => setTimeout(完成, 80))
        assert.equal(收到快聊, 1, '双击 Live2D 没有送出快聊切换事件')
        收尾(0, '✓ 双击 Live2D 已送出快聊切换事件')
        return
      }
      if (验口型) {
        窗口.webContents.send('live2d-口型', 0)
        await new Promise((完成) => setTimeout(完成, 180))
        const 静音 = await 窗口.webContents.executeJavaScript('window.__live2d口型')
        窗口.webContents.send('live2d-口型', 0.35)
        await new Promise((完成) => setTimeout(完成, 180))
        const 弱声 = await 窗口.webContents.executeJavaScript('window.__live2d口型')
        窗口.webContents.send('live2d-口型', 0.9)
        await new Promise((完成) => setTimeout(完成, 180))
        const 强声 = await 窗口.webContents.executeJavaScript('window.__live2d口型')
        窗口.webContents.send('live2d-说话', false)
        await new Promise((完成) => setTimeout(完成, 80))
        const 停止 = await 窗口.webContents.executeJavaScript('window.__live2d口型')
        assert.ok(静音.实际 < 0.02, `静音时嘴没有闭合：${JSON.stringify(静音)}`)
        assert.ok(弱声.实际 > 0.25 && 弱声.实际 < 0.45, `弱声口型不在预期范围：${JSON.stringify(弱声)}`)
        assert.ok(强声.实际 > 0.78, `强声时开口不够明显：${JSON.stringify(强声)}`)
        assert.ok(强声.实际 > 弱声.实际 + 0.35, '口型没有随实际强度明显增大')
        assert.equal(停止.实际, 0, '停止说话后没有立即闭嘴')
        收尾(0, `✓ Live2D 真口型随语音强度开合：${JSON.stringify({ 静音, 弱声, 强声, 停止 })}`)
        return
      }
      if (验手势) {
        await 窗口.webContents.executeJavaScript(`(() => {
          const 画布 = document.getElementById('live2d')
          画布.setPointerCapture = () => {}
          const 发 = (type, x, y, buttons) => 画布.dispatchEvent(new PointerEvent(type, {
            bubbles: true, pointerId: 77, pointerType: 'mouse', button: 2, buttons,
            screenX: x, screenY: y, clientX: 180, clientY: 260,
          }))
          发('pointerdown', 1200, 700, 2)
          发('pointermove', 1280, 650, 2)
          发('pointerup', 1280, 650, 0)
        })()`)
        await new Promise((完成) => setTimeout(完成, 80))
        assert.deepEqual(收到手势.map((一) => [一.阶段, 一.类型]), [
          ['开始', '缩放'], ['移动', '缩放'], ['结束', '缩放'],
        ])
        收尾(0, '✓ Live2D 右键缩放手势已完整送达主进程')
        return
      }
      await new Promise((完成) => setTimeout(完成, 1000))
      await 窗口.webContents.executeJavaScript("document.getElementById('加载状态').style.display = 'none'")
      const 图 = await 截图重试()
      if (验边缘) {
        const { width, height } = 图.getSize()
        const 像素 = 图.toBitmap()
        const 行平均Alpha = (比例) => {
          const y = Math.max(0, Math.min(height - 1, Math.round(height * 比例)))
          let 总和 = 0; let 数量 = 0
          for (let x = 0; x < width; x++) {
            const alpha = 像素[(y * width + x) * 4 + 3]
            if (alpha > 0) { 总和 += alpha; 数量++ }
          }
          return 数量 ? 总和 / 数量 : 0
        }
        const 上段 = 行平均Alpha(0.84)
        const 中段 = 行平均Alpha(0.92)
        const 下段 = 行平均Alpha(0.98)
        assert.ok(上段 > 220, '羽化开始前的模型透明度异常')
        assert.ok(中段 < 上段 * 0.9, '底部中段没有开始渐隐')
        assert.ok(下段 < 中段 * 0.72, '底部末端没有继续渐隐')
        收尾(0, `✓ Live2D 底部透明羽化已生效：${JSON.stringify({ 上段, 中段, 下段 })}`)
        return
      }
      fs.writeFileSync(输出, 图.toPNG())
      收尾(0, '✓ Live2D v13 已渲染：' + 输出)
    } catch (错误) {
      收尾(1, '✗ 截图失败：' + 错误.stack)
    }
  })

  窗口 = new BrowserWindow({
    width: 430, height: 530, show: true, transparent: true, frame: false,
    webPreferences: {
      preload: path.join(根, 'preload-live2d.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  窗口.webContents.on('console-message', (_事件, 级别, 内容) => {
    if (级别 >= 2) console.log('[Live2D 页面] ' + 内容)
  })
  窗口.loadFile(path.join(根, 'renderer', 'live2d.html'))
  setTimeout(() => 收尾(1, '✗ 20 秒内没有收到 Live2D 准备完成'), 20000)
})
