/**
 * SHADOW REALMS - Platformer Game Engine
 * Features realistic atmospheric canvas rendering, smooth animations,
 * particle effects, responsive player controls, melee combat, and enemy AI.
 */

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI Elements
    const startScreen = document.getElementById('start-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const soundBtn = document.getElementById('sound-btn');
    
    // HUD Elements
    const healthBarFill = document.getElementById('health-bar-fill');
    const healthText = document.getElementById('health-text');
    const scoreText = document.getElementById('score-text');
    const goldText = document.getElementById('gold-text');
    const waveText = document.getElementById('wave-text');
    const finalScore = document.getElementById('final-score');
    const finalGold = document.getElementById('final-gold');

    // Game States
    let gameState = 'START'; // START, PLAYING, PAUSED, GAMEOVER
    let soundEnabled = true;
    let score = 0;
    let gold = 0;
    let wave = 1;

    // Input Tracking
    const keys = {
        left: false,
        right: false,
        up: false,
        attack: false,
        dash: false
    };

    // Audio Synthesizer (Web Audio API for zero external asset dependencies)
    class SoundFX {
        constructor() {
            this.ctx = null;
        }
        init() {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
            }
        }
        playJump() {
            if (!soundEnabled) return;
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(350, this.ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        }
        playSlash() {
            if (!soundEnabled) return;
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        }
        playHit() {
            if (!soundEnabled) return;
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, this.ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        }
        playCoin() {
            if (!soundEnabled) return;
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.setValueAtTime(1200, this.ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        }
    }

    const sfx = new SoundFX();

    // Camera
    const camera = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
    };

    // World & Level
    const world = {
        width: 3200,
        height: 540,
        gravity: 0.6
    };

    // Platforms
    let platforms = [];
    let coins = [];
    let monsters = [];
    let particles = [];
    let floatingTexts = [];

    // Player Object
    let player = {};

    function initGame() {
        score = 0;
        gold = 0;
        wave = 1;
        
        player = {
            x: 100,
            y: 350,
            width: 36,
            height: 56,
            vx: 0,
            vy: 0,
            speed: 4.5,
            jumpForce: -13,
            grounded: false,
            health: 100,
            maxHealth: 100,
            facing: 1, // 1 = right, -1 = left
            isAttacking: false,
            attackTimer: 0,
            attackCooldown: 0,
            isDashing: false,
            dashTimer: 0,
            dashCooldown: 0,
            animTimer: 0
        };

        generateLevel();
        updateHUD();
    }

    function generateLevel() {
        platforms = [
            // Ground platforms
            { x: 0, y: 460, width: 900, height: 80, type: 'ground' },
            { x: 950, y: 460, width: 800, height: 80, type: 'ground' },
            { x: 1800, y: 460, width: 1400, height: 80, type: 'ground' },

            // Floating platforms
            { x: 350, y: 350, width: 180, height: 20, type: 'platform' },
            { x: 600, y: 260, width: 200, height: 20, type: 'platform' },
            { x: 900, y: 340, width: 160, height: 20, type: 'platform' },
            { x: 1150, y: 250, width: 220, height: 20, type: 'platform' },
            { x: 1450, y: 330, width: 180, height: 20, type: 'platform' },
            { x: 1750, y: 240, width: 200, height: 20, type: 'platform' },
            { x: 2050, y: 350, width: 190, height: 20, type: 'platform' },
            { x: 2350, y: 260, width: 220, height: 20, type: 'platform' },
            { x: 2700, y: 340, width: 200, height: 20, type: 'platform' }
        ];

        // Spawn Coins
        coins = [];
        platforms.forEach(p => {
            if (p.type === 'platform' || Math.random() > 0.4) {
                const count = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < count; i++) {
                    coins.push({
                        x: p.x + 30 + (i * 40),
                        y: p.y - 35,
                        width: 16,
                        height: 16,
                        collected: false,
                        bobOffset: Math.random() * Math.PI
                    });
                }
            }
        });

        // Spawn Monsters
        monsters = [
            { id: 1, x: 650, y: 410, width: 44, height: 44, vx: 1.5, vy: 0, patrolMin: 600, patrolMax: 780, health: 40, maxHealth: 40, type: 'goblin', state: 'walk', animTimer: 0, attackCooldown: 0 },
            { id: 2, x: 1200, y: 410, width: 48, height: 48, vx: -2, vy: 0, patrolMin: 1100, patrolMax: 1350, health: 60, maxHealth: 60, type: 'orc', state: 'walk', animTimer: 0, attackCooldown: 0 },
            { id: 3, x: 1600, y: 200, width: 40, height: 40, vx: 1.2, vy: 0, patrolMin: 1500, patrolMax: 1700, health: 30, maxHealth: 30, type: 'gargoyle', state: 'fly', animTimer: 0, attackCooldown: 0 },
            { id: 4, x: 2100, y: 410, width: 44, height: 44, vx: -1.8, vy: 0, patrolMin: 2000, patrolMax: 2240, health: 50, maxHealth: 50, type: 'goblin', state: 'walk', animTimer: 0, attackCooldown: 0 },
            { id: 5, x: 2500, y: 410, width: 48, height: 48, vx: 2, vy: 0, patrolMin: 2400, patrolMax: 2650, health: 70, maxHealth: 70, type: 'orc', state: 'walk', animTimer: 0, attackCooldown: 0 },
            { id: 6, x: 2850, y: 220, width: 40, height: 40, vx: -1.5, vy: 0, patrolMin: 2750, patrolMax: 3000, health: 40, maxHealth: 40, type: 'gargoyle', state: 'fly', animTimer: 0, attackCooldown: 0 }
        ];
    }

    // Event Listeners for Controls
    window.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
        if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
            if (gameState === 'PLAYING' && player.grounded) {
                player.vy = player.jumpForce;
                player.grounded = false;
                sfx.playJump();
                createJumpParticles();
            }
            keys.up = true;
            e.preventDefault();
        }
        if (e.code === 'KeyJ' || e.code === 'KeyZ') {
            if (gameState === 'PLAYING' && !player.isAttacking && player.attackCooldown <= 0) {
                performAttack();
            }
        }
        if (e.code === 'KeyK' || e.code === 'KeyX') {
            if (gameState === 'PLAYING' && !player.isDashing && player.dashCooldown <= 0) {
                performDash();
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
        if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keys.up = false;
    });

    startBtn.addEventListener('click', () => {
        startScreen.classList.remove('active');
        gameState = 'PLAYING';
        initGame();
    });

    restartBtn.addEventListener('click', () => {
        gameoverScreen.classList.remove('active');
        gameState = 'PLAYING';
        initGame();
    });

    pauseBtn.addEventListener('click', () => {
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED';
            pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
        } else if (gameState === 'PAUSED') {
            gameState = 'PLAYING';
            pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        }
    });

    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            canvas.requestFullscreen().catch(err => console.log(err));
        } else {
            document.exitFullscreen();
        }
    });

    soundBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundBtn.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
    });

    // Combat & Abilities
    function performAttack() {
        player.isAttacking = true;
        player.attackTimer = 15; // frames
        player.attackCooldown = 25;
        sfx.playSlash();

        // Hitbox in front of player
        const range = 55;
        const hitX = player.facing === 1 ? player.x + player.width : player.x - range;
        const hitY = player.y;
        const hitWidth = range;
        const hitHeight = player.height;

        // Visual Slash Particle Arc
        createSlashEffect(hitX + (player.facing === 1 ? 0 : range / 2), player.y + player.height / 2, player.facing);

        monsters.forEach(m => {
            if (m.health > 0 &&
                hitX < m.x + m.width &&
                hitX + hitWidth > m.x &&
                hitY < m.y + m.height &&
                hitY + hitHeight > m.y) {
                
                const damage = 25;
                m.health -= damage;
                sfx.playHit();
                createFloatingText('-' + damage, m.x + m.width / 2, m.y, '#e63946');
                createHitParticles(m.x + m.width / 2, m.y + m.height / 2);

                // Knockback
                m.vx += player.facing * 4;

                if (m.health <= 0) {
                    score++;
                    gold += Math.floor(Math.random() * 15) + 10;
                    createFloatingText('+15 Gold', m.x, m.y - 20, '#f3ba2f');
                }
            }
        });
    }

    function performDash() {
        player.isDashing = true;
        player.dashTimer = 12; // frames of dash
        player.dashCooldown = 60; // 1 sec cooldown
        player.vy = 0;
        sfx.playJump();
    }

    // Particle Effects
    function createJumpParticles() {
        for (let i = 0; i < 6; i++) {
            particles.push({
                x: player.x + player.width / 2,
                y: player.y + player.height,
                vx: (Math.random() - 0.5) * 4,
                vy: Math.random() * -2,
                radius: Math.random() * 3 + 1,
                color: 'rgba(200, 200, 200, 0.7)',
                life: 20
            });
        }
    }

    function createHitParticles(x, y) {
        for (let i = 0; i < 10; i++) {
            particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                radius: Math.random() * 4 + 2,
                color: '#e63946',
                life: 25
            });
        }
    }

    function createSlashEffect(x, y, facing) {
        particles.push({
            x: x,
            y: y,
            radius: 30,
            color: 'rgba(243, 186, 47, 0.6)',
            isSlash: true,
            facing: facing,
            life: 8
        });
    }

    function createFloatingText(text, x, y, color) {
        floatingTexts.push({
            text: text,
            x: x,
            y: y,
            vy: -1.5,
            color: color,
            life: 40
        });
    }

    // Update Game Logic
    function update() {
        if (gameState !== 'PLAYING') return;

        // Player Dash Logic
        if (player.isDashing) {
            player.vx = player.facing * 14;
            player.vy = 0;
            player.dashTimer--;
            if (player.dashTimer <= 0) {
                player.isDashing = false;
            }
        } else {
            // Normal Movement
            let moveDir = 0;
            if (keys.left) moveDir = -1;
            if (keys.right) moveDir = 1;

            player.vx = moveDir * player.speed;
            if (moveDir !== 0) player.facing = moveDir;

            // Gravity
            player.vy += world.gravity;
        }

        // Attack cooldowns
        if (player.attackCooldown > 0) player.attackCooldown--;
        if (player.dashCooldown > 0) player.dashCooldown--;
        if (player.isAttacking) {
            player.attackTimer--;
            if (player.attackTimer <= 0) player.isAttacking = false;
        }

        // Horizontal movement & collision
        player.x += player.vx;
        platforms.forEach(p => {
            if (checkCollision(player, p)) {
                if (player.vx > 0) player.x = p.x - player.width;
                else if (player.vx < 0) player.x = p.x + p.width;
            }
        });

        // Vertical movement & collision
        player.grounded = false;
        player.y += player.vy;
        platforms.forEach(p => {
            if (checkCollision(player, p)) {
                if (player.vy > 0) {
                    player.y = p.y - player.height;
                    player.vy = 0;
                    player.grounded = true;
                } else if (player.vy < 0) {
                    player.y = p.y + p.height;
                    player.vy = 0;
                }
            }
        });

        // World boundaries
        if (player.x < 0) player.x = 0;
        if (player.x > world.width - player.width) player.x = world.width - player.width;
        if (player.y > world.height + 100) {
            // Fell into abyss
            player.health = 0;
        }

        // Coin Collection
        coins.forEach(c => {
            if (!c.collected && checkCollision(player, c)) {
                c.collected = true;
                gold += 5;
                sfx.playCoin();
                createFloatingText('+5 Gold', c.x, c.y - 10, '#f3ba2f');
            }
        });

        // Monster AI & Update
        monsters.forEach(m => {
            if (m.health <= 0) return;

            // Patrol movement
            m.x += m.vx;
            if (m.x < m.patrolMin || m.x > m.patrolMax) {
                m.vx *= -1;
            }

            // Check collision with player
            if (checkCollision(player, m)) {
                if (!player.isDashing) {
                    player.health -= 0.75; // continuous contact damage
                    if (Math.random() < 0.2) sfx.playHit();
                }
            }
        });

        // Camera follow player smoothly
        let targetCamX = player.x - canvas.width / 2 + player.width / 2;
        camera.x += (targetCamX - camera.x) * 0.1;
        if (camera.x < 0) camera.x = 0;
        if (camera.x > world.width - canvas.width) camera.x = world.width - canvas.width;

        // Update Particles
        particles.forEach((pt, index) => {
            pt.x += pt.vx;
            pt.y += pt.vy;
            pt.life--;
            if (pt.life <= 0) particles.splice(index, 1);
        });

        // Update Floating Texts
        floatingTexts.forEach((ft, index) => {
            ft.y += ft.vy;
            ft.life--;
            if (ft.life <= 0) floatingTexts.splice(index, 1);
        });

        // Check Game Over
        if (player.health <= 0) {
            gameState = 'GAMEOVER';
            finalScore.textContent = score;
            finalGold.textContent = gold;
            gameoverScreen.classList.add('active');
        }

        updateHUD();
    }

    function checkCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }

    function updateHUD() {
        const hpPct = Math.max(0, (player.health / player.maxHealth) * 100);
        healthBarFill.style.width = hpPct + '%';
        healthText.textContent = Math.ceil(player.health) + ' / ' + player.maxHealth;
        scoreText.textContent = score;
        goldText.textContent = gold;
        waveText.textContent = wave;
    }

    // Render Game
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        // 1. Render Atmospheric Parallax Background
        renderBackground();

        // 2. Render Platforms
        platforms.forEach(p => {
            if (p.type === 'ground') {
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(p.x, p.y, p.width, p.height);
                // Grass top layer
                ctx.fillStyle = '#22c55e';
                ctx.fillRect(p.x, p.y, p.width, 8);
                // Stone bricks detail
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                ctx.strokeRect(p.x, p.y, p.width, p.height);
            } else {
                ctx.fillStyle = '#334155';
                ctx.fillRect(p.x, p.y, p.width, p.height);
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(p.x, p.y, p.width, 4);
                ctx.strokeStyle = '#1e293b';
                ctx.strokeRect(p.x, p.y, p.width, p.height);
            }
        });

        // 3. Render Coins
        coins.forEach(c => {
            if (!c.collected) {
                c.bobOffset += 0.08;
                let drawY = c.y + Math.sin(c.bobOffset) * 4;
                
                ctx.fillStyle = '#f3ba2f';
                ctx.beginPath();
                ctx.arc(c.x + c.width/2, drawY + c.height/2, c.width/2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#b45309';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Sparkle
                ctx.fillStyle = '#fff';
                ctx.fillRect(c.x + 5, drawY + 4, 3, 3);
            }
        });

        // 4. Render Monsters
        monsters.forEach(m => {
            if (m.health <= 0) return;

            if (m.type === 'goblin') {
                // Goblin Body (Green)
                ctx.fillStyle = '#15803d';
                ctx.fillRect(m.x, m.y + 10, m.width, m.height - 10);
                // Head
                ctx.fillStyle = '#22c55e';
                ctx.fillRect(m.x + 6, m.y, 32, 24);
                // Red glowing eyes
                ctx.fillStyle = '#ef4444';
                ctx.fillRect(m.x + (m.vx > 0 ? 26 : 10), m.y + 6, 6, 5);
                // Horns / Ears
                ctx.fillStyle = '#166534';
                ctx.beginPath();
                ctx.moveTo(m.x + 6, m.y + 4);
                ctx.lineTo(m.x - 4, m.y - 4);
                ctx.lineTo(m.x + 10, m.y + 8);
                ctx.fill();
            } else if (m.type === 'orc') {
                // Orc Body (Dark Red/Brown)
                ctx.fillStyle = '#7f1d1d';
                ctx.fillRect(m.x, m.y + 12, m.width, m.height - 12);
                // Head
                ctx.fillStyle = '#991b1b';
                ctx.fillRect(m.x + 4, m.y, 40, 26);
                // Tusks
                ctx.fillStyle = '#fef3c7';
                ctx.fillRect(m.x + (m.vx > 0 ? 34 : 6), m.y + 18, 6, 8);
                // Eyes
                ctx.fillStyle = '#f3ba2f';
                ctx.fillRect(m.x + (m.vx > 0 ? 30 : 10), m.y + 8, 6, 5);
            } else if (m.type === 'gargoyle') {
                // Gargoyle Flying (Purple/Gray)
                ctx.fillStyle = '#6b21a8';
                ctx.fillRect(m.x + 6, m.y + 8, 28, 24);
                // Wings (flapping animation)
                ctx.fillStyle = '#581c87';
                let wingOffset = Math.sin(Date.now() / 80) * 12;
                ctx.beginPath();
                ctx.moveTo(m.x + 20, m.y + 16);
                ctx.lineTo(m.x - 12, m.y + wingOffset);
                ctx.lineTo(m.x + 10, m.y + 24);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(m.x + 20, m.y + 16);
                ctx.lineTo(m.x + 52, m.y + wingOffset);
                ctx.lineTo(m.x + 30, m.y + 24);
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(m.x + (m.vx > 0 ? 26 : 8), m.y + 12, 5, 5);
            }

            // Monster Health Bar
            const hpW = m.width;
            const hpH = 5;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(m.x, m.y - 10, hpW, hpH);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(m.x, m.y - 10, hpW * (m.health / m.maxHealth), hpH);
        });

        // 5. Render Player
        // Shadow / Glow during dash
        if (player.isDashing) {
            ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
            ctx.fillRect(player.x - player.facing * 10, player.y, player.width, player.height);
        }

        // Knight Body (Armor)
        ctx.fillStyle = '#334155';
        ctx.fillRect(player.x, player.y + 14, player.width, player.height - 14);
        
        // Helmet & Visor
        ctx.fillStyle = '#64748b';
        ctx.fillRect(player.x + 4, player.y, player.width - 8, 24);
        ctx.fillStyle = '#38bdf8'; // Glowing blue visor
        ctx.fillRect(player.x + (player.facing === 1 ? 20 : 6), player.y + 8, 10, 4);

        // Sword Attack Swing Visual
        if (player.isAttacking) {
            ctx.fillStyle = '#f3ba2f';
            ctx.beginPath();
            let swordX = player.facing === 1 ? player.x + player.width : player.x - 30;
            ctx.arc(swordX + 15, player.y + 25, 25, 0, Math.PI * 2);
            ctx.fill();
        }

        // 6. Render Particles
        particles.forEach(pt => {
            if (pt.isSlash) {
                ctx.strokeStyle = pt.color;
                ctx.lineWidth = 4;
                ctx.beginPath();
                let arcX = pt.facing === 1 ? pt.x + 20 : pt.x - 20;
                ctx.arc(arcX, pt.y, pt.radius, 0, Math.PI);
                ctx.stroke();
            } else {
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // 7. Render Floating Text
        floatingTexts.forEach(ft => {
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.fillStyle = ft.color;
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(ft.text, ft.x, ft.y);
            ctx.shadowBlur = 0; // reset
        });

        ctx.restore();
    }

    function renderBackground() {
        // Deep gradient sky
        let gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#05070c');
        gradient.addColorStop(0.5, '#0f172a');
        gradient.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = gradient;
        ctx.fillRect(camera.x, 0, canvas.width, canvas.height);

        // Parallax Mountains (Moves slower than camera)
        ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
        let mountainOffset = camera.x * 0.3;
        ctx.beginPath();
        ctx.moveTo(-mountainOffset, 460);
        ctx.lineTo(300 - mountainOffset, 220);
        ctx.lineTo(700 - mountainOffset, 460);
        ctx.lineTo(1100 - mountainOffset, 180);
        ctx.lineTo(1600 - mountainOffset, 460);
        ctx.lineTo(2100 - mountainOffset, 200);
        ctx.lineTo(2600 - mountainOffset, 460);
        ctx.lineTo(3200 - mountainOffset, 250);
        ctx.lineTo(3600 - mountainOffset, 460);
        ctx.fill();

        // Atmospheric glowing cavern runes or mist
        ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
        ctx.fillRect(camera.x + 200, 100, 150, 200);
        ctx.fillRect(camera.x + 1200, 80, 180, 220);
        ctx.fillRect(camera.x + 2200, 120, 160, 200);
    }

    // Main Game Loop
    function gameLoop() {
        update();
        render();
        requestAnimationFrame(gameLoop);
    }

    // Start loop
    requestAnimationFrame(gameLoop);
});
