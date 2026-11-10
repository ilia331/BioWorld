// Стъпка 6: вход, регистрация, запис и зареждане чрез Supabase.
//
// Тук е само ПУБЛИЧНИЯТ (publishable) ключ. Той е предназначен за браузъра и може
// да е в GitHub: какво може да вижда и променя всеки потребител решават RLS правилата
// в database/schema.sql (проверени с database/rls_test.sql).
// ТАЙНИЯТ ключ (sb_secret_...) НИКОГА не се слага тук.
const SUPABASE_URL = "https://tngqxownavbimxofqork.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TiEzy7WmgRs18ILNKFnIOQ_ZnOjyJdO";

let db = null;          // връзката към Supabase
let speciesIds = null;  // { grass: "uuid", rabbit: "uuid", fox: "uuid" }
let ecosystemIds = null; // { 1: "uuid", 2: "uuid", ... }

// В играта имената са на английски с „-“, а в базата — с „_“ (виж CHECK в schema.sql).
const DB_ACTIONS = {
  "plant-grass": "plant_grass",
  "restore-water": "restore_pond",
  "add-rabbits": "add_rabbits",
  "add-foxes": "add_foxes",
  "none": "none",
};
// В играта: rabbits/foxes; в таблицата species: rabbit/fox.
const DB_SPECIES = { grass: "grass", rabbits: "rabbit", foxes: "fox" };

// Връща true, ако библиотеката на Supabase се е заредила (иначе няма интернет).
function initStorage() {
  if (!window.supabase) return false;
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return true;
}

// Хвърля грешка с разбираем текст, ако Supabase е върнал грешка.
function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

// ---------- Вход и регистрация ----------

async function currentUser() {
  const { data } = await db.auth.getSession();
  return data.session ? data.session.user : null;
}

async function signUp(email, password) {
  const data = check(await db.auth.signUp({ email, password }), "Регистрация");
  // Ако в Supabase е включено потвърждение по имейл, сесия още няма.
  return { user: data.user, needsConfirmation: !data.session };
}

async function signIn(email, password) {
  return check(await db.auth.signInWithPassword({ email, password }), "Вход").user;
}

async function signOut() {
  check(await db.auth.signOut(), "Изход");
}

// ---------- Справочни данни (зареждат се веднъж) ----------

async function loadIds() {
  if (speciesIds && ecosystemIds) return;
  const species = check(await db.from("species").select("id, code"), "Видове");
  const ecosystems = check(await db.from("ecosystems").select("id, mission_no"), "Мисии");
  speciesIds = {};
  for (const row of species) speciesIds[row.code] = row.id;
  ecosystemIds = {};
  for (const row of ecosystems) ecosystemIds[row.mission_no] = row.id;
}

function usesToJson(state) {
  return { restore_pond: state.waterUses, add_rabbits: state.rabbitUses, add_foxes: state.foxUses };
}

function populationRows(simulationId, state) {
  return Object.keys(DB_SPECIES).map((key) => ({
    simulation_id: simulationId,
    species_id: speciesIds[DB_SPECIES[key]],
    count: state[key],
  }));
}

// ---------- Запис ----------

// Създава нова игра в базата и връща нейния id.
async function createSimulation(missionNumber, state) {
  await loadIds();
  const simulation = check(
    await db.from("simulations")
      .insert({ ecosystem_id: ecosystemIds[missionNumber], water: state.water, turn_no: 0, actions_used: usesToJson(state) })
      .select("id")
      .single(),
    "Нова игра",
  );
  check(await db.from("populations").insert(populationRows(simulation.id, state)), "Популации");
  return simulation.id;
}

// Записва един изигран ход: новото състояние, популациите и реда в историята.
// entry = { action, event, prediction, reasons, points }
async function saveTurn(simulationId, state, entry, status) {
  await loadIds();
  check(
    await db.from("simulations")
      .update({
        turn_no: state.turn,
        water: state.water,
        status,
        actions_used: usesToJson(state),
        updated_at: new Date().toISOString(),
      })
      .eq("id", simulationId),
    "Запис на играта",
  );
  check(
    await db.from("populations").upsert(populationRows(simulationId, state), { onConflict: "simulation_id,species_id" }),
    "Запис на популациите",
  );
  check(
    await db.from("simulation_history").insert({
      simulation_id: simulationId,
      turn_no: state.turn,
      action: DB_ACTIONS[entry.action],
      event: entry.event.type,
      prediction: entry.prediction,
      snapshot: { water: state.water, grass: state.grass, rabbits: state.rabbits, foxes: state.foxes },
      reason: entry.reasons.join(" "),
      understanding_points: entry.points,
    }),
    "Запис на хода",
  );
}

// ---------- Зареждане ----------

// Връща последната незавършена игра на влезлия ученик или null.
// Резултат: { id, missionNumber, state, history, lastEntry }
async function loadLatestGame() {
  const simulation = check(
    await db.from("simulations")
      .select("id, turn_no, water, actions_used, ecosystems(mission_no), populations(count, species(code))")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Зареждане на играта",
  );
  if (!simulation) return null;

  const counts = {};
  for (const p of simulation.populations) counts[p.species.code] = p.count;
  const uses = simulation.actions_used || {};
  const state = {
    turn: simulation.turn_no,
    water: simulation.water,
    grass: counts.grass,
    rabbits: counts.rabbit,
    foxes: counts.fox,
    waterUses: uses.restore_pond || 0,
    rabbitUses: uses.add_rabbits || 0,
    foxUses: uses.add_foxes || 0,
  };

  const rows = check(
    await db.from("simulation_history")
      .select("turn_no, snapshot, reason, understanding_points")
      .eq("simulation_id", simulation.id)
      .order("turn_no"),
    "Зареждане на историята",
  );
  const history = rows.map((row) => ({ turn: row.turn_no, ...row.snapshot }));
  const last = rows[rows.length - 1] || null;

  return { id: simulation.id, missionNumber: simulation.ecosystems.mission_no, state, history, lastEntry: last };
}
