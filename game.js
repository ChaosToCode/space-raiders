const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const hudLevel = document.getElementById("level");
const hudScore = document.getElementById("score");
const hudHealth = document.getElementById("health");
const hudCredits = document.getElementById("credits");
const respawnButton = document.getElementById("respawn");
const startScreen = document.getElementById("start-screen");
const playButton = document.getElementById("play");
const shopOverlay = document.getElementById("shop");
const shopCredits = document.getElementById("shop-credits");
const shopItemsContainer = document.getElementById("shop-items");
const shopSkipButton = document.getElementById("shop-skip");
const btnLeft = document.getElementById("btn-left");
const btnRight = document.getElementById("btn-right");
const btnUp = document.getElementById("btn-up");
const btnDown = document.getElementById("btn-down");
const btnFire = document.getElementById("btn-fire");

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
  maxLevels: 500,
  bossHealth: 1500,
  shieldSpawnInterval: 9,
  shieldDuration: 5,
  medkitSpawnInterval: 15,
  medkitHealAmount: 150,
  powerSpawnInterval: 15,
  powerDuration: 8,
  bomberSpawnInterval: 20,
  bomberDamage: 150,
  bossLaserInterval: 2,
  bossLaserDamage: 50,
  leaderBombDamage: 75,
};

const PALETTE = {
  bg: "#000",
  player: "#9efc9e",
  playerDark: "#4bbf6a",
  enemy: "#f5f7ff",
  enemyDark: "#c9d2e5",
  boss: "#ff9aa2",
  bossDark: "#d45b66",
  bulletPlayer: "#9efc9e",
  bulletEnemy: "#f5f7ff",
  explosion: "#ffb347",
  power: "#78b4ff",
  medkit: "#ff6a6a",
  shield: "#7feaff",
};

const COMMAND_PALETTE = {
  main: "#ff6a6a",
  dark: "#8b2e2e",
};
const SHIELDER_PALETTE = {
  main: "#78b4ff",
  dark: "#3a6aa8",
};
const HEALER_PALETTE = {
  main: "#b8ffb0",
  dark: "#5aa85c",
};
const MINIBOSS_PALETTE = {
  main: "#ff9a4d",
  dark: "#b2581f",
};

function randomEnemyPalette() {
  const hue = Math.floor(rand(0, 360));
  const main = `hsl(${hue}, 80%, 70%)`;
  const dark = `hsl(${hue}, 70%, 45%)`;
  return { main, dark };
}

const bulletSpeedBase = GAME.height / GAME.bulletTravelSeconds;

const LEVELS = Array.from({ length: GAME.maxLevels }, (_, index) => {
  const level = index + 1;
  const cappedSpeedLevel = Math.min(level, 50);
  const extraLevels = Math.max(0, level - 50);
  const healthMultiplier = 1 + extraLevels * 0.02;
  const damageMultiplier = 1 + extraLevels * 0.01;
  return {
    level,
    columns: 7,
    rows: 2,
    enemySpeed: 18 + cappedSpeedLevel * 6,
    bulletSpeed: bulletSpeedBase + cappedSpeedLevel * 20,
    fireChance: 0.25 + cappedSpeedLevel * 0.05,
    healthMultiplier,
    damageMultiplier,
    isBoss: false,
  };
});

const PLAYER_BASE = {
  damage: GAME.playerDamage,
  cooldown: 0.16,
  burstCount: 1,
  burstDelay: 0.12,
  shotSpeed: bulletSpeedBase * 1.25,
  spreadAngle: 0.2,
};

const input = {
  left: false,
  right: false,
  up: false,
  down: false,
  fire: false,
};

const CHEAT_CODE = "CHEAT";
const CHEAT_LEVEL_DELAY = 700;
let cheatBuffer = "";
let cheatInfiniteFire = false;
let cheatAwaitLevel = false;
let cheatLevelBuffer = "";
let cheatLevelTimer = null;

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

function resetCheatLevelCapture() {
  cheatAwaitLevel = false;
  cheatLevelBuffer = "";
  if (cheatLevelTimer) {
    clearTimeout(cheatLevelTimer);
    cheatLevelTimer = null;
  }
}

function scheduleCheatLevelJump() {
  if (!cheatLevelBuffer) return;
  if (cheatLevelTimer) {
    clearTimeout(cheatLevelTimer);
  }
  cheatLevelTimer = setTimeout(() => {
    const parsedLevel = Number.parseInt(cheatLevelBuffer, 10);
    jumpToLevel(parsedLevel);
    resetCheatLevelCapture();
  }, CHEAT_LEVEL_DELAY);
}

class Bullet {
  constructor(x, y, vx, vy, owner, pierce = 0) {
    this.x = x;
    this.y = y;
    this.radius = 4;
    this.vx = vx;
    this.vy = vy;
    this.owner = owner;
    this.pierce = pierce;
    this.active = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (
      this.y < -20 ||
      this.y > GAME.height + 20 ||
      this.x < -20 ||
      this.x > GAME.width + 20
    ) {
      this.active = false;
    }
  }

  draw() {
    const color = this.owner === "player" ? PALETTE.bulletPlayer : PALETTE.bulletEnemy;
    const width = Math.max(2, Math.round(this.radius / 2));
    const height = Math.max(10, width * 6);
    ctx.fillStyle = color;
    ctx.fillRect(
      Math.round(this.x - width / 2),
      Math.round(this.y - height / 2),
      width,
      height
    );
  }
}

function spawnPlayerShot(x, y) {
  const speed = getPlayerShotSpeed();
  const angles = [0];
  if (getPlayerSpread()) {
    angles.push(-PLAYER_BASE.spreadAngle, PLAYER_BASE.spreadAngle);
  }
  angles.forEach((angle) => {
    const vx = Math.sin(angle) * speed;
    const vy = -Math.cos(angle) * speed;
    bullets.push(new Bullet(x, y, vx, vy, "player", getPlayerPierce()));
  });
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
    const minPlayerY = GAME.height / 2;
    this.y = Math.max(minPlayerY, Math.min(GAME.height - this.height - 20, this.y));

    this.cooldown -= dt;
    if (input.fire && this.cooldown <= 0 && this.burstShots === 0) {
      this.burstShots = getPlayerBurstCount();
      this.burstCooldown = 0;
      this.cooldown = getPlayerCooldown();
    }

    if (this.burstShots > 0) {
      this.burstCooldown -= dt;
      if (this.burstCooldown <= 0) {
        spawnPlayerShot(this.x + this.width / 2, this.y - 10);
        playSound({
          type: "square",
          frequency: 140,
          endFrequency: 50,
          duration: 0.16,
          gain: 0.12,
        });
        this.burstShots -= 1;
        this.burstCooldown = PLAYER_BASE.burstDelay;
      }
    }

    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    }

    if (this.doubleDamageTimer > 0) {
      this.doubleDamageTimer = Math.max(0, this.doubleDamageTimer - dt);
    }

    const maxHealth = getPlayerMaxHealth();
    if (this.health > maxHealth) {
      this.health = maxHealth;
    }
  }

  draw() {
    const color = PALETTE.player;
    const dark = PALETTE.playerDark;
    const x = this.x;
    const y = this.y;
    const u = this.width / 8;
    const v = this.height / 6;

    // Space-invader inspired block ship (player is blue)
    ctx.fillStyle = color;
    ctx.fillRect(x + u * 2, y + 0, u * 4, v * 2);
    ctx.fillRect(x + u * 1, y + v * 2, u * 6, v * 2);
    ctx.fillRect(x + 0, y + v * 3, u * 2, v * 2);
    ctx.fillRect(x + u * 6, y + v * 3, u * 2, v * 2);
    ctx.fillRect(x + u * 2, y + v * 4, u * 4, v * 2);

    // Cockpit pixels
    ctx.fillStyle = dark;
    ctx.fillRect(x + u * 3, y + v * 1, u, v);
    ctx.fillRect(x + u * 4, y + v * 1, u, v);

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
    const healthMultiplier = levelConfig.healthMultiplier ?? 1;
    this.maxHealth = GAME.enemyHealth * healthMultiplier;
    this.baseMaxHealth = this.maxHealth;
    this.health = this.maxHealth;
    this.burstShots = 0;
    this.burstCooldown = 0;
    this.levelConfig = levelConfig;
    this.isBoss = levelConfig.isBoss;
    this.laserTimer = GAME.bossLaserInterval;
    this.jitterX = 0;
    this.jitterTimer = rand(0.2, 0.35);
    this.twitchDir = -1;
    this.palette = randomEnemyPalette();
    this.group = 0;
    this.isCommand = false;
    this.isShielder = false;
    this.buffActive = false;
    this.isHealer = false;
    this.healCooldown = rand(1.2, 2.0);
    this.stunTimer = 0;
    this.isMiniBoss = false;
    this.mode = "formation";
    this.vx = 0;
    this.vy = 0;
  }

  update(dt) {
    this.jitterTimer -= dt;
    if (this.jitterTimer <= 0) {
      this.jitterTimer = rand(0.2, 0.35);
      this.twitchDir = Math.random() < 0.5 ? -1 : 1;
      this.jitterX = Math.round((this.width * 0.12) * this.twitchDir);
    }

    if (this.mode === "flyer") {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x <= 10 || this.x + this.width >= GAME.width - 10) {
        this.vx *= -1;
        this.x = Math.max(10, Math.min(GAME.width - 10 - this.width, this.x));
      }
      if (this.y <= 20 || this.y + this.height >= GAME.height - 20) {
        this.vy *= -1;
        this.y = Math.max(20, Math.min(GAME.height - 20 - this.height, this.y));
      }
    }

    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
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

    let fireChance = this.levelConfig.fireChance;
    if (minibossInvader && minibossInvader.health > 0 && !this.isMiniBoss) {
      fireChance *= 1.25;
    }
    if (commandInvader && commandInvader.health > 0 && !this.isCommand) {
      const dx = (commandInvader.x + commandInvader.width / 2) - (this.x + this.width / 2);
      const dy = (commandInvader.y + commandInvader.height / 2) - (this.y + this.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance <= 140) {
        fireChance *= 1.6;
      }
    }
    if (Math.random() < fireChance * dt) {
      this.fireBurst();
    }

    if (this.isCommand && Math.random() < 0.25 * dt) {
      leaderBombs.push(new LeaderBomb(this.x + this.width / 2, this.y + this.height));
    }

    if (this.isHealer) {
      this.healCooldown -= dt;
      if (this.healCooldown <= 0) {
        this.healCooldown = rand(1.4, 2.2);
        const candidates = invaders.filter(
          (invader) =>
            invader !== this &&
            !invader.isBoss &&
            invader.health > 0 &&
            invader.health < invader.maxHealth * 0.5
        );
        candidates.sort((a, b) => {
          const ax = a.x + a.width / 2;
          const ay = a.y + a.height / 2;
          const bx = b.x + b.width / 2;
          const by = b.y + b.height / 2;
          const sx = this.x + this.width / 2;
          const sy = this.y + this.height / 2;
          return Math.hypot(ax - sx, ay - sy) - Math.hypot(bx - sx, by - sy);
        });
        candidates.slice(0, 8).forEach((invader) => {
          invader.health = Math.min(invader.maxHealth, invader.health + invader.maxHealth * 0.25);
        });
      }
    }
  }

  fireBurst() {
    this.burstShots = GAME.enemyBurstCount;
    this.burstCooldown = 0.5;
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
      const bullet = new Bullet(
        originX,
        originY,
        vx,
        vy,
        "enemy"
      );
      if (this.isCommand) {
        bullet.radius = 7;
      }
      bullets.push(bullet);
      playSound({
        type: "square",
        frequency: 160,
        endFrequency: 70,
        duration: 0.12,
        gain: 0.08,
      });
      this.burstShots -= 1;
      this.burstCooldown = 0.35;
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
    const palette = this.isMiniBoss
      ? MINIBOSS_PALETTE
      : (this.isShielder
      ? SHIELDER_PALETTE
      : (this.isHealer ? HEALER_PALETTE : (this.isCommand ? COMMAND_PALETTE : this.palette)));
    const color = palette.main;
    const dark = palette.dark;
    const jitterScale = this.isBoss ? 0.5 : 1;
    const jitterX = Math.round(this.jitterX * jitterScale);
    const x = Math.round(this.x + jitterX);
    const y = Math.round(this.y);
    const bodyScale = this.isCommand ? 1.25 : 1;
    const drawW = Math.round(this.width * bodyScale);
    const drawH = Math.round(this.height * bodyScale);
    const drawX = x - Math.round((drawW - this.width) / 2);
    const drawY = y - Math.round((drawH - this.height) / 2);
    const u = drawW / 8;
    const v = drawH / 6;
    const legPhase = Math.floor(performance.now() / 160) % 2;
    const legSwing = invaderDirection * (legPhase === 0 ? -2 : 2);

    // Classic invader-style blocks
    ctx.fillStyle = color;
    ctx.fillRect(drawX + u * 1, drawY + 0, u * 6, v * 1);
    ctx.fillRect(drawX + 0, drawY + v * 1, u * 2, v * 2);
    ctx.fillRect(drawX + u * 2, drawY + v * 1, u * 4, v * 2);
    ctx.fillRect(drawX + u * 6, drawY + v * 1, u * 2, v * 2);
    ctx.fillRect(drawX + u * 1, drawY + v * 3, u * 6, v * 1);
    ctx.fillRect(drawX + u * 2 + legSwing, drawY + v * 4, u * 1, v * 2);
    ctx.fillRect(drawX + u * 5 + legSwing, drawY + v * 4, u * 1, v * 2);

    // Eyes
    ctx.fillStyle = dark;
    ctx.fillRect(drawX + u * 2, drawY + v * 2, u, v);
    ctx.fillRect(drawX + u * 5, drawY + v * 2, u, v);

    if (this.isShielder) {
      ctx.fillStyle = SHIELDER_PALETTE.dark;
      ctx.fillRect(drawX + u * 3, drawY + v * 0, u * 2, v * 1);
      ctx.strokeStyle = "rgba(120, 180, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(
        x + this.width / 2,
        y + this.height / 2,
        this.width * 0.7,
        this.height * 0.7,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }

    if (this.isHealer) {
      ctx.fillStyle = HEALER_PALETTE.dark;
      ctx.fillRect(drawX + u * 3, drawY + v * 0, u * 2, v * 1);
      ctx.fillRect(drawX + u * 3, drawY + v * 2, u * 2, v * 2);
    }

    if (this.isMiniBoss) {
      ctx.fillStyle = MINIBOSS_PALETTE.dark;
      ctx.fillRect(drawX + u * 2, drawY + v * 0, u * 4, v * 1);
      ctx.fillRect(drawX + u * 2, drawY + v * 5, u * 4, v * 1);
    }


    if (this.isBoss) {
      ctx.strokeStyle = "rgba(255, 120, 120, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + u * 1, y + v * 0.6, u * 6, v * 4.2);
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
    this.palette = randomEnemyPalette();
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
    ctx.fillStyle = this.palette.main;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = this.palette.dark;
    ctx.fillRect(this.x + 6, this.y + 6, this.width - 12, 6);
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
    ctx.fillRect(Math.round(this.x), Math.round(this.y), 2, 2);
  }
}

class StarDust {
  constructor() {
    this.reset();
    this.y = rand(0, GAME.height);
  }

  reset() {
    this.x = rand(0, GAME.width);
    this.y = -10;
    this.size = rand(1, 2);
    this.speed = rand(6, 14);
    this.alpha = rand(0.15, 0.35);
  }

  update(dt) {
    this.y += this.speed * dt;
    if (this.y > GAME.height + 10) {
      this.reset();
    }
  }

  draw() {
    ctx.fillStyle = `rgba(140, 180, 220, ${this.alpha})`;
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.size, this.size);
  }
}

class MiniPlanet {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    this.radius = rand(6, 16);
    this.x = rand(this.radius, GAME.width - this.radius);
    this.y = initial ? rand(30, GAME.height - 120) : -this.radius - rand(20, 80);
    this.speed = rand(3, 8);
    this.hue = rand(0, 360);
    this.sat = rand(35, 65);
    this.light = rand(50, 70);
    this.alpha = 0.75;
  }

  update(dt) {
    this.y += this.speed * dt;
    if (this.y > GAME.height + this.radius + 60) {
      this.reset(false);
    }
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = `hsl(${this.hue}, ${this.sat}%, ${this.light}%)`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
class ShootingStar {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    this.x = rand(0, GAME.width);
    this.y = initial ? rand(0, GAME.height * 0.5) : -20;
    this.vx = rand(-180, -120);
    this.vy = rand(180, 240);
    this.life = rand(0.4, 0.7);
    this.active = false;
  }

  spawn() {
    this.x = rand(GAME.width * 0.3, GAME.width);
    this.y = rand(0, GAME.height * 0.4);
    this.vx = rand(-220, -140);
    this.vy = rand(180, 260);
    this.life = rand(0.4, 0.7);
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.x < -40 || this.y > GAME.height + 40) {
      this.active = false;
    }
  }

  draw() {
    if (!this.active) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.fillStyle = "rgba(220, 240, 255, 0.9)";
    ctx.fillRect(x, y, 2, 2);
    ctx.fillStyle = "rgba(220, 240, 255, 0.45)";
    ctx.fillRect(x + 2, y - 2, 6, 1);
    ctx.fillRect(x + 2, y - 1, 4, 1);
  }
}

class Planet {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    this.radius = rand(20, 60);
    this.x = rand(this.radius, GAME.width - this.radius);
    this.y = initial ? rand(40, GAME.height - 160) : -this.radius - rand(20, 80);
    this.speed = rand(4, 12);
    this.hue = rand(180, 320);
    this.alpha = rand(0.75, 0.95);
    this.ring = Math.random() < 0.35;
  }

  update(dt) {
    this.y += this.speed * dt;
    if (this.y > GAME.height + this.radius + 80) {
      this.reset(false);
    }
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    const gradient = ctx.createRadialGradient(
      this.x - this.radius * 0.3,
      this.y - this.radius * 0.3,
      this.radius * 0.2,
      this.x,
      this.y,
      this.radius
    );
    gradient.addColorStop(0, `hsl(${this.hue}, 45%, 65%)`);
    gradient.addColorStop(0.7, `hsl(${this.hue}, 35%, 48%)`);
    gradient.addColorStop(1, `hsl(${this.hue}, 30%, 35%)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, 0.12)`;
    ctx.beginPath();
    ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    if (this.ring) {
      ctx.strokeStyle = `rgba(180, 220, 255, 0.35)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.radius * 1.4, this.radius * 0.5, -0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

class DriftShip {
  constructor() {
    this.reset(true);
  }

  reset(initial = false) {
    this.width = rand(18, 36);
    this.height = rand(10, 18);
    this.x = rand(-40, GAME.width + 40);
    this.y = initial ? rand(40, GAME.height - 80) : -this.height - rand(20, 80);
    this.speed = rand(8, 18);
    this.alpha = rand(0.15, 0.3);
  }

  update(dt) {
    this.y += this.speed * dt;
    if (this.y > GAME.height + 60) {
      this.reset(false);
    }
  }

  draw() {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = "#f5f7ff";
    ctx.fillRect(x + 2, y + 2, this.width - 4, this.height - 4);
    ctx.fillRect(x, y + this.height - 4, this.width, 3);
    ctx.fillStyle = "#c9d2e5";
    ctx.fillRect(x + this.width * 0.35, y, this.width * 0.3, 2);
    ctx.restore();
  }
}

let stars = Array.from({ length: 120 }, () => new Star());
let starDust = Array.from({ length: 180 }, () => new StarDust());
let planets = Array.from({ length: 6 }, () => new MiniPlanet());
let driftShips = Array.from({ length: 6 }, () => new DriftShip());
let shootingStars = Array.from({ length: 3 }, () => new ShootingStar());
let explosions = [];
let dropShip = null;
let bossLaser = null;
let helperDrone = null;

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
let shopOpen = false;
let pendingLevelAdvance = false;
let currentShopItems = [];
let playerUpgrades = {
  rapid: 0,
  damage: 0,
  burst: 0,
  spread: 0,
  pierce: 0,
  drone: 0,
  overclock: 0,
  pierceMk2: 0,
  shieldBattery: 0,
  medInjector: 0,
  shockRounds: 0,
  creditMagnet: 0,
  armorPlating: 0,
  healthBoost: 0,
  heavyBolts: 0,
  twinDrive: 0,
  droneBoost: 0,
};
let commandInvader = null;
let leaderBombs = [];
let shielderInvader = null;
let healerInvader = null;
let minibossInvader = null;
let musicTimer = 0;
let musicIndex = 0;
let musicTempo = 110;
let invaderDirection = 1;
let flyerTimer = 17;

const MUSIC_PATTERN = [
  330, 0, 392, 0, 440, 0, 392, 0,
  330, 0, 392, 0, 494, 0, 440, 0,
  262, 0, 330, 0, 392, 0, 330, 0,
  294, 0, 349, 0, 392, 0, 330, 0,
];

const getPlayerMaxHealth = () => {
  const baseHealth = GAME.playerHealth + playerUpgrades.healthBoost * 150;
  const scaled = baseHealth * (1 - playerUpgrades.overclock * 0.1);
  return Math.max(200, scaled);
};
const getPlayerDamage = () => {
  let damage = PLAYER_BASE.damage + playerUpgrades.damage * 8;
  if (playerUpgrades.heavyBolts) damage *= 1.35;
  if (playerUpgrades.pierceMk2) damage *= 0.8;
  return damage;
};
const getPlayerCooldown = () => {
  if (cheatInfiniteFire) return 0;
  let cooldown = PLAYER_BASE.cooldown * (1 - playerUpgrades.rapid * 0.12);
  if (playerUpgrades.overclock) cooldown *= 0.85;
  if (playerUpgrades.twinDrive) cooldown *= 1.2;
  return Math.max(0.1, cooldown);
};
const getPlayerBurstCount = () =>
  PLAYER_BASE.burstCount + playerUpgrades.burst + (playerUpgrades.twinDrive ? 1 : 0);
const getPlayerPierce = () => playerUpgrades.pierce + (playerUpgrades.pierceMk2 ? 2 : 0);
const getPlayerSpread = () => playerUpgrades.spread > 0;
const getPlayerShotSpeed = () =>
  PLAYER_BASE.shotSpeed * (playerUpgrades.heavyBolts ? 0.85 : 1);
const getShieldDuration = () =>
  GAME.shieldDuration + (playerUpgrades.shieldBattery ? 3 : 0);
const getMedkitHeal = () =>
  GAME.medkitHealAmount * (playerUpgrades.medInjector ? 1.4 : 1);
const getDamageTaken = (amount) =>
  amount * Math.max(0.5, 1 - playerUpgrades.armorPlating * 0.1);
const getEnemyHealthMultiplier = () =>
  (levelConfig && levelConfig.healthMultiplier) ? levelConfig.healthMultiplier : 1;
const getEnemyDamageMultiplier = () =>
  (levelConfig && levelConfig.damageMultiplier) ? levelConfig.damageMultiplier : 1;
const getEnemyDamage = (amount) => amount * getEnemyDamageMultiplier();
const getDroneFireInterval = () =>
  0.5 * (playerUpgrades.droneBoost ? 0.7 : 1);

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
      ctx.fillStyle = `rgba(255, 179, 71, ${alpha})`;
      const size = Math.max(2, Math.round(p.size));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size);
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

class HelperDrone {
  constructor() {
    this.orbitRadius = 32;
    this.angle = 0;
    this.fireTimer = getDroneFireInterval();
  }

  update(dt) {
    this.angle += dt * 2.6;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = getDroneFireInterval();
      this.fire();
    }
  }

  fire() {
    if (!invaders.length) return;
    let target = null;
    let closest = Infinity;
    invaders.forEach((invader) => {
      const dx = invader.x + invader.width / 2 - this.x;
      const dy = invader.y + invader.height / 2 - this.y;
      const dist = dx * dx + dy * dy;
      if (dist < closest) {
        closest = dist;
        target = invader;
      }
    });
    if (!target) return;
    const originX = this.x;
    const originY = this.y;
    const dx = target.x + target.width / 2 - originX;
    const dy = target.y + target.height / 2 - originY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const speed = getPlayerShotSpeed() * 0.85;
    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;
    bullets.push(new Bullet(originX, originY, vx, vy, "player", 0));
    playSound({
      type: "triangle",
      frequency: 220,
      endFrequency: 120,
      duration: 0.08,
      gain: 0.05,
    });
  }

  get x() {
    return player.x + player.width / 2 + Math.cos(this.angle) * this.orbitRadius;
  }

  get y() {
    return player.y + player.height / 2 + Math.sin(this.angle) * this.orbitRadius;
  }

  draw() {
    const x = this.x;
    const y = this.y;
    ctx.save();
    ctx.fillStyle = PALETTE.player;
    ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
    ctx.fillStyle = PALETTE.playerDark;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    ctx.restore();
  }
}

class LeaderBomb {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 5;
    this.vy = 220;
    this.active = true;
  }

  update(dt) {
    this.y += this.vy * dt;
    if (this.y > GAME.height + 20) {
      this.active = false;
    }
  }

  draw() {
    ctx.fillStyle = "#ffb347";
    ctx.fillRect(this.x - 2, this.y - 6, 4, 8);
    ctx.fillStyle = "#ff6a6a";
    ctx.fillRect(this.x - 1, this.y - 2, 2, 2);
  }
}


const shopCatalog = [
  {
    id: "rapid",
    name: "Pulse Coupler",
    description: "Fire rate +12% (stackable).",
    price: 3,
    maxStacks: 4,
    apply: () => {
      playerUpgrades.rapid += 1;
    },
  },
  {
    id: "damage",
    name: "Rail Amplifier",
    description: "+8 damage per shot (stackable).",
    price: 3,
    maxStacks: 6,
    apply: () => {
      playerUpgrades.damage += 1;
    },
  },
  {
    id: "burst",
    name: "Burst Coil",
    description: "+1 shot per trigger (stackable).",
    price: 4,
    maxStacks: 2,
    apply: () => {
      playerUpgrades.burst += 1;
    },
  },
  {
    id: "spread",
    name: "Tri-Volley",
    description: "Adds two angled shots.",
    price: 5,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.spread = 1;
    },
  },
  {
    id: "pierce",
    name: "Shard Core",
    description: "Shots pierce +1 target (stackable).",
    price: 4,
    maxStacks: 3,
    apply: () => {
      playerUpgrades.pierce += 1;
    },
  },
  {
    id: "drone",
    name: "Sentinel Drone",
    description: "Orbiting drone auto-fires at enemies.",
    price: 6,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.drone = 1;
      if (!helperDrone) {
        helperDrone = new HelperDrone();
      }
    },
  },
  {
    id: "overclock",
    name: "Overclock",
    description: "Fire rate +15%, max health -10%.",
    price: 4,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.overclock = 1;
      player.health = Math.min(player.health, getPlayerMaxHealth());
    },
  },
  {
    id: "pierceMk2",
    name: "Pierce Mk II",
    description: "+2 pierce, -20% damage.",
    price: 5,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.pierceMk2 = 1;
    },
  },
  {
    id: "shieldBattery",
    name: "Shield Battery",
    description: "Shield duration +3s.",
    price: 4,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.shieldBattery = 1;
    },
  },
  {
    id: "medInjector",
    name: "Med-Injector",
    description: "Medkits heal +40%.",
    price: 4,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.medInjector = 1;
    },
  },
  {
    id: "shockRounds",
    name: "Shock Rounds",
    description: "10% chance to stun enemies.",
    price: 6,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.shockRounds = 1;
    },
  },
  {
    id: "creditMagnet",
    name: "Credit Magnet",
    description: "+1 credit on level clear (stackable).",
    price: 3,
    maxStacks: 3,
    apply: () => {
      playerUpgrades.creditMagnet += 1;
    },
  },
  {
    id: "armorPlating",
    name: "Armor Plating",
    description: "Reduce incoming damage by 10%.",
    price: 5,
    maxStacks: 3,
    apply: () => {
      playerUpgrades.armorPlating += 1;
    },
  },
  {
    id: "healthBoost",
    name: "Health",
    description: "Max health +150 (stackable).",
    price: 5,
    maxStacks: 5,
    apply: () => {
      playerUpgrades.healthBoost += 1;
      player.health = Math.min(player.health + 150, getPlayerMaxHealth());
    },
  },
  {
    id: "heavyBolts",
    name: "Heavy Bolts",
    description: "Bullets slower but +35% damage.",
    price: 5,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.heavyBolts = 1;
    },
  },
  {
    id: "twinDrive",
    name: "Twin Drive",
    description: "+1 burst shot, +20% cooldown.",
    price: 5,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.twinDrive = 1;
    },
  },
  {
    id: "droneBoost",
    name: "Drone Boost",
    description: "Drone fires 30% faster.",
    price: 4,
    maxStacks: 1,
    apply: () => {
      playerUpgrades.droneBoost = 1;
    },
  },
];

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getShopPrice(item) {
  return item.price + Math.floor((currentLevel - 1) / 2);
}

function canBuyItem(item) {
  const stacks = playerUpgrades[item.id] || 0;
  return item.maxStacks === undefined || stacks < item.maxStacks;
}

function updateShopCredits() {
  if (shopCredits) {
    shopCredits.textContent = credits;
  }
}

function renderShop() {
  if (!shopItemsContainer) return;
  shopItemsContainer.innerHTML = "";
  const available = shopCatalog.filter((item) => canBuyItem(item));
  shuffle(available);
  currentShopItems = available.slice(0, 3);

  if (currentShopItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "shop__card";
    empty.innerHTML = "<h3>Armory Empty</h3><p>All weapon mods installed.</p>";
    shopItemsContainer.appendChild(empty);
  }

  currentShopItems.forEach((item) => {
    const price = getShopPrice(item);
    const card = document.createElement("div");
    card.className = "shop__card";
    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>${item.description}</p>
      <div class="shop__price">Cost: ${price}</div>
    `;
    const button = document.createElement("button");
    button.className = "shop__buy";
    button.type = "button";
    button.textContent = "Buy";
    button.disabled = credits < price || !canBuyItem(item);
    button.addEventListener("click", () => {
      if (credits < price || !canBuyItem(item)) return;
      credits -= price;
      item.apply();
      updateShopCredits();
      renderShop();
    });
    card.appendChild(button);
    shopItemsContainer.appendChild(card);
  });

  updateShopCredits();
}

function openShop() {
  shopOpen = true;
  if (shopOverlay) {
    shopOverlay.classList.remove("hidden");
    shopOverlay.style.display = "flex";
    shopOverlay.hidden = false;
  }
  console.log("[shop] open", { currentLevel, credits });
  renderShop();
}

function closeShop() {
  shopOpen = false;
  if (shopOverlay) {
    shopOverlay.classList.add("hidden");
    shopOverlay.style.display = "none";
    shopOverlay.hidden = true;
  }
  console.log("[shop] close", { pendingLevelAdvance });
  if (pendingLevelAdvance) {
    pendingLevelAdvance = false;
    advanceLevel();
  }
}

function resetGame(consumeCredit = true, dropIn = false) {
  if (consumeCredit) {
    if (credits <= 0) return;
    credits -= 1;
  }
  playerUpgrades = {
    rapid: 0,
    damage: 0,
    burst: 0,
    spread: 0,
    pierce: 0,
    drone: 0,
    overclock: 0,
    pierceMk2: 0,
    shieldBattery: 0,
    medInjector: 0,
    shockRounds: 0,
    creditMagnet: 0,
    armorPlating: 0,
    healthBoost: 0,
    heavyBolts: 0,
    twinDrive: 0,
    droneBoost: 0,
  };
  shopOpen = false;
  pendingLevelAdvance = false;
  invaderDirection = 1;
  if (shopOverlay) {
    shopOverlay.classList.add("hidden");
  }
  player = new Player(dropIn);
  musicIndex = 0;
  musicTimer = 0;
  helperDrone = null;
  leaderBombs = [];
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
  commandInvader = null;
  shielderInvader = null;
  healerInvader = null;
  minibossInvader = null;
  flyerTimer = 17;
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
  const minY = GAME.height / 2;
  const y = Math.max(minY, Math.min(GAME.height - 120, player.y + offsetY));
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
  const minY = GAME.height / 2;
  const y = Math.max(minY, Math.min(GAME.height - 140, player.y + offsetY));
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
  const minY = GAME.height / 2;
  const y = Math.max(minY, Math.min(GAME.height - 160, player.y + offsetY));
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
  invaderDirection = 1;
  commandInvader = null;
  shielderInvader = null;
  healerInvader = null;
  minibossInvader = null;
  leaderBombs = [];
  flyerTimer = 17;
  musicTempo = 110 + level * 14;
  musicIndex = 0;
  musicTimer = 0;


  const startX = 120;
  const startY = 80;
  const gapX = 70;
  const gapY = 60;

  for (let row = 0; row < levelConfig.rows; row += 1) {
    for (let col = 0; col < levelConfig.columns; col += 1) {
      const invader = new Invader(
        startX + col * gapX,
        startY + row * gapY,
        levelConfig
      );
      invaders.push(invader);
    }
  }

  if (invaders.length) {
    const midIndex = Math.floor(levelConfig.columns / 2);
    const commandIndex = Math.min(invaders.length - 1, midIndex);
    commandInvader = invaders[commandIndex];
    commandInvader.isCommand = true;
    commandInvader.maxHealth = GAME.enemyHealth * 2 * getEnemyHealthMultiplier();
    commandInvader.health = commandInvader.maxHealth;
    commandInvader.baseMaxHealth = commandInvader.maxHealth;

    if (invaders.length > 3) {
      let shielderIndex = Math.floor(Math.random() * invaders.length);
      if (invaders[shielderIndex] === commandInvader) {
        shielderIndex = (shielderIndex + 1) % invaders.length;
      }
      shielderInvader = invaders[shielderIndex];
      shielderInvader.isShielder = true;
    }

    if (invaders.length > 4) {
      let healerIndex = Math.floor(Math.random() * invaders.length);
      const invalid = new Set([commandInvader, shielderInvader]);
      if (invalid.has(invaders[healerIndex])) {
        healerIndex = (healerIndex + 1) % invaders.length;
      }
      if (invalid.has(invaders[healerIndex])) {
        healerIndex = (healerIndex + 2) % invaders.length;
      }
      healerInvader = invaders[healerIndex];
      healerInvader.isHealer = true;
    }

    if (currentLevel % 5 === 0) {
      const candidates = invaders.filter(
        (invader) => invader !== commandInvader && invader !== shielderInvader && invader !== healerInvader
      );
      if (candidates.length) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        minibossInvader = chosen;
        minibossInvader.isMiniBoss = true;
        const minibossHealth = 5000 * getEnemyHealthMultiplier();
        minibossInvader.maxHealth = minibossHealth;
        minibossInvader.health = minibossHealth;
        minibossInvader.baseMaxHealth = minibossHealth;
      }
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

function jumpToLevel(level) {
  if (!Number.isFinite(level)) return;
  const targetLevel = Math.max(1, Math.min(GAME.maxLevels, level));
  bullets = [];
  bombers = [];
  leaderBombs = [];
  shield = null;
  medkit = null;
  powerUp = null;
  shieldSpawnTimer = GAME.shieldSpawnInterval;
  medkitSpawnTimer = GAME.medkitSpawnInterval;
  powerSpawnTimer = GAME.powerSpawnInterval;
  bomberSpawnTimer = GAME.bomberSpawnInterval;
  bossLaser = null;
  gameOver = false;
  gameOverTimer = 0;
  playerExplosionTriggered = false;
  deathProcessed = false;
  respawnButton.hidden = true;
  pendingLevelAdvance = false;
  if (shopOpen) {
    closeShop();
  }
  if (!gameStarted) {
    gameStarted = true;
    startScreen.classList.add("hidden");
  }
  spawnLevel(targetLevel);
  playSound({ type: "triangle", frequency: 520, endFrequency: 260, duration: 0.2, gain: 0.06 });
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
  starDust.forEach((dust) => dust.update(dt));
  planets.forEach((planet) => planet.update(dt));
  driftShips.forEach((ship) => ship.update(dt));
  shootingStars.forEach((star) => star.update(dt));
  if (Math.random() < dt * 0.08) {
    const inactive = shootingStars.find((star) => !star.active);
    if (inactive) {
      inactive.spawn();
    }
  }
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

  if (shopOpen) {
    return;
  }

  if (shielderInvader && shielderInvader.health <= 0) {
    shielderInvader = null;
  }

  flyerTimer -= dt;
  if (flyerTimer <= 0) {
    const candidates = invaders.filter(
      (invader) => !invader.isBoss && invader.mode !== "flyer" && invader.health > 0
    );
    const picked = [];
    const minSeparation = 80;
    while (picked.length < 2 && candidates.length) {
      const index = Math.floor(Math.random() * candidates.length);
      const chosen = candidates.splice(index, 1)[0];
      const tooClose = picked.some((p) => {
        const dx = (p.x + p.width / 2) - (chosen.x + chosen.width / 2);
        const dy = (p.y + p.height / 2) - (chosen.y + chosen.height / 2);
        return Math.hypot(dx, dy) < minSeparation;
      });
      if (tooClose) continue;
      picked.push(chosen);
    }
    picked.forEach((chosen) => {
      chosen.mode = "flyer";
      const speed = rand(90, 140);
      const angle = rand(0, Math.PI * 2);
      chosen.vx = Math.cos(angle) * speed;
      chosen.vy = Math.sin(angle) * speed;
    });
    flyerTimer = 17;
  }

  if (invaders.length) {
    const formationInvaders = invaders.filter(
      (invader) => !invader.isBoss && invader.mode !== "flyer"
    );
    if (formationInvaders.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      formationInvaders.forEach((invader) => {
        minX = Math.min(minX, invader.x);
        maxX = Math.max(maxX, invader.x + invader.width);
      });
      let dropThisTick = false;
      if (minX <= 20) {
        invaderDirection = 1;
        dropThisTick = true;
      } else if (maxX >= GAME.width - 20) {
        invaderDirection = -1;
        dropThisTick = true;
      }
      const dx = levelConfig.enemySpeed * invaderDirection * dt;
      const drop = dropThisTick ? 24 : 0;
      formationInvaders.forEach((invader) => {
        invader.x = Math.max(20, Math.min(GAME.width - 20 - invader.width, invader.x + dx));
        invader.y += drop;
      });
    }
  }

  // Shielder buff: closest 5 enemies get +25% health while shielder is alive
  const buffTargets = new Set();
  if (shielderInvader && shielderInvader.health > 0) {
    const candidates = invaders.filter(
      (invader) => invader !== shielderInvader && !invader.isBoss && invader.health > 0
    );
    candidates.sort((a, b) => {
      const ax = a.x + a.width / 2;
      const ay = a.y + a.height / 2;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      const sx = shielderInvader.x + shielderInvader.width / 2;
      const sy = shielderInvader.y + shielderInvader.height / 2;
      return Math.hypot(ax - sx, ay - sy) - Math.hypot(bx - sx, by - sy);
    });
    candidates.slice(0, 5).forEach((invader) => buffTargets.add(invader));
  }

  invaders.forEach((invader) => {
    const shouldBuff = buffTargets.has(invader);
    if (shouldBuff && !invader.buffActive) {
      invader.health += invader.baseMaxHealth * 0.25;
    }
    invader.buffActive = shouldBuff;
    invader.maxHealth = invader.baseMaxHealth * (shouldBuff ? 1.25 : 1);
    if (invader.health > invader.maxHealth) {
      invader.health = invader.maxHealth;
    }
  });

  // Retro soundtrack tick
  musicTimer -= dt;
  if (musicTimer <= 0) {
    const beat = 60 / musicTempo;
    const note = MUSIC_PATTERN[musicIndex % MUSIC_PATTERN.length];
    if (note && audioContext) {
      playSound({
        type: "square",
        frequency: note,
        endFrequency: note * 0.98,
        duration: beat * 0.85,
        gain: 0.03,
      });
    }
    musicIndex += 1;
    musicTimer = beat * 0.5;
  }

  if (helperDrone) {
    helperDrone.update(dt);
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
          player.health = Math.min(getPlayerMaxHealth(), player.health + getMedkitHeal());
          medkit = null;
        }
      }
    const closestX = Math.max(player.x, Math.min(shield.x, player.x + player.width));
    const closestY = Math.max(player.y, Math.min(shield.y, player.y + player.height));
    const dx = shield.x - closestX;
    const dy = shield.y - closestY;
    if (dx * dx + dy * dy <= shield.radius * shield.radius) {
      player.invincibleTimer = getShieldDuration();
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

  leaderBombs.forEach((bomb) => bomb.update(dt));
  leaderBombs = leaderBombs.filter((bomb) => bomb.active);

  bullets.forEach((bullet) => bullet.update(dt));
  bullets = bullets.filter((bullet) => bullet.active);

  bullets.forEach((bullet) => {
    const baseDamage = getPlayerDamage();
    const playerDamage = player.doubleDamageTimer > 0
      ? baseDamage * 2
      : baseDamage;
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
          if (playerUpgrades.shockRounds && !invader.isBoss && Math.random() < 0.1) {
            invader.stunTimer = 0.5;
          }
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            bullet.active = false;
          }
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
          if (bullet.pierce > 0) {
            bullet.pierce -= 1;
          } else {
            bullet.active = false;
          }
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
        const minibossDamageBoost = (minibossInvader && minibossInvader.health > 0) ? 1.35 : 1;
        player.health -= getDamageTaken(getEnemyDamage(GAME.enemyDamage) * minibossDamageBoost);
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
        player.health -= getDamageTaken(getEnemyDamage(GAME.bossLaserDamage));
        playSound({ type: "sawtooth", frequency: 200, duration: 0.08, gain: 0.05 });
      }
    }
  }

  const aliveInvaders = invaders.filter(
    (invader) => invader && invader.health > 0 && Number.isFinite(invader.health)
  );
  if (commandInvader && commandInvader.health <= 0) {
    commandInvader = null;
  }
  if (shielderInvader && shielderInvader.health <= 0) {
    shielderInvader = null;
  }
  if (healerInvader && healerInvader.health <= 0) {
    healerInvader = null;
  }
  if (minibossInvader && minibossInvader.health <= 0) {
    minibossInvader = null;
  }
  invaders = aliveInvaders;

  invaders.forEach((invader) => {
    if (checkCollision(invader, player)) {
      if (player.invincibleTimer <= 0) {
        const minibossDamageBoost = (minibossInvader && minibossInvader.health > 0) ? 1.35 : 1;
        player.health -= getDamageTaken(getEnemyDamage(GAME.enemyDamage) * minibossDamageBoost);
        playSound({ type: "sawtooth", frequency: 160, duration: 0.12, gain: 0.06 });
      }
    }
  });

  bombers.forEach((bomber) => {
    if (checkCollision(bomber, player)) {
      if (player.invincibleTimer <= 0) {
        const minibossDamageBoost = (minibossInvader && minibossInvader.health > 0) ? 1.35 : 1;
        player.health -= getDamageTaken(getEnemyDamage(GAME.bomberDamage) * minibossDamageBoost);
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

  leaderBombs.forEach((bomb) => {
    if (
      bomb.x > player.x &&
      bomb.x < player.x + player.width &&
      bomb.y > player.y &&
      bomb.y < player.y + player.height
    ) {
      if (player.invincibleTimer <= 0) {
        const minibossDamageBoost = (minibossInvader && minibossInvader.health > 0) ? 1.35 : 1;
        player.health -= getDamageTaken(getEnemyDamage(GAME.leaderBombDamage) * minibossDamageBoost);
        playSound({ type: "sawtooth", frequency: 140, duration: 0.14, gain: 0.07 });
      }
      bomb.active = false;
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

  if (aliveInvaders.length === 0 && !gameOver && !shopOpen) {
    credits += 5 + playerUpgrades.creditMagnet;
    if (currentLevel < GAME.maxLevels) {
      pendingLevelAdvance = true;
      console.log("[shop] level cleared", { currentLevel, credits });
      openShop();
    } else {
      advanceLevel();
    }
  }

  hudHealth.textContent = `Health: ${Math.round(player.health)}`;
  hudScore.textContent = `Score: ${score}`;
  hudLevel.textContent = `Level: ${currentLevel}`;
  hudCredits.textContent = `Credits: ${credits}`;
}

function drawBackground() {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, GAME.width, GAME.height);
  stars.forEach((star) => star.draw());
  starDust.forEach((dust) => dust.draw());
  planets.forEach((planet) => planet.draw());
  driftShips.forEach((ship) => ship.draw());
  shootingStars.forEach((star) => star.draw());
}

function draw() {
  drawBackground();
  if (dropShip) {
    dropShip.draw();
  }
  if (!playerExplosionTriggered) {
    player.draw();
  }
  if (helperDrone && !gameOver) {
    helperDrone.draw();
  }
  invaders.forEach((invader) => invader.draw());
  bombers.forEach((bomber) => bomber.draw());
  leaderBombs.forEach((bomb) => bomb.draw());
  bullets.forEach((bullet) => bullet.draw());
  explosions.forEach((explosion) => explosion.draw());
  // Scanline texture for retro feel
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  for (let y = 0; y < GAME.height; y += 3) {
    ctx.fillRect(0, y, GAME.width, 1);
  }
  ctx.restore();
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
    const size = Math.round(powerUp.size);
    ctx.fillStyle = PALETTE.power;
    ctx.fillRect(powerUp.x - size / 2, powerUp.y - size / 2, size, size);
    ctx.fillStyle = PALETTE.enemy;
    ctx.fillRect(powerUp.x - 1, powerUp.y - size / 2 + 2, 2, size - 4);
    ctx.fillRect(powerUp.x - size / 2 + 2, powerUp.y - 1, size - 4, 2);
  }
  if (medkit) {
    const size = Math.round(medkit.size);
    ctx.fillStyle = PALETTE.medkit;
    ctx.fillRect(medkit.x - size / 2, medkit.y - size / 2, size, size);
    ctx.fillStyle = PALETTE.enemy;
    ctx.fillRect(medkit.x - 2, medkit.y - size / 2 + 3, 4, size - 6);
    ctx.fillRect(medkit.x - size / 2 + 3, medkit.y - 2, size - 6, 4);
  }
  if (shield) {
    const size = Math.round(shield.radius * 2);
    const x = Math.round(shield.x - size / 2);
    const y = Math.round(shield.y - size / 2);
    ctx.fillStyle = PALETTE.shield;
    // Shield outline (pixelated octagon feel)
    ctx.fillRect(x + 2, y, size - 4, 2);
    ctx.fillRect(x, y + 2, 2, size - 4);
    ctx.fillRect(x + size - 2, y + 2, 2, size - 4);
    ctx.fillRect(x + 2, y + size - 2, size - 4, 2);
    // Inner glow
    ctx.fillStyle = PALETTE.enemy;
    ctx.fillRect(x + 5, y + 5, size - 10, size - 10);
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
  if (cheatAwaitLevel) {
    if (/^\d$/.test(event.key)) {
      const maxDigits = String(GAME.maxLevels).length;
      cheatLevelBuffer = `${cheatLevelBuffer}${event.key}`.slice(0, maxDigits);
      scheduleCheatLevelJump();
    } else if (event.key === "Enter") {
      const parsedLevel = Number.parseInt(cheatLevelBuffer, 10);
      jumpToLevel(parsedLevel);
      resetCheatLevelCapture();
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      resetCheatLevelCapture();
    }
  }
  if (/^[a-zA-Z]$/.test(event.key)) {
    cheatBuffer = (cheatBuffer + event.key.toUpperCase()).slice(-CHEAT_CODE.length);
    if (cheatBuffer === CHEAT_CODE) {
      cheatInfiniteFire = true;
      player.invincibleTimer = 999999;
      credits += 2500;
      cheatAwaitLevel = true;
      cheatLevelBuffer = "";
      if (cheatLevelTimer) {
        clearTimeout(cheatLevelTimer);
        cheatLevelTimer = null;
      }
      playSound({ type: "triangle", frequency: 700, endFrequency: 350, duration: 0.2, gain: 0.06 });
    }
  }
  if (event.code === "KeyO" && !gameOver) {
    openShop();
  }
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

function bindTouchButton(button, key) {
  if (!button) return;
  const setState = (value) => {
    ensureAudio();
    input[key] = value;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setState(true);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    setState(false);
  });
  button.addEventListener("pointerleave", () => setState(false));
  button.addEventListener("pointercancel", () => setState(false));
}

bindTouchButton(btnLeft, "left");
bindTouchButton(btnRight, "right");
bindTouchButton(btnUp, "up");
bindTouchButton(btnDown, "down");
bindTouchButton(btnFire, "fire");

window.openShop = openShop;

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

shopSkipButton.addEventListener("click", () => {
  closeShop();
});
