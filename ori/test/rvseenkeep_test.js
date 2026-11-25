// (11/25) 리뷰 확인이 보는 의뢰(40일 안, 종료여도)의 '이미 본 기록'(RVSEEN_ 등)은 속성 정리가 안 지움 — 지우면 매번 다시 읽어 도돌이표  node rvseenkeep_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const A = 'A'.repeat(30), B = 'B'.repeat(30), C = 'C'.repeat(30);
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const ago = d => { const x = new Date(); x.setHours(0, 0, 0, 0); return new Date(x.getTime() - d * 86400000); };
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': ago(20), '명단 제목': '#a 1', '시트ID': A, '진행 상태': '종료' }),   // 20일 전 종료: 리뷰 확인은 봄
  mk({ '진행일': ago(50), '명단 제목': '#b 1', '시트ID': B, '진행 상태': '종료' }),   // 50일 전 종료: 안 봄
  mk({ '진행일': ago(1), '명단 제목': '#c 1', '시트ID': C, '진행 상태': '진행중' })]);
[['RVSEEN_' + A, 'x'], ['RVQMOD_' + A, '1'], ['RVSTUCK_' + A, '-'], ['LISTK_' + A, 'x'], ['RVSEEN_' + B, 'x'], ['RVQMOD_' + B, '1'], ['RVSEEN_' + C, 'x'], ['LISTK_' + C, 'x']].forEach(([k, v]) => env.__props.set(k, v));
G('propsCleanup_(null, true)');
const has = k => env.__props.get(k) != null;
ok(has('RVSEEN_' + A) && has('RVQMOD_' + A) && has('RVSTUCK_' + A), '20일 전 종료 의뢰 리뷰 확인 기록은 남김');
ok(!has('LISTK_' + A), '명단 넣기 기록(LISTK_)은 예전처럼 15일 지난 종료면 지움');
ok(!has('RVSEEN_' + B) && !has('RVQMOD_' + B), '40일 넘은 의뢰 기록은 지움');
ok(has('RVSEEN_' + C) && has('LISTK_' + C), '진행 중 의뢰는 그대로');
console.log(fails.length ? 'XX 리뷰 확인 기록 남김 시험 실패:\n- ' + fails.join('\n- ') : '✓ 리뷰 확인 기록(40일 안) 안 지움 시험 통과');
process.exit(fails.length ? 1 : 0);
