/** E3 synthetic in-memory format experiment; no storage, recovery or authorization. */
'use strict'
const { createHash } = require('node:crypto')
const { 纯数据 } = require('./sqlite-state.cjs')
const { makeLog, validateLog } = require('./sqlite-worker-protocol.cjs')
const SEGMENT_ROWS = 32, SEGMENT_BYTES = 65536, MAX_SEGMENTS = 64, GENESIS = '0'.repeat(64)
const fail = code => { throw Error('SQLITE_RECEIPT_SEGMENT_' + code) }
const hash = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
const fields = (o, names) => { if (!o || Object.getPrototypeOf(o) !== Object.prototype || Object.keys(o).sort().join(',') !== names.slice().sort().join(',')) fail('INPUT_INVALID') }
function validateRows(rows) { validateLog(makeLog(rows)) }
function seal(number, previous, rows) {
  const body = { 版本:1, 序号:number, 前指纹:previous, 回执:rows }
  const segment = { ...body, 指纹:hash(body) }
  if (Buffer.byteLength(JSON.stringify(segment)) > SEGMENT_BYTES) fail('SEGMENT_LIMIT')
  return segment
}
function 创建虚构回执分段(raw) {
  const rows = 纯数据(raw)
  if (!Array.isArray(rows) || rows.length > MAX_SEGMENTS * SEGMENT_ROWS) fail('LIMIT')
  const segments=[], seen=new Set(); let previous=GENESIS
  for(let n=0;n<rows.length;n+=SEGMENT_ROWS){const part=rows.slice(n,n+SEGMENT_ROWS);validateRows(part);for(const r of part){if(seen.has(r.编号))fail('DUPLICATE');seen.add(r.编号)}const segment=seal(segments.length+1,previous,part);segments.push(segment);previous=segment.指纹}
  return { 版本:1, 用途:'synthetic-receipt-segments', 段:segments, 链头:{ 段数:segments.length, 回执数:rows.length, 尾指纹:previous } }
}
function 核验虚构回执分段(raw) {
  const pack=纯数据(raw);fields(pack,['版本','用途','段','链头']);fields(pack.链头,['段数','回执数','尾指纹'])
  if(pack.版本!==1||pack.用途!=='synthetic-receipt-segments'||!Array.isArray(pack.段)||pack.段.length>MAX_SEGMENTS||!Number.isSafeInteger(pack.链头.段数)||!Number.isSafeInteger(pack.链头.回执数)||pack.链头.段数!==pack.段.length||typeof pack.链头.尾指纹!=='string')fail('INPUT_INVALID')
  const rows=[],seen=new Set();let previous=GENESIS
  for(let i=0;i<pack.段.length;i++){
    const s=pack.段[i];fields(s,['版本','序号','前指纹','回执','指纹'])
    if(s.版本!==1||s.序号!==i+1||s.前指纹!==previous||!Array.isArray(s.回执)||s.回执.length<1||s.回执.length>SEGMENT_ROWS||(i<pack.段.length-1&&s.回执.length!==SEGMENT_ROWS)||typeof s.指纹!=='string')fail('CHAIN_INVALID')
    const expected=seal(s.序号,s.前指纹,s.回执);if(expected.指纹!==s.指纹)fail('HASH_INVALID')
    validateRows(s.回执)
    for(const r of s.回执){if(seen.has(r.编号))fail('DUPLICATE');seen.add(r.编号);rows.push(r)}
    previous=s.指纹
  }
  if(pack.链头.尾指纹!==previous||pack.链头.回执数!==rows.length)fail('HEAD_MISMATCH')
  return { 段数:pack.段.length, 回执数:rows.length, 尾指纹:previous, 回执:rows }
}
module.exports = { 创建虚构回执分段, 核验虚构回执分段, SEGMENT_ROWS, SEGMENT_BYTES, MAX_SEGMENTS }
