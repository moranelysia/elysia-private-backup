/** 表达反馈静态接线检查：确保它是人工评测旁路，不进入记忆和模型。 */
'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let 数量 = 0
function 检查(说明, 条件) { assert.ok(条件, 说明); 数量++; console.log('✓ ' + 说明) }
function 读(...段) { return fs.readFileSync(path.join(__dirname, '..', ...段), 'utf8') }

const main = 读('main.js')
const preload = 读('preload.js')
const chat = 读('renderer', 'chat.js')
const html = 读('renderer', 'index.html')
const css = 读('renderer', 'style.css')
const 对话 = 读('脑', '对话.cjs')
const 提示词 = 读('脑', '提示词.cjs')

检查('反馈文件位于缓存目录而非记忆目录', main.includes("path.join(配置.缓存目录, '表达反馈.json')"))
检查('查询和保存都先确认聊天窗口来源', main.includes("ipcMain.handle('问表达反馈'") && main.includes("ipcMain.handle('保存表达反馈'"))
检查('只读列表由独立 IPC 提供', main.includes("ipcMain.handle('列出表达反馈'") && preload.includes('列出表达反馈:'))
检查('临时对话明确拒绝写入评测集', main.includes("if (当前是临时对话()) return { 好: false, 说明: '临时对话不会写入表达评测集' }"))
检查('主进程只接受已经落盘的 assistant 原文', main.includes("一.角色 === 'assistant'") && main.includes('这条回复还没有写入当前对话'))
检查('preload 只放行固定五类标签', ['讨好腔', '套路句式', '空洞', '莫名其妙', '不像爱莉希雅'].every((一) => preload.includes(`'${一}'`)))
检查('renderer 提供轻量反馈按钮和标签菜单', chat.includes("反馈按钮.textContent = '◇'") && chat.includes("菜单.className = '表达反馈菜单'"))
检查('五类标签全部可在回复旁选择', ['讨好腔', '套路句式', '空洞', '莫名其妙', '不像爱莉希雅'].every((一) => chat.includes(`'${一}'`)))
检查('标签可撤销并会把空集合交回主进程', chat.includes('已选.delete(标签)') && chat.includes('保存表达反馈(当前正文, [...已选])'))
检查('样式默认隐藏按钮并让已标记状态可见', css.includes('.表达反馈按钮.已标记') && css.includes('.表达反馈菜单[hidden]'))
检查('设置页提供隐藏的表达反馈入口', html.includes('id="查看表达反馈"') && html.includes('id="表达反馈遮罩"'))
检查('查看页支持五类标签筛选', html.includes('data-表达标签="不像爱莉希雅"') && chat.includes('当前表达标签'))
检查('查看页只渲染文本节点而不执行样本 HTML', chat.includes("正文.textContent = 条.内容 || ''") && !chat.includes('表达反馈正文.innerHTML'))
检查('查看页明确保持只读', chat.includes('当前只读') && !html.includes('删除表达反馈'))
检查('反馈没有拼入对话模型或人格提示词', !对话.includes('表达反馈') && !提示词.includes('表达反馈'))

console.log(`\n表达反馈接入：${数量}/${数量} 通过`)
