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
console.log(fails.length ? 'XX 비전·탄탄 한 번 고치기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 비전이공이공 한라봉 토스·탄탄상점 레깅스 지우기 시험 통과');
process.exit(fails.length ? 1 : 0);
