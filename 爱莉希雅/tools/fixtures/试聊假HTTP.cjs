'use strict'
global.fetch=async(_url,options)=>{const request=JSON.parse(options.body);if(!options.headers.authorization.startsWith('Bearer test-only-')||request.model!=='deepseek-flash')throw Error('FIXTURE_REQUEST_INVALID');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'你好，我在这里。'}}],usage:null}),{headers:{'content-type':'application/json'}})}
