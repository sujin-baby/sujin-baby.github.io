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
// 옛 MSGV_SIG, 마감 3일 지난 진행의 가이드 넣음 표시, 10일 지난 2시 이후 구매 표시
{
  const e2 = H.makeEnv({ main: process.argv[2] }); const G2 = k => vm.runInContext(k, e2);
  const L2 = G2('LIST_HEADER'), m2 = o => L2.map(h => o[h] !== undefined ? o[h] : '');
  e2.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [L2.slice(),
    m2({ '진행일': ago(1), '명단 제목': '#새 2 (뽀짝오리)', '시트ID': S, '마감 시각': ago(1), '진행 상태': '진행중' }),
    m2({ '진행일': ago(20), '명단 제목': '#옛 2 (뽀짝오리)', '시트ID': O, '마감 시각': ago(20), '진행 상태': '진행중' })]);
  [['MSGV_SIG', 'x'], ['MSGV_SIG_list', 'h'], ['RVMSG2_#새2(뽀짝오리)', '1'], ['RVMSG_#옛2(뽀짝오리)', '1'], ['RVMSG2_#옛2(뽀짝오리)', '1'], ['TAKLATE_#옛2(뽀짝오리)', '1'], ['TAKLATE_#새2(뽀짝오리)', '1'], ['TAKCUT_#옛2', '1']].forEach(([k, v]) => e2.__props.set(k, v));
  G2('propsCleanup_(null, true)');
  const h2 = k => e2.__props.get(k) != null;
  ok(!h2('MSGV_SIG') && h2('MSGV_SIG_list'), '옛 MSGV_SIG만 지움');
  ok(h2('RVMSG2_#새2(뽀짝오리)') && !h2('RVMSG_#옛2(뽀짝오리)') && !h2('RVMSG2_#옛2(뽀짝오리)'), '마감 3일 지난 가이드 표시 지움');
  ok(h2('TAKLATE_#새2(뽀짝오리)') && !h2('TAKLATE_#옛2(뽀짝오리)') && h2('TAKCUT_#옛2'), '10일 지난 2시 이후 구매 표시만 지움(택배시트 마감 시각은 그대로)');
}
console.log(fails.length ? 'XX 저장 공간 시험 실패:\n- ' + fails.join('\n- ') : '✓ 저장 공간: 바이트로 셈·안 쓰는 표시 지움 시험 통과');
process.exit(fails.length ? 1 : 0);
