// (11/25) 15분 확인 '폼 인원': 새 응답 없는 진행은 30분에 한 번만 다시 셈 (폼 제출 트리거가 그 자리에서 인원·마감)  node fcheck_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const now = 1795600000000, m = 60000;
env.__a = { s: 'SIG', t: now - 10 * m };
const skip = (sig, sub, dirty, t) => G('fcheckSkip_(__a, ' + JSON.stringify(sig) + ', ' + sub + ', ' + dirty + ', ' + t + ')');
ok(skip('SIG', 0, 0, now) === true, '10분 전에 다 셌고 그 뒤 아무 일 없음 → 건너뜀');
ok(skip('SIG', now - 5 * m, 0, now) === false, '그 뒤 이 폼에 새 응답 → 다시 셈');
ok(skip('SIG', now - 20 * m, 0, now) === true, '새 응답이 지난번 세기 전 → 건너뜀');
ok(skip('OTHER', 0, 0, now) === false, '진행 값(목표·인원·마감·날짜) 바뀜 → 다시 셈');
ok(skip('SIG', 0, now - 2 * m, now) === false, '직접 하신 일 → 다시 셈');
ok(skip('SIG', 0, 0, now + 25 * m) === false, '30분 지나면 다시 셈');
env.__a = {}; ok(skip('SIG', 0, 0, now) === false, '처음은 셈');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/setProperty\('FSUB_' \+ e\.source\.getId\(\), String\(Date\.now\(\)\)\)/.test(src.slice(src.indexOf('function onRunSubmit_'), src.indexOf('function onRunSubmit_') + 800)), '폼 제출 때 FSUB_ 표시');
ok(/if \(fcheckSkip_\(last, fsig\(r\), Number\(props\.getProperty\('FSUB_' \+ r\['폼ID'\]\) \|\| 0\), dirtyAll, Date\.now\(\)\)\) \{ if \(r\['시트ID'\]\) listed\[r\['시트ID'\]\] = 1;/.test(src), '건너뛴 진행도 명단 시트 단계 목록에 넣음');
ok(/okRun && String\(props\.getProperty\('CF_DIRTY'\) \|\| ''\) === dirty0\) fchk\[fk\] =/.test(src), '세는 중 다시 확인 표시가 생기면 기억 안 함(명단 덜 참 등)');
ok(/carry\.forEach\(function \(t\) \{ if \(pe\[t\]\) prevErr\[t\] = pe\[t\]; \}\)/.test(src), '건너뛴 진행 확인 필요 표시 유지');

// 실제 15분 확인 흐름: 진행 3개 → 처음엔 다 셈, 2분 뒤 '나' 폼에만 새 응답 → '나'만 셈, 31분 뒤엔 다 셈
{
  const fs = require('fs'), src2 = fs.readFileSync(process.argv[2], 'utf8');
  const e2 = H.makeEnv({ main: process.argv[2] }); const G2 = k => vm.runInContext(k, e2);
  const onceBlock = src2.slice(src2.indexOf("{ n: '한 번 고치기'"), src2.indexOf("{ n: '폼 인원'"));
  const onceFns = Array.from(onceBlock.matchAll(/try \{ (\w+)\(\); \} catch \(e\) \{\}/g)).map(m => m[1]);
  const alwaysBlock = src2.slice(src2.indexOf("cfAlways_(S, '진행목록'"), src2.indexOf("cfAlways_(S, '다음 일차'"));
  const alwaysFns = Array.from(alwaysBlock.matchAll(/try \{ (\w+)\(\); \} catch \(e\) \{\}/g)).map(m => m[1]);
  e2.__STUBS = ['removeOldUpdateTrigger_', 'normalizeRuns_', 'fixGold1110Once_', 'makeDueDays_', 'autoNextDay_', 'tidyOutbox_', 'closeIdleForms_', 'openStartingForms_',
    'ensureMidnightTrigger_', 'ensureRunNotices_', 'fixMisroutedNotices_', 'morningCheck_', 'assignCleanDaily_', 'ensureSubmitTriggers_', 'fruitCheck_', 'takbaeCheck_',
    'photoWaitCheck_', 'photoAskCheck_', 'takLateCheck_', 'payChkRecheck1_', 'ensureListMsgs_', 'ensureReviewGuideMsgs_', 'adoptOrphanForms_', 'reviewDone_', 'buildDashboard_',
    'rvLooseCheck_', 'rvAiQueue_', 'rvInboxSort_', 'ensureInboxTrigger_', 'ensureUsageTab_', 'refreshAssignFormulasOnce_', 'updatePay_', 'bgOverdue_', 'refreshEditTab_',
    'soonCheck_', 'ensureEditTab_', 'geminiKey_', 'bgRun_', 'propsSqueeze_'].concat(onceFns, alwaysFns);
  G2(`globalThis.__NOW = 1795600000000; Date.now = function () { return globalThis.__NOW; };
  globalThis.__CHK = [];
  __STUBS.forEach(function (n) { globalThis[n] = function () { __NOW += 1000; return n === 'geminiKey_' ? '' : 0; }; });
  dashErrorCells_ = function () { return []; }; outboxRows_ = function () { return []; }; outboxSheet_ = function () { return { getLastRow: function () { return 1; } }; };
  const realSub = subTime_;
  subTime_ = function (label, fn) { if (label === '폼 인원: 진행 확인') { __NOW += 1000; return fn(); } return realSub(label, fn); };
  readRuns_ = function () { return ['가', '나', '다'].map(function (t, i) { return { row: i + 2, '명단 제목': '#11.25 ' + t + ' 10', '진행일': today_(), '진행 상태': '진행중', '시트ID': 'S' + t, '폼ID': 'F' + t, '목표인원': 10, '인원': 3, '마감 시각': '' }; }); };`);
  // checkRun_은 checkFullInner_ 안 함수라, 폼 인원 단계가 부르는 subTime_ 안에서 기록만 하게 checkRun_ 대신 FormApp을 막음
  G2("FormApp = { openById: function (id) { __CHK.push(id); throw new Error('시험: 폼 안 엶'); } };");
  const run = () => { G2('__CHK.length = 0; globalThis.__ORI_NOTES = []; globalThis.__ORI_T0 = __NOW;'); G2('checkFullInner_()'); return G2('__CHK.slice()'); };
  let c = run();
  ok(['F가', 'F나', 'F다'].every(x => c.indexOf(x) >= 0), '처음엔 다 셈 ' + c.join(','));
  // 시험에선 폼을 못 열어 '실패'라 기억 안 함 → 기억은 직접 넣어 둠 (성공했다고 치고)
  const sig = t => G2(`(function(){ const r = readRuns_().filter(function (x) { return x['폼ID'] === 'F${t}'; })[0]; return cfHash_([Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd'), r['폼ID'], r['시트ID'], r['목표인원'], r['인원'], '', r['진행 상태'], r['진행일'].getTime()].join('|')).slice(0, 16); })()`);
  const fc = {}; ['가', '나', '다'].forEach(t => { fc['#11.25 ' + t + ' 10'] = { s: sig(t), t: G2('__NOW') - 1000 }; });
  e2.__props.set('CF_FCHK', JSON.stringify(fc));
  e2.__props.set('RUN_ERRORS', JSON.stringify({ '#11.25 다 10': '옛 표시 다' }));
  G2('__NOW += 120000'); e2.__props.set('FSUB_F나', String(G2('__NOW'))); G2('cfDirty_()'); G2('__NOW += 1000');
  c = run();
  ok(c.join(',') === 'F나', "'나' 폼에만 새 응답 → '나'만 셈 " + c.join(','));
  ok(JSON.parse(e2.__props.get('RUN_ERRORS'))['#11.25 다 10'] === '옛 표시 다', '건너뛴 진행 확인 필요 표시 유지');
  ok(G2('globalThis.__ORI_NOTES').some(x => /새 응답 없는 진행 2개는 30분마다만 셈/.test(x)), '기록 ' + G2('globalThis.__ORI_NOTES').join(' | '));
  G2('__NOW += 31 * 60000'); c = run();
  ok(['F가', 'F다'].every(x => c.indexOf(x) >= 0), '30분 지나면 다 셈 ' + c.join(','));
}
console.log(fails.length ? 'XX 폼 인원 건너뛰기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 폼 인원: 새 응답 없는 진행 30분마다 시험 통과');
process.exit(fails.length ? 1 : 0);
