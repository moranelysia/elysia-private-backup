/** 主动陪伴本地去重：只比较已经落盘的主动消息，不保存额外正文。 */
'use strict'

function 归一(值) {
  return String(值 || '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
}

function 二元组(值) {
  const 文 = 归一(值)
  const 组 = new Set()
  for (let i = 0; i < 文.length - 1; i++) 组.add(文.slice(i, i + 2))
  if (文.length === 1) 组.add(文)
  return 组
}

function 相似度(甲, 乙) {
  const A = 二元组(甲); const B = 二元组(乙)
  if (!A.size && !B.size) return 1
  if (!A.size || !B.size) return 0
  let 交集 = 0
  for (const 一 of A) if (B.has(一)) 交集++
  // Dice 系数对“只换了两三个近义词”的短中文比 Jaccard 更稳定。
  return (2 * 交集) / (A.size + B.size)
}

function 判断重复(正文, 旧消息们 = []) {
  const 新文 = 归一(正文)
  if (!新文) return { 重复: true, 原因: '空文字', 相似度: 1 }
  let 最高 = 0
  for (const 原 of (Array.isArray(旧消息们) ? 旧消息们 : []).slice(-8)) {
    const 旧文 = 归一(typeof 原 === 'string' ? 原 : 原 && 原.内容)
    if (!旧文) continue
    if (新文 === 旧文) return { 重复: true, 原因: '与近期主动消息相同', 相似度: 1 }
    const 分 = 相似度(新文, 旧文)
    最高 = Math.max(最高, 分)
    const 短 = Math.min(新文.length, 旧文.length); const 长 = Math.max(新文.length, 旧文.length)
    const 高覆盖包含 = 短 >= 12 && 长 > 0 && (新文.includes(旧文) || 旧文.includes(新文)) && 短 / 长 >= 0.72
    if ((短 >= 10 && 分 >= 0.62) || 高覆盖包含) {
      return { 重复: true, 原因: '与近期主动消息过于相似', 相似度: 分 }
    }
  }
  return { 重复: false, 原因: '', 相似度: 最高 }
}

module.exports = { 归一, 二元组, 相似度, 判断重复 }
