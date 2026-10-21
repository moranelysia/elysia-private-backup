/** 工具调用小字与记录窗口：纯本地测试，不发模型请求。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const 记录 = require(path.join(__dirname, '..', '脑', '工具记录.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(名字, 条件) {
  总数++
  if (条件) { 通过++; console.log('  ✓ ' + 名字) }
  else console.log('  ✗ ' + 名字)
}

const 样本 = 记录.整理([
  { 名字: '读', 参数: '桌面\\课程.txt', 结果: { 好: true, 内容: '第一章\n第二章' } },
  { 工具: { 名字: '跑' }, 参数: 'node test.js', 结果: { 好: false, 说明: '退出码 1' } },
  { 名字: '查', 参数: 'Node.js 最新版本', 结果: {
    好: true, 内容: '找到两个来源，但版本不一致。', 验证状态: '未验证', 目标完成: '部分', 错误类别: '来源冲突',
    来源: ['https://nodejs.org/a', 'https://example.com/b'],
    冲突检查: { 有冲突: true, 冲突们: [{ 说明: '版本候选不一致：24（nodejs.org）；22（example.com）' }] },
  } },
], Date.parse('2026-10-10T10:00:00Z'))

检查('每件工具各有一条记录', 样本.length === 3)
检查('记录名称与参数', 样本[0].名字 === '读' && 样本[0].参数.includes('课程.txt'))
检查('成功和失败分得开', 样本[0].成功 === true && 样本[1].成功 === false)
检查('记录带执行验证目标三层状态', 样本[0].执行状态 === '成功' && 样本[0].验证状态 === '部分验证' && 样本[0].目标完成 === '未知')
检查('失败记录带错误类别', 样本[1].错误类别 === '执行失败')
检查('成功执行但验证冲突保持三层真实状态', 样本[2].成功 && 样本[2].执行状态 === '成功' && 样本[2].验证状态 === '未验证' && 样本[2].目标完成 === '部分')
检查('冲突原因与来源进入短记录', 样本[2].状态说明.includes('版本候选不一致') && 样本[2].来源.length === 2)
检查('结果只取摘要', 样本[0].结果摘要.includes('第一章') && 样本[1].结果摘要 === '退出码 1')
检查('超长结果会截断', 记录.结果摘要({ 好: true, 内容: 'a'.repeat(500) }).length === 360)

const 根 = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(根, 'renderer', 'index.html'), 'utf8')
const js = fs.readFileSync(path.join(根, 'renderer', 'chat.js'), 'utf8')
const main = fs.readFileSync(path.join(根, 'main.js'), 'utf8')
检查('底部有独立工具调用入口', html.includes('id="工具记录入口"'))
检查('有近期调用记录窗口', html.includes('id="工具记录遮罩"') && html.includes('id="工具记录列表"'))
检查('主进程只回传整理后的记录', main.includes('工具记录.整理(结果.用过的工具)'))
检查('界面最多保留 30 条', js.includes('.slice(0, 30)'))
检查('执行中会在小字显示工具名', js.includes("正在调用："))
检查('记录卡同时绘制执行验证目标状态', js.includes("['执行'") && js.includes("['验证'") && js.includes("['目标'"))
检查('材料不足或来源冲突有独立提醒', js.includes('工具记录提醒') && js.includes('一条.状态说明'))
检查('来源详情可展开且使用 textContent', js.includes("document.createElement('details')") && js.includes('行.textContent = 来源'))

console.log(`\n  ${通过} / ${总数} ${通过 === 总数 ? '✓' : '✗'}`)
if (通过 !== 总数) process.exitCode = 1
