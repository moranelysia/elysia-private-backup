// 转接层（bridge）—— 爱莉希雅的声音，从这里接到 DSH。
//
// 为什么要它：
//   dsh-voice-chat 插件只会说「OpenAI 那套话」——POST {baseUrl}/audio/speech
//   { model, input, voice }，然后收音频字节；而且它把返回的音频一律当成 MP3。
//   本地 GPT-SoVITS 说的是另一套（POST /tts，要参考音频和台词），还只吐 WAV。
//   所以中间垫这一层：收 OpenAI 形态 → 转成 GPT-SoVITS 形态 → 拿回 WAV → 转 MP3 → 还回去。
//
// 用法：先起 GPT-SoVITS 的 api_v2.py（127.0.0.1:9880），再跑这个。
//   node tools\voice\tts-bridge.cjs
// 声音的一切参数都在 tools\voice\voice.json 里，改完不用重启这个进程（每次请求都重读）。

'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'voice.json');
const TMP_DIR = path.join(ROOT, '.tmp');

/** 各版本的权重路径（相对 D:\GPT-SoVITS）。换版本 = 改 voice.json 里的 version。 */
const WEIGHTS = {
  v2: {
    gpt: 'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt',
    sovits: 'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2G2333k.pth',
  },
  v2Pro: {
    gpt: 'GPT_SoVITS/pretrained_models/s1v3.ckpt',
    sovits: 'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2Pro.pth',
  },
  v2ProPlus: {
    gpt: 'GPT_SoVITS/pretrained_models/s1v3.ckpt',
    sovits: 'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth',
  },
  // ★ 微调训练出来的她自己（2026-09-19 训练完成）
  //   SoVITS: 261 段 / 15.9 分钟，8 轮，batch 3
  //   GPT:    15 轮，batch 4
  //   用 voice.json 里 "version": "elysia" 切过来
  elysia: {
    gpt: 'GPT_weights_v2Pro/elysia-e15.ckpt',
    sovits: 'SoVITS_weights_v2Pro/elysia_e8_s704.pth',
  },
  // 训练中途的存档，留着做对比（轮数少 → 学得浅，音色可能更接近基础模型）
  elysia_e4: {
    gpt: 'GPT_weights_v2Pro/elysia-e5.ckpt',
    sovits: 'SoVITS_weights_v2Pro/elysia_e4_s352.pth',
  },
};

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function log(...a) {
  const t = new Date().toTimeString().slice(0, 8);
  console.log('[' + t + ']', ...a);
}

// ---------------------------------------------------------------- 等 GPT-SoVITS 就位

/** 能不能连上端口。比发 HTTP 请求轻。 */
function portOpen(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

async function waitForApi(cfg, timeoutMs = 300000) {
  const u = new URL(cfg.sovitsApi);
  const t0 = Date.now();
  let last = 0;
  for (;;) {
    if (await portOpen(u.hostname, Number(u.port))) return true;
    const waited = Math.round((Date.now() - t0) / 1000);
    if (waited - last >= 15) {
      last = waited;
      log(`等 GPT-SoVITS 起来…… ${waited}s（它要加载三套权重，通常两分半）`);
    }
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** 让服务端加载 voice.json 里指定的那套权重。它自己会按路径认出 v2/v2Pro。 */
async function applyWeights(cfg) {
  const w = WEIGHTS[cfg.version];
  if (!w) {
    log('⚠️ voice.json 里的 version 不认识：' + cfg.version + '（可选 ' + Object.keys(WEIGHTS).join('/') + '）');
    return;
  }
  const base = cfg.sovitsApi.replace(/\/+$/, '');
  for (const [key, api] of [['gpt', 'set_gpt_weights'], ['sovits', 'set_sovits_weights']]) {
    const url = `${base}/${api}?weights_path=${encodeURIComponent(w[key])}`;
    try {
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(body));
      log(`权重就位：${key} → ${path.basename(w[key])}`);
    } catch (e) {
      log(`⚠️ 换 ${key} 权重失败：${e.message}（先用服务端当前加载的那套继续）`);
    }
  }
}

// ---------------------------------------------------------------- 文本清洗与截断

/**
 * 插件那边其实已经清过一遍 markdown/emoji 了，这里是第二道保险：
 * 万一以后有别的调用方（比如我自己写脚本）直接打这个接口，也不会把代码念出来。
 */
function sanitize(input, maxChars) {
  let s = String(input || '');
  s = s.replace(/```[\s\S]*?```/g, '。');            // 代码块整块丢掉
  s = s.replace(/`([^`]*)`/g, '$1');                 // 行内代码去掉反引号
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');   // 链接只留文字
  s = s.replace(/https?:\/\/\S+/g, '链接');
  s = s.replace(/\*\*|__|~~/g, '');
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');          // 标题号
  s = s.replace(/^\s{0,3}[-*+]\s+/gm, '');           // 列表符号
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  s = s.replace(/[|]/g, '，');                        // 表格竖线
  s = s.replace(/\r/g, '');
  s = s.replace(/\n{2,}/g, '。');
  s = s.replace(/\n/g, '，');
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');  // emoji
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/([，。！？、；：])\1+/g, '$1');       // 重复标点压掉
  s = s.replace(/^[，。、；：\s]+/, '');
  s = s.trim();

  if (maxChars && s.length > maxChars) {
    const head = s.slice(0, maxChars);
    const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('，'));
    s = (cut > maxChars * 0.5 ? head.slice(0, cut + 1) : head) + '……';
    log(`⚠️ 文本超过 ${maxChars} 字，截断后合成（原 ${String(input).length} 字）`);
  }
  return s;
}

// ---------------------------------------------------------------- 合成

function sovitsBody(text, cfg, streaming = false) {
  const ref = cfg.refs[cfg.ref];
  if (!ref) throw new Error('voice.json 里没有这个参考音频：' + cfg.ref);

  return {
    text,
    text_lang: 'zh',
    ref_audio_path: ref.file,
    prompt_text: ref.text,
    prompt_lang: 'zh',
    text_split_method: 'cut5',
    media_type: streaming ? 'raw' : 'wav',
    // 模式 2 会在单句仍在生成时持续吐 PCM；比模式 3 稳定，又比模式 1 更早出首块。
    streaming_mode: streaming ? (cfg.streamingMode ?? 2) : false,
    overlap_length: cfg.streamOverlapLength ?? 2,
    min_chunk_length: cfg.streamMinChunkLength ?? 16,
    speed_factor: cfg.speed ?? 1.0,
    temperature: cfg.temperature ?? 1.0,
    top_k: cfg.top_k ?? 15,
    top_p: cfg.top_p ?? 1,
    repetition_penalty: cfg.repetition_penalty ?? 1.35,
    sample_steps: cfg.sample_steps ?? 32,
    seed: cfg.seed ?? -1,
    batch_size: 1,
    parallel_infer: true,
  };
}

/** 调 GPT-SoVITS 的 /tts，拿回 WAV。 */
async function synthesize(text, cfg) {
  const body = sovitsBody(text, cfg, false);

  const res = await fetch(cfg.sovitsApi.replace(/\/+$/, '') + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('GPT-SoVITS 返回 ' + res.status + ' ' + t.slice(0, 200));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('GPT-SoVITS 返回的字节太少：' + buf.length);
  return buf;
}

/** 直接转发 GPT-SoVITS 的单声道 s16le PCM 块，不再等完整 WAV 或调用 ffmpeg。 */
async function synthesizePcmStream(text, cfg, { onReady, onChunk, signal, fetchImpl = fetch } = {}) {
  const body = sovitsBody(text, cfg, true);
  const res = await fetchImpl(cfg.sovitsApi.replace(/\/+$/, '') + '/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error('GPT-SoVITS 返回 ' + res.status + ' ' + t.slice(0, 200));
  }
  if (!res.body) throw new Error('GPT-SoVITS 没有返回音频流');
  if (typeof onReady === 'function') onReady({ sampleRate: cfg.streamSampleRate ?? 32000 });

  let bytes = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || !value.byteLength) continue;
    const chunk = Buffer.from(value);
    bytes += chunk.length;
    if (typeof onChunk === 'function') await onChunk(chunk);
  }
  if (bytes < 2) throw new Error('GPT-SoVITS 返回的 PCM 流是空的');
  return { bytes, sampleRate: cfg.streamSampleRate ?? 32000 };
}

/** WAV → MP3。插件把返回的音频一律当 MP3 播，所以必须转。 */
function wavToMp3(wavBuf, cfg) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const stamp = Date.now() + '-' + process.pid + '-' + Math.floor(Math.random() * 1e6);
  const inFile = path.join(TMP_DIR, stamp + '.wav');
  const outFile = path.join(TMP_DIR, stamp + '.mp3');
  fs.writeFileSync(inFile, wavBuf);
  try {
    // stdio 全程 ignore：沙箱里不能给子进程开管道，落了盘再读文件最稳。
    const r = spawnSync(cfg.ffmpeg, ['-y', '-v', 'error', '-i', inFile, '-b:a', '128k', outFile], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error('ffmpeg 退出码 ' + r.status);
    return fs.readFileSync(outFile);
  } finally {
    for (const f of [inFile, outFile]) {
      try { fs.unlinkSync(f); } catch { /* 清不掉就算了 */ }
    }
  }
}

/** GPT-SoVITS 一次只该跑一个请求，排队。 */
let queue = Promise.resolve();
let busy = 0;
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

// ---------------------------------------------------------------- HTTP

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function sendJson(res, status, obj) {
  const b = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  send(res, status, b, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

async function handleSpeech(req, res) {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    return sendJson(res, 500, { error: { message: '读不了 voice.json：' + e.message } });
  }

  const payload = await readJson(req);
  const rawText = String(payload.input ?? payload.text ?? '').trim();
  if (!rawText) return sendJson(res, 400, { error: { message: 'input 是空的' } });

  const text = sanitize(rawText, cfg.maxChars);
  if (!text) return sendJson(res, 400, { error: { message: '清洗完只剩空字符串' } });

  busy++;
  const t0 = Date.now();
  try {
    const wav = await enqueue(() => synthesize(text, cfg));
    const mp3 = wavToMp3(wav, cfg);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const audioSec = ((mp3.length * 8) / 128000).toFixed(1);
    log(`合成 ${text.length} 字 → 约 ${audioSec}s 语音，用时 ${sec}s  [${cfg.version}/${cfg.ref}/T${cfg.temperature}]`);
    send(res, 200, mp3, { 'Content-Type': 'audio/mpeg', 'Content-Length': mp3.length });
  } catch (e) {
    log('✗ 合成失败：' + e.message);
    sendJson(res, 502, { error: { message: '本地 GPT-SoVITS 合成失败：' + e.message } });
  } finally {
    busy--;
  }
}

async function handleSpeechStream(req, res) {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    return sendJson(res, 500, { error: { message: '读不了 voice.json：' + e.message } });
  }

  const payload = await readJson(req);
  const rawText = String(payload.input ?? payload.text ?? '').trim();
  if (!rawText) return sendJson(res, 400, { error: { message: 'input 是空的' } });
  const text = sanitize(rawText, cfg.maxChars);
  if (!text) return sendJson(res, 400, { error: { message: '清洗完只剩空字符串' } });

  busy++;
  const t0 = Date.now();
  const controller = new AbortController();
  let started = false;
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const info = await enqueue(() => synthesizePcmStream(text, cfg, {
      signal: controller.signal,
      onReady: ({ sampleRate }) => {
        started = true;
        res.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'audio/L16',
          'X-Audio-Format': 'pcm_s16le',
          'X-Sample-Rate': String(sampleRate),
          'Transfer-Encoding': 'chunked',
        });
      },
      onChunk: (chunk) => {
        if (!res.destroyed) res.write(chunk);
      },
    }));
    if (!res.destroyed) res.end();
    log(`流式合成 ${text.length} 字 → ${(info.bytes / 1024).toFixed(1)}KB PCM，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    if (e.name === 'AbortError') log('流式合成已取消');
    else log('✗ 流式合成失败：' + e.message);
    if (!started && !res.headersSent) {
      sendJson(res, e.name === 'AbortError' ? 499 : 502, { error: { message: e.name === 'AbortError' ? '流式合成已取消' : '本地 GPT-SoVITS 流式合成失败：' + e.message } });
    } else if (!res.destroyed) {
      res.destroy(e);
    }
  } finally {
    busy--;
  }
}

async function main() {
  const cfg = loadConfig();
  log(`转接层启动 —— 声音配置：${cfg.version} / ${cfg.ref} / temperature ${cfg.temperature}`);

  const ready = await waitForApi(cfg);
  if (ready) {
    log('GPT-SoVITS 已就位');
    await applyWeights(cfg);

    // 预热：刚加载完权重的第一次推理要编译 CUDA 内核，实测要 44 秒；
    // 先拿一句短话把它跑热，第一句真话才不会卡成那样。
    if (cfg.warmup !== false) {
      const t = Date.now();
      try {
        const wav = await synthesize(sanitize(cfg.warmupText || '嗯，我准备好了。', 0), cfg);
        log(`预热完成，用了 ${((Date.now() - t) / 1000).toFixed(1)} 秒（第一次推理本来就要这么久）`);
      } catch (e) {
        log('⚠️ 预热失败（不影响后面）：' + e.message);
      }
    }
  } else {
    log('⚠️ 等了 5 分钟也没等到 GPT-SoVITS —— 先起转接层，合成请求会返回 502');
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const p = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'POST' && (p === '/audio/speech' || p === '/v1/audio/speech')) {
      handleSpeech(req, res).catch((e) => sendJson(res, 500, { error: { message: String(e) } }));
      return;
    }
    if (req.method === 'POST' && (p === '/audio/speech/stream' || p === '/v1/audio/speech/stream')) {
      handleSpeechStream(req, res).catch((e) => {
        if (!res.headersSent) sendJson(res, 500, { error: { message: String(e) } });
        else res.destroy(e);
      });
      return;
    }
    if (req.method === 'GET' && (p === '/health' || p === '/')) {
      const c = loadConfig();
      const u = new URL(c.sovitsApi);
      portOpen(u.hostname, Number(u.port), 600).then((sovitsReady) => {
        sendJson(res, 200, {
          ok: sovitsReady,
          sovitsReady,
          busy,
          version: c.version,
          ref: c.ref,
          temperature: c.temperature,
          speed: c.speed,
          maxChars: c.maxChars,
          sovitsApi: c.sovitsApi,
        });
      }).catch((e) => sendJson(res, 500, { ok: false, sovitsReady: false, error: e.message }));
      return;
    }
    sendJson(res, 404, { error: { message: '没有这个接口：' + p } });
  });

  server.listen(cfg.port, '127.0.0.1', () => {
    log(`在 http://127.0.0.1:${cfg.port} 上听 —— 插件那边 Base URL 填 http://127.0.0.1:${cfg.port}/v1`);
  });
}

module.exports = { sanitize, sovitsBody, synthesizePcmStream };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
