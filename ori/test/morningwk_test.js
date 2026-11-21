// (11/21) 새벽 점검: 주말에도 진행하는 일정 줄(설정 weekend)은 바로 전날 만들므로 '안 만들어짐'으로 알리지 않음  node morningwk_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
// planDue_: 평일 의뢰는 전 진행일, 주말 의뢰는 바로 전날 (2026-11-23 월)
const iso = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
ok(iso(G('planDue_(new Date(2026, 10, 23), false)')) === '2026-11-20', '평일 의뢰 월요일 → 금요일 ' + iso(G('planDue_(new Date(2026, 10, 23), false)')));
ok(iso(G('planDue_(new Date(2026, 10, 23), true)')) === '2026-11-22', '주말 의뢰 월요일 → 일요일 ' + iso(G('planDue_(new Date(2026, 10, 23), true)')));
ok(G("planWk_('{\"weekend\":true}')") === true && G("planWk_('{}')") === false && G("planWk_('깨진')") === false, 'planWk_');
// morningCheck_: 오늘을 2026-11-21(토)로 고정. 11/23(월) 진행 일정 줄 — 주말 의뢰는 11/22(일)에 만듦 → 아직 아님, 평일 의뢰는 11/20(금)에 만들었어야 → 경고
G('today_ = function () { return new Date(2026, 10, 21); }');
const PH = G('PLAN_HEAD');
env.__ss.sheets['일정'] = new H.Sheet('일정', [PH.slice(),
  ['P1', '가짜 타이즈', 3, new Date(2026, 10, 23), '#가짜주말 타이즈 10', '#가짜주말 타이즈 10 (뽀짝오리)', 10, '[]', '대기', JSON.stringify({ weekend: true })],
  ['P2', '가짜 평일', 2, new Date(2026, 10, 23), '#가짜평일 양말 5', '#가짜평일 양말 5 (뽀짝오리)', 5, '[]', '대기', '{}']]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]);
const fd = env.Utilities.formatDate; env.Utilities.formatDate = function (d, tz, f) { return f === 'H' ? '6' : fd.apply(this, arguments); };
let err = ''; try { G('morningCheck_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const all = env.__ss.sheets['보낼메시지'].rows.slice(1).map(r => String(r[4])).join('\n') + '\n' + (env.__notes ? env.__notes().join('\n') : '') + '\n' + String(env.__props.get('MORNING_LAST') || '');
ok(!/가짜주말/.test(all), '주말 의뢰 내일 진행은 경고 안 함 ' + all.slice(0, 300));
ok(/가짜평일/.test(all), '평일 의뢰 지난 건 경고 ' + all.slice(0, 300));
console.log(fails.length ? 'XX 새벽 점검 주말 의뢰 시험 실패:\n- ' + fails.join('\n- ') : '✓ 새벽 점검: 주말 의뢰는 바로 전날 기준 (오탐 없음) 시험 통과');
process.exit(fails.length ? 1 : 0);
