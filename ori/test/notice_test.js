// 10/26 공지 고치기 (notice1026Once_)  node notice_test.js <Main.js> <diag full.json>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3]));
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER'), PH = G('PLAN_HEAD');
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const list = [LH.slice()];
data.runs.forEach(r => { const o = { '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '폼 링크': r.form, '폼ID': r.formId, '요청ID': r.req, '시트ID': 'S' + r.formId, '플랫폼': /기대평/.test(r.title) ? '기대평' : '' }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']]; data.outbox.forEach(o => ob.push([o.id, D(o.send), o.kind, o.room, o.head, o.st])); env.__ss.sheets['보낼메시지'] = new Sheet('보낼메시지', ob);
const pl = [PH.slice()]; data.plans.forEach(x => pl.push([x.id, x.camp, x.k, D(x.day), x.room, x.title, x.n, '[]', x.st, JSON.stringify(/^exp-/.test(x.id) ? { platform: '기대평', prices: x.day >= '2026-11-02' ? '13000' : '14000', desc: 'OLD' } : {})])); env.__ss.sheets['일정'] = new Sheet('일정', pl);
const desc = {}; env.FormApp = { openById: id => ({ setDescription: t => { desc[id] = t; } }) };
G('notice1026Once_()');
console.log((env.__ORI_NOTES || []).join('\n'));
const rows = env.__ss.sheets['보낼메시지'].rows;
const show = room => rows.filter(r => r[3] === room && r[2] === '방 공지' && /양식 작성 폼/.test(r[4])).forEach(r => console.log('--- ' + room + ' [' + r[5] + ']\n' + r[4]));
show('#10.27 실 치약걸이 보냉백 5'); show('10.27 백발백중 도서 기대평 42');
console.log('--- 폼 설명:', Object.keys(desc).map(k => k + ' ' + desc[k].split('\n')[0]).join(' / '));
const p = env.__ss.sheets['일정'].rows.filter(r => /^exp-100-4-v5/.test(r[0]) && r[8] === '대기').map(r => r[0] + ':' + (JSON.parse(r[9]).desc.match(/\(\d주차\)/) || [''])[0]);
console.log('--- 일정 틀:', p.join(' '));
