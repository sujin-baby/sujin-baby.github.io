// 11/16 사용자 승인 3건: 진행 도우미 '오늘 할 것' · 폼수정 B1 지난 진행 → 오늘 진행 · 새벽 점검 월급시트 비슷한 줄  node today_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(0), '명단 제목': '#11.16 실 밴드 4 (뽀짝오리)', '카톡방': '#11.16 실 밴드 4', '시트ID': 'S1', '진행 상태': '진행중', '시트 링크': 'https://docs.google.com/spreadsheets/d/S1/edit' }),
  mk({ '진행일': day(1), '명단 제목': '#11.17 실 밴드 4 (뽀짝오리)', '카톡방': '#11.17 실 밴드 4', '시트ID': 'S1', '진행 상태': '진행예정' }),
  mk({ '진행일': day(-5), '명단 제목': '#11.11 귤 5 (뽀짝오리)', '카톡방': '#11.11 귤 5', '시트ID': 'S2', '진행 상태': '진행중' })]);
env.__props.set('RVIMG_S1', 'IMGF1');
env.__ss.sheets['보낼메시지'] = new H.Sheet('보낼메시지', [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크'],
  ['a1', day(0), '방 공지', '#11.16 실 밴드 4', '공지 글', '대기'],
  ['a2', day(1), '방 공지', '#11.17 실 밴드 4', '내일 공지', '대기'],
  ['a3', day(-1), '리뷰 독촉', '#11.16 실 밴드 4', '⏰ 기한\n아직 리뷰 확인이 안 된 분: 김철수, 이영희\n부탁', '대기'],
  ['a4', day(0), '할 일', '내 할 일', '[결제금액 확인] #11.16 실 밴드 4\n김: 1원', '대기'],
  ['a5', day(0), '페이백 요청', '오리명단방(뽀짝)', '[전원 리뷰완료] #11.16 실 밴드 4 페이백 요청드립니다!\n명단시트: https://x', '대기'],
  ['a6', day(0), '리뷰비 요청', '리뷰비시트', '11/16\t#11.16 실 밴드 4\t4건\thttps://x', '대기'],
  ['a7', day(0), '방 공지', '#11.16 실 밴드 4', '보낸 것', '보냄'],
  ['a8', '포토전달대기', '포토 가이드', '#11.16 실 밴드 4', '사진 오면', '대기']]);
G("thumbOfRoom_ = function () { return ''; }; roomLinksAll_ = function () { return {}; };");
// 1) 오늘 할 것
let o = null, err = ''; try { o = G('todayItems_()'); } catch (e) { err = String(e.stack || e); }
ok(!err, '오류 ' + err);
const ids = (o && o.items || []).map(x => x.id);
ok(JSON.stringify(ids.slice().sort()) === JSON.stringify(['a1', 'a3', 'a4', 'a5', 'a6']), '오늘·지난 것만 (내일·보낸 것·사진 대기 빼고) ' + JSON.stringify(ids));
ok(o && o.later === 1, '내일 이후 개수 ' + (o && o.later));
const gi = k => G("MSGV_GROUPS.map(function (g) { return g.key; }).indexOf('" + k + "')");
ok(o.items.every((x, i, a) => !i || a[i - 1].g <= x.g) && o.items[0].id === 'a1', '탭 순서대로 ' + JSON.stringify(o.items.map(x => x.g)));
const by = id => o.items.find(x => x.id === id);
ok(by('a3').copy === '김철수, 이영희' && by('a3').over === true, '독촉은 이름만·지난 날짜 표시 ' + JSON.stringify(by('a3')));
ok(by('a5').copy === '[전원 리뷰완료] #11.16 실 밴드 4 페이백 요청드립니다!\n\n명단시트: https://x', '페이백 한 줄 띄움');
ok(by('a6').copy === '' && /밴드/.test(by('a6').msg), '리뷰비 요청은 탭에서 복사 ' + JSON.stringify(by('a6')));
ok(by('a4').todo === true, '할 일 표시');
// 11/19: 할 일 서브 탭 목록 (전체 + 메시지 탭 이름 그대로, 취왖은 리뷰비로 합쳐져 빠짐)
const gp = (o && o.groups) || [];
ok(gp.map(g => g.label).join('|') === '방공지|명단·가이드|할일|취합|독촉|리뷰비', '서브 탭 이름·순서 ' + JSON.stringify(gp.map(g => g.label)));
ok(gp.length === G('MSGV_GROUPS.filter(function(x){return !x.merged;}).length') && gp.every(g => typeof g.i === 'number' && g.i >= 0 && g.i < G('MSGV_GROUPS.length')), '서브 탭 인덱스 ' + JSON.stringify(gp.map(g => g.i)));
ok(gp.every(g => G('MSGV_GROUPS[' + g.i + '].key') !== 'done'), '취완 탭은 서브 탭에 없음');
ok(o.items.every(x => gp.some(g => g.i === x.g)), '모든 항목의 g가 서브 탭 중 하나 ' + JSON.stringify(o.items.map(x => x.g)));
ok(gp.filter(g => g.i === by('a3').g)[0].label === '독촉' && gp.filter(g => g.i === by('a4').g)[0].label === '할일' && gp.filter(g => g.i === by('a6').g)[0].label === '리뷰비' && gp.filter(g => g.i === by('a1').g)[0].label === '방공지', '항목 → 서브 탭 이름');
ok(by('a1').list === 'https://docs.google.com/spreadsheets/d/S1/edit' && by('a1').rvimg === 'https://drive.google.com/drive/folders/IMGF1', '명단·리뷰이미지 링크 ' + JSON.stringify([by('a1').list, by('a1').rvimg]));
ok(by('a6').rvimg === 'https://drive.google.com/drive/folders/IMGF1', '리뷰비 줄도 리뷰이미지 ' + by('a6').rvimg);
// 페이지에서 보냄 → 탭에서 체크한 것과 같게 (체크 시각)
G('markMsgSide_')('a5', '보냄');
ok(env.__ss.sheets['보낼메시지'].rows.find(r => r[0] === 'a5')[5] === '보냄' && env.__props.get('MSGV_S_a5'), '페이지 보냄 → 보냄·체크 시각');
// 2) 폼수정 B1: 지난 진행이 남아 있으면 오늘 진행으로
const ed = new H.Sheet('폼수정', [['진행 선택 →', '#11.11 귤 5 (뽀짝오리)', '', '삭제 실행 →', false], ['공지용 명단', '', '', 'x', ''], ['삭제'], [false, 'a']]);
env.__ss.sheets['폼수정'] = ed;
G("loadEditTab_ = function (sh, m) { globalThis.__LOAD = m; }; ensureDupControl_ = function () {};");
G('ensureEditTab_()');
ok(ed.rows[0][1] === '#11.16 실 밴드 4 (뽀짝오리)' && /오늘 진행으로/.test(G('__LOAD')), 'B1 → 오늘 진행 ' + ed.rows[0][1] + ' ' + G('typeof __LOAD === "string" ? __LOAD : ""'));
// 삭제 체크 중이면 안 바꿈
ed.rows[0][1] = '#11.11 귤 5 (뽀짝오리)'; ed.rows[3][0] = true;
G('ensureEditTab_()');
ok(ed.rows[0][1] === '#11.11 귤 5 (뽀짝오리)', '체크 중이면 그대로 ' + ed.rows[0][1]);
// 지금 목록에 있는 진행이면 그대로
ed.rows[3][0] = false; ed.rows[0][1] = '#11.17 실 밴드 4 (뽀짝오리)';
G('ensureEditTab_()');
ok(ed.rows[0][1] === '#11.17 실 밴드 4 (뽀짝오리)', '목록에 있는 진행은 그대로');
// (11/19 피클) C1 날짜가 B1 진행 날짜와 어긋나면 B1 날짜로 맞춤 (C1 '오늘'인데 B1은 다른 날 진행이던 것)
ok(ed.rows[0][2] === G('editDateLabel_')(day(1)), 'C1 = B1 진행 날짜 ' + ed.rows[0][2]);
// 날짜가 넘어가 C1 보기가 없어져도 B1 진행 날짜로 (오늘로 안 바꿈)
ed.rows[0][2] = '11.1(토) 오늘';
G('ensureEditTab_()');
ok(ed.rows[0][2] === G('editDateLabel_')(day(1)) && ed.rows[0][1] === '#11.17 실 밴드 4 (뽀짝오리)', '없는 C1 → B1 날짜 ' + ed.rows[0][2]);
// 사용자가 C1을 고르면 C1이 먼저 (B1이 그날 첫 진행으로)
ed.rows[0][2] = G('editDateLabel_')(day(0));
G('editDatePick_')(ed, { source: { toast: function () {} } });
ok(ed.rows[0][2] === G('editDateLabel_')(day(0)) && ed.rows[0][1] === '#11.16 실 밴드 4 (뽀짝오리)', '고른 C1 그대로·B1 그날 진행 ' + ed.rows[0][1] + ' ' + ed.rows[0][2]);
// 3) 새벽 점검: 월급시트 같은 날·같은 스토어 비슷한 줄
const pay = new H.Sheet('11월', [['캠페인명', '스토어'], ['#택11.5 차량용 거치대 3', '더호컴퍼니'], ['#택11.5 더호 차량용 거치대 3', '더호컴퍼니'], ['#11.5 실 샤워기거치대 5', '유앤아이푸드'], ['#택11.6 더호 차량용 거치대 3', '더호컴퍼니'], ['#11.5 실 거치대 2', '다른가게']]);
env.__PAY = pay;
G("payTabsNow_ = function () { return [globalThis.__PAY]; }; payLayout_ = function () { return { head: 1, name: 1, store: 2, days: {} }; };");
const dup = G('paySimilarDups_()');
ok(dup.length === 1 && /2행 #택11\.5 차량용 거치대 3 \/ 3행 #택11\.5 더호 차량용 거치대 3/.test(dup[0]) && !/샤워기|다른가게|11\.6/.test(dup[0]), '비슷한 줄 ' + JSON.stringify(dup));
pay.rows.splice(1, 1);
ok(G('paySimilarDups_()').length === 0, '중복 없으면 알림 없음');
// (11/19) 서로 다른 의뢰서 진행(명단 시트가 다름)이면 이름이 비슷해도 안 알림 (레깅스 30·50 오알림)
pay.rows.push(['#11.18 실 탄탄 레깅스 30', '탄탄'], ['#11.18 실 탄탄 레깅스 50', '탄탄']);
const LHx = G('LIST_HEADER'), mkx = o => LHx.map(h => o[h] !== undefined ? o[h] : '');
env.__ss.sheets['진행목록'].rows.push(mkx({ '진행일': day(0), '명단 제목': '#11.18 실 탄탄 레깅스 30 (뽀짝오리)', '시트ID': 'LA', '진행 상태': '진행중' }), mkx({ '진행일': day(0), '명단 제목': '#11.18 실 탄탄 레깅스 50 (뽀짝오리)', '시트ID': 'LB', '진행 상태': '진행중' }));
ok(!G('paySimilarDups_()').some(x => /레깅스/.test(x)), '다른 의뢰서 진행은 안 알림 ' + JSON.stringify(G('paySimilarDups_()')));
console.log(fails.length ? 'XX 오늘 할 것·폼수정 B1·월급시트 비슷한 줄 시험 실패:\n- ' + fails.join('\n- ') : '✓ 오늘 할 것·폼수정 B1·월급시트 비슷한 줄 시험 통과');
process.exit(fails.length ? 1 : 0);
