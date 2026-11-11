const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Проверяваме данните за същата графика, която използва браузърът.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync("src/js/historyChart.js", "utf8"), context);
vm.runInContext(fs.readFileSync("src/js/missions.js", "utf8"), context);

const first = { turn: 0, water: 50, grass: 200, rabbits: 20, foxes: 5 };
const second = { turn: 1, water: 40, grass: 250, rabbits: 30, foxes: 4 };

test("графиката има четири линии и точка за всеки ход", () => {
  const data = context.chartData([first, second]);
  assert.deepEqual(Array.from(data.labels), ["0", "1"]);
  assert.deepEqual(Array.from(data.datasets, (line) => line.label), ["Вода", "Трева", "Зайци", "Лисици"]);
  assert.deepEqual(Array.from(data.datasets[0].data), [50, 40]);
  assert.deepEqual(Array.from(data.datasets[1].data), [40, 50]);
  assert.deepEqual(Array.from(data.datasets[3].rawValues), [5, 4]);
});

test("ключовите ходове са трите с най-голяма промяна", () => {
  const entries = [
    { turn: 1, before: first, after: { ...first, water: 49 } },
    { turn: 2, before: first, after: { ...first, grass: 300 } },
    { turn: 3, before: first, after: { ...first, rabbits: 50 } },
    { turn: 4, before: first, after: { ...first, foxes: 15 } },
  ];
  assert.deepEqual(Array.from(context.keyDecisions(entries), (entry) => entry.turn), [2, 4, 3]);
});

test("петте мисии са достъпни", () => {
  assert.deepEqual(Array.from(vm.runInContext("MISSIONS.map(m => m.locked)", context)),
    [false, false, false, false, false]);
});
