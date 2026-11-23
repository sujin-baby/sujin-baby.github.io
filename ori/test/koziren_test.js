// (11/20) 상품 이름까지 바꾼 방제: 한눈에에서 고쳐도 되돌아가지 않게 + 코지클로 남자타이즈 → 남성용 기모 타이즈 한 번 (파일 이름은 그대로)  node koziren_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
function setup() {
  const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
  const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
  env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
    mk({ '진행일': new Date(2026, 10, 23), '명단 제목': '#택11.23 코지클로 남자타이즈10 (뽀짝오리)', '카톡방': '#택11.23 코지클로 남자타이즈10', '시트ID': 'S1', '진행 상태': '진행예정', '요청ID': 'ax7568r3-2', '목표인원': 10, '택대': 'Y', '캠페인': '코지클로 남자타이즈' }),
    mk({ '진행일': new Date(2026, 10, 20), '명단 제목': '#택11.20 코지클로 남자타이즈10 (뽀짝오리)', '카톡방': '#택11.20 코지클로 남자타이즈10', '시트ID': 'S1', '진행 상태': '진행중', '요청ID': 'ax7568r3', '목표인원': 10, '인원': 10, '택대': 'Y', '캠페인': '코지클로 남자타이즈' }),
    mk({ '진행일': new Date(2026, 10, 20), '명단 제목': '#11.20 실 다른 상품 5 (뽀짝오리)', '카톡방': '#11.20 실 다른 상품 5', '시트ID': 'S2', '진행 상태': '진행중', '요청ID': 'zzz', '목표인원': 5 })]);
  const PH = G('PLAN_HEAD');
  env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
    ['ax7568r3-3', '코지클로 남자타이즈', 3, new Date(2026, 10, 24), '#택11.24 코지클로 남자타이즈10', '#택11.24 코지클로 남자타이즈10 (뽀짝오리)', 10, '[]', '대기', '{}'],
    ['ax7568r3-2', '코지클로 남자타이즈', 2, new Date(2026, 10, 23), '#택11.23 코지클로 남자타이즈10', '#택11.23 코지클로 남자타이즈10 (뽀짝오리)', 10, '[]', '생성됨', '{}'],
    ['qqq-2', '다른 상품', 2, new Date(2026, 10, 24), '#11.24 실 다른 상품 5', '#11.24 실 다른 상품 5 (뽀짝오리)', 5, '[]', '대기', '{}']]);
  G("today_ = function () { return new Date(2026, 10, 20); }; globalThis.__FILES = 0; globalThis.__PAYREN = []; renameRunFiles_ = function () { __FILES++; return []; }; updatePay_ = function () {}; payRename_ = function (a, b) { __PAYREN.push(a + '→' + b + (globalThis.__PAY_RENAME_ANY ? ' any' : '')); };");
  return { env, G };
}
// 1) 한 번 바꾸기
{
  const { env, G } = setup();
  let err = ''; try { G('koziRen1_()'); } catch (e) { err = String(e.stack || e); }
  ok(!err, '오류 ' + err);
  const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
  ok(t.includes('#택11.20 남성용 기모 타이즈10') && t.includes('#택11.23 남성용 기모 타이즈10') && t.includes('#11.20 실 다른 상품 5'), '진행 방제 ' + JSON.stringify(t));
  const pr = env.__ss.sheets['일정'].rows;
  ok(pr[1][4] === '#택11.24 남성용 기모 타이즈10' && pr[1][5] === '#택11.24 남성용 기모 타이즈10 (뽀짝오리)' && pr[1][1] === '코지클로 남자타이즈', '대기 일정 방제(캠페인 칸은 그대로) ' + JSON.stringify(pr[1].slice(0, 6)));
  ok(pr[2][4] === '#택11.23 코지클로 남자타이즈10' && pr[3][4] === '#11.24 실 다른 상품 5', '생성됨·다른 의뢰 일정은 그대로');
  ok(G('__FILES') === 0, '명단 시트·폼 파일 이름은 안 바꿈');
  ok(G('__PAYREN').length === 2 && G('__PAYREN').every(x => / any$/.test(x)), '월급시트 줄 이름도 같이 ' + JSON.stringify(G('__PAYREN')));
  ok(/^✓/.test(env.__props.get('KOZIREN1') || ''), '결과 ' + env.__props.get('KOZIREN1'));
}
// 2) 한눈에에서 상품 이름까지 바꾼 방제: 그 줄에 지난번 쓴 방제의 진행을 바꿈 (되돌아가지 않음)
{
  const { env, G } = setup();
  env.__props.set('DASH_TITLES', JSON.stringify(['#택11.20 코지클로 남자타이즈10', '#11.20 실 다른 상품 5', '#택11.23 코지클로 남자타이즈10']));
  env.__ss.sheets['한눈에'] = new H.Sheet('한눈에', [['진행일', '방제'], ['', '#택11.20 남성용 기모 타이즈10'], ['', '#11.20 실 다른 상품 5'], ['', '#택11.23 코지클로 남자타이즈10']]);
  try { G('buildDashboard_(false)'); } catch (e) {}
  const t = G('readRuns_()').map(r => G('bareTitle_')(r['명단 제목']));
  ok(t.includes('#택11.20 남성용 기모 타이즈10') && t.includes('#택11.23 남성용 기모 타이즈10') && t.includes('#11.20 실 다른 상품 5'), '한눈에에서 고친 줄 + 아직 시작 안 한 다음 날(11/23 수진 님: 다음 일차도 따라) ' + JSON.stringify(t));
  ok(G('__FILES') === 0 && G('__PAYREN').some(x => /코지클로 남자타이즈10→#택11.20 남성용 기모 타이즈10 any/.test(x)), '파일 이름 그대로·월급시트 같이 ' + JSON.stringify(G('__PAYREN')));
}
console.log(fails.length ? 'XX 방제 바꾸기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 한눈에 상품 이름 바꾼 방제·코지클로 한 번 바꾸기 시험 통과');
process.exit(fails.length ? 1 : 0);
