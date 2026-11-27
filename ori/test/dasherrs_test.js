// (11/25) 한눈에 '확인 필요' 칸만 바뀌면 그 칸만 고침 (통째로 다시 그리기 150~250초 안 함)  node dasherrs_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const row = (t) => { const r = Array(16).fill(''); r[1] = t; return r; };
const sh = new H.Sheet('한눈에', [Array(16).fill('h'), row('#11.25 가짜 가 2'), row('#11.25 가짜 나 3'), row('#11.25 가짜 다 1')]);
sh.rows[2][13] = '⚠ 옛 오류';
env.__sh = sh;
env.__runs = [{ '명단 제목': '#11.25 가짜 가 2 (뽀짝오리)' }, { '명단 제목': '#11.25 가짜 나 3 (뽀짝오리)' }, { '명단 제목': '#11.25 가짜 다 1 (뽀짝오리)' }];
let n = G("dashErrsOnly_(__sh, __runs, { '#11.25 가짜 가 2 (뽀짝오리)': '초과 1명' }, { '#11.25 가짜 나 3 (뽀짝오리)': '옛 오류' })");
ok(n === 2, '바뀐 두 줄만 ' + n);
ok(String(sh.rows[1][13]) === '⚠ 초과 1명', '새 오류 씀 ' + sh.rows[1][13]);
ok(!sh.rows[2][13], '없어진 오류 지움 ' + sh.rows[2][13]);
ok(!sh.rows[3][13], '그대로인 줄은 안 건드림');
// 방제 순서가 다르면 -1 (통째로 다시 그리기)
env.__runs2 = [env.__runs[1], env.__runs[0], env.__runs[2]];
ok(G('dashErrsOnly_(__sh, __runs2, {}, {})') === -1, '순서 다르면 다시 그리기');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/if \(!force && sh0 && old0 && old0 !== sigH && props\.getProperty\('DASH_SIGX'\) === sigXH\)/.test(src), 'DASH_SIG를 지운(바로 다시 그리기) 때는 통째로');
ok(/props\.setProperty\('DASH_SIG', sigH\); props\.setProperty\('DASH_SIGX', sigXH\); props\.setProperty\('DASH_ERRS', errsRaw\);/.test(src), '다 그리면 기억');
ok(/props\.deleteProperty\('DASH_SIG'\); props\.deleteProperty\('DASH_SIGX'\);/.test(src), '그리기 시작하면 둘 다 지움');
console.log(fails.length ? 'XX 한눈에 확인 필요 칸 시험 실패:\n- ' + fails.join('\n- ') : '✓ 한눈에 확인 필요 칸만 고침 시험 통과');
process.exit(fails.length ? 1 : 0);
