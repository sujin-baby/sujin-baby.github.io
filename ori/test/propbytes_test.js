// (11/27) 저장 공간: 바이트로 셈(한글 3바이트) + 다시 안 쓰는 표시 지움(폼 열기 3일, 진행일 60일 넘은 취완·리뷰비 표시)  node propbytes_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
env.__a = { 'A': 'abc', '한': '글' };
ok(G('propsBytes_(__a)') === 4 + 6, '한글은 3바이트 ' + G('propsBytes_(__a)'));
const S = 'S'.repeat(30), O = 'O'.repeat(30);
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const ago = d => { const x = new Date(); x.setHours(0, 0, 0, 0); return new Date(x.getTime() - d * 86400000); };
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': ago(10), '명단 제목': '#새 진행 2 (뽀짝오리)', '카톡방': '#새 진행 2', '시트ID': S, '진행 상태': '진행중' }),
  mk({ '진행일': ago(70), '명단 제목': '#옛 진행 2 (뽀짝오리)', '카톡방': '#옛 진행 2', '시트ID': O, '진행 상태': '종료' })]);
const d8 = d => { const x = ago(d); return x.getFullYear() + String(x.getMonth() + 1).padStart(2, '0') + String(x.getDate()).padStart(2, '0'); };
[['OPEN_F1_' + d8(1), '1'], ['OPEN_F1_' + d8(5), '1'], ['RVDAYREQ_#새진행2(뽀짝오리)', '1'], ['RVROOMDONE_#새진행2', '1'], ['RVDAYREQ_#옛진행2(뽀짝오리)', '1'], ['RVROOMDONE_#옛진행2', '1'],
 ['RVDAYREQ_INIT_' + S, '1'], ['RVDAYREQ_INIT_' + O, '1'], ['RVROOMDONE_INIT_' + O, '1'], ['RVDONE_' + O, '1']].forEach(([k, v]) => env.__props.set(k, v));
G('propsCleanup_(null, true)');
const has = k => env.__props.get(k) != null;
ok(has('OPEN_F1_' + d8(1)) && !has('OPEN_F1_' + d8(5)), '폼 열기 표시는 3일 지난 것만 지움');
ok(has('RVDAYREQ_#새진행2(뽀짝오리)') && has('RVROOMDONE_#새진행2') && has('RVDAYREQ_INIT_' + S), '60일 안 진행의 취완·리뷰비 표시는 남김');
ok(!has('RVDAYREQ_#옛진행2(뽀짝오리)') && !has('RVROOMDONE_#옛진행2') && !has('RVDAYREQ_INIT_' + O) && !has('RVROOMDONE_INIT_' + O), '60일 넘은 진행 표시는 지움');
ok(has('RVDONE_' + O), '의뢰 다 끝남 표시(RVDONE_)는 안 건드림');
console.log(fails.length ? 'XX 저장 공간 시험 실패:\n- ' + fails.join('\n- ') : '✓ 저장 공간: 바이트로 셈·안 쓰는 표시 지움 시험 통과');
process.exit(fails.length ? 1 : 0);
