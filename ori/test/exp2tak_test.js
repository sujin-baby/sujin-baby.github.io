// (11/16) 날짜 뒤 택 방제 = 택대 / 택대인데 택 없으면 붙임 / 업체입금 계좌 / 기대평 2차 135건 묶음  node exp2tak_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const J = x => JSON.stringify(x);
ok(G('takTitle_(' + J('#11.16택 실/빈 김상사 케이블타이5') + ')') === true, '날짜 뒤 택 = 택대');
ok(G('takTitle_(' + J('#택11.04 옥광밤외12') + ')') === true && G('takTitle_(' + J('업)택11.12 지니네 메주 30') + ')') === true, '앞 택');
ok(G('takTitle_(' + J('#11.16 택배박스 3') + ')') === false && G('takTitle_(' + J('#11.04 엔라지맨 5') + ')') === false, '택 아님');
ok(G('campKey_(' + J('#11.16택 실/빈 김상사 케이블타이5') + ')') === '김상사케이블타이', '캠페인 키 ' + G('campKey_(' + J('#11.16택 실/빈 김상사 케이블타이5') + ')'));
ok(G('withSil_(' + J('#11.16택 실/빈 김상사 케이블타이5') + ')') === '#11.16택 실/빈 김상사 케이블타이5', '실 안 겹침');
ok(G('addTak_(' + J('#11.17 실 문풍지 4') + ')') === '#택11.17 실 문풍지 4' && G('addTak_(' + J('업)11.12 메주 30') + ')') === '업)택11.12 메주 30', '택 붙이기 ' + G('addTak_(' + J('#11.17 실 문풍지 4') + ')'));
// 생성기 v186이 보내는 날짜 없는 명단 시트 이름
ok(G('addTak_(' + J('# 실 문풍지외') + ')') === '#택 실 문풍지외' && G('withSil_(' + J('# 문풍지외') + ')') === '# 실 문풍지외' && G('withSil_(' + J('# 실 문풍지외') + ')') === '# 실 문풍지외', '날짜 없는 이름 택·실');
ok(G('isUpPay_("", ' + J('업)택 지니네농수산 메주') + ')') === true && G('isUpPay_("업체입금", "")') === true && G('isUpPay_("입대", "#택 메주")') === false, '업체입금');
// 기대평 2차
ok(G('expTotal_({ "진행일": new Date(2026, 10, 17) })') === 135 && G('expTotal_({ "진행일": new Date(2026, 10, 6) })') === 405, '총건수');
const nt = G('expNotice2_()');
ok((nt.match(/https:\/\//g) || []).length === 9 && /9,000원/.test(nt) && /최고/.test(nt) && /3단계/.test(nt) && /\(구글폼 링크\)/.test(nt), '공지');
ok(G('expTitle2_("2026-11-17")') === '11.17 백발백중 도서 기대평 27', '방제 ' + G('expTitle2_("2026-11-17")'));
// 같은 명단 시트라도 다 끝난 의뢰 뒤 새 1일차는 새 묶음
const mk = (d, k, req, st, n) => ({ '진행일': new Date(2026, d[0], d[1]), '시트ID': 'S1', '캠페인': '백발백중 도서 기대평', '명단 제목': '백발백중 도서 기대평', '일차': k, '요청ID': req, '총건수': k === 1 ? (req === 'exp2-1' ? 15 : 6) : '', '진행 상태': st, '인원': n, '목표인원': 3, row: d[1] });
env.__R = [mk([9, 26], 1, 'exp-100-4', '종료', 3), mk([10, 6], 2, 'exp-100-4-v5-2', '진행중', 3), mk([10, 17], 1, 'exp2-1', '진행예정', 0)];
const ch = G('chainsOf_(__R)');
ok(ch.length === 2 && ch[1].runs.length === 1 && ch[1].total === 15, '새 묶음 ' + J(ch.map(c => [c.total, c.done, c.runs.length])));
// (11/17) 생성기에서 직접 적은 리뷰 가이드(manual)는 글 그대로 리뷰 가이드 메시지에
{
  const rvM = { kind: 'text', mix: '텍스트리뷰 2', guide: '향이 은은한 점 언급해 주세요 / 참고: 사진 1장 꼭 넣어 주세요', manual: 1 };
  env.__RVM = rvM;
  let m = ''; try { m = G('reviewGuideMsg_(__RVM, [{ nm: "가", n: 1 }, { nm: "나", n: 1 }], [2], 0)'); } catch (e) { m = 'ERR ' + e; }
  const msg = typeof m === 'string' ? m : (m && m.msg) || JSON.stringify(m);
  ok(/향이 은은한 점 언급해 주세요/.test(msg) && /참고: 사진 1장 꼭 넣어 주세요/.test(msg) && !/하단 내용 참고하셔서/.test(msg), '직접 가이드 그대로 ' + msg.slice(0, 300));
}
// (11/17) 방 공지 중 리뷰내용 가이드는 ⭐리뷰가이드 탭, 구매 공지는 🐥방공지 탭
{
  const gi = x => G('MSGV_GROUPS[msgvGi_(' + J(x) + ', (function(){var k={};MSGV_GROUPS.forEach(function(g,i){g.k.forEach(function(q){k[q]=i;});});return k;})(), 0)].base');
  ok(gi(['a', '', '방 공지', '#11.17 귤 5', '🐥리뷰내용 가이드🐥\n\n텍스트리뷰(5명) : 가']) === '⭐리뷰가이드', '리뷰 가이드 탭');
  ok(gi(['b', '', '방 공지', '#11.17 귤 5', '★★★자정 ~ 오전 7시까지 구매★★★\n공지']) === '🐥방공지', '구매 공지 탭');
}
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 택 방제·업체입금·기대평 2차 시험 통과');
