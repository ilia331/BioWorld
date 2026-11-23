// Стъпка 8: съобщенията за грешки от Supabase трябва да са разбираеми за ученика.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// storage.js очаква window; без библиотеката на Supabase не се свързва никъде.
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync("src/js/storage.js", "utf8"), context);
const friendlyError = vm.runInContext("friendlyError", context);
const check = vm.runInContext("check", context);

test("без интернет или при спряна база ученикът вижда ясно съобщение на български", () => {
  assert.match(friendlyError("TypeError: Failed to fetch"), /няма връзка с базата/);
  assert.throws(() => check({ error: { message: "Failed to fetch" } }, "Вход"), /Вход: няма връзка/);
});

test("честите грешки при вход и регистрация са преведени, непознатите остават", () => {
  assert.match(friendlyError("Invalid login credentials"), /грешен имейл или парола/);
  assert.match(friendlyError("User already registered"), /вече е регистриран/);
  assert.match(friendlyError("Password should be at least 6 characters."), /поне 6 знака/);
  assert.equal(friendlyError("some new error"), "some new error");
  assert.equal(check({ data: [1], error: null }, "Мисии")[0], 1);
});
