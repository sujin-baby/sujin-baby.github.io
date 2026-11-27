// 진행 도우미 걸린 시간 알려 주기 (11/28 사용자: 휴대폰 링크로 열면 30초 → 어디서 걸리는지 재기)  node ptime_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
G("HtmlService.createHtmlOutput = function (h) { globalThis.__H = h; var o = { setTitle: function () { return o; }, addMetaTag: function () { return o; } }; return o; }");
// 1) 웹 화면엔 서버 시작·끝 시각, 시트 옆(side)은 null. 자리표시 안 남음
G("toolsPage_({}, 'web', { s: 1000, e: 1900 })"); const web = String(env.__H);
ok(web.indexOf('__SRV__') < 0 && web.indexOf('SRV = {"s":1000,"e":1900}') >= 0, '웹 화면에 서버 시각');
G("toolsPage_({}, 'side')"); ok(String(env.__H).indexOf('SRV = null') >= 0, '시트 옆 화면은 SRV null');
// 2) 화면 쪽 알려 주기: 다 뜬 뒤 한 번만, 누른 시각(oriTap)은 쓰고 지움
const js = web.slice(web.indexOf('// 걸린 시간 알려 주기'), web.indexOf('</script>', web.indexOf('// 걸린 시간 알려 주기')));
const imgs = [], ls = { oriTap: '500' }, timers = [];
const sb = { MODE: 'web', SRV: { s: 1000, e: 1900 }, EXEC: 'https://x/exec', K: 'kk', Date: { now: () => 5000 }, Math, Number, encodeURIComponent,
  performance: { timeOrigin: 2500.4 }, localStorage: { getItem: k => ls[k] || null, removeItem: k => { delete ls[k]; } },
  document: { readyState: 'complete', documentElement: { innerHTML: 'x'.repeat(3000) } }, window: { addEventListener: () => {} },
  setTimeout: (f) => timers.push(f), Image: function () { const o = {}; imgs.push(o); return o; } };
vm.runInNewContext(js, sb); timers.forEach(f => f());
ok(imgs.length === 1, '한 번만 보냄 ' + imgs.length);
const u = imgs[0] && imgs[0].src || '';
ok(/\?p=ptime&k=kk&s=1000&e=1900&o=2500&r=5000&l=5000&c=500&kb=3$/.test(u), '보내는 주소 ' + u);
ok(!ls.oriTap, '누른 시각은 쓰고 지움');
// 시트 옆 화면·SRV 없으면 안 보냄
imgs.length = 0; vm.runInNewContext(js, Object.assign({}, sb, { MODE: 'side' })); ok(!imgs.length, '시트 옆은 안 보냄');
// 3) 서버 저장: 나눠 계산, 최근 20개
let x = G("ptimeSave_({ s: '1000', e: '1900', o: '2500', r: '5000', l: '5600', c: '500', kb: '302' })");
ok(x && x.srv === 900 && x.toPage === 600 && x.draw === 2500 && x.load === 3100 && x.tapToSrv === 500 && x.total === 5100 && x.kb === 302, '시간 나누기 ' + JSON.stringify(x));
ok(G("ptimeSave_({ s: '', e: '1' })") === null, '서버 시각 없으면 안 씀');
for (let i = 0; i < 25; i++) G("ptimeSave_({ s: '1', e: '2' })");
ok(JSON.parse(G("CacheService.getScriptCache().get('PTIME_LOG')")).length === 20, '최근 20개만');
console.log(fails.length ? 'XX 진행 도우미 시간 재기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 진행 도우미 걸린 시간 알려 주기 시험 통과');
process.exit(fails.length ? 1 : 0);
