/** 让记忆以爱莉希雅自己的视角保存、展示和召回。机器分类可以保持稳定值，但不能冒充正文口吻。 */
'use strict'

const 引用段 = /(「[^」]*」|『[^』]*』|“[^”]*”|‘[^’]*’|"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`)/g

function 分段(文本) {
  const 原 = String(文本 == null ? '' : 文本)
  const 结果 = []
  let 起点 = 0
  for (const 匹配 of 原.matchAll(引用段)) {
    if (匹配.index > 起点) 结果.push({ 引用: false, 文本: 原.slice(起点, 匹配.index) })
    结果.push({ 引用: true, 文本: 匹配[0] })
    起点 = 匹配.index + 匹配[0].length
  }
  if (起点 < 原.length) 结果.push({ 引用: false, 文本: 原.slice(起点) })
  return 结果
}

function 非引用文本(文本) {
  return 分段(文本).filter((一) => !一.引用).map((一) => 一.文本).join('')
}

function 换称呼(片段) {
  return String(片段 || '')
    .replace(/(?:用户|当前使用者)\s*(?:与|和)\s*爱莉希雅/g, '你和我')
    .replace(/(?:用户|当前使用者)\s*(?:与|和)\s*爱莉/g, '你和我')
    .replace(/用户本人|当前使用者/g, '你')
    .replace(/用户/g, '你')
    .replace(/爱莉希雅|爱莉/g, '我')
}

function 换用户代词(片段, 完整 = false) {
  let 文本 = String(片段 || '')
    .replace(/他和我/g, '你和我')
    .replace(/(叫|给|向|跟|问|找|让|替|陪|帮|把|为)他(?=(?:自己|本人|也|还|很|会|要|想|不|没|有|在|是|说|认为|觉得|表示|希望|倾向|对|和|与|把|被|的|，|。|、|；|：|！|？|$))/g, '$1你')
    .replace(/(^|[\s，。！？；：、（(])他(?=(?:自己|本人|也|还|很|会|要|想|不|没|有|在|是|说|认为|觉得|表示|希望|倾向|对|和|与|把|被|的|，|。|、|；|：|！|？|$))/g, '$1你')
  if (完整) 文本 = 文本.replace(/他们/g, '你们').replace(/(?<!其)他(?!人|者|方|处|国|乡|物|日|年|时|事|心|用)/g, '你')
  return 文本
}

function 换本人代词(片段, 完整 = false) {
  let 文本 = String(片段 || '')
    .replace(/她和你/g, '我和你')
    .replace(/(^|[\s，。！？；：、（(])她(?=(?:自己|本人|也|还|很|会|要|想|不|没|有|在|是|说|认为|觉得|表示|希望|倾向|对|和|与|把|被|的|，|。|、|；|：|！|？|$))/g, '$1我')
  if (完整) 文本 = 文本.replace(/她(?!们)/g, '我')
  return 文本
}

function 整理正文(文本, { 人物 = '', 修正旧代词 = false } = {}) {
  const 原 = String(文本 == null ? '' : 文本).trim()
  if (!原) return ''
  const 非引用 = 非引用文本(原)
  const 原有用户称呼 = /用户|当前使用者/.test(非引用)
  const 原有本人称呼 = /爱莉希雅|爱莉/.test(非引用)
  const 关于用户 = 原有用户称呼 || (修正旧代词 && /用户/.test(String(人物 || '')))
  const 关于本人 = 原有本人称呼 || (修正旧代词 && /爱莉/.test(String(人物 || '')))
  return 分段(原).map((一) => {
    if (一.引用) return 一.文本
    let 内容 = 换称呼(一.文本)
    if (关于用户) 内容 = 换用户代词(内容, 修正旧代词 && /用户/.test(String(人物 || '')))
    if (关于本人) 内容 = 换本人代词(内容, 原有本人称呼)
    return 内容
  }).join('').trim()
}

function 有第三方系统称呼(文本) {
  return /用户|当前使用者|爱莉希雅|爱莉/.test(非引用文本(文本))
}

function 整理日记正文(文本) {
  const 原 = String(文本 == null ? '' : 文本).trim()
  if (!原) return ''
  return 分段(原).map((一) => {
    if (一.引用) return 一.文本
    return 换本人代词(换用户代词(换称呼(一.文本), true), true)
  }).join('').trim()
}

function 面向她的元数据(元数据 = {}) {
  const person = String(元数据.person || '')
  const relationship = String(元数据.relationship || '')
  const 人物表 = { 用户本人: '你', 用户与爱莉希雅: '你和我', 用户与爱莉: '你和我', 爱莉希雅: '我', 爱莉: '我' }
  const 关系表 = { 本人: '你本人', 与爱莉希雅: '和我', 与爱莉: '和我', 共同经历: '我们的共同经历' }
  return {
    backstory: 整理正文(元数据.backstory || '', { 人物: person, 修正旧代词: true }),
    person: 人物表[person] || person,
    relationship: 关系表[relationship] || relationship,
  }
}

function 面向她的记录(记录 = {}) {
  const 原人物 = String(记录 && 记录.元数据 && 记录.元数据.person || '')
  return {
    ...记录,
    内容: 整理正文(记录.内容 || '', { 人物: 原人物, 修正旧代词: true }),
    元数据: 面向她的元数据(记录.元数据 || {}),
  }
}

module.exports = { 分段, 非引用文本, 整理正文, 整理日记正文, 有第三方系统称呼, 面向她的元数据, 面向她的记录 }
