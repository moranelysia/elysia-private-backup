/**
 * 导出人格.cjs —— 把角色卡里的"她"导成一份纯文本，方便看
 *
 * 角色的全部内容都在生产工作区 F:\elysia\elysia.cosplay.v2.json 里
 * （那是 DSH 用的格式，一层层套着，直接看很费眼）。
 * 这个脚本只做一件事：把里面跟"她怎么说话"有关的那几段抽出来，
 * 排成一份能连着读的文本，写到 脑\人格\从角色卡导出.txt。
 *
 * 【为什么要"导出"而不是"换个地方存一份"】
 *   存两份就会有两份不一样的她。所以程序运行时**直接读那个 json**，
 *   这个导出的 txt 只是给人看的——你想改她说话的样子，
 *   还是改 scripts\add-card-rule.cjs 那条路，改完重新导出看效果。
 *
 * 用法: node tools\导出人格.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 角色卡 = path.resolve(__dirname, '..', '..', 'elysia.cosplay.v2.json')
const 输出 = path.resolve(__dirname, '..', '脑', '人格', '从角色卡导出.txt')

const 卡片 = JSON.parse(fs.readFileSync(角色卡, 'utf8'))
const 数据 = 卡片.data
const 扩展 = (数据.extensions && 数据.extensions.dshCosplay) || {}

/** 按顺序把这些段落拼成一份能读的文本 */
const 段落 = [
  ['名字', 数据.name],
  ['一句话', 数据.description],
  ['她是谁', 数据.personality],
  ['场景', 数据.scenario],
  ['她说的第一句话', 数据.first_mes],
  ['她怎么说话（核心）', 数据.system_prompt],
  ['【守则】', 扩展.rules],
  ['【语调与节奏】', 扩展.style],
  ['【她在场的样子】', 扩展.behavior],
  ['【开头】', 扩展.opening],
  ['【收尾提醒】', 数据.post_history_instructions],
  ['【挂在后面的话】', 扩展.suffix],
  ['【对话例子】', 数据.mes_example],
]

let 文本 = ''
for (const [标题, 内容] of 段落) {
  if (!内容) continue
  文本 += `\n${'='.repeat(60)}\n${标题}\n${'='.repeat(60)}\n\n${内容}\n`
}

fs.mkdirSync(path.dirname(输出), { recursive: true })
fs.writeFileSync(输出, 文本, 'utf8')

console.log('角色卡: ' + 角色卡)
console.log('导出到: ' + 输出)
console.log('字数: ' + 文本.length)
console.log('')
for (const [标题, 内容] of 段落) {
  if (!内容) continue
  console.log(`  ${标题.padEnd(22, ' ')} ${String(内容.length).padStart(6)} 字`)
}
