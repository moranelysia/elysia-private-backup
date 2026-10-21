'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 创建密钥存储 } = require('../main/secret-store.cjs')

const 目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'elysia-secret-'))
const 文件 = path.join(目录, '凭据.dat')
const 前缀 = Buffer.from('假的系统密文:')
const 系统锁 = {
  async isAsyncEncryptionAvailable() { return true },
  async encryptStringAsync(明文) {
    return Buffer.concat([前缀, Buffer.from(明文).reverse()])
  },
  async decryptStringAsync(密文) {
    assert.equal(密文.subarray(0, 前缀.length).equals(前缀), true)
    return { shouldReEncrypt: false, result: Buffer.from(密文.subarray(前缀.length)).reverse().toString() }
  },
}

let 通过 = 0
async function 测试(名字, 动作) {
  await 动作()
  通过++
  console.log('✓ ' + 名字)
}

;(async () => {
  try {
    const 存储 = 创建密钥存储(文件, 系统锁)
    const 钥匙 = 'sk-test-1234567890abcdefghijklmnop'

    await 测试('首次没有保存内容', async () => assert.equal(await 存储.读取(), null))
    await 测试('系统加密可用', async () => assert.equal(await 存储.可用(), true))
    await 测试('能保存并读回同一把 Key', async () => {
      await 存储.保存('  ' + 钥匙 + '  ')
      assert.equal(await 存储.读取(), 钥匙)
    })
    await 测试('磁盘上没有明文 Key', async () => {
      assert.equal(fs.readFileSync(文件).includes(Buffer.from(钥匙)), false)
    })
    await 测试('写完不留下临时文件', async () => assert.equal(fs.existsSync(文件 + '.tmp'), false))
    await 测试('过短的 Key 会被拒绝', async () => {
      await assert.rejects(() => 存储.保存('sk-too-short'), /格式不对/)
    })
    await 测试('带换行的 Key 会被拒绝', async () => {
      await assert.rejects(() => 存储.保存(钥匙 + '\n多余内容'), /格式不对/)
    })
    await 测试('清除后不再有凭据', async () => {
      存储.清除()
      assert.equal(存储.已保存(), false)
      assert.equal(await 存储.读取(), null)
    })
    await 测试('系统加密不可用时明确失败', async () => {
      const 不可用 = 创建密钥存储(path.join(目录, '不可用.dat'), {
        async isAsyncEncryptionAvailable() { return false },
      })
      await assert.rejects(() => 不可用.保存(钥匙), /不能使用 Windows 加密存储/)
    })

    console.log(`\n密钥存储：${通过}/${通过} 通过`)
  } finally {
    fs.rmSync(目录, { recursive: true, force: true })
  }
})().catch((错误) => {
  console.error(错误)
  process.exitCode = 1
})
