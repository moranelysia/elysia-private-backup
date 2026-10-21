'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 准备用户数据, 应用安装版路径 } = require('../main/user-data.cjs')

const 临时目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-user-data-'))
const 模板 = path.resolve(__dirname, '..', 'templates', 'elysia.clean.json')
let 通过 = 0

function 测试(名字, 动作) {
  动作()
  通过++
  console.log('✓ ' + 名字)
}

try {
  const 首次 = 准备用户数据({ 用户目录: 临时目录, 角色卡模板: 模板 })
  测试('首次启动会标记为新安装', () => assert.equal(首次.新装, true))
  测试('复制干净角色卡', () => {
    const 卡 = JSON.parse(fs.readFileSync(首次.角色卡路径, 'utf8'))
    assert.equal(卡.data.character_version, 'clean-1.0')
  })
  测试('创建空记忆', () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(首次.数据目录, '事实.json'), 'utf8')), [])
  })
  测试('创建空聊天索引', () => {
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(首次.数据目录, '聊天记录', '对话索引.json'), 'utf8')),
      [],
    )
  })
  测试('创建学习目录', () => {
    for (const 名 of ['材料', '笔记', '练习']) {
      assert.equal(fs.statSync(path.join(首次.学习区根, 名)).isDirectory(), true)
    }
  })

  fs.writeFileSync(path.join(首次.数据目录, '事实.json'), '[{"内容":"保留"}]\n', 'utf8')
  fs.writeFileSync(首次.角色卡路径, '{"保留":true}\n', 'utf8')
  const 再次 = 准备用户数据({ 用户目录: 临时目录, 角色卡模板: 模板 })
  测试('再次启动不是新安装', () => assert.equal(再次.新装, false))
  测试('再次启动不覆盖记忆', () => {
    assert.equal(JSON.parse(fs.readFileSync(path.join(再次.数据目录, '事实.json'), 'utf8'))[0].内容, '保留')
  })
  测试('再次启动不覆盖角色卡', () => {
    assert.equal(JSON.parse(fs.readFileSync(再次.角色卡路径, 'utf8')).保留, true)
  })
  测试('安装版路径会在加载配置前写入环境', () => {
    应用安装版路径(再次)
    assert.equal(process.env.ELYSIA_DATA_DIR, 再次.数据目录)
    assert.equal(process.env.ELYSIA_PERSONA_PATH, 再次.角色卡路径)
  })

  console.log(`\n用户数据初始化：${通过}/${通过} 通过`)
} finally {
  fs.rmSync(临时目录, { recursive: true, force: true })
}
