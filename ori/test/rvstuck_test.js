// (11/18) 업체 전달 막힘: 인원은 다 모였는데 리뷰 확인 체크가 안 된 사람이 있어 '의뢰 끝'(업체 전달)이 안 뜨면 왜 안 뜨는지 알림  node rvstuck_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { RVDONE_INIT: '1', OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', LISTV_S1: '1' } }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000), at = (n, h) => new Date(day(n).getTime() + h * 3600000);
const md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-9), '명단 제목': '#택' + md(day(-9)) + ' 과일쏙 사과외 2 (뽀짝오리)', '카톡방': '#택' + md(day(-9)) + ' 과일쏙 사과외 2', '시트ID': 'S1', '시트 링크': 'https://x/S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-9, 1), '캠페인': '과일쏙 사과외', '리뷰 취합': day(-2) }),
  mk({ '진행일': day(-8), '명단 제목': '#택' + md(day(-8)) + ' 과일쏙 사과외 2 (뽀짝오리)', '카톡방': '#택' + md(day(-8)) + ' 과일쏙 사과외 2', '시트ID': 'S1', '시트 링크': 'https://x/S1', '진행 상태': '진행중', '인원': 2, '목표인원': 2, '총건수': 4, '마감 시각': at(-8, 1), '캠페인': '과일쏙 사과외' })]);
const list = new H.Sheet('명단', [['과일쏙'], ['타임스탬프', '수령인', '옵션', ''],
  [at(-9, 0.5), '가', '빨강', true], [at(-9, 0.7), '나', '빨강', true], [at(-8, 0.5), '홍길동', '빨강', false], [at(-8, 0.6), '라', '빨강', true]]);
const RP = Object.getPrototypeOf(list.getRange(1, 1));
RP.getNotes = function () { return this.getValues().map(r => r.map(() => '')); };
const lss = { getName: () => '과일쏙 명단', getSheetByName: n => n === '명단' ? list : null, getUrl: () => 'https://x/S1', getSheets: () => [list], getId: () => 'S1' };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return id === 'S1' ? globalThis.__LSS : o(id); }; })()"); env.__LSS = new Proxy(lss, { get: (t, k) => k in t ? t[k] : () => ({}) });
G('rvFolder_ = function () { return null; }; rvZip_ = function () {};');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const todos = () => (env.__ss.sheets['보낼메시지'] ? env.__ss.sheets['보낼메시지'].rows.slice(1) : []).filter(r => r[2] === '할 일' && /업체 전달 못 함/.test(r[4])).map(r => r[4]);
let err = '';
try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const st = env.__props.get('RVSTUCK_S1');
ok(st && JSON.parse(st).n === 1 && JSON.parse(st).un[0] === '홍길동(' + md(day(-8)) + ')', '막힘 저장 ' + st);
ok(!env.__props.get('RVRPT_S1'), '아직 의뢰 끝 아님');
ok(todos().length === 1 && /리뷰 확인 안 된 1명: 홍길동/.test(todos()[0]) && /리뷰 취합 안 한 날: /.test(todos()[0]), '할 일 한 번 ' + JSON.stringify(todos()));
let items = G('rvItems_(readRuns_(), PropertiesService.getScriptProperties())');
ok(items.length === 1 && items[0].type === 'stuck' && /^⚠ 업체 전달 못 함: 과일쏙 사과외 .*홍길동/.test(items[0].label), '한눈에 빨간 줄 ' + JSON.stringify(items));
// 다시 봐도 할 일은 한 번만
env.__props.forEach((v, k) => { if (/^RVSEEN_/.test(k)) env.__props.delete(k); });
G('reviewDone_(readRuns_())');
ok(todos().length === 1, '할 일 두 번 ' + todos().length);
// 리뷰 취합도 안 했고 최근 진행이면(아직 진행 중으로 봄) 안 띄움
ok(G("rvStuckLate_([{ '진행일': today_(), '리뷰 취합': '' }])") === false && G("rvStuckLate_([{ '진행일': new Date(today_().getTime() - 8 * 86400000), '리뷰 취합': '' }])") === true, '늦음 판단');
// 사진 수 문구
ok(/리뷰이미지 사진 30장\(포토 8·텍스트 22\) \/ 40명 → 10장 모자람/.test(G("rvStuckText_(readRuns_(), { un: [], n: 0, ppl: 40, ph: { 포토: 8, 텍스트: 22, 별점: 0, 기타: 0 } })")), '사진 수 문구 ' + G("rvStuckText_(readRuns_(), { un: [], n: 0, ppl: 40, ph: { 포토: 8, 텍스트: 22, 별점: 0, 기타: 0 } })"));
// 마지막 사람 체크 → 막힘 지우고 의뢰 끝(업체 전달 줄)
list.rows[4][3] = true;
env.__props.forEach((v, k) => { if (/^RVSEEN_/.test(k)) env.__props.delete(k); });
try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류2 ' + err);
ok(!env.__props.get('RVSTUCK_S1') && env.__props.get('RVRPT_S1'), '체크하면 막힘 풀림 ' + env.__props.get('RVSTUCK_S1'));
items = G('rvItems_(readRuns_(), PropertiesService.getScriptProperties())');
ok(items.length === 1 && items[0].type === 'req', '의뢰 끝 줄 ' + JSON.stringify(items.map(i => i.label)));
// 예전에 이미 본(RVSEEN_ 같음) 의뢰도 막힘 이유는 한 번 다시 봄
env.__props.delete('RVRPT_S1'); env.__props.delete('RVDONE_S1'); list.rows[4][3] = false;
G("DriveApp.getFileById = function () { return { getLastUpdated: function () { return new Date(1000); }, getName: function () { return '과일쏙 명단'; } }; }");
G('reviewDone_(readRuns_())');   // RVSEEN_ 저장
env.__props.delete('RVSTUCK_S1');
G('reviewDone_(readRuns_())');
ok(env.__props.get('RVSTUCK_S1') && env.__props.get('RVSTUCK_S1').charAt(0) === '{', '본 의뢰도 한 번 다시 ' + env.__props.get('RVSTUCK_S1'));
// (11/19 피클) 리뷰 확인이 시간을 넘기면 멈추고(RV_CUR) 다음엔 거기서부터
G('globalThis.__ORI_T0 = Date.now() - 300000');
ok(G('reviewDone_(readRuns_())') === true && env.__props.get('RV_CUR') === 'S1', '시간 넘으면 멈춤 ' + env.__props.get('RV_CUR'));
G('globalThis.__ORI_T0 = Date.now()');
ok(G('reviewDone_(readRuns_())') === false && !env.__props.get('RV_CUR'), '다음엔 이어서 끝냄');
console.log(fails.length ? 'XX 업체 전달 막힘 시험 실패:\n- ' + fails.join('\n- ') : '✓ 업체 전달 막힘 알림 시험 통과');
process.exit(fails.length ? 1 : 0);
