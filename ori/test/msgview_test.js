// 메시지 종류별 탭 (11/7): 보낼메시지 전부(2행부터)를 종류마다 탭 하나로, 체크 → 보낼메시지 '보냄', 다시 그린 직후 밀린 줄 체크는 되돌림  node msgview_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);   // 실제 시트처럼 예전 한 번 정리는 끝난 상태
let idc = 100; H.Sheet.prototype.getSheetId = function () { return this.__id || (this.__id = ++idc); };   // 실제처럼 탭마다 다른 번호
const t0 = new Date(); t0.setHours(0, 0, 0, 0);
const day = n => new Date(t0.getTime() + n * 86400000);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['m1', day(0), '방 공지', '#택11.9 거치대 3', '★★★자정 구매★★★\n거치대 공지', '대기'],
  ['m2', day(1), '방 공지', '#택11.10 사과 5', '사과 공지', '대기'],
  ['m3', day(0), '방 공지', '#택11.6 귤 7', '오늘 보낸 공지', '보냄'],
  ['m3b', day(-1), '방 공지', '#택11.5 귤 7', '어제 날짜 보낸 공지', '보냄'],
  ['m4', day(-5), '방 공지', '#택11.2 감 5', '오래전 보낸 공지', '보냄'],
  ['m5', '포토전달대기', '포토 가이드', '#택11.5 감홍사과외 30', '포토 가이드 글', '대기'],
  ['m6', day(-1), '할 일', '사장님', '[결제금액 확인] 사장님께', '대기'],
  ['m7', day(-9), '페이백 요청', '오리명단방(뽀짝)', '페이백 요청 글', '대기'],
  ['m8', day(0), '새 종류', '어딘가', '처음 보는 종류 글', '대기'],
  ['m9', day(0), '방 공지', '#택11.9 취소된 방', '취소된 공지', '취소'],
  ['m10', day(0), '명단 전달', '오리명단방', '명단 전달 글', '대기'],
  ['m11', day(-2), '리뷰 보고', '사장님', '리뷰 취합 링크', '대기'],
  ['m12', day(-1), '리뷰 보고', '사장님', 'https://drive.google.com/drive/folders/FOLDER12345abc\n#10.27 실링팬 총 4건 리뷰 취합본 전달드립니다!', '대기'],
];
// 같은 방 결제금액 확인 3명 → 할일에서 한 줄 (11/8)
['김', '이', '박'].forEach((nm, i) => ob.push(['p' + i, day(-1), '할 일', '내 할 일', '[결제금액 확인] #택11.6 봉상회 감홍사과외 30\n' + nm + ': 15,900원 결제 (공지 14,500원, 더 비싸게 삼)\n→ 결제 캡처를 보고, 다르면 그분께 따로 물어보기', '대기']));
for (let i = 0; i < 30; i++) ob.push(['n' + i, day(-2), '할 일', '내 할 일', '할 일 ' + i, '대기']);   // 27행 넘게 (피클 수식 판은 27행부터만 읽었음)
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', ob);
const LH = G('LIST_HEADER'), mkr = o => LH.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mkr({ '진행일': day(-12), '명단 제목': '#10.27 실링팬 2 (뽀짝오리)', '시트ID': 'S9', '진행 상태': '진행중', '인원': 2 }),
  mkr({ '진행일': day(-11), '명단 제목': '#10.28 실링팬 2 (뽀짝오리)', '시트ID': 'S9', '진행 상태': '진행중', '인원': 2 })]);
env.__props.set('RVIMG_S9', 'FOLDER12345abc');
env.__ss.sheets['메시지 모아보기'] = new H.Sheet('메시지 모아보기', [['예전 탭', '', '', ''], ['x']]);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
let err = '';
try { G('msgViewBuild_(false)'); } catch (e) { err = String(e.stack || e); }
ok(!err, '그리기 오류 ' + err);
const BASES = G('MSGV_GROUPS.map(function (g) { return g.base; })');
const tab = base => Object.values(env.__ss.sheets).find(s => G('msgvGroupOfName_(' + JSON.stringify(s.name) + ')') === BASES.indexOf(base));
const T = {}; BASES.forEach(b => { T[b] = tab(b); ok(!!T[b], b + ' 탭이 없음'); });
if (fails.length) { console.log('XX ' + fails.join('\n')); process.exit(1); }
const ids = sh => sh.rows.map(r => String(r[0] || ''));
const where = id => { for (const b of BASES) { const i = ids(T[b]).indexOf(id); if (i >= 0) return [b, i + 1]; } return [null, 0]; };
const rowOf = id => where(id)[1];
const cellOf = (id, c) => { const [b, r] = where(id); return T[b].rows[r - 1][c]; };
const outSt = id => env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === id)[5];
// 종류마다 맞는 탭에
const expect = { m1: '🐥방공지', m2: '🐥방공지', m3: '🐥방공지', m5: '📸포토가이드', m6: '📝할일', m7: '💰리뷰비', m8: '📝할일', m10: '📋명단전달', m11: '📦리뷰취합', n0: '📝할일', n29: '📝할일' };
Object.keys(expect).forEach(id => ok(where(id)[0] === expect[id], id + ' → ' + where(id)[0] + ' (기대 ' + expect[id] + ')'));
['m3b', 'm4', 'm9'].forEach(id => ok(rowOf(id) === 0, id + ' 보이면 안 됨'));
ok(T['🐥방공지'].name === '🐥방공지 2', '탭 이름 개수 ' + T['🐥방공지'].name);
ok(T['✅취완'].name === '✅취완' && /보낼 것 없어요/.test(T['✅취완'].rows[2][3]), '빈 탭');
ok(T['📝할일'].name === '📝할일 33', '할일 탭 이름 ' + T['📝할일'].name);
const pr = ids(T['📝할일']).indexOf('p0,p1,p2') + 1;
ok(pr > 0, '결제금액 확인 3개가 한 줄이 아님: ' + ids(T['📝할일']).filter(x => /^p/.test(x)).join(' / '));
const pm = pr ? T['📝할일'].rows[pr - 1][4] : '';
ok(pm === '[결제금액 확인] #택11.6 봉상회 감홍사과외 30\n김: 15,900원 결제 (공지 14,500원, 더 비싸게 삼)\n이: 15,900원 결제 (공지 14,500원, 더 비싸게 삼)\n박: 15,900원 결제 (공지 14,500원, 더 비싸게 삼)\n→ 결제 캡처를 보고, 다르면 그분께 따로 물어보기', '묶은 글: ' + JSON.stringify(pm));
ok(pr && / · 3건/.test(T['📝할일'].rows[pr - 1][3]), '건수 표시 ' + (pr && T['📝할일'].rows[pr - 1][3]));
ok(rowOf('m1') < rowOf('m2') && rowOf('m2') < rowOf('m3'), '방 공지 순서 (오늘 → 내일 → 보낸 것)');
ok(cellOf('m3', 1) === true && cellOf('m1', 1) === false, '체크 값');
ok(String(cellOf('m5', 2)) === '사진 오면', '포토 날짜 ' + cellOf('m5', 2));
ok(/〔페이백〕/.test(cellOf('m7', 3)), '페이백 표시 ' + cellOf('m7', 3));
ok(/〔새 종류〕/.test(cellOf('m8', 3)), '모르는 종류 표시 ' + cellOf('m8', 3));
ok(cellOf('m1', 4) === '★★★자정 구매★★★\n거치대 공지', '메시지 전체 글');
ok(/안 보낸 것 2개/.test(T['🐥방공지'].rows[0][1]), '제목 ' + T['🐥방공지'].rows[0][1]);
ok(env.__props.get('MSGV_HIDE1') === '1', '보낼메시지 숨김 표시');
// 바뀐 게 없으면 다시 안 그림
ok(G('msgViewBuild_(false)') === false, '바뀐 게 없는데 다시 그림');
// 체크 → 보냄 (그린 지 20초 지난 뒤)
BASES.forEach((b, i) => env.__props.set('MSGV_AT_' + G('MSGV_GROUPS[' + i + '].key'), String(Date.now() - 60000)));
const edit = (sh, row, v, col) => { col = col || 2; sh.cell(row, col)[col - 1] = v; G('onAdminEdit')({ range: sh.getRange(row, col), source: { toast() {} }, value: String(v) }); };
const N = T['🐥방공지'];
let r1 = rowOf('m1');
edit(N, r1, true);
ok(outSt('m1') === '보냄', '체크했는데 보냄 아님: ' + outSt('m1'));
ok(rowOf('m1') === r1, '체크 직후 줄이 움직이면 안 됨');
edit(N, r1, false);
ok(outSt('m1') === '대기', '체크 풀었는데 대기 아님');
// 지난 날짜(어제) 할 일을 오늘 체크 → 다시 그려도 오늘 안에는 회색으로 남음
edit(T['📝할일'], rowOf('m6'), true);
ok(outSt('m6') === '보냄', '할 일 체크 저장');
G('msgViewBuild_(false)');
ok(rowOf('m6') > 0 && cellOf('m6', 1) === true, '오늘 체크한 지난 할 일이 사라짐');
// 묶은 줄 체크 → 3개 다 보냄
env.__props.set('MSGV_AT_todo', String(Date.now() - 60000));
edit(T['📝할일'], ids(T['📝할일']).indexOf('p0,p1,p2') + 1, true);
ok(['p0', 'p1', 'p2'].every(id => outSt(id) === '보냄'), '묶은 줄 체크가 다 안 됨: ' + ['p0', 'p1', 'p2'].map(outSt).join(','));
// 다시 그린 직후(20초 안) 다른 메시지가 들어온 줄을 누르면 되돌림
env.__ss.sheets['보낼메시지'].rows.splice(1, 0, ['m0', day(0), '방 공지', '#택11.9 새 방 5', '새 공지', '대기']);
G('msgViewBuild_(false)');
ok(rowOf('m0') > 0 && rowOf('m0') <= r1, '새 메시지 위에 들어옴');
ok(N.name === '🐥방공지 2' || G('msgvGroupOfName_("🐥방공지 3")') === 0, '이름 규칙');
const victim = ids(N)[r1 - 1];
ok(victim !== 'm1', '시험 준비 (줄이 안 밀림)');
edit(N, r1, true);
ok(outSt(victim) === '대기', '밀린 줄 체크가 저장됨 (' + victim + ')');
ok(N.rows[r1 - 1][1] === false, '밀린 줄 체크 안 되돌림');
// 다른 탭(할일)은 방 공지가 바뀌어도 다시 안 그림 → 그 탭 체크는 안 막힘
env.__props.set('MSGV_AT_todo', String(Date.now() - 60000));
const rn = rowOf('n3'); edit(T['📝할일'], rn, true);
ok(outSt('n3') === '보냄', '다른 탭 체크가 막힘');
// 리뷰취합 탭에서 리뷰 보고 보냄 체크 → 진행목록 업체 전송 = 오늘 (그 의뢰 줄 전부), 풀면 지움 (11/8)
env.__props.set('MSGV_AT_report', String(Date.now() - 60000));
const sentCol = () => env.__ss.sheets['진행목록'].rows.slice(1).map(r => r[LH.indexOf('업체 전송')]);
edit(T['📦리뷰취합'], rowOf('m12'), true);
ok(outSt('m12') === '보냄' && sentCol().every(v => v instanceof Date && v.getTime() === t0.getTime()), '업체 전송 날짜 안 들어감: ' + JSON.stringify(sentCol()));
edit(T['📦리뷰취합'], rowOf('m12'), false);
ok(sentCol().every(v => v === ''), '체크 풀었는데 업체 전송이 남음: ' + JSON.stringify(sentCol()));
// 다른 칸을 고치면 원래대로
env.__props.set('MSGV_AT_notice', String(Date.now() - 60000));
const rr = rowOf('m2'); N.cell(rr, 5)[4] = '아무 글';
G('onAdminEdit')({ range: N.getRange(rr, 5), source: { toast() {} }, value: '아무 글' });
ok(cellOf('m2', 4) === '사과 공지', '보기 칸 고친 걸 안 되돌림');
// 다른 탭을 고친 실행이 끝나면 새 메시지가 들어옴 (감싼 onAdminEdit)
env.__ss.sheets['블랙리스트'] = new H.Sheet('블랙리스트', [['이름'], ['가']]);
env.__ss.sheets['보낼메시지'].rows.splice(1, 0, ['mz', day(0), '취완', '실 밴드 (전체 3개 방)', '취완 글', '대기']);
G('onAdminEdit')({ range: env.__ss.sheets['블랙리스트'].getRange(2, 1), source: { toast() {} }, value: '가' });
ok(where('mz')[0] === '✅취완', '다른 탭 고친 뒤 새 메시지 안 들어옴');
// 탭 이름에 없는 사용자 탭은 종류 탭으로 안 봄
ok(G('msgvGroupOfName_("🐥방공지 메모")') === -1 && G('msgvGroupOfName_("한눈에")') === -1, '탭 이름 구분');
console.log(fails.length ? 'XX 메시지 종류별 탭 시험 실패:\n- ' + fails.join('\n- ') : '✓ 메시지 종류별 탭 시험 통과 (탭 ' + BASES.length + '개)');
process.exit(fails.length ? 1 : 0);
