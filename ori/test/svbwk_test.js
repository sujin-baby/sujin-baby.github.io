// (11/27 한 번) 실 실버반석 전기면도기: 11.30 → 11.28, 일정 12.1·12.2 → 11.29·11.30 + 주말 표시  node svbwk_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(), mk({ '진행일': new Date(2026, 10, 30), '명단 제목': '#11.30 실 가짜상회 면도기2 (뽀짝오리)', '카톡방': '#11.30 실 가짜상회 면도기2', '시트ID': 'V1', '진행 상태': '진행예정', '요청ID': 'xwkaln3z', '목표인원': 2, '인원': 0, '총건수': 5, '캠페인': '실 가짜상회 면도기' })]);
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
  ['xwkaln3z-2', '실 가짜상회 면도기', 2, new Date(2026, 11, 1), '#12.1 실 가짜상회 면도기2', '#12.1 실 가짜상회 면도기2 (뽀짝오리)', 2, '[]', '대기', '{"slot":"x"}'],
  ['xwkaln3z-3', '실 가짜상회 면도기', 3, new Date(2026, 11, 2), '#12.2 실 가짜상회 면도기1', '#12.2 실 가짜상회 면도기1 (뽀짝오리)', 1, '[]', '대기', '{}']]);
G("renameRunFiles_ = function () { return []; }; updatePay_ = function () {}; payRename_ = function () {};");
let e = ''; try { G('svbWk1_()'); } catch (x) { e = String(x.stack || x); }
ok(!e, '오류 ' + e);
const r = G('readRuns_()')[0];
ok(r['진행일'].getDate() === 28 && /^#11\.28 실 가짜상회 면도기2/.test(G('bareTitle_')(r['명단 제목'])), '1일차 11.28 ' + r['명단 제목']);
const rows = env.__ss.sheets['일정'].rows.slice(1);
ok(rows[0][3].getDate() === 29 && rows[0][4] === '#11.29 실 가짜상회 면도기2' && JSON.parse(rows[0][9]).weekend === true && JSON.parse(rows[0][9]).slot === 'x', '2일차 11.29 주말 ' + JSON.stringify(rows[0]));
ok(rows[1][3].getDate() === 30 && rows[1][4] === '#11.30 실 가짜상회 면도기1' && JSON.parse(rows[1][9]).weekend === true, '3일차 11.30 ' + JSON.stringify(rows[1]));
ok(/^✓/.test(env.__props.get('SVBWK1')), '기록 ' + env.__props.get('SVBWK1'));
console.log(fails.length ? 'XX 실버반석 주말 시험 실패:\n- ' + fails.join('\n- ') : '✓ 실버반석 전기면도기 11.28부터 주말 진행 시험 통과');
process.exit(fails.length ? 1 : 0);
