// 새 폼 옵션 보기에서 가격 빼기 (setOptionChoices_)  node noprice_test.js <Main.js>  (예전 폼 고치기 formNoPriceOnce_는 10/30 정리로 지움)
const { makeEnv, Sheet } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env); const LH = G('LIST_HEADER');
const mkForm = choices => { let cur = choices.slice(); const item = { getTitle: () => '구매한 옵션', getType: () => 'MC', asMultipleChoiceItem: () => ({ getChoices: () => cur.map(v => ({ getValue: () => v })), setChoiceValues: l => { cur = l.slice(); } }) }; return { cur: () => cur, getItems: () => [item] }; };
env.FormApp = { openById: () => null, ItemType: { MULTIPLE_CHOICE: 'MC', LIST: 'L', CHECKBOX: 'C', TEXT: 'T' } };
const f5 = mkForm([]); env.__f5 = f5; G("setOptionChoices_(__f5, '제트블랙 (10,630원)\\n1 (21,800원)\\n제트블랙 (10,430원)')"); const got = JSON.stringify(f5.cur()); console.log('새 폼:', got);
const ok = got === '["제트블랙","단일옵션"]'; console.log(ok ? '✓ 폼 옵션 가격 빼기 시험 통과' : 'XX 실패'); process.exit(ok ? 0 : 1);
