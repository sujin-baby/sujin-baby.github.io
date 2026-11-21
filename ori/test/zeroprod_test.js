// 그날 0명인 상품은 공지 블록·폼 옵션에서 뺌 (11/10 오늘과일 설향딸기외 쿠팡 취소)  node zeroprod_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const SEP = '————————————————————————';
const blk = (n, who, kw) => [n + ') ' + who, '🐥판매처 : 오늘과일', '🐥★키워드 : ' + kw, '🐥옵션 : 1박스', '🐥가격 : 1,000', '🐥리뷰 : 포토대기'].join('\n');
const tpl = ['★★★바로구매★★★', '가격이 높으면 사지 마세요!', '☆★☆★ 양식 작성 폼 ☆★☆★', '(구글폼 링크)', '', blk(1, '10명쿠팡 - 10명 :', '설향딸기'), '', SEP, '', blk(2, '10명쿠팡 - 10명 :', '황금향'), '', SEP, '', blk(3, '5명토스 - 5명 :', '콜라비'), '', SEP, '', blk(4, '5명토스 - 5명 :', '설향딸기')].join('\n');
env.__T = tpl;
const out = G("adjustNotice_(__T, [[0], [0], [5], [5]], '★★★자정 ~ 오전 7시까지 구매★★★')");
ok(out.indexOf('쿠팡') < 0 && /^1\) 5명토스/m.test(out) && /^2\) 5명토스/m.test(out) && !/^3\)/m.test(out), '쿠팡 빼고 번호 1·2 ' + out);
ok(out.split('\n')[0] === '★★★자정 ~ 오전 7시까지 구매★★★' && out.indexOf('(구글폼 링크)') > 0 && out.indexOf('가격이 높으면') > 0, '머리 글 남음');
ok(out.split('\n').filter(l => /^—{10,}$/.test(l.trim())).length === 1 && !/—{10,}\s*$/.test(out), '구분선 하나, 끝에 없음');
const all = G("adjustNotice_(__T, [[10], [10], [5], [5]], 'S')");
ok(/^1\) 10명쿠팡/m.test(all) && /^4\) 5명토스/m.test(all) && all.split('\n').filter(l => /^—{10,}$/.test(l.trim())).length === 3, '0명 없으면 그대로 ' + all.slice(0, 200));
const last0 = G("adjustNotice_(__T, [[10], [10], [5], [0]], 'S')");
ok(/^3\) 5명토스/m.test(last0) && !/^4\)/m.test(last0) && !/—{10,}\s*$/.test(last0), '마지막 상품 0명 ' + last0.slice(-120));
ok(G("planDayOpts_('설향 350g(특품)\\n황금향 3kg\\n콜라비 1박스\\n설향 350g', [[0],[0],[5],[5]])") === '콜라비 1박스\n설향 350g', '폼 옵션 0명 상품 빼기');
ok(G("planDayOpts_('a\\nb', [[0],[5],[5]])") === 'a\nb' && G("planDayOpts_('a\\nb', [[0],[0]])") === 'a\nb', '옵션 수가 다르거나 다 0이면 그대로');
// 하루 인원이 옵션 하나와 같은 경우(라벤더 3 · 브라운 3, 하루 3건): 다음 일차 공지 옵션 줄이 그날 옵션 이름으로 바뀜 (#85, 11/19)
const tpl85 = ['★★★자정 ~ 오전 8시 20분 구매★★★', '☆★☆★ 양식 작성 폼 ☆★☆★', '(구글폼 링크)', '', ['1) 네이버 (3명):', '🐥상품명 : 디어누베 아기풋워머', '🐥옵션 : 라벤더 (3명)', '🐥가격 : 13,900'].join('\n')].join('\n');
env.__T85 = tpl85;
const d1 = G("adjustNotice_(__T85, [[3, [3,0], '', ['라벤더','브라운']]], 'S1')");
const d2 = G("adjustNotice_(__T85, [[3, [0,3], '', ['라벤더','브라운']]], 'S2')");
ok(/🐥옵션 : 라벤더 \(3명\)/.test(d1), '1일차 공지 옵션 라벤더 (3명) ' + d1);
ok(/🐥옵션 : 브라운 \(3명\)/.test(d2) && d2.indexOf('라벤더') < 0, '2일차 공지 옵션 브라운 (3명) ' + d2);
console.log(fails.length ? 'XX 0명 상품 빼기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 그날 0명 상품 공지·폼 옵션에서 빼기 시험 통과');
process.exit(fails.length ? 1 : 0);
