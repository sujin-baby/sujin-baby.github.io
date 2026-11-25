// (11/25) 월급시트 뒷정리(색·중복·상태·정렬·진행비·이월·여분)는 쓴 줄이 있거나 진행 구성이 바뀌었거나 오늘 처음일 때만  node paypost_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const f = (w, i, os, s, od, d) => G('payPostSkip_(' + [w, i, JSON.stringify(os), JSON.stringify(s), JSON.stringify(od), JSON.stringify(d)].join(',') + ')');
ok(f(false, 0, 'A', 'A', '20261125', '20261125') === true, '쓴 줄 없음·구성 같음·오늘 이미 함 → 건너뜀');
ok(f(true, 0, 'A', 'A', '20261125', '20261125') === false, '줄을 새로 썼으면 함');
ok(f(false, 0, 'A', 'B', '20261125', '20261125') === false, '진행 구성 바뀌면 함');
ok(f(false, 0, 'A', 'A', '20261124', '20261125') === false, '오늘 처음이면 함');
ok(f(false, 3, 'A', 'A', '20261125', '20261125') === false, '뒷정리 중간이면 이어서 함');
const src = require('fs').readFileSync(process.argv[2], 'utf8'), body = src.slice(src.indexOf('function updatePay_('), src.indexOf('function payPostSkip_('));
ok(/wrote = true; if \(prog\) prog\.w = 1;/.test(body), '줄 쓸 때 표시(나눠 해도 이어짐)');
ok(/props\.setProperty\('PAY_POSTSIG', postSig\); props\.setProperty\('PAY_POSTDAY', postDay\);/.test(body), '뒷정리 다 하면 기억');
ok(body.indexOf('payPostSkip_(') < body.indexOf("const postName"), '뒷정리 전에 확인');
console.log(fails.length ? 'XX 월급시트 뒷정리 시험 실패:\n- ' + fails.join('\n- ') : '✓ 월급시트 뒷정리는 바뀐 게 있을 때만 시험 통과');
process.exit(fails.length ? 1 : 0);
