// 폼 설명 캐시(formDescRead_): 1시간 안이면 안 엶, 1~6시간이면 지난 진행만 캐시 사용, 옛 형식 캐시는 다시 엶  node fdesc_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
let opens = 0; env.__open = () => opens++;
G("FormApp.openById = function (id) { globalThis.__open(); return { getDescription: function () { return '새 설명 ' + id; } }; }");
const put = (id, v) => G(`CacheService.getScriptCache().put('FDESC_${id}', ${JSON.stringify(v)}, 21600)`);
const reset = () => G("Object.keys(FDESC_MEMO).forEach(function (k) { delete FDESC_MEMO[k]; })");
const now = Date.now(), SEP = '\u0001';
put('A', (now - 600000) + SEP + '캐시 A');        // 10분 전
put('B', (now - 2 * 3600000) + SEP + '캐시 B');   // 2시간 전
put('C', '옛 형식');                               // 구분자 없음
const r = [];
r.push(G("formDescRead_('A')")); reset();
r.push(G("formDescRead_('B', 3600)")); reset();
put('B', (now - 2 * 3600000) + SEP + '캐시 B');
r.push(G("formDescRead_('B', 21600)")); reset();
r.push(G("formDescRead_('C')"));
const old = G("descAge_({ '진행일': new Date(today_().getTime() - 5 * 86400000) })"), fresh = G("descAge_({ '진행일': today_() })");
console.log(r.join(' / ') + ' / 연 횟수 ' + opens + ' / 지난 진행 ' + old + ', 오늘 ' + fresh);
const ok = r.join('|') === '캐시 A|새 설명 B|캐시 B|새 설명 C' && opens === 2 && old === 21600 && fresh === 3600;
console.log(ok ? '✓ 폼 설명 캐시 시험 통과' : 'XX 폼 설명 캐시 시험 실패');
process.exit(ok ? 0 : 1);
