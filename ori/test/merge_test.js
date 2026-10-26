// 치약걸이 + 보냉백 합치기 (mergeBagOnce_)  node merge_test.js <Main.js> <diag full.json(days=3, full=1)>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3]));
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER'), PH = G('PLAN_HEAD');
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const list = [LH.slice()];
data.runs.forEach(r => { const o = { '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '마감 시각': r.closed ? new Date(2026, 9, 26, 11, 15) : '', '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '폼 링크': r.form, '폼ID': r.formId, '요청ID': r.req, '시트ID': 'S' + r.formId, '시트 링크': 'https://sheet/' + r.formId, '가격': '17800', '실배송': /실/.test(r.title) ? 'Y' : '' }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]; data.outbox.forEach(o => ob.push([o.id, D(o.send), o.kind, o.room, o.head, o.st])); env.__ss.sheets['보낼메시지'] = new Sheet('보낼메시지', ob);
const pl = [PH.slice()]; data.plans.forEach(x => pl.push([x.id, x.camp, x.k, D(x.day), x.room, x.title, x.n, '[]', x.st, '{}'])); env.__ss.sheets['일정'] = new Sheet('일정', pl);
let choices = ['단일옵션'], accepting = false; const names = {};
const item = { getTitle: () => '구매한 옵션', getType: () => 'MC', asMultipleChoiceItem: () => ({ getChoices: () => choices.map(v => ({ getValue: () => v })), setChoiceValues: l => { choices = l.slice(); } }) };
env.FormApp = { openById: () => ({ getItems: () => [item], isAcceptingResponses: () => accepting, setAcceptingResponses: b => { accepting = b; }, setTitle: t => { names.formTitle = t; } }), ItemType: { MULTIPLE_CHOICE: 'MC', LIST: 'L', CHECKBOX: 'C', TEXT: 'T' } };
env.DriveApp = { getFileById: id => ({ setName: n => { names['file ' + id] = n; } }), getFolderById: id => ({ setName: n => { names['folder ' + id] = n; } }) };
G('mergeBagOnce_()');
const L = env.__ss.sheets['진행목록'].rows, c = h => LH.indexOf(h);
L.slice(1).filter(r => /치약걸이/.test(r[c('명단 제목')])).forEach(r => console.log(['명단 제목', '카톡방', '캠페인', '목표인원', '인원', '총건수', '가격', '마감 시각'].map(h => h + '=' + (r[c(h)] instanceof Date ? 'Date' : r[c(h)])).join(' | ')));
env.__ss.sheets['일정'].rows.filter(r => String(r[0]).indexOf('m9qmh8ds') === 0).forEach(r => console.log('일정', r[0], r[4], r[8]));
env.__ss.sheets['보낼메시지'].rows.filter(r => /치약걸이/.test(r[3] + r[4])).forEach(r => console.log('보낼', r[2], '|', r[3], '|', r[5], '|', String(r[4]).split('\n').slice(0, 3).join(' / ').slice(0, 90)));
console.log('폼 옵션', JSON.stringify(choices), '받는 중', accepting, JSON.stringify(names));
console.log((env.__ORI_NOTES || []).join('\n'));
// 5명 차면 명단 전달이 두 줄 안 되게
const r1 = G("readRuns_().filter(function (x) { return x['요청ID'] === 'm9qmh8ds'; })[0]"); env.__r1 = r1;
console.log('5명 찼을 때 대기 명단 전달 재사용:', JSON.stringify(G('pendingListMsg_(__r1)').slice(0, 80)));
