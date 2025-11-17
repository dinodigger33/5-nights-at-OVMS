// game.js
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  night: document.getElementById('night'),
  time: document.getElementById('time'),
  power: document.getElementById('power'),
  controls: document.getElementById('controls'),
  leftDoor: document.getElementById('leftDoor'),
  rightDoor: document.getElementById('rightDoor'),
  mute: document.getElementById('mute'),
};
const sfx = {
  hum: document.getElementById('hum'),
  camera: document.getElementById('camera'),
  door: document.getElementById('door'),
  alert: document.getElementById('alert'),
  lose: document.getElementById('lose'),
  win: document.getElementById('win'),
};

const images = {
  office: loadImage('assets/office.png'),
  cams: {
    A1: loadImage('assets/cam_A1.png'),
    A2: loadImage('assets/cam_A2.png'),
    B1: loadImage('assets/cam_B1.png'),
    B2: loadImage('assets/cam_B2.png'),
  },
  enemyA: loadImage('assets/enemyA.png'),
  enemyB: loadImage('assets/enemyB.png'),
};

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

// Game state
const state = {
  running: true,
  nightIndex: 1,
  timeMinutes: 0,            // 12:00 AM -> 6:00 AM (6 hours -> 360 min)
  displayHour: 12,           // UI hour
  displayPeriod: 'AM',
  power: 100,
  currentCam: 'A1',
  leftDoorClosed: false,
  rightDoorClosed: false,
  muted: false,
  view: 'office',            // 'office' or 'cam'
  enemies: [],
  loss: false,
  win: false,
};

// Power costs
const COSTS = {
  base: 0.02,           // passive drain per second
  camera: 0.12,         // drain while on camera
  door: 0.3,            // per closed door
};

// Enemy definitions
class Enemy {
  constructor(name, path, speed, aggression) {
    this.name = name;
    this.path = path.slice();
    this.pos = 0;
    this.speed = speed;
    this.aggression = aggression;
    this.atOfficeLeft = false;
    this.atOfficeRight = false;
    this.cooldown = 0;
  }
  update(dt) {
    if (state.loss || state.win) return;
    // Increase aggression slightly as the night progresses
    const nightFactor = 1 + state.nightIndex * 0.1;
    const advanceChance = this.aggression * nightFactor * dt;

    // Random advance based on camera watching: watching correct cam deters move
    const currentNode = this.path[this.pos];
    const watchingDeters = (state.view === 'cam' && state.currentCam === currentNode.cam);
    const deterFactor = watchingDeters ? 0.4 : 1.0;

    if (Math.random() < advanceChance * deterFactor) {
      this.pos = Math.min(this.pos + 1, this.path.length - 1);
    }

    // Regress occasionally if watched strongly
    if (watchingDeters && Math.random() < 0.02 * dt) {
      this.pos = Math.max(this.pos - 1, 0);
    }

    const node = this.path[this.pos];
    this.atOfficeLeft = node.office === 'left';
    this.atOfficeRight = node.office === 'right';
  }
  tryAttack() {
    if (this.atOfficeLeft && !state.leftDoorClosed) return true;
    if (this.atOfficeRight && !state.rightDoorClosed) return true;
    return false;
  }
}

// Paths (cams and office approach)
const PATHS = {
  enemyA: [
    { cam: 'A1' }, { cam: 'A2' }, { cam: 'B1' }, { office: 'left' }
  ],
  enemyB: [
    { cam: 'B2' }, { cam: 'B1' }, { cam: 'A2' }, { office: 'right' }
  ],
};

function setupNight(night) {
  state.nightIndex = night;
  state.timeMinutes = 0;
  state.displayHour = 12;
  state.displayPeriod = 'AM';
  state.power = 100;
  state.view = 'office';
  state.currentCam = 'A1';
  state.leftDoorClosed = false;
  state.rightDoorClosed = false;
  state.loss = false;
  state.win = false;

  const baseAgg = 0.04 + night * 0.01; // ramps per night
  state.enemies = [
    new Enemy('Long Arms', PATHS.enemyA, 1, baseAgg),
    new Enemy('Climber', PATHS.enemyB, 1, baseAgg * 0.9),
  ];

  if (!state.muted) {
    sfx.hum.volume = 0.3;
    sfx.hum.play().catch(() => {});
  }
}

setupNight(1);

// Input
ui.controls.addEventListener('click', (e) => {
  const cam = e.target.getAttribute('data-cam');
  if (cam) {
    state.view = 'cam';
    state.currentCam = cam;
    play(sfx.camera, 0.4);
  }
});

ui.leftDoor.addEventListener('click', () => {
  state.leftDoorClosed = !state.leftDoorClosed;
  play(sfx.door, 0.4);
});
ui.rightDoor.addEventListener('click', () => {
  state.rightDoorClosed = !state.rightDoorClosed;
  play(sfx.door, 0.4);
});
ui.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  if (state.muted) sfx.hum.pause();
  else sfx.hum.play().catch(() => {});
});

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { // Space toggles office/cam
    state.view = (state.view === 'office') ? 'cam' : 'office';
    if (state.view === 'cam') play(sfx.camera, 0.4);
  }
  if (e.key === 'ArrowLeft') ui.leftDoor.click();
  if (e.key === 'ArrowRight') ui.rightDoor.click();
});

// Audio helper
function play(aud, vol = 1) {
  if (state.muted) return;
  aud.currentTime = 0;
  aud.volume = vol;
  aud.play().catch(() => {});
}

// Time formatting
function updateClockDisplay() {
  const totalHours = Math.floor(state.timeMinutes / 60);
  const hourMap = [12, 1, 2, 3, 4, 5, 6];
  state.displayHour = hourMap[Math.min(totalHours, 6)];
  state.displayPeriod = state.displayHour === 6 ? 'AM' : 'AM';
  ui.time.textContent = `${state.displayHour}:00 ${state.displayPeriod}`;
}

// Power drain
function drainPower(dt) {
  let drain = COSTS.base;
  if (state.view === 'cam') drain += COSTS.camera;
  if (state.leftDoorClosed) drain += COSTS.door;
  if (state.rightDoorClosed) drain += COSTS.door;
  state.power = Math.max(0, state.power - drain * dt);
  ui.power.textContent = `Power: ${state.power.toFixed(0)}%`;
}

// Win/Lose checks
function checkWinLose() {
  // Win at 6:00 AM (>= 360 minutes)
  if (state.timeMinutes >= 360 && !state.win && !state.loss) {
    state.win = true;
    state.running = false;
    play(sfx.win, 0.7);
  }
  // If power reaches 0, doors open, lights off, enemies can attack more often
  if (state.power <= 0) {
    state.leftDoorClosed = false;
    state.rightDoorClosed = false;
  }
  // Attack check
  for (const e of state.enemies) {
    if (e.tryAttack()) {
      triggerLoss();
      break;
    }
  }
}

function triggerLoss() {
  if (state.loss) return;
  state.loss = true;
  state.running = false;
  flashScreen();
  play(sfx.alert, 0.7);
  setTimeout(() => play(sfx.lose, 0.8), 250);
}

function flashScreen() {
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  setTimeout(() => {}, 150);
}

// Drawing
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.view === 'office') {
    drawOffice();
  } else {
    drawCam(state.currentCam);
  }

  // Overlay
  drawOverlay();
}

function drawOffice() {
  if (images.office.complete) {
    ctx.drawImage(images.office, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#0f121a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3a4560';
    ctx.font = '24px monospace';
    ctx.fillText('Office view (add assets/office.png)', 30, 50);
  }

  // Doors indicators
  ctx.fillStyle = state.leftDoorClosed ? '#4caf50' : '#b33939';
  ctx.fillRect(20, canvas.height - 60, 120, 30);
  ctx.fillStyle = state.rightDoorClosed ? '#4caf50' : '#b33939';
  ctx.fillRect(canvas.width - 140, canvas.height - 60, 120, 30);

  // Enemy silhouettes near doors
  state.enemies.forEach((e, i) => {
    const nearLeft = e.atOfficeLeft;
    const nearRight = e.atOfficeRight;
    if (nearLeft) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(images.enemyA, 80, canvas.height - 220, 140, 180);
      ctx.globalAlpha = 1.0;
    }
    if (nearRight) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(images.enemyB, canvas.width - 220, canvas.height - 220, 140, 180);
      ctx.globalAlpha = 1.0;
    }
  });
}

function drawCam(cam) {
  const img = images.cams[cam];
  if (img && img.complete) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#09101a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7280a7';
    ctx.font = '24px monospace';
    ctx.fillText(`Camera ${cam} (add assets/cam_${cam}.png)`, 30, 50);
  }

  // Static effect
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    const w = Math.random() * 20 + 2;
    const h = Math.random() * 3 + 1;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, w, h);
  }
}

// HUD overlay
function drawOverlay() {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#b8c4e2';
  ctx.font = '20px monospace';
  ctx.fillText(`${state.displayHour}:00 ${state.displayPeriod}`, canvas.width - 180, 30);
  ctx.fillText(`${state.power.toFixed(0)}%`, canvas.width - 100, 60);

  if (state.win) {
    centerText('6:00 AM', '#9ee493');
    centerText('You survived the night.', '#9ee493', 40);
  }
  if (state.loss) {
    centerText('You were caught.', '#ff7b7b');
    centerText('Try again.', '#ff7b7b', 40);
  }
}

function centerText(text, color = '#c8d1e8', offsetY = 0) {
  ctx.fillStyle = color;
  ctx.font = '36px monospace';
  const metrics = ctx.measureText(text);
  ctx.fillText(text, (canvas.width - metrics.width) / 2, canvas.height / 2 + offsetY);
}

// Main loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // seconds
  last = now;

  if (state.running) {
    state.timeMinutes += dt * 60; // 1 real second = 60 in-game minutes / minute scale
    updateClockDisplay();
    drainPower(dt);

    // Enemy updates
    state.enemies.forEach(e => e.update(dt));

    checkWinLose();
  }

  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
