// 3D долина (Three.js r149 — глобалният обект THREE идва от CDN в index.html).
//
// Файлът само ПОКАЗВА game.state: чете водата, тревата, зайците и лисиците и
// не променя нищо в играта. main.js вика Scene3D.update() от renderGame().
// Ако THREE не се е заредил или устройството няма WebGL, остава 2D картинката (SVG).
(function () {
  // ---------- Настройки (малки числа = плавно на среден телефон) ----------
  const MAX_GRASS = 220;          // най-много туфи трева (при 500 трева)
  const RABBITS_PER_MODEL = 4;    // 1 модел заек = 4 зайци → най-много 50 модела
  const FOXES_PER_MODEL = 1;      // 1 модел лисица = 1 лисица → най-много 50 модела
  const MAX_MODELS = 50;
  const RAIN_DROPS = 220;
  const ANIM_MS = 450;            // колко трае плавната промяна след ход
  const FRAME_MS = 1000 / 30;     // най-много 30 кадъра в секунда (пести батерия)
  const POND = { x: -3.2, z: 1.6, maxRadius: 4 };

  // Цветовете са взети от 2D долината и иконите на показателите,
  // за да се вижда, че 3D сцената показва същите неща.
  const COLORS = {
    meadow: 0x6f9a55, meadowDry: 0xa39a5e, meadowEdge: 0x335e39, pondBed: 0x8b7955,
    waterHigh: 0x438ba1, waterLow: 0xa39364,
    grass: 0xa6c974, grassDry: 0xd9c27a,
    rabbit: 0xe9dcc0, rabbitTail: 0xfff0d7,
    fox: 0xbe7445, foxHead: 0xd48850, foxDark: 0x643f2b, foxWhite: 0xf7e6c3,
    trunk: 0x443f2d, pine: 0x183f38, pineLight: 0x28614a,
    rain: 0xd7f1ef,
  };

  // Надписи при докосване: български термин + английски в скоби.
  const TIPS = {
    water: { icon: "water-icon", text: (s) => `Вода (water): ${s.water} / 100. Без вода тревата не расте.` },
    grass: { icon: "grass-icon", text: (s) => `Трева (grass, producer): ${s.grass} / 500. Храна за зайците.` },
    rabbits: { icon: "rabbit-icon", text: (s) => `Зайци (rabbits, herbivores): ${s.rabbits}. 1 модел = ${RABBITS_PER_MODEL} зайци. Ядат трева.` },
    foxes: { icon: "fox-icon", text: (s) => `Лисици (foxes, predators): ${s.foxes}. 1 модел = 1 лисица. Ловуват зайци.` },
  };

  const card = document.querySelector("#game-screen .scene-card");
  const svg = document.getElementById("valley-scene");
  const box = document.getElementById("valley-3d");
  const toggle = document.getElementById("view-toggle");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Без THREE или WebGL: бутонът 2D/3D не се показва и всичко остава както преди.
  if (!card || !svg || !box || !toggle || typeof THREE === "undefined" || !window.WebGLRenderingContext) return;

  let renderer = null, scene, camera, raycaster;
  let water, ground, pondBed, grassMesh, rabbitMesh, foxMesh, rain;
  let grassSpots, rabbitSpots, foxSpots;
  let failed = false, show3D = false, hintShown = false;

  // Какво е показано сега и към какво анимираме.
  let shown = null, from = null, target = null, animStart = 0;
  let latestState = null;  // последното реално състояние (за надписите при докосване)
  let rainUntil = 0, sickUntil = 0, sickMesh = null;

  // Камера: върти се около центъра на долината.
  let angle = 0.6, tilt = 0.55, autoRotate = true, lastUserTouch = 0;
  let inView = true, rafId = null, lastFrame = 0;

  // ---------- Помощни функции ----------

  // Повтаряем „случаен“ генератор: долината изглежда еднакво при всяко зареждане.
  function seeded(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // Места в долината извън водоема.
  function makeSpots(count, seed, minR, maxR, size) {
    const random = seeded(seed);
    const spots = [];
    while (spots.length < count) {
      const r = minR + Math.sqrt(random()) * (maxR - minR);
      const a = random() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.maxRadius + 0.5) continue;
      spots.push({ x, z, yaw: random() * Math.PI * 2, size: size * (0.8 + random() * 0.4) });
    }
    return spots;
  }

  // Слива няколко прости форми в една, всяка със свой цвят (vertex colors).
  // Така цял заек е ЕДНА геометрия и 50 заека се рисуват наведнъж (instancing).
  function merge(parts) {
    const positions = [], normals = [], colors = [];
    const color = new THREE.Color();
    for (const part of parts) {
      const g = part.geometry.toNonIndexed();
      color.setHex(part.color);
      positions.push(...g.attributes.position.array);
      normals.push(...g.attributes.normal.array);
      for (let i = 0; i < g.attributes.position.count; i++) colors.push(color.r, color.g, color.b);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    out.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return out;
  }

  function rabbitGeometry() {
    const c = COLORS.rabbit;
    return merge([
      { geometry: new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.85, 1.35).translate(0, 0.2, 0), color: c },
      { geometry: new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.33, 0.27), color: COLORS.rabbitTail },
      { geometry: new THREE.CylinderGeometry(0.03, 0.045, 0.24, 5).translate(-0.05, 0.52, 0.22), color: c },
      { geometry: new THREE.CylinderGeometry(0.03, 0.045, 0.24, 5).translate(0.05, 0.52, 0.22), color: c },
      { geometry: new THREE.SphereGeometry(0.07, 5, 4).translate(0, 0.24, -0.31), color: COLORS.rabbitTail },
    ]);
  }

  function foxGeometry() {
    const parts = [
      { geometry: new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.85, 1.8).translate(0, 0.34, 0), color: COLORS.fox },
      { geometry: new THREE.ConeGeometry(0.15, 0.34, 6).rotateX(Math.PI / 2).translate(0, 0.42, 0.52), color: COLORS.foxHead },
      { geometry: new THREE.SphereGeometry(0.04, 5, 4).translate(0, 0.42, 0.7), color: COLORS.foxDark },
      { geometry: new THREE.ConeGeometry(0.05, 0.13, 4).translate(-0.07, 0.58, 0.44), color: COLORS.foxHead },
      { geometry: new THREE.ConeGeometry(0.05, 0.13, 4).translate(0.07, 0.58, 0.44), color: COLORS.foxHead },
      { geometry: new THREE.ConeGeometry(0.1, 0.46, 6).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.44, -0.58), color: COLORS.fox },
      { geometry: new THREE.SphereGeometry(0.07, 5, 4).translate(0, 0.33, -0.78), color: COLORS.foxWhite },
    ];
    for (const [x, z] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.03, 0.03, 0.22, 4).translate(x, 0.11, z), color: COLORS.foxDark });
    }
    return merge(parts);
  }

  // Туфа от 3 стръка — изглежда гъсто с малко обекти.
  function grassGeometry() {
    const blade = (x, z, tilt) => new THREE.ConeGeometry(0.06, 0.5, 3).translate(0, 0.25, 0).rotateZ(tilt).translate(x, 0, z);
    const g = merge([
      { geometry: blade(0, 0, 0), color: 0xffffff },
      { geometry: blade(0.08, 0.04, 0.25), color: 0xffffff },
      { geometry: blade(-0.07, -0.03, -0.25), color: 0xffffff },
    ]);
    g.deleteAttribute("color"); // цветът на тревата е общ и се сменя при малко вода
    return g;
  }

  // Борове по края, като в 2D долината — само за ориентация, не са част от модела.
  function treesGeometry() {
    const parts = [];
    const random = seeded(99);
    for (let i = 0; i < 9; i++) {
      const a = 0.3 + i * 0.7 + random() * 0.3;
      const x = Math.cos(a) * 10, z = Math.sin(a) * 10;
      const h = 1 + random() * 0.7;
      parts.push({ geometry: new THREE.CylinderGeometry(0.12, 0.16, 0.6, 5).translate(x, 0.3, z), color: COLORS.trunk });
      parts.push({ geometry: new THREE.ConeGeometry(0.75, h * 1.5, 6).translate(x, 0.55 + h * 0.75, z), color: COLORS.pine });
      parts.push({ geometry: new THREE.ConeGeometry(0.55, h * 1.1, 6).translate(x, 0.95 + h * 1.05, z), color: COLORS.pineLight });
    }
    return merge(parts);
  }

  function flatCircle(radius, color, y) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshLambertMaterial({ color }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  }

  // ---------- Създаване на сцената (само веднъж, при първото показване) ----------

  function init() {
    try {
      // alpha: небето е CSS градиент (както в 2D долината), а не част от 3D сцената.
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: window.devicePixelRatio <= 1, powerPreference: "low-power" });
    } catch (error) {
      failed = true;
      return false;
    }
    // Над 1,5 разликата не се вижда на телефон, а натоварва видеокартата много.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.setAttribute("role", "img");
    box.append(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
    raycaster = new THREE.Raycaster();

    scene.add(new THREE.HemisphereLight(0xfff4d6, 0x335e39, 0.85));
    const sun = new THREE.DirectionalLight(0xfff1b7, 0.7);
    sun.position.set(6, 10, -4);
    scene.add(sun);

    scene.add(flatCircle(11.2, COLORS.meadowEdge, -0.02));
    ground = flatCircle(10.6, COLORS.meadow, 0);
    scene.add(ground);
    pondBed = flatCircle(POND.maxRadius + 0.2, COLORS.pondBed, 0.01);
    pondBed.position.x = POND.x;
    pondBed.position.z = POND.z;
    scene.add(pondBed);

    // Водата: цилиндър с основа на земята; ширината и височината следват водата.
    water = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 32).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: COLORS.waterHigh, transparent: true, opacity: 0.92 }),
    );
    water.position.set(POND.x, 0.012, POND.z);
    scene.add(water);

    scene.add(new THREE.Mesh(treesGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));

    // InstancedMesh = една геометрия, нарисувана много пъти → бързо дори на телефон.
    grassSpots = makeSpots(MAX_GRASS, 7, 0.5, 9.6, 1);
    rabbitSpots = makeSpots(MAX_MODELS, 21, 1, 8.8, 1.15);
    foxSpots = makeSpots(MAX_MODELS, 37, 1, 8.8, 1);
    grassMesh = new THREE.InstancedMesh(grassGeometry(), new THREE.MeshLambertMaterial({ color: COLORS.grass }), MAX_GRASS);
    rabbitMesh = new THREE.InstancedMesh(rabbitGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_MODELS);
    foxMesh = new THREE.InstancedMesh(foxGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_MODELS);
    for (const mesh of [grassMesh, rabbitMesh, foxMesh]) {
      // Инстанциите са из цялата долина, а Three.js проверява само центъра — затова без изрязване.
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }

    // Дъжд: точки, които падат ~2 секунди след ход с дъжд.
    const drops = new Float32Array(RAIN_DROPS * 3);
    const random = seeded(5);
    for (let i = 0; i < RAIN_DROPS; i++) {
      drops[i * 3] = (random() - 0.5) * 18;
      drops[i * 3 + 1] = random() * 8;
      drops[i * 3 + 2] = (random() - 0.5) * 18;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(drops, 3));
    rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: COLORS.rain, size: 0.09 }));
    rain.visible = false;
    rain.frustumCulled = false;
    scene.add(rain);

    setupControls();
    new ResizeObserver(resize).observe(box);
    // Рисуваме само когато долината се вижда на екрана.
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) requestRender();
    }).observe(box);
    resize();
    return true;
  }

  // Платното заема цялата сцена (размерът идва от дизайна в game.css).
  function resize() {
    if (!renderer) return;
    const width = box.clientWidth || 320;
    const height = box.clientHeight || 240;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // На тесен/висок или нисък екран (телефон) отдалечаваме камерата, за да се вижда цялата долина.
    let distance = camera.aspect < 1 ? 27 : camera.aspect < 1.4 ? 22 : 19;
    if (height < 300) distance += 4;
    camera.userData.distance = distance;
    camera.updateProjectionMatrix();
    requestRender();
  }

  // ---------- Обновяване на обектите според стойностите ----------

  const dummy = new THREE.Object3D();
  // Готови цветове — не създаваме нови обекти във всеки кадър.
  const WATER_LOW = new THREE.Color(COLORS.waterLow), WATER_HIGH = new THREE.Color(COLORS.waterHigh);
  const GRASS_OK = new THREE.Color(COLORS.grass), GRASS_DRY = new THREE.Color(COLORS.grassDry);
  const MEADOW_OK = new THREE.Color(COLORS.meadow), MEADOW_DRY = new THREE.Color(COLORS.meadowDry);

  // modelCount може да е дробно по време на анимация: последният модел е по-малък.
  function placeInstances(mesh, spots, modelCount, heightScale) {
    const n = Math.min(spots.length, Math.ceil(modelCount));
    for (let i = 0; i < n; i++) {
      const grow = Math.min(1, modelCount - i);
      const spot = spots[i];
      dummy.position.set(spot.x, 0, spot.z);
      dummy.rotation.set(0, spot.yaw, 0);
      dummy.scale.set(spot.size * grow, spot.size * grow * heightScale, spot.size * grow);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Колко модела отговарят на дадена бройка. Поне 1 модел, ако има поне 1 животно.
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
    const radius = 1.2 + (POND.maxRadius - 1.2) * w;
    water.scale.set(radius, 0.05 + 0.25 * w, radius);
    // Малко вода → кална, кафеникава; много вода → синя.
    water.material.color.lerpColors(WATER_LOW, WATER_HIGH, Math.min(1, w * 1.6));

    // Под 35 вода тревата пожълтява — виждаш, че ѝ липсва вода.
    const dryness = Math.max(0, Math.min(1, (35 - values.water) / 35));
    grassMesh.material.color.lerpColors(GRASS_OK, GRASS_DRY, dryness);
    ground.material.color.lerpColors(MEADOW_OK, MEADOW_DRY, dryness);
    placeInstances(grassMesh, grassSpots, MAX_GRASS * values.grass / 500, 0.7 + 0.9 * values.grass / 500);

    placeInstances(rabbitMesh, rabbitSpots, values.rabbitModels, 1);
    placeInstances(foxMesh, foxSpots, values.foxModels, 1);
  }

  // ---------- Цикъл на рисуване ----------

  function motionAllowed() {
    return !reducedMotion.matches;
  }

  function busy(now) {
    return (target && now - animStart < ANIM_MS) || now < rainUntil || now < sickUntil;
  }

  function wantsFrames(now) {
    if (!show3D || !inView || document.hidden) return false;
    return busy(now) || (autoRotate && motionAllowed() && now - lastUserTouch > 4000);
  }

  function requestRender() {
    if (renderer && show3D && !rafId) rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    rafId = null;
    // Ограничаваме до ~30 кадъра в секунда.
    if (now - lastFrame < FRAME_MS && wantsFrames(now)) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    // Плавен преход към новите стойности след ход — вижда се какво се е променило.
    if (target) {
      const t = Math.min(1, (now - animStart) / ANIM_MS);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      shown = {};
      for (const key of Object.keys(target)) shown[key] = from[key] + (target[key] - from[key]) * ease;
      apply(shown);
      if (t >= 1) target = null;
    }

    // Дъжд: капките падат и се връщат горе.
    rain.visible = now < rainUntil;
    if (rain.visible) {
      const p = rain.geometry.attributes.position;
      for (let i = 0; i < RAIN_DROPS; i++) {
        let y = p.getY(i) - 9 * dt;
        if (y < 0) y += 8;
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    // Болест: засегнатият вид мига в червено (без мигане при „намалено движение“).
    for (const mesh of [grassMesh, rabbitMesh, foxMesh]) mesh.material.emissive.setHex(0x000000);
    if (sickMesh && now < sickUntil) {
      const pulse = motionAllowed() ? (Math.sin(now / 90) + 1) / 2 : 1;
      sickMesh.material.emissive.setRGB(0.6 * pulse, 0, 0);
    }

    if (autoRotate && motionAllowed() && now - lastUserTouch > 4000) angle += dt * 0.12;
    const distance = camera.userData.distance;
    camera.position.set(Math.cos(angle) * distance * Math.cos(tilt), distance * Math.sin(tilt), Math.sin(angle) * distance * Math.cos(tilt));
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    if (wantsFrames(now)) rafId = requestAnimationFrame(frame);
    else if (sickMesh && now >= sickUntil) {
      sickMesh = null;
      requestRender(); // още един кадър, за да изчезне червеното
    }
  }

  // ---------- Въртене с пръст/мишка и докосване ----------

  function setupControls() {
    const canvas = renderer.domElement;
    // Екранът на играта не се превърта, затова пръстът върти долината и в двете посоки.
    canvas.style.touchAction = "none";
    let down = null;

    canvas.addEventListener("pointerdown", (event) => {
      down = { x: event.clientX, y: event.clientY, angle, tilt };
      lastUserTouch = performance.now();
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!down) return;
      angle = down.angle + (event.clientX - down.x) * 0.01;
      // Наклонът е ограничен: не можем да погледнем под земята или право отгоре.
      tilt = Math.min(1.2, Math.max(0.3, down.tilt + (event.clientY - down.y) * 0.005));
      lastUserTouch = performance.now();
      requestRender();
    });
    const end = (event) => {
      if (!down) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (event.type === "pointerup" && moved < 8) showTipAt(event);
      down = null;
      lastUserTouch = performance.now();
      requestRender();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
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

  // Докосване → кратък надпис какво е това и колко е сега.
  function showTipAt(event) {
    if (!latestState) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([water, pondBed, foxMesh, rabbitMesh, grassMesh, ground], false)[0];
    if (!hit) return;
    const kind = hit.object === foxMesh ? "foxes"
      : hit.object === rabbitMesh ? "rabbits"
      : hit.object === water || hit.object === pondBed ? "water"
      : "grass";
    const left = Math.min(rect.width - 240, Math.max(8, event.clientX - rect.left - 115));
    const top = Math.min(rect.height - 90, Math.max(50, event.clientY - rect.top - 80));
    showTip(TIPS[kind].icon, TIPS[kind].text(latestState), left, top);
  }

  // ---------- 2D / 3D ----------

  function setMode(on) {
    if (on && !renderer && !failed && !init()) on = false;
    if (failed) toggle.hidden = true;
    show3D = on;
    box.hidden = !on;
    // SVG остава в страницата (държи размера на сцената), но се скрива, когато 3D е включено.
    svg.style.visibility = on ? "hidden" : "";
    // Без aria-pressed: resetChoices() в main.js нулира всички такива бутони след ход.
    toggle.textContent = on ? "2D" : "3D";
    toggle.dataset.mode = on ? "3d" : "2d";
    toggle.setAttribute("aria-label", on ? "Покажи 2D картинката" : "Покажи 3D долината");
    try { localStorage.setItem("bioworld-view", on ? "3d" : "2d"); } catch (error) { /* без запомняне */ }
    if (on && latestState) {
      resize();
      target = null;
      shown = toShown(latestState);
      apply(shown);
      requestRender();
      if (!hintShown) {
        hintShown = true;
        const short = box.clientWidth < 500;
        showTip(null, short ? "Завърти с пръст. Докосни за обяснение." : "Завърти долината с пръст. Докосни вода, трева или животно за обяснение.", 12, short ? 46 : 52);
      }
    }
  }

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
    update(state, event, options) {
      latestState = { ...state };
      if (!renderer && startIn3D && !failed && !show3D) setMode(true);
      if (!renderer) return;
      // Описанието за екранни четци се сменя веднага, без да чака анимацията.
      renderer.domElement.setAttribute("aria-label",
        `3D долина: вода ${state.water} от 100, трева ${state.grass}, зайци ${state.rabbits}, лисици ${state.foxes}.`);
      const next = toShown(latestState);
      if ((options && options.instant) || !shown) {
        shown = next;
        target = null;
        apply(shown);
      } else {
        from = shown;
        target = next;
        animStart = performance.now();
      }

      // Събитието оцветява небето чрез CSS (box[data-event]), както в 2D долината.
      const type = event ? event.type : "none";
      box.dataset.event = type;
      const now = performance.now();
      rainUntil = type === "rain" && motionAllowed() ? now + 2000 : 0;
      if (type === "disease") {
        sickMesh = { grass: grassMesh, rabbits: rabbitMesh, foxes: foxMesh }[event.species] || null;
        sickUntil = now + 1400;
      }
      requestRender();
    },
  };
})();
