const canvas = document.getElementById('flowerCanvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

// Helper: draw a petal shape using bezier curves
function drawPetal(x, y, angle, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(30, -10, 60, -80, 0, -140);
  ctx.bezierCurveTo(-60, -80, -30, -10, 0, 0);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, -140, 0, 20);
  grad.addColorStop(0, '#ffd6ea');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, '#ffb3d9');

  ctx.fillStyle = grad;
  ctx.fill();

  // soft highlight
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.ellipse(-10, -80, 30, 70, -0.6, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

function drawStem(x, y, length, sway) {
  ctx.save();
  ctx.strokeStyle = '#6b8e23';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway, y + length/2, x, y + length);
  ctx.stroke();
  ctx.restore();
}

let particles = [];

function spawnParticles(cx, cy) {
  for (let i = 0; i < 18; i++) {
    particles.push({
      x: cx + (Math.random()-0.5)*120,
      y: cy + (Math.random()-0.5)*120,
      vx: (Math.random()-0.5)*0.6,
      vy: (Math.random()-1.5)*0.6,
      size: Math.random()*3 + 2,
      life: Math.random()*60 + 60,
      color: `rgba(255,${120+Math.floor(Math.random()*120)},${160+Math.floor(Math.random()*80)},${0.7+Math.random()*0.3})`
    });
  }
}

function drawParticles() {
  for (let i = particles.length-1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
    ctx.fill();
    if (p.life <= 0) particles.splice(i,1);
  }
}

function drawBouquet() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 - 40;
  const time = Date.now() * 0.001;

  // slight floating motion
  const float = Math.sin(time*0.9) * 6;

  // draw card background softly
  ctx.save();
  ctx.translate(cx, cy + float);

  // stems
  drawStem(-80, 80, 220, -20 + Math.sin(time*0.8)*8);
  drawStem(0, 80, 240, Math.sin(time*0.7)*10);
  drawStem(80, 80, 210, 18 + Math.sin(time*0.85)*7);

  // main cluster of blossoms
  const bouquetCenterX = 0;
  const bouquetCenterY = -20;

  const petalColors = ['#ff69b4','#ff85c4','#ffc0dd','#ff4da6','#ffbfdc'];

  // draw multiple flowers to form bouquet
  const flowerCount = 7;
  for (let f = 0; f < flowerCount; f++) {
    const angle = (f / flowerCount) * Math.PI * 2 + f*0.2;
    const radius = 10 + f*40;
    const fx = bouquetCenterX + Math.cos(angle + time*0.2) * radius;
    const fy = bouquetCenterY + Math.sin(angle + time*0.15) * radius - (f%2===0?10:0);
    const scale = 0.9 + (f%3)*0.15;

    // petals per flower
    const petals = 8 + (f%4);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI*2 + time*0.4*(0.6 - f/10);
      const px = fx + Math.cos(a) * 30 * scale;
      const py = fy + Math.sin(a) * 30 * scale;
      drawPetal(px, py, a + Math.PI/2, 0.8*scale, petalColors[(i+f) % petalColors.length]);
    }

    // center of each blossom
    ctx.beginPath();
    ctx.fillStyle = '#ffd166';
    ctx.arc(fx, fy, 12*scale, 0, Math.PI*2);
    ctx.fill();

    // occasional sparkle particles
    if (Math.random() < 0.04) spawnParticles(cx + fx, cy + fy + float);
  }

  // wrap ribbon
  ctx.save();
  ctx.translate(0, 140);
  ctx.rotate(Math.PI/10);
  ctx.fillStyle = 'linear-gradient(90deg, #ff6aa6, #ff9ac8)';
  // draw simple ribbon band
  ctx.fillStyle = '#ff6aa6';
  ctx.beginPath();
  ctx.moveTo(-120, 0);
  ctx.quadraticCurveTo(-20, 40, 0, 20);
  ctx.quadraticCurveTo(40, 5, 120, 60);
  ctx.lineTo(120, 90);
  ctx.quadraticCurveTo(40, 70, 0, 80);
  ctx.quadraticCurveTo(-20, 70, -120, 90);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // soft overlay
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawParticles();

  requestAnimationFrame(drawBouquet);
}

// initial particles
spawnParticles(canvas.width/2, canvas.height/2);

drawBouquet();
