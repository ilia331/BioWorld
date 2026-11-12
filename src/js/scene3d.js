// 3D долина — Three.js r186 от CDN (importmap в index.html). Няма npm и няма build.
//
// Стил: стилизиран low-poly с меко PBR осветление, мъгла и градиентно небе.
// Файлът само ПОКАЗВА game.state: чете водата, тревата, зайците и лисиците и не
// променя нищо в играта. main.js вика Scene3D.update() от renderGame().
// Ако модулът не се зареди (няма интернет, няма WebGL), остава 2D картинката (SVG).
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// ---------- Настройки ----------
const MAX_GRASS = 260;          // туфи трева при 500 трева
const RABBITS_PER_MODEL = 4;    // 1 модел заек = 4 зайци → най-много 50 модела
const FOXES_PER_MODEL = 1;      // 1 модел лисица = 1 лисица
const MAX_MODELS = 50;
const RAIN_STREAKS = 260;
const ANIM_MS = 650;            // плавна промяна след ход
const MOOD_MS = 1200;           // плавна смяна на атмосферата при събитие
const POND = { x: -2.6, z: 1.4, radius: 4.2, depth: 0.9 };
const VALLEY_RIM = 0.7;         // височина на ръба на долината

// Хармонична, леко приглушена природна палитра (от 2D долината и интерфейса).
const PALETTE = {
  meadow: 0x7b8f55, meadowShade: 0x667c47, shore: 0x8c7856, mud: 0x5f4d38,
  dryTint: 0xd8c08a,
  grassRoot: 0x4f6634, grassTip: 0xb2bd76, grassDry: 0xc9b07a,
  waterDeep: 0x2c5f6b, waterMurky: 0x6b6446,
  hills: 0x5f7d72, hillsFar: 0x7f998d,
  pine: 0x284d3f, pineLight: 0x3a6a4f, roundTree: 0x45704d, trunk: 0x4b3e2e,
  rock: 0x8b8473,
  rabbit: 0xcfc2a6, rabbitLight: 0xe8dcc4, rabbitEar: 0xc3a08f,
  fox: 0xb4633a, foxLight: 0xe9dfcf, foxDark: 0x3d2c22,
  rain: 0xcfe0e4,
};

// Атмосфера според събитието: небе, мъгла, слънце, отражения, експонация.
const MOODS = {
  none:    { top: 0x5d8c96, horizon: 0xd0d7ba, bottom: 0x9fae86, sun: 0xffe7c2, sunI: 2.3, hemi: 0.4,  env: 0.4,  exposure: 1.0,  fog: 1.0 },
  rain:    { top: 0x40606b, horizon: 0x98aca8, bottom: 0x7d8e83, sun: 0xd2e0e8, sunI: 1.0, hemi: 0.55, env: 0.5,  exposure: 0.95, fog: 0.72 },
  drought: { top: 0xa18d62, horizon: 0xe8d09b, bottom: 0xc4aa78, sun: 0xffcf92, sunI: 2.8, hemi: 0.3,  env: 0.35, exposure: 1.08, fog: 0.78 },
  disease: { top: 0x5e7b78, horizon: 0xc0c8b0, bottom: 0x949f82, sun: 0xeee6d2, sunI: 1.8, hemi: 0.4,  env: 0.4,  exposure: 0.95, fog: 0.9 },
};

// ---------- Интерактивност: текстове и връзки ----------
const ACCENT = 0xf0c774;        // златният акцент от интерфейса (подсветка)
const GHOST = 0xf4efda;         // кремав „призрачен“ цвят (preview)
const CHAIN = ["water", "grass", "rabbits", "foxes"];          // хранителната верига
const LINK_TEXT = { grass: "нужна за растежа", rabbits: "храна", foxes: "плячка" }; // надпис на стрелката към вида
const NAMES = { water: "вода", grass: "трева", rabbits: "зайци", foxes: "лисици" };
const ACTION_NAMES = { "plant-grass": "засаждане", "restore-water": "водоем", "add-rabbits": "нови зайци", "add-foxes": "нови лисици" };

// Числата се четат от SIM в simulation.js (само четене) — така текстът винаги съвпада с правилата.
function rule(action, key, fallback) {
  const actions = typeof SIM !== "undefined" ? SIM.actions : null;
  return actions && actions[action] && actions[action][key] !== undefined ? actions[action][key] : fallback;
}

// Обяснителна карта за всеки вид: роля във веригата и как действията го променят.
const INFO = {
  water: {
    icon: "water-icon", title: "Вода (Water)", max: 100,
    role: "Условие на средата (environment). Колкото повече вода, толкова по-бързо расте тревата. При 0 вода тревата не расте.",
    actions: () => `„Възстанови водоем“ дава +${rule("restore-water", "water", 25)}. „Засади трева“ струва ${-rule("plant-grass", "water", -10)} вода. Дъждът добавя, сушата и изпарението отнемат.`,
    from: "дъжд, суша, водоема", to: "трева",
  },
  grass: {
    icon: "grass-icon", title: "Трева (Grass)", max: 500,
    role: "Производител (producer). Расте с вода и слънце и е храна за зайците. Близо до 500 расте по-бавно — няма място.",
    actions: () => `„Засади трева“ дава +${rule("plant-grass", "grass", 50)}. Много зайци я изяждат по-бързо, отколкото пораства.`,
    from: "вода, зайци (ядат я)", to: "зайци",
  },
  rabbits: {
    icon: "rabbit-icon", title: "Зайци (Rabbits)",
    role: `Тревопасни (herbivores). Ядат трева; ако тя не стига, гладуват. Лисиците ги ловуват. 1 модел = ${RABBITS_PER_MODEL} зайци.`,
    actions: () => `„Добави зайци“ дава +${rule("add-rabbits", "rabbits", 6)}. Повече зайци → по-малко трева и повече храна за лисиците.`,
    from: "трева, лисици (ловуват ги)", to: "трева, лисици",
  },
  foxes: {
    icon: "fox-icon", title: "Лисици (Foxes)",
    role: "Хищници (predators). Ловуват зайци. Без зайци гладуват и не се размножават.",
    actions: () => `„Добави лисици“ дава +${rule("add-foxes", "foxes", 2)}. Повече лисици → по-малко зайци → тревата си почива.`,
    from: "зайци", to: "зайци",
  },
};

const svg = document.getElementById("valley-scene");
const box = document.getElementById("valley-3d");
const toggle = document.getElementById("view-toggle");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

// Качество: телефон без bloom и с по-малка карта на сенките. Ако кадрите паднат
// под ~45 в секунда, качеството се намалява стъпка по стъпка (виж adaptQuality).
const quality = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  shadowSize: coarsePointer ? 1024 : 2048,
  bloom: !coarsePointer,
  step: 0,
};

let renderer = null, scene, camera, raycaster, composer = null;
let sun, hemi, sky, water, terrain, outerGround, grassMesh, rabbitMesh, foxMesh, rabbitBlobs, foxBlobs, rain;
let grassSpots, rabbitSpots, foxSpots;
let failed = false, show3D = false, hintShown = false;

let shown = null, from = null, target = null, animStart = 0;
let latestState = null;
let rainUntil = 0, sickUntil = 0, sickMaterial = null;
let mood = { ...MOODS.none }, moodFrom = null, moodTarget = null, moodStart = 0;

let angle = 0.95, tilt = 0.5, lastUserTouch = -10000;
let inView = true, rafId = null, lastFrame = 0, clockTime = 0;
const frameTimes = [];
// Брояч на кадрите за проверка на телефон: отвори сайта с ?fps в адреса.
let fpsAverage = 60, fpsShownAt = 0, fpsLabel = null;
if (new URLSearchParams(location.search).has("fps") && box) {
  fpsLabel = document.createElement("span");
  fpsLabel.className = "scene3d-fps";
  box.append(fpsLabel);
}

// Общо време за анимацията на трева, вода и дишане (споделено между шейдърите).
const timeUniform = { value: 0 };
// Цветът на хоризонта — водата го отразява при полегат поглед (френел).
const skyReflection = { value: new THREE.Color(0xd0d7ba) };
// Дебелина на светещия контур около избрания вид (пулсира леко).
const outlineWidth = { value: 0.06 };

// Състояние на интерактивността. Нищо от тук не се връща към играта.
let selected = null;                 // "water" | "grass" | "rabbits" | "foxes" | null
let selectionChangedAt = -10000;
let history = [], entries = [];      // game.history и game.entries — само за четене
let viewTurn = null;                 // null = „сега“; число = преглед на минал ход
let previewEffects = null;           // пряк ефект на избраното действие (B)
let effectUntil = 0, effectMode = null, effectCenter = new THREE.Vector3();
const pendingAfterFeedback = [];     // числа/балончета, които чакат прозореца „Последици“ да се затвори
const waterTint = new THREE.Color(), grassTint = new THREE.Color();
const dim = { water: 1, grass: 1, rabbits: 1, foxes: 1 };   // 1 = нормално, <1 = приглушено
let rabbitHull, foxHull, waterRing, ghostRing, ghostRabbits, ghostFoxes, ghostGrass, arrows, particles;
let layer, card, timeline, bubble, previewChip;
let arrowsDirty = false;
const floating = [];                 // изскачащи числа и надписи, които следват 3D точка

// ---------- Помощни функции ----------

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Колко навътре във водоема е точката: 0 в центъра, 1 на брега.
function basinDistance(x, z) {
  return Math.hypot(x - POND.x, z - POND.z) / POND.radius;
}

// Височина на терена: вдлъбнат водоем, меки хълмчета и издигнат ръб на долината.
// Тревата и животните стъпват точно на тази височина.
function terrainHeight(x, z) {
  const d = basinDistance(x, z);
  const basin = d < 1 ? -POND.depth * (1 - d * d) : 0;
  const r = Math.hypot(x, z);
  const edgeFade = 1 - smoothstep(10.5, 12.8, r);
  const rolling = (0.16 * Math.sin(x * 0.45 + 1.3) * Math.cos(z * 0.38) + 0.08 * Math.sin(x * 0.9 - z * 0.7)) * smoothstep(0.9, 1.4, d);
  return basin + rolling * edgeFade + VALLEY_RIM * smoothstep(8.5, 13, r);
}

// Ниво на водата: при повече вода водата се качва в коритото и заема по-голяма площ.
function waterLevel(w) {
  return -POND.depth + (POND.depth + 0.04) * Math.pow(w / 100, 0.75);
}

function makeSpots(count, seed, minR, maxR, size, avoidBasin) {
  const random = seeded(seed);
  const spots = [];
  while (spots.length < count) {
    const r = minR + Math.sqrt(random()) * (maxR - minR);
    const a = random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (basinDistance(x, z) < avoidBasin) continue;
    spots.push({ x, z, y: terrainHeight(x, z), yaw: random() * Math.PI * 2, size: size * (0.8 + random() * 0.4) });
  }
  return spots;
}

// Слива прости форми в една геометрия с цвят на всеки връх (vertex colors).
// colorFn (по желание) дава цвят според височината — напр. по-тъмен корен на тревата.
function merge(parts) {
  const positions = [], normals = [], colors = [];
  const color = new THREE.Color();
  for (const part of parts) {
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const pos = g.attributes.position;
    positions.push(...pos.array);
    normals.push(...g.attributes.normal.array);
    for (let i = 0; i < pos.count; i++) {
      if (part.colorFn) part.colorFn(color, pos.getY(i));
      else color.setHex(part.color);
      colors.push(color.r, color.g, color.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  out.computeBoundingSphere();
  return out;
}

// PBR материал за природата: матов, без метал. flatShading дава low-poly ръбовете.
function natureMaterial(options) {
  return new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true, flatShading: true, ...options });
}

// Добавя малко GLSL код към стандартен материал (поклащане, дишане, вълни).
// lightCode (по желание) променя крайния цвят след осветлението (напр. френел на водата).
function injectShader(material, key, vertexCode, fragmentCode, lightCode) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uSkyReflection = skyReflection;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec2 vWorldXZ;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertexCode}\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    if (fragmentCode) {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform vec3 uSkyReflection;\nvarying vec2 vWorldXZ;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n${fragmentCode}`)
        .replace("#include <opaque_fragment>", `${lightCode || ""}\n#include <opaque_fragment>`);
    }
  };
  material.customProgramCacheKey = () => key;
}

// Фаза за всяка инстанция: за да не се поклащат всички стръкове в синхрон.
const PHASE = `
#ifdef USE_INSTANCING
  float phase = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
#else
  float phase = 0.0;
#endif
`;

// ---------- Геометрия ----------

function grassGeometry() {
  const root = new THREE.Color(PALETTE.grassRoot), tip = new THREE.Color(PALETTE.grassTip);
  const blade = (x, z, lean, h) => new THREE.ConeGeometry(0.045, h, 3).translate(0, h / 2, 0).rotateZ(lean).translate(x, 0, z);
  const shade = (color, y) => color.copy(root).lerp(tip, Math.min(1, y / 0.55));
  return merge([
    { geometry: blade(0, 0, 0.05, 0.55), colorFn: shade },
    { geometry: blade(0.07, 0.05, 0.3, 0.45), colorFn: shade },
    { geometry: blade(-0.06, -0.04, -0.28, 0.48), colorFn: shade },
    { geometry: blade(0.02, -0.07, -0.12, 0.4), colorFn: shade },
  ]);
}

function rabbitGeometry() {
  const P = PALETTE;
  return merge([
    { geometry: new THREE.SphereGeometry(0.22, 7, 5).scale(1, 0.85, 1.35).translate(0, 0.21, 0), color: P.rabbit },
    { geometry: new THREE.SphereGeometry(0.14, 7, 5).translate(0, 0.35, 0.27), color: P.rabbitLight },
    { geometry: new THREE.CylinderGeometry(0.028, 0.045, 0.26, 5).rotateX(-0.2).translate(-0.05, 0.55, 0.2), color: P.rabbitEar },
    { geometry: new THREE.CylinderGeometry(0.028, 0.045, 0.26, 5).rotateX(-0.2).translate(0.05, 0.55, 0.2), color: P.rabbitEar },
    { geometry: new THREE.SphereGeometry(0.07, 5, 4).translate(0, 0.25, -0.32), color: P.rabbitLight },
  ]);
}

function foxGeometry() {
  const P = PALETTE;
  const parts = [
    { geometry: new THREE.SphereGeometry(0.22, 7, 5).scale(1, 0.85, 1.8).translate(0, 0.35, 0), color: P.fox },
    { geometry: new THREE.SphereGeometry(0.13, 6, 4).scale(1, 0.9, 1.1).translate(0, 0.33, 0.3), color: P.foxLight },
    { geometry: new THREE.ConeGeometry(0.15, 0.34, 6).rotateX(Math.PI / 2).translate(0, 0.44, 0.52), color: P.fox },
    { geometry: new THREE.SphereGeometry(0.04, 4, 3).translate(0, 0.44, 0.7), color: P.foxDark },
    { geometry: new THREE.ConeGeometry(0.05, 0.14, 4).translate(-0.07, 0.6, 0.44), color: P.fox },
    { geometry: new THREE.ConeGeometry(0.05, 0.14, 4).translate(0.07, 0.6, 0.44), color: P.fox },
    { geometry: new THREE.ConeGeometry(0.1, 0.48, 6).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.45, -0.6), color: P.fox },
    { geometry: new THREE.SphereGeometry(0.075, 5, 4).translate(0, 0.33, -0.8), color: P.foxLight },
  ];
  for (const [x, z] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]]) {
    parts.push({ geometry: new THREE.CylinderGeometry(0.03, 0.025, 0.24, 4).translate(x, 0.12, z), color: P.foxDark });
  }
  return merge(parts);
}

// Дървета по ръба на долината и по-далеч (там мъглата ги избледнява).
function treesGeometry() {
  const P = PALETTE, parts = [], random = seeded(99);
  const placeTree = (x, z, scale) => {
    const y = terrainHeight(x, z);
    if (random() < 0.7) {
      const h = (1.3 + random() * 0.8) * scale;
      parts.push({ geometry: new THREE.CylinderGeometry(0.1 * scale, 0.14 * scale, 0.5 * scale, 5).translate(x, y + 0.25 * scale, z), color: P.trunk });
      parts.push({ geometry: new THREE.ConeGeometry(0.8 * scale, h, 6).translate(x, y + 0.45 * scale + h / 2, z), color: P.pine });
      parts.push({ geometry: new THREE.ConeGeometry(0.58 * scale, h * 0.75, 6).translate(x, y + 0.45 * scale + h * 0.75, z), color: P.pineLight });
    } else {
      parts.push({ geometry: new THREE.CylinderGeometry(0.1 * scale, 0.14 * scale, 0.7 * scale, 5).translate(x, y + 0.35 * scale, z), color: P.trunk });
      parts.push({ geometry: new THREE.IcosahedronGeometry(0.8 * scale, 0).translate(x, y + 1.2 * scale, z), color: P.roundTree });
    }
  };
  // Гъста горска стена зад водоема (фон на кадъра) и само отделни дървета отпред,
  // за да не закриват животните.
  for (let i = 0; i < 22; i++) {
    const a = 2.3 + i * 0.16 + random() * 0.1;
    const r = 10 + random() * 2.6;
    placeTree(Math.cos(a) * r, Math.sin(a) * r, 0.9 + random() * 0.5);
  }
  for (let i = 0; i < 7; i++) {
    const a = 5.9 + i * 0.4 + random() * 0.2;
    const r = 11.6 + random() * 1.2;
    placeTree(Math.cos(a) * r, Math.sin(a) * r, 0.8 + random() * 0.4);
  }
  for (let i = 0; i < 40; i++) {
    const a = random() * Math.PI * 2, r = 36 + random() * 16; // отвъд камерата, в мъглата
    placeTree(Math.cos(a) * r, Math.sin(a) * r, 1.1 + random() * 0.8);
  }
  return merge(parts);
}

// Далечни хълмове/планини като в 2D долината — дават дълбочина през мъглата.
function hillsGeometry() {
  const parts = [], random = seeded(17);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + random() * 0.2;
    const r = 58 + random() * 22;
    const h = 9 + random() * 14, w = 13 + random() * 10;
    parts.push({ geometry: new THREE.ConeGeometry(w, h, 5).rotateY(random() * 3).translate(Math.cos(a) * r, VALLEY_RIM + h / 2 - 0.5, Math.sin(a) * r), color: r > 70 ? PALETTE.hillsFar : PALETTE.hills });
  }
  return merge(parts);
}

function rocksGeometry() {
  const parts = [], random = seeded(41);
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2, d = POND.radius * (1.02 + random() * 0.25);
    const x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    const s = 0.15 + random() * 0.3;
    parts.push({ geometry: new THREE.IcosahedronGeometry(s, 0).scale(1.3, 0.7, 1).rotateY(random() * 3).translate(x, terrainHeight(x, z) + s * 0.25, z), color: PALETTE.rock });
  }
  return merge(parts);
}

// Терен с вдлъбнат водоем. Цветовете: кал в коритото → бряг → поляна.
function terrainGeometry() {
  const g = new THREE.PlaneGeometry(28, 28, 84, 84).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, colors = [];
  const P = PALETTE, c = new THREE.Color(), random = seeded(3);
  const mud = new THREE.Color(P.mud), shore = new THREE.Color(P.shore), meadow = new THREE.Color(P.meadow), shadeC = new THREE.Color(P.meadowShade);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    const d = basinDistance(x, z);
    if (d < 0.75) c.copy(mud).lerp(shore, d / 0.75);
    else if (d < 1.25) c.copy(shore).lerp(meadow, (d - 0.75) / 0.5);
    else c.copy(meadow).lerp(shadeC, random() * 0.5); // малки разлики → по-жив low-poly вид
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// Мека сянка под животните (контактна сянка / AO) — евтина картинка вместо сложно изчисление.
function blobTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 color = h > 0.0 ? mix(uHorizon, uTop, smoothstep(0.0, 0.55, h)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, h));
        float glow = pow(max(dot(normalize(vDir), uSunDir), 0.0), 48.0);
        color += uSunColor * glow * 0.55;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- Създаване на сцената (веднъж, при първото показване) ----------

function init() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (error) {
    failed = true;
    return false;
  }
  renderer.setPixelRatio(quality.pixelRatio);
  // Без подробна проверка на шейдърите: по-бързо компилиране и без шум от драйвера в конзолата.
  renderer.debug.checkShaderErrors = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = mood.exposure;
  renderer.shadowMap.enabled = true;
  // PCFSoftShadowMap е премахнат в r18x — PCFShadowMap с радиус (sun.shadow.radius) дава мекия ръб.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Сенките се преизчисляват само когато нещо в долината се промени (пести телефона).
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute("role", "img");
  box.append(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 2, 0.1, 200);
  raycaster = new THREE.Raycaster();

  // Мек отразен свят (IBL): материалите получават реалистични отблясъци.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.fog = new THREE.Fog(MOODS.none.horizon, 20, 70);

  sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), skyMaterial());
  scene.add(sky);

  hemi = new THREE.HemisphereLight(0xdfe8dc, 0x4d5b3a, mood.hemi);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(mood.sun, mood.sunI);
  sun.position.set(9, 15, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 2, far: 45 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.radius = 3;          // мек ръб на сенките
  sun.shadow.bias = -0.0004;      // без „ивици“ по повърхностите
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  terrain = new THREE.Mesh(terrainGeometry(), natureMaterial());
  terrain.receiveShadow = true;
  scene.add(terrain);
  // Равнината около долината е пръстен — с дупка, за да не покрива по-ниската долина.
  outerGround = new THREE.Mesh(
    new THREE.RingGeometry(13, 160, 64, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.meadow, roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  );
  outerGround.position.y = VALLEY_RIM - 0.005;
  outerGround.receiveShadow = true;
  scene.add(outerGround);

  scene.add(new THREE.Mesh(hillsGeometry(), natureMaterial()));
  const trees = new THREE.Mesh(treesGeometry(), natureMaterial({ roughness: 0.85 }));
  trees.castShadow = trees.receiveShadow = true;
  scene.add(trees);
  const rocks = new THREE.Mesh(rocksGeometry(), natureMaterial({ roughness: 0.8 }));
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  // Вода: гладка, леко прозрачна (вижда се калното дъно), с отражения от IBL
  // и меки вълнички (нормалите се поклащат в шейдъра).
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.waterDeep, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.84, envMapIntensity: 1.4,
  });
  injectShader(waterMaterial, "water", "", `
    float rx = sin(vWorldXZ.x * 2.1 + uTime * 0.9) + 0.6 * sin(vWorldXZ.y * 1.7 - uTime * 0.7);
    float rz = cos(vWorldXZ.y * 2.4 + uTime * 0.8) + 0.6 * cos(vWorldXZ.x * 1.3 + uTime * 0.5);
    normal = normalize(normal + vec3(rx, 0.0, rz) * 0.035);`, `
    // Френел: при полегат поглед водата отразява небето — не изглежда като пластмасова плоча.
    float fresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    outgoingLight = mix(outgoingLight, uSkyReflection, fresnel * 0.55);`);
  water = new THREE.Mesh(new THREE.CircleGeometry(POND.radius * 1.02, 72).rotateX(-Math.PI / 2), waterMaterial);
  water.position.set(POND.x, 0, POND.z);
  water.receiveShadow = true;
  scene.add(water);

  // Трева: поклаща се от вятъра — колкото по-високо по стръка, толкова повече.
  const grassMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  injectShader(grassMaterial, "grass", `${PHASE}\ntransformed.x += sin(uTime * 1.6 + phase) * 0.09 * transformed.y;\ntransformed.z += cos(uTime * 1.3 + phase) * 0.05 * transformed.y;`);
  grassMesh = new THREE.InstancedMesh(grassGeometry(), grassMaterial, MAX_GRASS);
  grassMesh.receiveShadow = true;

  // Животните „дишат“: едва забележимо се повдигат и снишават.
  const breathe = `${PHASE}\ntransformed.y *= 1.0 + 0.03 * sin(uTime * 2.2 + phase);`;
  const rabbitMaterial = natureMaterial({ roughness: 0.85 });
  injectShader(rabbitMaterial, "rabbit", breathe);
  const foxMaterial = natureMaterial({ roughness: 0.8 });
  injectShader(foxMaterial, "fox", breathe);
  rabbitMesh = new THREE.InstancedMesh(rabbitGeometry(), rabbitMaterial, MAX_MODELS);
  foxMesh = new THREE.InstancedMesh(foxGeometry(), foxMaterial, MAX_MODELS);
  for (const mesh of [rabbitMesh, foxMesh]) mesh.castShadow = mesh.receiveShadow = true;

  const blobMaterial = new THREE.MeshBasicMaterial({
    map: blobTexture(), color: 0x1a261c, transparent: true, opacity: 0.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const blobGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  rabbitBlobs = new THREE.InstancedMesh(blobGeometry, blobMaterial, MAX_MODELS);
  foxBlobs = new THREE.InstancedMesh(blobGeometry, blobMaterial, MAX_MODELS);

  grassSpots = makeSpots(MAX_GRASS, 7, 0.5, 10.5, 1, 1.08);
  rabbitSpots = makeSpots(MAX_MODELS, 21, 1, 9.2, 1.15, 1.15);
  foxSpots = makeSpots(MAX_MODELS, 37, 1, 9.2, 1, 1.15);
  for (const mesh of [grassMesh, rabbitMesh, foxMesh, rabbitBlobs, foxBlobs]) {
    // Инстанциите са из цялата долина, а Three.js проверява само центъра — без изрязване.
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }

  // Дъжд: тънки наклонени чертички (по-естествено от точки).
  const streaks = new Float32Array(RAIN_STREAKS * 6);
  const random = seeded(5);
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const x = (random() - 0.5) * 22, y = random() * 10, z = (random() - 0.5) * 22;
    streaks.set([x, y, z, x + 0.06, y + 0.42, z + 0.03], i * 6);
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute("position", new THREE.BufferAttribute(streaks, 3));
  rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: PALETTE.rain, transparent: true, opacity: 0.55 }));
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);

  setupInteraction();
  setupComposer();
  applyMood(mood);
  setupControls();
  new ResizeObserver(resize).observe(box);
  new IntersectionObserver((observed) => {
    inView = observed[0].isIntersecting;
    // Долината вече не се вижда (напр. екранът с мисиите) → затваряме картата.
    if (!inView) select(null);
    requestRender();
  }).observe(box);
  reducedMotion.addEventListener("change", requestRender);
  resize();
  return true;
}

// Лек post-processing само на компютър: нежен bloom върху отблясъците.
// Винетката е CSS (game.css) — безплатна и на телефон.
function setupComposer() {
  if (!quality.bloom) {
    composer = null;
    return;
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.55, 0.88));
  composer.addPass(new OutputPass()); // ACES тонове + sRGB, както при рисуване направо
}

function resize() {
  if (!renderer) return;
  const width = box.clientWidth || 320;
  const height = box.clientHeight || 240;
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(width, height);
  if (composer) {
    composer.setPixelRatio(quality.pixelRatio);
    composer.setSize(width, height);
  }
  camera.aspect = width / height;
  // На тесен/висок или нисък екран (телефон) отдалечаваме камерата, за да се вижда цялата долина.
  let distance = camera.aspect < 1 ? 31 : camera.aspect < 1.4 ? 25 : 21;
  if (height < 300) distance += 4;
  camera.userData.distance = distance;
  camera.updateProjectionMatrix();
  cardPlace = null;
  if (selected) updateCard(); // ширината може да смени режима „карта до обекта“ ↔ „долен лист“
  renderer.shadowMap.needsUpdate = true;
  requestRender();
}

// ---------- Обновяване според стойностите ----------

const dummy = new THREE.Object3D();
const COLOR = {
  waterDeep: new THREE.Color(PALETTE.waterDeep), waterMurky: new THREE.Color(PALETTE.waterMurky),
  white: new THREE.Color(0xffffff), dryTint: new THREE.Color(PALETTE.dryTint),
  grassDry: new THREE.Color(PALETTE.grassDry), meadow: new THREE.Color(PALETTE.meadow),
};

// modelCount може да е дробно по време на анимация: последният модел расте/се смалява.
function placeInstances(mesh, spots, modelCount, heightScale, blobs, blobSize) {
  const n = Math.min(spots.length, Math.ceil(modelCount));
  for (let i = 0; i < n; i++) {
    const grow = Math.min(1, modelCount - i);
    const spot = spots[i];
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.yaw, 0);
    dummy.scale.set(spot.size * grow, spot.size * grow * heightScale, spot.size * grow);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (blobs) {
      dummy.position.y = spot.y + 0.015;
      dummy.scale.set(blobSize * spot.size * grow, 1, blobSize * 1.4 * spot.size * grow);
      dummy.updateMatrix();
      blobs.setMatrixAt(i, dummy.matrix);
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (blobs) {
    blobs.count = n;
    blobs.instanceMatrix.needsUpdate = true;
  }
}

function models(count, perModel) {
  return Math.min(MAX_MODELS, Math.ceil(count / perModel));
}

function toShown(state) {
  return {
    water: state.water,
    grass: state.grass,
    rabbitModels: models(state.rabbits, RABBITS_PER_MODEL),
    foxModels: models(state.foxes, FOXES_PER_MODEL),
  };
}

function apply(values) {
  const w = values.water / 100;
  water.visible = values.water > 0.5;
  water.position.y = waterLevel(values.water);
  // Малко вода → плитка и мътна; много вода → дълбока синьо-зелена.
  // (Крайният цвят се смята в updateHighlight — там се добавя и приглушаването при избор.)
  waterTint.lerpColors(COLOR.waterMurky, COLOR.waterDeep, smoothstep(0.1, 0.6, w));

  // Под 35 вода поляната и тревата пожълтяват — вижда се, че им липсва вода.
  const dryness = smoothstep(35, 0, values.water);
  terrain.material.color.lerpColors(COLOR.white, COLOR.dryTint, dryness * 0.8);
  outerGround.material.color.copy(COLOR.meadow).multiply(terrain.material.color);
  grassTint.lerpColors(COLOR.white, COLOR.grassDry, dryness * 0.85);
  placeInstances(grassMesh, grassSpots, MAX_GRASS * values.grass / 500, 0.7 + 0.9 * values.grass / 500);

  placeInstances(rabbitMesh, rabbitSpots, values.rabbitModels, 1, rabbitBlobs, 0.75);
  placeInstances(foxMesh, foxSpots, values.foxModels, 1, foxBlobs, 0.9);
  // Контурите използват същите матрици като животните — броят им трябва да съвпада.
  rabbitHull.count = rabbitMesh.count;
  foxHull.count = foxMesh.count;
  renderer.shadowMap.needsUpdate = true;
  arrowsDirty = true;
}

// Атмосфера: небе, мъгла, слънце, отражения и експонация.
function applyMood(m) {
  const u = sky.material.uniforms;
  u.uTop.value.setHex(m.top);
  u.uHorizon.value.setHex(m.horizon);
  u.uBottom.value.setHex(m.bottom);
  u.uSunDir.value.copy(sun.position).normalize();
  u.uSunColor.value.setHex(m.sun);
  scene.fog.color.setHex(m.horizon);
  skyReflection.value.setHex(m.horizon);
  sun.color.setHex(m.sun);
  sun.intensity = m.sunI;
  hemi.intensity = m.hemi;
  scene.environmentIntensity = m.env;
  renderer.toneMappingExposure = m.exposure;
}

const mixA = new THREE.Color(), mixB = new THREE.Color();
function mixMood(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    if (["top", "horizon", "bottom", "sun"].includes(key)) out[key] = mixA.setHex(a[key]).lerp(mixB.setHex(b[key]), t).getHex();
    else out[key] = a[key] + (b[key] - a[key]) * t;
  }
  return out;
}

// ---------- Цикъл на рисуване ----------

function motionAllowed() {
  return !reducedMotion.matches;
}

function busy(now) {
  return (target && now - animStart < ANIM_MS) || (moodTarget && now - moodStart < MOOD_MS) || now < rainUntil || now < sickUntil
    || now < effectUntil || now - selectionChangedAt < 400;
}

// При разрешено движение рисуваме постоянно (трева, вода, дишане) — но само докато
// 3D е включено и долината е на екрана.
function wantsFrames(now) {
  if (!show3D || !inView || document.hidden) return false;
  return busy(now) || motionAllowed();
}

function requestRender() {
  if (renderer && show3D && !rafId) rafId = requestAnimationFrame(frame);
}

function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const focus = new THREE.Vector3(POND.x * 0.3, -0.2, POND.z * 0.3); // водоемът е във фокуса, но не в центъра

function frame(now) {
  rafId = null;
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  if (lastFrame && now - lastFrame < 200) {
    adaptQuality(now - lastFrame);
    fpsAverage = fpsAverage * 0.95 + (1000 / (now - lastFrame)) * 0.05;
    if (fpsLabel && now - fpsShownAt > 500) {
      fpsShownAt = now;
      fpsLabel.textContent = `${Math.round(fpsAverage)} FPS · ${quality.pixelRatio}× · bloom ${quality.bloom ? "да" : "не"}`;
    }
  }
  lastFrame = now;
  if (motionAllowed()) clockTime += dt;
  timeUniform.value = clockTime;

  if (target) {
    const t = Math.min(1, (now - animStart) / ANIM_MS);
    const k = ease(t);
    shown = {};
    for (const key of Object.keys(target)) shown[key] = from[key] + (target[key] - from[key]) * k;
    apply(shown);
    if (t >= 1) target = null;
  }

  if (moodTarget) {
    const t = Math.min(1, (now - moodStart) / MOOD_MS);
    mood = mixMood(moodFrom, moodTarget, ease(t));
    applyMood(mood);
    if (t >= 1) moodTarget = null;
  }
  // По-гъста мъгла при дъжд и суша (прах) — според разстоянието на камерата.
  const distance = camera.userData.distance;
  scene.fog.near = distance * 1.2 * mood.fog;
  scene.fog.far = distance * 4.2 * mood.fog;

  rain.visible = now < rainUntil;
  if (rain.visible) {
    const p = rain.geometry.attributes.position;
    for (let i = 0; i < RAIN_STREAKS * 2; i++) {
      let y = p.getY(i) - 14 * dt;
      if (y < -0.5) y += 10.5;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  // Болест: засегнатият вид мига в червено (без мигане при „намалено движение“).
  // Светенето при избор се добавя после в updateHighlight.
  for (const mesh of [grassMesh, rabbitMesh, foxMesh]) mesh.material.emissive.setHex(0x000000);
  if (sickMaterial && now < sickUntil) {
    const pulse = motionAllowed() ? (Math.sin(now / 110) + 1) / 2 : 1;
    sickMaterial.emissive.setRGB(0.45 * pulse, 0.02, 0.02);
  } else {
    sickMaterial = null;
  }

  // Нежно „дрейфиране“ на камерата около избрания от ученика ъгъл (без пълно въртене).
  const idle = motionAllowed() && now - lastUserTouch > 4000;
  const a = angle + (idle ? Math.sin(clockTime * 0.07) * 0.18 : 0);
  camera.position.set(
    focus.x + Math.cos(a) * distance * Math.cos(tilt),
    distance * Math.sin(tilt),
    focus.z + Math.sin(a) * distance * Math.cos(tilt),
  );
  camera.lookAt(focus);
  camera.updateMatrixWorld();

  updateInteraction(now, dt);

  if (composer) composer.render();
  else renderer.render(scene, camera);

  if (wantsFrames(now)) rafId = requestAnimationFrame(frame);
  else lastFrame = 0; // след пауза не броим дълъг кадър
}

// Ако кадрите са под ~45 в секунда, намаляваме качеството стъпка по стъпка:
// 1) без bloom, 2) резолюция 1,5×, 3) резолюция 1,25×.
function adaptQuality(frameMs) {
  if (!motionAllowed() || quality.step >= 3) return;
  frameTimes.push(frameMs);
  if (frameTimes.length < 120) return;
  const average = frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length;
  frameTimes.length = 0;
  if (average < 22) return;
  quality.step += 1;
  if (quality.bloom) {
    quality.bloom = false;
    setupComposer();
  } else if (quality.pixelRatio > 1.5) {
    quality.pixelRatio = 1.5;
  } else {
    quality.pixelRatio = Math.max(1, quality.pixelRatio - 0.25);
  }
  resize();
}

// ---------- Въртене с пръст/мишка и докосване ----------

function setupControls() {
  const canvas = renderer.domElement;
  // Екранът на играта не се превърта, затова пръстът върти долината и в двете посоки.
  canvas.style.touchAction = "none";
  let down = null;

  let lastHover = 0;

  // pointerdown: запомняме какво е под пръста (Raycaster). Изборът става чак при
  // pointerup, защото тогава знаем дали е било докосване, или въртене.
  canvas.addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY, angle, tilt, kind: pick(event), dragging: false };
    lastUserTouch = performance.now();
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!down) {
      // Мишка без натиснат бутон: курсор „ръка“ над избираем обект (най-много ~12 пъти в секунда).
      if (event.pointerType === "mouse" && performance.now() - lastHover > 80) {
        lastHover = performance.now();
        canvas.style.cursor = pick(event) ? "pointer" : "grab";
      }
      return;
    }
    // Преместване над ~8px = въртене на камерата, не избор.
    if (!down.dragging && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) return;
    down.dragging = true;
    canvas.style.cursor = "grabbing";
    angle = down.angle + (event.clientX - down.x) * 0.008;
    // Наклонът е ограничен: не гледаме под земята или право отгоре.
    tilt = Math.min(1.05, Math.max(0.28, down.tilt + (event.clientY - down.y) * 0.004));
    lastUserTouch = performance.now();
    requestRender();
  });
  const end = (event) => {
    if (!down) return;
    if (event.type === "pointerup" && !down.dragging) select(down.kind && down.kind === selected ? null : down.kind);
    down = null;
    canvas.style.cursor = "grab";
    lastUserTouch = performance.now();
    requestRender();
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  // Клавиатура: Tab до долината, после 1–4 избира вид, стрелките сменят, Esc затваря.
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (event) => {
    const index = CHAIN.indexOf(selected);
    if (["1", "2", "3", "4"].includes(event.key)) select(CHAIN[Number(event.key) - 1]);
    else if (event.key === "ArrowRight") select(CHAIN[(index + 1) % CHAIN.length]);
    else if (event.key === "ArrowLeft") select(CHAIN[(index + CHAIN.length - 1) % CHAIN.length]);
    else return;
    event.preventDefault();
  });
}

let tip = null, tipTimer = null;

function showTip(iconClass, text, left, top) {
  if (!tip) {
    tip = document.createElement("p");
    tip.className = "scene3d-tip";
    tip.setAttribute("role", "status");
    box.append(tip);
  }
  tip.textContent = "";
  if (iconClass) {
    const icon = document.createElement("i");
    icon.className = `resource-icon ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");
    tip.append(icon);
  }
  tip.append(document.createTextNode(text));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.hidden = false;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tip.hidden = true; }, 3500);
}

// Какво е под пръста/мишката: "water" | "grass" | "rabbits" | "foxes" | null (празно).
// При зайци/лисици Raycaster връща instanceId, но обясняваме ВИДА, не отделното животно.
const pointerNdc = new THREE.Vector2();
function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObjects([water, foxMesh, rabbitMesh, grassMesh, terrain], false)[0];
  if (!hit) return null;
  if (hit.object === foxMesh) return "foxes";
  if (hit.object === rabbitMesh) return "rabbits";
  if (hit.object === grassMesh) return "grass";
  if (hit.object === water || basinDistance(hit.point.x, hit.point.z) < 1) return "water";
  // Поляна: броим я за трева само ако наблизо има туфа — иначе е „празно“ (деселект).
  for (let i = 0; i < grassMesh.count; i++) {
    if (Math.hypot(grassSpots[i].x - hit.point.x, grassSpots[i].z - hit.point.z) < 0.9) return "grass";
  }
  return null;
}

// ---------- Интерактивност (A–F) ----------

const PARTICLES = 180;
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpColor = new THREE.Color(), accentColor = new THREE.Color(ACCENT);
const arrowHeadGeometry = new THREE.ConeGeometry(0.22, 0.5, 12);
let arrowStrong, arrowSoft, headStrong, headSoft, range, timelineOutput, nowButton;
let lastEventType = "none", lastPreview = null, scrubTimer = null, bubbleTimer = null;

// Светещ контур: копие на модела, „надуто“ по нормалите и рисувано отзад (inverted hull).
// Едно допълнително рисуване вместо OutlinePass — евтино и на телефон, еднакво навсякъде.
function makeHull(mesh, key) {
  const material = new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.BackSide, toneMapped: false, fog: false });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uOutline = outlineWidth;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uOutline;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${PHASE}\ntransformed.y *= 1.0 + 0.03 * sin(uTime * 2.2 + phase);\ntransformed += normalize(normal) * uOutline;`);
  };
  material.customProgramCacheKey = () => key;
  const hull = new THREE.InstancedMesh(mesh.geometry, material, MAX_MODELS);
  hull.instanceMatrix = mesh.instanceMatrix; // същите места като животните
  hull.frustumCulled = false;
  hull.count = 0;
  hull.visible = false;
  scene.add(hull);
  return hull;
}

// Стрелка с „течащи“ светли ивици по посоката на зависимостта.
function arrowMaterial(opacity) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false, // връзките са „схема“ върху света — винаги видими
    uniforms: { uTime: timeUniform, uColor: { value: new THREE.Color(ACCENT) }, uOpacity: { value: opacity } },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
      void main() {
        float flow = 0.5 + 0.5 * sin(vUv.x * 22.0 - uTime * 5.0);
        float start = smoothstep(0.0, 0.06, vUv.x);
        gl_FragColor = vec4(uColor * (0.85 + 0.35 * flow), uOpacity * (0.45 + 0.55 * flow) * start);
        #include <colorspace_fragment>
      }`,
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function icon(iconClass) {
  const node = element("i", `resource-icon ${iconClass}`);
  node.setAttribute("aria-hidden", "true");
  return node;
}

// Създава допълнителните 3D обекти и HTML слоя над платното. Вика се веднъж от init().
function setupInteraction() {
  // A. Подсветка: контури за животните и златен ръб по брега на водата.
  rabbitHull = makeHull(rabbitMesh, "hull-rabbit");
  foxHull = makeHull(foxMesh, "hull-fox");
  waterRing = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, depthWrite: false, toneMapped: false }),
  );
  waterRing.position.set(POND.x, 0, POND.z);
  waterRing.visible = false;
  scene.add(waterRing);

  // B. Призрачни обекти за preview: новите животни/трева и бъдещият бряг.
  const ghostMaterial = () => new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
  ghostRabbits = new THREE.InstancedMesh(rabbitMesh.geometry, ghostMaterial(), MAX_MODELS);
  ghostFoxes = new THREE.InstancedMesh(foxMesh.geometry, ghostMaterial(), MAX_MODELS);
  ghostGrass = new THREE.InstancedMesh(grassMesh.geometry, ghostMaterial(), MAX_GRASS);
  for (const mesh of [ghostRabbits, ghostFoxes, ghostGrass]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  // Бъдещият бряг се вижда и през водата/терена (depthTest: false).
  ghostRing = new THREE.Mesh(waterRing.geometry, new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false }));
  ghostRing.position.set(POND.x, 0, POND.z);
  ghostRing.renderOrder = 2;
  ghostRing.visible = false;
  scene.add(ghostRing);

  // C. Стрелки на причинните връзки.
  arrows = new THREE.Group();
  scene.add(arrows);
  arrowStrong = arrowMaterial(0.95);
  arrowSoft = arrowMaterial(0.45);
  headStrong = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95, toneMapped: false, depthWrite: false, depthTest: false });
  headSoft = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false, depthTest: false });

  // F. Частици: прах при суша, спори при болест (дъждът има свои чертички).
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
  particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ size: 0.1, transparent: true, depthWrite: false }));
  particles.visible = false;
  particles.frustumCulled = false;
  scene.add(particles);

  // HTML слой над платното: карта, числа, балонче, лента с ходовете.
  layer = element("div", "scene3d-layer");
  box.append(layer);

  card = element("section", "scene3d-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "scene3d-card-title");
  card.hidden = true;
  const close = element("button", "scene3d-card-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Затвори обяснението");
  close.addEventListener("click", () => select(null));
  const title = element("h4", "scene3d-card-title");
  title.id = "scene3d-card-title";
  const value = element("p", "scene3d-card-value");
  value.setAttribute("aria-live", "polite");
  card.append(close, title, value, element("p", "scene3d-card-role"), element("p", "scene3d-card-actions"), element("p", "scene3d-card-chain"));
  layer.append(card);

  bubble = element("p", "scene3d-bubble");
  bubble.setAttribute("role", "status");
  bubble.hidden = true;
  previewChip = element("p", "scene3d-chip", "Преглед: пряк ефект на действието и на времето");
  previewChip.hidden = true;
  layer.append(bubble, previewChip);

  // D. Лента с изиграните ходове.
  timeline = element("div", "scene3d-timeline");
  timeline.hidden = true;
  const label = element("label", null, "Ходове");
  label.htmlFor = "scene3d-scrub";
  range = element("input");
  Object.assign(range, { id: "scene3d-scrub", type: "range", min: "0", max: "0", step: "1", value: "0" });
  range.addEventListener("input", () => scrubTo(Number(range.value)));
  timelineOutput = element("output");
  timelineOutput.htmlFor = "scene3d-scrub";
  nowButton = element("button", null, "Сега");
  nowButton.type = "button";
  nowButton.addEventListener("click", () => scrubTo(history.length - 1));
  timeline.append(label, range, timelineOutput, nowButton);
  layer.append(timeline);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selected) select(null);
  });
  // Числата и балончето чакат прозореца „Последици от хода“ да се затвори — иначе са под него.
  const feedback = document.getElementById("turn-feedback");
  if (feedback) {
    new MutationObserver(() => { if (feedback.hidden) flushPending(); }).observe(feedback, { attributes: true, attributeFilter: ["hidden"] });
  }
}

function feedbackOpen() {
  const feedback = document.getElementById("turn-feedback");
  return Boolean(feedback && !feedback.hidden);
}

function queueAfterFeedback(fn) {
  if (feedbackOpen()) pendingAfterFeedback.push(fn);
  else fn();
}

function flushPending() {
  while (pendingAfterFeedback.length) pendingAfterFeedback.shift()();
  requestRender();
}

// Какво се вижда в момента: „сега“ или избраният минал ход.
function viewedState() {
  return viewTurn === null ? latestState : history[viewTurn];
}

// Плавен преход към състояние + атмосфера на събитието. Използва се за нов ход и за лентата.
function goTo(state, eventType, animate) {
  renderer.domElement.setAttribute("aria-label",
    `3D долина: вода ${state.water} от 100, трева ${state.grass}, зайци ${state.rabbits}, лисици ${state.foxes}. Клавиши 1–4 избират вид.`);
  const next = toShown(state);
  const now = performance.now();
  if (!animate || !shown) {
    shown = next;
    target = null;
    apply(shown);
  } else {
    from = shown;
    target = next;
    animStart = now;
  }
  const moodNext = MOODS[eventType] || MOODS.none;
  if (!animate) {
    mood = { ...moodNext };
    applyMood(mood);
    moodTarget = null;
  } else {
    moodFrom = { ...mood };
    moodTarget = moodNext;
    moodStart = now;
  }
  arrowsDirty = true;
  requestRender();
}

// Котва = точка над вида в света. За трева/животни: видимият модел, най-близо до „зоната“ на вида —
// така стрелките и числата сочат към истински обект, а веригата образува ясна дъга около водоема.
const ZONES = { grass: new THREE.Vector3(2.2, 0, -2.6), rabbits: new THREE.Vector3(3.8, 0, 1.6), foxes: new THREE.Vector3(0.6, 0, 4.6) };
const HEIGHTS = { grass: 0.75, rabbits: 0.85, foxes: 1.0 };
function anchor(kind, out) {
  if (kind === "water") return out.set(POND.x, (water.visible ? water.position.y : -POND.depth) + 0.4, POND.z);
  const spots = { grass: grassSpots, rabbits: rabbitSpots, foxes: foxSpots }[kind];
  const count = { grass: grassMesh.count, rabbits: rabbitMesh.count, foxes: foxMesh.count }[kind];
  const zone = ZONES[kind];
  let best = null, bestDistance = Infinity;
  for (let i = 0; i < count; i++) {
    const d = (spots[i].x - zone.x) ** 2 + (spots[i].z - zone.z) ** 2;
    if (d < bestDistance) { bestDistance = d; best = spots[i]; }
  }
  if (!best) return out.set(zone.x, terrainHeight(zone.x, zone.z) + 0.4, zone.z);
  return out.set(best.x, best.y + HEIGHTS[kind], best.z);
}

// Радиус на водата на дадено ниво: там, където коритото е точно толкова дълбоко.
function shoreRadius(level) {
  return POND.radius * Math.min(1.02, Math.sqrt(Math.max(0.0001, 1 + level / POND.depth)));
}

// 3D точка → пиксели в платното.
const projected = new THREE.Vector3();
function toScreen(world) {
  projected.copy(world).project(camera);
  return {
    x: ((projected.x + 1) / 2) * box.clientWidth,
    y: ((1 - projected.y) / 2) * box.clientHeight,
    onScreen: projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05,
  };
}

// Надпис, който следва 3D точка (фиксирана) или вид (котвата му се мести с анимацията).
function addFloating(node, where, until, group) {
  layer.append(node);
  floating.push({ node, kind: typeof where === "string" ? where : null, world: typeof where === "string" ? null : where.clone(), until, group });
}

function removeFloating(group) {
  for (let i = floating.length - 1; i >= 0; i--) {
    if (floating[i].group === group) {
      floating[i].node.remove();
      floating.splice(i, 1);
    }
  }
}

// ----- A. Избор и обяснителна карта -----

function select(kind) {
  if (kind === selected) return;
  selected = kind;
  cardPlace = null;
  selectionChangedAt = performance.now();
  arrowsDirty = true;
  updateCard();
  requestRender();
}

function updateCard() {
  if (!card) return;
  if (!selected) {
    card.hidden = true;
    removeFloating("link");
    return;
  }
  const info = INFO[selected], state = viewedState();
  const title = card.querySelector(".scene3d-card-title");
  title.replaceChildren(icon(info.icon), document.createTextNode(` ${info.title}`));
  const value = info.max ? `${state[selected]} / ${info.max}` : String(state[selected]);
  card.querySelector(".scene3d-card-value").textContent = viewTurn === null ? `Сега: ${value}` : `На ход ${viewTurn}: ${value}`;
  card.querySelector(".scene3d-card-role").textContent = info.role;
  card.querySelector(".scene3d-card-actions").textContent = info.actions();
  card.querySelector(".scene3d-card-chain").textContent = `Зависи от: ${info.from} · Влияе на: ${info.to}`;
  // Тесен телефон → долен лист (bottom sheet) над конзолата, за да не закрива долината.
  const sheet = box.clientWidth < 560;
  card.classList.toggle("is-sheet", sheet);
  const host = sheet ? document.body : layer;
  if (card.parentNode !== host) host.append(card);
  card.hidden = false;
}

// Картата стои до обекта, но винаги вътре в долината и без да закрива видовете и стрелките,
// които обяснява. Пробваме няколко места и взимаме най-близкото, което не покрива нищо важно.
let cardPlace = null;
function positionCard() {
  if (!selected || card.hidden || card.classList.contains("is-sheet")) return;
  const p = toScreen(anchor(selected, tmpV));
  const width = card.offsetWidth, height = card.offsetHeight;
  const w = box.clientWidth, h = box.clientHeight;
  const gap = 26, minTop = 50, maxBottom = h - 48;
  const clampPlace = ([left, top]) => [Math.min(w - width - 8, Math.max(8, left)), Math.min(maxBottom - height, Math.max(minTop, top))];
  const candidates = [
    [p.x + gap, p.y - height / 2], [p.x - width - gap, p.y - height / 2],
    [p.x - width / 2, p.y - height - gap], [p.x - width / 2, p.y + gap],
    [8, minTop], [w - width - 8, minTop], [8, maxBottom - height], [w - width - 8, maxBottom - height],
  ].map(clampPlace);
  // Важните точки: котвите на четирите вида и надписите на стрелките.
  const important = CHAIN.map((kind) => toScreen(anchor(kind, new THREE.Vector3())));
  for (const item of floating) if (item.group === "link") important.push(toScreen(item.world));
  const score = ([left, top]) => {
    let covered = 0;
    for (const point of important) {
      if (point.x > left - 12 && point.x < left + width + 12 && point.y > top - 12 && point.y < top + height + 12) covered += 1;
    }
    return covered * 1000 + Math.hypot(left + width / 2 - p.x, top + height / 2 - p.y);
  };
  // Мястото се сменя само при осезаемо по-добър вариант — иначе картата би „подскачала“ при дрейфа на камерата.
  let best = candidates[0];
  for (const place of candidates) if (score(place) < score(best)) best = place;
  if (!cardPlace || score(best) < score(cardPlace) - 40) cardPlace = best;
  card.style.transform = `translate(${Math.round(cardPlace[0])}px, ${Math.round(cardPlace[1])}px)`;
}

// Подсветка: избраният вид свети и пулсира, другите се приглушават.
function updateHighlight(now, dt) {
  const pulse = motionAllowed() ? (Math.sin(now / 260) + 1) / 2 : 0.5;
  const speed = Math.min(1, dt * 8 || 1);
  for (const kind of CHAIN) {
    const goal = selected && kind !== selected ? 0.5 : 1;
    dim[kind] += (goal - dim[kind]) * speed;
  }
  water.material.color.copy(waterTint).multiplyScalar(dim.water);
  grassMesh.material.color.copy(grassTint).multiplyScalar(dim.grass);
  rabbitMesh.material.color.setScalar(dim.rabbits);
  foxMesh.material.color.setScalar(dim.foxes);

  if (selected === "grass") grassMesh.material.emissive.add(tmpColor.copy(accentColor).multiplyScalar(0.1 + 0.12 * pulse));
  rabbitHull.visible = selected === "rabbits";
  foxHull.visible = selected === "foxes";
  outlineWidth.value = 0.05 + 0.025 * pulse;

  waterRing.visible = selected === "water" && water.visible;
  if (waterRing.visible) {
    const r = shoreRadius(water.position.y) + 0.06 * pulse;
    waterRing.scale.set(r, 1, r);
    waterRing.position.y = water.position.y + 0.02;
  }
}

// ----- C. Причинни връзки -----

// Стрелки по веригата вода → трева → зайци → лисици: ярки до избрания вид (от какво зависи)
// и една по-бледа след него (на какво влияе). Строят се наново, когато животните се преместят.
function rebuildArrows() {
  arrowsDirty = false;
  for (const child of [...arrows.children]) {
    if (child.geometry !== arrowHeadGeometry) child.geometry.dispose();
    arrows.remove(child);
  }
  removeFloating("link");
  if (!selected) return;
  const index = CHAIN.indexOf(selected);
  const links = [];
  for (let i = 0; i < index; i++) links.push([CHAIN[i], CHAIN[i + 1], true]);
  if (index < CHAIN.length - 1) links.push([selected, CHAIN[index + 1], false]);
  for (const [fromKind, toKind, strong] of links) {
    const start = anchor(fromKind, new THREE.Vector3());
    const end = anchor(toKind, new THREE.Vector3());
    const middle = start.clone().lerp(end, 0.5);
    middle.y += 0.8 + start.distanceTo(end) * 0.22;
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, strong ? 0.09 : 0.06, 8), strong ? arrowStrong : arrowSoft);
    const head = new THREE.Mesh(arrowHeadGeometry, strong ? headStrong : headSoft);
    head.position.copy(curve.getPoint(0.96));
    head.quaternion.setFromUnitVectors(UP, curve.getTangent(0.96).normalize());
    tube.renderOrder = head.renderOrder = 3;
    arrows.add(tube, head);
    const text = element("span", `scene3d-label scene3d-link${strong ? "" : " is-soft"}`, `${NAMES[fromKind]} → ${LINK_TEXT[toKind]}`);
    addFloating(text, curve.getPoint(0.5), Infinity, "link");
  }
}

// ----- B. Preview на действието -----

// Пряк ефект на действието и на събитието следващия ход. Числата идват от SIM и eventForTurn
// (simulation.js, само четене). Пълният резултат НЕ се показва — той е за прогнозата на ученика.
function directEffects(action, state, mission) {
  const effects = { water: [], grass: [], rabbits: [], foxes: [] };
  const fromAction = (typeof SIM !== "undefined" && SIM.actions[action]) || {};
  for (const kind of CHAIN) {
    if (fromAction[kind]) effects[kind].push({ value: fromAction[kind], text: ACTION_NAMES[action] });
  }
  const event = typeof eventForTurn === "function" ? eventForTurn(mission, state.turn + 1) : { type: "none" };
  if (typeof SIM !== "undefined") {
    if (event.type === "rain") effects.water.push({ value: SIM.rainWater, text: "дъжд" });
    if (event.type === "drought") effects.water.push({ value: SIM.droughtWater, text: "суша" });
    if (event.type === "disease" && effects[event.species]) effects[event.species].push({ percent: -Math.round(SIM.diseaseLoss * 100), text: "болест" });
  }
  return effects;
}

// Призрачни модели само за новите инстанции (от fromCount до toCount).
function placeGhosts(mesh, spots, fromCount, toCount, heightScale) {
  const n = Math.min(spots.length, Math.ceil(toCount));
  for (let i = 0; i < n; i++) {
    const spot = spots[i];
    const grow = i < Math.ceil(fromCount) ? 0 : Math.min(1, toCount - i);
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.rotation.set(0, spot.yaw, 0);
    dummy.scale.set(spot.size * grow, spot.size * grow * heightScale, spot.size * grow);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}

function setPreview(action, state, mission) {
  previewEffects = null;
  removeFloating("ghost");
  for (const mesh of [ghostRabbits, ghostFoxes, ghostGrass]) mesh.count = 0;
  ghostRing.visible = false;
  previewChip.hidden = true;
  const allowed = typeof actionError !== "function" || !actionError(action, state);
  if (!action || !state || !mission || viewTurn !== null || !allowed) {
    requestRender();
    return;
  }
  const effects = directEffects(action, state, mission);
  const sum = (kind) => effects[kind].reduce((total, effect) => total + (effect.value || 0), 0);

  if (sum("water")) {
    const level = waterLevel(Math.min(100, Math.max(0, state.water + sum("water"))));
    const r = shoreRadius(level);
    ghostRing.scale.set(r, 1, r);
    ghostRing.position.y = level + 0.02;
    ghostRing.visible = true;
  }
  if (sum("grass") > 0) {
    const grassHeight = 0.7 + 0.9 * state.grass / 500;
    placeGhosts(ghostGrass, grassSpots, MAX_GRASS * state.grass / 500, MAX_GRASS * Math.min(500, state.grass + sum("grass")) / 500, grassHeight);
  }
  if (sum("rabbits") > 0) placeGhosts(ghostRabbits, rabbitSpots, models(state.rabbits, RABBITS_PER_MODEL), models(state.rabbits + sum("rabbits"), RABBITS_PER_MODEL), 1);
  if (sum("foxes") > 0) placeGhosts(ghostFoxes, foxSpots, models(state.foxes, FOXES_PER_MODEL), models(state.foxes + sum("foxes"), FOXES_PER_MODEL), 1);

  let any = false;
  for (const kind of CHAIN) {
    if (!effects[kind].length) continue;
    any = true;
    const net = sum(kind);
    const percent = effects[kind].find((effect) => effect.percent);
    const big = percent ? `−${Math.abs(percent.percent)}%` : `${net > 0 ? "+" : "−"}${Math.abs(net)}`;
    // Един ефект → само причината („засаждане“); няколко → разбивка („водоем +25 · суша −20“).
    const detail = effects[kind].length === 1 ? effects[kind][0].text
      : effects[kind].map((effect) => `${effect.text} ${effect.percent ? "−" + Math.abs(effect.percent) + "%" : (effect.value > 0 ? "+" : "−") + Math.abs(effect.value)}`).join(" · ");
    const node = element("span", `scene3d-label scene3d-ghost ${net > 0 ? "up" : "down"}`);
    node.append(icon(INFO[kind].icon), element("strong", null, `${net > 0 ? "↑" : "↓"} ${big}`), element("small", null, detail));
    addFloating(node, kind, Infinity, "ghost");
  }
  previewEffects = any ? effects : null;
  previewChip.hidden = !any;
  requestRender();
}

// ----- E. Изскачащи числа -----

function showDeltas(before, after) {
  removeFloating("delta");
  const until = performance.now() + 2400;
  for (const kind of CHAIN) {
    const diff = after[kind] - before[kind];
    if (!diff) continue;
    const node = element("span", `scene3d-label scene3d-delta ${diff > 0 ? "up" : "down"}`);
    node.append(icon(INFO[kind].icon), element("strong", null, `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`));
    addFloating(node, kind, until, "delta");
  }
  requestRender();
}

// ----- F. Времето: ефект в сцената + балонче „защо“ -----

function weatherText(event) {
  const s = typeof SIM !== "undefined" ? SIM : { rainWater: 20, droughtWater: -20, diseaseLoss: 0.3 };
  if (event.type === "rain") return `🌧 Дъжд (rain): вода +${s.rainWater}. Повече вода → тревата расте по-бързо.`;
  if (event.type === "drought") return `☀ Суша (drought): вода −${Math.abs(s.droughtWater)}. По-малко вода → тревата расте бавно и пожълтява.`;
  if (event.type === "disease") {
    const who = { grass: "тревата", rabbits: "зайците", foxes: "лисиците" }[event.species];
    const why = {
      foxes: "По-малко хищници → зайците си отдъхват.",
      rabbits: "По-малко зайци → лисиците гладуват, а тревата се възстановява.",
      grass: "По-малко трева → по-малко храна за зайците.",
    }[event.species];
    return `🦠 Болест (disease) при ${who}: −${Math.round(s.diseaseLoss * 100)}%. ${why}`;
  }
  return "";
}

function showWeather(event) {
  if (!event || event.type === "none") return;
  bubble.textContent = weatherText(event);
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 6000);
}

// Частиците тръгват от центъра на ефекта; при „намалено движение“ няма частици.
function startEventEffects(event) {
  if (!event || event.type === "none") return;
  const now = performance.now();
  if (event.type === "rain") rainUntil = motionAllowed() ? now + 2600 : 0;
  if (event.type === "disease") {
    sickMaterial = ({ grass: grassMesh, rabbits: rabbitMesh, foxes: foxMesh }[event.species] || {}).material || null;
    sickUntil = now + 1800;
  }
  if (!motionAllowed() || (event.type !== "drought" && event.type !== "disease")) return;
  effectMode = event.type;
  effectUntil = now + 2800;
  if (event.type === "disease") anchor(event.species, effectCenter);
  else effectCenter.set(0, 0, 0);
  const spread = event.type === "drought" ? 9 : 1.6;
  const p = particles.geometry.attributes.position;
  const random = seeded(Math.floor(now) % 1000 + 1);
  for (let i = 0; i < PARTICLES; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()) * spread;
    p.setXYZ(i, effectCenter.x + Math.cos(a) * r, (event.type === "drought" ? 0.2 : effectCenter.y - 0.6) + random() * 1.5, effectCenter.z + Math.sin(a) * r);
  }
  p.needsUpdate = true;
  particles.material.color.setHex(event.type === "drought" ? 0xe6cf9a : 0xb0503c);
  particles.visible = true;
}

function updateParticles(now, dt) {
  particles.visible = now < effectUntil;
  if (!particles.visible) return;
  const p = particles.geometry.attributes.position;
  const rise = effectMode === "drought" ? 0.35 : 0.6;
  for (let i = 0; i < PARTICLES; i++) {
    p.setY(i, p.getY(i) + rise * dt);
    p.setX(i, p.getX(i) + Math.sin(now / 700 + i) * 0.2 * dt);
  }
  p.needsUpdate = true;
  particles.material.opacity = 0.8 * Math.min(1, (effectUntil - now) / 800);
}

// ----- D. Лента с ходовете -----

function updateTimeline() {
  const max = history.length - 1;
  timeline.hidden = !show3D || max < 1;
  range.max = String(Math.max(0, max));
  range.value = String(viewTurn === null ? max : viewTurn);
  timelineOutput.textContent = viewTurn === null ? `Ход ${max} · сега` : `Ход ${viewTurn} от ${max}`;
  nowButton.disabled = viewTurn === null;
  box.classList.toggle("is-past", viewTurn !== null);
}

// Връща сцената към минал ход — само изглед, играта и записът не се променят.
function scrubTo(turn) {
  const max = history.length - 1;
  if (!history[turn]) return;
  viewTurn = turn >= max ? null : turn;
  const entry = entries[turn - 1];
  goTo(viewedState(), viewTurn === null ? lastEventType : (entry ? entry.event.type : "none"), true);
  if (viewTurn === null && lastPreview) setPreview(...lastPreview);
  else setPreview(null);
  updateTimeline();
  updateCard();
  // Какво се промени в този ход (след кратка пауза, за да не мига при бързо местене).
  clearTimeout(scrubTimer);
  scrubTimer = setTimeout(() => { if (turn > 0) showDeltas(history[turn - 1], history[turn]); }, 220);
}

// ----- Всеки кадър -----

function updateInteraction(now, dt) {
  if (arrowsDirty && !target) rebuildArrows();
  updateHighlight(now, dt);
  // Призраците пулсират леко, за да личи, че са „може би“, а не реалност.
  const ghostOpacity = motionAllowed() ? 0.3 + 0.15 * Math.sin(now / 300) : 0.38;
  for (const mesh of [ghostRabbits, ghostFoxes, ghostGrass]) mesh.material.opacity = ghostOpacity;
  updateParticles(now, dt);
  for (let i = floating.length - 1; i >= 0; i--) {
    const item = floating[i];
    if (now > item.until) {
      item.node.remove();
      floating.splice(i, 1);
      continue;
    }
    const p = toScreen(item.kind ? anchor(item.kind, tmpV) : item.world);
    // Надписът стои центриран точно над точката; CSS анимацията ползва отделното свойство translate.
    item.node.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
    item.node.style.visibility = p.onScreen ? "" : "hidden";
  }
  positionCard();
}

// ---------- 2D / 3D ----------

function setMode(on) {
  if (on && !renderer && !failed && !init()) on = false;
  if (failed) toggle.hidden = true;
  show3D = on;
  box.hidden = !on;
  // SVG остава в страницата (държи размера на сцената), но се скрива при 3D.
  svg.style.visibility = on ? "hidden" : "";
  // Без aria-pressed: resetChoices() в main.js нулира всички такива бутони след ход.
  toggle.textContent = on ? "2D" : "3D";
  toggle.dataset.mode = on ? "3d" : "2d";
  toggle.setAttribute("aria-label", on ? "Покажи 2D картинката" : "Покажи 3D долината");
  try { localStorage.setItem("bioworld-view", on ? "3d" : "2d"); } catch (error) { /* без запомняне */ }
  if (!renderer) return;
  if (!on) select(null);
  updateTimeline();
  if (on && latestState) {
    resize();
    target = null;
    shown = toShown(viewedState());
    apply(shown);
    if (lastPreview) setPreview(...lastPreview);
    requestRender();
    if (!hintShown) {
      hintShown = true;
      const short = box.clientWidth < 500;
      showTip(null, short ? "Докосни вода, трева или животно. Плъзни, за да завъртиш." : "Докосни вода, трева или животно за обяснение. Плъзни, за да завъртиш долината.", 12, short ? 46 : 52);
    }
  }
}

if (svg && box && toggle && window.WebGLRenderingContext) {
  toggle.hidden = false;
  toggle.addEventListener("click", () => setMode(!show3D));
  document.addEventListener("visibilitychange", requestRender);

  let saved = null;
  try { saved = localStorage.getItem("bioworld-view"); } catch (error) { /* без запомняне */ }
  const startIn3D = saved !== "2d";

  // ---------- Връзка с main.js ----------
  window.Scene3D = {
    // state: game.state; event: събитието на изиграния ход или null;
    // instant: true при нова/заредена игра — без анимация.
    // options.history / options.entries: game.history и game.entries (само за четене, за лентата D).
    update(state, event, options = {}) {
      const before = latestState;
      const after = { ...state };
      latestState = after;
      history = options.history || [after];
      entries = options.entries || [];
      lastEventType = event ? event.type : "none";
      if (!renderer && startIn3D && !failed && !show3D) setMode(true);
      if (!renderer) return;

      const instant = Boolean(options.instant) || !shown;
      viewTurn = null;            // нов ход → обратно към „сега“
      goTo(after, lastEventType, !instant);
      setPreview(null);
      lastPreview = null;
      updateTimeline();
      updateCard();
      if (instant) {
        // Нова или заредена игра: без стари числа, балончета и ефекти.
        pendingAfterFeedback.length = 0;
        removeFloating("delta");
        bubble.hidden = true;
        effectUntil = rainUntil = sickUntil = 0;
      } else if (before) {
        // Прозорецът „Последици от хода“ се отваря веднага след това — изчакваме го.
        setTimeout(() => queueAfterFeedback(() => {
          startEventEffects(event);
          showDeltas(before, after);
          showWeather(event);
        }), 0);
      }
      requestRender();
    },
    // B. main.js съобщава избраното действие (или null при отказ/смяна).
    preview(action, state, mission) {
      lastPreview = action ? [action, { ...state }, mission] : null;
      if (renderer && show3D) setPreview(action, state, mission);
    },
    // За автоматична проверка: изпълнява n кадъра веднага (и в скрит раздел, където кадрите спират).
    tick(n = 1) {
      if (!renderer) return;
      let now = performance.now();
      for (let i = 0; i < n; i++) {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        now += 16.7;
        frame(now);
      }
    },
    // За проверка в конзолата: текущото качество.
    debug: () => ({ ...quality, renderer: Boolean(renderer), show3D, fps: Math.round(fpsAverage) }),
    // Тест на скоростта: рисува n кадъра наведнъж и връща средното време за кадър в ms.
    benchmark(n = 60) {
      if (!renderer) return null;
      const gl = renderer.getContext(), pixel = new Uint8Array(4);
      const start = performance.now();
      for (let i = 0; i < n; i++) {
        renderer.shadowMap.needsUpdate = true;
        if (composer) composer.render();
        else renderer.render(scene, camera);
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // чакаме видеокартата да свърши
      return Math.round(((performance.now() - start) / n) * 100) / 100;
    },
  };
}
