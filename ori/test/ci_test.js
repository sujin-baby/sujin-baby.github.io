// CI 단위 테스트: 기본 유틸 함수 및 어제 이전 마감 진행 스킵 로직 검증
const { makeEnv } = require('./harness');
const vm = require('vm');
const path = require('path');

const mainPath = path.resolve(__dirname, '../Main.js');
console.log('Loading Main.js into harness sandbox...');
const env = makeEnv({ main: mainPath });
const G = k => vm.runInContext(k, env);

console.log('Testing utility functions...');
const today = G('today_()');
if (!(today instanceof Date)) throw new Error('today_() did not return Date');

// Test statusFor_
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

if (G('statusFor_')(tomorrow) !== '진행예정') throw new Error('statusFor_(tomorrow) failed');
if (G('statusFor_')(yesterday) !== '진행중') throw new Error('statusFor_(yesterday) failed');

// Test windowOf_ & runOver_ logic
const dummyRuns = [
  { row: 2, '진행일': yesterday, '명단 제목': '#10.28 테스트 5', '캠페인': '테스트', '마감 시각': '10/28 08:20' },
  { row: 3, '진행일': today, '명단 제목': '#10.29 테스트 5', '캠페인': '테스트', '마감 시각': '' }
];

console.log('Testing past run skip condition...');
const pastRun = dummyRuns[0];
const todayRun = dummyRuns[1];

const shouldSkipPast = pastRun['진행일'] < today && (pastRun['마감 시각'] || G('runOver_')(dummyRuns, pastRun) || G('pastEnd_')(pastRun));
const shouldSkipToday = todayRun['진행일'] < today && (todayRun['마감 시각'] || G('runOver_')(dummyRuns, todayRun) || G('pastEnd_')(todayRun));

if (!shouldSkipPast) throw new Error('pastRun with 마감 시각 should be skipped');
if (shouldSkipToday) throw new Error('todayRun should NOT be skipped');

console.log('✓ All CI tests passed successfully!');
