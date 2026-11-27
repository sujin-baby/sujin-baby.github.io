// 로더(Code.gs) — 11/28 사용자 '진행 도우미 켤 때 아직도 너무 느려 30초' 고침 시험
//  ① 코드를 캐시에 나눠 담을 때 한 칸이 100KB(한글 3바이트)를 넘지 않는지 — 넘으면 저장이 통째로 실패해서
//     켤 때마다 1.2MB를 다시 받고 드라이브에 또 쓰고 eval 했음
//  ② 담은 조각을 다시 합치면 원본과 글자까지 같은지 (다르면 화면이 깨짐)
//  ③ 한 칸이라도 빠지면 '' 로 읽어서 GitHub에서 다시 받는지
//  ④ 두 번째 실행은 GitHub를 안 부르고 캐시에서 쓰는지 / 코드가 그대로면(304) 드라이브에 다시 안 쓰는지
//  node loader_test.js <Main.js>
const vm = require('vm');
const fs = require('fs');
const MAIN = process.argv[2] || 'ori/Main.js';
const CODE = require('path').join(__dirname, '..', 'Code.gs');
const SRC = fs.readFileSync(MAIN, 'utf8');
const LIMIT = 102400;   // Apps Script 캐시 한 칸 100KB
const byteLen = s => Buffer.byteLength(s, 'utf8');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

function mkCache() {
  const m = new Map();
  const put = (k, v) => {
    if (byteLen(String(k)) > 250) throw new Error('key too long: ' + k);
    if (byteLen(String(v)) > LIMIT) throw new Error('value too large: ' + byteLen(String(v)));
    m.set(k, String(v));
  };
  return {
    get: k => (m.has(k) ? m.get(k) : null),
    put,
    getAll: keys => { const o = {}; (keys || []).forEach(k => { if (m.has(k)) o[k] = m.get(k); }); return o; },
    putAll: o => { Object.keys(o || {}).forEach(k => put(k, o[k])); },
    remove: k => { m.delete(k); },
    removeAll: ks => { (ks || []).forEach(k => m.delete(k)); },
    _m: m,
  };
}

function mkEnv(opts) {
  const props = new Map(Object.entries(opts.props || {}));
  const cache = mkCache();
  const net = { calls: 0, lastHeaders: null };
  let driveWrites = 0, driveFiles = 0;
  const env = {
    console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, Set, Map, Buffer, parseInt, parseFloat, isNaN,
    encodeURIComponent, decodeURIComponent,
    CONFIG: { TIMEZONE: 'Asia/Seoul', UPDATE_BASE: 'https://x/', KEY: 'k', WEBAPP_URL: 'https://x' },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
        deleteProperty: k => { props.delete(k); },
        getProperties: () => Object.fromEntries(props),
      }),
    },
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      formatDate: () => '11-28 00:00:00',
      getUuid: () => 'uuid',
      computeDigest: () => [],
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        net.calls++;
        const h = (opt && opt.headers) || {};
        net.lastHeaders = h;
        const etag = opts.etag;
        if (h['If-None-Match'] && h['If-None-Match'] === etag) return { getResponseCode: () => 304, getContentText: () => '', getHeaders: () => ({ etag }) };
        return { getResponseCode: () => 200, getContentText: () => opts.body, getHeaders: () => ({ etag, 'Cache-Control': 'max-age=300' }) };
      },
    },
    DriveApp: {
      getFileById: () => ({ setContent: () => { driveWrites++; } }),
      createFile: () => { driveFiles++; return { getId: () => 'BK' }; },
    },
    SpreadsheetApp: { getUi: () => { throw new Error('no ui'); } },
    ScriptApp: { getProjectTriggers: () => [] },
    HtmlService: {}, ContentService: {}, FormApp: {}, MailApp: {}, Logger: { log: () => {} },
    Session: {},
  };
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), env, { filename: 'Code.gs' });
  return { env, cache, net, props, drive: () => ({ writes: driveWrites, files: driveFiles }) };
}

// ①~③: Main.js(실제 1.2MB)를 조각내고 다시 합치기 + 한 칸 빠졌을 때
const e1 = mkEnv({ body: SRC, etag: 'E1', props: { WEBKEY: 'w', DIAGKEY: 'd', ORI_BACKUP_ID: 'BK' } });
const G1 = k => vm.runInContext(k, e1.env);
const parts = G1('oriChunks_(' + JSON.stringify(SRC) + ')');
ok(parts.length > 1, '조각 수 ' + parts.length);
const over = parts.map((p, i) => [i, byteLen(p)]).filter(x => x[1] > LIMIT);
ok(!over.length, '100KB 넘는 조각 ' + JSON.stringify(over.slice(0, 3)));
ok(parts.map(p => p.length).reduce((a, b) => a + b, 0) === SRC.length, '조각 글자 수 합 = 원본');
const joined = parts.join('');
ok(joined === SRC, '조각 합치면 원본과 같음');
// 고치기 전(9만 자씩 잘라 담기)은 한 칸이 100KB를 넘어 저장이 통째로 실패했음 — 이 시험이 그걸 잡아냄
const oldParts = []; for (let i = 0; i < SRC.length; i += 90000) oldParts.push(SRC.slice(i, i + 90000));
ok(oldParts.some(p => byteLen(p) > LIMIT), '고치기 전(9만 자) 방식은 100KB를 넘음 — 옛 방식이면 이 시험이 실패');
ok(parts.length && parts[0].indexOf('/** ORI-MAIN') === 0, '첫 조각이 표식으로 시작');
// 이모지(4바이트)가 조각 경계에서 깨지지 않는지
const emo = 'a'.repeat(79990) + '🐤' + '가나다라마바사';
const ep = G1('oriChunks_(' + JSON.stringify(emo) + ')');
ok(ep.join('') === emo, '이모지 경계 안 깨짐');
ok(ep.every(p => byteLen(p) <= LIMIT), '이모지 조각 크기');

// 담기 → 꺼내기
G1('oriCachePut_') && vm.runInContext('oriCachePut_(CacheService.getScriptCache(), __SRC)', Object.assign(e1.env, { __SRC: SRC }));
ok(e1.cache.get('ori_src_n') === String(parts.length), 'ori_src_n = 조각 수 ' + e1.cache.get('ori_src_n'));
const back = G1('oriCacheGet_(CacheService.getScriptCache())');
ok(back === SRC, '캐시에서 꺼낸 코드가 원본과 같음 (' + (back ? back.length : 0) + '자)');
// 한 칸 지우면 '' → GitHub에서 다시 받음 (깨진 코드를 eval 하지 않음)
e1.cache.remove('ori_src_3');
const broken = G1('oriCacheGet_(CacheService.getScriptCache())');
ok(broken === '', '조각 하나 빠지면 못 씀(빈 값)');
G1('oriCachePut_(CacheService.getScriptCache(), __SRC)');   // 원래대로

// ④ 실제 ori_(): 처음엔 GitHub에서 받아 캐시·백업, 그다음은 GitHub를 안 부르고 캐시로
const e2 = mkEnv({ body: SRC, etag: 'E1', props: { WEBKEY: 'w', DIAGKEY: 'd', ORI_BACKUP_ID: 'BK' } });
let err = '';
try { vm.runInContext('ori_()', e2.env); } catch (e) { err = String(e && e.message || e); }
ok(!err, '첫 실행 오류: ' + err);
ok(e2.net.calls === 1, '처음 한 번 GitHub에서 받음 (네트워크 ' + e2.net.calls + '번)');
ok(e2.cache.get('ori_src_n'), '캐시에 담김');
ok(e2.drive().writes === 1 && e2.drive().files === 0, '드라이브 백업은 바뀔 때만 씀 ' + JSON.stringify(e2.drive()));
ok(e2.env.__ORI_LOADED === true, 'eval 되어 로드 표시');
const load1 = JSON.parse(e2.cache.get('ORI_LOAD') || '{}');
ok(load1.how === '새로받음' && typeof load1.ms === 'number' && load1.cacheOk === true, 'ORI_LOAD 기록(캐시에 담긴 것 확인) ' + JSON.stringify(load1));
// 두 번째 실행(같은 실행 안) → 아무것도 안 함
vm.runInContext('ori_()', e2.env);
ok(e2.net.calls === 1, '같은 실행에서 또 부르면 아무것도 안 함');
// 새 실행(60초 안): 캐시에서 바로, 네트워크 없음
e2.env.__ORI_LOADED = false;
vm.runInContext('ori_()', e2.env);
ok(e2.net.calls === 1, '60초 안에 다시 열면 GitHub를 안 부름 (' + e2.net.calls + '번)');
ok(e2.drive().writes === 1, '드라이브에 다시 안 씀');
// 60초 지난 뒤: '바뀐 게 있나'만 물어봄 → 304 → 그대로 (받지도, 드라이브 쓰지도 않음)
e2.env.__ORI_LOADED = false;
e2.cache.put('ori_src_chk', '0');
vm.runInContext('ori_()', e2.env);
ok(e2.net.calls === 2 && e2.net.lastHeaders && e2.net.lastHeaders['If-None-Match'] === 'E1', '60초 뒤엔 If-None-Match로 한 번 물어봄 ' + JSON.stringify(e2.net.lastHeaders));
ok(e2.drive().writes === 1, '304면 드라이브에 다시 안 씀');
const load2 = JSON.parse(e2.cache.get('ORI_LOAD') || '{}');
ok(load2.how === '안바뀜', '304 기록 ' + JSON.stringify(load2));
// 코드가 바뀐 경우: 새로 받아 캐시·백업을 새로
e2.env.__ORI_LOADED = false;
e2.cache.put('ori_src_chk', '0');
const NEW = SRC.replace('/** ORI-MAIN', '/** ORI-MAIN\n// v2');
const e2fetch = e2.env.UrlFetchApp.fetch;
e2.env.UrlFetchApp.fetch = (u, o) => { e2.net.calls++; return { getResponseCode: () => 200, getContentText: () => NEW, getHeaders: () => ({ etag: 'E2' }) }; };
vm.runInContext('ori_()', e2.env);
ok(e2.drive().writes === 2, '코드가 바뀌면 드라이브 백업을 새로 씀');
ok(vm.runInContext('oriCacheGet_(CacheService.getScriptCache()).length', e2.env) === NEW.length, '바뀐 코드가 캐시에 담김');
e2.env.UrlFetchApp.fetch = e2fetch;

// ⑤ GitHub이 죽어도: 캐시가 있으면 그걸로, 캐시가 없으면 드라이브 백업으로 (예전과 같음)
e2.env.__ORI_LOADED = false;
e2.cache.put('ori_src_chk', '0');
e2.env.UrlFetchApp.fetch = () => { e2.net.calls++; return { getResponseCode: () => 500, getContentText: () => 'boom', getHeaders: () => ({}) }; };
let err3 = '';
try { vm.runInContext('ori_()', e2.env); } catch (e) { err3 = String(e && e.message || e); }
ok(!err3, 'GitHub 500이어도 캐시로 뜸: ' + err3);

console.log(fails.length ? 'XX 로더 시험 실패:\n- ' + fails.join('\n- ') : '✓ 로더: 조각(80KB) 저장·합치기·캐시로 열기·304·바뀌면 새로 받기 시험 통과');
process.exit(fails.length ? 1 : 0);
