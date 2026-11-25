// (11/25) AI 답에서 첫 JSON 덩어리만 읽음 (뒤에 글·두 번째 덩어리가 붙어도)  node firstjson_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const fj = t => { env.__t = t; return G('firstJson_(__t)'); };
ok(fj('{"kind":"review","stars":5}').stars === 5, '그냥 JSON');
ok(fj('```json\n{"kind":"review","text":true}\n```').text === true, '코드 블록');
ok(fj('{"kind":"review","stars":4}\n{"kind":"other"}').stars === 4, '두 덩어리 → 첫 것');
ok(fj('{"kind":"review","stars":3} 설명: 별점 3개 } 끝').stars === 3, '뒤에 글·괄호');
ok(fj('{"kind":"review","product":"상자 {특가}","stars":2}').product === '상자 {특가}', '따옴표 안 괄호');
ok(fj('{"a":"\\"}"} 뒤').a === '"}', '따옴표 안 이스케이프');
ok(fj('답 없음') === null && fj('{깨짐') === null, '못 읽으면 null');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/const o = firstJson_\(t\);/.test(src.slice(src.indexOf('function geminiReadCapture_'), src.indexOf('function geminiReadCapture_') + 600)), '캡처 읽기에 씀');
console.log(fails.length ? 'XX AI 답 JSON 시험 실패:\n- ' + fails.join('\n- ') : '✓ AI 답 첫 JSON 덩어리 시험 통과');
process.exit(fails.length ? 1 : 0);
