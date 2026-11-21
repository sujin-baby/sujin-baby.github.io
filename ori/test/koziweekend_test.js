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

// (11/20 두 번째) 옮긴 2일차의 일정 탭 줄(생성됨)도 같이 · [방제 바뀜] 할 일은 오늘 · koziFix2_
{
  const { env, G } = setup();
  const sh = env.__ss.sheets['일정'];
  sh.rows.splice(1, 0, ['ax7568r3-2', '코지클로 남자타이즈', 2, new Date(2026, 10, 23), '#택11.23 코지클로 남자타이즈10', '#택11.23 코지클로 남자타이즈10 (뽀짝오리)', 10, '[]', '생성됨', '{}']);
  G('koziWeekend1_()');
  const p2 = sh.rows.filter(x => x[0] === 'ax7568r3-2')[0];
  ok(p2[3].getDate() === 21 && p2[4] === '#택11.21 남성용 기모 타이즈10' && p2[5] === '#택11.21 남성용 기모 타이즈10 (뽀짝오리)' && p2[8] === '생성됨', '날짜 옮기면 일정 탭 줄도 ' + p2.slice(3, 9).join(' / '));
  const sd = G('sendDate_')('내 할 일', '[방제 바뀜] #택11.23 남성용 기모 타이즈10 → #택11.21 남성용 기모 타이즈10\n1. 카톡방 이름을 …', '할 일');
  const t0 = G('today_()');
  ok(sd.getTime() === t0.getTime(), '[방제 바뀜] 할 일은 오늘 ' + sd);
  const sd2 = G('sendDate_')('내 할 일', '[결제금액 확인] #12.30 다른 상품5', '할 일');
  ok(sd2.getDate() === 30, '다른 할 일은 글 날짜 그대로 ' + sd2);
}
{
  const { env, G } = setup();
  const sh = env.__ss.sheets['일정'];
  sh.rows.splice(1, 0, ['ax7568r3-2', '코지클로 남자타이즈', 2, new Date(2026, 10, 23), '#택11.23 코지클로 남자타이즈10', '#택11.23 코지클로 남자타이즈10 (뽀짝오리)', 10, '[]', '생성됨', '{}']);
  const ob = G('outboxSheet_()');
  const far = new Date(2026, 10, 23);
  ob.appendRow(['m1', far, '할 일', '내 할 일', '[방제 바뀜] #택11.23 남성용 기모 타이즈10 → #택11.21 남성용 기모 타이즈10\n1. 카톡방 이름을 #택11.21 남성용 기모 타이즈10 로 바꾸기', '대기']);
  ob.appendRow(['m2', new Date(2026, 10, 20), '할 일', '내 할 일', '[결제금액 확인] #택11.20 코지클로 남자타이즈10\n가나다: 16,880원', '대기']);
  ob.appendRow(['m3', new Date(2026, 10, 19), '할 일', '내 할 일', '[결제금액 확인] #택11.19 코지클로 남자타이즈10 보낸 것', '보냄']);
  ob.appendRow(['m4', far, '할 일', '내 할 일', '[방제 바뀜] #11.23 다른 상품5 → #11.24 다른 상품5', '대기']);
  let err = ''; try { G('koziFix2_()'); } catch (e) { err = String(e.stack || e); }
  ok(!err, 'koziFix2_ 오류 ' + err);
  const p2 = sh.rows.filter(x => x[0] === 'ax7568r3-2')[0];
  ok(p2[3].getDate() === 23 && p2[4] === '#택11.23 남성용 기모 타이즈10', '일정 2일차 = 진행과 같게 (진행이 아직 11.23인 시험이라 23) ' + p2[4]);
  const rows = ob.rows.slice(1), by = id => rows.filter(x => x[0] === id)[0];
  ok(by('m1')[1].getTime() === G('today_()').getTime(), '방제 바뀜 할 일 오늘로 ' + by('m1')[1]);
  ok(by('m2')[4].indexOf('남성용 기모 타이즈10') >= 0 && by('m2')[4].indexOf('코지클로') < 0, '안 보낸 글 이름 ' + by('m2')[4]);
  ok(by('m3')[4].indexOf('코지클로') >= 0, '보낸 글은 그대로');
  ok(by('m4')[1].getTime() === far.getTime(), '다른 상품 할 일은 그대로');
  ok(/^✓/.test(env.__props.get('KOZIWK2') || ''), '결과 ' + env.__props.get('KOZIWK2'));
  const once = env.__props.get('KOZIWK2'); G('koziFix2_()'); ok(env.__props.get('KOZIWK2') === once, '한 번만');
}

// 한눈에 색: 내일(토)부터 다음 진행일(월)까지 하늘색 — 주말 진행 11/21 줄이 흰색이던 것 (11/20)
{
  const src = require('fs').readFileSync(process.argv[2], 'utf8');
  ok(src.indexOf("'=AND(INT($A2)=TODAY()+' + (i + 1) + ',INT($A2)<=WORKDAY(TODAY(),1,' + hs + '))').setBackground(c)") >= 0, '한눈에 줄 = 내일~다음 진행일, 날짜마다 다른 색');
  ok(src.indexOf("G2<>0,INT($A2)=TODAY()+' + (i + 1) + ',INT($A2)<=WORKDAY(TODAY(),1,' + hs + '))').setFontColor('#d00000').setBold(true).setBackground(c)") >= 0, '남은 칸도 같은 날짜 색');
  const vm2 = require('vm'), H2 = require('./harness'), e2 = H2.makeEnv({ main: process.argv[2] }), cols = vm2.runInContext('DASH_DAY_COLORS', e2);
  ok(cols.length >= 5 && new Set(cols).size === cols.length && cols.indexOf('#d9ead3') < 0 && cols.indexOf('#ea9999') < 0 && cols.indexOf('#d9d9d9') < 0, '날짜 색은 서로 다르고 오늘·알림·완료 색과 안 겹침 ' + cols);
  ok(src.indexOf("INT($A2)=WORKDAY(TODAY(),1,") < 0, '옛 규칙(다음 진행일 하루만) 없음');
}
console.log(fails.length ? 'XX 주말 진행 시험 실패:\n- ' + fails.join('\n- ') : '✓ 주말 진행·남성용 기모 타이즈 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
