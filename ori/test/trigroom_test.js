// (11/19) 폼 트리거가 한도를 다 채워 리뷰 사진 AI 1분 연쇄가 못 걸리던 것: AI 이어 하기 자리를 비워 둠  node trigroom_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
const runs = []; for (let i = 0; i < 13; i++) runs.push(mk({ '진행일': day(-i), '명단 제목': '#r' + i + ' 5 (뽀짝오리)', '폼ID': 'F' + i, '진행 상태': '진행중' }));
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice()].concat(runs));
let uid = 0; const trig = [];
const T = (h, ev, src, id) => ({ id: id || 'u' + (++uid), h, ev, src, getUniqueId() { return this.id; }, getHandlerFunction() { return this.h; }, getEventType() { return this.ev; }, getTriggerSourceId() { return this.src || null; } });
trig.push(T('onAdminEdit', 'CLOCK'), T('onAdminEdit', 'ON_EDIT', 'ADMIN'), T('dailyCheck', 'CLOCK'), T('checkFull', 'CLOCK'), T('checkFull', 'CLOCK', null, 'SOON'), T('checkFull', 'CLOCK', null, 'MID'));
for (let i = 0; i < 13; i++) trig.push(T('onAdminEdit', 'ON_FORM_SUBMIT', 'F' + i));
env.__TRIG = trig; env.__T = T;
G(`ScriptApp = { EventType: { ON_FORM_SUBMIT: 'ON_FORM_SUBMIT', CLOCK: 'CLOCK' },
  getProjectTriggers: function () { return __TRIG.slice(); },
  deleteTrigger: function (t) { const i = __TRIG.indexOf(t); if (i >= 0) __TRIG.splice(i, 1); },
  newTrigger: function (h) { const b = { forForm: function (id) { b.src = id; return b; }, onFormSubmit: function () { b.ev = 'ON_FORM_SUBMIT'; return b; }, timeBased: function () { b.ev = 'CLOCK'; return b; }, after: function () { return b; }, everyMinutes: function () { return b; }, create: function () { const t = __T(h, b.ev, b.src); __TRIG.push(t); return t; } }; return b; } };
const P = PropertiesService.getScriptProperties(); P.setProperty('SOON_TRIG_ID', 'SOON'); P.setProperty('SOON_TRIG_AT', String(Date.now())); P.setProperty('MID_TRIG_ID', 'MID'); P.setProperty('MID_TRIG_AT', String(Date.now() + 3600000)); P.setProperty('RVAI_Q', 'S1');`);
ok(trig.length === 19, '처음 19개');
G('ensureSubmitTriggers_(readRuns_())');
ok(trig.length === 18, 'AI 이어 하기 자리 하나 비움 ' + trig.length);
ok(!trig.some(t => t.src === 'F12') && trig.some(t => t.src === 'F0'), '가장 지난 진행 폼 트리거부터 뺌');
G('ensureAiQueueTrigger_()');
ok(trig.length === 19 && trig.some(t => t.h === 'onAdminEdit' && t.ev === 'CLOCK' && t.id === env.__props.get('RVAI_TRIG_ID')), 'AI 1분 연쇄가 걸림 ' + trig.length);
G('ensureSubmitTriggers_(readRuns_())');
ok(trig.length === 19 && trig.some(t => t.id === env.__props.get('RVAI_TRIG_ID')), 'AI 연쇄가 걸려 있으면 폼 트리거 자리는 그대로 ' + trig.length);
ok(trig.filter(t => t.h === 'onAdminEdit' && t.ev === 'CLOCK').length === 2, '5분 실행과 AI 연쇄 둘 다 남음');
console.log(fails.length ? 'XX 트리거 자리 시험 실패:\n- ' + fails.join('\n- ') : '✓ 리뷰 사진 AI 연쇄 트리거 자리 시험 통과');
process.exit(fails.length ? 1 : 0);
