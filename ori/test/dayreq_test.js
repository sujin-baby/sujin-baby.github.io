// (11/21) 처음 볼 때 이미 다 끝난 날짜: 취완과 같은 규칙으로 페이백·리뷰비 요청도 넣음 (14일 지난 것만 기억만)  node dayreq_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { RVDONE_INIT: '1', OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', LISTV_S1: '1', LISTV_S2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const OBH = ['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'];
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000), at = (n, h) => new Date(day(n).getTime() + h * 3600000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-8), '명단 제목': '#1.1 실 가짜상회 비니외 2 (뽀짝오리)', '카톡방': '#1.1 실 가짜상회 비니외 2', '시트ID': 'S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-8, 1), '캠페인': '실 가짜상회 비니외', '실배송': 'Y' }),
  mk({ '진행일': day(-5), '명단 제목': '#1.4 실 가짜상회 비니외 2 (뽀짝오리)', '카톡방': '#1.4 실 가짜상회 비니외 2', '시트ID': 'S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-5, 1), '캠페인': '실 가짜상회 비니외', '실배송': 'Y' }),
  mk({ '진행일': day(-20), '명단 제목': '#1.1 가짜옛날 3 (뽀짝오리)', '카톡방': '#1.1 가짜옛날 3', '시트ID': 'S2', '진행 상태': '진행중', '인원': 1, '목표인원': 1, '총건수': 1, '마감 시각': at(-20, 1), '캠페인': '가짜옛날' })]);
const mkList = rows => { const l = new H.Sheet('명단', [['x'], ['타임스탬프', '수령인', '옵션', '']].concat(rows)); Object.getPrototypeOf(l.getRange(1, 1)).getNotes = function () { return this.getValues().map(r => r.map(() => '')); }; return l; };
const L1 = mkList([[at(-8, 0.5), '홍길동', '', true], [at(-8, 0.6), '김철수', '', true], [at(-5, 0.5), '이영희', '', true], [at(-5, 0.6), '박민수', '', false]]);
const L2 = mkList([[at(-20, 0.5), '최가짜', '', true]]);
const ssOf = (id, l) => new Proxy({ getName: () => '# ' + id, getSheetByName: n => n === '명단' ? l : null, getUrl: () => 'https://x/' + id, getSheets: () => [l], getId: () => id }, { get: (t, k) => k in t ? t[k] : () => ({}) });
env.__L = { S1: ssOf('S1', L1), S2: ssOf('S2', L2) };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return globalThis.__L[id] || o(id); }; })()");
G('rvFolder_ = function () { return null; }; rvZip_ = function () {};');
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH]);
let err = ''; try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const rows = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0]);
const pay = rows().filter(r => /요청$/.test(r[2])), chw = rows().filter(r => r[2] === '취완');
ok(pay.length === 1 && pay[0][2] === '페이백 요청' && pay[0][4].indexOf('[전원 리뷰완료] #1.1 실 가짜상회 비니외 2 페이백 요청드립니다!') === 0, '처음 볼 때 끝나 있던 1.1 페이백 요청 ' + JSON.stringify(pay.map(r => r[4])) + ' / ' + env.__notes().join(' | '));
ok(chw.length === 1 && chw[0][3] === '#1.1 실 가짜상회 비니외 2', '취완도 1.1만 ' + JSON.stringify(chw.map(r => r[3])));
ok(!rows().some(r => /가짜옛날/.test(r[3] + r[4]) && /^(취완|페이백 요청|리뷰비 요청)$/.test(r[2])), '14일 지난 건 기억만 ' + JSON.stringify(rows().filter(r => /가짜옛날/.test(r[3] + r[4])).map(r => r[2])));
// 두 번째 실행: 다시 안 넣음
try { G('reviewDone_(readRuns_())'); } catch (e) {}
ok(rows().filter(r => /요청$/.test(r[2])).length === 1, '두 번 안 넣음');
// biniPay1_: 그 진행 페이백 요청을 한 번 넣고, 다시 돌리면 안 넣음
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-8), '명단 제목': '#11.13 실 에스지엠컴퍼니비니외8 (뽀짝오리)', '시트ID': 'S1', '진행 상태': '진행중', '인원': 8, '실배송': 'Y' })]);
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH]);
try { G('biniPay1_()'); G("PropertiesService.getScriptProperties().deleteProperty('BINIPAY1')"); G('biniPay1_()'); } catch (e) { fails.push('biniPay1_ 오류 ' + (e.stack || e)); }
const bp = rows().filter(r => r[2] === '페이백 요청');
ok(bp.length === 1 && bp[0][3] === '오리명단방(뽀짝)' && bp[0][4] === '[전원 리뷰완료] #11.13 실 에스지엠컴퍼니비니외8 페이백 요청드립니다!\n\n명단시트: https://x/S1', 'biniPay1_ ' + JSON.stringify(bp));
ok(/^✓ 이미 있음/.test(G("PropertiesService.getScriptProperties().getProperty('BINIPAY1')")), '두 번째는 이미 있음');
console.log(fails.length ? 'XX 처음 볼 때 페이백 요청 시험 실패:\n- ' + fails.join('\n- ') : '✓ 처음 볼 때 끝나 있던 날짜도 페이백·리뷰비 요청 (14일 지난 건 기억만) 시험 통과');
process.exit(fails.length ? 1 : 0);
