// תרגול הנדסת שיטות - לוגיקת האפליקציה
QUESTIONS.forEach((q, i) => { q.id = i; });

// ---------- Theme toggle ----------
const THEME_KEY = "ms_theme";
function currentTheme() {
  const saved = document.documentElement.getAttribute("data-theme");
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyThemeIcon() {
  const t = currentTheme();
  document.getElementById("themeToggle").textContent = t === "dark" ? "☀️" : "🌙";
}
document.getElementById("themeToggle").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  applyThemeIcon();
});
applyThemeIcon();

const TOPIC_LABELS = {
  ai: "AI וסוכנים",
  worksample: "דגימת עבודה",
  directtime: "חקר זמן ישיר",
  ashcroft: "אשקרוף / איילון",
  productivity: "פריון ועקומת למידה",
  kav: "איזון קו ייצור"
};

const EXAM_SIZE = 25;

const LS = {
  bestScore: "ms_best_score",
  bestCount: "ms_best_count",
  bestTime: "ms_best_time",
  wrongIds: "ms_wrong_ids"
};

function getWrongIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS.wrongIds) || "[]")); }
  catch (e) { return new Set(); }
}
function saveWrongIds(set) {
  localStorage.setItem(LS.wrongIds, JSON.stringify([...set]));
}
function updateWrongIds(answers) {
  const set = getWrongIds();
  answers.forEach(a => {
    if (a.correctIndex === a.chosenIndex) set.delete(a.q.id);
    else set.add(a.q.id);
  });
  saveWrongIds(set);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Groups questions that share a "story" (scenario) into one ordered cluster,
// so shuffling keeps them together and in their original part order - a
// standalone question (no story) is just a group of one.
function groupIntoStoryClusters(pool) {
  const groups = [];
  const seenStories = new Map();
  pool.forEach(q => {
    if (!q.story) {
      groups.push([q]);
      return;
    }
    if (seenStories.has(q.story)) {
      seenStories.get(q.story).push(q);
    } else {
      const group = [q];
      seenStories.set(q.story, group);
      groups.push(group);
    }
  });
  groups.forEach(g => g.sort((a, b) => (a.part || 0) - (b.part || 0)));
  return groups;
}

// Shuffles whole story-clusters (never splitting a story across positions),
// then flattens back into a single ordered list of questions.
function shuffleKeepingStoriesTogether(pool) {
  return shuffle(groupIntoStoryClusters(pool)).flat();
}

// Picks whole story-clusters until at least `size` questions are collected
// (never cuts a story short - may slightly exceed `size`).
function pickGroupsUpTo(pool, size) {
  const groups = shuffle(groupIntoStoryClusters(pool));
  const picked = [];
  let count = 0;
  for (const g of groups) {
    if (count >= size) break;
    picked.push(...g);
    count += g.length;
  }
  return picked;
}

function shuffleChoicesOf(q) {
  const order = shuffle(q.choices.map((_, i) => i));
  return {
    ...q,
    choices: order.map(i => q.choices[i]),
    correct: order.indexOf(q.correct)
  };
}

const state = {
  screen: "home",
  selectedTopics: new Set(Object.keys(TOPIC_LABELS)),
  mode: null,
  questions: [],
  index: 0,
  answers: [],
  elapsedSeconds: 0,
  timerHandle: null
};

const screenEl = document.getElementById("screen");

function render() {
  if (state.screen === "home") renderHome();
  else if (state.screen === "quiz") renderQuiz();
  else if (state.screen === "result") renderResult();
  else if (state.screen === "summaries") renderSummaries();
  else if (state.screen === "formulas") renderFormulas();
}

document.getElementById("homeBtn").addEventListener("click", () => {
  stopTimer();
  state.screen = "home";
  render();
});

function stopTimer() {
  if (state.timerHandle) { clearInterval(state.timerHandle); state.timerHandle = null; }
}

// ---------- Home screen ----------
function renderHome() {
  const wrongCount = getWrongIds().size;
  const bestScore = localStorage.getItem(LS.bestScore);
  const bestCount = localStorage.getItem(LS.bestCount);
  const bestTime = localStorage.getItem(LS.bestTime);

  const topicsHtml = Object.entries(TOPIC_LABELS).map(([key, label]) => {
    const active = state.selectedTopics.has(key);
    return `<button class="topic-chip ${active ? "active" : ""}" data-topic="${key}">${label}</button>`;
  }).join("");

  const availableCount = QUESTIONS.filter(q => state.selectedTopics.has(q.topic)).length;

  screenEl.innerHTML = `
    <div class="card">
      <h2>בחרו נושאים לתרגול</h2>
      <div class="topics">
        <button class="topic-chip ${state.selectedTopics.size === Object.keys(TOPIC_LABELS).length ? "active" : ""}" id="allTopics">הכל</button>
        ${topicsHtml}
      </div>
      <div class="stat-row">
        <div class="stat"><div class="num">${availableCount}</div><div class="label">שאלות זמינות</div></div>
        <div class="stat"><div class="num">${bestScore ? bestScore + "%" : "—"}</div><div class="label">שיא במבחן מדומה${bestTime ? " (" + bestTime + ")" : ""}</div></div>
        <div class="stat"><div class="num">${wrongCount}</div><div class="label">שאלות לחזרה</div></div>
      </div>
    </div>

    <div class="card">
      <h2>📚 סיכומי נושאים</h2>
      <div class="result-sub" style="text-align:right;margin-bottom:10px;">תמצית הנוסחאות והרעיונות המרכזיים לכל נושא - כדאי לעבור עליה לפני שמתחילים לתרגל.</div>
      <button class="btn secondary" id="summariesBtn">📖 פתחו את הסיכומים</button>
    </div>

    <div class="card">
      <h2>🧮 דף נוסחאות מרוכז</h2>
      <div class="result-sub" style="text-align:right;margin-bottom:10px;">כל הנוסחאות הנדרשות לחישובים, מרוכזות לפי נושא - שימושי כבסיס לדף הנוסחאות האישי שמותר להביא למבחן.</div>
      <button class="btn secondary" id="formulasBtn">📐 פתחו את דף הנוסחאות</button>
    </div>

    <div class="card">
      <h2>בחרו מצב</h2>
      <div class="mode-grid">
        <button class="mode-btn" id="practiceBtn">
          <span class="emoji">🎯</span>
          <span class="title">תרגול חופשי</span>
          <span class="desc">משוב מיידי + הסבר אחרי כל שאלה</span>
        </button>
        <button class="mode-btn" id="examBtn">
          <span class="emoji">⏱️</span>
          <span class="title">מבחן מדומה</span>
          <span class="desc">25 שאלות אקראיות, שעון עצר בלי הגבלה, ציון בסוף</span>
        </button>
      </div>
      ${wrongCount > 0 ? `<button class="btn secondary" id="reviewWrongBtn">🔁 תרגול על ${wrongCount} השאלות שטעיתי בהן</button>` : ""}
    </div>
  `;

  document.getElementById("allTopics").addEventListener("click", () => {
    state.selectedTopics = new Set(Object.keys(TOPIC_LABELS));
    renderHome();
  });
  document.querySelectorAll(".topic-chip[data-topic]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.topic;
      if (state.selectedTopics.has(t)) state.selectedTopics.delete(t);
      else state.selectedTopics.add(t);
      if (state.selectedTopics.size === 0) state.selectedTopics = new Set(Object.keys(TOPIC_LABELS));
      renderHome();
    });
  });

  document.getElementById("practiceBtn").addEventListener("click", () => startQuiz("practice"));
  document.getElementById("examBtn").addEventListener("click", () => startQuiz("exam"));
  document.getElementById("summariesBtn").addEventListener("click", () => { state.screen = "summaries"; render(); });
  document.getElementById("formulasBtn").addEventListener("click", () => { state.screen = "formulas"; render(); });
  const reviewBtn = document.getElementById("reviewWrongBtn");
  if (reviewBtn) reviewBtn.addEventListener("click", startWrongReview);
}

function startQuiz(mode) {
  const pool = QUESTIONS.filter(q => state.selectedTopics.has(q.topic));
  if (pool.length === 0) return;
  state.mode = mode;
  if (mode === "exam") {
    state.questions = pickGroupsUpTo(pool, EXAM_SIZE).map(shuffleChoicesOf);
    state.elapsedSeconds = 0;
  } else {
    state.questions = shuffleKeepingStoriesTogether(pool).map(shuffleChoicesOf);
  }
  state.index = 0;
  state.answers = [];
  state.screen = "quiz";
  render();
  if (mode === "exam") startTimer();
}

function startWrongReview() {
  const ids = getWrongIds();
  const pool = QUESTIONS.filter(q => ids.has(q.id));
  if (pool.length === 0) return;
  state.mode = "practice";
  state.questions = shuffleKeepingStoriesTogether(pool).map(shuffleChoicesOf);
  state.index = 0;
  state.answers = [];
  state.screen = "quiz";
  render();
}

function startTimer() {
  stopTimer();
  state.timerHandle = setInterval(() => {
    state.elapsedSeconds++;
    const timerEl = document.getElementById("timerDisplay");
    if (timerEl) timerEl.textContent = formatTime(state.elapsedSeconds);
  }, 1000);
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ---------- Quiz screen ----------
function renderQuiz() {
  const q = state.questions[state.index];
  const total = state.questions.length;
  const pct = Math.round((state.index / total) * 100);

  const timerHtml = state.mode === "exam"
    ? `⏱️ <span class="timer" id="timerDisplay">${formatTime(state.elapsedSeconds)}</span>`
    : "";

  const choicesHtml = q.choices.map((c, i) =>
    `<button class="choice" data-i="${i}">${String.fromCharCode(1488 + i)}. ${c}</button>`
  ).join("");

  const story = q.story ? STORIES[q.story] : null;
  const storyHtml = story ? `
    <div class="card story-card">
      <div class="story-label">📖 ${story.title} · סעיף ${q.part} מתוך ${q.of}</div>
      <div class="story-text">${story.text}</div>
    </div>
  ` : "";

  screenEl.innerHTML = `
    <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
    <div class="q-meta">
      <span>שאלה ${state.index + 1} מתוך ${total}</span>
      ${timerHtml}
    </div>
    ${storyHtml}
    <div class="card">
      <div class="q-text">${q.q}</div>
      <div id="choicesWrap">${choicesHtml}</div>
      <div id="explainWrap"></div>
    </div>
  `;

  document.querySelectorAll("#choicesWrap .choice").forEach(btn => {
    btn.addEventListener("click", () => selectChoice(parseInt(btn.dataset.i, 10)));
  });
}

function selectChoice(i) {
  const q = state.questions[state.index];
  state.answers.push({ q, chosenIndex: i, correctIndex: q.correct });

  if (state.mode === "practice") {
    const buttons = document.querySelectorAll("#choicesWrap .choice");
    buttons.forEach((btn, idx) => {
      btn.classList.add("locked");
      if (idx === q.correct) btn.classList.add("correct");
      else if (idx === i) btn.classList.add("wrong");
      else btn.classList.add("dim");
      btn.disabled = true;
    });
    document.getElementById("explainWrap").innerHTML = `
      <div class="explain-box">
        <span class="tag">${i === q.correct ? "✅ נכון!" : "❌ לא נכון"}</span><br>
        ${q.explain}
      </div>
      <button class="btn" id="nextBtn">${state.index + 1 < state.questions.length ? "השאלה הבאה →" : "לסיום →"}</button>
    `;
    document.getElementById("nextBtn").addEventListener("click", nextQuestion);
  } else {
    // exam mode: no feedback, advance immediately
    nextQuestion();
  }
}

function nextQuestion() {
  state.index++;
  if (state.index >= state.questions.length) {
    finishQuiz();
  } else {
    render();
  }
}

function finishQuiz() {
  stopTimer();
  updateWrongIds(state.answers);

  state.finalTime = state.elapsedSeconds;

  if (state.mode === "exam") {
    const correct = state.answers.filter(a => a.chosenIndex === a.correctIndex).length;
    const pct = Math.round((correct / state.answers.length) * 100);
    const prevBest = parseInt(localStorage.getItem(LS.bestScore) || "0", 10);
    if (pct >= prevBest) {
      localStorage.setItem(LS.bestScore, pct);
      localStorage.setItem(LS.bestCount, `${correct}/${state.answers.length}`);
      localStorage.setItem(LS.bestTime, formatTime(state.finalTime));
    }
  }

  state.screen = "result";
  render();
}

// ---------- Result screen ----------
function renderResult() {
  const total = state.answers.length;
  const correct = state.answers.filter(a => a.chosenIndex === a.correctIndex).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;

  let emoji = "🙂";
  if (pct >= 90) emoji = "🏆";
  else if (pct >= 75) emoji = "🎉";
  else if (pct >= 50) emoji = "💪";
  else emoji = "📚";

  const wrongAnswers = state.answers.filter(a => a.chosenIndex !== a.correctIndex);

  const reviewHtml = wrongAnswers.length === 0
    ? `<p style="text-align:center;color:var(--good);font-weight:700;">כל הכבוד, ענית נכון על הכול! 🎉</p>`
    : wrongAnswers.map(a => {
        const story = a.q.story ? STORIES[a.q.story] : null;
        const storyLine = story ? `<div class="story-label" style="margin-bottom:6px;">📖 ${story.title} · סעיף ${a.q.part} מתוך ${a.q.of}: <span style="font-weight:400;color:var(--muted);">${story.text}</span></div>` : "";
        return `
        <div class="review-item">
          ${storyLine}
          <div class="q">${a.q.q}</div>
          <div class="your">התשובה שלך: ${String.fromCharCode(1488 + a.chosenIndex)}. ${a.q.choices[a.chosenIndex]}</div>
          <div class="right">התשובה הנכונה: ${String.fromCharCode(1488 + a.correctIndex)}. ${a.q.choices[a.correctIndex]}</div>
          <div style="margin-top:6px;color:var(--muted);">${a.q.explain}</div>
        </div>
      `;
      }).join("");

  screenEl.innerHTML = `
    <div class="card">
      <div class="result-emoji">${emoji}</div>
      <div class="result-score">${correct}/${total}</div>
      <div class="result-sub">${pct}% הצלחה ${state.mode === "exam" ? `· מבחן מדומה · זמן: ${formatTime(state.finalTime || 0)}` : "· תרגול חופשי"}</div>
      <div class="btn-row">
        <button class="btn" id="retryBtn">🔁 שוב</button>
        <button class="btn secondary" id="homeBtn2">🏠 בית</button>
      </div>
    </div>
    <div class="card">
      <h2>סקירת טעויות ${wrongAnswers.length > 0 ? `(${wrongAnswers.length})` : ""}</h2>
      ${reviewHtml}
    </div>
  `;

  document.getElementById("retryBtn").addEventListener("click", () => startQuiz(state.mode));
  document.getElementById("homeBtn2").addEventListener("click", () => { state.screen = "home"; render(); });
}

// ---------- Summaries screen ----------
function renderSummaries() {
  const cardsHtml = Object.entries(TOPIC_LABELS).map(([key, label]) => {
    const summary = SUMMARIES[key];
    const pointsHtml = summary.points.map(p => `<li>${p}</li>`).join("");
    return `
      <div class="card summary-card" data-topic="${key}">
        <button class="summary-toggle" data-topic="${key}">
          <span>📌 ${label}</span>
          <span class="summary-arrow">▾</span>
        </button>
        <ul class="summary-points hidden">${pointsHtml}</ul>
      </div>
    `;
  }).join("");

  screenEl.innerHTML = `
    <div class="card">
      <h2>📚 סיכומי נושאים</h2>
      <div class="result-sub" style="text-align:right;">לחצו על נושא כדי לפתוח/לסגור את הסיכום שלו.</div>
    </div>
    ${cardsHtml}
    <button class="btn secondary" id="backFromSummaries">🏠 חזרה לבית</button>
  `;

  document.querySelectorAll(".summary-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".summary-card");
      const list = card.querySelector(".summary-points");
      const arrow = card.querySelector(".summary-arrow");
      const isHidden = list.classList.contains("hidden");
      list.classList.toggle("hidden");
      arrow.textContent = isHidden ? "▴" : "▾";
    });
  });
  document.getElementById("backFromSummaries").addEventListener("click", () => { state.screen = "home"; render(); });
}

// ---------- Formula sheet screen ----------
function renderFormulas() {
  const cardsHtml = Object.entries(FORMULAS).map(([key, items]) => {
    const label = TOPIC_LABELS[key] || key;
    const itemsHtml = items.map(item => `
      <div class="formula-item">
        <div class="formula-eq">${item.f}</div>
        ${item.d ? `<div class="formula-desc">${item.d}</div>` : ""}
      </div>
    `).join("");
    return `
      <div class="card formula-card" data-topic="${key}">
        <button class="summary-toggle" data-topic="${key}">
          <span>📐 ${label}</span>
          <span class="summary-arrow">▾</span>
        </button>
        <div class="formula-list hidden">${itemsHtml}</div>
      </div>
    `;
  }).join("");

  screenEl.innerHTML = `
    <div class="card">
      <h2>🧮 דף נוסחאות מרוכז</h2>
      <div class="result-sub" style="text-align:right;">לחצו על נושא כדי לפתוח/לסגור. נושא "AI וסוכנים" מושג, ולכן אינו כולל נוסחאות חישוביות.</div>
    </div>
    ${cardsHtml}
    <button class="btn secondary" id="backFromFormulas">🏠 חזרה לבית</button>
  `;

  document.querySelectorAll(".formula-card .summary-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".formula-card");
      const list = card.querySelector(".formula-list");
      const arrow = card.querySelector(".summary-arrow");
      const isHidden = list.classList.contains("hidden");
      list.classList.toggle("hidden");
      arrow.textContent = isHidden ? "▴" : "▾";
    });
  });
  document.getElementById("backFromFormulas").addEventListener("click", () => { state.screen = "home"; render(); });
}

render();
