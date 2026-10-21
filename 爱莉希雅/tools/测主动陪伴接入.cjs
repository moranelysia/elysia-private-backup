/** P1-B 静态接线与隔离设置持久化；不启动 Electron、不碰真实设置。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 创建设置存储 } = require('../main/settings.cjs')

let 数量 = 0
function 检查(说明, 条件) { assert.ok(条件, 说明); 数量++; console.log('✓ ' + 说明) }
function 含(正文, 片段) { return 正文.includes(片段) }

function main() {
  const 根 = path.resolve(__dirname, '..')
  const main = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(根, 'preload.js'), 'utf8')
  const chat = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
  const html = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
  const css = fs.readFileSync(path.join(根, 'renderer', 'style.css'), 'utf8')

  检查('主进程创建并启动主动陪伴调度器', 含(main, '主动陪伴.创建调度器') && 含(main, '准备主动陪伴()'))
  检查('P1-C 到期回调接受限主动生成入口', 含(main, '到期: 尝试主动陪伴'))
  检查('主进程提供读取与保存设置 IPC', 含(main, "ipcMain.handle('主动陪伴设置'") && 含(main, "ipcMain.handle('保存主动陪伴设置'"))
  检查('主进程接收活动与有限界面状态', 含(main, "ipcMain.on('主动陪伴活动'") && 含(main, "ipcMain.on('主动陪伴界面状态'"))
  检查('用户回来会取消尚未交付的主动生成', 含(main, '取消主动陪伴生成()') && 含(main, '控制器.abort()'))
  检查('主动消息带来源写入正式聊天', 含(main, "来源: '主动陪伴'") && 含(main, "记忆.存聊天('assistant'"))
  检查('近期主动消息经过本地相似度去重', 含(main, '主动陪伴去重.判断重复') && 含(main, "一.来源 === '主动陪伴'"))
  检查('最近生成状态通过有限事件显示', 含(main, "webContents.send('主动陪伴状态变了'") && 含(preload, '主动陪伴状态变了:') && 含(chat, '最近：'))
  检查('主动消息落盘前先取得旧内存历史，避免上下文重复', main.indexOf('const 内存历史 =') < main.indexOf("记忆.存聊天('assistant'"))
  检查('主动消息不进入 TTS', !/尝试主动陪伴[\s\S]{0,2600}(TTS|流式朗读|合成语音)/.test(main))
  检查('切换与新建会话会重置空闲计时', (main.match(/主动陪伴调度\.用户活动\(\)/g) || []).length >= 4)
  检查('preload 只复制固定设置字段', 含(preload, '保存主动陪伴设置:') && 含(preload, '每日上限: Number(值.每日上限)'))
  检查('preload 活动状态只含布尔字段', 含(preload, '报告主动陪伴活动:') && 含(preload, '正在录音: !!值.正在录音'))
  for (const id of ['主动陪伴开启', '陪伴最短', '陪伴最长', '安静时段开启', '安静开始', '安静结束', '陪伴每日上限', '保存主动陪伴', '测试主动陪伴', '主动陪伴状态']) {
    检查(`设置页包含 ${id}`, 含(html, `id="${id}"`))
  }
  检查('界面加载和保存主动陪伴设置', 含(chat, '载入主动陪伴设置') && 含(chat, '保存主动陪伴设置'))
  检查('界面显示主动陪伴来源标记', 含(chat, "来源 === '主动陪伴'") && 含(css, '.主动陪伴标记'))
  检查('点击键盘输入都会上报真实活动', 含(chat, "document.addEventListener('pointerdown'") && 含(chat, "document.addEventListener('keydown'") && 含(chat, "document.addEventListener('input'"))
  检查('模型回复完成没有被登记为用户活动', !/她说完了[\s\S]{0,180}报告陪伴活动/.test(chat))
  检查('陪伴设置使用现有轻量样式', 含(css, '.陪伴设置网格') && 含(css, '.陪伴总开关'))

  const 临时目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-proactive-'))
  try {
    const 文件 = path.join(临时目录, '设置.json')
    const 一次 = 创建设置存储(文件)
    const 配置 = { 开启: true, 最短分钟: 35, 最长分钟: 80, 安静开始: '22:45', 安静结束: '07:30', 每日上限: 2 }
    const 账本 = { 发送日: '2026-10-16', 今日次数: 1, 上次发送: 123456 }
    检查('隔离设置首次保存成功', 一次.写设置({ 主动陪伴: 配置, 主动陪伴账本: 账本 }))
    const 重启后 = 创建设置存储(文件).读设置()
    检查('重启后保留主动陪伴设置', JSON.stringify(重启后.主动陪伴) === JSON.stringify(配置))
    检查('重启后保留每日账本', JSON.stringify(重启后.主动陪伴账本) === JSON.stringify(账本))
  } finally {
    fs.rmSync(临时目录, { recursive: true, force: true })
  }
  console.log(`\n主动陪伴接入：${数量}/${数量} 通过`)
}

main()
