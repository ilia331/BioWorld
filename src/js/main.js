// Стъпка 3: екрани и навигация. Числата засега са примерни.
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
let selectedMission = missions[0];

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
  showScreen("game");
  backButton.focus();
});

backButton.addEventListener("click", () => {
  showScreen("missions");
  startButton.focus();
});

// Изборите се отбелязват визуално. Истинският ход ще се изчислява в simulation.js.
function chooseOne(button, group) {
  for (const choice of group.querySelectorAll("button:not(:disabled)")) {
    choice.setAttribute("aria-pressed", choice === button ? "true" : "false");
  }
  updateNextButton();
}

function updateNextButton() {
  const actionChosen = document.querySelector('#action-list button[aria-pressed="true"]');
  const predictions = document.querySelectorAll('.choice-group button[aria-pressed="true"]');
  nextButton.disabled = !actionChosen || predictions.length !== 4;
}

for (const group of document.querySelectorAll(".choice-group")) {
  group.addEventListener("click", (event) => {
    if (event.target.tagName === "BUTTON") chooseOne(event.target, group);
  });
}

const actionList = document.getElementById("action-list");
actionList.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button && !button.disabled) chooseOne(button, actionList);
});

nextButton.addEventListener("click", () => {
  turnMessage.textContent = "Прогнозата и действието са избрани. Изчисляването на хода ще бъде добавено в следваща стъпка.";
});

showMissions();
document.getElementById("status").textContent = "демо интерфейс · стъпка 3";
