const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const data = require(require('path').resolve(process.argv[3] || 'full.json'));
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const OLD = LH.slice(0, LH.indexOf('리뷰 취합'));
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const list = [OLD.slice()];
data.runs.forEach(r => { const o = { '등록일': D(r.reg), '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '구매시간': r.slot, '폼 링크': r.form, '폼ID': r.formId, '요청ID': r.req, '시트ID': 'S_' + r.camp, '택배 옮김': r.k % 2 === 0 }; list.push(OLD.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
const before = JSON.stringify(list.slice(1).map(r => r.map(x => x instanceof Date ? x.getTime() : x)));
G('ensureListSheet_()');
const sh = env.__ss.sheets['진행목록'];
console.log('머리글', sh.rows[0].length, sh.rows[0].slice(-4).join(','));
const after = JSON.stringify(sh.rows.slice(1, list.length).map(r => r.slice(0, OLD.length).map(x => x instanceof Date ? x.getTime() : x)));
// 상태 칸은 migrate가 statusFor_로 다시 계산하므로 그 칸만 빼고 비교
const strip = js => JSON.parse(js).map(r => r.filter((x, i) => i !== OLD.indexOf('진행 상태')));
console.log('값 그대로(진행 상태 칸 빼고):', JSON.stringify(strip(before)) === JSON.stringify(strip(after)), '줄 수', list.length - 1, '→', sh.getLastRow() - 1);
// rvItems_: 두 진행에 RVDONE, 하나는 3일 전 취합 체크, 하나는 5일 전
const runs = G('readRuns_()'); const t = runs.filter(r => /오메가3/.test(r['명단 제목'])).slice(0, 3);
env.__props.set('RVDONE_' + String(t[0]['명단 제목']).replace(/\s+/g, ''), '1'); env.__props.set('RVDONE_' + String(t[1]['명단 제목']).replace(/\s+/g, ''), '1'); env.__props.set('RVDONE_' + String(t[2]['명단 제목']).replace(/\s+/g, ''), '1');
const d3 = new Date(); d3.setHours(0, 0, 0, 0); d3.setDate(d3.getDate() - 3); const d5 = new Date(d3); d5.setDate(d5.getDate() - 2);
sh.getRange(t[1].row, LH.indexOf('리뷰 취합') + 1).setValue(d3); sh.getRange(t[2].row, LH.indexOf('리뷰 취합') + 1).setValue(d5);
env.__props.set('RVRPT_S_오메가3', '1');
const items = vm.runInContext('rvItems_(readRuns_(), PropertiesService.getScriptProperties())', env);
console.log(items.map(i => i.type + ' ' + i.label + ' 체크:' + (i.at || '-')).join('\n'));
