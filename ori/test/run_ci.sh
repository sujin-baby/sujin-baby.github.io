#!/usr/bin/env bash
# CI 시험 모음 (test.yml, deploy.yml이 같이 씀). 실데이터 파일이 필요한 시험(chain, clean, merge, notice 등)은 여기 없음
set -euo pipefail
cd "$(dirname "$0")/../.."
M="$PWD/ori/Main.js"
echo "== 문법 검사"
node -c ori/Main.js
cp ori/Code.gs "${RUNNER_TEMP:-/tmp}/Code.js" && node -c "${RUNNER_TEMP:-/tmp}/Code.js"
for f in ori/ext/*.js ori/test/*.js; do node -c "$f"; done
echo "== Code.gs ESLint"
npx -y eslint@8.57.0 --no-eslintrc --env es2021 --parser-options ecmaVersion:2022 ori/Code.gs
echo "== 단위 시험"
export TZ=Asia/Seoul
node ori/test/ci_test.js
for t in pay selfcheck roomlink html asgclean expcount noprice zip guide_parser dashopen orphan synclist; do echo "-- $t"; node "ori/test/${t}_test.js" "$M"; done
echo "✓ 모든 시험 통과"
