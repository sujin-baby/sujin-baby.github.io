// 기대평 A·B묶음 (expMixOnce_, expCount_)  node expmix_test.js <Main.js> <diag full.json>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3]));
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER'), PH = G('PLAN_HEAD');
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const list = [LH.slice()];
data.runs.forEach(r => { const o = { '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '폼 링크': r.form, '폼ID': r.formId, '요청ID': r.req, '시트ID': 'S' + r.formId, '플랫폼': /기대평/.test(r.title) ? '기대평' : '', '가격': /기대평/.test(r.title) ? '14000' : '' }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]; data.outbox.forEach(o => ob.push([o.id, D(o.send), o.kind, o.room, o.head, o.st])); env.__ss.sheets['보낼메시지'] = new Sheet('보낼메시지', ob);
const pl = [PH.slice()]; data.plans.forEach(x => pl.push([x.id, x.camp, x.k, D(x.day), x.room, x.title, x.n, '[]', x.st, JSON.stringify(/^exp-/.test(x.id) ? { platform: '기대평', prices: x.day >= '2026-11-02' ? '13000' : '14000', desc: 'OLD' } : {})])); env.__ss.sheets['일정'] = new Sheet('일정', pl);
// 가짜 폼 (닉네임 질문 → 계정명 → 아이디)
const items = ['방에 참여한 카카오톡 닉네임', '계정명(수령인)', '아이디'].map(t => ({ t }));
let desc = '';
const mkItem = it => ({ getTitle: () => it.t, getIndex: () => items.indexOf(it) });
env.FormApp = { openById: () => ({ getItems: () => items.map(mkItem), addMultipleChoiceItem: () => { const it = { t: '' }; items.push(it); const o = { setTitle: t => { it.t = t; return o; }, setChoiceValues: v => { it.ch = v; return o; }, setRequired: b => { it.req = b; return o; }, setHelpText: () => o, getIndex: () => items.indexOf(it) }; return o; }, moveItem: (from, to) => { const [x] = items.splice(from, 1); items.splice(to, 0, x); }, setDescription: d => { desc = d; } }) };
G('expMixOnce_()');
console.log((env.__ORI_NOTES || []).join('\n'));
console.log('폼 질문 순서:', items.map(x => x.t + (x.req ? '(필수)' : '') + (x.ch ? JSON.stringify(x.ch) : '')).join(' / '));
const L = env.__ss.sheets['진행목록'].rows, c = h => LH.indexOf(h);
L.slice(1).filter(r => /기대평/.test(r[c('명단 제목')]) && r[c('진행 상태')] !== '종료').forEach(r => console.log('진행:', r[c('명단 제목')], '| 방', r[c('카톡방')], '| 목표인원', r[c('목표인원')]));
env.__ss.sheets['보낼메시지'].rows.filter(r => /기대평/.test(r[3]) && r[5] !== '보냄').forEach(r => console.log('보낼:', r[2], r[3], r[5], '|', String(r[4]).split('\n').slice(0, 4).join(' / ')));
console.log('폼 설명 첫 줄:', desc.split('\n')[0], '| 폼 링크 들어감:', /forms\.gle\/hbgVRhJbrpiWX2fcA/.test(desc));
env.__ss.sheets['일정'].rows.filter(r => /^exp-100-4-v5/.test(r[0])).forEach(r => console.log('일정:', r[0], r[4], '|', r[5], '|', r[8], '|', JSON.parse(r[9]).desc === 'OLD' ? 'OLD' : JSON.parse(r[9]).desc.split('\n')[3]));
