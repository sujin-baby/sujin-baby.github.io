// (11/26) 포토대기 + 텍스트 섞인 날: 가이드 제목 밑에 ⭐️포토대기⭐️, 따로 공지 안 만듦  node pwmerge_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const res = G('reviewGuideMsg_({ kind: "mix", mix: "포토대기 1, 텍스트리뷰 1", guide: "1. 검색 키워드" }, [{ nm: "홍길동", n: 1 }, { nm: "김철수", n: 1 }], [2], 0)');
ok(res.photoWait === true && !res.pwMsg && /^🐥리뷰내용 가이드🐥/.test(res.msg), '섞인 날은 가이드 하나 + photoWait ' + JSON.stringify([res.photoWait, res.pwMsg, String(res.msg).slice(0, 40)]));
env.__m = res.msg;
const m2 = G('guideWithPw_(__m)');
ok(/^🐥리뷰내용 가이드🐥\n⭐️포토대기⭐️\n/.test(m2), '제목 바로 밑에 포토대기 ' + m2.slice(0, 60));
env.__m2 = m2; ok(G('guideWithPw_(__m2)') === m2, '두 번 안 넣음');
ok(/포토리뷰\(1명\) : (홍길동|김철수)/.test(m2) && /텍스트리뷰\(1명\)/.test(m2), '포토·텍스트 줄 그대로');
// 리뷰 개수 세기(rvGuideCounts_)가 첫 줄로 가이드를 알아봄
ok(/^\S{0,4}리뷰내용 가이드/.test(m2), '개수 세기 첫 줄 모양 그대로');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/if \(res\.photoWait && !res\.pwMsg && res\.msg && !photoAll\) res\.msg = guideWithPw_\(res\.msg\);\n\s*else if \(res\.photoWait\) \{ queueMsg_\(room, '⭐️포토대기⭐️', '방 공지'\);/.test(src), '섞인 날은 따로 포토대기 공지 안 넣음');
console.log(fails.length ? 'XX 포토대기 합치기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 포토대기를 가이드 안에 시험 통과');
process.exit(fails.length ? 1 : 0);
