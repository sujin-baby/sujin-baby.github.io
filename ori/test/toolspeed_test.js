// (11/22 피클 인계 '진행 도우미 느림') toolAction_: 진행목록 한 번만, 시트 옆 창에서 진행만 고를 때는 현황·할 일 빼고, 웹(full)은 늘 다, 저장은 현황 한 번  node toolspeed_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(0), '명단 제목': '#1.1 가짜 양말 5 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행중', '인원': 3, '목표인원': 5, '캠페인': '가짜 양말' }),
  mk({ '진행일': day(1), '명단 제목': '#1.2 가짜 양말 5 (뽀짝오리)', '시트ID': 'S1', '폼ID': 'F1', '진행 상태': '진행예정', '인원': 0, '목표인원': 5, '캠페인': '가짜 양말' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'], ['m1', day(0), '할 일', '내 할 일', '[가짜] 확인', '대기']]);
const T = '#1.1 가짜 양말 5 (뽀짝오리)';
let reads = 0, today = 0;
G('(function () { const r = readRunsRaw_, ti = todayItems_; readRunsRaw_ = function () { globalThis.__R = (globalThis.__R || 0) + 1; return r(); }; todayItems_ = function (x) { globalThis.__T = (globalThis.__T || 0) + 1; return ti(x); }; dupList_ = function (r, runs) { globalThis.__DR = runs ? 1 : 0; return []; }; assignRun_ = function () { return "저장했어요."; }; findRunByNotice_ = function (list) { return { run: list[0] }; }; noticeMatches_ = function () { return true; }; })()');
const run = d => { G('globalThis.__R = 0; globalThis.__T = 0; globalThis.__DR = -1;'); let o = null, e = ''; try { o = G('toolAction_(' + JSON.stringify(d) + ')'); } catch (x) { e = String(x.stack || x); } return { o, e, R: G('globalThis.__R'), T: G('globalThis.__T'), DR: G('globalThis.__DR') }; };
// 1) 첫 화면: 현황·할 일 있음, 진행목록 1번
let x = run({ act: 'info' });
ok(!x.e && x.o.status && x.o.today && x.R === 1 && x.T === 1, '첫 화면 ' + JSON.stringify({ e: x.e, R: x.R, T: x.T, st: !!(x.o && x.o.status) }));
// 2) 시트 옆 창에서 진행 고르기: 현황·할 일 없음, 진행목록 1번, 중복은 같은 진행목록으로
x = run({ act: 'info', title: T });
ok(!x.e && !x.o.status && !x.o.today && x.R === 1 && x.T === 0 && x.DR === 1 && x.o.title === T && x.o.count === 3 && x.o.alts.length === 1, '옆 창 고르기 ' + JSON.stringify({ e: x.e, R: x.R, T: x.T, DR: x.DR, st: !!(x.o && x.o.status), title: x.o && x.o.title }));
// 3) 웹(full)에서 고르기: 늘 다
x = run({ act: 'info', title: T, full: true });
ok(!x.e && x.o.status && x.o.today && x.R === 1 && x.T === 1 && x.o.title === T, '웹 고르기 ' + JSON.stringify({ e: x.e, R: x.R, T: x.T }));
// 4) 옆 창 저장(assign): 저장 뒤 현황·할 일 한 번 (예전엔 저장 전에 한 번 + 이어 부르는 보기에서 또)
x = run({ act: 'assign', title: T, text: '공지 글' });
ok(!x.e && x.o.saved && x.o.status && x.o.today && x.T === 1 && x.R === 1, '옆 창 저장 ' + JSON.stringify({ e: x.e, R: x.R, T: x.T, saved: x.o && x.o.saved }));
// 5) 웹 저장: 저장 응답엔 현황 없음 (toolsRequest_가 이어서 full 보기를 부름)
x = run({ act: 'assign', title: T, text: '공지 글', full: true });
ok(!x.e && x.o.saved && !x.o.today && x.T === 0, '웹 저장 ' + JSON.stringify({ e: x.e, T: x.T }));
// 6) 공지 없이 저장 누름(웹): 현황 보냄
x = run({ act: 'assign', title: T, text: '', full: true });
ok(!x.e && x.o.status && x.o.today, '공지 없는 저장 ' + JSON.stringify({ e: x.e, T: x.T }));
// 7) 보냄(sent): 할 일 다시
x = run({ act: 'sent', id: 'm1', title: T });
ok(!x.e && x.o.today && x.T === 1, '보냄 ' + JSON.stringify({ e: x.e, T: x.T }));
// 8) 웹 요청은 full
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/pv: String\(p\.pv \|\| ''\), full: true \}/.test(src) && /toolAction_\(\{ act: 'info', title: o\.title, full: true \}\)/.test(src), '웹 요청 full');
console.log(fails.length ? 'XX 진행 도우미 속도 시험 실패:\n- ' + fails.join('\n- ') : '✓ 진행 도우미: 진행목록 한 번·옆 창 고르기는 가볍게·웹은 다·저장은 현황 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
