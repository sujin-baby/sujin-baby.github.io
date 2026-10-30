// 화면(HTML) 안 스크립트 문법 검사: 진행 도우미·보낼 메시지함·새 진행 창 + 가이드 생성기  node html_test.js <Main.js>
// 10/30: 진행 도우미 화면 스크립트에 'NEXTMD = ,' 문법 오류가 들어가 버튼이 전부 안 눌렸던 일 → 다시 안 생기게
const H = require('./harness'); const vm = require('vm'); const fs = require('fs'); const path = require('path');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
let ok = true;
const check = (name, html) => {
  const scripts = [...String(html).matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m => !/src=|type="(application\/json|module)"/.test(m[1] || '')).map(m => m[2]);
  scripts.forEach((js, i) => {
    // 서버가 채우는 자리(__K__ 등)는 빈 글자로
    const code = js.replace(/__[A-Z0-9]+__/g, '""');
    try { new vm.Script(code, { filename: name + '#' + i }); } catch (e) { ok = false; console.log('XX ' + name + ' 스크립트 ' + i + ': ' + e.message); }
  });
  console.log((ok ? 'OK ' : '   ') + name + ' (스크립트 ' + scripts.length + '개)');
};
['TOOLS_HTML', 'OUTBOX_HTML', 'DIALOG_HTML'].forEach(n => check(n, G(n)));
const guide = path.join(__dirname, '../../guide/index.html');
if (fs.existsSync(guide)) check('guide/index.html', fs.readFileSync(guide, 'utf8'));
console.log(ok ? '✓ 화면 스크립트 문법 통과' : 'XX 화면 스크립트 문법 오류');
process.exit(ok ? 0 : 1);
