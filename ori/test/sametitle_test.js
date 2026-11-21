// (11/19 피클) 다른 의뢰서 진행과 방제가 글자까지 같으면: 새 진행은 안 만들고, 월급시트는 한 줄에 섞어 쓰지 않고 멈춤  node sametitle_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': t0, '명단 제목': '#11.20 실 가나상점 레깅스 30 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중', '요청ID': 'aaa' }),
  mk({ '진행일': t0, '명단 제목': '#택11.20 다라 귤 10 (뽀짝오리)', '시트ID': 'S2', '진행 상태': '진행중', '요청ID': 'bbb' }),
  mk({ '진행일': t0, '명단 제목': '#11.19 실 끝난 것 5 (뽀짝오리)', '시트ID': 'S3', '진행 상태': '종료', '요청ID': 'ccc' })]);
G("globalThis.__MADE = []; createRunInner_ = function (d) { __MADE.push(d.title); return { ok: 1 }; }; runByRequest_ = runByTitle_ = runByUrls_ = function () { return null; }; autoAssign_ = function () { return ''; };");
const mkRun = d => { try { G('createRunLocked_(' + JSON.stringify(d) + ')'); return ''; } catch (e) { return String(e.message || e); } };
const e1 = mkRun({ title: '#11.20 실 가나상점 레깅스 30 (뽀짝오리)', n: 'zzz', desc: '공지' });
ok(/같은 방제의 진행이 이미 있어요: #11\.20 실 가나상점 레깅스 30 \(진행목록 2행/.test(e1) && G('__MADE.length') === 0, '똑같은 방제는 안 만듦 ' + e1);
const e2 = mkRun({ title: '#11.20 다라 귤 10 (뽀짝오리)', takdae: true, n: 'yyy', desc: '공지' });
ok(/같은 방제/.test(e2) && G('__MADE.length') === 0, '택대라 택이 붙으면 같은 방제도 막음 ' + e2);
const e3 = mkRun({ title: '#11.20 실 가나상점 레깅스 30-2 (뽀짝오리)', n: 'xxx', desc: '공지' });
ok(!e3 && G('__MADE.length') === 1, '구분을 붙이면 만듦 ' + e3);
const e4 = mkRun({ title: '#11.19 실 끝난 것 5 (뽀짝오리)', n: 'www', desc: '공지' });
ok(!e4 && G('__MADE.length') === 2, '끝난(종료) 진행과 같은 건 괜찮음 ' + e4);
// 월급시트: 같은 방제 진행이 둘이면 안 씀 + 할 일
env.__ss.sheets['진행목록'].rows.push(mk({ '진행일': t0, '명단 제목': '#11.20 실 가나상점 레깅스 30 (뽀짝오리)', '시트ID': 'S9', '진행 상태': '진행중', '요청ID': 'ddd' }));
G("globalThis.__TAB = 0; payTab_ = function () { __TAB++; return null; };");
const rr = G('readRuns_()');
G('writePayRow_')(rr.find(r => r['시트ID'] === 'S9'), '#11.20 실 가나상점 레깅스 30', 30, 0, false, null, rr);
ok(G('__TAB') === 0, '같은 방제가 둘이면 월급시트를 안 엶');
const todo = (env.__ss.sheets['보낼메시지'] ? env.__ss.sheets['보낼메시지'].rows.slice(1) : []).filter(r => r[2] === '할 일' && /월급시트 멈춤/.test(r[4]));
ok(todo.length === 1 && /진행목록 2행·5행/.test(todo[0][4]), '할 일 ' + JSON.stringify(todo.map(r => r[4])));
try { G('writePayRow_')(rr.find(r => r['시트ID'] === 'S2'), '#택11.20 다라 귤 10', 10, 0, false, null, rr); } catch (e) {}   // 가짜 월급시트가 없어 그 뒤는 실패해도 됨
ok(G('__TAB') === 1, '다른 진행은 그대로 씀');
console.log(fails.length ? 'XX 같은 방제 시험 실패:\n- ' + fails.join('\n- ') : '✓ 같은 방제 새 진행 막기·월급시트 멈춤 시험 통과');
process.exit(fails.length ? 1 : 0);
