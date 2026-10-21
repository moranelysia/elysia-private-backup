/**
 * 测网络.cjs —— 看看这台机器现在能到哪些地方
 *
 * 【为什么需要它】
 *   这台机器上网是有脾气的：DeepSeek、百度、Bing 通，
 *   github、duckduckgo 不通（实测过）。
 *   他挂了梯子之后想确认能不能上 GitHub —— 那就不该靠感觉，
 *   一个个地址试过去，看看到底通没通。
 *
 * 【为什么这些地址都要试】
 *   下载一个 GitHub 仓库，动用的不止 github.com 一个域名：
 *     github.com          —— 网页、git clone
 *     codeload.github.com —— 下载 zip 压缩包（"Download ZIP"走这里）
 *     raw.githubusercontent.com —— 直接取单个文件
 *     objects.githubusercontent.com —— Release 里的附件
 *     api.github.com      —— 查版本、查仓库信息
 *   有的梯子只代理了其中一个，所以经常出现"网页能开、下载还是失败"。
 *
 * 用法: node tools\测网络.cjs
 */
'use strict'

const 地址们 = [
  ['api.deepseek.com', 'https://api.deepseek.com/'],
  ['baidu.com', 'https://www.baidu.com/'],
  ['bing.com', 'https://www.bing.com/'],
  ['github.com', 'https://github.com/'],
  ['codeload.github.com', 'https://codeload.github.com/'],
  ['raw.githubusercontent.com', 'https://raw.githubusercontent.com/'],
  ['objects.githubusercontent.com', 'https://objects.githubusercontent.com/'],
  ['api.github.com', 'https://api.github.com/'],
  ['gh-proxy.com（国内镜像）', 'https://gh-proxy.com/'],
  ['npmjs.org', 'https://registry.npmjs.org/'],
]

async function 试(名, 地址) {
  const 开始 = Date.now()
  try {
    const 回应 = await fetch(地址, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0' },
    })
    const 用时 = Date.now() - 开始
    // 3xx 也算通 —— 说明连上了，只是它让我去别处
    return { 名, 通: true, 说明: `HTTP ${回应.status}`, 用时 }
  } catch (错误) {
    const 用时 = Date.now() - 开始
    const 说法 =
      错误.name === 'TimeoutError' || 错误.name === 'AbortError'
        ? '超时（多半被墙）'
        : 错误.cause && 错误.cause.code
          ? 错误.cause.code
          : 错误.message.slice(0, 40)
    return { 名, 通: false, 说明: 说法, 用时 }
  }
}

async function main() {
  console.log('')
  console.log('  ============================================')
  console.log('   这台机器现在能到哪些地方')
  console.log('  ============================================')
  console.log('')

  // 系统代理设了没有 —— 挂了梯子的话这里应该能看到
  console.log('  系统代理设置：')
  for (const 键 of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
    const 值 = process.env[键] || process.env[键.toLowerCase()]
    console.log(`    ${键.padEnd(12, ' ')} ${值 || '（没设）'}`)
  }
  console.log('')
  console.log('  （Node 的 fetch 默认**不读** Windows 的系统代理设置 ——')
  console.log('   梯子开了但没设这两个环境变量的话，程序可能还是走直连。')
  console.log('   这一点下面那张表会告诉我们真相。）')
  console.log('')

  const 结果 = []
  for (const [名, 地址] of 地址们) {
    结果.push(await 试(名, 地址))
  }

  console.log('  地址                         结果')
  console.log('  ──────────────────────────────────────────────')
  for (const r of 结果) {
    const 记号 = r.通 ? '✓' : '✗'
    console.log(`  ${记号} ${r.名.padEnd(26, ' ')} ${r.说明.padEnd(18, ' ')} ${r.用时}ms`)
  }

  const github系 = 结果.filter((r) => r.名.includes('github'))
  const 通的数量 = github系.filter((r) => r.通).length

  console.log('')
  console.log('  ──────────────────────────────────────────────')
  console.log(`  GitHub 相关的 ${github系.length} 个地址，通了 ${通的数量} 个。`)
  console.log('')

  if (通的数量 === github系.length) {
    console.log('  ✓ 全通 —— 可以 git clone，也可以下载 Release 里的东西。')
  } else if (通的数量 > 0) {
    console.log('  ~ 通了一部分。这种情况最常见的是"网页能开、下载失败" ——')
    console.log('    把上面 ✗ 的那几个记下来，挂梯子的时候要开"全局"或者')
    console.log('    把这些域名加进规则。')
  } else {
    console.log('  ✗ 一个都不通。梯子可能没挂上，或者没代理到这些域名。')
    console.log('    另一条路：走国内镜像 gh-proxy.com（上面也测了）。')
  }
  console.log('')
}

main().catch((错误) => {
  console.log('✗ 出错了: ' + 错误.message)
  process.exit(1)
})
