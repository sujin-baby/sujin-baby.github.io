#!/usr/bin/env bash
# CI 시험 모음 (test.yml, deploy.yml이 같이 씀). 실데이터 파일이 필요한 시험(chain, clean, merge, notice 등)은 여기 없음
set -euo pipefail
cd "$(dirname "$0")/../.."
M="$PWD/ori/Main.js"
echo "== 문법 검사"
node -c ori/Main.js
cp ori/Code.gs "${RUNNER_TEMP:-/tmp}/Code.js" && node -c "${RUNNER_TEMP:-/tmp}/Code.js"
for f in ori/ext/*.js ori/test/*.js; do node -c "$f"; done
node -c teamroom/Room.js && cp teamroom/Loader.gs "${RUNNER_TEMP:-/tmp}/RoomLoader.js" && node -c "${RUNNER_TEMP:-/tmp}/RoomLoader.js" && node teamroom/room_test.js
echo "== Code.gs ESLint"
npx -y eslint@8.57.0 --no-eslintrc --env es2021 --parser-options ecmaVersion:2022 ori/Code.gs
echo "== 키워드 사전 한 곳(ori/kw_dict.json) 일치"
node ori/tools/sync_kw.js --check
echo "== 단위 시험"
export TZ=Asia/Seoul
node ori/test/ci_test.js
for t in seller coupang_here takday pay selfcheck roomlink html userscript asgclean expcount noprice zip guide_parser dashopen orphan synclist fdesc rvai rvinbox usage pricechange guide_ratio rvassign msgview editrun paynewrow roomdone paygroup reqraw rvcart formlink listgrp nagsync zipsoon takcut noticeprod carry paystatus seolren chain_sheet geochidel msgpair payrepair room20 singren storedup zeroprod zipshort rvloose today rvphoto dashstale cabletak propclean plantitle exp2tak seolresume phototab listwarn bglane cfphase safenet samereq listmine rvstuck payyield stuckdel realrow trigroom geminislow sametitle bulksent cfyield dashcut bgdue guide_rvconfirm koziren naverprod plantitle numfold dayreq morningwk kwlog obclear rvmatch toolspeed starfix renfollow bijeon salad editrefresh propsq lpdup cfurgent listgot paynote pdb10 tan41 payturn lphash rvcnt rvzipdue rvseenkeep lpfile fcheck paypost firstjson dasherrs duplast paydelbj pwmerge zrn5; do echo "-- $t"; node "ori/test/${t}_test.js" "$M"; done
echo "✓ 모든 시험 통과"
