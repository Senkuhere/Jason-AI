// Soothing Orb Garden - Smooth 2D Canvas Game
// Designed for silky smooth 60fps animations, mobile & desktop responsiveness.

class OrbGarden {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.orbs = [];
        this.particles = [];
        this.ripples = [];
        this.score = 0;
        this.isRunning = false;
        this.isPaused = false;
        
        this.maxOrbs = 18;
        this.spawnTimer = 0;
        this.spawnInterval = 120; // frames (~2s at 60fps)

        this.initDimensions();
        this.bindEvents();
    }

    initDimensions() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        // Keep the CSS size in device-independent pixels and set the backing store size with DPR
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        // Reset any transform then scale so repeated resizes don't compound the scale
        if (this.ctx.setTransform) {
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else if (this.ctx.resetTransform) {
            this.ctx.resetTransform();
            this.ctx.scale(dpr, dpr);
        } else {
            // Fallback
            this.ctx.scale(dpr, dpr);
        }
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.initDimensions();
        });

        document.getElementById('startButton').addEventListener('click', () => {
            this.startGame();
        });

        document.getElementById('pauseButton').addEventListener('click', () => {
            this.togglePause();
        });

        document.getElementById('resumeButton').addEventListener('click', () => {
            this.togglePause();
        });

        document.getElementById('restartButton').addEventListener('click', () => {
            this.resetGame();
        });

        // Click / Touch interaction
        const handleInteraction = (clientX, clientY) => {
            if (!this.isRunning || this.isPaused) return;

            // Check if tapped an orb
            let hit = false;
            for (let i = this.orbs.length - 1; i >= 0; i--) {
                const orb = this.orbs[i];
                const dx = clientX - orb.x;
                const dy = clientY - orb.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < orb.radius + 10) {
                    this.popOrb(orb, i);
                    hit = true;
                    break;
                }
            }

            // If tapped empty space, create a gentle ripple and spawn a small orb
            if (!hit) {
                this.addRipple(clientX, clientY);
                if (this.orbs.length < this.maxOrbs + 5) {
                    this.orbs.push(new Orb(clientX, clientY, Math.random() * 10 + 15, true));
                }
            }
        };

        this.canvas.addEventListener('click', (e) => {
            handleInteraction(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                handleInteraction(touch.clientX, touch.clientY);
                e.preventDefault();
            }
        }, { passive: false });
    }

    startGame() {
        document.getElementById('welcomeOverlay').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        this.isRunning = true;
        this.score = 0;
        this.orbs = [];
        this.particles = [];
        this.ripples = [];

        // Initial set of relaxing orbs
        for (let i = 0; i < 8; i++) {
            this.spawnRandomOrb();
        }

        this.updateHUD();
        requestAnimationFrame(() => this.loop());
    }

    togglePause() {
        if (!this.isRunning) return;
        this.isPaused = !this.isPaused;
        const pauseOverlay = document.getElementById('pauseOverlay');
        if (this.isPaused) {
            pauseOverlay.classList.remove('hidden');
        } else {
            pauseOverlay.classList.add('hidden');
            requestAnimationFrame(() => this.loop());
        }
    }

    resetGame() {
        document.getElementById('pauseOverlay').classList.add('hidden');
        this.score = 0;
        this.orbs = [];
        this.particles = [];
        this.ripples = [];
        for (let i = 0; i < 8; i++) {
            this.spawnRandomOrb();
        }
        this.updateHUD();
        this.isPaused = false;
        requestAnimationFrame(() => this.loop());
    }

    spawnRandomOrb() {
        const radius = Math.random() * 16 + 18; // radius 18 to 34
        const x = Math.random() * (this.width - radius * 2) + radius;
        const y = Math.random() * (this.height - radius * 2) + radius;
        this.orbs.push(new Orb(x, y, radius));
    }

    popOrb(orb, index) {
        this.orbs.splice(index, 1);
        this.score += Math.round(orb.radius);
        this.updateHUD();

        // Create burst particles
        const particleCount = 16;
        for (let i = 0; i < particleCount; i++) {
            this.particles.push(new Particle(orb.x, orb.y, orb.color));
        }

        // Add satisfying ripple
        this.ripples.push(new Ripple(orb.x, orb.y, orb.color));

        // Spawn 1 or 2 new orbs to maintain garden life
        if (this.orbs.length < this.maxOrbs) {
            this.spawnRandomOrb();
            if (Math.random() > 0.5) this.spawnRandomOrb();
        }
    }

    addRipple(x, y) {
        this.ripples.push(new Ripple(x, y, '#22d3ee'));
    }

    updateHUD() {
        document.getElementById('scoreVal').textContent = this.score;
        document.getElementById('orbCountVal').textContent = this.orbs.length;
    }

    update() {
        if (!this.isRunning || this.isPaused) return;

        // Auto spawn timer
        this.spawnTimer++;
        if (this.spawnTimer >= this.spawnInterval && this.orbs.length < this.maxOrbs) {
            this.spawnRandomOrb();
            this.spawnTimer = 0;
        }

        // Update orbs
        for (let i = 0; i < this.orbs.length; i++) {
            this.orbs[i].update(this.width, this.height);
        }

        // Orb-to-orb gentle repulsion & merging check
        for (let i = 0; i < this.orbs.length; i++) {
            for (let j = i + 1; j < this.orbs.length; j++) {
                const o1 = this.orbs[i];
                const o2 = this.orbs[j];
                const dx = o2.x - o1.x;
                const dy = o2.y - o1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = o1.radius + o2.radius + 10;

                if (dist < minDist) {
                    // Gentle push apart
                    const angle = Math.atan2(dy, dx);
                    const push = (minDist - dist) * 0.03;
                    o1.vx -= Math.cos(angle) * push;
                    o1.vy -= Math.sin(angle) * push;
                    o2.vx += Math.cos(angle) * push;
                    o2.vy += Math.sin(angle) * push;
                }
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update();
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update ripples
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.update();
            if (r.alpha <= 0) {
                this.ripples.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw connecting ethereal threads between close orbs
        this.ctx.lineWidth = 0.8;
        for (let i = 0; i < this.orbs.length; i++) {
            for (let j = i + 1; j < this.orbs.length; j++) {
                const o1 = this.orbs[i];
                const o2 = this.orbs[j];
                const dx = o2.x - o1.x;
                const dy = o2.y - o1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 180) {
                    const alpha = (1 - dist / 180) * 0.2;
                    this.ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(o1.x, o1.y);
                    this.ctx.lineTo(o2.x, o2.y);
                    this.ctx.stroke();
                }
            }
        }

        // Draw ripples
        for (const r of this.ripples) {
            r.draw(this.ctx);
        }

        // Draw orbs
        for (const orb of this.orbs) {
            orb.draw(this.ctx);
        }

        // Draw particles
        for (const p of this.particles) {
            p.draw(this.ctx);
        }
    }

    loop() {
        if (!this.isRunning) return;
        this.update();
        this.draw();
        if (!this.isPaused) {
            requestAnimationFrame(() => this.loop());
        }
    }
}

class Orb {
    constructor(x, y, radius, isSpawnedByTap = false) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.baseRadius = radius;
        
        // Gentle drift velocity
        const speed = Math.random() * 0.6 + 0.2;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // Pulse animation offset
        this.pulseSpeed = Math.random() * 0.04 + 0.02;
        this.pulseAngle = Math.random() * Math.PI * 2;

        // Color theme (cyan / teal / blue shades)
        const colors = [
            { core: '#a5f3fc', mid: '#06b6d4', dark: '#0e7490' },
            { core: '#67e8f9', mid: '#0891b2', dark: '#155e75' },
            { core: '#cffafe', mid: '#22d3ee', dark: '#0891b2' }
        ];
        this.colorSet = colors[Math.floor(Math.random() * colors.length)];
        
        if (isSpawnedByTap) {
            this.radius = 5;
            this.targetRadius = this.baseRadius;
        } else {
            this.targetRadius = this.baseRadius;
        }
    }

    update(width, height) {
        // Smooth growth if newly spawned
        if (this.radius < this.targetRadius) {
            this.radius += (this.targetRadius - this.radius) * 0.1;
        }

        // Subtle pulsing
        this.pulseAngle += this.pulseSpeed;
        const currentRadius = this.radius + Math.sin(this.pulseAngle) * 2;

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Soft bounce off walls
        const margin = currentRadius;
        if (this.x < margin) { this.x = margin; this.vx *= -1; }
        if (this.x > width - margin) { this.x = width - margin; this.vx *= -1; }
        if (this.y < margin) { this.y = margin; this.vy *= -1; }
        if (this.y > height - margin) { this.y = height - margin; this.vy *= -1; }

        // Slight drag/friction to prevent speed buildup
        this.vx *= 0.995;
        this.vy *= 0.995;

        // Minimum drift enforcement
        if (Math.abs(this.vx) < 0.2) this.vx += (Math.random() - 0.5) * 0.05;
        if (Math.abs(this.vy) < 0.2) this.vy += (Math.random() - 0.5) * 0.05;

        this.currentRadius = currentRadius;
    }

    draw(ctx) {
        const r = this.currentRadius || this.radius;

        // Outer glow
        const gradient = ctx.createRadialGradient(
            this.x - r * 0.3, this.y - r * 0.3, r * 0.1,
            this.x, this.y, r
        );
        gradient.addColorStop(0, this.colorSet.core);
        gradient.addColorStop(0.5, this.colorSet.mid);
        gradient.addColorStop(1, this.colorSet.dark);

        ctx.save();
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 18;

        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Inner specular highlight
        ctx.beginPath();
        ctx.arc(this.x - r * 0.35, this.y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, colorSet) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.radius = Math.random() * 3 + 1.5;
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.015;
        this.color = (colorSet && colorSet.core) ? colorSet.core : '#a5f3fc';
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Ripple {
    constructor(x, y, color = '#22d3ee') {
        this.x = x;
        this.y = y;
        this.radius = 5;
        this.maxRadius = 60;
        this.alpha = 0.8;
        this.color = color;
    }

    update() {
        this.radius += 2.5;
        this.alpha -= 0.03;
    }

    draw(ctx) {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    window.orbGarden = new OrbGarden();
});
