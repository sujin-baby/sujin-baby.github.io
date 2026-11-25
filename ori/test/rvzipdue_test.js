// (11/25) 다 끝난 의뢰 사진 폴더 다시 훑기는 한 시간에 한 번 (받는 곳에서 사진이 들어오면 바로)  node rvzipdue_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const now = Date.now();
env.__at = { S1: now - 10 * 60000, S2: now - 61 * 60000 };
const due = sid => G('rvZipDue_(' + JSON.stringify(sid) + ', PropertiesService.getScriptProperties(), __at, ' + now + ')');
ok(due('S1') === false, '10분 전에 훑었으면 안 함');
ok(due('S2') === true, '한 시간 지났으면 함');
ok(due('S3') === true, '처음이면 함');
env.__props.set('RVZIPSOON_S1', String(now));
ok(due('S1') === true, '받는 곳에서 사진이 들어왔으면 바로');
const src = require('fs').readFileSync(process.argv[2], 'utf8');
ok(/if \(!rvZipDue_\(sid, props, zipAt, Date\.now\(\)\)\) return;/.test(src) && /zipAt\[sid\] = Date\.now\(\); saveZipAt\(\);/.test(src), '리뷰 확인 빠른 길에 연결');
console.log(fails.length ? 'XX 사진 폴더 다시 훑기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 다 끝난 의뢰 사진 폴더 다시 훑기 한 시간에 한 번 시험 통과');
process.exit(fails.length ? 1 : 0);
