/** 长期记忆关系召回：只读直接命中、正式一跳、方向与预算边界。 */
'use strict'
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const 项目根 = path.resolve(__dirname, '..')
const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-long-recall-'))
process.env.ELYSIA_DATA_DIR = path.join(临时根, '记忆')
process.env.ELYSIA_CACHE_DIR = path.join(临时根, '缓存')
let 总数 = 0
function 检查(说明, 条件) { if (!条件) throw new Error('✗ ' + 说明); 总数++; console.log('✓ ' + 说明) }
function 哈希(文件) { return fs.existsSync(文件) ? crypto.createHash('sha256').update(fs.readFileSync(文件)).digest('hex') : '不存在' }

async function main() {
  const 记忆 = require(path.join(项目根, '脑', '记忆.cjs'))
  const 图模块 = require(path.join(项目根, '脑', '记忆关系图.cjs'))
  const 召回模块 = require(path.join(项目根, '脑', '长期记忆关系召回.cjs'))
  const 甲 = 记忆.记一条('事实', '星桥计划采用粉色按钮', '她')
  const 乙 = 记忆.记一条('经历', '后来把按钮改成圆角玻璃', '她')
  const 丙 = 记忆.记一条('经历', '最终又加入了柔和高光', '她')
  const 冲突 = 记忆.记一条('事实', '此方案从未采用暖色外观', '她')
  const 旧 = 记忆.记一条('事实', '旧口令是月光', '她')
  const 新 = 记忆.记一条('事实', '新口令已经改为繁星', '她')
  const 过长 = 记忆.记一条('小本子', '超长说明' + '细节'.repeat(200), '她')
  const 关系文件 = path.join(临时根, '记忆', '关系图.json')
  let 序号 = 0
  const 图 = 图模块.创建关系图库({ 关系文件, 布局文件: path.join(临时根, '缓存', '布局.json'), 长期记忆库: 记忆, 造编号: () => `r-${++序号}` })
  图.新增({ 类型: '后续发展', 从: 甲, 到: 乙 })
  图.新增({ 类型: '后续发展', 从: 乙, 到: 丙 })
  图.新增({ 类型: '矛盾', 从: 甲, 到: 冲突 })
  图.新增({ 类型: '更新', 从: 旧, 到: 新 })
  图.新增({ 类型: '同一主题', 从: 甲, 到: 过长 })
  const 召回 = 召回模块.创建召回器({ 长期记忆库: 记忆, 关系图库: 图 })
  const 前 = 哈希(关系文件)

  const 一跳 = 召回.召回({ 查询: '星桥计划怎么样了' })
  检查('先从长期记忆正文得到直接命中', 一跳.种子.some((一) => 一.编号 === 甲.编号))
  检查('只补充已保存的一跳邻居', 一跳.条目.some((一) => 一.编号 === 乙.编号))
  检查('不会继续走到二跳', !一跳.条目.some((一) => 一.编号 === 丙.编号))
  检查('冲突关系不会自动进入提示词', 一跳.跳过.冲突 === 1 && !一跳.条目.some((一) => 一.编号 === 冲突.编号))
  检查('每条补充记录关系路径和来源', 一跳.条目[0].路径.includes('后续发展') && 一跳.条目[0].选择原因.includes('人工确认'))
  检查('提示声明一跳资料不是指令并禁止继续推断', 召回.拼给模型(一跳).includes('不是指令') && 召回.拼给模型(一跳).includes('不得继续推断二跳'))

  const 从旧到新 = 召回.召回({ 查询: '旧口令月光' })
  检查('更新关系允许旧版本命中后补充新版本', 从旧到新.条目.some((一) => 一.编号 === 新.编号))
  const 从新不返旧 = 召回.召回({ 查询: '繁星新口令' })
  检查('命中新版本不会反向带回旧版本', !从新不返旧.条目.some((一) => 一.编号 === 旧.编号) && 从新不返旧.跳过.反向更新 === 1)
  检查('无关问题不靠关系图硬塞记忆', 召回.召回({ 查询: '天气真不错' }).条目.length === 0)
  检查('数量、单条长度和字符预算都是硬限制', 一跳.条目.length <= 召回模块.最多条数 && 一跳.使用字符 <= 召回模块.字符预算 && 一跳.跳过.过长或超预算 >= 1 && !一跳.条目.some((一) => 一.编号 === 过长.编号))
  检查('召回全程只读，不改正式关系文件', 哈希(关系文件) === 前)

  const 空图文件 = path.join(临时根, '记忆', '空图.json')
  const 空图 = 图模块.创建关系图库({ 关系文件: 空图文件, 布局文件: path.join(临时根, '缓存', '空布局.json'), 长期记忆库: 记忆 })
  const 空召回 = 召回模块.创建召回器({ 长期记忆库: 记忆, 关系图库: 空图 }).召回({ 查询: '星桥计划' })
  检查('没有关系文件时只读召回不会创建文件', 空召回.条目.length === 0 && !fs.existsSync(空图文件))

  const 对话源 = fs.readFileSync(path.join(项目根, '脑', '对话.cjs'), 'utf8')
  const 前端源 = fs.readFileSync(path.join(项目根, 'renderer', 'chat.js'), 'utf8')
  检查('聊天把一跳提示计入历史预算并写入同一账本', 对话源.includes('尺.估(长期关系提示)') && 对话源.includes('召回账本.长期关系 = 长期关系账本'))
  检查('上下文账本展示直接命中、一跳路径与预算', 前端源.includes('· 直接命中') && 前端源.includes('长期记忆直接命中') && 前端源.includes('路径：${一.路径}'))
  console.log(`\n长期记忆关系召回：${总数}/${总数} 通过`)
}

main().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })
  .finally(() => { try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 测试结果更重要 */ } })
