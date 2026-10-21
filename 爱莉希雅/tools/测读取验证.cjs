'use strict'

/** T2：读、列、找必须如实说明完整范围与截断。 */
const fs = require('node:fs')
const path = require('node:path')

const 项目根 = path.resolve(__dirname, '..')
const 工作区根 = path.dirname(项目根)
const 测试目录 = path.join(工作区根, '_测试', '读取验证')
const 文件工具 = require(path.join(项目根, '脑', '工具', '文件工具.cjs'))
const 路径安全 = require(path.join(项目根, '脑', '路径安全.cjs'))

let 总数 = 0
let 通过 = 0
function 检查(说明, 条件, 细节 = '') {
  总数++
  if (!条件) throw new Error('✗ ' + 说明 + (细节 ? '：' + 细节 : ''))
  通过++
  console.log('✓ ' + 说明)
}

function 安全清理() {
  const 绝对 = path.resolve(测试目录)
  const 测试根 = path.resolve(工作区根, '_测试') + path.sep
  if (!绝对.startsWith(测试根)) throw new Error('拒绝清理非测试目录：' + 绝对)
  fs.rmSync(绝对, { recursive: true, force: true })
}

async function 主() {
  安全清理()
  fs.mkdirSync(测试目录, { recursive: true })
  路径安全.注册({ 项目根, 工作区根 })
  路径安全.设工作区(测试目录)
  文件工具.注册({ 项目根, 工作区根 })

  try {
    const 小文件 = path.join(测试目录, 'small.txt')
    fs.writeFileSync(小文件, '第一行\n第二行', 'utf8')
    const 完整读 = await 文件工具.读(小文件)
    检查('小文件完整读取并验证', 完整读.好 && 完整读.验证状态 === '已验证' && 完整读.目标完成 === '是')
    检查('完整读取记录全文范围', 完整读.读取范围.类型 === '全文' && !完整读.截断.有)
    检查('读取证据只记范围和路径', 完整读.证据[0].类型 === '文件读取' && !完整读.证据[0].说明.includes('第一行'))

    const 长文件 = path.join(测试目录, 'long.txt')
    fs.writeFileSync(长文件, '甲'.repeat(文件工具.读取字符上限 + 5000), 'utf8')
    const 部分读 = await 文件工具.读(长文件)
    检查('长文本头尾摘取标为部分', 部分读.好 && 部分读.验证状态 === '部分验证' && 部分读.目标完成 === '部分')
    检查('截断数量准确', 部分读.截断.有 && 部分读.截断.原始量 === 文件工具.读取字符上限 + 5000 && 部分读.截断.保留量 === 文件工具.读取字符上限)
    检查('正文在开头提醒不是全文', 部分读.内容.indexOf('这不是全文') < 部分读.内容.indexOf('甲甲甲'))

    const 超大文件 = path.join(测试目录, 'too-big.txt')
    fs.writeFileSync(超大文件, Buffer.alloc(路径安全.读的上限 + 1, 65))
    const 超大读 = await 文件工具.读(超大文件)
    检查('超过磁盘读取上限直接拒绝', !超大读.好 && /文件太大/.test(超大读.说明))

    const 小目录 = path.join(测试目录, 'small-dir')
    fs.mkdirSync(小目录)
    fs.writeFileSync(path.join(小目录, 'a.txt'), 'a')
    fs.writeFileSync(path.join(小目录, 'b.txt'), 'b')
    const 完整列 = await 文件工具.列(小目录)
    检查('小目录完整列出并验证', 完整列.验证状态 === '已验证' && 完整列.目标完成 === '是' && 完整列.个数 === 2)
    检查('完整目录没有截断', !完整列.截断.有 && 完整列.显示个数 === 2)

    const 大目录 = path.join(测试目录, 'many-dir')
    fs.mkdirSync(大目录)
    for (let i = 0; i < 文件工具.目录显示上限 + 5; i++) {
      fs.writeFileSync(path.join(大目录, `item-${String(i).padStart(3, '0')}.txt`), 'x')
    }
    const 部分列 = await 文件工具.列(大目录)
    检查('大目录只显示固定上限', 部分列.个数 === 文件工具.目录显示上限 + 5 && 部分列.显示个数 === 文件工具.目录显示上限)
    检查('目录截断不能声称完整', 部分列.验证状态 === '部分验证' && 部分列.目标完成 === '部分' && /不能据此断言/.test(部分列.内容))

    const 搜索目录 = path.join(测试目录, 'search-dir')
    fs.mkdirSync(搜索目录)
    fs.writeFileSync(path.join(搜索目录, 'one.txt'), '这里有目标词\n另一行')
    fs.writeFileSync(path.join(搜索目录, 'two.md'), '没有')
    const 完整找 = await 文件工具.找(`目标词|${搜索目录}`)
    检查('完整搜索范围可验证', 完整找.处数 === 1 && 完整找.验证状态 === '已验证' && 完整找.目标完成 === '是')
    检查('完整搜索记录检查文件数', 完整找.看过文件 === 2 && !完整找.截断.有)

    const 没找到 = await 文件工具.找(`不存在的词|${搜索目录}`)
    检查('完整搜索无结果可以明确说没找到', 没找到.目标完成 === '是' && /完整搜索后没找到/.test(没找到.内容))

    const 命中多 = path.join(搜索目录, 'many-hits.txt')
    fs.writeFileSync(命中多, Array.from({ length: 文件工具.搜索命中上限 + 5 }, (_, i) => `目标词 ${i}`).join('\n'))
    const 截断找 = await 文件工具.找(`目标词|${命中多}`)
    检查('命中达到上限标为部分', 截断找.处数 === 文件工具.搜索命中上限 && 截断找.目标完成 === '部分' && 截断找.截断.有)
    检查('搜索正文明确不是全部结果', /不是全部结果/.test(截断找.内容))

    const 范围截断找 = await 文件工具.找(`根本没有|${大目录}`)
    检查('文件数达到上限时不能说翻遍', 范围截断找.目标完成 === '部分' && /不能断言其余范围也没有/.test(范围截断找.内容))

    const 搜索超大文件 = path.join(测试目录, 'search-too-big.txt')
    fs.writeFileSync(搜索超大文件, Buffer.alloc(文件工具.搜索单文件上限 + 1, 65))
    const 超大找 = await 文件工具.找(`A|${搜索超大文件}`)
    检查('直接搜索超大文件也受上限约束', !超大找.好 && /目标文件太大/.test(超大找.说明))

    const 空关键词 = await 文件工具.找(`|${搜索目录}`)
    检查('空搜索词被拒绝', !空关键词.好 && /没给要搜的话/.test(空关键词.说明))
  } finally {
    路径安全.设工作区(null)
    安全清理()
  }

  console.log(`\n读取验证：${通过}/${总数} 通过`)
}

主().catch((错误) => {
  console.error(错误.stack || 错误.message)
  process.exitCode = 1
})
