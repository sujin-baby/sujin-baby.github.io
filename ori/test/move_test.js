// 사용: curl 'WEBAPP_URL?k=KEY&p=diag&days=30&full=1' > full.json 후 TZ=Asia/Seoul node move_test.js ../Main.js '실링팬' 10.27 2026-10-28 full.json
// 실제 데이터(점검 주소에서 읽은 것)로 '진행일 옮기기'를 돌려 보고, 보낼메시지 방 공지가 제자리에 있는지 확인
const { makeEnv, Sheet } = require('./harness');
const vm = require('vm');
const data = require(require('path').resolve(process.argv[6] || 'full.json'));
const main = process.argv[2], who = process.argv[3] || '실 속눈썹영양제', fromTok = process.argv[4] || '10.27', toDay = process.argv[5] || '2026-10-28';
const env = makeEnv({ main, props: {} });
const G = k => vm.runInContext(k, env);
const LH = G('LIST_HEADER'), PH = G('PLAN_HEAD');
const D = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : s; };
const list = [LH.slice()];
data.runs.forEach(r => { const o = { '등록일': D(r.reg), '진행일': D(r.day), '명단 제목': r.title, '목표인원': r.target, '인원': r.got, '진행 상태': r.st, '캠페인': r.camp, '일차': r.k, '총건수': r.total, '카톡방': r.room, '구매시간': r.slot, '폼 링크': r.form, '폼ID': r.formId, '요청ID': r.req, '시트ID': 'S_' + r.camp }; list.push(LH.map(h => o[h] === undefined ? '' : o[h])); });
env.__ss.sheets['진행목록'] = new Sheet('진행목록', list);
const ob = [['ID', '보낼 날짜', '종류', '카톡방', '메시지', '보냄 체크']];
data.outbox.forEach(o => ob.push([o.id, D(o.send), o.kind, o.room, o.head, o.st]));
env.__ss.sheets['보낼메시지'] = new Sheet('보낼메시지', ob);
const pl = [PH.slice()];
data.plans.forEach(x => pl.push([x.id, x.camp, x.k, D(x.day), x.room, x.title, x.n, '[]', x.st, '{}']));
env.__ss.sheets['일정'] = new Sheet('일정', pl);
const notices = () => env.__ss.sheets['보낼메시지'].rows.slice(1).filter(r => r[2] === '방 공지' && r[5] === '대기').map(r => ({ id: r[0], room: r[3], send: r[1] instanceof Date ? (r[1].getMonth() + 1) + '/' + r[1].getDate() : r[1], link: (String(r[4]).match(/forms\.gle\/\w+/) || [''])[0] }));
const before = notices();
// 사용자가 진행목록 진행일 칸을 고친 것처럼
const listSh = env.__ss.sheets['진행목록'], ci = LH.indexOf('진행일') + 1;
const rowIdx = listSh.rows.findIndex((r, i) => i > 0 && String(r[LH.indexOf('명단 제목')]).indexOf(who) >= 0 && String(r[LH.indexOf('명단 제목')]).indexOf('#' + fromTok) >= 0);
if (rowIdx < 0) throw new Error('run not found');
listSh.rows[rowIdx][ci - 1] = D(toDay);
const r = G('readRuns_()').filter(x => x.row === rowIdx + 1)[0];
const msg = env.moveRunDate_(r, D(toDay));
console.log('결과:', msg);
const after = notices();
const mine = l => l.filter(n => n.room.indexOf(who) >= 0);
console.log('전:', mine(before).map(n => n.id + '@' + n.room + '(' + n.send + ')').join(' | '));
console.log('후:', mine(after).map(n => n.id + '@' + n.room + '(' + n.send + ')').join(' | '));
const rooms = mine(after).map(n => n.room), dup = rooms.filter((x, i) => rooms.indexOf(x) !== i);
console.log('방 하나에 공지 둘 이상:', dup.length ? dup.join(',') : '없음', '/ 공지 수', mine(before).length, '→', mine(after).length);
console.log('진행목록:', G('readRuns_()').filter(x => String(x['명단 제목']).indexOf(who) >= 0 && x['진행 상태'] !== '종료').map(x => (x['진행일'].getMonth() + 1) + '/' + x['진행일'].getDate() + '=' + x['카톡방']).join(' | '));
console.log('기록:', (env.__ORI_NOTES || []).join(' / ').slice(0, 400));
