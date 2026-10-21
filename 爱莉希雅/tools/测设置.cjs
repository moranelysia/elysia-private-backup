'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { 创建设置存储 } = require('../main/settings.cjs')

const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-settings-'))
const 文件 = path.join(目录, '设置.json')
let 通过 = 0

function 测试(名字, 动作) {
  动作()
  通过++
  console.log('✓ ' + 名字)
}

try {
  const 存储 = 创建设置存储(文件)

  测试('文件不存在时返回空设置', () => assert.deepEqual(存储.读设置(), {}))
  测试('首次写入成功', () => assert.equal(存储.写设置({ 账本: true }), true))
  测试('写入结果可读取', () => assert.deepEqual(存储.读设置(), { 账本: true }))
  测试('后续写入会合并已有字段', () => {
    存储.写设置({ 主题: 'light' })
    assert.deepEqual(存储.读设置(), { 账本: true, 主题: 'light' })
  })
  测试('写完不会留下临时文件', () => assert.equal(fs.existsSync(文件 + '.tmp'), false))
  测试('损坏 JSON 会安全回退', () => {
    fs.writeFileSync(文件, '{坏掉了', 'utf8')
    assert.deepEqual(存储.读设置(), {})
  })
  测试('损坏后可恢复写入', () => {
    assert.equal(存储.写设置({ 恢复: true }), true)
    assert.deepEqual(存储.读设置(), { 恢复: true })
  })
  console.log(`\n设置存储：${通过}/${通过} 通过`)
} finally {
  fs.rmSync(目录, { recursive: true, force: true })
}
