// 表达反馈：把真实回复和人工标签存成一个独立的小型评测集。
//
// 这里故意不碰长期记忆、临时记忆和提示词。反馈只有在用户主动点选后才写入，
// 后续要调整人格表达时再由人查看，绝不能悄悄塞回模型上下文。

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const 固定标签 = Object.freeze(['讨好腔', '套路句式', '空洞', '莫名其妙', '不像爱莉希雅'])
const 标签集合 = new Set(固定标签)

function 正规标签(输入) {
  return [...new Set((Array.isArray(输入) ? 输入 : [])
    .map((一) => String(一 || '').trim())
    .filter((一) => 标签集合.has(一)))]
}

function 编号(对话, 时间, 内容) {
  return crypto.createHash('sha256')
    .update(`${对话}\u0000${时间}\u0000${内容}`)
    .digest('hex')
    .slice(0, 20)
}

function 创建反馈库(文件, 选项 = {}) {
  const 现在 = typeof 选项.现在 === 'function' ? 选项.现在 : () => new Date().toISOString()

  function 读原始() {
    try {
      const 数据 = JSON.parse(fs.readFileSync(文件, 'utf8'))
      if (!数据 || 数据.版本 !== 1 || !Array.isArray(数据.条目)) throw new Error('文件结构不受支持')
      return { 好: true, 数据 }
    } catch (错误) {
      if (错误 && 错误.code === 'ENOENT') return { 好: true, 数据: { 版本: 1, 条目: [] } }
      return { 好: false, 说明: `表达反馈文件读不出来：${错误.message}` }
    }
  }

  function 原子写(数据) {
    fs.mkdirSync(path.dirname(文件), { recursive: true })
    const 临时 = `${文件}.${process.pid}.${Date.now()}.tmp`
    try {
      fs.writeFileSync(临时, JSON.stringify(数据, null, 2) + '\n', 'utf8')
      fs.renameSync(临时, 文件)
    } catch (错误) {
      try { fs.rmSync(临时, { force: true }) } catch { /* 清理失败不覆盖原错误 */ }
      throw 错误
    }
  }

  function 查(输入 = {}) {
    const 内容 = String(输入.内容 || '').trim()
    const 对话 = String(输入.对话 || '').trim()
    const 时间 = String(输入.消息时间 || '').trim()
    const 读到 = 读原始()
    if (!读到.好) return 读到
    const 条 = 读到.数据.条目.find((一) => 一 && 一.编号 === 编号(对话, 时间, 内容))
    return { 好: true, 标签: 条 ? 正规标签(条.标签) : [] }
  }

  function 列表() {
    const 读到 = 读原始()
    if (!读到.好) return 读到
    const 条目 = 读到.数据.条目
      .filter((一) => 一 && typeof 一.内容 === 'string')
      .slice(-500)
      .reverse()
      .map((一) => ({
        编号: String(一.编号 || ''),
        对话: String(一.对话 || ''),
        消息时间: String(一.消息时间 || ''),
        记录于: String(一.记录于 || ''),
        内容: String(一.内容 || '').slice(0, 12000),
        标签: 正规标签(一.标签),
      }))
    return { 好: true, 条目, 总数: 条目.length }
  }

  function 保存(输入 = {}) {
    const 内容 = String(输入.内容 || '').trim()
    const 对话 = String(输入.对话 || '').trim()
    const 消息时间 = String(输入.消息时间 || '').trim()
    const 标签 = 正规标签(输入.标签)
    if (!对话 || !消息时间 || !内容) return { 好: false, 说明: '缺少可核对的正式回复' }
    if (内容.length > 12000) return { 好: false, 说明: '这条回复太长，暂不收进表达评测集' }

    const 读到 = 读原始()
    if (!读到.好) return 读到 // 坏文件必须人工处理，不能静默覆盖。
    const 数据 = 读到.数据
    const 此编号 = 编号(对话, 消息时间, 内容)
    const 位置 = 数据.条目.findIndex((一) => 一 && 一.编号 === 此编号)

    if (!标签.length) {
      if (位置 >= 0) 数据.条目.splice(位置, 1)
    } else {
      const 条 = { 编号: 此编号, 对话, 消息时间, 记录于: 现在(), 内容, 标签 }
      if (位置 >= 0) 数据.条目[位置] = 条
      else 数据.条目.push(条)
      if (数据.条目.length > 500) 数据.条目.splice(0, 数据.条目.length - 500)
    }

    try {
      原子写(数据)
      return { 好: true, 标签, 已删除: !标签.length }
    } catch (错误) {
      return { 好: false, 说明: `表达反馈没有保存成功：${错误.message}` }
    }
  }

  return { 查, 列表, 保存, 文件 }
}

module.exports = { 固定标签, 正规标签, 创建反馈库 }
