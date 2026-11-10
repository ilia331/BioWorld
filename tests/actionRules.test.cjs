const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Пускаме същия файл, който браузърът зарежда преди main.js.
const source = fs.readFileSync("src/js/actionRules.js", "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const actionError = context.actionError;
const canContinue = context.canContinue;

const normal = {
  water: 48, grass: 212, rabbits: 24, foxes: 4,
  waterUses: 0, rabbitUses: 0, foxUses: 0,
};

test("обикновените действия са допустими", () => {
  for (const action of ["plant-grass", "restore-water", "add-rabbits", "add-foxes", "none"]) {
    assert.equal(actionError(action, normal), null);
  }
});

test("тревата и водоемът спазват водата и максимумите", () => {
  assert.match(actionError("plant-grass", { ...normal, water: 9 }), /10 вода/);
  assert.match(actionError("plant-grass", { ...normal, grass: 500 }), /максимума/);
  assert.match(actionError("restore-water", { ...normal, waterUses: 2 }), /2 пъти/);
  assert.match(actionError("restore-water", { ...normal, water: 100 }), /максимума/);
});

test("зайците и лисиците спазват ограниченията", () => {
  assert.match(actionError("add-rabbits", { ...normal, rabbitUses: 3 }), /3 пъти/);
  assert.match(actionError("add-rabbits", { ...normal, rabbits: 200 }), /максимума/);
  assert.match(actionError("add-foxes", { ...normal, foxUses: 2 }), /2 пъти/);
  assert.match(actionError("add-foxes", { ...normal, foxes: 50 }), /максимума/);
});

test("без намеса е позволено, а непознато действие се отказва", () => {
  assert.equal(actionError("none", { ...normal, water: 0 }), null);
  assert.match(actionError("unknown", normal), /Непознато/);
});

test("следващият ход иска действие, четири прогнози и готов екран", () => {
  assert.equal(canContinue(null, 4, "ready"), false);
  assert.equal(canContinue("none", 3, "ready"), false);
  assert.equal(canContinue("none", 4, "loading"), false);
  assert.equal(canContinue("none", 4, "error"), false);
  assert.equal(canContinue("none", 4, "ready"), true);
});
