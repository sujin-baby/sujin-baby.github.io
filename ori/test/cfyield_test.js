// (11/19) 15분 확인이 잠금을 기다리면(CF_WANT) 5분 실행·리뷰 사진 AI 1분 연쇄가 바로 비켜 줌 — 30분씩 확인이 없던 것  node cfyield_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
G("globalThis.__CALLED = []; rvMoveFix1_ = function () { __CALLED.push('fix'); }; rvInboxSort_ = function () { __CALLED.push('inbox'); }; rvQuickCheck_ = function () { __CALLED.push('quick'); }; rvZipSoon_ = function () { __CALLED.push('zip'); }; rvLooseCheck_ = function () { __CALLED.push('loose'); }; rvAiQueue_ = function () { __CALLED.push('ai'); }; bgLane_ = function () { __CALLED.push('bg'); };");
G("LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () { globalThis.__REL = (globalThis.__REL || 0) + 1; } }; } };");
// 1) 기다리는 확인이 없으면 다 함
G('rvInboxTick_()');
ok(JSON.stringify(G('__CALLED')) === JSON.stringify(['fix', 'inbox', 'quick', 'zip', 'loose', 'bg']), '평소엔 다 함 ' + JSON.stringify(G('__CALLED')));
// 2) 15분 확인이 기다리면 아무것도 안 하고 잠금 놓음
G("__CALLED.length = 0; globalThis.__REL = 0; PropertiesService.getScriptProperties().setProperty('CF_WANT', String(Date.now()));");
G('rvInboxTick_()');
ok(G('__CALLED.length') === 0 && G('__REL') === 1, '확인이 기다리면 바로 비킴 ' + JSON.stringify(G('__CALLED')) + ' rel ' + G('__REL'));
// 3) 중간에 기다리기 시작하면 그 단계 다음에서 멈춤
G("PropertiesService.getScriptProperties().deleteProperty('CF_WANT'); __CALLED.length = 0; rvInboxSort_ = function () { __CALLED.push('inbox'); PropertiesService.getScriptProperties().setProperty('CF_WANT', String(Date.now())); };");
G('rvInboxTick_()');
ok(JSON.stringify(G('__CALLED')) === JSON.stringify(['fix', 'inbox']), '중간에 기다리면 다음 단계 전에 멈춤 ' + JSON.stringify(G('__CALLED')));
// 4) yieldIfWanted_: 15분 확인 밖에서는 비켜 주고, 15분 확인 안에서는 안 비킴
G('globalThis.__ORI_T0 = Date.now()');
let e1 = null; try { G('yieldIfWanted_()'); } catch (e) { e1 = e; }
ok(e1 && e1.yieldLock && e1.cf, '5분 실행 안에서는 비킴');
G('globalThis.__IN_CF = true');
let e2 = null; try { G('yieldIfWanted_()'); } catch (e) { e2 = e; }
ok(!e2, '15분 확인 자신은 안 비킴');
console.log(fails.length ? 'XX 15분 확인에 비켜 주기 시험 실패:\n- ' + fails.join('\n- ') : '✓ 5분 실행·AI 연쇄가 15분 확인에 비켜 주기 시험 통과');
process.exit(fails.length ? 1 : 0);
