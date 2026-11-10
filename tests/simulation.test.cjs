// Тестове на алгоритъма от стъпка 6. Пускане: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Зареждаме същите файлове, които зарежда и браузърът, в същия ред.
const context = vm.createContext({});
for (const file of ["actionRules.js", "simulation.js", "missions.js"]) {
  vm.runInContext(fs.readFileSync(`src/js/${file}`, "utf8"), context);
}
const { simulateTurn, createInitialState, comparePrediction, evaluateGoal } = context;
const SIM = vm.runInContext("SIM", context);
const MISSIONS = vm.runInContext("MISSIONS", context);
const mission1 = MISSIONS[0];
const mission2 = MISSIONS[1];

// Мисия без събития — за тестове, в които събитие би пречило.
const calm = { ...mission1, events: {} };

function state(values) {
  return { turn: 0, waterUses: 0, rabbitUses: 0, foxUses: 0, ...values };
}

// Изиграва цяла мисия с дадения план (10 действия).
function play(mission, plan) {
  let current = createInitialState(mission);
  const history = [current];
  for (const action of plan) {
    let result = simulateTurn(current, action, mission);
    if (!result.ok) result = simulateTurn(current, "none", mission);
    current = result.state;
    history.push(current);
  }
  return history;
}

// ---------- Трите ръчни примера (сметнати на ръка в TESTS.md) ----------

test("ръчен пример 1: нормален ход в мисия 1", () => {
  const result = simulateTurn(createInitialState(mission1), "none", mission1);
  assert.equal(result.ok, true);
  assert.deepEqual(
    { water: result.state.water, grass: result.state.grass, rabbits: result.state.rabbits, foxes: result.state.foxes },
    { water: 58, grass: 196, rabbits: 24, foxes: 5 },
  );
});

test("ръчен пример 2: суша в мисия 2, ход 3", () => {
  const start = state({ turn: 2, water: 26, grass: 95, rabbits: 21, foxes: 5 });
  const result = simulateTurn(start, "none", mission2);
  assert.equal(result.event.type, "drought");
  assert.deepEqual(
    { water: result.state.water, grass: result.state.grass, rabbits: result.state.rabbits, foxes: result.state.foxes },
    { water: 4, grass: 50, rabbits: 19, foxes: 6 },
  );
});

test("ръчен пример 3: лисици без плячка", () => {
  const start = state({ water: 50, grass: 300, rabbits: 0, foxes: 6 });
  const result = simulateTurn(start, "none", calm);
  assert.deepEqual(
    { water: result.state.water, grass: result.state.grass, rabbits: result.state.rabbits, foxes: result.state.foxes },
    { water: 48, grass: 346, rabbits: 0, foxes: 2 },
  );
  assert.ok(result.reasons.some((r) => r.includes("Няма зайци")));
});

// ---------- Задължителни гранични случаи ----------

test("при нула вода тревата не расте", () => {
  const start = state({ water: 2, grass: 100, rabbits: 0, foxes: 0 }); // изпарението сваля водата до 0
  const result = simulateTurn(start, "none", calm);
  assert.equal(result.state.water, 0);
  assert.equal(result.state.grass, 100);
  assert.ok(result.reasons.includes("Няма вода → тревата не расте."));
});

test("при нула зайци лисиците не се размножават", () => {
  const start = state({ water: 60, grass: 200, rabbits: 0, foxes: 10 });
  const result = simulateTurn(start, "none", calm);
  assert.ok(result.state.foxes < 10);
});

test("стойностите никога не са отрицателни и не надхвърлят максимума", () => {
  const actions = ["plant-grass", "restore-water", "add-rabbits", "add-foxes", "none"];
  let seed = 42;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const mission of MISSIONS) {
    for (let game = 0; game < 200; game++) {
      const plan = Array.from({ length: 10 }, () => actions[Math.floor(random() * 5)]);
      for (const s of play(mission, plan)) {
        for (const key of ["water", "grass", "rabbits", "foxes"]) {
          assert.ok(Number.isInteger(s[key]), `${key} трябва да е цяло число`);
          assert.ok(s[key] >= 0 && s[key] <= SIM.max[key], `${key} = ${s[key]} е извън границите`);
        }
      }
    }
  }
});

test("изчезнал вид не се появява сам", () => {
  const start = state({ water: 80, grass: 300, rabbits: 1, foxes: 3 });
  let current = simulateTurn(start, "none", calm).state;
  assert.equal(current.rabbits, 0);
  for (let i = 0; i < 5; i++) current = simulateTurn(current, "none", calm).state;
  assert.equal(current.rabbits, 0);
});

// ---------- Проверка на действията и правилата ----------

test("невалидно действие не променя състоянието", () => {
  const start = state({ water: 5, grass: 100, rabbits: 10, foxes: 2 });
  const copy = { ...start };
  const result = simulateTurn(start, "plant-grass", calm);
  assert.equal(result.ok, false);
  assert.match(result.error, /10 вода/);
  assert.deepEqual(result.state, copy);
});

test("входното състояние не се променя, а резултатът е еднакъв при еднакъв вход", () => {
  // JSON прави обикновени данни: обектите от vm имат друг прототип и иначе не се сравняват.
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const start = createInitialState(mission1);
  const copy = plain(start);
  const first = simulateTurn(start, "plant-grass", mission1);
  const second = simulateTurn(start, "plant-grass", mission1);
  assert.deepEqual(plain(start), copy);
  assert.deepEqual(plain(first), plain(second));
});

test("водоемът се възстановява най-много 2 пъти", () => {
  let current = state({ water: 10, grass: 100, rabbits: 5, foxes: 1 });
  current = simulateTurn(current, "restore-water", calm).state;
  current = simulateTurn(current, "restore-water", calm).state;
  assert.equal(current.waterUses, 2);
  const third = simulateTurn(current, "restore-water", calm);
  assert.equal(third.ok, false);
});

test("дъждът добавя вода и тревата расте повече, отколкото без дъжд", () => {
  const start = state({ turn: 4, water: 30, grass: 150, rabbits: 0, foxes: 0 });
  const withRain = simulateTurn(start, "none", mission1); // ход 5 в мисия 1 = дъжд
  const withoutRain = simulateTurn(start, "none", calm);
  assert.equal(withRain.event.type, "rain");
  assert.equal(withRain.state.water, 30 + 20 - 2);
  assert.ok(withRain.state.grass > withoutRain.state.grass);
});

test("болестта отнема 30% от засегнатия вид", () => {
  const sick = { ...calm, events: { 1: { type: "disease", species: "foxes" } } };
  const start = state({ water: 60, grass: 200, rabbits: 30, foxes: 10 });
  const healthy = simulateTurn(start, "none", calm).state.foxes;
  const ill = simulateTurn(start, "none", sick).state.foxes;
  assert.equal(healthy - ill, 3); // 30% от 10
});

test("след 10 хода не може да се играе повече", () => {
  const history = play(mission1, Array(10).fill("none"));
  assert.equal(history.length, 11);
  assert.deepEqual(history.map((s) => s.turn), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const extra = simulateTurn(history[10], "none", mission1);
  assert.equal(extra.ok, false);
});

// ---------- Прогноза и условие за успех ----------

test("прогнозата: до ±5% е „=“, точка за всяка вярна стрелка", () => {
  const before = { water: 100, grass: 100, rabbits: 100, foxes: 100 };
  const after = { water: 105, grass: 106, rabbits: 90, foxes: 100 };
  const result = comparePrediction(before, after, { water: "same", grass: "up", rabbits: "up", foxes: "same" });
  assert.equal(result.points, 3);
  assert.equal(result.details.find((d) => d.key === "rabbits").actual, "down");
});

test("мисия 1: оцеляване = успех, изчезнал вид = неуспех", () => {
  const history = play(mission1, Array(10).fill("none"));
  assert.equal(evaluateGoal(mission1, history).success, true);
  const dead = [...history.slice(0, 10), { ...history[10], foxes: 0 }];
  assert.equal(evaluateGoal(mission1, dead).success, false);
});

test("мисия 2: без намеса водата пада под 20 и мисията е неуспешна", () => {
  const history = play(mission2, Array(10).fill("none"));
  const result = evaluateGoal(mission2, history);
  assert.equal(result.success, false);
  assert.equal(result.conditions.find((c) => c.text.includes("Водата")).ok, false);
});

// ---------- Данните на мисиите съвпадат с базата ----------

test("missions.js съвпада с database/seed.sql", () => {
  const seed = fs.readFileSync("database/seed.sql", "utf8");
  const names = { grass: "grass", rabbits: "rabbit", foxes: "fox" };
  for (const m of MISSIONS) {
    const row = new RegExp(`\\(${m.number}, '[^']+', (\\d+), 100, '([\\s\\S]*?)'\\)`).exec(seed);
    assert.ok(row, `мисия ${m.number} липсва в seed.sql`);
    assert.equal(Number(row[1]), m.initialWater, `вода в мисия ${m.number}`);
    const settings = JSON.parse(row[2]);
    for (const key of ["grass", "rabbits", "foxes"]) {
      assert.equal(settings.start[names[key]], m.start[key], `${key} в мисия ${m.number}`);
    }
    assert.deepEqual(Object.keys(settings.events).map(Number), Object.keys(m.events).map(Number));
  }
});
