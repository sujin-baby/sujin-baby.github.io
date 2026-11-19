// (11/19) Gemini가 실패·느리면 다음 모델로 계속 넘어가지 않고 잠시 쉼(quota) — 15분 확인이 사진 한 장 때문에 6분 제한에 걸리지 않게  node geminislow_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { GEMINI_KEY: 'AIzaTEST' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G("globalThis.__CALLS = 0; UrlFetchApp = { fetch: function () { __CALLS++; return { getResponseCode: function () { return 404; }, getContentText: function () { return 'no model'; } }; } };");
// 시간이 넉넉하면 예전처럼 모델을 차례로
G('globalThis.__ORI_T0 = Date.now()');
let e1 = null; try { G("geminiAsk_([{ text: 'x' }], true)"); } catch (e) { e1 = e; }
const n1 = G('__CALLS'), nm = G('GEMINI_MODELS.length');
ok(n1 === nm && e1 && !e1.quota, '시간 넉넉: 모델 ' + nm + '개 다 물어봄 ' + n1);
// 확인 시간이 거의 다 됐으면 첫 모델 실패 뒤 바로 쉼
G('globalThis.__CALLS = 0; globalThis.__ORI_T0 = Date.now() - 300000');
let e2 = null; try { G("geminiAsk_([{ text: 'x' }], true)"); } catch (e) { e2 = e; }
ok(G('__CALLS') === 1 && e2 && e2.quota, '늦으면 한 번만 묻고 쉼 ' + G('__CALLS') + ' ' + JSON.stringify(e2));
console.log(fails.length ? 'XX Gemini 느림 시험 실패:\n- ' + fails.join('\n- ') : '✓ Gemini 느리면 다음 모델로 안 넘어가고 쉼 시험 통과');
process.exit(fails.length ? 1 : 0);
