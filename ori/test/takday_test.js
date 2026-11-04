// 11/3: 방제 앞 '택' ↔ 택대 맞추기(takTitle_), 날짜별 페이백·리뷰비 요청 방 이름.  node takday_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
let fail = 0; const ok = (c, t) => { if (!c) fail++; console.log((c ? '✓ ' : '✗ ') + t); };
ok(G("takTitle_('#택11.04 과일쏙못난이사과외 10')") === true, '#택11.04 … → 택대');
ok(G("takTitle_('업택11.04 양말 5')") === true, '업택11.04 … → 택대');
ok(G("takTitle_('#11.04 엔라지맨 밀크텐정 5')") === false, '#11.04 엔라지맨 밀크텐정 5 → 택대 아님');
ok(G("takTitle_('#10.28 실 효자손외 6')") === false, '#10.28 실 효자손외 6 → 택대 아님');
ok(G("takTitle_('#택11.04 과일쏙 10 (뽀짝오리)')") === true, '닉네임 붙은 명단 제목도');
ok(G("PAYBACK_ROOM") === '오리명단방(뽀짝)' && G("REVFEE_ROOM") === '리뷰비시트', '페이백 → 오리명단방(뽀짝), 리뷰비 → 리뷰비시트');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/'\[전원 리뷰완료\] ' \+ title \+ ' 페이백 요청드립니다!\\n명단시트: ' \+ url/.test(src), "페이백 문구: '[전원 리뷰완료] 방제 페이백 요청드립니다!' + 명단시트");
ok(!/queueMsg_\('내 할 일', rvUploadMsg_\(/.test(src), "'리뷰 다 끝남 → 서랍에서 저장' 할 일 안 넣음");
if (fail) { console.error(fail + '개 실패'); process.exit(1); }
console.log('✓ 택대·날짜별 요청 시험 통과');
