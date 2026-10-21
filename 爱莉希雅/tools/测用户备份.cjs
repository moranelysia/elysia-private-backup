'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')
const { 创建用户备份, 时间戳, 是同一路径或在里面 } = require('../main/user-backup.cjs')

const 临时根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-user-backup-'))
const 用户根 = path.join(临时根, '用户数据')
const 输出根 = path.join(临时根, '输出')
const 角色卡 = path.join(用户根, 'elysia.cosplay.v2.json')
const 记忆 = path.join(用户根, '记忆')
const 学习 = path.join(用户根, '学习')
const 缓存 = path.join(用户根, '缓存')
const 目标 = path.join(输出根, '备份.zip')
let 通过 = 0

function 测试(名字, 动作) {
  动作()
  通过++
  console.log('✓ ' + 名字)
}

try {
  fs.mkdirSync(path.join(记忆, '聊天记录'), { recursive: true })
  fs.mkdirSync(path.join(学习, '笔记'), { recursive: true })
  fs.mkdirSync(缓存, { recursive: true })
  fs.writeFileSync(角色卡, '{"name":"全新爱莉希雅"}\n')
  fs.writeFileSync(path.join(记忆, '事实.json'), '["喜欢粉色"]\n')
  fs.writeFileSync(path.join(记忆, '聊天记录', '聊天记录.jsonl'), '{"内容":"早上好"}\n')
  fs.writeFileSync(path.join(学习, '笔记', '高数.md'), '# 极限\n')
  fs.writeFileSync(path.join(缓存, 'deepseek-api-key.dat'), '绝不能进入备份的密文')

  测试('路径边界能区分里面和相邻目录', () => {
    assert.equal(是同一路径或在里面(path.join(记忆, 'a.txt'), 记忆), true)
    assert.equal(是同一路径或在里面(path.join(用户根, '记忆2', 'a.txt'), 记忆), false)
  })
  测试('时间戳稳定可排序', () => {
    assert.equal(时间戳(new Date(2026, 9, 9, 8, 7, 6)), '20261009-080706')
  })

  const 结果 = 创建用户备份({
    目标文件: 目标,
    角色卡路径: 角色卡,
    数据目录: 记忆,
    学习区根: 学习,
    应用版本: '0.2.2-test',
    现在: new Date('2026-10-09T08:00:00.000Z'),
  })
  const zip = new AdmZip(目标)
  const 名单 = zip.getEntries().map((项) => 项.entryName)

  测试('生成 zip 且返回统计', () => {
    assert.equal(fs.existsSync(目标), true)
    assert.equal(结果.文件数, 4)
    assert.ok(结果.压缩字节 > 0)
  })
  测试('人格、记忆、聊天和学习资料都在', () => {
    for (const 名 of ['elysia.cosplay.v2.json', '记忆/事实.json', '记忆/聊天记录/聊天记录.jsonl', '学习/笔记/高数.md']) {
      assert.ok(名单.includes(名), 名)
    }
  })
  测试('缓存和加密 Key 不在', () => {
    assert.equal(名单.some((名) => 名.includes('缓存') || 名.includes('deepseek-api-key')), false)
    assert.equal(zip.getEntries().some((项) => 项.getData().toString().includes('绝不能进入备份')), false)
  })
  测试('备份清单写明版本和排除项', () => {
    const 清单 = JSON.parse(zip.readAsText('backup-manifest.json'))
    assert.equal(清单.格式版本, 1)
    assert.equal(清单.应用版本, '0.2.2-test')
    assert.ok(清单.不包含.includes('API Key'))
  })
  测试('说明提醒 zip 没有密码', () => {
    assert.match(zip.readAsText('这份备份是什么.txt'), /没有密码/)
  })
  测试('拒绝把备份放进记忆目录', () => {
    assert.throws(() => 创建用户备份({
      目标文件: path.join(记忆, '自己.zip'), 角色卡路径: 角色卡, 数据目录: 记忆, 学习区根: 学习,
    }), /不能放在/)
  })
  测试('允许放在角色卡旁边但不在记忆目录里', () => {
    const 旁边 = path.join(用户根, '可带走的备份.zip')
    创建用户备份({ 目标文件: 旁边, 角色卡路径: 角色卡, 数据目录: 记忆, 学习区根: 学习 })
    assert.equal(fs.existsSync(旁边), true)
  })
  测试('重复导出会替换旧 zip 且不留临时文件', () => {
    创建用户备份({ 目标文件: 目标, 角色卡路径: 角色卡, 数据目录: 记忆, 学习区根: 学习 })
    assert.equal(fs.existsSync(目标 + '.tmp'), false)
    assert.ok(new AdmZip(目标).getEntry('记忆/事实.json'))
  })

  console.log(`\n用户数据备份：${通过}/${通过} 通过`)
} finally {
  fs.rmSync(临时根, { recursive: true, force: true })
}
