/** 内部同库来源能力；未登记时不扩展原记忆仓储依赖或来源范围。 */
'use strict'
const 来源们 = new WeakMap()
const 元数据们 = new WeakMap()
const 旧记忆们 = new WeakMap()
function 登记旧来源(上下文, 读取) { 来源们.set(上下文, 读取) }
function 读取旧来源(上下文, 号, 要许可) { return 来源们.get(上下文)?.(号, 要许可) ?? null }
function 登记旧元数据(上下文, 写) { 元数据们.set(上下文, 写) }
function 更新旧元数据(上下文, 号, 选项, 版本) { return 元数据们.get(上下文)?.(号, 选项, 版本) }
function 登记旧记忆基线(上下文, 读, 核验) { 旧记忆们.set(上下文, { 读, 核验 }) }
function 保留旧长期口吻(上下文, 类别, 号, 正文) { return 旧记忆们.get(上下文)?.读(类别, 号, 正文) === true }
function 核验旧记忆基线(上下文) { 旧记忆们.get(上下文)?.核验() }
module.exports = { 登记旧来源, 读取旧来源, 登记旧元数据, 更新旧元数据, 登记旧记忆基线, 保留旧长期口吻, 核验旧记忆基线 }
