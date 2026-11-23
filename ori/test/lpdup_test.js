// (11/24 한 번) 롱패딩 후리스 11.24: 이름·번호가 같은 겹친 응답의 나중 것 하나만 지움 (정확히 하나일 때만)  node lpdup_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
function run(extra) {
  const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
  const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': new Date(2026, 10, 24), '명단 제목': '#택11.24 가짜 롱패딩 4', '시트ID': 'L1', '폼ID': 'F1', '진행 상태': '진행중', '요청ID': '9ynp4el7-2' }),
    mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#택11.23 가짜 롱패딩 4', '시트ID': 'L1', '폼ID': 'F1', '진행 상태': '진행중', '요청ID': '9ynp4el7' })]);
  const rows = [['타임스탬프', '방에 참여한 카카오톡 닉네임', '계정명(수령인)', '전화번호'],
    [new Date(2026, 10, 23, 0, 47), '가', '홍길동', '010-1111-2349'],
    [new Date(2026, 10, 24, 0, 26), '나', '김철수', '010-2222-5230'],
    [new Date(2026, 10, 24, 0, 27), '다', '이영희', '010-3333-2485'],
    [new Date(2026, 10, 24, 0, 33), '나', '김철수', '010-2222-5230']].concat(extra || []);
  const resp = new H.Sheet('설문지 응답 시트1', rows); resp.getFormUrl = () => 'https://form';
  env.SpreadsheetApp.openById = id => id === 'L1' ? { getSheets: () => [resp], getSheetByName: () => null } : env.__ss;
  G("globalThis.__DEL = []; deleteRunTimes_ = function (r, ds) { __DEL.push(r['요청ID'] + ':' + ds.map(function (d) { return d.getHours() + ':' + d.getMinutes(); }).join(',')); };");
  let e = ''; try { G('lpDup1_()'); } catch (x) { e = String(x.stack || x); }
  return { e, del: G('__DEL'), st: env.__props.get('LPDUP1') };
}
let x = run();
ok(!x.e && x.del.join() === '9ynp4el7-2:0:33' && /^✓/.test(x.st), '나중 것 하나 ' + JSON.stringify(x));
x = run([[new Date(2026, 10, 24, 1, 0), '다', '이영희', '010-3333-2485']]);
ok(!x.e && x.del.length === 0 && /실패\(이름·번호 같은 겹친 줄 2개라 안 지움\)/.test(x.st), '둘 이상이면 안 지움 ' + JSON.stringify(x));
console.log(fails.length ? 'XX 롱패딩 겹친 응답 시험 실패:\n- ' + fails.join('\n- ') : '✓ 롱패딩 11.24 겹친 응답 나중 것 하나만 지움 시험 통과');
process.exit(fails.length ? 1 : 0);
