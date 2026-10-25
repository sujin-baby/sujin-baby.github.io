// 폼 옵션 보기 가격 빼기 (setOptionChoices_, formNoPriceOnce_)  node noprice_test.js <Main.js>
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mkForm = choices => { let cur = choices.slice(); const item = { getTitle: () => '구매한 옵션', getType: () => 'MC', asMultipleChoiceItem: () => ({ getChoices: () => cur.map(v => ({ getValue: () => v })), setChoiceValues: l => { cur = l.slice(); } }) }; return { cur: () => cur, getItems: () => [item] }; };
const forms = { F1: mkForm(['제트블랙 (10,630원)']), F2: mkForm(['1kg (20,500원)', '2kg (35,500원)']), F3: mkForm(['단일옵션']), F4: mkForm(['레드 (9,900원)']) };
env.FormApp = { openById: id => forms[id], ItemType: { MULTIPLE_CHOICE: 'MC', LIST: 'L', CHECKBOX: 'C', TEXT: 'T' } };
const row = o => LH.map(h => o[h] === undefined ? '' : o[h]);
env.__ss.sheets['진행목록'] = new Sheet('진행목록', [LH.slice(), row({ '명단 제목': '#택10.26 줄넘기 2 (뽀짝오리)', '폼ID': 'F1', '진행 상태': '진행예정' }), row({ '명단 제목': '#10.27 밤 2', '폼ID': 'F2', '진행 상태': '진행중' }), row({ '명단 제목': '#10.27 밤 3', '폼ID': 'F2', '진행 상태': '진행중' }), row({ '명단 제목': '#10.20 x 1', '폼ID': 'F3', '진행 상태': '진행중' }), row({ '명단 제목': '#10.10 끝 1', '폼ID': 'F4', '진행 상태': '종료' })]);
G('formNoPriceOnce_()');
Object.keys(forms).forEach(k => console.log(k, JSON.stringify(forms[k].cur())));
console.log((env.__ORI_NOTES || []).join('\n'));
const f5 = mkForm([]); env.__f5 = f5; G("setOptionChoices_(__f5, '제트블랙 (10,630원)\\n1 (21,800원)\\n제트블랙 (10,430원)')"); console.log('새 폼:', JSON.stringify(f5.cur()));
