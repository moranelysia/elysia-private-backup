'use strict'
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {盘点显式来源,核心域}=require('../storage/source-inventory.cjs'),{识别来源}=require('../storage/sqlite-sources.cjs')
const scope={用途:'local-source-inventory',包含私密:true},测试=[],测=(n,f)=>测试.push([n,f]),拷=x=>JSON.parse(JSON.stringify(x))
const files=new Set(['resource/persona','local/configuration',...['main.js','preload.js','package.json','package-lock.json','icon.ico','desktop-icon.ico'].map(x=>'source/'+x),'workspace/start-all.cmd','workspace/start-all.cjs'])
function 用目录(f){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'elysia-source-B-'))
 try{const 根=核心域.map((域,i)=>{const 路径=path.join(root,'root-'+i);if(files.has(域))fs.writeFileSync(路径,'SOURCE_CONTENT_NEVER_READ');else fs.mkdirSync(路径);return{域,路径,模式:域==='cache'?'cache':files.has(域)?'file':'tree',允许缺省:false,缺省说明:''}}),profile={版本:1,根},定位=域=>根.find(r=>r.域===域).路径
  const 写=(域,相对,内容='BODY_MUST_NOT_APPEAR')=>{const p=path.join(定位(域),相对);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,内容);return p}
  return f({root,profile,定位,写,检查:()=>盘点显式来源(profile,scope)})
 }finally{const p=fs.realpathSync(root);assert.equal(path.dirname(p).toLowerCase(),fs.realpathSync(os.tmpdir()).toLowerCase());assert.ok(path.basename(p).startsWith('elysia-source-B-'));fs.rmSync(p,{recursive:true,force:true})}}
测('显式全根登记包含业务/独立渠道/工作学习/发布资源，报告不含正文',()=>用目录(({写,检查})=>{
 for(const [d,p]of[['data','事实.json'],['data','尺子对账.jsonl'],['data','小测试.txt'],['data','聊天记录/清理前2026.jsonl'],['data','附件/a.bin'],['cache','表达反馈.json'],['cache','没做完的-old-chat.json'],['channels','fake/任务.json'],['channels','fake/映射.json'],['workspace/学习','进度.md'],['workspace/工作','结果.txt']])写(d,p)
 const r=检查();assert.equal(r.来源登记完整,true);assert.equal(r.可切换,false);assert.equal(JSON.stringify(r).includes('BODY_MUST_NOT_APPEAR'),false);assert.ok(r.来源.some(x=>x.去向==='state'&&x.来源.startsWith('channels/')));assert.ok(r.后续必须.includes('CONTENT_HASH_NOT_VERIFIED'))
}))
测('所有内容读取与写入API被阻断后仍能盘点元数据',()=>用目录(({检查,写})=>{
 写('data','事实.json');const old=Object.fromEntries(['readFileSync','writeFileSync','openSync','mkdirSync','renameSync','unlinkSync'].map(k=>[k,fs[k]]));try{for(const k of Object.keys(old))fs[k]=()=>assert.fail('CONTENT_IO');assert.equal(检查().来源登记完整,true)}finally{Object.assign(fs,old)}
}))
测('未知业务文件明确阻断，不因有扩展名就吞入',()=>用目录(({写,检查})=>{写('data','新记忆.json');const r=检查();assert.equal(r.来源登记完整,false);assert.deepEqual(r.未登记,['data/新记忆.json']);assert.ok(r.阻断.includes('UNMAPPED_SOURCE'))}))
测('未知缓存JSON和目录都阻断且不递归读取未登记目录',()=>用目录(({写,检查,定位})=>{
 写('cache','新状态.json');写('cache','陌生目录/x.json');const old=fs.readdirSync;try{fs.readdirSync=function(p,...a){assert.notEqual(String(p),path.join(定位('cache'),'陌生目录'));return old.call(this,p,...a)};const r=检查();assert.equal(r.来源登记完整,false);assert.deepEqual(r.未登记,['cache/新状态.json','cache/陌生目录'])}finally{fs.readdirSync=old}
}))
测('临时对话纸条/测试产物/重建依赖明确排除，正式纸条单独保留',()=>用目录(({写,检查})=>{
 for(const p of ['没做完的-temp-a.json','UI阶段2-改造后.json','probe-v12.log','a.png','工具输出/a.txt'])写('cache',p)
 写('source/tools','node_modules/nested/file.js');写('cache','没做完的-channel-a.json');const r=检查();assert.equal(r.来源登记完整,true);assert.ok(r.来源.filter(x=>x.去向==='excluded').length>=6);assert.ok(r.来源.some(x=>x.来源==='cache/没做完的-channel-a.json'&&x.去向==='external'))
}))
测('密钥/登录态/本机设置只登记元数据，不作为可携带业务文件',()=>用目录(({写,检查})=>{
 写('source/脑','钥匙.txt');写('cache','deepseek-api-key.dat');写('cache','设置.json');写('workspace/学习','.env');const r=检查();assert.equal(r.来源.filter(x=>x.去向==='separate-secret').length,5);assert.equal(识别来源('workspace/学习/.env').去向,'separate-secret')
}))
测('秘密混入数据根时另行阻断，不当成已可迁移业务',()=>用目录(({写,检查})=>{写('data','附件/.env');assert.ok(检查().阻断.includes('SECRET_IN_DATA_ROOT'))}))
测('缺省根必须明确原因，已登记文件缺省逐项列出但不创建',()=>用目录(({profile,检查})=>{
 profile.根.find(x=>x.域==='channels').路径=null;profile.根.find(x=>x.域==='channels').允许缺省=true;profile.根.find(x=>x.域==='channels').缺省说明='尚未接入真实渠道'
 const r=检查();assert.equal(r.缺省[0].状态,'未配置');assert.ok(r.未存在的已登记业务.includes('data/事实.json'));assert.ok(r.未存在的已登记缓存.includes('cache/后台缓冲.json'));assert.equal(r.来源登记完整,true)
}))
测('已配置但缺失的必需根拒绝；可选缺失仍保存不存在状态',()=>用目录(({profile,root,检查})=>{
 const r=profile.根.find(x=>x.域==='channels');r.路径=path.join(root,'absent');assert.throws(检查);r.允许缺省=true;r.缺省说明='登记明确尚不存在';assert.equal(检查().缺省[0].状态,'不存在')
}))
测('遗漏一个根/重复根/未知域/错误模式均拒绝，不补默认生产路径',()=>用目录(({profile})=>{
 for(const change of[p=>p.根.pop(),p=>p.根.push(拷(p.根[0])),p=>p.根[0].域='arbitrary',p=>p.根[0].模式='cache']){const q=拷(profile);change(q);assert.throws(()=>盘点显式来源(q,scope))}
}))
测('未显式private或getter/非纯数据拒绝，不执行getter',()=>用目录(({profile})=>{
 assert.throws(()=>盘点显式来源(profile,{用途:scope.用途,包含私密:false}));assert.throws(()=>盘点显式来源(profile,{get 用途(){assert.fail('GETTER')},包含私密:true}));assert.throws(()=>盘点显式来源({...profile,多余:true},scope))
}))
测('绝对路径/父子重叠/同根别名边界拒绝',()=>用目录(({profile,定位})=>{
 for(const p of['relative',path.parse(定位('data')).root,定位('data'),path.join(定位('data'),'nested')]){const q=拷(profile);q.根.find(x=>x.域==='channels').路径=p;assert.throws(()=>盘点显式来源(q,scope))}
}))
测('文件模式与目录模式不符拒绝',()=>用目录(({profile})=>{const q=拷(profile);q.根.find(x=>x.域==='data').模式='file';assert.throws(()=>盘点显式来源(q,scope))}))
测('登记为业务文件的路径变成目录时明确报错，不误报文件缺省',()=>用目录(({定位,检查})=>{fs.mkdirSync(path.join(定位('data'),'事实.json'));assert.throws(检查,{message:'SQLITE_INVENTORY_SOURCE_TYPE_INVALID'})}))
测('目录junction及根祖先junction不跟随',()=>用目录(({定位,root,检查,profile})=>{
 const other=path.join(root,'outside');fs.mkdirSync(other);fs.symlinkSync(other,path.join(定位('data'),'linked'),'junction');assert.throws(检查,{message:'SQLITE_INVENTORY_LINK_FORBIDDEN'})
 const q=拷(profile);q.根.find(x=>x.域==='data').路径=path.join(定位('data'),'linked','child');assert.throws(()=>盘点显式来源(q,scope),{message:'SQLITE_INVENTORY_LINK_FORBIDDEN'})
}))
测('硬链接拒绝，避免同一来源以两个文件名进入备份',()=>用目录(({写,定位,检查})=>{const a=写('data','附件/a.bin');fs.linkSync(a,path.join(定位('data'),'附件/b.bin'));assert.throws(检查,{message:'SQLITE_INVENTORY_FILE_INVALID'})}))
测('两次元数据间变动拒绝，不输出完整一致报告',()=>用目录(({写,检查})=>{
 const p=写('data','事实.json'),old=fs.lstatSync;let done=false;try{fs.lstatSync=function(f,opt){const s=old.call(this,f,opt);if(String(f)===p&&opt?.bigint&&!done){done=true;fs.appendFileSync(p,'changed')}return s};assert.throws(检查,{message:'SQLITE_INVENTORY_SOURCE_CHANGED'})}finally{fs.lstatSync=old}
}))
测('额外工作区必须以显式域登记，不能猜工作索引的外部路径',()=>用目录(({root,profile,检查})=>{
 const p=path.join(root,'work-other');fs.mkdirSync(p);fs.writeFileSync(path.join(p,'result.txt'),'not-read');profile.根.push({域:'workspace/工作-123456abcdef',路径:p,模式:'tree',允许缺省:false,缺省说明:''});assert.ok(检查().来源.some(x=>x.来源==='workspace/工作-123456abcdef/result.txt'&&x.去向==='external'))
}))
测('关系图与日记路径严格绑定类型/年份，不把非法路径当已登记',()=>{
 assert.equal(识别来源('data/日记/日/2026/2026-W42.json').去向,'unmapped');assert.equal(识别来源('data/日记/私密/2025/2026-10-25.json').去向,'unmapped');assert.equal(识别来源('data/日记/周/2026/2026-W42.json').类型,'diary')
})
测('CLI只接受显式绝对profile，覆盖完整/未知项返回码且不进入自动复制',()=>用目录(({profile,root,写})=>{
 const {main}=require('./检查SQLite来源登记.cjs'),p=path.join(root,'profile.json');fs.writeFileSync(p,JSON.stringify(profile));const log=console.log;try{console.log=()=>{};assert.equal(main(['--profile',p,'--include-private-local']),0);写('data','unknown.json');assert.equal(main(['--profile',p,'--include-private-local']),2);assert.throws(()=>main([]));assert.throws(()=>main(['--profile','relative.json','--include-private-local']))}finally{console.log=log}
}))
let pass=0;for(const[n,f]of 测试){try{f();pass++;console.log('PASS '+n)}catch(e){console.error('FAIL '+n+'\n'+e.stack)}}console.log(`SQLite S-15F3B inventory: ${pass}/${测试.length}`);if(pass!==测试.length)process.exitCode=1
