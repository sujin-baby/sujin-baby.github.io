// (11/18) 15분 확인 단계: 6분 안에 끝날 것만 시작, 못 한 건 1분 뒤 이어서(방금 한 건 건너뜀), 끊기면 알아챔, 폼 인원은 멈춘 진행부터  node cfphase_test.js <Main.js>
const H = require('./harness'); const vm = require('vm'); const fs = require('fs');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const src = fs.readFileSync(process.argv[2], 'utf8');
// 한 번 고치기 단계에서 부르는 함수 이름들
const onceBlock = src.slice(src.indexOf("{ n: '한 번 고치기'"), src.indexOf("{ n: '폼 인원'"));
const onceFns = Array.from(onceBlock.matchAll(/try \{ (\w+)\(\); \} catch \(e\) \{\}/g)).map(m => m[1]);
ok(onceFns.length > 20, '한 번 고치기 함수 찾음 ' + onceFns.length);
const stubs = ['removeOldUpdateTrigger_', 'normalizeRuns_', 'fixGold1110Once_', 'makeDueDays_', 'autoNextDay_', 'tidyOutbox_', 'closeIdleForms_', 'openStartingForms_',
  'ensureMidnightTrigger_', 'ensureRunNotices_', 'fixMisroutedNotices_', 'morningCheck_', 'assignCleanDaily_', 'ensureSubmitTriggers_', 'fruitCheck_', 'takbaeCheck_',
  'photoWaitCheck_', 'photoAskCheck_', 'takLateCheck_', 'payChkRecheck1_', 'ensureListMsgs_', 'ensureReviewGuideMsgs_', 'adoptOrphanForms_', 'reviewDone_', 'buildDashboard_',
  'rvLooseCheck_', 'rvAiQueue_', 'rvInboxSort_', 'ensureInboxTrigger_', 'ensureUsageTab_', 'refreshAssignFormulasOnce_', 'updatePay_', 'bgOverdue_', 'refreshEditTab_',
  'soonCheck_', 'ensureEditTab_', 'geminiKey_'].concat(onceFns);
env.__STUBS = stubs;
G(`globalThis.__NOW = Date.now(); Date.now = function () { return globalThis.__NOW; };
globalThis.__CALLS = []; globalThis.__COST = {}; globalThis.__SEEN = [];
__STUBS.forEach(function (n) { globalThis[n] = function () { __CALLS.push(n); __NOW += (__COST[n] == null ? 1 : __COST[n]) * 1000; if (n === 'ensureSubmitTriggers_') __SEEN.push('|'); return n === 'geminiKey_' ? '' : 0; }; });
dashErrorCells_ = function () { return []; };
outboxRows_ = function () { return []; };
outboxSheet_ = function () { return { getLastRow: function () { return 1; } }; };
const realSub = subTime_;
subTime_ = function (label, fn) { if (label === '폼 인원: 진행 확인') { __CALLS.push('checkRun'); __NOW += (__COST.checkRun == null ? 1 : __COST.checkRun) * 1000; return; } return realSub(label, fn); };
// 진행 3개 (오늘, 폼 있음). 폼ID를 읽을 때마다 순서 기록
readRuns_ = function () {
  return ['가', '나', '다'].map(function (t, i) {
    const r = { row: i + 2, '명단 제목': '#11.18 ' + t + ' 10', '진행일': today_(), '진행 상태': '진행중', '시트ID': 'S' + t, '목표인원': 10, '마감 시각': '' };
    Object.defineProperty(r, '폼ID', { get: function () { __SEEN.push(t); return 'F' + t; }, enumerable: true });
    return r;
  });
};`);
env.__props.set('DASH_TITLES', JSON.stringify(['#11.18 가 10', '#11.18 나 10', '#11.18 다 10']));
const run = (t0back) => { G('__CALLS.length = 0; __SEEN.length = 0; globalThis.__ORI_NOTES = []; globalThis.__ORI_T0 = __NOW - ' + (t0back || 0) * 1000 + ';'); G('checkFullInner_()'); return { calls: G('__CALLS.slice()'), notes: G('(globalThis.__ORI_NOTES || []).slice()'), ph: JSON.parse(env.__props.get('CF_PH') || '{}') }; };
const idx = (a, n) => a.indexOf(n);
const adv = s => G('__NOW += ' + s * 1000);
// 1) 처음: 전부, 정해진 순서 (공지 모양 → 폼 인원 → 알림 → 리뷰 확인 → 한눈에 → 명단 전달 안전망)
let r = run();
ok(['makeDueDays_', 'ensureRunNotices_', 'checkRun', 'fruitCheck_', 'ensureListMsgs_', 'reviewDone_', 'buildDashboard_', 'ensureUsageTab_'].every(n => idx(r.calls, n) >= 0), '1) 다 돎 ' + r.calls.join(','));
ok(idx(r.calls, 'ensureRunNotices_') < idx(r.calls, 'checkRun') && idx(r.calls, 'checkRun') < idx(r.calls, 'fruitCheck_') && idx(r.calls, 'fruitCheck_') < idx(r.calls, 'ensureListMsgs_') && idx(r.calls, 'reviewDone_') < idx(r.calls, 'buildDashboard_') && idx(r.calls, 'buildDashboard_') < idx(r.calls, 'ensureListMsgs_'), '1) 순서 ' + r.calls.join(','));
ok(idx(r.calls, 'soonCheck_') < 0 && !r.notes.some(x => /이어서/.test(x)), '1) 안 미룸 ' + r.notes.join(' | '));
ok(r.ph['폼 인원'] && r.ph['폼 인원'].d && !r.ph['폼 인원'].s && r.ph['한눈에'].d, '1) 끝난 시각 적음 ' + JSON.stringify(r.ph['폼 인원']));
// 2) 1분 뒤 다시: 매번 할 것만, 나머지는 건너뜀
adv(60); r = run();
ok(idx(r.calls, 'makeDueDays_') >= 0 && idx(r.calls, 'tidyOutbox_') >= 0, '2) 매번 할 것은 함');
ok(idx(r.calls, 'ensureRunNotices_') < 0 && idx(r.calls, 'checkRun') < 0 && idx(r.calls, 'fruitCheck_') < 0 && idx(r.calls, 'buildDashboard_') < 0, '2) 방금 한 건 건너뜀 ' + r.calls.join(','));
ok(r.notes.some(x => /방금 한 단계는 건너뜀/.test(x)), '2) 건너뜀 기록');
// 3) 폼 응답이 들어옴 → 폼 인원·명단 시트·한눈에만 다시
adv(60); G('cfDirty_()'); adv(1); r = run();
ok(idx(r.calls, 'checkRun') >= 0 && idx(r.calls, 'buildDashboard_') >= 0 && idx(r.calls, 'fruitCheck_') < 0 && idx(r.calls, 'ensureRunNotices_') < 0, '3) 응답 뒤 ' + r.calls.join(','));
// 4) 직접 하신 일 → 전부 다시
adv(60); G('cfDirty_(true)'); adv(1); r = run();
ok(idx(r.calls, 'fruitCheck_') >= 0 && idx(r.calls, 'ensureRunNotices_') >= 0 && idx(r.calls, 'reviewDone_') >= 0, '4) 직접 하신 일 뒤 전부 ' + r.calls.join(','));
// 5) 8분 지나면 전부 다시
adv(9 * 60); r = run();
ok(idx(r.calls, 'fruitCheck_') >= 0 && idx(r.calls, 'buildDashboard_') >= 0, '5) 8분 뒤 전부');
// 6) 시간이 모자람: 잠금을 200초 기다린 확인 + 한눈에가 지난번 150초 걸림 → 한눈에는 1분 뒤로, 1분 뒤 확인이 한눈에부터
adv(10 * 60);
{ const ph = JSON.parse(env.__props.get('CF_PH')); ph['한눈에'].t = 150; env.__props.set('CF_PH', JSON.stringify(ph)); }
r = run(200);
ok(idx(r.calls, 'buildDashboard_') < 0 && idx(r.calls, 'soonCheck_') >= 0, '6) 한눈에 미룸 ' + r.calls.join(','));
ok(r.notes.some(x => /1분 뒤 이어서: .*한눈에/.test(x)), '6) 기록 ' + r.notes.join(' | '));
ok(idx(r.calls, 'checkRun') >= 0 && idx(r.calls, 'fruitCheck_') >= 0, '6) 앞 단계는 함');
adv(70); r = run();
ok(idx(r.calls, 'buildDashboard_') >= 0 && idx(r.calls, 'fruitCheck_') < 0 && idx(r.calls, 'checkRun') < 0, '6) 이어서: 한눈에만 ' + r.calls.join(','));
// 7) 지난 확인이 6분에 끊김 → 알아채고 그 단계 예상 시간을 늘림
{ const ph = JSON.parse(env.__props.get('CF_PH')); ph['알림'].s = Date.now() - 400000; ph['알림'].o = 280; ph['알림'].t = 5; env.__props.set('CF_PH', JSON.stringify(ph)); }
adv(10 * 60); r = run();
ok(r.notes.some(x => /6분 제한에 끊김: 알림\(280초에 시작\)/.test(x)), '7) 끊김 알아챔 ' + r.notes.join(' | '));
ok(!r.ph['알림'].s && r.ph['알림'].t >= 60, '7) 예상 시간 늘림(이번에 돌고 조금 내림) ' + JSON.stringify(r.ph['알림']));
// 8) 20분 넘게 못 한 단계는 맨 앞으로
adv(10 * 60);
{ const ph = JSON.parse(env.__props.get('CF_PH')); ph['리뷰 확인'].d = Date.now() - 50 * 60000; env.__props.set('CF_PH', JSON.stringify(ph)); }
G('__NOW = Date.now()');
r = run();
ok(idx(r.calls, 'reviewDone_') >= 0 && idx(r.calls, 'reviewDone_') < idx(r.calls, 'ensureRunNotices_'), '8) 오래 밀린 리뷰 확인 먼저 ' + r.calls.join(','));
// 9) 폼 인원이 6분 가까이 되면 진행 사이에서 멈추고, 다음엔 멈춘 진행부터. 못 본 진행의 확인 필요 표시는 그대로
adv(10 * 60);
env.__props.set('RUN_ERRORS', JSON.stringify({ '#11.18 다 10': '옛 표시 다', '#11.18 가 10': '옛 표시 가' }));
{ const ph = JSON.parse(env.__props.get('CF_PH')); ph['폼 인원'].t = 1; env.__props.set('CF_PH', JSON.stringify(ph)); }
G('__COST.checkRun = 160');
r = run();
const runs1 = r.calls.filter(x => x === 'checkRun').length;
ok(runs1 === 2, '9) 두 진행 하고 멈춤 ' + runs1);
ok(r.ph['폼 인원'].cur === '#11.18 다 10' && idx(r.calls, 'soonCheck_') >= 0, '9) 멈춘 곳 기억 ' + JSON.stringify(r.ph['폼 인원']));
ok(r.notes.some(x => /폼 인원\(중간까지\)/.test(x)), '9) 기록 ' + r.notes.join(' | '));
const re1 = JSON.parse(env.__props.get('RUN_ERRORS'));
ok(re1['#11.18 다 10'] === '옛 표시 다' && !re1['#11.18 가 10'], '9) 못 본 진행 표시 유지 ' + JSON.stringify(re1));
G('__COST.checkRun = 1'); adv(70); r = run();
const seen = G('__SEEN.slice()'); const after = seen.slice(seen.lastIndexOf('|') + 1);
ok(after[0] === '다', '9) 다음엔 멈춘 진행부터 ' + after.join(','));
ok(!r.ph['폼 인원'].cur && r.ph['폼 인원'].d, '9) 다 돌면 지움');
ok(!JSON.parse(env.__props.get('RUN_ERRORS'))['#11.18 다 10'], '9) 다 돌면 표시 새로');
// 10) 2분 안이면 예상 시간이 커도 첫 단계는 시작 (영영 못 도는 단계 없게)
adv(10 * 60);
{ const ph = JSON.parse(env.__props.get('CF_PH')); Object.keys(ph).forEach(k => { if (ph[k].d) ph[k].d = Date.now() - 9 * 60000; }); ph['공지 모양'].t = 250; env.__props.set('CF_PH', JSON.stringify(ph)); }
G('__NOW = Date.now()'); r = run();
ok(idx(r.calls, 'ensureRunNotices_') >= 0, '10) 큰 단계도 맨 앞이면 시작 ' + r.calls.join(','));
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 15분 확인 단계(시간 예산·이어 하기) 시험 통과');
