/**
 * 验工作区.cjs —— 这份工作区搭得完不完整（体检，不是测试）
 *
 * 【为什么要有它】
 *   2026-10-09 把工作区从 D 盘搬到了 F 盘。搬完最怕的是"看着都在、其实读不到"：
 *   角色卡是 提示词.cjs 第 92 行**直接** readFileSync + JSON.parse 的，
 *   读不到就没有人格 —— 而这种坏法要等她开口说话才看得出来，太晚了。
 *   所以这份脚本在"人去看"之前，先把该读的东西都读一遍。
 *
 * 【它跟 tools\测*.cjs 的区别】
 *   那些量的是代码行为，要构造夹具、要跑逻辑、要花钱。
 *   这份是体检：只回答"这个工作区立不立得住"，一个字节都不改，也不碰网络。
 *   所以它不叫"测"，不会被"跑全套"带上。
 *
 * 用法: node tools\验工作区.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

let 过了 = 0
let 总数 = 0
function 看(说明, 条件, 细节 = '') {
  总数++
  if (条件) {
    过了++
    console.log(`  ✓ ${说明}`)
  } else {
    console.log(`  ✗ ${说明}${细节 ? '   → ' + 细节 : ''}`)
  }
}

const 脑 = path.join(__dirname, '..', '脑')

console.log('')
console.log('  ════════════════════════════════════════════')
console.log('   工作区体检 —— 这份工作区立得住吗')
console.log('  ════════════════════════════════════════════')
console.log('')

const 配置 = require(path.join(脑, '配置.cjs'))
console.log('  她在：' + 配置.工作区根)
console.log('')

// -------------------------------------------------------------
console.log('  ── 一、路径 ──')

看('项目在 F 盘（不是 D 盘）', 配置.项目根.startsWith('F:'), 配置.项目根)
看('工作区根 = 项目的上一层', 配置.工作区根 === path.resolve(配置.项目根, '..'), 配置.工作区根)
看('角色卡', fs.existsSync(配置.角色卡路径), 配置.角色卡路径)
看('学习区', fs.existsSync(配置.学习区根), 配置.学习区根)
看('运行数据（记忆）', fs.existsSync(配置.数据目录), 配置.数据目录)
看('桌宠目录', fs.existsSync(配置.桌宠目录), 配置.桌宠目录)
// 缓存目录不算失败：它第一次真要写东西的时候才建
console.log('  · 缓存目录：' + 配置.缓存目录 + (fs.existsSync(配置.缓存目录) ? '（在）' : '（还没建，正常）'))

// -------------------------------------------------------------
console.log('')
console.log('  ── 二、人格卡（读不到就没有人格）──')

const 提示词 = require(path.join(脑, '提示词.cjs'))
const 工具表 = require(path.join(脑, '工具表.cjs'))

let 卡片 = null
try {
  卡片 = 提示词.读角色卡()
} catch (错误) {
  /* 下面那格会报出来 */
}
看('读得动角色卡', !!卡片, 卡片 ? '' : '提示词.读角色卡() 抛了错，多半是文件不在或 JSON 坏了')

if (卡片) {
  const 数据 = 卡片.数据 || {}
  const 人称 = String(数据.personality || '')
  看('  里面有 personality', 人称.length > 50, 人称.length + ' 字')
  看('  里面有 scenario', String(数据.scenario || '').length > 0)
  看('  认得出是爱莉希雅', 人称.includes('爱莉希雅') || String(数据.name || '').includes('爱莉'))
}

// -------------------------------------------------------------
console.log('')
console.log('  ── 三、三种模式都拼得出提示词 ──')

let 聊天那段 = ''
for (const 模式 of ['chat', 'work', 'learn']) {
  try {
    const 文本 = 提示词.拼({ 模式 })
    if (模式 === 'chat') 聊天那段 = 文本
    看(`${模式} 模式`, 文本.length > 500, 文本.length + ' 字')
  } catch (错误) {
    看(`${模式} 模式`, false, 错误.message)
  }
}
看('拼出来的话里确实是她', 聊天那段.includes('爱莉希雅'))
// 干活/学习拿全套工具；聊天只拿联网搜索，不能知道文件和命令工具。
try {
  const 干活 = 提示词.拼({ 模式: 'work', 工具说明: 工具表.拼工具说明() })
  const 聊天 = 提示词.拼({ 模式: 'chat', 工具说明: 工具表.拼工具说明({ 只要: ['查', '时间'] }) })
  看('干活模式里带着工具说明', 干活.includes('[写:'), '没找到 [写: 说明')
  看('聊天模式只带联网搜索和时间', 聊天.includes('【查】') && 聊天.includes('【时间】') && !聊天.includes('【读】') && !聊天.includes('【写】') && !聊天.includes('【跑】'))
} catch (错误) {
  看('干活模式里带着工具说明', false, 错误.message)
  看('聊天模式只带联网搜索和时间', false, 错误.message)
}

// -------------------------------------------------------------
console.log('')
console.log('  ── 四、学习区 ──')

看('进度.md', fs.existsSync(path.join(配置.学习区根, '进度.md')))
看('任务.md', fs.existsSync(path.join(配置.学习区根, '任务.md')))
看('材料 / 笔记 / 练习 三个目录', ['材料', '笔记', '练习'].every((n) => fs.existsSync(path.join(配置.学习区根, n))))

try {
  const 学习任务 = require(path.join(脑, '学习任务.cjs'))
  const 任务们 = 学习任务.读()
  看('学习任务真的读得出来', Array.isArray(任务们), 任务们.length + ' 条')
} catch (错误) {
  看('学习任务真的读得出来', false, 错误.message)
}

// -------------------------------------------------------------
console.log('')
console.log('  ── 五、外部依赖（声音 / 桌宠 / 启动器）──')

for (const 名 of ['start-voice-only.cmd', 'run-logged.cjs', 'tts-bridge.cjs', 'voice.json']) {
  看('语音：' + 名, fs.existsSync(path.join(配置.工作区根, 'tools', 'voice', 名)))
}

let 桌宠exe = []
try {
  桌宠exe = fs.readdirSync(配置.桌宠目录).filter((n) => n.toLowerCase().endsWith('.exe'))
} catch {
  /* 目录不在上面那格已经报过了 */
}
看('桌宠目录里有可执行文件', 桌宠exe.length > 0, 桌宠exe.join('、') || '一个 exe 都没有')

for (const 名 of ['start-all.cmd', 'start-all.cjs']) {
  看('启动器：' + 名, fs.existsSync(path.join(配置.工作区根, 名)))
}

// -------------------------------------------------------------
console.log('')
console.log('  ════════════════════════════════════════════')
console.log(`   ${过了} / ${总数}` + (过了 === 总数 ? '   ✓ 这份工作区立得住' : '   ✗ 有不对的'))
console.log('  ════════════════════════════════════════════')
console.log('')
process.exit(过了 === 总数 ? 0 : 1)
