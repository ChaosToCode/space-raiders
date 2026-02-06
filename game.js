const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hudLevel = document.getElementById("level");
const hudScore = document.getElementById("score");
const hudHealth = document.getElementById("health");
const hudCredits = document.getElementById("credits");
const respawnButton = document.getElementById("respawn");
const startScreen = document.getElementById("start-screen");
const playButton = document.getElementById("play");

const GAME = {
  width: canvas.width,
  height: canvas.height,
  playerHealth: 1000,
  playerDamage: 25,
  enemyHealth: 100,
  enemyDamage: 50,
  bulletTravelSeconds: 2.5,
  enemyBurstInterval: 3,
  enemyBurstCount: 1,
  maxLevels: 3,
  bossHealth: 1500,
  shieldSpawnInterval: 9,
  shieldDuration: 5,
  medkitSpawnInterval: 15,
  medkitHealAmount: 150,
  powerSpawnInterval: 15,
  powerDuration: 5,
  bomberSpawnInterval: 20,
  bomberDamage: 150,
  bossLaserInterval: 2,
  bossLaserDamage: 50,
};

const bulletSpeedBase = GAME.height / GAME.bulletTravelSeconds;

const LEVELS = Array.from({ length: GAME.maxLevels }, (_, index) => {
  const level = index + 1;
  return {
    level,
    columns: 6 + level,
    rows: 2 + Math.floor(level / 2),
    enemySpeed: 30 + level * 10,
    bulletSpeed: bulletSpeedBase + level * 20,
    fireChance: 0.25 + level * 0.05,
    isBoss: level === GAME.maxLevels,
  };
});

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  fire: false,
};

const rand = (min, max) => Math.random() * (max - min) + min;

let audioContext = null;

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playSound({
  type = "square",
  frequency = 440,
  endFrequency = null,
  duration = 0.08,
  gain = 0.04,
}) {
  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const amp = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
  if (endFrequency) {
    osc.frequency.exponentialRampToValueAtTime(
      endFrequency,
      audioContext.currentTime + duration
    );
  }
  amp.gain.setValueAtTime(gain, audioContext.currentTime);
  amp.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + duration
  );
  osc.connect(amp);
  amp.connect(audioContext.destination);
  osc.start();
  osc.stop(audioContext.currentTime + duration);
}

class Bullet {
  constructor(x, y, vx, vy, owner) {
    this.x = x;
    this.y = y;
    this.radius = 4;
    this.vx = vx;
    this.vy = vy;
    this.owner = owner;
    this.active = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -20 || this.y > GAME.height + 20) {
      this.active = false;
    }
  }

  draw() {
    ctx.fillStyle = this.owner === "player" ? "#8ff7ff" : "#ff7a6a";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Player {
  constructor(dropIn = false) {
    this.width = 48;
    this.height = 18;
    this.x = GAME.width / 2 - this.width / 2;
    this.targetY = GAME.height - 60;
    this.y = dropIn ? -80 : this.targetY;
    this.speed = 280;
    this.cooldown = 0;
    this.burstShots = 0;
    this.burstCooldown = 0;
    this.health = GAME.playerHealth;
    this.invincibleTimer = 0;
    this.doubleDamageTimer = 0;
    this.dropIn = dropIn;
  }

  update(dt) {
    if (this.dropIn) {
      this.invincibleTimer = 0.2;
      this.y += this.speed * dt;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.dropIn = false;
        this.invincibleTimer = 0;
      }
      return;
    }
    if (input.left) this.x -= this.speed * dt;
    if (input.right) this.x += this.speed * dt;
    if (input.up) this.y -= this.speed * dt;
    if (input.down) this.y += this.speed * dt;
    this.x = Math.max(10, Math.min(GAME.width - this.width - 10, this.x));
    this.y = Math.max(40, Math.min(GAME.height - this.height - 20, this.y));

    this.cooldown -= dt;
    if (input.fire && this.cooldown <= 0 && this.burstShots === 0) {
      this.burstShots = 2;
      this.burstCooldown = 0;
      this.cooldown = 0.45;
    }

    if (this.burstShots > 0) {
      this.burstCooldown -= dt;
      if (this.burstCooldown <= 0) {
        bullets.push(
          new Bullet(
            this.x + this.width / 2,
            this.y - 10,
            0,
            -bulletSpeedBase * 1.25,
            "player"
          )
        );
        playSound({
          type: "square",
          frequency: 900,
          endFrequency: 420,
          duration: 0.07,
          gain: 0.05,
        });
        this.burstShots -= 1;
        this.burstCooldown = 0.12;
      }
    }

    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    }

    if (this.doubleDamageTimer > 0) {
      this.doubleDamageTimer = Math.max(0, this.doubleDamageTimer - dt);
    }
  }

  draw() {
    ctx.fillStyle = "#7dfc7d";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillRect(this.x + 8, this.y - 8, this.width - 16, 8);

    ctx.fillStyle = "#5fe15f";
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(this.x + 6 + i * 10, this.y + 4, 4, 4);
    }
    ctx.fillStyle = "#2a7a2a";
    ctx.fillRect(this.x + 4, this.y + this.height - 6, this.width - 8, 3);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(this.x + 10, this.y + 2, 3, 2);
    ctx.fillRect(this.x + this.width - 14, this.y + 2, 3, 2);
    ctx.fillStyle = "rgba(20, 60, 20, 0.6)";
    ctx.fillRect(this.x + 12, this.y + 9, 6, 2);
    ctx.fillRect(this.x + this.width - 18, this.y + 9, 6, 2);

    if (this.invincibleTimer > 0) {
      ctx.strokeStyle = "rgba(127, 234, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        this.x + this.width / 2,
        this.y + this.height / 2,
        this.width,
        this.height,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }
}

class Invader {
  constructor(x, y, levelConfig) {
    this.width = 36;
    this.height = 22;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.maxHealth = GAME.enemyHealth;
    this.health = GAME.enemyHealth;
    this.speed = levelConfig.enemySpeed;
    this.direction = 1;
    this.burstShots = 0;
    this.burstCooldown = 0;
    this.levelConfig = levelConfig;
    this.isBoss = levelConfig.isBoss;
    this.laserTimer = GAME.bossLaserInterval;
  }

  update(dt) {
    this.x += this.speed * this.direction * dt;
    if (this.x < 20 || this.x + this.width > GAME.width - 20) {
      this.direction *= -1;
      this.y += 16;
    }

    if (this.isBoss) {
      this.laserTimer -= dt;
      if (this.laserTimer <= 0) {
        this.laserTimer = GAME.bossLaserInterval;
        this.fireLaser();
      }
      return;
    }

    if (this.burstCooldown > 0) {
      this.burstCooldown -= dt;
      return;
    }

    if (Math.random() < this.levelConfig.fireChance * dt) {
      this.fireBurst();
    }
  }

  fireBurst() {
    this.burstShots = GAME.enemyBurstCount;
    this.burstCooldown = 0.3;
  }

  updateBurst(dt) {
    if (this.isBoss) return;
    if (this.burstShots <= 0) return;
    this.burstCooldown -= dt;
    if (this.burstCooldown <= 0) {
      const targetX = player.x + player.width / 2;
      const targetY = player.y + player.height / 2;
      const originX = this.x + this.width / 2;
      const originY = this.y + this.height + 6;
      const dx = targetX - originX;
      const dy = targetY - originY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const vx = (dx / distance) * this.levelConfig.bulletSpeed;
      const vy = (dy / distance) * this.levelConfig.bulletSpeed;
      bullets.push(
        new Bullet(
          originX,
          originY,
          vx,
          vy,
          "enemy"
        )
      );
      playSound({
        type: "triangle",
        frequency: 520,
        endFrequency: 240,
        duration: 0.06,
        gain: 0.04,
      });
      this.burstShots -= 1;
      this.burstCooldown = 0.22;
    }
  }

  fireLaser() {
    const targetX = player.x + player.width / 2 + rand(-90, 90);
    const clampedX = Math.max(10, Math.min(GAME.width - 10, targetX));
    bossLaser = {
      x: clampedX,
      y: this.y + this.height,
      width: 6,
      length: GAME.height - (this.y + this.height),
      time: 0.2,
    };
  }

  draw() {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillRect(this.x + 6, this.y + 4, this.width - 12, 6);
    ctx.fillRect(this.x + 10, this.y + 12, this.width - 20, 6);

    ctx.fillStyle = "#e6b84f";
    ctx.fillRect(this.x + 4, this.y + 3, 6, 4);
    ctx.fillRect(this.x + this.width - 10, this.y + 3, 6, 4);
    ctx.fillStyle = "#b6881f";
    ctx.fillRect(this.x + 6, this.y + this.height - 6, this.width - 12, 3);

    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.fillRect(this.x + 8, this.y + 8, 3, 3);
    ctx.fillRect(this.x + this.width - 12, this.y + 8, 3, 3);
    ctx.fillStyle = "rgba(120, 70, 10, 0.5)";
    ctx.fillRect(this.x + 12, this.y + this.height - 10, 6, 2);
    ctx.fillRect(this.x + this.width - 18, this.y + this.height - 10, 6, 2);

    if (this.isBoss) {
      ctx.fillStyle = "rgba(255, 80, 80, 0.6)";
      ctx.fillRect(this.x + this.width / 2 - 10, this.y + this.height - 6, 20, 4);
    }

    const barWidth = this.width;
    const barHeight = 4;
    const barX = this.x;
    const barY = this.y - 8;
    const healthRatio = Math.max(0, this.health) / this.maxHealth;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#ff4d4d";
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }
}

class Bomber {
  constructor() {
    this.width = 40;
    this.height = 26;
    this.x = rand(30, GAME.width - 70);
    this.y = -40;
    this.speed = 120;
    this.active = true;
  }

  update(dt) {
    const targetX = player.x + player.width / 2;
    const targetY = player.y + player.height / 2;
    const dx = targetX - (this.x + this.width / 2);
    const dy = targetY - (this.y + this.height / 2);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const vx = (dx / distance) * this.speed;
    const vy = (dy / distance) * this.speed;
    this.x += vx * dt;
    this.y += vy * dt;

    if (this.y > GAME.height + 60) {
      this.active = false;
    }
  }

  draw() {
    ctx.fillStyle = "#ff8f4d";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "#c9552a";
    ctx.fillRect(this.x + 6, this.y + 6, this.width - 12, 6);
    ctx.fillStyle = "#5a1c12";
    ctx.fillRect(this.x + 10, this.y + this.height - 6, this.width - 20, 3);
  }
}

class Star {
  constructor() {
    this.reset();
    this.y = rand(0, GAME.height);
  }

  reset() {
    this.x = rand(0, GAME.width);
    this.y = -10;
    this.radius = rand(0.6, 1.8);
    this.speed = rand(12, 40);
    this.alpha = rand(0.4, 1);
  }

  update(dt) {
    this.y += this.speed * dt;
    if (this.y > GAME.height + 10) {
      this.reset();
    }
  }

  draw() {
    ctx.fillStyle = `rgba(210, 235, 255, ${this.alpha})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

class RobotSilhouette {
  constructor() {
    this.width = rand(80, 140);
    this.height = rand(120, 200);
    this.x = rand(0, GAME.width - this.width);
    this.y = rand(80, GAME.height - this.height - 120);
    this.speedX = rand(-6, 6);
    this.speedY = rand(-4, 4);
    this.alpha = rand(0.15, 0.25);
  }

  update(dt) {
    this.x += this.speedX * dt;
    this.y += this.speedY * dt;

    if (this.x < -this.width) this.x = GAME.width + rand(20, 60);
    if (this.x > GAME.width + this.width) this.x = -this.width - rand(20, 60);
    if (this.y < -this.height) this.y = GAME.height + rand(20, 60);
    if (this.y > GAME.height + this.height) this.y = -this.height - rand(20, 60);
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = "#2a3648";
    ctx.fillRect(this.x + this.width * 0.35, this.y, this.width * 0.3, this.height * 0.15);
    ctx.fillRect(this.x + this.width * 0.2, this.y + this.height * 0.15, this.width * 0.6, this.height * 0.6);
    ctx.fillRect(this.x + this.width * 0.1, this.y + this.height * 0.3, this.width * 0.15, this.height * 0.3);
    ctx.fillRect(this.x + this.width * 0.75, this.y + this.height * 0.3, this.width * 0.15, this.height * 0.3);
    ctx.fillRect(this.x + this.width * 0.28, this.y + this.height * 0.75, this.width * 0.16, this.height * 0.22);
    ctx.fillRect(this.x + this.width * 0.56, this.y + this.height * 0.75, this.width * 0.16, this.height * 0.22);
    ctx.restore();
  }
}

let stars = Array.from({ length: 120 }, () => new Star());
let robots = Array.from({ length: 4 }, () => new RobotSilhouette());
let explosions = [];
let dropShip = null;
let bossLaser = null;

let player = new Player();
let bullets = [];
let invaders = [];
let bombers = [];
let shield = null;
let shieldSpawnTimer = GAME.shieldSpawnInterval;
let medkit = null;
let medkitSpawnTimer = GAME.medkitSpawnInterval;
let powerUp = null;
let powerSpawnTimer = GAME.powerSpawnInterval;
let bomberSpawnTimer = GAME.bomberSpawnInterval;
let score = 0;
let currentLevel = 1;
let levelConfig = LEVELS[0];
let gameOver = false;
let lastTime = 0;
let playerExplosionTriggered = false;
let gameOverTimer = 0;
let credits = 3;
let deathProcessed = false;
let gameStarted = false;

class Explosion {
  constructor(x, y, color = "#ffb347") {
    this.particles = Array.from({ length: 30 }, () => ({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-200, 80),
      size: rand(3, 6),
      life: rand(0.5, 0.9),
      maxLife: 0,
    }));
    this.color = color;
    this.particles.forEach((p) => {
      p.maxLife = p.life;
    });
  }

  update(dt) {
    this.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      p.life -= dt;
    });
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw() {
    this.particles.forEach((p) => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = `rgba(255, 180, 80, ${alpha})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
  }

  get active() {
    return this.particles.length > 0;
  }
}

class DropShip {
  constructor() {
    this.width = 180;
    this.height = 60;
    this.x = GAME.width / 2 - this.width / 2;
    this.y = -120;
    this.speed = 260;
  }

  update(dt, targetY) {
    this.y += this.speed * dt;
    if (this.y >= targetY) {
      this.y = targetY;
    }
  }

  draw() {
    ctx.fillStyle = "#3a4a66";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "#2b364c";
    ctx.fillRect(this.x + 12, this.y + 10, this.width - 24, this.height - 20);
    ctx.fillStyle = "#5f7aa8";
    ctx.fillRect(this.x + 20, this.y + 18, 24, 10);
    ctx.fillRect(this.x + this.width - 44, this.y + 18, 24, 10);
    ctx.fillStyle = "#1e2736";
    ctx.fillRect(this.x + 30, this.y + this.height - 12, this.width - 60, 6);
  }
}

function resetGame(consumeCredit = true, dropIn = false) {
  if (consumeCredit) {
    if (credits <= 0) return;
    credits -= 1;
  }
  player = new Player(dropIn);
  bullets = [];
  invaders = [];
  bombers = [];
  shield = null;
  shieldSpawnTimer = GAME.shieldSpawnInterval;
  medkit = null;
  medkitSpawnTimer = GAME.medkitSpawnInterval;
  powerUp = null;
  powerSpawnTimer = GAME.powerSpawnInterval;
  bomberSpawnTimer = GAME.bomberSpawnInterval;
  bossLaser = null;
  dropShip = dropIn ? new DropShip() : null;
  score = 0;
  currentLevel = 1;
  levelConfig = LEVELS[0];
  gameOver = false;
  playerExplosionTriggered = false;
  gameOverTimer = 0;
  deathProcessed = false;
  respawnButton.hidden = true;
  spawnLevel(1);
}

function spawnShield() {
  const offsetX = rand(-120, 120);
  const offsetY = rand(-120, -40);
  const x = Math.max(20, Math.min(GAME.width - 20, player.x + player.width / 2 + offsetX));
  const y = Math.max(40, Math.min(GAME.height - 120, player.y + offsetY));
  shield = {
    x,
    y,
    radius: 14,
    pulse: rand(0, Math.PI * 2),
  };
}

function spawnMedkit() {
  const offsetX = rand(-140, 140);
  const offsetY = rand(-140, -60);
  const x = Math.max(20, Math.min(GAME.width - 20, player.x + player.width / 2 + offsetX));
  const y = Math.max(60, Math.min(GAME.height - 140, player.y + offsetY));
  medkit = {
    x,
    y,
    size: 18,
    pulse: rand(0, Math.PI * 2),
  };
}

function spawnPowerUp() {
  const offsetX = rand(-160, 160);
  const offsetY = rand(-160, -70);
  const x = Math.max(20, Math.min(GAME.width - 20, player.x + player.width / 2 + offsetX));
  const y = Math.max(60, Math.min(GAME.height - 160, player.y + offsetY));
  powerUp = {
    x,
    y,
    size: 18,
    pulse: rand(0, Math.PI * 2),
  };
}

function spawnBomber() {
  bombers.push(new Bomber());
}

function spawnLevel(level) {
  invaders = [];
  currentLevel = level;
  levelConfig = LEVELS[level - 1];

  if (levelConfig.isBoss) {
    const boss = new Invader(
      GAME.width / 2 - 60,
      90,
      levelConfig
    );
    boss.width = 120;
    boss.height = 60;
    boss.maxHealth = GAME.bossHealth;
    boss.health = GAME.bossHealth;
    boss.speed = levelConfig.enemySpeed * 0.6;
    invaders.push(boss);
    return;
  }

  const startX = 120;
  const startY = 80;
  const gapX = 60;
  const gapY = 50;

  for (let row = 0; row < levelConfig.rows; row += 1) {
    for (let col = 0; col < levelConfig.columns; col += 1) {
      invaders.push(
        new Invader(
          startX + col * gapX,
          startY + row * gapY,
          levelConfig
        )
      );
    }
  }
}

function advanceLevel() {
  bullets = [];
  bombers = [];
  shield = null;
  medkit = null;
  powerUp = null;
  shieldSpawnTimer = GAME.shieldSpawnInterval;
  medkitSpawnTimer = GAME.medkitSpawnInterval;
  powerSpawnTimer = GAME.powerSpawnInterval;
  bomberSpawnTimer = GAME.bomberSpawnInterval;
  if (currentLevel < GAME.maxLevels) {
    spawnLevel(currentLevel + 1);
  } else {
    gameOver = true;
    gameOverTimer = 3;
    respawnButton.hidden = true;
  }
}

function checkCollision(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function update(dt) {
  stars.forEach((star) => star.update(dt));
  robots.forEach((robot) => robot.update(dt));
  explosions.forEach((explosion) => explosion.update(dt));
  explosions = explosions.filter((explosion) => explosion.active);

  if (!gameStarted) return;

  if (gameOver) {
    if (gameOverTimer > 0) {
      gameOverTimer -= dt;
      if (gameOverTimer <= 0) {
        gameOverTimer = 0;
        respawnButton.hidden = credits <= 0;
      }
    }
    return;
  }

  player.update(dt);

  if (dropShip) {
    dropShip.update(dt, player.y - 50);
    if (!player.dropIn) {
      dropShip = null;
    }
  }

  shieldSpawnTimer -= dt;
  if (shieldSpawnTimer <= 0) {
    spawnShield();
    shieldSpawnTimer = GAME.shieldSpawnInterval;
  }

  medkitSpawnTimer -= dt;
  if (medkitSpawnTimer <= 0) {
    spawnMedkit();
    medkitSpawnTimer = GAME.medkitSpawnInterval;
  }

  powerSpawnTimer -= dt;
  if (powerSpawnTimer <= 0) {
    spawnPowerUp();
    powerSpawnTimer = GAME.powerSpawnInterval;
  }

  bomberSpawnTimer -= dt;
  if (bomberSpawnTimer <= 0) {
    spawnBomber();
    bomberSpawnTimer = GAME.bomberSpawnInterval;
  }

  if (shield) {
    shield.pulse += dt * 4;

      if (medkit) {
        medkit.pulse += dt * 4;
        const closestX = Math.max(player.x, Math.min(medkit.x, player.x + player.width));
        const closestY = Math.max(player.y, Math.min(medkit.y, player.y + player.height));
        const dx = medkit.x - closestX;
        const dy = medkit.y - closestY;
        if (dx * dx + dy * dy <= (medkit.size / 2) * (medkit.size / 2)) {
          player.health = Math.min(GAME.playerHealth, player.health + GAME.medkitHealAmount);
          medkit = null;
        }
      }
    const closestX = Math.max(player.x, Math.min(shield.x, player.x + player.width));
    const closestY = Math.max(player.y, Math.min(shield.y, player.y + player.height));
    const dx = shield.x - closestX;
    const dy = shield.y - closestY;
    if (dx * dx + dy * dy <= shield.radius * shield.radius) {
      player.invincibleTimer = GAME.shieldDuration;
      shield = null;
    }
  }

  if (powerUp) {
    powerUp.pulse += dt * 4;
    const closestX = Math.max(player.x, Math.min(powerUp.x, player.x + player.width));
    const closestY = Math.max(player.y, Math.min(powerUp.y, player.y + player.height));
    const dx = powerUp.x - closestX;
    const dy = powerUp.y - closestY;
    if (dx * dx + dy * dy <= (powerUp.size / 2) * (powerUp.size / 2)) {
      player.doubleDamageTimer = GAME.powerDuration;
      powerUp = null;
    }
  }

  invaders.forEach((invader) => {
    invader.update(dt);
    invader.updateBurst(dt);
  });

  bombers.forEach((bomber) => bomber.update(dt));
  bombers = bombers.filter((bomber) => bomber.active);

  bullets.forEach((bullet) => bullet.update(dt));
  bullets = bullets.filter((bullet) => bullet.active);

  bullets.forEach((bullet) => {
    const playerDamage = player.doubleDamageTimer > 0
      ? GAME.playerDamage * 2
      : GAME.playerDamage;
    if (bullet.owner === "player") {
      invaders.forEach((invader) => {
        if (invader.health > 0 &&
          bullet.active &&
          bullet.x > invader.x &&
          bullet.x < invader.x + invader.width &&
          bullet.y > invader.y &&
          bullet.y < invader.y + invader.height
        ) {
          invader.health -= playerDamage;
          bullet.active = false;
          if (invader.health <= 0) {
            score += 100;
          }
        }
      });

      bombers.forEach((bomber) => {
        if (
          bullet.active &&
          bullet.x > bomber.x &&
          bullet.x < bomber.x + bomber.width &&
          bullet.y > bomber.y &&
          bullet.y < bomber.y + bomber.height
        ) {
          bomber.active = false;
          bullet.active = false;
          explosions.push(
            new Explosion(
              bomber.x + bomber.width / 2,
              bomber.y + bomber.height / 2
            )
          );
          score += 150;
        }
      });
    } else if (
      bullet.owner === "enemy" &&
      bullet.x > player.x &&
      bullet.x < player.x + player.width &&
      bullet.y > player.y &&
      bullet.y < player.y + player.height
    ) {
      if (player.invincibleTimer <= 0) {
        player.health -= GAME.enemyDamage;
        playSound({ type: "sawtooth", frequency: 160, duration: 0.12, gain: 0.06 });
      }
      bullet.active = false;
    }
  });

  if (bossLaser) {
    bossLaser.time -= dt;
    if (bossLaser.time <= 0) {
      bossLaser = null;
    } else if (player.invincibleTimer <= 0) {
      const laserHalf = bossLaser.width / 2;
      const hitX = player.x + player.width >= bossLaser.x - laserHalf &&
        player.x <= bossLaser.x + laserHalf;
      const hitY = player.y <= bossLaser.y + bossLaser.length &&
        player.y + player.height >= bossLaser.y;
      if (hitX && hitY) {
        player.health -= GAME.bossLaserDamage;
        playSound({ type: "sawtooth", frequency: 200, duration: 0.08, gain: 0.05 });
      }
    }
  }

  const aliveInvaders = invaders.filter(
    (invader) => invader && invader.health > 0 && Number.isFinite(invader.health)
  );
  invaders = aliveInvaders;

  invaders.forEach((invader) => {
    if (checkCollision(invader, player)) {
      if (player.invincibleTimer <= 0) {
        player.health -= GAME.enemyDamage;
        playSound({ type: "sawtooth", frequency: 160, duration: 0.12, gain: 0.06 });
      }
    }
  });

  bombers.forEach((bomber) => {
    if (checkCollision(bomber, player)) {
      if (player.invincibleTimer <= 0) {
        player.health -= GAME.bomberDamage;
        playSound({ type: "sawtooth", frequency: 120, duration: 0.18, gain: 0.08 });
      }
      bomber.active = false;
      explosions.push(
        new Explosion(
          bomber.x + bomber.width / 2,
          bomber.y + bomber.height / 2
        )
      );
    }
  });

  if (player.health <= 0) {
    player.health = 0;
    gameOver = true;
    gameOverTimer = 3;
    respawnButton.hidden = true;
    if (!deathProcessed) {
      credits = Math.max(0, credits - 1);
      deathProcessed = true;
    }
    if (!playerExplosionTriggered) {
      explosions.push(
        new Explosion(
          player.x + player.width / 2,
          player.y + player.height / 2
        )
      );
      playerExplosionTriggered = true;
    }
  }

  if (aliveInvaders.length === 0 && !gameOver) {
    credits += 1;
    advanceLevel();
  }

  hudHealth.textContent = `Health: ${Math.round(player.health)}`;
  hudScore.textContent = `Score: ${score}`;
  hudLevel.textContent = `Level: ${currentLevel}`;
  hudCredits.textContent = `Credits: ${credits}`;
}

function drawBackground() {
  ctx.fillStyle = "#02040a";
  ctx.fillRect(0, 0, GAME.width, GAME.height);
  stars.forEach((star) => star.draw());
  robots.forEach((robot) => robot.draw());
}

function draw() {
  drawBackground();
  if (dropShip) {
    dropShip.draw();
  }
  if (!playerExplosionTriggered) {
    player.draw();
  }
  invaders.forEach((invader) => invader.draw());
  bombers.forEach((bomber) => bomber.draw());
  bullets.forEach((bullet) => bullet.draw());
  explosions.forEach((explosion) => explosion.draw());
  if (bossLaser) {
    ctx.fillStyle = "rgba(255, 80, 80, 0.8)";
    ctx.fillRect(
      bossLaser.x - bossLaser.width / 2,
      bossLaser.y,
      bossLaser.width,
      bossLaser.length
    );
  }
  if (powerUp) {
    const glow = 0.5 + Math.sin(powerUp.pulse) * 0.3;
    ctx.fillStyle = `rgba(120, 180, 255, ${glow})`;
    ctx.fillRect(powerUp.x - powerUp.size / 2, powerUp.y - powerUp.size / 2, powerUp.size, powerUp.size);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(powerUp.x - 1, powerUp.y - powerUp.size / 2 + 3, 2, powerUp.size - 6);
    ctx.fillRect(powerUp.x - powerUp.size / 2 + 3, powerUp.y - 1, powerUp.size - 6, 2);
  }
  if (medkit) {
    const glow = 0.5 + Math.sin(medkit.pulse) * 0.3;
    ctx.fillStyle = `rgba(255, 120, 120, ${glow})`;
    ctx.fillRect(medkit.x - medkit.size / 2, medkit.y - medkit.size / 2, medkit.size, medkit.size);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(medkit.x - 2, medkit.y - medkit.size / 2 + 4, 4, medkit.size - 8);
    ctx.fillRect(medkit.x - medkit.size / 2 + 4, medkit.y - 2, medkit.size - 8, 4);
  }
  if (shield) {
    const glow = 0.5 + Math.sin(shield.pulse) * 0.3;
    ctx.fillStyle = `rgba(127, 234, 255, ${glow})`;
    ctx.beginPath();
    ctx.arc(shield.x, shield.y, shield.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(210, 255, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(shield.x, shield.y, shield.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (gameOver && gameOverTimer <= 0) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, GAME.width, GAME.height);
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "28px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(
      currentLevel === GAME.maxLevels && invaders.length === 0
        ? "YOU WIN"
        : "GAME OVER",
      GAME.width / 2,
      GAME.height / 2 - 10
    );
    ctx.font = "16px 'Courier New', monospace";
    if (credits <= 0) {
      ctx.fillText("OUT OF CREDITS", GAME.width / 2, GAME.height / 2 + 20);
    } else {
      ctx.fillText("Press Respawn to play", GAME.width / 2, GAME.height / 2 + 20);
    }
    ctx.font = "14px 'Courier New', monospace";
    ctx.fillText("Arrow keys to move", GAME.width / 2, GAME.height / 2 + 48);
    ctx.fillText("Space to shoot", GAME.width / 2, GAME.height / 2 + 68);
  }
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  ensureAudio();
  if (event.code === "ArrowLeft") input.left = true;
  if (event.code === "ArrowRight") input.right = true;
  if (event.code === "ArrowUp") input.up = true;
  if (event.code === "ArrowDown") input.down = true;
  if (event.code === "Space") input.fire = true;
});

window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft") input.left = false;
  if (event.code === "ArrowRight") input.right = false;
  if (event.code === "ArrowUp") input.up = false;
  if (event.code === "ArrowDown") input.down = false;
  if (event.code === "Space") input.fire = false;
});

resetGame(false, false);
requestAnimationFrame(loop);

respawnButton.addEventListener("click", () => {
  resetGame(true, false);
});

playButton.addEventListener("click", () => {
  ensureAudio();
  if (credits <= 0) return;
  gameStarted = true;
  startScreen.classList.add("hidden");
  resetGame(true, true);
});
