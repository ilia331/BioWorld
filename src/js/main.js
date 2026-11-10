// Стъпки 3, 5 и 6: екрани, проверка на действията, истински ход и запис.
// Изчисленията са в simulation.js, мисиите — в missions.js, записът — в storage.js.

const missionList = document.getElementById("mission-list");
const missionsScreen = document.getElementById("missions-screen");
const gameScreen = document.getElementById("game-screen");
const startButton = document.getElementById("start-button");
const continueButton = document.getElementById("continue-button");
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
    number.textContent = mission.locked ? `🔒 Мисия ${mission.number}` : `Мисия ${mission.number}`;
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
  startButton.textContent = `Започни мисия ${mission.number} →`;
}

function showScreen(screen) {
  missionsScreen.hidden = screen !== "missions";
  gameScreen.hidden = screen !== "game";
  window.scrollTo(0, 0);
}

// ---------- Започване и продължаване на игра ----------

function openGame(mission, state, history, simulationId) {
  game = { mission, state, history, simulationId };
  document.getElementById("game-title").textContent = `Мисия ${mission.number}: ${mission.title}`;
  document.getElementById("game-goal").textContent = `Цел: ${mission.goalText}`;
  document.getElementById("result-card").hidden = true;
  showScreen("game");
  renderGame(null);
  resetChoices();
  backButton.focus();
}

async function startMission(mission) {
  const state = createInitialState(mission);
  openGame(mission, state, [state], null);
  diary.innerHTML = "";
  diary.append(paragraph("След първия ход тук ще видиш прогнозата си, резултата и защо долината се е променила.", "small-text"));
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
    openGame(mission, saved.state, history, saved.id);
    saveNote.textContent = `Продължаваш записана игра от ход ${saved.state.turn}.`;
    if (saved.lastEntry) {
      diary.innerHTML = "";
      diary.append(paragraph(`Последен записан ход ${saved.lastEntry.turn_no}: ${saved.lastEntry.reason}`));
    }
  } catch (error) {
    setAuthMessage("Грешка при зареждане: " + error.message);
  }
}

startButton.addEventListener("click", () => startMission(selectedMission));
continueButton.addEventListener("click", continueGame);
document.getElementById("restart-button").addEventListener("click", () => startMission(game.mission));

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
  }
  document.getElementById("turn-badge").textContent = `Ход ${s.turn} / 10`;

  // Прогноза за времето: играчът вижда кое събитие идва следващия ход.
  const next = s.turn < 10 ? eventForTurn(game.mission, s.turn + 1) : { type: "none" };
  document.getElementById("event-label").textContent =
    next.type === "none" ? "Следващ ход: без събитие" : `Следващ ход: ${EVENT_NAMES[next.type]}`;

  // Оставащи използвания на действията.
  const left = {
    "restore-water": `остават ${2 - s.waterUses} / 2`,
    "add-rabbits": `остават ${3 - s.rabbitUses} / 3`,
    "add-foxes": `остават ${2 - s.foxUses} / 2`,
  };
  for (const [action, text] of Object.entries(left)) {
    actionList.querySelector(`[data-action="${action}"] small`).textContent = text;
  }
  renderActions();
}

function paragraph(text, className) {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

// „Дневник на причините“: прогноза срещу резултат + причините.
function renderDiary(turn, comparison, reasons, event) {
  diary.innerHTML = "";
  diary.append(paragraph(`Ход ${turn} · ${EVENT_NAMES[event.type]}`, "small-text"));

  const table = document.createElement("table");
  table.className = "diary-table";
  const head = table.insertRow();
  for (const title of ["Показател", "Прогноза", "Резултат", ""]) {
    const th = document.createElement("th");
    th.textContent = title;
    head.append(th);
  }
  for (const d of comparison.details) {
    const row = table.insertRow();
    const before = game.history[game.history.length - 2][d.key];
    const after = game.state[d.key];
    for (const text of [LABELS[d.key], ARROWS[d.predicted], `${before} → ${after} ${ARROWS[d.actual]}`, d.ok ? "✓" : "✗"]) {
      row.insertCell().textContent = text;
    }
  }
  diary.append(table);
  diary.append(paragraph(`Точки за разбиране: ${comparison.points} / 4`, "diary-points"));

  const list = document.createElement("ul");
  list.className = "diary-reasons";
  for (const reason of reasons) {
    const li = document.createElement("li");
    li.textContent = reason;
    list.append(li);
  }
  diary.append(paragraph("Защо?", "diary-why"), list);
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
  document.getElementById("result-points").textContent =
    `Точки за разбиране: ${game.points || 0} от 40. Помисли: кой ход промени долината най-много и защо?`;
  document.getElementById("result-card").hidden = false;
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
  }
  updateNextButton();
}

function updateNextButton() {
  const actionChosen = document.querySelector('#action-list button[aria-pressed="true"]');
  const predictionCount = document.querySelectorAll('.choice-group button[aria-pressed="true"]').length;
  const finished = game && game.state.turn >= 10;
  nextButton.disabled = finished || !canContinue(actionChosen, predictionCount, gameState.dataset.state);

  if (gameState.dataset.state === "error" || finished) return;
  if (!actionChosen) {
    turnMessage.textContent = "Избери действие и направи четири прогнози.";
  } else if (predictionCount < 4) {
    turnMessage.textContent = `Остават ${4 - predictionCount} прогнози преди следващия ход.`;
  } else {
    turnMessage.textContent = "Изборът е готов. Натисни „Следващ ход“.";
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
  actionReasons.textContent = reasons.join(" ") || "Всички действия са достъпни.";
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
  renderActions();
  setGameState("ready", "Готово за избор на действие и прогноза.");
}

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

  renderGame(previous);
  renderDiary(result.state.turn, comparison, result.reasons, result.event);
  resetChoices();
  turnMessage.textContent = `Ход ${result.state.turn} е изигран. Виж „Дневника на причините“ по-долу.`;

  let status = "active";
  if (result.state.turn >= 10) status = showResult().success ? "won" : "lost";

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
  if (!user) return;
  try {
    const saved = await loadLatestGame();
    continueButton.disabled = !saved;
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
renderActions();
document.getElementById("status").textContent = "стъпка 6 · работещ ход";

storageReady = initStorage();
if (storageReady) {
  currentUser().then((found) => {
    user = found;
    renderAccount();
  });
} else {
  saveNote.textContent = "Няма връзка със Supabase — играта не се записва.";
}
