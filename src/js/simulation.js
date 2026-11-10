// Стъпка 6: собствен алгоритъм за един ход.
//
// Тук има само ЧИСТИ функции: получават данни и връщат нови данни.
// Не четат и не пипат HTML. Затова могат да се тестват отделно (tests/simulation.test.cjs).
// Използва actionError() от actionRules.js, който се зарежда преди този файл.
//
// Моделът е ОПРОСТЕН учебен модел, а не научна прогноза за истинска екосистема.

// Всички числа на модела са на едно място, за да се виждат и променят лесно.
const SIM = {
  max: { water: 100, grass: 500, rabbits: 200, foxes: 50 },

  // Какво добавя или отнема всяко действие.
  actions: {
    "plant-grass": { grass: 50, water: -10 },
    "restore-water": { water: 25 },
    "add-rabbits": { rabbits: 6 },
    "add-foxes": { foxes: 2 },
    "none": {},
  },

  evaporation: 2,       // вода, която се изпарява всеки ход
  rainWater: 20,        // дъжд: + вода
  droughtWater: -20,    // суша: − вода
  diseaseLoss: 0.3,     // болест: засегнатият вид губи 30%

  grassGrowth: 0.8,     // най-бърз растеж на тревата за един ход (80%)
  grassPerRabbit: 3,    // колко трева изяжда един заек за един ход
  maxGrazing: 0.5,      // зайците изяждат най-много половината трева (корените остават)

  rabbitBirth: 0.5,     // нови зайци при достатъчно храна (50%)
  rabbitStarve: 0.5,    // загиват от глад, ако няма никаква храна (50%)
  rabbitsPerFox: 1.5,   // колко зайци изяжда една лисица за един ход

  foxBirth: 0.3,        // нови лисици при достатъчно плячка (30%)
  foxStarve: 0.5,       // загиват от глад, ако няма никаква плячка (50%)
  foxDeath: 0.1,        // естествена смърт на лисиците (10%)

  sameThreshold: 0.05,  // промяна до ±5% се брои за „почти без промяна“ (=)
};

// Връща число между min и max.
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Начално състояние на мисия (ход 0).
function createInitialState(mission) {
  return {
    turn: 0,
    water: mission.initialWater,
    grass: mission.start.grass,
    rabbits: mission.start.rabbits,
    foxes: mission.start.foxes,
    waterUses: 0,
    rabbitUses: 0,
    foxUses: 0,
  };
}

// Кое събитие става на даден ход. Ако няма — { type: "none" }.
function eventForTurn(mission, turn) {
  return mission.events[turn] || { type: "none" };
}

// ГЛАВНАТА ФУНКЦИЯ: изчислява един ход.
// state   — състоянието в началото на хода
// action  — "plant-grass", "restore-water", "add-rabbits", "add-foxes" или "none"
// mission — настройките на мисията (missions.js)
// Връща { ok, error, state, event, reasons }. Входният state НЕ се променя.
function simulateTurn(state, action, mission) {
  // 1. ПРОВЕРКА. Невалидно действие не променя нищо.
  if (state.turn >= 10) {
    return { ok: false, error: "Мисията вече приключи след 10 хода.", state, event: null, reasons: [] };
  }
  const error = actionError(action, state);
  if (error) {
    return { ok: false, error, state, event: null, reasons: [] };
  }

  const turn = state.turn + 1;
  const event = eventForTurn(mission, turn);
  const reasons = [];
  const effect = SIM.actions[action];

  // Действието на играча се прилага първо. Получените P, H, C са
  // „стойностите от началото на хода“ — от тях смятаме всичко по-долу.
  const P = Math.min(SIM.max.grass, state.grass + (effect.grass || 0));
  const H = Math.min(SIM.max.rabbits, state.rabbits + (effect.rabbits || 0));
  const C = Math.min(SIM.max.foxes, state.foxes + (effect.foxes || 0));
  if (action === "plant-grass") reasons.push("Засадена трева: трева +50, вода −10.");
  if (action === "restore-water") reasons.push("Възстановен водоем: вода +25.");
  if (action === "add-rabbits") reasons.push("Добавени зайци: +6.");
  if (action === "add-foxes") reasons.push("Добавени лисици: +2.");

  // 2. ВОДА. Действие + събитие − изпарение. Водата се обновява първа,
  // защото тревата трябва да усети дъжда още в същия ход (GAME_DESIGN.md, раздел 5).
  let waterChange = (effect.water || 0) - SIM.evaporation;
  if (event.type === "rain") {
    waterChange += SIM.rainWater;
    reasons.push("Дъжд: вода +20.");
  }
  if (event.type === "drought") {
    waterChange += SIM.droughtWater;
    reasons.push("Суша: вода −20.");
  }
  const W = clamp(state.water + waterChange, 0, SIM.max.water);
  const waterFactor = W / SIM.max.water; // 0 = суха долина, 1 = пълен водоем

  // 3. ТРЕВА. Расте според водата и свободното място; зайците я ядат.
  const freeSpace = 1 - P / SIM.max.grass;              // 0 = няма място, 1 = празно поле
  const grassGrown = SIM.grassGrowth * P * freeSpace * waterFactor;
  const grassEaten = Math.min(SIM.maxGrazing * P, SIM.grassPerRabbit * H);
  let newGrass = P + grassGrown - grassEaten;

  if (W === 0) reasons.push("Няма вода → тревата не расте.");
  else if (waterFactor < 0.3) reasons.push("Малко вода → тревата расте бавно.");

  // 4. ЗАЙЦИ. Колко от нужната храна имат (0 до 1).
  const food = H > 0 ? Math.min(1, grassEaten / (SIM.grassPerRabbit * H)) : 0;
  // За малки са нужни поне 2 зайци. Без това правило 1 заек „раждаше“ 0,5 заек,
  // закръгляше се до 1 и последният заек не изчезваше никога.
  const rabbitsBorn = H >= 2 ? SIM.rabbitBirth * H * food : 0;
  const rabbitsStarved = SIM.rabbitStarve * H * (1 - food);
  const rabbitsHunted = Math.min(H, SIM.rabbitsPerFox * C);
  let newRabbits = H + rabbitsBorn - rabbitsStarved - rabbitsHunted;

  if (H > 0 && food < 1) reasons.push("Тревата не стига за всички зайци → част от тях гладуват.");
  if (H > 0 && grassEaten > grassGrown) reasons.push("Зайците изяждат повече трева, отколкото пораства → тревата намалява.");

  // 5. ЛИСИЦИ. Колко от нужната плячка имат (0 до 1).
  const prey = C > 0 ? Math.min(1, H / (SIM.rabbitsPerFox * C)) : 0;
  // При H = 0 → prey = 0 → няма нови лисици. И тук са нужни поне 2 лисици.
  const foxesBorn = C >= 2 ? SIM.foxBirth * C * prey : 0;
  const foxesStarved = SIM.foxStarve * C * (1 - prey);
  const foxesDied = SIM.foxDeath * C;
  let newFoxes = C + foxesBorn - foxesStarved - foxesDied;

  if (C > 0 && H === 0) reasons.push("Няма зайци → лисиците нямат плячка и не се размножават.");
  else if (C > 0 && prey < 1) reasons.push("Малко зайци за лисиците → част от лисиците гладуват.");
  if (C > 0 && rabbitsHunted > 0) reasons.push("Лисиците ловуват зайци → зайците намаляват.");

  // Болестта отнема част от засегнатия вид (от стойността в началото на хода).
  if (event.type === "disease") {
    const names = { grass: "тревата", rabbits: "зайците", foxes: "лисиците" };
    const start = { grass: P, rabbits: H, foxes: C };
    const loss = SIM.diseaseLoss * start[event.species];
    if (event.species === "grass") newGrass -= loss;
    if (event.species === "rabbits") newRabbits -= loss;
    if (event.species === "foxes") newFoxes -= loss;
    reasons.push(`Болест при ${names[event.species]} → −30%.`);
  }

  // 6. КРАЙ. Цели числа (нормално закръгляне), между 0 и максимума.
  const next = {
    turn,
    water: W,
    grass: clamp(Math.round(newGrass), 0, SIM.max.grass),
    rabbits: clamp(Math.round(newRabbits), 0, SIM.max.rabbits),
    foxes: clamp(Math.round(newFoxes), 0, SIM.max.foxes),
    waterUses: state.waterUses + (action === "restore-water" ? 1 : 0),
    rabbitUses: state.rabbitUses + (action === "add-rabbits" ? 1 : 0),
    foxUses: state.foxUses + (action === "add-foxes" ? 1 : 0),
  };

  if (P > 0 && next.grass === 0) reasons.push("Тревата изчезна от долината.");
  if (H > 0 && next.rabbits === 0) reasons.push("Зайците изчезнаха от долината.");
  if (C > 0 && next.foxes === 0) reasons.push("Лисиците изчезнаха от долината.");
  if (reasons.length === 0) reasons.push("Спокоен ход: долината се променя бавно.");

  return { ok: true, error: null, state: next, event, reasons };
}

// Посока на промяна: "up", "same" или "down".
function changeDirection(before, after) {
  if (before === 0) return after === 0 ? "same" : "up";
  const change = (after - before) / before;
  if (Math.abs(change) <= SIM.sameThreshold) return "same";
  return change > 0 ? "up" : "down";
}

// Сравнява прогнозата на ученика с резултата. 1 точка за всяка вярна стрелка.
// prediction = { water: "up", grass: "same", rabbits: "down", foxes: "up" }
function comparePrediction(before, after, prediction) {
  const details = [];
  let points = 0;
  for (const key of ["water", "grass", "rabbits", "foxes"]) {
    const actual = changeDirection(before[key], after[key]);
    const ok = prediction[key] === actual;
    if (ok) points += 1;
    details.push({ key, predicted: prediction[key], actual, ok });
  }
  return { points, details };
}

// Проверява условието за успех след края на мисията.
// history = [начално състояние, след ход 1, ..., след ход 10]
function evaluateGoal(mission, history) {
  const last = history[history.length - 1];
  const allAlive = last.grass > 0 && last.rabbits > 0 && last.foxes > 0;
  const conditions = [];
  const goal = mission.goal;

  if (goal.type === "all_alive") {
    conditions.push({ text: "Тревата, зайците и лисиците са живи след 10 хода.", ok: allAlive });
  }
  if (goal.type === "water_min") {
    const waterOk = history.slice(1).every((s) => s.water >= goal.minWater);
    conditions.push({ text: `Водата е поне ${goal.minWater} след всеки ход.`, ok: waterOk });
    conditions.push({ text: "И трите вида са живи.", ok: allAlive });
  }
  if (goal.type === "min_counts") {
    conditions.push({ text: `Тревата е поне ${goal.min.grass}.`, ok: last.grass >= goal.min.grass });
    conditions.push({ text: `Зайците са поне ${goal.min.rabbits}.`, ok: last.rabbits >= goal.min.rabbits });
  }
  if (goal.type === "stable") {
    conditions.push({ text: "И трите вида са живи.", ok: allAlive });
    let stable = history.length > goal.lastTurns;
    for (let i = history.length - goal.lastTurns; i < history.length && stable; i++) {
      for (const key of ["grass", "rabbits", "foxes"]) {
        const before = Math.max(history[i - 1][key], 1);
        if (Math.abs(history[i][key] - history[i - 1][key]) / before >= goal.maxChange) stable = false;
      }
    }
    conditions.push({ text: `В последните ${goal.lastTurns} хода всеки вид се променя с под ${goal.maxChange * 100}%.`, ok: stable });
  }
  if (goal.type === "all_alive_and_water") {
    conditions.push({ text: "И трите вида са живи.", ok: allAlive });
    conditions.push({ text: "В долината има вода.", ok: last.water > 0 });
  }

  const finished = history.length === 11;
  conditions.unshift({ text: "Изиграни са всичките 10 хода.", ok: finished });
  return { success: conditions.every((c) => c.ok), conditions };
}
