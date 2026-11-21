// (11/21) 생성기 v208 pname·kwfix: 새 진행 만들기 창을 거쳐 서버로, 숨긴 '키워드기록' 탭에 기록만  node kwlog_test.js <Main.js>
const H = require('./harness'); const vm = require('vm'); const fs = require('fs');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const src = fs.readFileSync(process.argv[2], 'utf8');
ok(/,pname:window\.__PNAME\|\|'',kwfix:window\.__KWFIX\|\|''\}/.test(src), '창이 pname·kwfix를 createRun으로 보냄');
ok(/window\.__PNAME=' \+ JSON\.stringify\(String\(p\.pname/.test(src) && /window\.__KWFIX=' \+ JSON\.stringify\(String\(p\.kwfix/.test(src), '주소 값을 창에 넣음');
ok(/try \{ kwLog_\(d\); \}/.test(src), 'createRun 뒤 기록');
const tab = () => env.__ss.sheets['키워드기록'];
const call = d => { let e = ''; try { return G('kwLog_(' + JSON.stringify(d) + ')'); } catch (x) { e = String(x.stack || x); fails.push('오류 ' + e); } };
// 1) 고친 키워드 2개 + 빈 자리 있는 pname
const fx = [{ pno: '123456789012', seller: '가짜상회', pname: '[당일출고] 가짜 여성겨울모자 니트 방한 비니', kw: '겨울모자' }, { pno: '223456789012', seller: '가짜상회2', pname: '가짜 손난로', kw: '손난로' }];
ok(call({ n: 'RQ1', title: '#11.24 가짜상회 겨울모자외 10 (뽀짝오리)', pname: '겨울모자 /  / 손난로', kwfix: JSON.stringify(fx) }) === 2, '두 줄');
const r1 = tab() && tab().rows.slice(1);
ok(r1 && r1.length === 2 && r1[0][1] === 'RQ1' && r1[0][3] === '겨울모자 /  / 손난로' && r1[0][4] === '123456789012' && r1[1][7] === '손난로' && r1[0][6].indexOf('여성겨울모자') >= 0, '기록 내용 ' + JSON.stringify(r1));
ok(tab() && tab().rows[0][7] === '고친 키워드', '머리글');
// 2) 같은 요청ID는 한 번만
ok(call({ n: 'RQ1', title: 'x', pname: 'y', kwfix: '' }) === 0 && tab().rows.length === 3, '같은 요청ID 두 번 안 씀');
// 3) 깨진 kwfix(1200자에서 잘림) → pname만
ok(call({ n: 'RQ2', title: '#11.24 가짜 2', pname: '양말', kwfix: JSON.stringify(fx).slice(0, 30) }) === 1 && tab().rows[3][3] === '양말' && tab().rows[3][7] === '', '깨진 kwfix는 버림');
// 4) 아무것도 없으면 안 씀
ok(call({ n: 'RQ3', title: 'x' }) === 0 && tab().rows.length === 4, '빈 값은 안 씀');
console.log(fails.length ? 'XX 키워드 기록 시험 실패:\n- ' + fails.join('\n- ') : '✓ pname·kwfix 받아서 키워드기록 탭에 기록만 시험 통과');
process.exit(fails.length ? 1 : 0);
