/** Synthetic-only, read-only source preview. Incomplete sources cannot authorize generation. */
'use strict'
const {createHash}=require('node:crypto'),{创建异步仓储门面}=require('../storage/sqlite-async-facade.cjs'),{校验隔离后台调度}=require('./隔离一次性假发送.cjs'),{规整来源}=require('../脑/记忆日记.cjs')
const fail=c=>{throw Error('ASYNC_DIARY_SOURCE_'+c)},short=x=>createHash('sha256').update(String(x)).digest('hex').slice(0,16),clip=(x,n)=>String(x??'').trim().replace(/\s+/gu,' ').slice(0,n)
function parse(v){const s=String(v??'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/u);return m?new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)):new Date(s)}
function 创建隔离异步日记来源({actor,调度器}={}){校验隔离后台调度(调度器,actor);const f=创建异步仓储门面(actor)
 async function 采集({开始,结束}={}){if(typeof 开始!=='string'||typeof 结束!=='string'||!Number.isFinite(Date.parse(开始))||!Number.isFinite(Date.parse(结束))||new Date(开始).toISOString()!==开始||new Date(结束).toISOString()!==结束||Date.parse(开始)>=Date.parse(结束))fail('PERIOD_INVALID');const start=Date.parse(开始),end=Date.parse(结束),inPeriod=x=>{const t=parse(x).getTime();return Number.isFinite(t)&&t>=start&&t<end},sources=[],sessions=await f.会话.列对话({上限:200});if(sessions.还有)fail('SESSION_LIMIT');const mem=await f.记忆.取统计()
  async function readPages(method,q,conversation){let cursor=null,pages=0;do{if(++pages>100)fail('PAGE_LIMIT');const page=await method({...q,大小:200,...(cursor?{游标:cursor}:{})});for(const wrap of page.消息){const row=wrap.原始??wrap,role=row.角色,content=clip(row.内容,800),at=String(row.时间||'');if(!['user','assistant'].includes(role)||!content||!inPeriod(at))continue;const group=String(row.对话||conversation||'最早');sources.push({编号:'聊天:'+short(`${group}|${at}|${role}|${row.内容}`),类型:'聊天',时间:at,标题:(role==='user'?'他':'她')+'在对话中说',摘要:content})}cursor=page.下一页}while(cursor)}
  for(const session of sessions.对话们){if(!session.写长期记忆)continue;await readPages(f.旧格式.读消息页,{对话:session.编号},session.编号)}await readPages(f.旧格式.读最早历史页,{},'最早')
  for(const type of ['事实','经历','小本子']){const rows=await f.记忆.列长期({类别:type,上限:1000});if(rows.版本!==mem.版本)fail('MEMORY_CONFLICT');if(rows.还有)fail('MEMORY_LIMIT');for(const row of rows.列表)if(inPeriod(row.时间))sources.push({编号:`长期记忆:${type}:${row.编号}`,类型:'长期记忆',时间:row.时间,标题:type,摘要:clip(row.内容,800)})}
  const tmp=await f.记忆.查询临时({确认状态:'已确认',包括归档:true,限量:1000});if(tmp.版本!==mem.版本)fail('MEMORY_CONFLICT');if(tmp.截断)fail('MEMORY_LIMIT');for(const row of tmp.列表){const at=row.更新于||row.创建于;if(inPeriod(at))sources.push({编号:`临时记忆:${row.编号}`,类型:'已确认临时记忆',时间:at,标题:row.类别,摘要:clip(row.内容,800)})}
  const backend=await f.状态.打开后端('work-index','main');let work;try{work=await backend.读取分段快照()}finally{await backend.关闭()}if(work.数据!==null&&!Array.isArray(work.数据))fail('WORK_INVALID');for(const row of work.数据??[]){if(!inPeriod(row.完成时间))continue;sources.push({编号:`工作:${row.编号}`,类型:'工作回执',时间:row.完成时间,标题:`${row.状态} · ${clip(row.目标,80)}`,摘要:clip(`${row.目标}；${row.结果摘要}`,1000)})}
  const after=await f.会话.列对话({上限:200}),afterMem=await f.记忆.取统计();if(after.还有||JSON.stringify(after.对话们)!==JSON.stringify(sessions.对话们))fail('SESSION_CONFLICT');if(afterMem.版本!==mem.版本)fail('MEMORY_CONFLICT');const again=await f.状态.打开后端('work-index','main');try{if((await again.读取分段快照()).版本!==work.版本)fail('WORK_CONFLICT')}finally{await again.关闭()}
  sources.sort((a,b)=>String(a.时间).localeCompare(String(b.时间)));return{好:true,来源:规整来源(sources),完整:false,缺失:['学习进度尚未接入','工作索引迁移覆盖范围尚未核验']}
 }
 return Object.freeze({采集})
}
module.exports={创建隔离异步日记来源}
