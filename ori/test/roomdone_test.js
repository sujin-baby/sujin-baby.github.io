// 취완은 방(날짜)마다 (11/8 사용자 요청): 그 방 사람 리뷰 확인이 다 체크되면 그 카톡방에 '취완' 한 번. 의뢰 전체 취완 글은 안 넣음  node roomdone_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { RVDONE_INIT: '1', OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', LISTV_S1: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000), at = (n, h) => new Date(day(n).getTime() + h * 3600000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-6), '명단 제목': '#택1.1 밴드 2 (뽀짝오리)', '카톡방': '#택1.1 밴드 2', '시트ID': 'S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-6, 1), '캠페인': '밴드' }),
  mk({ '진행일': day(-5), '명단 제목': '#택1.2 밴드 2 (뽀짝오리)', '카톡방': '#택1.2 밴드 2', '시트ID': 'S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-5, 1), '캠페인': '밴드' })]);
// 명단 시트: 1일차 2명 다 체크, 2일차 1명만
const list = new H.Sheet('명단', [['밴드'], ['타임스탬프', '수령인', '옵션', ''],
  [at(-6, 0.5), '가', '빨강', true], [at(-6, 0.7), '나', '빨강', true], [at(-5, 0.5), '다', '빨강', true], [at(-5, 0.6), '라', '빨강', false]]);
const RP = Object.getPrototypeOf(list.getRange(1, 1));
RP.getNotes = function () { return this.getValues().map(r => r.map(() => '')); };
const lss = { getName: () => '밴드 명단', getSheetByName: n => n === '명단' ? list : null, getUrl: () => 'https://x/S1', getSheets: () => [list], getId: () => 'S1' };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return id === 'S1' ? globalThis.__LSS : o(id); }; })()"); env.__LSS = new Proxy(lss, { get: (t, k) => k in t ? t[k] : () => ({}) });
G('rvFolder_ = function () { return null; }; rvZip_ = function () {};');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const msgs = () => (env.__ss.sheets['보낼메시지'] ? env.__ss.sheets['보낼메시지'].rows.slice(1) : []).filter(r => r[2] === '취완').map(r => r[3]);
let err = '';
try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
ok(JSON.stringify(msgs()) === JSON.stringify(['#택1.1 밴드 2']), '1일차 방만 취완: ' + JSON.stringify(msgs()) + ' / ' + env.__notes().filter(x => /취완|실패/.test(x)).join(' | '));
// 2일차 마지막 사람 체크 → 그 방 취완, 1일차는 다시 안 넣음, 의뢰 전체 '(전체 N개 방)' 글 없음
list.rows[5][3] = true;
env.__props.forEach((v, k) => { if (/^RVSEEN_/.test(k)) env.__props.delete(k); });
try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류2 ' + err);
ok(JSON.stringify(msgs().slice().sort()) === JSON.stringify(['#택1.1 밴드 2', '#택1.2 밴드 2']), '2일차 방 취완: ' + JSON.stringify(msgs()));
ok(!msgs().some(m => /전체/.test(m)), '의뢰 전체 취완 글이 들어감');
// 5분 확인: 명단 시트 수정 시각이 바뀐 의뢰만 리뷰 확인 (11/8 리뷰비 요청이 너무 늦게 뜸)
let mod = 1000; env.__props.delete('RVDONE_S1');   // 아직 진행 중인 의뢰로 (다 끝난 의뢰는 5분 확인에서 안 봄)
G("DriveApp.getFileById = function (id) { return { getLastUpdated: function () { return new Date(globalThis.__MOD); }, getName: function () { return '밴드 명단'; } }; }"); env.__MOD = mod;
G("(function () { const o = reviewDone_; reviewDone_ = function (r, only) { globalThis.__CALLS = (globalThis.__CALLS || 0) + 1; globalThis.__ONLY = only; return o(r, only); }; })()");
ok(G('rvQuickCheck_()') === 1 && JSON.stringify(G('__ONLY')) === '["S1"]', '처음엔 바뀐 걸로 봄');
ok(G('rvQuickCheck_()') === 0, '안 바뀌었는데 또 봄');
env.__MOD = 2000; env.__props.delete('RVDONE_S1');
ok(G('rvQuickCheck_()') === 1, '바뀌었는데 안 봄');
console.log(fails.length ? 'XX 방별 취완 시험 실패:\n- ' + fails.join('\n- ') : '✓ 방별 취완 시험 통과');
process.exit(fails.length ? 1 : 0);
