// Стъпки 3 и 5: екрани, навигация и проверка на действията.
const missions = [
  { number: 1, title: "Първи живот", goal: "И трите вида оцеляват 10 хода.", level: "🌿", locked: false },
  { number: 2, title: "Пресъхналият поток", goal: "Водата остава над прага.", level: "🌿🌿", locked: false },
  { number: 3, title: "Твърде много зайци", goal: "Тревата и зайците остават жизнеспособни.", level: "🌿🌿", locked: false },
  { number: 4, title: "Изчезващият хищник", goal: "Популациите се стабилизират.", level: "🌿🌿🌿", locked: true },
  { number: 5, title: "Непредвидима година", goal: "Запази устойчив баланс.", level: "🌿🌿🌿", locked: true },
];

const missionList = document.getElementById("mission-list");
const missionsScreen = document.getElementById("missions-screen");
const gameScreen = document.getElementById("game-screen");
const startButton = document.getElementById("start-button");
const backButton = document.getElementById("back-button");
const nextButton = document.getElementById("next-button");
const turnMessage = document.getElementById("turn-message");
const actionList = document.getElementById("action-list");
const actionMessage = document.getElementById("action-message");
const actionReasons = document.getElementById("action-reasons");
const gameState = document.getElementById("game-state");
let selectedMission = missions[0];

// Примерни данни за интерфейса. Реалното състояние ще дойде от симулацията.
const demoState = {
  water: 48, grass: 212, rabbits: 24, foxes: 4,
  waterUses: 0, rabbitUses: 0, foxUses: 2,
};

// Правим картите от данните, за да не повтаряме един и същ HTML пет пъти.
function showMissions() {
  for (const mission of missions) {
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
    goal.textContent = `Цел: ${mission.goal}`;
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

startButton.addEventListener("click", () => {
  document.getElementById("game-title").textContent =
    `Мисия ${selectedMission.number}: ${selectedMission.title}`;
  document.getElementById("game-goal").textContent = `Цел: ${selectedMission.goal}`;
  resetChoices();
  showScreen("game");
  backButton.focus();
});

backButton.addEventListener("click", () => {
  showScreen("missions");
  startButton.focus();
});

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
  nextButton.disabled = !canContinue(actionChosen, predictionCount, gameState.dataset.state);

  if (gameState.dataset.state === "error") return;
  if (!actionChosen) {
    turnMessage.textContent = "Избери действие и направи четири прогнози.";
  } else if (predictionCount < 4) {
    turnMessage.textContent = `Остават ${4 - predictionCount} прогнози преди следващия ход.`;
  } else {
    turnMessage.textContent = "Изборът е готов. В този прототип ходът още не се изчислява.";
  }
}

// Недопустимите действия се показват сиви и с видима причина.
function renderActions() {
  const reasons = [];
  for (const button of actionList.querySelectorAll("button[data-action]")) {
    const error = actionError(button.dataset.action, demoState);
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
  for (const button of gameScreen.querySelectorAll('button[aria-pressed]')) {
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

nextButton.addEventListener("click", () => {
  setGameState("error", "Ходът не може да се изчисли: алгоритъмът ще бъде добавен в стъпка 6.");
  turnMessage.textContent = "Изборите остават на екрана. Върни състояние „Готово“, за да ги промениш.";
});

// Преглед на състоянията, без да се прави заявка към база данни.
for (const button of document.querySelectorAll("[data-preview-state]")) {
  button.addEventListener("click", () => {
    const state = button.dataset.previewState;
    if (state === "loading") {
      setGameState("loading", "Пример: зареждане на данните…");
    } else if (state === "error") {
      setGameState("error", "Пример за грешка: данните не можаха да се заредят.");
    } else {
      setGameState("ready", "Готово за избор на действие и прогноза.");
    }
  });
}

showMissions();
renderActions();
document.getElementById("status").textContent = "демо интерфейс · стъпка 5";
