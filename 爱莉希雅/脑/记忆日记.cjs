/**
 * 记忆日记.cjs —— 把已经发生过的材料整理成可回看的日记。
 *
 * 日记是本地档案，不会进入聊天提示词，也不替代长期记忆。模型只能在程序
 * 给出的来源里归纳；每个非空模块都必须留下来源编号。后台失败只进入重试队列。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const 配置 = require('./配置.cjs')
const 记忆叙述 = require('./记忆叙述.cjs')
const { 检查任务 } = require('./任务控制.cjs')

const 模块名们 = Object.freeze(['回顾', '学习', '工作', '陪伴片段', '未完事项'])
const 日记可见性们 = Object.freeze(['shared', 'private'])
const 格式版本 = 1

function 是对象(值) { return !!值 && typeof 值 === 'object' && !Array.isArray(值) }
function 补二(数) { return String(数).padStart(2, '0') }
function 本地日期字(日期) { return `${日期.getFullYear()}-${补二(日期.getMonth() + 1)}-${补二(日期.getDate())}` }
function 当地零点(日期) { return new Date(日期.getFullYear(), 日期.getMonth(), 日期.getDate()) }
function 加天(日期, 天数) { const 结果 = new Date(日期); 结果.setDate(结果.getDate() + 天数); return 结果 }
function 正常日期(值, 名字 = '时间') {
  const 日期 = 值 instanceof Date ? new Date(值) : new Date(值)
  if (!Number.isFinite(日期.getTime())) throw new Error(名字 + '无效')
  return 日期
}
function 解析本地时间(值) {
  const 文本 = String(值 || '').trim()
  const 匹配 = 文本.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (匹配) return new Date(+匹配[1], +匹配[2] - 1, +匹配[3], +(匹配[4] || 0), +(匹配[5] || 0), +(匹配[6] || 0))
  return new Date(文本)
}
function 在期间(值, 开始, 结束) {
  const 日期 = 解析本地时间(值)
  return Number.isFinite(日期.getTime()) && 日期 >= 开始 && 日期 < 结束
}
function 短哈希(文字) { return crypto.createHash('sha256').update(String(文字)).digest('hex').slice(0, 16) }
function 截(值, 最长) { return String(值 == null ? '' : 值).trim().replace(/\s+/g, ' ').slice(0, 最长) }
function 正文文本(值, 最长 = 4000) { return String(值 == null ? '' : 值).replace(/\r\n?/g, '\n').trim().slice(0, 最长) }
function 导出安全文本(值) {
  return String(值 == null ? '' : 值)
    .replace(/\b[A-Za-z]:[\\/][^\s<>"|?*]+/g, '[本机路径已省略]')
    .replace(/\\\\[^\s\\/]+[\\/][^\s<>"|?*]+/g, '[网络路径已省略]')
}

/**
 * 旧日记没有可见性字段时按 shared 只读兼容；显式但非法的值必须拒绝，
 * 不能因为拼写错误把本应私密的内容降级成共享内容。
 */
function 规范日记可见性(值) {
  if (值 === undefined) return 'shared'
  const 可见性 = String(值).trim()
  if (!日记可见性们.includes(可见性)) throw new Error('日记可见性无效')
  return 可见性
}

function 规范日记记录(值) {
  if (!是对象(值)) throw new Error('日记记录无效')
  return { ...值, 可见性: 规范日记可见性(值.可见性) }
}

function 面向她的日记(日记) {
  return {
    ...日记,
    标题: 记忆叙述.整理日记正文(日记.标题),
    模块: (Array.isArray(日记.模块) ? 日记.模块 : []).map((一) => ({
      ...一,
      正文: 记忆叙述.整理日记正文(一 && 一.正文),
    })),
    来源: (Array.isArray(日记.来源) ? 日记.来源 : []).map((一) => ({
      ...一,
      标题: 记忆叙述.整理正文(一 && 一.标题),
      摘要: 记忆叙述.整理正文(一 && 一.摘要),
    })),
  }
}

/** 所有默认界面、导出和将来的外发渠道都必须先经过这个共享投影。 */
function 共享日记投影(值) {
  const 日记 = 规范日记记录(值)
  return 日记.可见性 === 'shared' ? 面向她的日记(日记) : null
}

/** ISO 周：周一到下周一。 */
function 周期间(日期) {
  const 当天 = 当地零点(正常日期(日期))
  const 星期 = 当天.getDay() || 7
  const 开始 = 加天(当天, 1 - 星期)
  const 结束 = 加天(开始, 7)
  const 周四 = 加天(开始, 3)
  const 年初 = new Date(周四.getFullYear(), 0, 1)
  const 周号 = Math.ceil((((周四 - 年初) / 86400000) + 年初.getDay() + 1) / 7)
  return { 开始, 结束, 周期: `${周四.getFullYear()}-W${补二(周号)}` }
}

function 日期间(日期) {
  const 开始 = 当地零点(正常日期(日期))
  return { 开始, 结束: 加天(开始, 1), 周期: 本地日期字(开始) }
}

function 默认索引() {
  return { 格式版本, 最后调度日期: '', 任务: [] }
}

function 创建日记系统(选项 = {}) {
  const 数据目录 = path.resolve(选项.数据目录 || 配置.数据目录)
  const 日记根 = path.join(数据目录, '日记')
  const 索引文件 = path.join(日记根, '索引.json')
  const 取现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date()
  const 取来源 = typeof 选项.取来源 === 'function' ? 选项.取来源 : (期间) => 默认取来源(期间, 数据目录)
  const 生成 = typeof 选项.生成 === 'function' ? 选项.生成 : 生成日记
  let 正在运行 = false
  let 再跑一次 = null

  function 读索引() {
    try {
      const 原文 = fs.readFileSync(索引文件, 'utf8').replace(/^\uFEFF/, '').trim()
      if (!原文) throw new Error('文件为空')
      const 值 = JSON.parse(原文)
      if (!是对象(值) || 值.格式版本 !== 格式版本 || !Array.isArray(值.任务)) throw new Error('结构不符合当前版本')
      return 值
    } catch (错误) {
      if (错误.code === 'ENOENT') return 默认索引()
      throw new Error('日记索引读不动，已停止写入：' + 错误.message)
    }
  }

  function 原子写(文件, 数据) {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 临时 = 文件 + `.tmp-${process.pid}-${Date.now()}`
    try {
      fs.writeFileSync(临时, JSON.stringify(数据, null, 2), 'utf8')
      fs.renameSync(临时, 文件)
    } catch (错误) {
      try { fs.rmSync(临时, { force: true }) } catch { /* 保留原错误 */ }
      throw 错误
    }
  }

  function 写索引(索引) { 原子写(索引文件, 索引) }
  function 日记路径(类型, 周期) {
    const 年 = String(周期).slice(0, 4)
    return path.join(日记根, 类型 === '日' ? '日' : '周', 年, `${周期}.json`)
  }

  function 读日记文件(任务) {
    const 文件 = 日记路径(任务.类型, 任务.周期)
    const 原文 = fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')
    const 值 = 规范日记记录(JSON.parse(原文))
    if (String(值.编号 || '') !== String(任务.编号)) throw new Error('文件与索引不一致')
    return { 文件, 原文, 值 }
  }

  function 找可改日记(编号, 版本标记 = '') {
    const 安全编号 = 截(编号, 160)
    if (!安全编号 || !/^[日周]:[0-9W-]+$/.test(安全编号)) throw new Error('日记编号无效')
    const 索引 = 读索引()
    const 任务 = 索引.任务.find((一) => 一 && 一.编号 === 安全编号)
    if (!任务 || 任务.状态 !== '已完成') throw new Error('这篇日记不存在或还不能修改')
    const { 文件, 原文, 值 } = 读日记文件(任务)
    if (String(值.编号 || '') !== 安全编号) throw new Error('日记文件与索引不一致')
    const 当前版本 = 短哈希(原文)
    if (版本标记 && String(版本标记) !== 当前版本) throw new Error('这篇日记刚刚发生过变化，请刷新后再试')
    return { 索引, 任务, 文件, 值, 当前版本 }
  }

  function 修改日记({ 编号, 版本标记 = '', 标题 = '', 模块 = [] } = {}) {
    const 当前 = 找可改日记(编号, 版本标记)
    if (String(标题 == null ? '' : 标题).trim().length > 120) throw new Error('日记标题不能超过 120 字')
    const 新标题 = 截(标题, 120)
    if (!新标题) throw new Error('日记标题不能为空')
    if (!Array.isArray(模块) || !模块.length || 模块.length > 模块名们.length) throw new Error('日记至少要保留一个模块')
    const 来源编号们 = new Set((Array.isArray(当前.值.来源) ? 当前.值.来源 : []).map((一) => String(一 && 一.编号 || '')).filter(Boolean))
    const 见过 = new Set()
    const 新模块 = 模块.map((一) => {
      const 名字 = String(一 && 一.名字 || '')
      if (String(一 && 一.正文 || '').replace(/\r\n?/g, '\n').trim().length > 4000) throw new Error(`${名字 || '日记'}模块不能超过 4000 字`)
      const 正文 = 正文文本(一 && 一.正文)
      if (!模块名们.includes(名字) || 见过.has(名字)) throw new Error('日记模块无效或重复')
      if (!正文) throw new Error(`${名字}模块不能为空；不需要时可在编辑界面删除该模块`)
      见过.add(名字)
      const 来源 = [...new Set((Array.isArray(一 && 一.来源) ? 一.来源 : []).slice(0, 30).map((编号) => 截(编号, 160)).filter(Boolean))]
      if (!来源.length || 来源.some((编号) => !来源编号们.has(编号))) throw new Error(`${名字}模块的来源链无效`)
      return { 名字, 正文, 来源 }
    })
    const 现在 = 正常日期(取现在()).toISOString()
    const 新值 = { ...当前.值, 标题: 新标题, 模块: 新模块, 修改于: 现在, 用户修改: true }
    原子写(当前.文件, 新值)
    return { 好: true, 编号: 当前.任务.编号, 版本标记: 短哈希(fs.readFileSync(当前.文件, 'utf8')) }
  }

  function 删除日记({ 编号, 版本标记 = '' } = {}) {
    const 当前 = 找可改日记(编号, 版本标记)
    const 临时删除文件 = 当前.文件 + `.delete-${process.pid}-${Date.now()}`
    fs.renameSync(当前.文件, 临时删除文件)
    try {
      当前.任务.状态 = '已删除'
      当前.任务.删除于 = 正常日期(取现在()).toISOString()
      当前.任务.更新于 = 当前.任务.删除于
      当前.任务.错误 = ''
      当前.任务.下次尝试 = ''
      写索引(当前.索引)
      try { fs.rmSync(临时删除文件, { force: true }) } catch { /* 索引已落盘，残留临时文件不影响删除语义 */ }
      return { 好: true, 编号: 当前.任务.编号 }
    } catch (错误) {
      try { if (fs.existsSync(临时删除文件)) fs.renameSync(临时删除文件, 当前.文件) } catch { /* 保留原错误 */ }
      throw 错误
    }
  }

  function Markdown日记(值) {
    const 行 = [`## ${导出安全文本(截(值.标题, 120)) || 截(值.周期, 40) || '未命名日记'}`, '', `- 周期：${截(值.周期, 40) || '未记录'}`, `- 类型：${值.类型 === '周' ? '周记' : '日记'}`, `- 生成于：${截(值.生成于, 40) || '未记录'}`]
    if (值.修改于) 行.push(`- 修改于：${截(值.修改于, 40)}（人工修改）`)
    for (const 模块 of (Array.isArray(值.模块) ? 值.模块 : [])) {
      if (!模块名们.includes(String(模块 && 模块.名字 || '')) || !正文文本(模块 && 模块.正文)) continue
      行.push('', `### ${模块.名字}`, '', 导出安全文本(正文文本(模块.正文)))
      const 表 = new Map((Array.isArray(值.来源) ? 值.来源 : []).map((一) => [String(一 && 一.编号 || ''), 一]))
      const 引用 = (Array.isArray(模块.来源) ? 模块.来源 : []).map((编号) => 表.get(String(编号))).filter(Boolean)
      if (引用.length) {
        行.push('', '#### 来源摘要', '')
        for (const 来源 of 引用) 行.push(`- ${截(来源.类型, 40) || '来源'}${来源.时间 ? ` · ${截(来源.时间, 40)}` : ''}${来源.标题 ? ` · ${导出安全文本(截(来源.标题, 160))}` : ''}：${导出安全文本(截(来源.摘要, 500)) || '未保存摘要'}`)
      }
    }
    return 行.join('\n')
  }

  function 导出Markdown(目标文件) {
    const 目标 = path.resolve(String(目标文件 || ''))
    if (!目标 || path.extname(目标).toLowerCase() !== '.md') throw new Error('请选择 Markdown 文件')
    const 日记们 = []
    let 跳过 = 0
    for (const 任务 of 读索引().任务.filter((一) => 一 && 一.状态 === '已完成').sort((a, b) => String(b.结束).localeCompare(String(a.结束)))) {
      try {
        const 共享日记 = 共享日记投影(读日记文件(任务).值)
        if (!共享日记) continue
        日记们.push(共享日记)
      } catch { 跳过++ }
    }
    const 内容 = ['# 爱莉希雅的记忆日记', '', `导出时间：${正常日期(取现在()).toISOString()}`, '', '> 这里仅包含共享日记的正文与其中保存的来源摘要，不包含私密日记、聊天全文、密钥或本机文件路径。', '']
    for (const 一 of 日记们) 内容.push(Markdown日记(一), '')
    fs.mkdirSync(path.dirname(目标), { recursive: true })
    const 临时 = 目标 + `.tmp-${process.pid}-${Date.now()}`
    try {
      fs.writeFileSync(临时, 内容.join('\n'), 'utf8')
      fs.copyFileSync(临时, 目标)
    } finally {
      try { fs.rmSync(临时, { force: true }) } catch { /* 导出结果更重要 */ }
    }
    return { 好: true, 条数: 日记们.length, 跳过 }
  }

  function 新任务(类型, 期间, 现在) {
    return {
      编号: `${类型}:${期间.周期}`,
      类型,
      周期: 期间.周期,
      开始: 期间.开始.toISOString(),
      结束: 期间.结束.toISOString(),
      文件: path.relative(日记根, 日记路径(类型, 期间.周期)),
      状态: '待处理',
      尝试次数: 0,
      创建于: 现在.toISOString(),
      更新于: 现在.toISOString(),
      下次尝试: '',
      错误: '',
    }
  }

  function 加任务(索引, 类型, 期间, 现在) {
    const 编号 = `${类型}:${期间.周期}`
    if (索引.任务.some((一) => 一 && 一.编号 === 编号)) return false
    const 文件 = 日记路径(类型, 期间.周期)
    if (fs.existsSync(文件)) {
      索引.任务.push({ ...新任务(类型, 期间, 现在), 状态: '已完成', 更新于: 现在.toISOString() })
    } else {
      索引.任务.push(新任务(类型, 期间, 现在))
    }
    return true
  }

  /** 首次只补最近周期；有调度记录后补齐中间漏掉的每一天/自然周。 */
  function 安排(时刻 = 取现在()) {
    const 现在 = 正常日期(时刻)
    const 今天 = 当地零点(现在)
    const 索引 = 读索引()
    let 起点 = 加天(今天, -1)
    if (索引.最后调度日期) {
      const 上次 = 解析本地时间(索引.最后调度日期)
      if (Number.isFinite(上次.getTime())) 起点 = 当地零点(上次)
    }
    // 防止被错误的未来时间拖住，也避免第一次启用追溯整个聊天历史。
    if (起点 >= 今天) 起点 = 加天(今天, -1)
    for (let 日 = new Date(起点); 日 < 今天; 日 = 加天(日, 1)) 加任务(索引, '日', 日期间(日), 现在)

    const 本周 = 周期间(今天)
    const 上周 = 周期间(加天(本周.开始, -1))
    if (!索引.最后调度日期) {
      加任务(索引, '周', 上周, 现在)
    } else {
      let 周 = 周期间(解析本地时间(索引.最后调度日期))
      while (周.结束 <= 本周.开始) {
        加任务(索引, '周', 周, 现在)
        周 = 周期间(周.结束)
      }
    }
    索引.最后调度日期 = 本地日期字(今天)
    写索引(索引)
    return { 好: true, 待处理: 索引.任务.filter((一) => ['待处理', '失败待重试'].includes(一.状态)).length }
  }

  function 可执行(任务, 现在) {
    if (!任务 || !['待处理', '失败待重试', '处理中'].includes(任务.状态)) return false
    if (任务.状态 === '处理中') return true // 上次进程中断留下的任务
    if (!任务.下次尝试) return true
    const 下次 = new Date(任务.下次尝试)
    return !Number.isFinite(下次.getTime()) || 下次 <= 现在
  }

  async function 执行待办(连接 = {}, 最多 = 8) {
    检查任务(连接)
    const 现在 = 正常日期(取现在())
    let 已处理 = 0
    while (已处理 < 最多) {
      检查任务(连接)
      const 索引 = 读索引()
      const 任务 = 索引.任务.find((一) => 可执行(一, 现在))
      if (!任务) break
      任务.状态 = '处理中'
      任务.更新于 = 现在.toISOString()
      写索引(索引)

      try {
        const 期间 = { 类型: 任务.类型, 周期: 任务.周期, 开始: new Date(任务.开始), 结束: new Date(任务.结束) }
        const 来源们 = 规整来源(await 取来源(期间))
        检查任务(连接)
        const 最新 = 读索引()
        const 当前 = 最新.任务.find((一) => 一.编号 === 任务.编号)
        if (!当前) throw new Error('日记任务在执行期间消失')
        当前.尝试次数 = Number(当前.尝试次数 || 0) + 1
        当前.更新于 = 正常日期(取现在()).toISOString()
        当前.错误 = ''
        当前.下次尝试 = ''

        if (!来源们.length) {
          当前.状态 = '无内容'
          写索引(最新)
          已处理++
          continue
        }

        const 原始结果 = await 生成({ 期间, 来源们, ...连接 })
        检查任务(连接)
        const 内容 = 校验生成结果(原始结果, 来源们)
        const 文件 = 日记路径(任务.类型, 任务.周期)
        let 旧 = null
        try { 旧 = JSON.parse(fs.readFileSync(文件, 'utf8').replace(/^\uFEFF/, '')) } catch (错误) { if (错误.code !== 'ENOENT') throw 错误 }
        if (!(旧 && 旧.用户修改 === true)) {
          原子写(文件, {
            格式版本,
            编号: 任务.编号,
            类型: 任务.类型,
            周期: 任务.周期,
            开始: 任务.开始,
            结束: 任务.结束,
            标题: 内容.标题 || (任务.类型 === '日' ? `${任务.周期} 日记` : `${任务.周期} 周记`),
            可见性: 'shared',
            模块: 内容.模块,
            // 保存一小段真实来源快照，J2 展开来源时才能直接核对；不保存整份聊天或文件。
            来源: 来源们.map(({ 编号, 类型, 时间, 标题, 摘要 }) => ({ 编号, 类型, 时间, 标题, 摘要: 截(摘要, 500) })),
            生成于: 当前.更新于,
            修改于: '',
            用户修改: false,
          })
        }
        当前.状态 = '已完成'
        写索引(最新)
      } catch (错误) {
        // 停止后保留此前处理中记录，重启再恢复；不能迟到写失败/重试状态。
        检查任务(连接)
        const 最新 = 读索引()
        const 当前 = 最新.任务.find((一) => 一.编号 === 任务.编号)
        if (当前) {
          当前.尝试次数 = Math.max(Number(当前.尝试次数 || 0), Number(任务.尝试次数 || 0) + 1)
          当前.状态 = '失败待重试'
          当前.错误 = 截(错误.message, 300)
          当前.更新于 = 正常日期(取现在()).toISOString()
          const 等待分钟 = Math.min(360, 5 * (2 ** Math.min(6, 当前.尝试次数 - 1)))
          当前.下次尝试 = new Date(normalizeNow(取现在()).getTime() + 等待分钟 * 60000).toISOString()
          写索引(最新)
        }
      }
      已处理++
    }
    return { 好: true, 已处理, 状态: 读索引() }
  }

  function 唤醒(连接 = {}) {
    try { 安排() } catch (错误) { console.log('⚠ 记忆日记调度失败（不影响启动）：' + 错误.message); return { 已排队: false, 说明: 错误.message } }
    if (正在运行) { 再跑一次 = 连接; return { 已排队: true, 合并到下一轮: true } }
    正在运行 = true
    queueMicrotask(async () => {
      let 当前 = 连接
      while (当前) {
        再跑一次 = null
        try {
          const 结果 = await 执行待办(当前)
          if (结果.已处理) console.log(`  📔 记忆日记后台处理了 ${结果.已处理} 个周期`)
        } catch (错误) {
          console.log('⚠ 记忆日记后台失败（不影响聊天）：' + 错误.message)
        }
        当前 = 再跑一次
      }
      正在运行 = false
    })
    return { 已排队: true, 合并到下一轮: false }
  }

  /** 给界面的时间轴。只返回白名单字段，一篇坏文件不拖垮整个列表。 */
  function 给界面({ 类型 = '', 搜索 = '', 最多 = 200 } = {}) {
    const 选类型 = ['日', '周'].includes(String(类型 || '')) ? String(类型) : ''
    const 关键词 = 截(搜索, 80).toLocaleLowerCase()
    const 限量 = Math.max(1, Math.min(200, Number(最多) || 200))
    const 索引 = 读索引()
    const 全部 = 索引.任务
      .filter((任务) => 任务 && 任务.状态 !== '已删除' && (!选类型 || 任务.类型 === 选类型))
      .map((任务) => {
        const 基础 = {
          编号: 截(任务.编号, 160), 类型: 任务.类型 === '周' ? '周' : '日', 周期: 截(任务.周期, 40),
          开始: 截(任务.开始, 40), 结束: 截(任务.结束, 40), 状态: 截(任务.状态, 20),
          标题: '', 模块: [], 来源: [], 生成于: '', 修改于: '', 用户修改: false, 版本标记: '', 说明: '',
        }
        if (任务.状态 !== '已完成') {
          if (任务.状态 === '无内容') 基础.说明 = '这个周期没有可整理的真实材料。'
          else if (任务.状态 === '失败待重试') 基础.说明 = '上次整理没有完成，后台会按计划重试。'
          else 基础.说明 = '正在等待后台整理。'
          return 基础
        }
        try {
          const { 原文, 值 } = 读日记文件(任务)
          const 共享日记 = 共享日记投影(值)
          if (!共享日记) return null
          基础.标题 = 截(共享日记.标题, 120)
          基础.生成于 = 截(共享日记.生成于, 40)
          基础.修改于 = 截(共享日记.修改于, 40)
          基础.用户修改 = 共享日记.用户修改 === true
          基础.版本标记 = 短哈希(原文)
          基础.模块 = (Array.isArray(共享日记.模块) ? 共享日记.模块 : []).slice(0, 模块名们.length).map((一) => ({
            名字: 模块名们.includes(String(一 && 一.名字 || '')) ? String(一.名字) : '回顾',
            正文: 正文文本(一 && 一.正文, 4000),
            来源: (Array.isArray(一 && 一.来源) ? 一.来源 : []).slice(0, 30).map((编号) => 截(编号, 160)).filter(Boolean),
          })).filter((一) => 一.正文)
          基础.来源 = (Array.isArray(共享日记.来源) ? 共享日记.来源 : []).slice(0, 120).map((一) => ({
            编号: 截(一 && 一.编号, 160), 类型: 截(一 && 一.类型, 40), 时间: 截(一 && 一.时间, 40),
            标题: 截(一 && 一.标题, 160), 摘要: 截(一 && 一.摘要, 500),
          })).filter((一) => 一.编号)
        } catch {
          基础.状态 = '读取失败'
          基础.说明 = '日记文件暂时读不到，索引和其他日记没有被改动。'
        }
        return 基础
      })
      .filter(Boolean)
      .filter((一) => !关键词 || `${一.周期}\n${一.标题}\n${一.状态}\n${一.模块.map((模块) => `${模块.名字} ${模块.正文}`).join('\n')}\n${一.来源.map((来源) => `${来源.类型} ${来源.标题} ${来源.摘要}`).join('\n')}`.toLocaleLowerCase().includes(关键词))
      .sort((a, b) => String(b.结束).localeCompare(String(a.结束)) || String(b.编号).localeCompare(String(a.编号)))
    return { 列表: 全部.slice(0, 限量), 总数: 全部.length, 截断: 全部.length > 限量 }
  }

  return { 日记根, 索引文件, 读索引, 安排, 执行待办, 唤醒, 给界面, 修改日记, 删除日记, 导出Markdown, 状态: () => ({ 正在运行, 还有一轮: !!再跑一次 }), 日记路径 }
}

function normalizeNow(值) { return 正常日期(值) }

function 规整来源(原) {
  const 见过 = new Set()
  const 候选 = (Array.isArray(原) ? 原 : []).map((一) => ({
    编号: 截(一 && 一.编号, 160), 类型: 截(一 && 一.类型, 40), 时间: 截(一 && 一.时间, 40),
    标题: 截(一 && 一.标题, 160), 摘要: 截(一 && 一.摘要, 1200),
  })).filter((一) => 一.编号 && 一.类型 && 一.摘要 && !见过.has(一.编号) && 见过.add(一.编号))
  const 结果 = []
  let 总字数 = 0
  // 日记是概览，不值得把整周的原始聊天全文重新发给模型。数量和总字数都设硬上限。
  for (const 一 of 候选.slice(-160)) {
    const 字数 = 一.编号.length + 一.标题.length + 一.摘要.length
    if (结果.length >= 120 || 总字数 + 字数 > 40000) break
    结果.push(一)
    总字数 += 字数
  }
  return 结果
}

function 默认取来源(期间, 数据目录) {
  const 记忆 = require('./记忆.cjs')
  const 临时记忆 = require('./临时记忆.cjs')
  const 工作索引 = require('./工作索引.cjs')
  const 来源 = []
  for (const 条 of 记忆.全部记录()) {
    if (!条 || 条.角色 === '分隔' || !在期间(条.时间, 期间.开始, 期间.结束)) continue
    const 内容 = 截(条.内容, 800)
    if (!内容) continue
    来源.push({
      编号: `聊天:${短哈希(`${条.对话 || '最早'}|${条.时间}|${条.角色}|${条.内容}`)}`,
      类型: '聊天', 时间: String(条.时间 || ''), 标题: `${条.角色 === 'user' ? '他' : '她'}在对话中说`, 摘要: 内容,
    })
  }
  for (const 条 of 记忆.全部长期记忆()) {
    if (!在期间(条.时间, 期间.开始, 期间.结束)) continue
    来源.push({ 编号: `长期记忆:${条.类别}:${条.编号}`, 类型: '长期记忆', 时间: 条.时间, 标题: 条.类别, 摘要: 截(条.内容, 800) })
  }
  for (const 条 of 临时记忆.查询({ 确认状态: '已确认', 包括归档: true, 限量: 1000 }).列表) {
    const 时间 = 条.更新于 || 条.创建于
    if (!在期间(时间, 期间.开始, 期间.结束)) continue
    来源.push({ 编号: `临时记忆:${条.编号}`, 类型: '已确认临时记忆', 时间, 标题: 条.类别, 摘要: 截(条.内容, 800) })
  }
  for (const 条 of 工作索引.给界面({ 最多: 200 }).列表) {
    if (!在期间(条.完成时间, 期间.开始, 期间.结束)) continue
    来源.push({ 编号: `工作:${条.编号}`, 类型: '工作回执', 时间: 条.完成时间, 标题: `${条.状态} · ${截(条.目标, 80)}`, 摘要: 截(`${条.目标}；${条.结果摘要}`, 1000) })
  }
  try {
    const 学习进度 = require('./学习进度.cjs')
    const 文件 = 学习进度.路径()
    const 状态 = fs.statSync(文件)
    if (状态.isFile() && 状态.mtime >= 期间.开始 && 状态.mtime < 期间.结束) {
      const 内容 = 学习进度.读()
      if (内容 && !内容.includes('还没有记过东西')) 来源.push({ 编号: `学习进度:${短哈希(状态.mtime.toISOString())}`, 类型: '学习进度', 时间: 状态.mtime.toISOString(), 标题: '学习进度更新', 摘要: 截(内容, 1200) })
    }
  } catch { /* 学习文件不存在或读失败时不伪造来源 */ }
  return 来源.sort((a, b) => String(a.时间).localeCompare(String(b.时间)))
}

function 抠JSON(文字) {
  if (是对象(文字)) return 文字
  const 原 = String(文字 || '').trim()
  try { return JSON.parse(原) } catch { /* 再抠对象 */ }
  const 匹配 = 原.match(/\{[\s\S]*\}/)
  if (!匹配) throw new Error('模型没有返回 JSON 对象')
  return JSON.parse(匹配[0])
}

function 校验生成结果(原始, 来源们) {
  const 值 = 抠JSON(原始)
  const 可用编号 = new Set(来源们.map((一) => 一.编号))
  const 见过 = new Set()
  const 模块 = []
  for (const 原模块 of (Array.isArray(值.模块) ? 值.模块 : [])) {
    const 名字 = String(原模块 && 原模块.名字 || '')
    const 正文 = 截(记忆叙述.整理日记正文(原模块 && 原模块.正文), 4000)
    const 引用 = [...new Set((Array.isArray(原模块 && 原模块.来源) ? 原模块.来源 : []).map(String))]
    if (!模块名们.includes(名字) || 见过.has(名字) || !正文) continue
    if (!引用.length || 引用.some((编号) => !可用编号.has(编号))) throw new Error(`日记模块“${名字}”引用了不存在的来源`)
    见过.add(名字)
    模块.push({ 名字, 正文, 来源: 引用.slice(0, 30) })
  }
  if (!模块.length) throw new Error('模型没有生成带有效来源的日记模块')
  return { 标题: 截(记忆叙述.整理日记正文(值.标题), 120), 模块 }
}

async function 生成日记({ 期间, 来源们, 钥匙, 地址 = process.env.ELYSIA_LLM_URL || 'https://api.deepseek.com/v1/chat/completions', 模型 = process.env.ELYSIA_MEMORY_MODEL || process.env.ELYSIA_LLM_MODEL || 'deepseek-chat', fetch函数 = global.fetch, 超时 = 60000, 中止 }) {
  if (!钥匙) throw new Error('没有模型 API Key')
  const 控制器 = new AbortController()
  const 闹钟 = setTimeout(() => 控制器.abort(), 超时)
  try {
    const 回应 = await fetch函数(地址, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 钥匙 },
      body: JSON.stringify({
        model: 模型, stream: false, temperature: 0.2, max_tokens: 1800,
        messages: [
          { role: 'system', content: `你在整理爱莉希雅自己的${期间.类型 === '日' ? '日记' : '周记'}。只能根据给出的来源，不能补充、猜测或虚构。标题和正文必须站在她自己的视角：她称自己为“我”，称眼前的人为“你”，共同经历称“我们”；禁止把两人写成“用户、用户本人、爱莉、爱莉希雅”，也禁止用“他/她”代指两人。第三方人物要使用来源中的姓名。输出 JSON：{"标题":"简短标题","模块":[{"名字":"回顾|学习|工作|陪伴片段|未完事项","正文":"简洁自然的第一人称文字","来源":["来源编号"]}]}。只输出有内容的模块；每个模块必须引用至少一个真实来源编号。` },
          { role: 'user', content: `周期：${期间.周期}\n开始：${期间.开始.toISOString()}\n结束：${期间.结束.toISOString()}\n来源：\n${JSON.stringify(来源们)}` },
        ],
      }),
      signal: 中止 ? AbortSignal.any([控制器.signal, 中止]) : 控制器.signal,
    })
    if (!回应.ok) throw new Error('日记模型请求失败：HTTP ' + 回应.status)
    const 包 = await 回应.json()
    return 包 && 包.choices && 包.choices[0] && 包.choices[0].message && 包.choices[0].message.content
  } finally { clearTimeout(闹钟) }
}

const 默认系统 = 创建日记系统()
module.exports = { 创建日记系统, 默认取来源, 生成日记, 校验生成结果, 规整来源, 日期间, 周期间, 模块名们, 日记可见性们, 规范日记可见性, 规范日记记录, 共享日记投影, ...默认系统 }
