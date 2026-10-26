'use strict'
const fs = require('node:fs'), path = require('node:path')
const { 盘点显式来源 } = require('../storage/source-inventory.cjs')
function main(args) {
  if (args.length !== 3 || args[0] !== '--profile' || !path.isAbsolute(args[1]) || args[2] !== '--include-private-local') throw Error('SQLITE_INVENTORY_USAGE: --profile <absolute-json> --include-private-local')
  const p = JSON.parse(fs.readFileSync(args[1],'utf8').replace(/^\uFEFF/u,'')), report = 盘点显式来源(p,{ 用途:'local-source-inventory', 包含私密:true })
  console.log(JSON.stringify(report,null,2)); return report.来源登记完整 ? 0 : 2
}
if (require.main === module) { try { process.exitCode = main(process.argv.slice(2)) } catch (e) { console.error(/^SQLITE_INVENTORY_/u.test(e.message) ? e.message : 'SQLITE_INVENTORY_FAILED'); process.exitCode = 1 } }
module.exports = { main }
