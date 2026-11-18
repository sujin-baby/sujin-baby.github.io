// (11/18) 생성기에서 새 의뢰서를 만들 때 같은 날 같은 상품의 다른 의뢰(특히 다음 일차)에 붙지 않게  node samereq_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G(`globalThis.__RUNS = [];
readRuns_ = function () { return __RUNS; };
const D = function (s) { return new Date(s + 'T12:00:00+09:00'); };
globalThis.__mk = function (title, day, k, req, sid) { return { '명단 제목': title + ' (뽀짝오리)', '진행일': D(day), '일차': k, '요청ID': req, '진행 상태': '진행중', '시트ID': sid || 'S1' }; };`);
const T = (d) => G('(function(){ const r = runByTitle_(' + JSON.stringify(d) + '); return r ? r["명단 제목"] : null; })()');
// 1) 레깅스: 같은 날 2일차 '30'이 있어도 새 의뢰서 '50'(1일차)은 새로 만듦
G("__RUNS = [__mk('#11.17 실 탄탄상점 레깅스 20', '2026-11-17', 1, 'npb3d175'), __mk('#11.18 실 탄탄상점 레깅스 30', '2026-11-18', 2, 'npb3d175-2')]");
ok(T({ title: '#11.18 실 탄탄상점 레깅스 50', date: '2026-11-18', day: 1, n: 'zz11' }) === null, '1) 2일차에 안 붙음');
ok(T({ title: '#11.18 실 탄탄상점 레깅스 30', date: '2026-11-18', day: 1, n: 'zz12' }) === null, '1) 방제가 같아도 2일차면 안 붙음');
// 2) 생성기를 다시 열어 같은 1일차를 누름: 원문이 없으면 방제(끝 숫자까지) 같을 때만 같은 진행
G("__RUNS = [__mk('#11.18 오늘과일 사과 20', '2026-11-18', 1, 'aaa1')]");
ok(T({ title: '#11.18 오늘과일 사과 20', date: '2026-11-18', day: 1, n: 'bbb2' }) === '#11.18 오늘과일 사과 20 (뽀짝오리)', '2) 같은 방제는 같은 진행');
ok(T({ title: '#11.18 오늘과일 사과 50', date: '2026-11-18', day: 1, n: 'bbb3' }) === null, '2) 끝 숫자 다르면(원문 모름) 새로');
// 3) 원문이 둘 다 있으면 원문으로: 같으면 숫자가 달라도 같은 진행, 다르면 새로
G("CacheService.getScriptCache().put('RQT_aaa1', '의뢰서 사과\\n총 20건', 600); CacheService.getScriptCache().put('RQT_ccc4', '의뢰서  사과\\n총 20건', 600); CacheService.getScriptCache().put('RQT_ddd5', '의뢰서 사과 두번째\\n총 50건', 600);");
ok(T({ title: '#11.18 오늘과일 사과 25', date: '2026-11-18', day: 1, n: 'ccc4' }) === '#11.18 오늘과일 사과 20 (뽀짝오리)', '3) 원문 같으면 같은 진행');
ok(T({ title: '#11.18 오늘과일 사과 20', date: '2026-11-18', day: 1, n: 'ddd5' }) === null, '3) 원문 다르면 방제가 같아도 새로');
// 4) 상품 링크로 찾기도 같은 규칙 (2일차 안 붙음)
G("__RUNS = [__mk('#11.18 실 탄탄상점 레깅스 30', '2026-11-18', 2, 'npb3d175-2', 'SL')]; PropertiesService.getScriptProperties().setProperty('PURL_SL', 'https://x/leg');");
ok(G("runByUrls_({ urls: 'https://x/leg', date: '2026-11-18', day: 1, n: 'zz13', title: '#11.18 레깅스 새' })") === null, '4) 링크가 같아도 2일차엔 안 붙음');
G("__RUNS[0]['일차'] = 1;");
ok(!!G("runByUrls_({ urls: 'https://x/leg', date: '2026-11-18', day: 1, n: 'zz14', title: '#11.18 레깅스 새' })"), '4) 1일차·원문 모름이면 링크로 같은 진행 (방제 줄임 대비)');
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 새 의뢰서는 다른 의뢰에 안 붙음 시험 통과');
