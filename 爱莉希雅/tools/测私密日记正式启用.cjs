/** M-36B：把临时目录伪装成“配置的正式目录”，用子进程验证双重许可与跨重启账本。 */
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

function 安全来源() {
  return [
    { 编号: '聊天:u1', 类型: '聊天', 时间: '2026-10-14 20:00', 标题: '他说', 摘要: '他坦白最近遇到了一些难处。' },
    { 编号: '聊天:u2', 类型: '聊天', 时间: '2026-10-14 20:01', 标题: '她说', 摘要: '她没有追问，只安静陪着。' },
  ]
}

function 有效结果() {
  return {
    触发: true,
    标题: '没有说出口的靠近',
    微妙情绪: '想靠近，却又怕这份关心变成负担',
    正文: '他把难处告诉我时，我忽然有点想靠近，却又怕这份关心变成负担。于是只把声音放轻了一点。',
    来源: ['聊天:u1', '聊天:u2'],
  }
}

async function 子进程场景() {
  const 场景 = process.argv[3]
  const 数据目录 = path.resolve(process.argv[4])
  const { 创建私密日记生成器 } = require('../脑/私密日记.cjs')
  let 模型次数 = 0
  let 取源次数 = 0
  const 时刻 = 场景 === '等待' ? new Date(2026, 9, 15, 9, 1)
    : 场景 === '恢复' ? new Date(2026, 9, 15, 9, 6)
      : new Date(2026, 9, 15, 9, 0)

  if (场景 === '越界目录') {
    let 错误 = ''
    try { 创建私密日记生成器({ 数据目录: path.join(数据目录, '别处'), 允许正式写入: true }) } catch (一) { 错误 = 一.message }
    process.stdout.write(JSON.stringify({ 错误 }))
    return
  }

  if (场景 === '调度默认链') {
    const { 创建私密日记调度 } = require('../脑/私密日记调度.cjs')
    const 调度 = 创建私密日记调度({ 已启用: true, 数据目录, 现在: () => new Date(2026, 9, 15, 9, 0), 取连接: () => ({}) })
    const 结果 = await 调度.唤醒()
    process.stdout.write(JSON.stringify({ 结果 }))
    return
  }

  let 系统
  let 构造错误 = ''
  try {
    系统 = 创建私密日记生成器({
      数据目录,
      允许正式写入: true,
      现在: () => 时刻,
      取来源: async () => { 取源次数++; return 安全来源() },
      生成: async () => {
        模型次数++
        if (场景 === '失败') throw new Error('F:\\secret\\model-response.txt')
        if (场景 === '零触发' || 场景 === '损坏索引') return { 触发: false }
        return 有效结果()
      },
    })
  } catch (错误) { 构造错误 = 错误.message }
  if (!系统) {
    process.stdout.write(JSON.stringify({ 构造错误, 模型次数, 取源次数 }))
    return
  }

  let 结果 = null
  let 错误 = ''
  try { 结果 = await 系统.整理一天({ 日期: new Date(2026, 9, 14, 12), 连接: { 钥匙: 'fake' } }) } catch (一) { 错误 = 一.message }
  process.stdout.write(JSON.stringify({ 结果, 错误, 模型次数, 取源次数, 日记路径: 系统.日记路径('2026-10-14'), 索引路径: 系统.评估索引路径 }))
}

if (process.argv[2] === '子进程') {
  子进程场景().catch((错误) => { process.stderr.write(String(错误.stack || 错误)); process.exitCode = 1 })
} else {
  const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-private-enable-'))
  let 总数 = 0
  let 通过 = 0
  function 检查(说明, 条件) {
    总数++
    if (!条件) throw new Error('✗ ' + 说明)
    通过++
    console.log('✓ ' + 说明)
  }
  function 跑(场景, 数据目录, 开关 = '1') {
    const 进程 = spawnSync(process.execPath, [__filename, '子进程', 场景, 数据目录], {
      encoding: 'utf8',
      env: {
        ...process.env,
        ELYSIA_DATA_DIR: 数据目录,
        ELYSIA_PRIVATE_DIARY_ENABLED: 开关,
      },
    })
    if (进程.status !== 0) throw new Error(`${场景} 子进程失败：${进程.stderr || 进程.stdout}`)
    return JSON.parse(进程.stdout)
  }
  function 读JSON(文件) { return JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')) }
  function 哈希(文件) { return crypto.createHash('sha256').update(fs.readFileSync(文件)).digest('hex') }

  ;(async () => {
    try {
      const 关闭目录 = path.join(临时根, '开关关闭')
      const 关闭 = 跑('零触发', 关闭目录, '0')
      检查('调用参数不能越过关闭的生产开关', 关闭.构造错误.includes('生产开关关闭') && !fs.existsSync(关闭目录))

      const 越界目录 = path.join(临时根, '越界')
      const 越界 = 跑('越界目录', 越界目录)
      检查('正式写入许可只能用于配置的数据目录', 越界.错误.includes('只能用于配置的数据目录') && !fs.existsSync(越界目录))

      const 调度目录 = path.join(临时根, '调度默认链')
      const 调度 = 跑('调度默认链', 调度目录)
      检查('调度默认链只有双重开关通过后才能取得正式许可', 调度.结果.好 && 调度.结果.状态 === '无可用同日对话')
      检查('默认链没有真实来源时不会调用网络或生成日记正文', fs.existsSync(path.join(调度目录, '日记', '私密', '评估索引.json')) && !fs.existsSync(path.join(调度目录, '日记', '私密', '2026', '2026-10-14.json')))

      const 零目录 = path.join(临时根, '零触发')
      const 零一 = 跑('零触发', 零目录)
      const 零二 = 跑('零触发', 零目录)
      检查('无微妙波动写入日期终态但不创建日记', 零一.结果.状态 === '没有微妙情绪波动' && 零一.模型次数 === 1 && !fs.existsSync(零一.日记路径))
      检查('重启后读取终态且不再次读取来源或调用模型', 零二.结果.状态 === '没有微妙情绪波动' && 零二.模型次数 === 0 && 零二.取源次数 === 0)
      const 零索引 = 读JSON(零一.索引路径)
      检查('评估账本只含日期状态和退避元数据', 零索引.任务.length === 1 && Object.keys(零索引.任务[0]).sort().join(',') === ['下次尝试', '周期', '尝试次数', '更新于', '状态'].sort().join(',') && !JSON.stringify(零索引).includes('坦白'))

      const 写入目录 = path.join(临时根, '正常写入')
      const 写一 = 跑('写入', 写入目录)
      const 写二 = 跑('写入', 写入目录)
      检查('合格结果写入一篇 private 日记并登记终态', 写一.结果.写入 && 写一.结果.状态 === '已生成' && fs.existsSync(写一.日记路径) && 读JSON(写一.日记路径).可见性 === 'private')
      检查('跨重启不会覆盖已生成日记或再次调用模型', 写二.结果.状态 === '已生成' && 写二.模型次数 === 0 && 写二.取源次数 === 0)

      const 丢失目录 = path.join(临时根, '文件丢失')
      const 丢失初次 = 跑('写入', 丢失目录)
      fs.rmSync(丢失初次.日记路径)
      const 丢失复查 = 跑('写入', 丢失目录)
      检查('评估称已生成但正文文件丢失时不会静默伪报完成', 丢失复查.错误.includes('终态与文件不一致') && 丢失复查.模型次数 === 0 && 读JSON(丢失复查.索引路径).任务[0].状态 === '失败待重试')

      const { 创建私密日记库 } = require('../脑/私密日记.cjs')
      const 库 = 创建私密日记库({ 数据目录: 写入目录 })
      const 卡 = 库.给本机界面().列表[0]
      库.删除日记({ 编号: 卡.编号, 版本标记: 卡.版本标记 })
      const 删除后 = 跑('写入', 写入目录)
      检查('删除墓碑优先于旧评估终态并阻止跨重启重建', 删除后.结果.状态 === '已删除' && 删除后.模型次数 === 0 && !fs.existsSync(删除后.日记路径))
      检查('删除后的评估账本不保存被删正文', 读JSON(删除后.索引路径).任务[0].状态 === '已删除' && !JSON.stringify(读JSON(删除后.索引路径)).includes('靠近'))

      const 失败目录 = path.join(临时根, '失败恢复')
      const 失败 = 跑('失败', 失败目录)
      const 失败索引 = 读JSON(失败.索引路径)
      检查('模型失败写入有限退避状态且不落日记', 失败.错误.includes('model-response') && 失败索引.任务[0].状态 === '失败待重试' && 失败索引.任务[0].尝试次数 === 1 && !fs.existsSync(失败.日记路径))
      检查('失败账本不保存原始异常、路径、来源或模型响应', !JSON.stringify(失败索引).includes('secret') && !JSON.stringify(失败索引).includes('坦白') && !JSON.stringify(失败索引).includes('model-response'))
      const 等待 = 跑('等待', 失败目录)
      检查('退避到期前跨重启也不会读取来源或调用模型', 等待.结果.状态 === '等待重试' && 等待.模型次数 === 0 && 等待.取源次数 === 0)
      const 恢复 = 跑('恢复', 失败目录)
      检查('退避到期后可以恢复并写入且清空下次尝试', 恢复.结果.写入 && 恢复.模型次数 === 1 && 读JSON(恢复.索引路径).任务[0].状态 === '已生成' && 读JSON(恢复.索引路径).任务[0].下次尝试 === '')

      const 损坏目录 = path.join(临时根, '损坏索引')
      const 损坏文件 = path.join(损坏目录, '日记', '私密', '评估索引.json')
      fs.mkdirSync(path.dirname(损坏文件), { recursive: true })
      fs.writeFileSync(损坏文件, '{broken', 'utf8')
      const 损坏前 = 哈希(损坏文件)
      const 损坏 = 跑('损坏索引', 损坏目录)
      检查('评估索引损坏时失败关闭且不调用模型', 损坏.错误.includes('评估索引读不动') && 损坏.模型次数 === 0 && 损坏.取源次数 === 0)
      检查('损坏索引不会被空账本覆盖也不会创建日记', 哈希(损坏文件) === 损坏前 && !fs.existsSync(损坏.日记路径))

      const 正式路径 = path.resolve(__dirname, '..', '记忆', '日记', '私密')
      检查('全部正式许可测试都局限在系统临时目录', !path.resolve(临时根).toLowerCase().startsWith(path.resolve(__dirname, '..').toLowerCase()) && !fs.existsSync(正式路径))

      console.log(`\n私密日记正式启用隔离验证：${通过}/${总数} 通过`)
    } finally {
      try { fs.rmSync(临时根, { recursive: true, force: true }) } catch { /* 保留测试结果 */ }
    }
  })().catch((错误) => { console.error(错误.stack || 错误.message); process.exitCode = 1 })
}

