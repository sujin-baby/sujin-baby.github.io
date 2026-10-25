// 리뷰이미지 압축이 폴더째 올린 사진도 세는지 (rvZip_)  node zip_test.js <Main.js>
const { makeEnv } = require('./harness'); const vm = require('vm');
const env = makeEnv({ main: process.argv[2] }); const G = k => vm.runInContext(k, env);
const it = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
const img = n => ({ getName: () => n, getMimeType: () => 'image/jpeg', getLastUpdated: () => new Date(2026, 9, 25), getSize: () => 400000, getBlob: () => ({ setName: x => x }) });
const folder = (files, subs) => ({ getFiles: () => it(files), getFolders: () => it(subs || []) });
let zipped = null;
const parent = { getFilesByName: () => it([]), createFile: z => ({ getUrl: () => 'https://zip' }) };
env.Utilities.zip = (blobs, name) => { zipped = { n: blobs.length, name }; return {}; };
env.__f = { parent, img: folder([img('a.jpg')], [folder(Array.from({ length: 35 }, (_, i) => img('p' + i + '.jpg')))]) };
env.queueMsg_ = () => {}; G('queueMsg_ = function () {}');
G("outboxSheet_ = function () { return { getLastRow: function () { return 1; } }; }");
G("rvZip_(__f, '# 고구마말랭이', PropertiesService.getScriptProperties(), 'SID')");
console.log('압축한 사진:', zipped ? zipped.n + '장 → ' + zipped.name : '압축 안 함');
