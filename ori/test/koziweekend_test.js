// (11/20) 주말에도 진행하는 의뢰: 일정 계획이 주말을 건너뛰지 않음 + 남성용 기모 타이즈 한 번(파일 이름·11.23→11.21·계획 매일)  node koziweekend_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
function setup() {
  const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#택11.23 남성용 기모 타이즈10 (뽀짝오리)', '카톡방': '#택11.23 남성용 기모 타이즈10', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행예정', '요청ID': 'ax7568r3-2', '목표인원': 10, '택대': 'Y', '캠페인': '코지클로 남자타이즈', '일차': 2, '총건수': 100 }),
    mk({ '진행일': new Date(2026, 10, 20), '명단 제목': '#택11.20 남성용 기모 타이즈10 (뽀짝오리)', '카톡방': '#택11.20 남성용 기모 타이즈10', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '요청ID': 'ax7568r3', '목표인원': 10, '인원': 10, '택대': 'Y', '캠페인': '코지클로 남자타이즈', '일차': 1, '총건수': 100 })]);
  const PH = G('PLAN_HEAD');
  const rows = [PH.slice()];
  [[3, 24], [4, 25], [5, 26], [6, 27], [7, 30]].forEach(([k, d]) => rows.push(['ax7568r3-' + k, '코지클로 남자타이즈', k, new Date(2026, 10, d), '#택11.' + d + ' 남성용 기모 타이즈10', '#택11.' + d + ' 남성용 기모 타이즈10 (뽀짝오리)', 10, '[]', '대기', '{"takdae":true}']));
  rows.push(['ax7568r3-8', '코지클로 남자타이즈', 8, new Date(2026, 11, 1), '#택12.1 남성용 기모 타이즈10', '#택12.1 남성용 기모 타이즈10 (뽀짝오리)', 10, '[]', '대기', '{}']);
  rows.push(['other-2', '다른 상품', 2, new Date(2026, 10, 24), '#11.24 다른 상품 5', '#11.24 다른 상품 5 (뽀짝오리)', 5, '[]', '대기', '{}']);
  env.__ss.sheets['일정'] = new H.Sheet('일정', rows);
  G("globalThis.__FILES = []; renameRunFiles_ = function (r, a, b) { __FILES.push(a + '→' + b); return ['명단 시트', '폼 제목']; }; updatePay_ = function () {}; payRename_ = function () {};");
  return { env, G };
}
{
  const { env, G } = setup();
  let err = ''; try { G('koziWeekend1_()'); } catch (e) { err = String(e.stack || e); }
  ok(!err, '오류 ' + err);
  ok(JSON.stringify(G('__FILES')) === '["#택 코지클로 남자타이즈→#택 남성용 기모 타이즈"]', '명단 시트·폼 이름 ' + JSON.stringify(G('__FILES')));
  const r2 = G('readRuns_()').filter(r => r['요청ID'] === 'ax7568r3-2')[0];
  ok(r2 && r2['진행일'].getDate() === 21 && G('bareTitle_')(r2['명단 제목']) === '#택11.21 남성용 기모 타이즈10', '2일차 11.23 → 11.21 ' + (r2 && G('bareTitle_')(r2['명단 제목'])));
  const pr = env.__ss.sheets['일정'].rows.slice(1);
  const got = pr.filter(x => String(x[0]).indexOf('ax7568r3-') === 0).map(x => x[2] + ':' + x[3].getMonth() + '.' + x[3].getDate() + ':' + x[4] + ':' + (JSON.parse(x[9]).weekend ? 'wk' : ''));
  ok(JSON.stringify(got) === JSON.stringify(['3:10.22:#택11.22 남성용 기모 타이즈10:wk', '4:10.23:#택11.23 남성용 기모 타이즈10:wk', '5:10.24:#택11.24 남성용 기모 타이즈10:wk', '6:10.25:#택11.25 남성용 기모 타이즈10:wk', '7:10.26:#택11.26 남성용 기모 타이즈10:wk', '8:10.27:#택11.27 남성용 기모 타이즈10:wk']), '계획 매일 ' + JSON.stringify(got));
  ok(JSON.parse(pr[0][9]).takdae === true, '계획 설정은 그대로(택대)');
  ok(pr[pr.length - 1][4] === '#11.24 다른 상품 5', '다른 의뢰 계획은 그대로');
  ok(/^✓/.test(env.__props.get('KOZIWK1') || ''), '결과 ' + env.__props.get('KOZIWK1'));
}
// makeDueDays_: 주말 표시가 있으면 토·일 날짜를 월요일로 안 미룸, 없으면 미룸
{
  const { env, G } = setup();
  const sh = env.__ss.sheets['일정'];
  sh.rows = [sh.rows[0], ['wk-2', '주말 상품', 2, new Date(2026, 10, 22), '#11.22 주말 상품 5', '#11.22 주말 상품 5 (뽀짝오리)', 5, '[]', '대기', '{"weekend":true}'],
    ['nw-2', '평일 상품', 2, new Date(2026, 10, 22), '#11.22 평일 상품 5', '#11.22 평일 상품 5 (뽀짝오리)', 5, '[]', '대기', '{}']];
  G('createRunInner_ = function () { return {}; };');
  try { G('makeDueDays_()'); } catch (e) {}
  ok(sh.rows[1][3].getDate() === 22 && sh.rows[1][4] === '#11.22 주말 상품 5', '주말 진행은 일요일 그대로 ' + sh.rows[1][3] + ' ' + sh.rows[1][4]);
  ok(sh.rows[2][3].getDate() === 23 && sh.rows[2][4] === '#11.23 평일 상품 5', '평일 진행은 월요일로 ' + sh.rows[2][3] + ' ' + sh.rows[2][4]);
}
console.log(fails.length ? 'XX 주말 진행 시험 실패:\n- ' + fails.join('\n- ') : '✓ 주말 진행·남성용 기모 타이즈 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
