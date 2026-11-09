// 카톡 방제 20자 (11/10 사용자: 21자부터 안 됨): 생성기 fitRoom20 · 서버 fitRoom20_  node room20_test.js <Main.js>
const fs = require('fs'), path = require('path'), H = require('./harness'), vm = require('vm');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const html = fs.readFileSync(path.join(__dirname, '../../guide/index.html'), 'utf8');
const src = html.match(/function fitRoom20\(s\) \{[\s\S]*?\n  \}/);
ok(!!src, '생성기 fitRoom20 못 찾음');
const fit = src ? new Function(src[0] + '; return fitRoom20;')() : () => '';
const cases = [
  ['#택11.10 싱싱곳간 시나노골드사과10', '#택11.10 싱싱곳간 시나노골드10'],
  ['#택11.10 싱싱곳간시나노골드사과10', '#택11.10 싱싱곳간시나노골드사10'],
  ['#택11.10 오늘과일 설향딸기외 29', '#택11.10 오늘과일 설향딸기외29'],
  ['#10.27 실 유앤아이푸드 효자손외 20', '#10.27 실 효자손외 20'],
  ['#택11.9 오늘과일 설향딸기외 30', '#택11.9 오늘과일 설향딸기외 30'],
];
cases.forEach(([a, b]) => { const r = fit(a); ok(r === b && r.length <= 20, '생성기 ' + a + ' → ' + r + ' (' + r.length + '자, 기대 ' + b + ')'); });
// 서버
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
ok(G("fitRoom20_('#택11.10 오늘과일 설향딸기외 29 (뽀짝오리)')") === '#택11.10 오늘과일 설향딸기외29 (뽀짝오리)', '서버 닉네임 붙은 제목 ' + G("fitRoom20_('#택11.10 오늘과일 설향딸기외 29 (뽀짝오리)')"));
ok(G("retitleDate_('#택11.9 오늘과일 설향딸기외 30', new Date(2026, 10, 10))") === '#택11.10 오늘과일 설향딸기외30', '날짜 바꿔 21자 → 20자 ' + G("retitleDate_('#택11.9 오늘과일 설향딸기외 30', new Date(2026, 10, 10))"));
ok(G("fitRoom20_('#10.27 실 유앤아이푸드 효자손외 20 (뽀짝오리)')") === '#10.27 실 효자손외 20 (뽀짝오리)', '서버 업체명 빼기 ' + G("fitRoom20_('#10.27 실 유앤아이푸드 효자손외 20 (뽀짝오리)')"));
ok(G("retitleDate_('#11.9 실 밴드 10', new Date(2026, 10, 10))") === '#11.10 실 밴드 10', '짧으면 그대로');
console.log(fails.length ? 'XX 방제 20자 시험 실패:\n- ' + fails.join('\n- ') : '✓ 방제 20자 (생성기·서버) 시험 통과');
process.exit(fails.length ? 1 : 0);
