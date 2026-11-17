// (11/18) 명단 전달 비고: 목표보다 폼이 많음·같은 사람이 폼 두 번  node listwarn_test.js <Main.js>
const H = require('./harness'); const vm = require('vm');
const env = H.makeEnv({ main: process.argv[2], props: { OUTBOX_SORTED: '1', OUTBOX_FMT2: '1' } }); const G = k => vm.runInContext(k, env);
const fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const LH = G('LIST_HEADER'), mk = o => LH.map(h => o[h] !== undefined ? o[h] : '');
const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = n => new Date(t0.getTime() + n * 86400000);
const md = d => (d.getMonth() + 1) + '.' + d.getDate();
env.__ss.sheets['진행목록'] = new H.Sheet('진행목록', [LH.slice(),
  mk({ '진행일': day(-1), '명단 제목': '#' + md(day(-1)) + ' 실 문풍지외4 (뽀짝오리)', '시트ID': 'L1', '인원': 4, '목표인원': 4, '진행 상태': '진행중' }),
  mk({ '진행일': day(0), '명단 제목': '#' + md(day(0)) + ' 실 문풍지외2 (뽀짝오리)', '시트ID': 'L1', '인원': 3, '목표인원': 2, '진행 상태': '진행중' })]);
const resp = new H.Sheet('설문지 응답 시트1', [['타임스탬프', '계정명(수령인)', '아이디', '전화번호'],
  [new Date(day(-1).getTime() + 3600e3), '이진선', 'a', '010-3664-7127'],
  [new Date(day(0).getTime() + 3600e3), '오주연', 'b', '010-8212-4890'],
  [new Date(day(0).getTime() + 5400e3), '안민지', 'c', '010-5742-3933'],
  [new Date(day(0).getTime() + 5600e3), '안민지', 'c', '010-5742-3933']]);
resp.getFormUrl = () => 'https://form';
env.SpreadsheetApp.openById = id => id === 'L1' ? { getSheets: () => [resp], getSheetByName: () => null } : env.__ss;
let w = ''; try { w = G('listWarn_(' + JSON.stringify('#' + md(day(0)) + ' 실 문풍지외2') + ')'); } catch (e) { w = 'ERR ' + e.stack; }
ok(/목표 2명인데 폼 3개 \(1개 많음\)/.test(w) && /안민지 2번/.test(w) && !/이진선/.test(w), '경고 ' + w);
G('globalThis.__LISTWARN = null');
let w2 = G('listWarn_(' + JSON.stringify('#' + md(day(-1)) + ' 실 문풍지외4') + ')');
ok(w2 === '', '어제 진행은 경고 없음 ' + w2);
if (fails.length) { console.log('✗ ' + fails.join('\n✗ ')); process.exit(1); }
console.log('✓ 명단 전달 비고 경고 시험 통과');
