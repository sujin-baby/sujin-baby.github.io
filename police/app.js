window.__policeErrors = [];
window.addEventListener('error', function (e) { try { window.__policeErrors.push(String(e.message)); } catch (x) {} });
window.addEventListener('unhandledrejection', function (e) { try { window.__policeErrors.push('promise:' + e.reason); } catch (x) {} });
(function () {
  'use strict';
  var D = window.POLICE_DATA;
  var SKEY = 'police-review-v2';
  var OLDKEY = 'police-review-v1';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dstr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var todayStr = function () { return dstr(new Date()); };
  var ydayStr = function () { var d = new Date(); d.setDate(d.getDate() - 1); return dstr(d); };

  /* ---------- data maps ---------- */
  var SUBJ = {}, COURSE = {};
  D.subjects.forEach(function (s) {
    SUBJ[s.id] = s;
    s.courses.forEach(function (c) { c.subj = s; COURSE[c.id] = c; });
  });
  var QBY = {};   // course -> unit -> [q]
  D.questions.forEach(function (q) {
    (QBY[q.c] = QBY[q.c] || {});
    (QBY[q.c][q.u] = QBY[q.c][q.u] || []).push(q);
  });

  /* ---------- 시험 일정 ---------- */
  var DTARGET = '2027-08-21';            // 2027년 2차 순경 필기 (예상일)
  var GTELP = '2026-11-29';              // 지텔프 Level 2 (수진 님 응시일)

  var RANKS = [
    { n: '순경', xp: 0, e: '👮' },
    { n: '경장', xp: 300, e: '🎖️' },
    { n: '경사', xp: 900, e: '🏅' },
    { n: '경위', xp: 2000, e: '🥇' },
    { n: '경감', xp: 4000, e: '⭐' },
    { n: '경정', xp: 8000, e: '🌟' },
    { n: '총경', xp: 15000, e: '💫' }
  ];
  var CHALLENGES = [
    { id: 'c10', t: '오늘 10문제 풀기', need: 10 },
    { id: 'combo', t: '5연속 정답 만들기', need: 5 },
    { id: 'xp', t: 'XP 100 모으기', need: 100 },
    { id: 'lec', t: '강의 2개 체크하기', need: 2 }
  ];

  var ROADMAP = [
    { p: '2026.09~10', t: '네친구', d: '형사법·경찰학·범죄학 기본 이론 1회독' },
    { p: '2026.11~12', t: '기출총정리 · 112특강 · 전국모의고사 / 11월 올인원', d: '기출 총정리와 올인원 이론을 병행하는 구간', now: true },
    { p: '2027.01~03', t: '진도별·동형 모의고사 · 일망타진 · 마무리', d: '1차 대비 실전 모의고사 집중' },
    { p: '2027.01~03', t: '2027 경찰 1차 시험', d: '1차 필기', exam: true },
    { p: '2027.03~04', t: '올인원 이론', d: '2차 대비 이론 재정리' },
    { p: '2027.05~06', t: '올인원 이론 · 기출OX · 전국 모의고사', d: '이론 + 기출 반복' },
    { p: '2027.07~08', t: '동형 모의고사 · 112/일망타진 · 마무리 특강', d: '2차 실전 마무리' },
    { p: '2027.08.21', t: '2027 경찰 2차 시험', d: '최종 목표', exam: true }
  ];

  /* ---------- state ---------- */
  var S = {
    xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {},
    ans: 0, ok: 0, muted: false, subj: 'crim', course: {}, qlen: 10, mix: false, days: {},
    dday: DTARGET, ddayNote: '예상일', unit: {}, gpSeeded: false, goal: { xp: 50, q: 10 }, bestCombo: 0
  };
  try {
    var raw = localStorage.getItem(SKEY);
    if (!raw) raw = localStorage.getItem(OLDKEY);       // 이전 버전 기록 이어받기
    if (raw) {
      var p = JSON.parse(raw);
      Object.keys(p).forEach(function (k) { S[k] = p[k]; });
    }
  } catch (e) {}
  if (!S.streak) S.streak = { n: 0, last: '', best: 0 };
  if (!S.course) S.course = {};
  if (!S.checked) S.checked = {};
  if (!S.wrong) S.wrong = {};
  if (!S.days) S.days = {};
  if (!S.unit) S.unit = {};
  if (!S.goal) S.goal = { xp: 50, q: 10 };
  if (!S.dday) S.dday = DTARGET;
  D.subjects.forEach(function (s) {
    if (!S.course[s.id] || !COURSE[S.course[s.id]]) S.course[s.id] = s.defaultCourse || s.courses[0].id;
  });
  if (!SUBJ[S.subj]) S.subj = 'crim';

  /* 지텔프 첫 실행: G-POINT 1~8을 '들었음'으로 미리 체크 (수진 님 현재 진도) */
  if (!S.gpSeeded) {
    S.gpSeeded = true;
    if (!S.checked['gtp33'] || !Object.keys(S.checked['gtp33']).length) {
      var seed = {};
      for (var gi = 1; gi <= 8; gi++) seed[gi] = todayStr();
      S.checked['gtp33'] = seed;
    }
  }

  function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
  function ckMap(cid) { return S.checked[cid] || (S.checked[cid] = {}); }
  function isChecked(cid, n) { return !!ckMap(cid)[n]; }
  function checkedNums(cid) { return Object.keys(ckMap(cid)).map(Number); }

  /* ---------- helpers ---------- */
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.add('hidden'); }, 2400);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function qs(pool, n) { return shuffle(pool.slice()).slice(0, n); }
  function unitIndex(cid, n) {
    var c = COURSE[cid];
    for (var i = 0; i < c.units.length; i++) if (n >= c.units[i].a && n <= c.units[i].b) return i;
    return -1;
  }
  function unitName(cid, u) { var c = COURSE[cid]; return c.units[u] ? c.units[u].n : ''; }
  function isGP(c) { return !!(c && c.kind === 'gp'); }
  function uw(c) { return (c && c.unitWord) ? ' ' + c.unitWord : '강'; }
  function fmtDateDot(s) { return s ? String(s) : ''; }
  function cafeLabel(src) {
    var m = /^cafe-(\d{2})(\d{2})$/.exec(src || '');
    if (!m) return '';
    return '켈리 카페 ' + parseInt(m[1], 10) + '/' + parseInt(m[2], 10);
  }
  function qLabel(q) {
    var s = SUBJ[q.s], c = COURSE[q.c];
    if (q.gp && c) return s.name + ' · G-POINT ' + q.gp + ' ' + (c.lec[q.gp - 1] ? c.lec[q.gp - 1].t : '');
    return s.name + ' · ' + (c.name ? c.name + ' · ' : '') + unitName(q.c, q.u);
  }
  function srcBadge(q) {
    var cafe = cafeLabel(q.src);
    if (cafe) return { k: 'cafe', t: '📘 ' + cafe };
    var c = COURSE[q.c];
    if (c && c.last && !isGP(c)) return { k: 'lec', t: '📅 최근 업로드 ' + c.last };
    return { k: 'book', t: 'G-POINT 33 교재' };
  }

  /* ---------- sound ---------- */
  var AC = null;
  function tone(f, t0, dur, type, vol) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.06, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (S.muted) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime;
      if (name === 'ok') { tone(659, t, 0.1, 'sine', 0.06); tone(988, t + 0.07, 0.14, 'sine', 0.05); }
      else if (name === 'no') { tone(220, t, 0.16, 'square', 0.045); tone(155, t + 0.11, 0.2, 'square', 0.04); }
      else if (name === 'tap') { tone(540, t, 0.05, 'sine', 0.03); }
      else if (name === 'combo') { tone(880, t, 0.07, 'triangle', 0.05); tone(1180, t + 0.06, 0.09, 'triangle', 0.045); }
      else if (name === 'combo3') { [784, 988, 1319].forEach(function (f, i) { tone(f, t + i * 0.06, 0.12, 'triangle', 0.05); }); }
      else if (name === 'combo5') { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, t + i * 0.07, 0.16, 'triangle', 0.05); }); }
      else if (name === 'crown') { [1047, 1319, 1568].forEach(function (f, i) { tone(f, t + i * 0.08, 0.22, 'sine', 0.05); }); }
      else if (name === 'level') { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, t + i * 0.075, 0.2, 'sine', 0.05); }); }
      else if (name === 'done') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.1, 0.22, 'sine', 0.055); }); }
    } catch (e) {}
  }

  /* ---------- confetti ---------- */
  var COLORS = ['#ffc24b', '#22c55e', '#5b7cfa', '#f97316', '#ec4899', '#14b8a6'];
  function confetti(n) {
    var fx = $('#fx');
    for (var i = 0; i < (n || 22); i++) {
      var el = document.createElement('i');
      el.className = 'conf';
      el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      el.style.left = (30 + Math.random() * 40) + '%';
      el.style.top = (34 + Math.random() * 12) + '%';
      fx.appendChild(el);
      var dx = (Math.random() - 0.5) * 260, dy = -60 - Math.random() * 160, rot = Math.random() * 720 - 360;
      var an = el.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + (dx * 1.4) + 'px,' + (dy + 320) + 'px) rotate(' + (rot * 2) + 'deg)', opacity: 0 }
      ], { duration: 1150 + Math.random() * 400, easing: 'cubic-bezier(.2,.6,.3,1)' });
      an.onfinish = (function (e) { return function () { e.remove(); }; })(el);
    }
  }

  /* ---------- D-Day ---------- */
  function daysTo(iso) {
    var t = new Date(iso + 'T00:00:00');
    var n = new Date(); n.setHours(0, 0, 0, 0);
    return Math.round((t - n) / 86400000);
  }
  function ddayLabel(iso) {
    var d = daysTo(iso);
    if (d > 0) return 'D-' + d;
    if (d === 0) return 'D-DAY';
    return 'D+' + (-d);
  }
  function weekday(iso) {
    return ['일', '월', '화', '수', '목', '금', '토'][new Date(iso + 'T00:00:00').getDay()];
  }
  function renderDday() {
    var iso = S.dday || DTARGET;
    $('#ddayNum').textContent = ddayLabel(iso).replace(/^D-/, '');
    $('#ddayTitle').textContent = '2027년 2차 순경 필기';
    $('#ddaySub').textContent = iso + ' (' + weekday(iso) + ') · ' + (S.ddayNote || '예상일') + ' (1월 공고 시 수정 가능)';
    var g = daysTo(GTELP);
    $('#gtChipTxt').textContent = '지텔프 ' + (g > 0 ? 'D-' + g : g === 0 ? 'D-DAY' : 'D+' + (-g));
    $('#ddayLeft').textContent = daysTo(iso) >= 0 ? daysTo(iso) + '일 남음' : Math.abs(daysTo(iso)) + '일 지남';
  }
  function openDdaySheet() {
    var iso = S.dday || DTARGET;
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">D-DAY 설정</div>' +
      '<div class="sheet-title">2027년 2차 순경 필기 날짜</div>' +
      '<div class="sheet-meta">기본값 2027-08-21은 최근 3년 2차 필기일(2024.8.17 / 2025.8.30 / 2026.8.22)이 모두 8월 토요일이었던 것을 근거로 한 <b>예상일</b>입니다. 2027년 1월 경찰청 공고가 나오면 날짜를 눌러 고쳐 주세요.</div>' +
      '<input type="date" id="ddayInput" class="date-input" value="' + iso + '">' +
      '<button class="btn primary" id="ddaySave">이 날짜로 저장</button>' +
      '<button class="btn ghost" id="ddayReset">예상일(2027-08-21)로 되돌리기</button>' +
      '<div class="sheet-note">지텔프 Level 2 응시일 2026-11-29은 고정으로 표시합니다 · ' + ddayLabel(GTELP) + '</div>';
    $('#sheet').classList.remove('hidden');
    $('#ddaySave').onclick = function () {
      var v = $('#ddayInput').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('날짜를 선택해 주세요'); return; }
      S.dday = v; S.ddayNote = v === DTARGET ? '예상일' : '직접 설정'; save(); closeSheet(); renderDday(); sfx('ok');
      toast('목표일을 ' + v + '로 바꿨어요');
    };
    $('#ddayReset').onclick = function () {
      S.dday = DTARGET; S.ddayNote = '예상일'; save(); closeSheet(); renderDday(); sfx('tap');
    };
  }

  /* ---------- 학습 계획 ---------- */
  function curStage() {
    var d = new Date();
    var key = d.getFullYear() + '.' + pad(d.getMonth() + 1);
    if (key < '2026.09') return 0;
    if (key <= '2026.12') return 1;
    if (key <= '2027.03') return 2;
    if (key <= '2027.04') return 4;
    if (key <= '2027.06') return 5;
    if (key <= '2027.08') return 6;
    return 7;
  }
  function openPlanSheet() {
    var now = curStage();
    var html = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">미래인재경찰 커리큘럼</div>' +
      '<div class="sheet-title">2027년 2차 시험까지 학습 계획</div>' +
      '<div class="sheet-meta">지금은 <b>' + ROADMAP[now].p + ' · ' + ROADMAP[now].t + '</b> 구간입니다.</div>' +
      '<div class="roadmap">';
    ROADMAP.forEach(function (r, i) {
      var cls = 'rm-item' + (i === now ? ' now' : '') + (r.exam ? ' exam' : '');
      html += '<div class="' + cls + '">' +
        '<span class="rm-dot">' + (r.exam ? '🏁' : (i < now ? '✓' : '·')) + '</span>' +
        '<div class="rm-body"><b>' + r.p + ' · ' + r.t + '</b><i>' + r.d + '</i></div>' +
        (i === now ? '<span class="rm-now">지금</span>' : '') + '</div>';
    });
    html += '</div><button class="btn primary" data-close="1">확인</button>';
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
  }

  /* ---------- header / tabs ---------- */
  function applyTheme() {
    var s = SUBJ[S.subj];
    document.documentElement.style.setProperty('--c', s.color);
    document.documentElement.style.setProperty('--c-soft', s.accent);
    document.documentElement.style.setProperty('--c-dark', shade(s.color, -0.22));
  }
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var f = function (v) { v = Math.round(v + 255 * amt); return Math.max(0, Math.min(255, v)); };
    return '#' + [f(r), f(g), f(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function rankOf(xp) {
    var r = RANKS[0], i = 0;
    for (var k = 0; k < RANKS.length; k++) if (xp >= RANKS[k].xp) { r = RANKS[k]; i = k; }
    return { r: r, i: i, next: RANKS[i + 1] || null };
  }
  function renderHud() {
    $('#streakN').textContent = S.streak.n || 0;
    $('#xpN').textContent = S.xp || 0;
    $('#mute').textContent = S.muted ? '🔇' : '🔊';
    var rk = rankOf(S.xp || 0);
    $('#rankBadge').innerHTML = '<span>' + rk.r.e + '</span>' + rk.r.n;
    $('#rankBadge').title = rk.next ? (rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' XP') : '최고 계급';
  }
  function checkPromotion() {
    var now = rankOf(S.xp || 0);
    if (S.rankIdx === undefined) { S.rankIdx = now.i; return; }
    if (now.i > S.rankIdx) {
      S.rankIdx = now.i; save();
      sfx('level'); confetti(80);
      openRankSheet(now.r, true);
    } else if (now.i < S.rankIdx) { S.rankIdx = now.i; save(); }
  }
  function openRankSheet(rank, promoted) {
    var rk = rankOf(S.xp || 0);
    var html = '<button class="sheet-close" data-close="1">✕</button>' ;
    if (promoted) {
      html += '<div class="promo"><div class="promo-emoji">' + rank.e + '</div>' +
        '<h2>' + rank.n + ' 승진!</h2><p>축하합니다! XP ' + (S.xp || 0) + '로 <b>' + rank.n + '</b>이 되었어요.</p></div>';
    } else {
      html += '<div class="sheet-num">나의 계급</div><div class="sheet-title">' + rk.r.e + ' ' + rk.r.n + '</div>' +
        '<div class="sheet-meta">XP ' + (S.xp || 0) + (rk.next ? ' · 다음 계급 ' + rk.next.n + '까지 ' + (rk.next.xp - (S.xp || 0)) + ' XP' : ' · 최고 계급') + '</div>';
    }
    html += '<div class="rank-list">';
    RANKS.forEach(function (r, i) {
      var cls = 'rank-item' + (i <= rk.i ? ' got' : '');
      html += '<div class="' + cls + '"><span>' + r.e + '</span><b>' + r.n + '</b><i>' + r.xp + ' XP</i></div>';
    });
    html += '</div><button class="btn primary" data-close="1">확인</button>';
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
  }
  function renderSubtabs() {
    var el = $('#subtabs'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'stab' + (s.id === S.subj ? ' on' : '');
      if (s.id === S.subj) b.style.background = s.color;
      b.setAttribute('data-sub', s.id);
      b.innerHTML = '<b>' + s.emoji + ' ' + s.name + '</b><i>' + s.teacher + '</i>';
      b.onclick = function () {
        if (S.subj === s.id) return;
        S.subj = s.id; save(); sfx('tap');
        renderAll(); window.scrollTo({ top: 0, behavior: 'smooth' });
      };
      el.appendChild(b);
    });
  }

  /* ---------- 오늘의 목표 ---------- */
  function dayRec() {
    var t = todayStr();
    if (!S.days[t]) S.days[t] = { xp: 0, ans: 0, ok: 0 };
    return S.days[t];
  }
  function todayLectures(cid) {
    var m = ckMap(cid), t = todayStr(), out = [];
    Object.keys(m).forEach(function (n) { if (m[n] === t) out.push(Number(n)); });
    return out.sort(function (a, b) { return a - b; });
  }
  function todayLectureCount() {
    var n = 0;
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) { n += todayLectures(c.id).length; });
    });
    return n;
  }
  function renderQuest() {
    var d = dayRec();
    var pctXp = Math.min(100, Math.round((d.xp || 0) / S.goal.xp * 100));
    var pctQ = Math.min(100, Math.round((d.ans || 0) / S.goal.q * 100));
    $('#goalXpBar').style.width = pctXp + '%';
    $('#goalQBar').style.width = pctQ + '%';
    $('#goalXpTxt').textContent = (d.xp || 0) + ' / ' + S.goal.xp + ' XP';
    $('#goalQTxt').textContent = (d.ans || 0) + ' / ' + S.goal.q + '문제';
    var lecN = todayLectureCount();
    $('#goalLecTxt').textContent = lecN + ' / 1강';
    $('#questLec').classList.toggle('done', lecN >= 1);
    $('#questXp').classList.toggle('done', (d.xp || 0) >= S.goal.xp);
    $('#questQ').classList.toggle('done', (d.ans || 0) >= S.goal.q);
    var all = lecN >= 1 && (d.xp || 0) >= S.goal.xp && (d.ans || 0) >= S.goal.q;
    var done = [lecN >= 1, (d.xp || 0) >= S.goal.xp, (d.ans || 0) >= S.goal.q].filter(Boolean).length;
    $('#questPct').textContent = done + '/3 완료';
    $('#questCard').classList.toggle('all-done', all);
  }

  /* ---------- 오늘의 챌린지 ---------- */
  function todayChallenges() {
    var d = new Date();
    var seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
    var a = CHALLENGES[seed % CHALLENGES.length];
    var b = CHALLENGES[(seed + 2) % CHALLENGES.length];
    if (b.id === a.id) b = CHALLENGES[(seed + 1) % CHALLENGES.length];
    return [a, b];
  }
  function challengeProgress(c) {
    var day = dayRec();
    if (c.id === 'c10') return { v: day.ans || 0, n: c.need };
    if (c.id === 'combo') return { v: Math.max(S.bestCombo || 0, (typeof QS !== 'undefined' && QS ? QS.maxCombo : 0)), n: c.need };
    if (c.id === 'xp') return { v: day.xp || 0, n: c.need };
    if (c.id === 'lec') return { v: todayLectureCount(), n: c.need };
    return { v: 0, n: 1 };
  }
  function renderChallenges() {
    var el = $('#challengeList');
    if (!el) return;
    var ch = todayChallenges(), html = '';
    ch.forEach(function (c) {
      var p = challengeProgress(c);
      var done = p.v >= p.n;
      html += '<div class="ch-item' + (done ? ' done' : '') + '"><span class="ch-ico">' + (done ? '✅' : '🎯') + '</span>' +
        '<span class="ch-t">' + c.t + '</span>' +
        '<span class="ch-n">' + Math.min(p.v, p.n) + '/' + p.n + '</span></div>';
    });
    el.innerHTML = html;
  }
  function passGauge() {
    var acc = S.ans ? S.ok / S.ans : 0;
    var gtelpAns = 0, gtelpOk = 0;
    Object.keys(S.unit).forEach(function (k) { });
    // 지텔프 문법 정답률 → 26문항 환산 (문법 몰빵 전략)
    var gt = S.ans ? Math.round(acc * 26) : 0;
    var score = Math.round(26 * 100 * acc / 26);
    var band = acc >= 0.9 ? '안정권' : acc >= 0.8 ? '합격선 근접' : acc >= 0.65 ? '조금 더' : '기초 다지기';
    return { acc: Math.round(acc * 100), gt: gt, band: band, ans: S.ans || 0 };
  }
  function renderPass() {
    var p = passGauge();
    $('#passBar').style.width = Math.min(100, p.acc) + '%';
    $('#passPct').textContent = p.ans ? p.acc + '%' : '-';
    $('#passTxt').textContent = p.ans < 10 ? '문제를 10개 이상 풀면 예측이 정확해져요' : '문법 26문항 기준 ' + p.gt + '/26 · ' + p.band;
    $('#passNeed').textContent = p.ans ? (p.gt >= 22 ? '목표 22문항 달성!' : '목표 22문항까지 ' + (22 - p.gt) + '문항') : '목표: 문법 22/26';
  }

  /* ---------- mascot ---------- */
  function renderMascot() {
    var d = dayRec();
    var left = Math.max(0, S.goal.q - (d.ans || 0));
    var msg;
    if ((d.ans || 0) >= S.goal.q && (d.xp || 0) >= S.goal.xp) msg = '오늘 목표 완료! 이대로만 가자 🎉';
    else if (!(d.ans || 0)) msg = '오늘 목표는 ' + S.goal.q + '문제 · ' + S.goal.xp + ' XP야. 가볍게 시작해 볼까?';
    else msg = '목표까지 ' + left + '문제 남았어. 콤보 이어가면 보너스 XP도 쌓여!';
    $('#homeBubble').textContent = msg;
  }

  /* ---------- stage ---------- */
  function curCourse() { return COURSE[S.course[S.subj]]; }

  function latestLectures(cid) {
    var m = ckMap(cid), best = '', nums = [];
    Object.keys(m).forEach(function (n) { if (m[n] > best) best = m[n]; });
    if (!best) return { date: '', nums: [] };
    Object.keys(m).forEach(function (n) { if (m[n] === best) nums.push(Number(n)); });
    return { date: best, nums: nums.sort(function (a, b) { return a - b; }) };
  }

  var lastCourse = '';
  function renderStage() {
    var s = SUBJ[S.subj], c = curCourse();
    if (!c) return;
    if (lastCourse !== c.id) { lastCourse = c.id; $('#path')._scrolled = false; }
    var gp = isGP(c);
    $('#heroSub').textContent = s.subLabel || (s.name + ' · ' + s.teacher + ' 교수');
    $('#heroName').textContent = c.name;
    var done = checkedNums(c.id).length;
    $('#progBar').style.width = Math.min(100, (done / c.total) * 100) + '%';
    var tL = todayLectures(c.id);
    $('#progTxt').textContent = done + ' / ' + c.total + uw(c);
    // 강좌 메타 (개강일 · 최근 업로드 · 업로드된 회차)
    var meta = [];
    if (c.open) meta.push('개강 ' + c.open);
    if (c.last) meta.push('최근 업로드 ' + c.last);
    if (!gp) meta.push('업로드 ' + c.lec.filter(function (L) { return L.up; }).length + '/' + c.total + '강');
    $('#heroMeta').textContent = meta.join(' · ');
    var note = '';
    var btn = $('#ctaToday');
    if (done === 0) {
      btn.textContent = gp ? '먼저 G-POINT를 체크해 주세요' : '먼저 강의를 체크해 주세요';
      btn.onclick = function () { openSheet(c.id, nextLecture(c.id)); };
      note = gp ? '아래 노드를 눌러 들은 G-POINT를 체크하면 그 포인트 문제가 열립니다.'
                : '아래 노드를 눌러 오늘 들은 강의를 체크하면 그 강의 문제가 열립니다.';
    } else if (tL.length) {
      btn.textContent = '오늘 체크한 ' + tL.length + uw(c) + ' 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘 체크한 ' + fmtNums(tL, c) + '에서 문제가 나옵니다.';
    } else {
      var lt = latestLectures(c.id);
      btn.textContent = '최근 체크한 ' + (gp ? 'G-POINT' : '강의') + ' 문제 풀기';
      btn.onclick = function () { startSession('today'); };
      note = '오늘은 아직 체크한 ' + (gp ? '포인트' : '강의') + '가 없어 ' + lt.date.slice(5).replace('-', '/') + '에 체크한 ' + fmtNums(lt.nums, c) + '(으)로 복습합니다.';
    }
    $('#heroNote').textContent = note;
    $('#ctaAll').onclick = function () { startSession('all'); };
    $('#ctaWrong').onclick = function () { startSession('wrong'); };
    $('#courseBtn').onclick = openCourseSheet;
    renderPath(c);
  }
  function fmtNums(a, c) {
    if (!a.length) return '';
    var gp = isGP(c);
    if (a.length <= 3) return (gp ? 'G-POINT ' : '') + a.join('·') + (gp ? '' : '강');
    return gp ? ('G-POINT ' + a[0] + ' 외 ' + (a.length - 1) + '개') : (a[0] + '강 외 ' + (a.length - 1) + '강');
  }
  function nextLecture(cid) {
    var m = ckMap(cid);
    for (var i = 1; i <= COURSE[cid].total; i++) if (!m[i]) return i;
    return COURSE[cid].total;
  }
  function nodePool(cid, n) { return poolForLecture(cid, n); }
  function isMastered(cid, n) {
    if (!isChecked(cid, n)) return false;
    var pool = nodePool(cid, n);
    if (!pool.length) return false;
    for (var i = 0; i < pool.length; i++) if (S.wrong[pool[i].i]) return false;
    return true;
  }

  function renderPath(c) {
    var path = $('#path'); path.innerHTML = '';
    var wrap = path.parentElement;
    var W = wrap.clientWidth || 360;
    var gp = isGP(c), today = todayStr(), doneSet = ckMap(c.id);
    var cur = nextLecture(c.id);
    var list = [], y = 46, lastU = -2;
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      if (ui !== lastU) { list.push({ kind: 'banner', ui: ui, y: y }); y += 44; lastU = ui; }
      list.push({ kind: 'node', L: L, y: y });
      y += 90;
    });
    var H = y + 30;
    path.style.height = H + 'px';
    var pts = [], unitCount = {};
    c.lec.forEach(function (L) {
      var ui = unitIndex(c.id, L.n);
      unitCount[ui] = (unitCount[ui] || 0) + 1;
    });
    list.forEach(function (it) {
      if (it.kind === 'banner') {
        var u = c.units[it.ui];
        if (!u) return;
        var nums = [];
        c.lec.forEach(function (L) { if (L.n >= u.a && L.n <= u.b) nums.push(L.n); });
        var doneN = nums.filter(function (n) { return doneSet[n]; }).length;
        var el = document.createElement('div');
        el.className = 'unit-banner';
        el.style.top = (it.y - 20) + 'px';
        el.style.background = 'linear-gradient(100deg,' + shade(SUBJ[S.subj].color, 0.12) + ',' + SUBJ[S.subj].accent + ')';
        el.style.color = shade(SUBJ[S.subj].color, -0.35);
        el.innerHTML = '<span class="ub-n">UNIT ' + (it.ui + 1) + '</span>' +
          '<span class="ub-t">' + esc(u.n) + '</span>' +
          '<span class="ub-p">' + (gp ? 'G-POINT ' + u.a + (u.b !== u.a ? '~' + u.b : '') : u.a + '~' + u.b + '강') +
          ' · ' + doneN + '/' + nums.length + '</span>';
        path.appendChild(el);
        return;
      }
      var L = it.L;
      var x = W / 2 + Math.sin(it.y * 0.0125) * (W * 0.27);
      var w = document.createElement('div');
      w.className = 'node-wrap';
      w.style.left = x + 'px'; w.style.top = it.y + 'px';
      var b = document.createElement('button');
      var cls = 'node';
      if (doneSet[L.n]) cls += ' done';
      else if (L.n === cur) cls += ' current';
      if (!L.up) cls += ' plan';
      if (doneSet[L.n] === today) cls += ' today';
      if (isMastered(c.id, L.n)) cls += ' master';
      b.className = cls;
      var inner = '<span class="num">' + L.n + '</span>';
      if (isMastered(c.id, L.n)) inner += '<span class="crown">👑</span>';
      b.innerHTML = inner;
      b.setAttribute('aria-label', (gp ? 'G-POINT ' + L.n : L.n + '강') + (L.d ? ' · ' + L.d + ' 업로드' : ''));
      b.onclick = function () { sfx('tap'); openSheet(c.id, L.n); };
      w.appendChild(b);
      if (L.n === cur) {
        var tg = document.createElement('span'); tg.className = 'node-tag'; tg.textContent = '여기서부터';
        w.appendChild(tg);
      } else if (L.n === 1) {
        var t2 = document.createElement('span'); t2.className = 'node-tag gold'; t2.textContent = 'START';
        w.appendChild(t2);
      }
      if (L.d) {
        var dd = document.createElement('span'); dd.className = 'node-date'; dd.textContent = L.d;
        w.appendChild(dd);
      }
      path.appendChild(w);
      // 이전 노드와 연결
      pts.push([x, it.y]);
    });
    // 연결선
    var svg = $('#pathSvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    if (pts.length) {
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      var lastDone = -1;
      c.lec.forEach(function (L, i) { if (doneSet[L.n]) lastDone = i; });
      var dDone = '';
      if (lastDone > 0) {
        dDone = pts.slice(0, lastDone + 1).map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
      }
      svg.innerHTML = '<path d="' + d + '" fill="none" stroke="#dfe5f0" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 13"/>' +
        (dDone ? '<path d="' + dDone + '" fill="none" stroke="' + SUBJ[S.subj].color + '" stroke-width="7" stroke-linecap="round" stroke-opacity=".5"/>' : '');
    }
    if (!path._scrolled) {
      path._scrolled = true;
      var target = 46 + (Math.min(cur, c.lec.length) - 1) * 90 - (window.innerHeight * 0.45);
      setTimeout(function () { window.scrollTo({ top: Math.max(0, target), behavior: 'auto' }); }, 60);
    }
  }

  /* ---------- sheet ---------- */
  function closeSheet() { $('#sheet').classList.add('hidden'); }
  function closeSheetIfBg(e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-close')) closeSheet();
  }
  function openSheet(cid, n) {
    var c = COURSE[cid], L = c.lec[n - 1];
    if (!L) return;
    var on = isChecked(cid, n);
    var pool = poolForLecture(cid, n);
    var gp = isGP(c), what = gp ? '이 포인트 문제' : '이 단원 문제';
    var st = pool.length ? '<span class="pill">' + what + ' ' + pool.length + '개</span>' : '<span class="pill plan">' + what + ' 준비 중</span>';
    var isCur = n === nextLecture(cid);
    var datePill = L.d ? '<span class="pill date">📅 ' + L.d + ' 업로드</span>' : '';
    if (gp) {
      var cnt = pool.length;
      datePill = '<span class="pill date">📘 교재 G-POINT ' + n + '</span>' + (cnt ? '<span class="pill">문제 ' + cnt + '개</span>' : '');
    }
    $('#sheetIn').innerHTML =
      '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">' + (gp ? SUBJ[c.sub].name + ' · G-POINT ' + n : c.name + ' · ' + n + '강') + (L.up ? '' : ' <span class="pill plan">업로드 예정</span>') + (on ? ' <span class="pill done">체크됨</span>' : '') + '</div>' +
      '<div class="sheet-title">' + (gp ? 'G-POINT ' + n + (L.t ? ' · ' + esc(L.t) : '') : (L.t ? esc(L.t) : '아직 제목이 공개되지 않은 회차예요')) + '</div>' +
      '<div class="sheet-meta">' + (unitOf(cid, n) ? esc(unitOf(cid, n)) + ' · ' : '') + datePill + ' ' + st + '</div>' +
      (posOf(cid, n) ? '<div class="sheet-pos">' + posOf(cid, n) + '</div>' : '') +
      '<button class="btn ' + (on ? 'ghost' : 'primary') + '" id="shToggle">' + (on ? '체크 해제' : (gp ? '이 G-POINT 들었어요 ✓' : '이 강의 들었어요 ✓')) + '</button>' +
      '<button class="btn ghost" id="shQuiz" ' + (on && pool.length ? '' : 'disabled style="opacity:.45"') + '>' + what + ' 풀기</button>' +
      (isCur ? '<button class="btn ghost" id="shNext">다음 ' + (gp ? 'G-POINT' : '강의') + ' 보기 →</button>' : '');
    $('#sheet').classList.remove('hidden');
    $('#shToggle').onclick = function () {
      var nm = gp ? 'G-POINT ' + n : n + '강';
      if (isChecked(cid, n)) { delete ckMap(cid)[n]; toast(nm + ' 체크를 해제했어요'); }
      else {
        ckMap(cid)[n] = todayStr(); touchDay(); toast(nm + ' 체크! 오늘의 복습에 들어갑니다'); sfx('ok');
        if (isMastered(cid, n)) { sfx('crown'); }
      }
      save(); closeSheet(); renderAll();
    };
    var qb = $('#shQuiz');
    if (qb) qb.onclick = function () { closeSheet(); startSession('lecture', { cid: cid, n: n }); };
    var nb = $('#shNext');
    if (nb) nb.onclick = function () { openSheet(cid, Math.min(c.total, n + 1)); };
  }
  function posOf(cid, n) {
    var c = COURSE[cid];
    if (!c.open || !c.dates) return '';
    return '';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function unitOf(cid, n) {
    var c = COURSE[cid], i = unitIndex(cid, n);
    return i >= 0 ? c.units[i].n : '';
  }
  function openCourseSheet() {
    var s = SUBJ[S.subj];
    var html = '<button class="sheet-close" data-close="1">✕</button>' +
      '<div class="sheet-num">' + (s.subLabel || s.name + ' · ' + s.teacher + ' 교수') + '</div>' +
      '<div class="sheet-title">강좌 선택 <span class="pill">' + s.courses.length + '개</span></div>' +
      '<div class="sheet-meta">2026년 개설 강좌를 최신순으로 모았어요. 지금 듣는 강좌를 고르면 진도가 그 강좌 기준으로 쌓입니다.</div>' +
      '<div class="course-list">';
    s.courses.forEach(function (c) {
      var d = checkedNums(c.id).length;
      var upN = c.lec.filter(function (L) { return L.up; }).length;
      var on = S.course[s.id] === c.id;
      var mt = /^\[([^\]]+)\]\s*(.*)$/.exec(c.name);
      var tag = mt ? mt[1] : '';
      var nm = (mt ? mt[2] : c.name).replace(/\s*\(26년\s*\d{1,2}월\)/, '');
      html += '<button class="course-item' + (on ? ' on' : '') + '" data-c="' + c.id + '">' +
        '<span class="ci-top"><b class="ci-mon">' + (c.mon || '') + '</b>' +
        '<b class="ci-name">' + esc(nm) + '</b>' +
        (on ? '<span class="ci-on">선택</span>' : '') + '</span>' +
        '<span class="ci-meta">' + (tag ? '<b class="ci-tag">' + esc(tag) + '</b> · ' : '') +
        (upN ? '업로드 ' + upN + '/' + c.total + uw(c) : '아직 업로드 전') +
        (c.last ? ' · 최근 ' + c.last : '') + (d ? ' · 내 진도 ' + d + uw(c) : '') + '</span>' +
        '</button>';
    });
    html += '</div>';
    $('#sheetIn').innerHTML = html;
    $('#sheet').classList.remove('hidden');
    $$('#sheetIn [data-c]').forEach(function (b) {
      b.onclick = function () {
        S.course[s.id] = b.getAttribute('data-c');
        $('#path')._scrolled = false; save(); closeSheet(); renderAll(); sfx('tap');
      };
    });
  }

  /* ---------- pools ---------- */
  function unitBanks(cid, ui) {
    var c = COURSE[cid], u = c.units[ui];
    if (!u) return [];
    return u.bs || [[cid, ui]];
  }
  function poolForUnit(cid, ui) {
    var out = [];
    unitBanks(cid, ui).forEach(function (b) {
      var arr = (QBY[b[0]] || {})[b[1]];
      if (arr) out = out.concat(arr);
    });
    return out;
  }
  function poolForLecture(cid, n) {
    var c = COURSE[cid], out = [], m = QBY[cid] || {};
    // 지텔프 G-POINT: 포인트 번호가 곧 문제 묶음
    Object.keys(m).forEach(function (u) {
      m[u].forEach(function (q) { if (q.gp === n) out.push(q); });
    });
    if (out.length) return out;
    var ui = unitIndex(cid, n);
    if (ui < 0) return out;
    // 그 강의가 속한 단원의 문제 (강좌별 단원 구간이 회차 기준으로 나뉘어 있어도 문제은행은 기준 강좌에서 가져온다)
    return poolForUnit(cid, ui);
  }
  function poolForCourse(cid, nums) {
    var c = COURSE[cid], out = [];
    if (!nums.length) return out;
    if (isGP(c)) {
      Object.keys(QBY[cid] || {}).forEach(function (u) {
        QBY[cid][u].forEach(function (q) { if (q.gp && nums.indexOf(q.gp) >= 0) out.push(q); });
      });
      return out;
    }
    c.units.forEach(function (u, i) {
      var hit = nums.some(function (n) { return n >= u.a && n <= u.b; });
      if (hit) out = out.concat(poolForUnit(cid, i));
    });
    return out;
  }
  function poolForSubject(subjId, numsFilter) {
    var s = SUBJ[subjId], out = [];
    s.courses.forEach(function (c) {
      var nums = checkedNums(c.id);
      if (numsFilter === 'today') {
        var m = ckMap(c.id), t = todayStr();
        nums = Object.keys(m).filter(function (n) { return m[n] === t; }).map(Number);
        if (!nums.length) {
          var lt = latestLectures(c.id);
          nums = lt.nums;
        }
      }
      out = out.concat(poolForCourse(c.id, nums));
    });
    return out;
  }
  function poolWrong() {
    var ids = Object.keys(S.wrong);
    return D.questions.filter(function (q) {
      if (!ids.length) return false;
      if (!S.wrong[q.i]) return false;
      if (S.mix) return true;
      return q.s === S.subj;
    });
  }

  /* ---------- review view ---------- */
  function renderReview() {
    var c = curCourse(), s = SUBJ[S.subj];
    var tN = todayLectures(c.id).length;
    var allN = checkedNums(c.id).length;
    var wrongN = D.questions.filter(function (q) { return S.wrong[q.i] && (S.mix || q.s === S.subj); }).length;
    $('#reviewSub').textContent = (S.mix ? '전체 과목' : s.name) + ' · ' + (isGP(c) ? '체크한 G-POINT에서만' : '들은 강의에서만') + ' 문제가 나옵니다.';
    var mt = $('#mToday b'); if (mt) mt.textContent = isGP(c) ? '오늘 체크한 G-POINT' : '오늘 들은 강의';
    $('#mTodayTxt').textContent = tN ? (isGP(c) ? tN + uw(c) : '오늘 체크한 ' + tN + uw(c)) : (isGP(c) ? 'G-POINT 없음 (최근 것으로)' : '오늘 체크한 강의 없음 (최근 것으로)');
    $('#mAllTxt').textContent = '지금까지 체크한 ' + allN + uw(c) + ' 누적';
    $('#mWrongTxt').textContent = wrongN ? wrongN + '문제 대기' : '오답 없음';
    $$('#lenChips .chip').forEach(function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-len')) === S.qlen);
    });
    $('#mixAll').checked = !!S.mix;
  }

  /* ---------- stats ---------- */
  function weakUnits() {
    var arr = [];
    Object.keys(S.unit).forEach(function (k) {
      var v = S.unit[k];
      if (!v || v.a < 3) return;
      var parts = k.split(':'), cid = parts[0], ui = Number(parts[1]);
      var c = COURSE[cid];
      if (!c || !c.units[ui]) return;
      arr.push({ k: k, cid: cid, ui: ui, acc: v.ok / v.a, a: v.a, name: SUBJ[c.sub].name + ' · ' + c.units[ui].n });
    });
    arr.sort(function (x, y) { return x.acc - y.acc; });
    return arr.slice(0, 3);
  }
  function renderStats() {
    $('#stStreak').textContent = S.streak.n || 0;
    $('#stXp').textContent = S.xp || 0;
    $('#stAcc').textContent = S.ans ? Math.round((S.ok / S.ans) * 100) + '%' : '-';
    $('#stAns').textContent = S.ans || 0;
    $('#stToday').textContent = todayLectureCount();
    var el = $('#stProg'); el.innerHTML = '';
    D.subjects.forEach(function (s) {
      s.courses.forEach(function (c) {
        var d = checkedNums(c.id).length;
        if (!d && s.courses.length > 1 && S.course[s.id] !== c.id) return;
        var w = document.createElement('div');
        w.className = 'prog-item';
        w.innerHTML = '<div class="pi-top"><span>' + s.emoji + ' ' + s.name + ' · ' + esc(c.name) + '</span><i>' + d + '/' + c.total + uw(c) + '</i></div>' +
          '<div class="bar"><i style="width:' + Math.min(100, d / c.total * 100) + '%;background:' + s.color + '"></i></div>' +
          (c.last ? '<div class="pi-sub">최근 업로드 ' + c.last + (c.open ? ' · 개강 ' + c.open : '') + '</div>' : '');
        el.appendChild(w);
      });
    });
    if (!el.children.length) el.innerHTML = '<div class="empty">아직 체크한 강의가 없어요.</div>';
    // 약점 단원
    var wk = $('#stWeak'); wk.innerHTML = '';
    var ws = weakUnits();
    if (!ws.length) wk.innerHTML = '<div class="empty">문제를 3개 이상 풀면 약한 단원이 여기 표시돼요.</div>';
    ws.forEach(function (w) {
      var d = document.createElement('div');
      d.className = 'weak-item';
      d.innerHTML = '<span class="wk-name">' + esc(w.name) + '</span><span class="wk-bar"><i style="width:' + Math.round(w.acc * 100) + '%"></i></span><b>' + Math.round(w.acc * 100) + '%</b><i class="wk-n">' + w.a + '문제</i>';
      wk.appendChild(d);
    });
    // 오답노트
    var wl = $('#stWrong'); wl.innerHTML = '';
    var arr = D.questions.filter(function (q) { return S.wrong[q.i]; })
      .sort(function (a, b) { return ((S.wrong[b.i] || {}).c || 1) - ((S.wrong[a.i] || {}).c || 1); });
    if (!arr.length) wl.innerHTML = '<div class="empty">틀린 문제가 여기에 쌓입니다. 맞히면 자동으로 지워져요.</div>';
    arr.slice(0, 40).forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'wrong-item';
      d.innerHTML = '<span class="wi-tag">' + esc(qLabel(q)) + ' · ' + (S.wrong[q.i].c || 1) + '번 틀림</span>' +
        esc(q.q) + '<div class="wi-e">정답: ' + esc(q.o[q.a]) + '<br>' + esc(q.e) + '</div>';
      wl.appendChild(d);
    });
    var nW = D.questions.filter(function (q) { return S.wrong[q.i]; }).length;
    $('#stWrongGo').classList.toggle('hidden', !nW);
    $('#stWrongGo').textContent = '🩹 오답 ' + nW + '문제 바로 복습';
  }

  /* ---------- quiz ---------- */
  var QS = null;
  function startSession(mode, opt) {
    opt = opt || {};
    var pool = [], title = '';
    if (mode === 'lecture') {
      pool = poolForLecture(opt.cid, opt.n);
      title = COURSE[opt.cid].name + ' ' + opt.n + (isGP(COURSE[opt.cid]) ? ' 포인트' : '강');
    } else if (mode === 'ids') {
      pool = D.questions.filter(function (q) { return opt.ids.indexOf(q.i) >= 0; });
      title = opt.title || '틀린 문제 다시 풀기';
    } else if (mode === 'wrong') {
      pool = poolWrong();
      title = '오답 집중 복습';
    } else {
      pool = S.mix ? D.subjects.reduce(function (a, s) { return a.concat(poolForSubject(s.id, mode)); }, []) : poolForSubject(S.subj, mode);
      title = mode === 'today' ? '오늘 들은 강의' : '누적 랜덤 복습';
    }
    if (!pool.length) {
      if (mode === 'wrong') toast('아직 오답이 없어요. 먼저 문제를 풀어 주세요.');
      else if (mode === 'lecture') toast('이 강의 문제가 아직 없어요. 다른 강의를 체크해 보세요.');
      else if (mode === 'ids') toast('다시 풀 문제가 없어요.');
      else toast('먼저 스테이지에서 들은 강의를 체크해 주세요.');
      return;
    }
    var n = mode === 'lecture' ? Math.min(pool.length, 6) : Math.min(pool.length, S.qlen);
    if (mode === 'ids') n = Math.min(pool.length, 20);
    var items = qs(pool, n).map(function (q) {
      var order = [0, 1, 2, 3];
      shuffle(order);
      return { q: q, order: order };
    });
    QS = { items: items, i: 0, ok: 0, combo: 0, maxCombo: 0, xp: 0, mode: mode, title: title, locked: false, sel: -1, opt: opt, wrongIds: [] };
    document.body.style.overflow = 'hidden';
    $('#quiz').classList.remove('hidden');
    $('#qCombo').textContent = '🔥 0';
    $('#qTitle').textContent = title;
    renderQ();
  }

  function renderQ() {
    var it = QS.items[QS.i], q = it.q;
    QS.locked = false; QS.sel = -1;
    $('#qBar').style.width = (QS.i / QS.items.length * 100) + '%';
    $('#qCount').textContent = (QS.i + 1) + '/' + QS.items.length;
    var tag = qLabel(q);
    var badge = srcBadge(q);
    var keys = ['A', 'B', 'C', 'D'];
    var h = '<div class="q-tags"><span class="q-tag">' + esc(tag) + '</span><span class="q-src ' + badge.k + '">' + esc(badge.t) + '</span></div>' +
      '<h2 class="q-text">' + esc(q.q) + '</h2><div class="opts">';
    it.order.forEach(function (oi, idx) {
      h += '<button class="opt" data-i="' + oi + '"><span class="k">' + keys[idx] + '</span><span>' + esc(q.o[oi]) + '</span></button>';
    });
    h += '</div>';
    $('#qBody').innerHTML = h;
    $('#qBody').scrollTop = 0;
    $('#qFb').classList.add('hidden');
    $$('#qBody .opt').forEach(function (b) {
      b.onclick = function () { answer(Number(b.getAttribute('data-i')), b); };
    });
  }

  function comboBanner(txt, big) {
    var el = $('#comboBanner');
    el.textContent = txt;
    el.className = 'combo-banner' + (big ? ' big' : '');
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(el._h);
    el._h = setTimeout(function () { el.classList.add('hidden'); }, 1400);
  }

  function answer(oi, btn) {
    if (QS.locked) return;
    QS.locked = true;
    var it = QS.items[QS.i], q = it.q;
    var right = oi === q.a;
    $$('#qBody .opt').forEach(function (b) {
      var i = Number(b.getAttribute('data-i'));
      b.disabled = true;
      if (i === q.a) b.classList.add('ok');
    });
    if (!right) btn.classList.add('no');
    var day = dayRec();
    S.ans++; day.ans = (day.ans || 0) + 1;
    // 단원별 정답 집계
    var uk = q.c + ':' + q.u;
    var u = S.unit[uk] || (S.unit[uk] = { a: 0, ok: 0 });
    u.a++;
    if (right) {
      S.ok++; day.ok = (day.ok || 0) + 1; u.ok++;
      QS.ok++; QS.combo++; QS.maxCombo = Math.max(QS.maxCombo, QS.combo);
      var gain = 10 + Math.min(10, (QS.combo - 1) * 2);
      var bonus = 0;
      if (QS.combo === 2) bonus = 2;
      else if (QS.combo === 3) bonus = 5;
      else if (QS.combo === 5) bonus = 10;
      else if (QS.combo > 5 && QS.combo % 5 === 0) bonus = 10;
      var total = gain + bonus;
      QS.xp += total; S.xp += total; day.xp = (day.xp || 0) + total;
      delete S.wrong[q.i];
      $('#qCombo').textContent = '🔥 ' + QS.combo;
      if (QS.combo > 1) { $('#qCombo').classList.add('hot'); setTimeout(function () { $('#qCombo').classList.remove('hot'); }, 320); }
      sfx(bonus >= 10 ? 'combo5' : bonus >= 5 ? 'combo3' : QS.combo > 1 ? 'combo' : 'ok');
      if (bonus) comboBanner(QS.combo + '연속 정답! +' + bonus + ' XP', QS.combo >= 5);
      confetti(bonus ? 34 : 22);
      fb(true, q, total, bonus);
      var mk = isMastered(q.c, q.gp || 0);
      if (mk && bonus) sfx('crown');
    } else {
      QS.combo = 0;
      QS.xp += 3; S.xp += 3; day.xp = (day.xp || 0) + 3;
      var w = S.wrong[q.i] || { c: 0 };
      S.wrong[q.i] = { c: (w.c || 0) + 1, d: todayStr() };
      if (QS.wrongIds.indexOf(q.i) < 0) QS.wrongIds.push(q.i);
      $('#qCombo').textContent = '🔥 0';
      sfx('no');
      var qb = $('#quiz'); qb.classList.add('shake'); setTimeout(function () { qb.classList.remove('shake'); }, 320);
      fb(false, q, 3, 0);
    }
    touchStreak();
    QS.best = Math.max(QS.best || 0, QS.combo);
    if (QS.combo > (S.bestCombo || 0)) { S.bestCombo = QS.combo; }
    save();
    renderHud(); renderQuest(); renderMascot(); renderChallenges();
    checkPromotion();
  }

  function fb(ok, q, gain, bonus) {
    var el = $('#qFb');
    el.classList.remove('hidden', 'ok', 'no');
    el.classList.add(ok ? 'ok' : 'no');
    el.querySelector('.fb-head').innerHTML = '<img class="fb-mascot" src="assets/' + (ok ? 'mascot-happy.png' : 'mascot-happy.png') + '" alt="">' +
      '<span>' + (ok ? '정답이에요!' + (bonus ? ' 콤보 보너스 🎉' : ' 🎉') : '아쉬워요 😢') + '</span>' +
      '<span class="fb-xp">+' + gain + ' XP</span>';
    el.querySelector('.fb-text').innerHTML = '<b>해설</b> · ' + esc(q.e);
    var b = $('#fbNext');
    b.textContent = QS.i + 1 >= QS.items.length ? '결과 보기' : '다음 문제';
  }

  function nextQ() {
    $('#qFb').classList.add('hidden');
    if (QS.i + 1 >= QS.items.length) return finish();
    QS.i++; renderQ();
  }

  function finish() {
    var tot = QS.items.length, ok = QS.ok, acc = Math.round(ok / tot * 100);
    var bonus = acc === 100 ? 20 : 10;
    S.xp += bonus;
    if (S.days[todayStr()]) S.days[todayStr()].xp = (S.days[todayStr()].xp || 0) + bonus;
    save();
    sfx('done'); confetti(70);
    var msg = acc === 100 ? '완벽해요! 오늘 몫 끝!' : acc >= 80 ? '아주 좋아요!' : acc >= 50 ? '조금만 더!' : '틀린 문제는 오답노트에 담아뒀어요';
    $('#qBar').style.width = '100%';
    $('#qCount').textContent = tot + '/' + tot;
    $('#qBody').innerHTML =
      '<div class="summary">' +
      '<img class="sum-mascot" src="assets/mascot-win.png" alt="">' +
      '<h2>' + ok + ' / ' + tot + ' 정답</h2><p>' + msg + '</p>' +
      '<div class="streak-pop"><span>🔥</span><b>' + (S.streak.n || 0) + '일 연속</b><i>최고 ' + (S.streak.best || 0) + '일</i></div>' +
      '<div class="rows"><div class="row"><span>정답률</span><i>' + acc + '%</i></div>' +
      '<div class="row"><span>최고 콤보</span><i>🔥 ' + QS.maxCombo + '연속</i></div>' +
      '<div class="row"><span>얻은 XP</span><i>+' + (QS.xp + bonus) + ' XP</i></div>' +
      '<div class="row"><span>오늘 목표</span><i>' + (dayRec().ans || 0) + '/' + S.goal.q + '문제</i></div></div>' +
      (QS.wrongIds.length ? '<button class="btn ghost wide" id="qRetryWrong">🩹 틀린 ' + QS.wrongIds.length + '문제 바로 복습</button>' : '') +
      '<button class="btn primary wide" id="qAgain">한 번 더</button>' +
      '<button class="btn ghost wide" id="qHome">스테이지로</button></div>';
    $('#qFb').classList.add('hidden');
    var modeNow = QS.mode, optNow = QS.opt || {}, wrongNow = QS.wrongIds.slice();
    var again = $('#qAgain');
    if (again) again.onclick = function () { closeQuiz(); startSession(modeNow, optNow); };
    var home = $('#qHome');
    if (home) home.onclick = function () { closeQuiz(); renderAll(); };
    var retry = $('#qRetryWrong');
    if (retry) retry.onclick = function () { closeQuiz(); startSession('ids', { ids: wrongNow, title: '틀린 문제 다시 풀기' }); };
    renderHud(); renderReview(); renderStats(); renderQuest(); renderMascot(); renderChallenges();
    checkPromotion();
  }

  function closeQuiz() {
    document.body.style.overflow = '';
    $('#quiz').classList.add('hidden');
    $('#qBody').innerHTML = '';
    $('#qFb').classList.add('hidden');
    QS = null;
  }

  function touchStreak() {
    var t = todayStr(), st = S.streak;
    if (st.last === t) return;
    st.n = st.last === ydayStr() ? (st.n || 0) + 1 : 1;
    st.last = t;
    st.best = Math.max(st.best || 0, st.n);
  }
  function touchDay() { dayRec(); }

  /* ---------- render all ---------- */
  function renderAll() {
    applyTheme(); renderHud(); renderSubtabs(); renderDday(); renderQuest(); renderMascot();
    renderChallenges(); renderPass(); renderStage(); renderReview(); renderStats();
  }

  /* ---------- events ---------- */
  $('#mute').onclick = function () {
    S.muted = !S.muted; save(); renderHud();
    if (!S.muted) sfx('tap');
  };
  $('#planBtn').onclick = function () { sfx('tap'); openPlanSheet(); };
  $('#rankBadge').onclick = function () { sfx('tap'); openRankSheet(rankOf(S.xp || 0).r, false); };
  $('#stWeakGo').onclick = function () {
    var ws = weakUnits();
    if (!ws.length) { toast('문제를 3개 이상 풀면 약점 단원이 잡혀요'); return; }
    var ids = [];
    ws.forEach(function (w) {
      poolForUnit(w.cid, w.ui).forEach(function (q) { if (ids.indexOf(q.i) < 0) ids.push(q.i); });
    });
    if (!ids.length) { toast('그 단원 문제가 아직 없어요'); return; }
    startSession('ids', { ids: ids, title: '약점 단원 집중 복습' });
  };
  $('#ddayEdit').onclick = function () { sfx('tap'); openDdaySheet(); };
  $('#gtChip').onclick = function () { toast('지텔프 Level 2 · 2026-11-29 (일) · ' + ddayLabel(GTELP)); };
  $('#planChip').onclick = function () { openPlanSheet(); };
  $$('.tab').forEach(function (b) {
    b.onclick = function () {
      $$('.tab').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      var v = b.getAttribute('data-view');
      ['stage', 'review', 'stats'].forEach(function (k) {
        $('#view-' + k).classList.toggle('hidden', k !== v);
      });
      window.scrollTo({ top: 0 });
      if (v === 'stage') { $('#path')._scrolled = false; renderStage(); }
      if (v === 'review') renderReview();
      if (v === 'stats') renderStats();
    };
  });
  $('#mToday').onclick = function () { startSession('today'); };
  $('#mAll').onclick = function () { startSession('all'); };
  $('#mWrong').onclick = function () { startSession('wrong'); };
  $$('#lenChips .chip').forEach(function (b) {
    b.onclick = function () { S.qlen = Number(b.getAttribute('data-len')); save(); renderReview(); sfx('tap'); };
  });
  $('#mixAll').onchange = function () { S.mix = this.checked; save(); renderReview(); };
  $('#qClose').onclick = function () { closeQuiz(); renderAll(); };
  $('#fbNext').onclick = nextQ;
  $('#stWrongGo').onclick = function () { startSession('wrong'); };
  $('#sheet').addEventListener('click', closeSheetIfBg);
  $('#reset').onclick = function () {
    if (!confirm('학습 기록(진도·XP·스트릭·오답)을 모두 지울까요? 지텔프 G-POINT 1~8 기본 체크도 다시 적용됩니다.')) return;
    S = {
      xp: 0, streak: { n: 0, last: '', best: 0 }, checked: {}, wrong: {}, ans: 0, ok: 0,
      muted: S.muted, subj: S.subj, course: {}, qlen: 10, mix: false, days: {},
      dday: DTARGET, ddayNote: '예상일', unit: {}, gpSeeded: true, goal: { xp: 50, q: 10 }
    };
    D.subjects.forEach(function (s) { S.course[s.id] = s.defaultCourse || s.courses[0].id; });
    var seed = {};
    for (var gi = 1; gi <= 8; gi++) seed[gi] = todayStr();
    S.checked['gtp33'] = seed;
    save(); $('#path')._scrolled = false; renderAll(); toast('초기화했어요');
  };
  $('#installTip').onclick = function () {
    toast('사파리 하단 공유(⬆️) → "홈 화면에 추가"');
  };
  window.addEventListener('resize', function () {
    if (!$('#view-stage').classList.contains('hidden')) renderStage();
  });

  /* ---------- boot ---------- */
  renderAll();
  if (D.questions.length === 0) toast('문제 데이터를 불러오지 못했어요');
})();
