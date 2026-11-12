// Стъпки 3, 5 и 6: екрани, проверка на действията, истински ход и запис.
// Изчисленията са в simulation.js, мисиите — в missions.js, записът — в storage.js.

const missionList = document.getElementById("mission-list");
const homeScreen = document.getElementById("home-screen");
const missionsScreen = document.getElementById("missions-screen");
const gameScreen = document.getElementById("game-screen");
const resultScreen = document.getElementById("result-screen");
const startButton = document.getElementById("start-button");
const continueButton = document.getElementById("continue-button");
const homeContinueButton = document.getElementById("home-continue");
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
const turnMessage = document.getElementById("turn-message");
const actionList = document.getElementById("action-list");
const actionMessage = document.getElementById("action-message");
const actionReasons = document.getElementById("action-reasons");
const gameState = document.getElementById("game-state");
const saveNote = document.getElementById("save-note");
const diary = document.getElementById("diary");
let selectedMission = MISSIONS[0];

// Текущата игра: мисия, състояние, всички състояния досега и id в базата (ако има вход).
let game = null;
let storageReady = false;
let user = null;

const LABELS = { water: "💧 Вода", grass: "🌿 Трева", rabbits: "🐇 Зайци", foxes: "🦊 Лисици" };
const ARROWS = { up: "↑", same: "=", down: "↓" };
const EVENT_NAMES = { none: "Без събитие", rain: "🌧 Дъжд", drought: "☀ Суша", disease: "🦠 Болест" };
const gameOverlay = document.getElementById("game-overlay");
const turnFeedback = document.getElementById("turn-feedback");
let overlayReturnButton = null;

// Подреждаме действията преди прогнозите и за клавиатурата.
document.querySelector(".controls-grid").prepend(document.querySelector('[aria-labelledby="actions-title"]'));

// ---------- Екран 1: мисии ----------

// Правим картите от данните, за да не повтаряме един и същ HTML пет пъти.
function showMissions() {
  for (const mission of MISSIONS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "mission-card";
    card.disabled = mission.locked;
    card.setAttribute("aria-pressed", mission.number === 1 ? "true" : "false");

    const number = document.createElement("span");
    number.className = "mission-number";
    number.textContent = mission.locked ? "🔒" : String(mission.number).padStart(2, "0");
    if (mission.locked) card.title = "Мисията е заключена.";
    const title = document.createElement("strong");
    title.textContent = mission.title;
    const goal = document.createElement("span");
    goal.className = "mission-goal";
    goal.textContent = `Цел: ${mission.goalText}`;
    const level = document.createElement("span");
    level.className = "mission-level";
    level.textContent = `Трудност: ${mission.level}`;
    card.append(number, title, goal, level);

    if (!mission.locked) {
      card.addEventListener("click", () => selectMission(mission, card));
    }
    missionList.appendChild(card);
  }
}

function selectMission(mission, card) {
  selectedMission = mission;
  // Само една карта може да е избрана.
  for (const otherCard of missionList.children) {
    otherCard.setAttribute("aria-pressed", otherCard === card ? "true" : "false");
  }
  startButton.textContent = `▶ ЗАПОЧНИ МИСИЯ ${mission.number}`;
  const detail = document.getElementById("mission-detail");
  detail.dataset.mission = String(mission.number);
  document.getElementById("mission-detail-number").textContent = `${String(mission.number).padStart(2, "0")} / 05`;
  document.getElementById("mission-detail-level").textContent = `Трудност: ${mission.level.length / 2} / 3`;
  document.getElementById("mission-detail-title").textContent = mission.title;
  document.getElementById("mission-detail-goal").textContent = `Цел: ${mission.goalText}`;
}

function showScreen(screen) {
  closeOverlay();
  homeScreen.hidden = screen !== "home";
  missionsScreen.hidden = screen !== "missions";
  gameScreen.hidden = screen !== "game";
  resultScreen.hidden = screen !== "result";
  document.body.dataset.screen = screen;
  window.scrollTo(0, 0);
}

document.getElementById("home-start").addEventListener("click", () => showScreen("missions"));
document.getElementById("home-missions").addEventListener("click", () => showScreen("missions"));
document.getElementById("home-rules").addEventListener("click", () => {
  const help = document.getElementById("home-help");
  help.open = true;
  help.querySelector("summary").focus();
});
document.getElementById("missions-home").addEventListener("click", () => showScreen("home"));

// ---------- Започване и продължаване на игра ----------

function openGame(mission, state, history, simulationId, entries = []) {
  game = { mission, state, history, simulationId, entries,
    points: entries.reduce((sum, entry) => sum + entry.comparison.points, 0) };
  document.getElementById("game-title").textContent = `Мисия ${mission.number}: ${mission.title}`;
  document.getElementById("game-goal").textContent = `Цел: ${mission.goalText}`;
  showScreen("game");
  renderGame(null);
  renderDiary();
  turnFeedback.hidden = true;
  resetChoices();
  actionList.querySelector("button:not(:disabled)").focus();
}

async function startMission(mission) {
  const state = createInitialState(mission);
  openGame(mission, state, [state], null);
  if (!user) return;

  setGameState("loading", "Създаване на нова игра в базата…");
  try {
    game.simulationId = await createSimulation(mission.number, state);
    saveNote.textContent = "Играта се записва след всеки ход.";
    setGameState("ready", "Готово за избор на действие и прогноза.");
  } catch (error) {
    saveNote.textContent = "Играта НЕ се записва: " + error.message;
    setGameState("ready", "Готово. Можеш да играеш и без запис.");
  }
}

async function continueGame() {
  setAuthMessage("Зареждане на записаната игра…");
  try {
    const saved = await loadLatestGame();
    if (!saved) {
      setAuthMessage("Няма незавършена записана игра.");
      return;
    }
    const mission = MISSIONS.find((m) => m.number === saved.missionNumber);
    const history = [createInitialState(mission), ...saved.history];
    const entries = saved.entries.map((row, index) => ({
      turn: row.turn_no,
      comparison: comparePrediction(history[index], history[index + 1], row.prediction || {}),
      reasons: [row.reason || "Няма записана причина."],
      event: { type: row.event || "none" },
      before: history[index], after: history[index + 1],
    }));
    openGame(mission, saved.state, history, saved.id, entries);
    saveNote.textContent = `Продължаваш записана игра от ход ${saved.state.turn}.`;
  } catch (error) {
    setAuthMessage("Грешка при зареждане: " + error.message);
  }
}

startButton.addEventListener("click", () => startMission(selectedMission));
continueButton.addEventListener("click", continueGame);
homeContinueButton.addEventListener("click", continueGame);
document.getElementById("restart-button").addEventListener("click", () => startMission(game.mission));
document.getElementById("next-mission-button").addEventListener("click", () => {
  const nextMission = MISSIONS.find((mission) => mission.number === game.mission.number + 1 && !mission.locked);
  if (nextMission) startMission(nextMission);
});
document.getElementById("result-back-button").addEventListener("click", () => {
  showScreen("missions");
  refreshContinueButton();
  startButton.focus();
});

backButton.addEventListener("click", () => {
  showScreen("missions");
  refreshContinueButton();
  startButton.focus();
});

// ---------- Показване на състоянието ----------

// previous = състоянието преди хода (за +/−), или null в началото.
function renderGame(previous) {
  const s = game.state;
  for (const key of ["water", "grass", "rabbits", "foxes"]) {
    const box = document.querySelector(`.metric[data-metric="${key}"]`);
    box.querySelector("strong").textContent = key === "water" ? `${s[key]} / 100` : String(s[key]);
    const change = box.querySelector(".change");
    const diff = previous ? s[key] - previous[key] : 0;
    change.textContent = diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : "0";
    change.className = "change " + (diff > 0 ? "up" : diff < 0 ? "down" : "same");
    box.dataset.trend = diff > 0 ? "up" : diff < 0 ? "down" : "same";
    box.dataset.critical = s[key] === 0 || (key === "water" && s.water < 20) ? "true" : "false";
  }
  document.getElementById("turn-badge").textContent = `Ход ${s.turn} / 10`;

  // Прогноза за времето: играчът вижда кое събитие идва следващия ход.
  const next = s.turn < 10 ? eventForTurn(game.mission, s.turn + 1) : { type: "none" };
  document.getElementById("event-label").textContent =
    next.type === "none" ? "Следващ ход: без събитие" : `Следващ ход: ${EVENT_NAMES[next.type]}`;

  // Оставащи използвания на действията.
  const left = {
    "restore-water": `+25 вода · остават ${2 - s.waterUses} / 2`,
    "add-rabbits": `+6 зайци · остават ${3 - s.rabbitUses} / 3`,
    "add-foxes": `+2 лисици · остават ${2 - s.foxUses} / 2`,
  };
  for (const [action, text] of Object.entries(left)) {
    actionList.querySelector(`[data-action="${action}"] small`).textContent = text;
  }
  renderActions();
  renderScene(s);
  // 3D долината (scene3d.js) показва същото състояние. Ако я няма, остава SVG картинката.
  if (window.Scene3D) window.Scene3D.update(s, previous ? game.entries.at(-1).event : null, { instant: !previous, history: game.history, entries: game.entries });
  if (!gameOverlay.hidden && !document.getElementById("history-panel").hidden) drawGameChart();
}

function drawGameChart() {
  const drawn = drawHistoryChart(document.getElementById("history-chart"), game.history);
  document.getElementById("chart-message").textContent = drawn ? "" : "Графиката изисква интернет връзка.";
}

// Сцената показва същите числа като показателите, без отделна симулация.
function renderScene(state) {
  const scene = document.getElementById("valley-scene");
  // Изрязваме реката според истинската вода; при нула се вижда сухото корито.
  document.getElementById("scene-river-level").setAttribute("y", String(590 - state.water * 1.1));
  document.getElementById("scene-river").style.opacity = state.water ? "1" : "0";
  document.getElementById("scene-shimmer").style.opacity = state.water ? ".62" : "0";
  document.getElementById("scene-grass").style.opacity = String(.2 + state.grass / 500 * .8);
  document.getElementById("scene-rabbits").style.display = state.rabbits === 0 ? "none" : "";
  document.getElementById("scene-more-rabbits").style.display = state.rabbits < 35 ? "none" : "";
  document.getElementById("scene-foxes").style.display = state.foxes === 0 ? "none" : "";
  document.getElementById("scene-more-foxes").style.display = state.foxes < 10 ? "none" : "";
  const event = game.entries.at(-1)?.event.type || "none";
  document.getElementById("scene-rain").style.display = event === "rain" ? "" : "none";
  scene.dataset.event = event;
  scene.setAttribute("aria-label", `Долина: вода ${state.water}, трева ${state.grass}, зайци ${state.rabbits}, лисици ${state.foxes}.`);
  document.getElementById("scene-caption").textContent =
    `Вода ${state.water} · Трева ${state.grass} · Зайци ${state.rabbits} · Лисици ${state.foxes}`;
}

function paragraph(text, className) {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

// Показва всички ходове, като последният е отворен най-отгоре.
function renderDiary() {
  diary.innerHTML = "";
  if (game.entries.length === 0) {
    diary.append(paragraph("След първия ход тук ще видиш прогнозата, резултата и причините.", "small-text"));
    return;
  }
  for (const entry of [...game.entries].reverse()) {
    const section = document.createElement("details");
    section.className = "diary-turn";
    section.open = entry === game.entries[game.entries.length - 1];
    const summary = document.createElement("summary");
    summary.textContent = `Ход ${entry.turn} · ${EVENT_NAMES[entry.event.type]} · ${entry.comparison.points} / 4 точки`;
    section.append(summary);
    const table = document.createElement("table");
    table.className = "diary-table";
    const head = table.insertRow();
    for (const title of ["Показател", "Прогноза", "Резултат", ""]) {
      const th = document.createElement("th");
      th.textContent = title;
      head.append(th);
    }
    for (const d of entry.comparison.details) {
      const row = table.insertRow();
      for (const value of [LABELS[d.key], ARROWS[d.predicted] || "?",
        `${entry.before[d.key]} → ${entry.after[d.key]} ${ARROWS[d.actual]}`, d.ok ? "✓" : "✗"]) {
        row.insertCell().textContent = value;
      }
    }
    section.append(table);
    const list = document.createElement("ul");
    list.className = "diary-reasons";
    for (const reason of entry.reasons) {
      const li = document.createElement("li");
      li.textContent = reason;
      list.append(li);
    }
    section.append(paragraph("Защо?", "diary-why"), list);
    diary.append(section);
  }
}

function showResult() {
  const result = evaluateGoal(game.mission, game.history);
  const list = document.getElementById("result-list");
  list.innerHTML = "";
  for (const c of result.conditions) {
    const li = document.createElement("li");
    li.textContent = `${c.ok ? "✅" : "❌"} ${c.text}`;
    list.append(li);
  }
  document.getElementById("result-title").textContent = result.success ? "🎉 Мисията е успешна!" : "Мисията не е успешна";
  document.getElementById("result-mission").textContent = `Мисия ${game.mission.number}: ${game.mission.title}`;
  const resources = document.getElementById("result-resources");
  resources.innerHTML = "";
  for (const key of ["water", "grass", "rabbits", "foxes"]) {
    const item = document.createElement("span");
    item.textContent = `${LABELS[key]}: ${game.state[key]}`;
    resources.append(item);
  }
  document.getElementById("result-points").textContent =
    `Точки за разбиране: ${game.points || 0} от 40. Те са отделни от успеха на мисията.`;
  const turns = document.getElementById("key-turns");
  turns.innerHTML = "";
  for (const entry of keyDecisions(game.entries)) {
    const li = document.createElement("li");
    li.textContent = `Ход ${entry.turn}: ${entry.reasons[0]}`;
    turns.append(li);
  }
  document.getElementById("reflection-question").textContent =
    "Помисли: кое твое действие промени долината най-силно? Какво би избрал различно при следващ опит?";
  const nextMission = MISSIONS.find((mission) => mission.number === game.mission.number + 1 && !mission.locked);
  document.getElementById("next-mission-button").hidden = !nextMission;
  showScreen("result");
  document.getElementById("result-title").focus();
  const drawn = drawHistoryChart(document.getElementById("result-chart"), game.history);
  document.getElementById("result-chart-message").textContent = drawn ? "" : "Графиката изисква интернет връзка.";
  setGameState("ready", "Мисията приключи след 10 хода.");
  nextButton.disabled = true;
  return result;
}

// ---------- Избор на действие и прогноза (стъпка 5) ----------

// Само една прогноза или едно действие в група може да е избрано.
function chooseOne(button, group) {
  for (const choice of group.querySelectorAll("button:not(:disabled)")) {
    choice.setAttribute("aria-pressed", choice === button ? "true" : "false");
  }
  if (group === actionList) {
    actionMessage.textContent = `Избрано действие: ${button.querySelector("span").textContent}.`;
    document.getElementById("selected-action-label").textContent = button.querySelector("span").textContent;
  }
  updateNextButton();
}

function updateNextButton() {
  const actionChosen = document.querySelector('#action-list button[aria-pressed="true"]');
  const predictionCount = document.querySelectorAll('.choice-group button[aria-pressed="true"]').length;
  const finished = game && game.state.turn >= 10;
  nextButton.disabled = finished || !canContinue(actionChosen, predictionCount, gameState.dataset.state);
  document.querySelector(".phase-bar").dataset.phase = !actionChosen ? "action" : predictionCount < 4 ? "prediction" : "execute";
  gameScreen.dataset.phase = !turnFeedback.hidden ? "feedback" : !actionChosen ? "action" : "prediction";
  // 3D долината показва прекия ефект на избраното действие (или го маха при отказ/смяна).
  if (window.Scene3D && game) window.Scene3D.preview(actionChosen && !finished ? actionChosen.dataset.action : null, game.state, game.mission);
  document.getElementById("prediction-progress").textContent = `Прогноза: ${predictionCount} от 4`;

  if (gameState.dataset.state === "error" || finished) return;
  if (!actionChosen) {
    turnMessage.textContent = "Избери действие и направи четири прогнози.";
  } else if (predictionCount < 4) {
    turnMessage.textContent = `Остават ${4 - predictionCount} прогнози преди следващия ход.`;
  } else {
    turnMessage.textContent = "Готово. Изпълни хода, за да видиш последиците.";
  }
}

// Недопустимите действия се показват сиви и с видима причина.
function renderActions() {
  const reasons = [];
  for (const button of actionList.querySelectorAll("button[data-action]")) {
    const error = game ? actionError(button.dataset.action, game.state) : null;
    button.disabled = error !== null;
    if (error) {
      button.setAttribute("title", error);
      button.setAttribute("aria-describedby", "action-reasons");
      button.setAttribute("aria-pressed", "false");
      reasons.push(`${button.querySelector("span").textContent}: ${error}`);
    } else {
      button.removeAttribute("title");
      button.removeAttribute("aria-describedby");
    }
  }
  actionReasons.textContent = reasons.join(" ");
  updateNextButton();
}

function setGameState(state, message) {
  gameState.dataset.state = state;
  gameState.textContent = message;
  updateNextButton();
}

function resetChoices() {
  for (const button of gameScreen.querySelectorAll("button[aria-pressed]")) {
    button.setAttribute("aria-pressed", "false");
  }
  document.getElementById("reason").value = "";
  actionMessage.textContent = "Още няма избрано действие.";
  document.getElementById("selected-action-label").textContent = "Избрано действие";
  renderActions();
  setGameState("ready", "Готово за избор на действие и прогноза.");
}

document.getElementById("change-action").addEventListener("click", () => {
  for (const button of gameScreen.querySelectorAll("button[aria-pressed]")) button.setAttribute("aria-pressed", "false");
  actionMessage.textContent = "Избери друго действие.";
  updateNextButton();
  actionList.querySelector("button:not(:disabled)").focus();
});

document.getElementById("feedback-continue").addEventListener("click", () => {
  turnFeedback.hidden = true;
  updateNextButton();
  actionList.querySelector("button:not(:disabled)").focus();
});

function openOverlay(type, button) {
  overlayReturnButton = button;
  document.getElementById("history-panel").hidden = type !== "history";
  document.getElementById("journal-panel").hidden = type !== "journal";
  document.getElementById("overlay-title").textContent = type === "history" ? "История на долината" : "Дневник на причините";
  gameOverlay.hidden = false;
  if (type === "history") drawGameChart();
  document.getElementById("overlay-close").focus();
}

function closeOverlay() {
  if (gameOverlay.hidden) return;
  gameOverlay.hidden = true;
  if (overlayReturnButton && !gameScreen.hidden) overlayReturnButton.focus();
}

document.getElementById("history-button").addEventListener("click", (event) => openOverlay("history", event.currentTarget));
document.getElementById("journal-button").addEventListener("click", (event) => openOverlay("journal", event.currentTarget));
document.getElementById("overlay-close").addEventListener("click", closeOverlay);
gameOverlay.addEventListener("click", (event) => { if (event.target === gameOverlay) closeOverlay(); });
document.addEventListener("keydown", (event) => {
  if (gameOverlay.hidden) return;
  if (event.key === "Escape") closeOverlay();
  // Фокусът остава в отворения панел при клавиатурна навигация.
  if (event.key === "Tab") {
    const focusable = [...gameOverlay.querySelectorAll("button, summary")].filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

for (const group of document.querySelectorAll(".choice-group")) {
  group.addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") chooseOne(event.target, group);
  });
}

actionList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button && !button.disabled) chooseOne(button, actionList);
});

// ---------- Следващ ход (стъпка 6) ----------

nextButton.addEventListener("click", async () => {
  const action = document.querySelector('#action-list button[aria-pressed="true"]').dataset.action;
  const prediction = {};
  for (const group of document.querySelectorAll(".choice-group")) {
    prediction[group.dataset.key] = group.querySelector('[aria-pressed="true"]').dataset.value;
  }

  const result = simulateTurn(game.state, action, game.mission);
  if (!result.ok) {
    setGameState("error", result.error);
    return;
  }

  const previous = game.state;
  game.state = result.state;
  game.history.push(result.state);
  const comparison = comparePrediction(previous, result.state, prediction);
  game.points = (game.points || 0) + comparison.points;
  game.entries.push({ turn: result.state.turn, comparison, reasons: result.reasons,
    event: result.event, before: previous, after: result.state });

  renderGame(previous);
  renderDiary();
  resetChoices();
  turnMessage.textContent = `Ход ${result.state.turn} е изигран.`;

  let status = "active";
  if (result.state.turn >= 10) status = showResult().success ? "won" : "lost";
  else {
    const changed = ["water", "grass", "rabbits", "foxes"].map((key) => {
      const difference = result.state[key] - previous[key];
      return `${LABELS[key]} ${difference > 0 ? "+" + difference : difference < 0 ? "−" + -difference : "="}`;
    });
    document.getElementById("feedback-title").textContent = `Ход ${result.state.turn}: долината се промени`;
    document.getElementById("feedback-changes").textContent = changed.join(" · ") + ` · ${comparison.points} / 4 верни прогнози`;
    document.getElementById("feedback-cause").textContent = result.reasons[0] || "Няма допълнително събитие.";
    turnFeedback.hidden = false;
    updateNextButton();
    document.getElementById("feedback-continue").focus();
  }

  if (game.simulationId) {
    setGameState("loading", "Записване на хода…");
    try {
      await saveTurn(game.simulationId, result.state,
        { action, event: result.event, prediction, reasons: result.reasons, points: comparison.points }, status);
      saveNote.textContent = `Ход ${result.state.turn} е записан.`;
    } catch (error) {
      saveNote.textContent = "Ходът НЕ се записа: " + error.message;
    }
    setGameState("ready", status === "active" ? "Готово за следващия ход." : "Мисията приключи след 10 хода.");
    if (status !== "active") nextButton.disabled = true;
  }
});

// ---------- Вход и регистрация (стъпка 6) ----------

const authPanel = document.getElementById("auth-panel");
const authForm = document.getElementById("auth-form");
const signOutButton = document.getElementById("sign-out-button");

function setAuthMessage(text) {
  document.getElementById("auth-message").textContent = text;
}

async function refreshContinueButton() {
  continueButton.disabled = true;
  homeContinueButton.disabled = true;
  if (!user) return;
  try {
    const saved = await loadLatestGame();
    continueButton.disabled = !saved;
    homeContinueButton.disabled = !saved;
    continueButton.title = saved ? `Мисия ${saved.missionNumber}, ход ${saved.state.turn}` : "Няма незавършена игра";
  } catch (error) {
    continueButton.title = "Грешка: " + error.message;
  }
}

function renderAccount() {
  document.getElementById("account-name").textContent = user ? user.email : "";
  document.getElementById("account-button").textContent = user ? "Профил" : "Вход / Регистрация";
  authForm.hidden = Boolean(user);
  signOutButton.hidden = !user;
  saveNote.textContent = user ? "Играта се записва след всеки ход." : "Без вход — играта не се записва.";
  refreshContinueButton();
}

document.getElementById("account-button").addEventListener("click", () => {
  authPanel.hidden = !authPanel.hidden;
  if (!storageReady) setAuthMessage("Няма връзка със Supabase (няма интернет?). Можеш да играеш без запис.");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!storageReady) return;
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const mode = event.submitter ? event.submitter.dataset.auth : "sign-in";
  setAuthMessage(mode === "sign-up" ? "Регистрация…" : "Вход…");
  try {
    if (mode === "sign-up") {
      const result = await signUp(email, password);
      user = result.needsConfirmation ? null : result.user;
      setAuthMessage(result.needsConfirmation
        ? "Регистрацията е приета. Потвърди имейла си и после влез."
        : "Регистрацията е успешна. Влезе в профила си.");
    } else {
      user = await signIn(email, password);
      setAuthMessage("Влезе успешно.");
    }
    document.getElementById("auth-password").value = "";
  } catch (error) {
    setAuthMessage(error.message);
  }
  renderAccount();
});

signOutButton.addEventListener("click", async () => {
  try {
    await signOut();
  } catch (error) {
    setAuthMessage(error.message);
  }
  user = null;
  setAuthMessage("Излезе от профила.");
  renderAccount();
});

// ---------- Начало ----------

showMissions();
selectMission(MISSIONS[0], missionList.firstElementChild);
renderActions();
showScreen("home");
document.getElementById("status").textContent = "стъпка 7 · пет мисии и графика";

storageReady = initStorage();
if (storageReady) {
  currentUser().then((found) => {
    user = found;
    renderAccount();
  });
} else {
  saveNote.textContent = "Няма връзка със Supabase — играта не се записва.";
}
