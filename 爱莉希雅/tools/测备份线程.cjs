'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const AdmZip = require('adm-zip')
const { 在线程里创建备份 } = require('../main/backup-service.cjs')

const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-backup-worker-'))
let 通过 = 0

;(async () => {
  try {
    const 用户 = path.join(根, '用户')
    const 人格 = path.join(用户, 'elysia.cosplay.v2.json')
    const 记忆 = path.join(用户, '记忆')
    const 学习 = path.join(用户, '学习')
    const 目标 = path.join(根, '导出', '用户数据.zip')
    fs.mkdirSync(记忆, { recursive: true })
    fs.mkdirSync(学习, { recursive: true })
    fs.writeFileSync(人格, '{}\n')
    fs.writeFileSync(path.join(记忆, '事实.json'), '[]\n')

    const 结果 = await 在线程里创建备份({
      目标文件: 目标, 角色卡路径: 人格, 数据目录: 记忆, 学习区根: 学习, 应用版本: 'test',
    })
    assert.equal(fs.existsSync(目标), true)
    通过++
    console.log('✓ 工作线程能完成备份')

    assert.equal(结果.文件数, 2)
    assert.ok(new AdmZip(目标).getEntry('记忆/事实.json'))
    通过++
    console.log('✓ 工作线程把统计和 zip 内容带回来')

    await assert.rejects(() => 在线程里创建备份({
      目标文件: path.join(记忆, '错误.zip'), 角色卡路径: 人格, 数据目录: 记忆, 学习区根: 学习,
    }), /不能放在/)
    通过++
    console.log('✓ 工作线程错误能回到主进程')

    console.log(`\n备份线程：${通过}/${通过} 通过`)
  } finally {
    fs.rmSync(根, { recursive: true, force: true })
  }
})().catch((错误) => {
  console.error(错误)
  process.exitCode = 1
})
