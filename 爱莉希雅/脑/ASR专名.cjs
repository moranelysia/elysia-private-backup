/** ASR 专名参考：不改写转写原文，只给大模型一份可编辑的语音语境提示。 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const 词表路径 = path.resolve(__dirname, '..', 'ASR专名表.json')

function 读词表() {
  try {
    const 数据 = JSON.parse(fs.readFileSync(词表路径, 'utf8').replace(/^\uFEFF/, ''))
    if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw new Error('根节点必须是对象')
    if (!Array.isArray(数据.词条)) throw new Error('缺少词条数组')
    return { 好: true, 数据, 警告: '' }
  } catch (错误) {
    return { 好: false, 数据: null, 警告: '专名表读取失败：' + String(错误.message || 错误).slice(0, 160) }
  }
}

function 标准词们(指定数据) {
  const 读取 = 指定数据 === undefined ? 读词表() : { 好: true, 数据: 指定数据 }
  const 数据 = 读取.数据
  if (!读取.好 || !数据 || 数据.用于大模型理解 !== true || 数据.审核状态 !== '已审核' || !Array.isArray(数据.词条)) return []
  const 结果 = []
  const 已有 = new Set()
  for (const 项 of 数据.词条.slice(0, 500)) {
    const 词 = typeof 项?.标准写法 === 'string' ? 项.标准写法.trim().slice(0, 80) : ''
    if (!词 || 项.审核 !== '已审核' || 已有.has(词)) continue
    已有.add(词)
    结果.push(词)
  }
  return 结果
}

function 拼给模型(指定数据) {
  const 词们 = 标准词们(指定数据)
  const 参考 = 词们.length ? `本项目常见专名有：${词们.join('、')}。` : ''
  return [
    '下一条用户内容来自语音识别，是近似听写，可能含同音字、错别字或漏词。',
    参考,
    '请结合当前对话理解他真正想说什么，不要纠结转写字面，也不要向他汇报纠错过程。',
    '如果存在两种以上合理理解，就简短追问；不要擅自编造专名或事实。',
  ].filter(Boolean).join('\n')
}

module.exports = { 词表路径, 读词表, 标准词们, 拼给模型 }
