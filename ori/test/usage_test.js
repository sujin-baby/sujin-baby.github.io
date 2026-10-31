// 사용법 탭 줄이 전부 [제목, 설명] 2칸인지 (10/31: 쉼표 빠져 사용법 탭 만들기 실패)  node usage_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] });
const rows = vm.runInContext('USAGE_ROWS', env);
const bad = rows.filter(r => !Array.isArray(r) || r.length !== 2);
console.log(bad.length ? 'XX 사용법 탭 줄 모양 틀림 ' + bad.length + '줄' : '✓ 사용법 탭 줄 ' + rows.length + '개 (2칸씩)'); process.exit(bad.length ? 1 : 0);
