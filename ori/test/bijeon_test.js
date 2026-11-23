// (11/23 한 번) 비전이공이공 → 한라봉 토스 (11.23·11.24), 탄탄상점 레깅스(실 빠진 의뢰) 지우기  node bijeon_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': new Date(2026, 10, 24), '명단 제목': '#11.24 탄탄상점 레깅스 30 (뽀짝오리)', '카톡방': '#11.24 탄탄상점 레깅스 30', '시트ID': 'T1', '진행 상태': '진행예정', '요청ID': 'tcmlx6ic-2', '인원': 0 }),
  mk({ '진행일': new Date(2026, 10, 24), '명단 제목': '#11.24 비전이공이공 황금향 5 (뽀짝오리)', '카톡방': '#11.24 비전이공이공 황금향 5', '시트ID': 'B1', '진행 상태': '진행예정', '요청ID': 'zofdhj1x-2', '인원': 0, '목표인원': 5 }),
  mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#11.23 탄탄상점 레깅스 30 (뽀짝오리)', '카톡방': '#11.23 탄탄상점 레깅스 30', '시트ID': 'T1', '진행 상태': '진행중', '요청ID': 'tcmlx6ic', '인원': 0 }),
  mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#11.23비전이공이공 황금향 토스5 (뽀짝오리)', '카톡방': '#11.23비전이공이공 황금향 토스5', '시트ID': 'B1', '진행 상태': '진행중', '요청ID': 'zofdhj1x', '인원': 5, '목표인원': 5 }),
  mk({ '진행일': new Date(2026, 10, 18), '명단 제목': '#11.18 실 탄탄상점 레깅스 50 (뽀짝오리)', '카톡방': '#11.18 실 탄탄상점 레깅스 50', '시트ID': 'T9', '진행 상태': '진행중', '요청ID': 'src3cf7o', '인원': 50 })]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
  ['tcmlx6ic-2', '탄탄상점 레깅스', 2, new Date(2026, 10, 24), '#11.24 탄탄상점 레깅스 30', 'x', 30, '[]', '생성됨', '{}'],
  ['tcmlx6ic-3', '탄탄상점 레깅스', 3, new Date(2026, 10, 25), '#11.25 탄탄상점 레깅스 30', 'x', 30, '[]', '대기', '{}'],
  ['tcmlx6ic-4', '탄탄상점 레깅스', 4, new Date(2026, 10, 26), '#11.26 탄탄상점 레깅스 10', 'x', 10, '[]', '대기', '{}'],
  ['zzz-2', '다른', 2, new Date(2026, 10, 26), '#11.26 다른 5', 'x', 5, '[]', '대기', '{}']]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('bijeonRen1_()'); G('tanDel1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
ok(t.length === 3 && t.includes('#11.24비전이공이공 한라봉 토스5') && t.includes('#11.23비전이공이공 한라봉 토스5') && t.includes('#11.18 실 탄탄상점 레깅스 50'), '남은 진행 ' + JSON.stringify(t));
ok(/^✓/.test(env.__props.get('BIJEONREN1')) && /^✓/.test(env.__props.get('TANDEL1')), '기록 ' + env.__props.get('BIJEONREN1') + ' | ' + env.__props.get('TANDEL1'));
const pl = env.__ss.sheets['일정'].rows.slice(1).map(r => r[0] + ':' + r[8]);
ok(pl.join(',') === 'tcmlx6ic-2:생성됨,zzz-2:대기', '일정 ' + pl.join(','));
// (11/23) 탄탄상점 레깅스 30·30·40: 일정 11.25 → 40, 11.26 취소 (tanDel1_이 응답 있음으로 멈춘 뒤)
{
  const env2 = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G2 = k => vm.runInContext(k, env2);
  const LH2 = G2('LIST_HEADER'), mk2 = o => LH2.map(h => o[h] !== undefined ? o[h] : '');
  env2.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH2.slice(), mk2({ '진행일': new Date(2026, 10, 23), '명단 제목': '#11.23 탄탄상점 레깅스 30 (뽀짝오리)', '시트ID': 'T1', '진행 상태': '진행중', '요청ID': 'tcmlx6ic', '인원': 31, '목표인원': 30, '총건수': 100 })]);
  env2.__ss.sheets['일정'] = new H.Sheet('일정', [G2('PLAN_HEAD').slice(),
    ['tcmlx6ic-3', '탄탄상점 레깅스', 3, new Date(2026, 10, 25), '#11.25 탄탄상점 레깅스 30', '#11.25 탄탄상점 레깅스 30 (뽀짝오리)', 30, '[[30,[30]]]', '대기', '{}'],
    ['tcmlx6ic-4', '탄탄상점 레깅스', 4, new Date(2026, 10, 26), '#11.26 탄탄상점 레깅스 10', '#11.26 탄탄상점 레깅스 10 (뽀짝오리)', 10, '[]', '대기', '{}']]);
  let e2 = ''; try { G2('tan40_()'); } catch (x) { e2 = String(x.stack || x); }
  const pr = env2.__ss.sheets['일정'].rows;
  ok(!e2 && pr[1][4] === '#11.25 탄탄상점 레깅스 40' && pr[1][5] === '#11.25 탄탄상점 레깅스 40 (뽀짝오리)' && pr[1][6] === 40 && pr[1][7] === '[[40,[40]]]' && /^취소/.test(pr[2][8]), '30·30·40 ' + e2 + JSON.stringify(pr.slice(1).map(r => [r[4], r[6], r[7], r[8]])));
}
// (11/23) 탄탄상점 레깅스 실 붙이기: 진행 둘 + 일정 대기 + 실배송 Y + 명단 시트 이름도(파일 이름 바꾸기 부름)
{
  const env3 = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G3 = k => vm.runInContext(k, env3);
  const LH3 = G3('LIST_HEADER'), mk3 = o => LH3.map(h => o[h] !== undefined ? o[h] : '');
  env3.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH3.slice(),
    mk3({ '진행일': new Date(2026, 10, 24), '명단 제목': '#11.24 탄탄상점 레깅스 30 (뽀짝오리)', '카톡방': '#11.24 탄탄상점 레깅스 30', '시트ID': 'T1', '진행 상태': '진행예정', '요청ID': 'tcmlx6ic-2', '인원': 0, '목표인원': 30 }),
    mk3({ '진행일': new Date(2026, 10, 23), '명단 제목': '#11.23 탄탄상점 레깅스 30 (뽀짝오리)', '카톡방': '#11.23 탄탄상점 레깅스 30', '시트ID': 'T1', '진행 상태': '진행중', '요청ID': 'tcmlx6ic', '인원': 31, '목표인원': 30 })]);
  env3.__ss.sheets['일정'] = new H.Sheet('일정', [G3('PLAN_HEAD').slice(),
    ['tcmlx6ic-3', '탄탄상점 레깅스', 3, new Date(2026, 10, 25), '#11.25 탄탄상점 레깅스 40', '#11.25 탄탄상점 레깅스 40 (뽀짝오리)', 40, '[]', '대기', '{"type":"x"}']]);
  G3("globalThis.__FR = []; renameRunFiles_ = function (r, a, b) { __FR.push(a + '→' + b); return []; }; updatePay_ = function () {}; payRename_ = function () {};");
  let e3 = ''; try { G3('tanSil1_()'); } catch (x) { e3 = String(x.stack || x); }
  const rs = G3('readRuns_()').map(r => G3('bareTitle_')(r['명단 제목']) + '|' + r['실배송']);
  ok(!e3 && rs.join(',') === '#11.24 실 탄탄상점 레깅스 30|Y,#11.23 실 탄탄상점 레깅스 30|Y', '실 붙임 ' + e3 + rs.join(','));
  const p3 = env3.__ss.sheets['일정'].rows[1];
  ok(p3[4] === '#11.25 실 탄탄상점 레깅스 40' && p3[5] === '#11.25 실 탄탄상점 레깅스 40 (뽀짝오리)' && JSON.parse(p3[9]).realship === true && JSON.parse(p3[9]).type === 'x', '일정 ' + JSON.stringify(p3));
  ok(G3('__FR').some(x => x === '# 탄탄상점 레깅스→# 실 탄탄상점 레깅스'), '명단 시트 이름도 ' + JSON.stringify(G3('__FR')));
  ok(/^✓/.test(env3.__props.get('TANSIL1')) && env3.__props.get('LISTREAL_T1') === '1', '기록 ' + env3.__props.get('TANSIL1'));
}
console.log(fails.length ? 'XX 비전·탄탄 한 번 고치기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 비전이공이공 한라봉 토스·탄탄상점 레깅스 지우기 시험 통과');
process.exit(fails.length ? 1 : 0);
