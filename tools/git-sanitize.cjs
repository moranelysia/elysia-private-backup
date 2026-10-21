/** Redact credential-shaped strings from selected documentation before Git stores a blob. */
'use strict'

let 输入 = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (块) => { 输入 += 块 })
process.stdin.on('end', () => {
  const 输出 = 输入
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]')
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh_[REDACTED]')
  process.stdout.write(输出)
})
