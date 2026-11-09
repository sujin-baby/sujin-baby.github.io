// 리뷰 독촉은 방마다 한 줄, 이름은 지금 체크 안 된 사람 (11/9) + 포토 요청 할 일은 캠페인마다 한 번 (11/9)  node nagsync_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { RVDONE_INIT: '1', OUTBOX_SORTED: '1', OUTBOX_FMT2: '1', LISTV_S1: '1', RVROOMDONE_INIT_S1: '1', RVDAYREQ_INIT_S1: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const OBH = ['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'];
const nag = (id, room, names, again, st) => [id, new Date(), '리뷰 독촉', room, ['⏰ 리뷰 작성 기한이 ' + (again ? '3일 지났어요' : '지났어요'), '아직 리뷰 확인이 안 된 분: ' + names, '이미 쓰셨으면 리뷰 캡처를 올려 주시고, 아직이면 오늘 중으로 작성 부탁드려요!'].join('\n'), st || '대기'];
const rows = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[0]);
// 1) rvNagSync_ 하나만
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH, nag('a1', '#10.26 실 신발패드 8', '가, 나, 다', true), nag('a2', '#10.26 실 신발패드 8', '가, 나, 다', false), nag('a3', '#10.27 치약 5', '라', false),
  nag('a4', '#10.26 실 신발패드 8', '가, 나, 다', false, '보냄'), nag('a5', '#다른방', '마', false), ['t1', new Date(), '할 일', '사장님', '[#택 x] 무엇', '대기']]);
G("rvNagSync_({ '#10.26 실 신발패드 8': ['다'], '#10.27 치약 5': [] })");
const r1 = rows();
ok(r1.filter(r => r[3] === '#10.26 실 신발패드 8' && r[5] !== '보냄').length === 1, '신발패드 안 보낸 독촉 한 줄 ' + JSON.stringify(r1.map(r => r[0])));
const kept = r1.filter(r => r[3] === '#10.26 실 신발패드 8' && r[5] !== '보냄')[0];
ok(kept && kept[0] === 'a1' && /안 된 분: 다\n/.test(kept[4]) && /3일 지났어요/.test(kept[4]), '3일 뒤 독촉을 남기고 이름을 지금대로 ' + JSON.stringify(kept));
ok(!r1.some(r => r[3] === '#10.27 치약 5'), '다 체크된 방 독촉 지움');
ok(r1.some(r => r[0] === 'a4' && /가, 나, 다/.test(r[4])), '보낸 독촉은 그대로');
ok(r1.some(r => r[0] === 'a5') && r1.some(r => r[0] === 't1'), '다른 방·다른 종류는 그대로');
// 2) reviewDone_: 명단 시트를 읽으면 안 보낸 독촉 이름이 지금 체크대로 (방 사람 중 체크 안 된 사람만)
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000), at = (n, h) => new Date(day(n).getTime() + h * 3600000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-20), '명단 제목': '#택1.1 밴드 3 (뽀짝오리)', '카톡방': '#택1.1 밴드 3', '시트ID': 'S1', '진행 상태': '진행중', '인원': 3, '목표인원': 3, '총건수': 3, '마감 시각': at(-20, 1), '캠페인': '밴드' })]);
const list = new H.Sheet('명단', [['밴드'], ['타임스탬프', '수령인', '옵션', ''],
  [at(-20, 0.5), '가', '빨강', true], [at(-20, 0.6), '나', '빨강', false], [at(-20, 0.7), '다', '빨강', true]]);
Object.getPrototypeOf(list.getRange(1, 1)).getNotes = function () { return this.getValues().map(r => r.map(() => '')); };
const lss = { getName: () => '# 밴드 3', getSheetByName: n => n === '명단' ? list : null, getUrl: () => 'https://x/S1', getSheets: () => [list], getId: () => 'S1' };
G("(function () { const o = SpreadsheetApp.openById; SpreadsheetApp.openById = function (id) { return id === 'S1' ? globalThis.__LSS : o(id); }; })()"); env.__LSS = new Proxy(lss, { get: (t, k) => k in t ? t[k] : () => ({}) });
G('rvFolder_ = function () { return null; }; rvZip_ = function () {};');
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH, nag('b1', '#택1.1 밴드 3', '가, 나, 다', false), nag('b2', '#택1.1 밴드 3', '가, 나, 다', true)]);
let err = ''; try { G('reviewDone_(readRuns_())'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const r2 = rows().filter(r => r[2] === '리뷰 독촉');
ok(r2.length === 1 && r2[0][0] === 'b2' && /안 된 분: 나\n/.test(r2[0][4]), 'reviewDone_ 뒤 독촉 ' + JSON.stringify(r2) + ' / ' + env.__notes().filter(x => /독촉|실패/.test(x)).join(' | '));
// 3) 포토 요청: 캠페인(명단 시트)마다 한 번, 예전에 날짜마다 넣은 안 보낸 것은 한 줄로 합침
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-4), '명단 제목': '#택1.5 봉상회 감홍사과외 30 (뽀짝오리)', '시트ID': 'P1', '진행 상태': '진행중', '인원': 30, '포토': '유', '캠페인': '봉상회 감홍사과외' }),
  mk({ '진행일': day(-3), '명단 제목': '#택1.6 봉상회 감홍사과외 30 (뽀짝오리)', '시트ID': 'P1', '진행 상태': '진행중', '인원': 30, '포토': '유', '캠페인': '봉상회 감홍사과외' }),
  mk({ '진행일': day(-3), '명단 제목': '#11.9 실 제르넬 지압양말 10 (뽀짝오리)', '시트ID': 'P2', '진행 상태': '진행중', '인원': 10, '포토': '유', '캠페인': '제르넬 지압양말' })]);
const ask = t => [t.id, new Date(), '할 일', '사장님', '[' + t.t + '] 진행 2일 지났는데 업체 포토를 아직 못 받았어요. 업체에 포토 요청 부탁드립니다!', t.st || '대기'];
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [OBH, ask({ id: 'p1', t: '#택1.5 봉상회 감홍사과외 30' }), ask({ id: 'p2', t: '#택1.6 봉상회 감홍사과외 30' })]);
env.__props.set('PHOTOASK_#택1.5봉상회감홍사과외30(뽀짝오리)', '1'); env.__props.set('PHOTOASK_#택1.6봉상회감홍사과외30(뽀짝오리)', '1');
try { G('photoAskCheck_(readRuns_())'); } catch (e) { fails.push('포토 요청 오류 ' + (e.stack || e)); }
const r3 = rows().filter(r => /업체 포토/.test(r[4]));
const bong = r3.filter(r => /봉상회/.test(r[4])), jer = r3.filter(r => /제르넬/.test(r[4]));
ok(bong.length === 1 && bong[0][4] === '[#택 봉상회 감홍사과외] 진행 2일 지났는데 업체 포토를 아직 못 받았어요 (1.5·1.6 진행). 업체에 포토 요청 부탁드립니다!', '봉상회 한 줄로 합침 ' + JSON.stringify(bong.map(r => r[4])));
ok(jer.length === 1 && jer[0][4].indexOf('[# 실 제르넬 지압양말] 진행 2일 지났는데') === 0, '새 캠페인 한 번 ' + JSON.stringify(jer.map(r => r[4])));
try { G('photoAskCheck_(readRuns_())'); } catch (e) {}
ok(rows().filter(r => /업체 포토/.test(r[4])).length === 2, '두 번 넣음 ' + rows().length);
console.log(fails.length ? 'XX 독촉·포토 요청 시험 실패:\n- ' + fails.join('\n- ') : '✓ 리뷰 독촉 방마다 한 줄·이름 지금대로, 포토 요청 캠페인마다 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
