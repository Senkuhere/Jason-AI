// Neon Leap - game.js
// A polished 2D platformer written with Canvas and vanilla JS.

// == Setup & Globals ==
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;
let lastTime = performance.now();
let delta = 0;

// Game state
const State = { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', VICTORY: 'victory' };
let gameState = State.MENU;

// Camera
const camera = { x: 0, y: 0, shake: 0 };

// Input
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === 'Escape') togglePause(); if (e.key.toLowerCase() === 'r') restartLevel(); });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// HUD elements
const menu = document.getElementById('menu');
const playBtn = document.getElementById('playBtn');
const controlsBtn = document.getElementById('controlsBtn');
const controlsPanel = document.getElementById('controlsPanel');
const backFromControls = document.getElementById('backFromControls');
const hud = document.getElementById('hud');
const pauseScreen = document.getElementById('pauseScreen');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const menuBtn = document.getElementById('menuBtn');
const victoryScreen = document.getElementById('victoryScreen');
const finalCrystals = document.getElementById('finalCrystals');
const finalTime = document.getElementById('finalTime');
const playAgainBtn = document.getElementById('playAgainBtn');
const menuBtn2 = document.getElementById('menuBtn2');

playBtn.onclick = () => startGame();
controlsBtn.onclick = () => showControls();
backFromControls.onclick = () => showMenu();
pauseBtn.onclick = () => togglePause();
resumeBtn.onclick = () => togglePause();
restartBtn.onclick = () => restartLevel();
menuBtn.onclick = () => backToMenu();
playAgainBtn.onclick = () => { startGame(); hideVictory(); };
menuBtn2.onclick = () => backToMenu();

function showControls(){ menu.classList.add('hidden'); controlsPanel.classList.remove('hidden'); }
function showMenu(){ controlsPanel.classList.add('hidden'); menu.classList.remove('hidden'); }
function showHUD(){ hud.classList.remove('hidden'); }
function hideHUD(){ hud.classList.add('hidden'); }
function showPause(){ pauseScreen.classList.remove('hidden'); }
function hidePause(){ pauseScreen.classList.add('hidden'); }
function showVictory(){ victoryScreen.classList.remove('hidden'); }
function hideVictory(){ victoryScreen.classList.add('hidden'); }

function backToMenu(){ gameState = State.MENU; showMenu(); hideHUD(); hidePause(); hideVictory(); }

// Responsive
window.addEventListener('resize', () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; });

// == Utilities ==
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

// == Level & Entities ==
class Platform{
  constructor(x,y,w,h,opts={}){
    this.x=x;this.y=y;this.w=w;this.h=h;this.type=opts.type||'static';this.range=opts.range||0;this.speed=opts.speed||0;this.dir=1;this.startX=x;this.startY=y;this.glow=opts.glow||false;
  }
  update(dt){
    if(this.type==='moving'){
      this.x = this.startX + Math.sin(performance.now()/1000*this.speed)*this.range;
    }
  }
  draw(ctx,cam){
    // Platform base
    const px = this.x - cam.x; const py = this.y - cam.y;
    // neon edge
    ctx.save();
    const grad = ctx.createLinearGradient(px,py,px+this.w,py+this.h);
    grad.addColorStop(0,'rgba(120,0,255,0.12)');
    grad.addColorStop(1,'rgba(0,200,255,0.08)');
    ctx.fillStyle = '#0f1724';
    roundRect(ctx,px,py,this.w,this.h,6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,0,255,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx,px+2,py+2,this.w-4,this.h-4,6);
    ctx.stroke();
    if(this.glow){ ctx.shadowBlur=20; ctx.shadowColor='rgba(47,230,247,0.25)'; ctx.strokeStyle='rgba(47,230,247,0.25)'; ctx.stroke(); }
    ctx.restore();
  }
}

class Crystal{
  constructor(x,y){ this.x=x;this.y=y;this.r=12;this.collected=false;this.pulse=0; }
  update(dt){ this.pulse += dt*6; }
  draw(ctx,cam){ if(this.collected) return; const x=this.x-cam.x,y=this.y-cam.y; ctx.save(); ctx.translate(x,y); const s = 1+Math.sin(this.pulse)*0.08; ctx.scale(s,s);
    // draw a faceted crystal
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(10,0); ctx.lineTo(0,12); ctx.lineTo(-10,0); ctx.closePath();
    const g = ctx.createLinearGradient(0,-16,0,12); g.addColorStop(0,'#9bf'); g.addColorStop(0.5,'#4ef'); g.addColorStop(1,'#ff5ccf');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore(); }
}

class Hazard{
  constructor(x,y,w,h){ this.x=x;this.y=y;this.w=w;this.h=h; }
  draw(ctx,cam){ const x=this.x-cam.x,y=this.y-cam.y; ctx.save(); ctx.fillStyle='rgba(255,60,80,0.12)'; ctx.fillRect(x,y,this.w,this.h); // spikes
    ctx.fillStyle='rgba(255,60,80,0.3)'; for(let i=0;i<this.w;i+=12){ ctx.beginPath(); ctx.moveTo(x+i,y+this.h); ctx.lineTo(x+i+6,y); ctx.lineTo(x+i+12,y+this.h); ctx.closePath(); ctx.fill(); }
    ctx.restore(); }
}

class Player{
  constructor(x,y){ this.x=x;this.y=y; this.w=28; this.h=36; this.vx=0; this.vy=0; this.speed=0; this.onGround=false; this.jumpBuffer=0; this.coyote=0; this.crystals=0; this.checkpointX=x; this.checkpointY=y; this.alive=true; this.respawnTimer=0; this.landTimer=0; }
  update(dt,level){
    // Input acceleration
    const left = keys['a']||keys['arrowleft'];
    const right = keys['d']||keys['arrowright'];
    const move = (right?1:0) - (left?1:0);
    const accel = 1800; const maxSpeed = 300; const friction = 1500;
    if(move!==0){ this.vx += move*accel*dt; } else { // apply friction
      if(this.vx>0){ this.vx = Math.max(0, this.vx - friction*dt); } else { this.vx = Math.min(0, this.vx + friction*dt); }
    }
    this.vx = clamp(this.vx,-maxSpeed,maxSpeed);

    // jump buffering & coyote
    if(keys[' ']||keys['w']||keys['arrowup']){ this.jumpBuffer = 0.12; } else { this.jumpBuffer -= dt; }
    this.coyote -= dt;
    // gravity
    const gravity = 1800;
    this.vy += gravity*dt;
    // variable jump: if jump key released while going up, reduce upward velocity
    if(!(keys[' ']||keys['w']||keys['arrowup']) && this.vy<0){ this.vy += gravity*dt*0.9; }

    // attempt jump
    if(this.jumpBuffer>0 && this.coyote> -0.12){ // allow if within coyote time
      this.vy = -620; this.onGround=false; this.jumpBuffer=0; this.coyote=0;
    }

    // apply velocity
    this.x += this.vx*dt;
    this.y += this.vy*dt;

    // collisions with platforms
    this.onGround = false;
    for(const p of level.platforms){
      // simple AABB collision
      if(this.x + this.w > p.x && this.x < p.x + p.w && this.y + this.h > p.y && this.y < p.y + p.h){
        // from top
        const prevBottom = this.y + this.h - this.vy*dt;
        if(prevBottom <= p.y){ // landed on platform
          this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.coyote = 0.12; this.landTimer = 0.12; 
        } else { // horizontal collision
          if(this.x < p.x) this.x = p.x - this.w; else this.x = p.x + p.w; this.vx = 0;
        }
      }
    }

    // hazards
    for(const h of level.hazards){ if(this.x + this.w > h.x && this.x < h.x + h.w && this.y + this.h > h.y && this.y < h.y + h.h){ this.respawn(); camera.shake = 8; } }

    // crystals
    for(const c of level.crystals){ if(!c.collected && this.x + this.w/2 > c.x - 12 && this.x + this.w/2 < c.x + 12 && this.y + this.h/2 > c.y - 12 && this.y + this.h/2 < c.y + 12){ c.collected=true; this.crystals++; level.particles.spawnBurst(c.x,c.y,18,['#4ef','#9bf','#ff5ccf']); } }

    // finish gate
    if(this.x + this.w > level.finish.x && this.x < level.finish.x + level.finish.w && this.y + this.h > level.finish.y && this.y < level.finish.y + level.finish.h){ level.finished = true; }

    // basic bounds
    if(this.y > level.levelHeight + 400){ this.respawn(); }

    // update checkpoint
    for(const cp of level.checkpoints){ if(this.x + this.w/2 > cp.x && this.x + this.w/2 < cp.x + cp.w && this.y + this.h/2 > cp.y && this.y + this.h/2 < cp.y + cp.h){ level.currentCheckpoint = cp; this.checkpointX = cp.x + 8; this.checkpointY = cp.y - this.h; }
    }

    if(this.respawnTimer>0){ this.respawnTimer -= dt; }
    if(this.landTimer>0){ this.landTimer -= dt; }
  }
  respawn(){ if(this.respawnTimer>0) return; this.x = this.checkpointX; this.y = this.checkpointY; this.vx=0; this.vy=0; this.respawnTimer = 0.6; }
  draw(ctx,cam){ const x=this.x-cam.x, y=this.y-cam.y;
    ctx.save();
    // squash on land effect
    let sy=1, sx=1;
    if(this.landTimer>0){ sy = lerp(0.85,1,this.landTimer/0.12); sx = lerp(1.12,1,this.landTimer/0.12); }
    // stretch while falling
    if(this.vy < -120) { sy = 0.9; sx = 1.05; }
    if(this.vy > 200) { sy = 1.08; sx = 0.95; }
    ctx.translate(x + this.w/2, y + this.h/2);
    ctx.scale(sx,sy);
    // body
    ctx.fillStyle = '#9bf'; ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    // head
    ctx.fillStyle = '#4ef'; ctx.fillRect(-10, -this.h/2 - 12, 20, 14);
    // eye
    ctx.fillStyle = '#001'; ctx.fillRect(2, -this.h/2 - 8, 4, 6);
    ctx.restore();
  }
}

class ParticleSystem{
  constructor(){ this.particles = []; }
  spawnBurst(x,y,count,colors){ for(let i=0;i<count;i++){ this.particles.push({x,y, vx:(Math.random()-0.5)*300, vy:(Math.random()-0.8)*300, life:0.6 + Math.random()*0.6, col: colors[Math.floor(Math.random()*colors.length)]}); } this.particles = this.particles.slice(-200); }
  update(dt){ for(const p of this.particles){ p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 800*dt; } this.particles = this.particles.filter(p=>p.life>0); }
  draw(ctx,cam){ for(const p of this.particles){ ctx.save(); ctx.globalAlpha = clamp(p.life,0,1); ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x-cam.x, p.y-cam.y, 3,0,Math.PI*2); ctx.fill(); ctx.restore(); } }
}

class Level{
  constructor(){ this.platforms=[]; this.crystals=[]; this.hazards=[]; this.particles=new ParticleSystem(); this.finish={x:2200,y:260,w:60,h:120}; this.checkpoints=[]; this.currentCheckpoint=null; this.levelWidth=2600; this.levelHeight=800; this.finished=false; this.setup(); }
  setup(){ // handcrafted platforms for a single level
    this.platforms = [];
    this.hazards = [];
    this.crystals = [];
    this.checkpoints = [];
    // ground
    this.platforms.push(new Platform(-200,700,5000,120));
    this.platforms.push(new Platform(200,540,220,20));
    this.platforms.push(new Platform(520,440,160,20));
    this.platforms.push(new Platform(720,380,120,20));
    this.platforms.push(new Platform(920,480,260,20));
    this.platforms.push(new Platform(1250,420,160,20,{type:'moving',range:80,speed:1.6,glow:true}));
    this.platforms.push(new Platform(1450,520,320,20));
    this.platforms.push(new Platform(1800,420,120,20));
    this.platforms.push(new Platform(1960,360,160,20));
    this.platforms.push(new Platform(2160,300,120,20));
    // small floating challenging platforms
    this.platforms.push(new Platform(270,300,80,14));
    this.platforms.push(new Platform(360,220,60,14));
    this.platforms.push(new Platform(480,150,60,14));
    // checkpoint halfway
    this.checkpoints.push({x:1200,y:380,w:40,h:80});
    this.currentCheckpoint = this.checkpoints[0];
    // crystals
    this.crystals.push(new Crystal(320,240));
    this.crystals.push(new Crystal(560,400));
    this.crystals.push(new Crystal(1400,470));
    this.crystals.push(new Crystal(2000,320));
    // hazards (spikes)
    this.hazards.push(new Hazard(1000,700,120,40));
    this.hazards.push(new Hazard(2100,700,160,40));
    // finish
    this.finish = {x:2320,y:220,w:80,h:180};
    this.levelWidth = 2600; this.levelHeight=900;
  }
  update(dt){ for(const p of this.platforms) p.update(dt); this.particles.update(dt); for(const c of this.crystals) c.update(dt); }
  draw(ctx,cam){ // background parallax layers
    drawBackground(ctx,cam);
    // platforms
    for(const p of this.platforms) p.draw(ctx,cam);
    // hazards
    for(const h of this.hazards) h.draw(ctx,cam);
    // crystals
    for(const c of this.crystals) c.draw(ctx,cam);
    // finish gate
    ctx.save(); const fx=this.finish.x-cam.x, fy=this.finish.y-cam.y; ctx.fillStyle='#2b0b3a'; roundRect(ctx,fx,fy,this.finish.w,this.finish.h,8); ctx.fill(); ctx.strokeStyle='rgba(255,80,180,0.7)'; ctx.lineWidth=3; ctx.stroke(); ctx.restore();
    // checkpoints
    for(const cp of this.checkpoints){ ctx.save(); const x=cp.x-cam.x,y=cp.y-cam.y; ctx.fillStyle='rgba(127,0,255,0.08)'; ctx.fillRect(x,y,cp.w,cp.h); ctx.strokeStyle='rgba(127,0,255,0.3)'; ctx.strokeRect(x,y,cp.w,cp.h); ctx.restore(); }
    // particles
    this.particles.draw(ctx,cam);
  }
}

// background draw
function drawBackground(ctx,cam){
  // sky gradient
  const g = ctx.createLinearGradient(0,0,0,height);
  g.addColorStop(0,'#06061a'); g.addColorStop(0.5,'#1b0630'); g.addColorStop(1,'#0b1020'); ctx.fillStyle = g; ctx.fillRect(0,0,width,height);
  // moon / sunset
  const mx = width*0.8 - cam.x*0.05; const my = 140; const mr = 140;
  const mg = ctx.createRadialGradient(mx,my,mr*0.1,mx,my,mr);
  mg.addColorStop(0,'#ff8ecf'); mg.addColorStop(0.5,'#a24eff'); mg.addColorStop(1,'rgba(120,0,255,0.06)'); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx,my,mr,0,Math.PI*2); ctx.fill();
  // mountains layers
  ctx.save(); ctx.translate(-cam.x*0.1, 30 - cam.y*0.02);
  drawMountains(ctx,'#0f1330','#20123f', 0.3);
  ctx.restore();
  ctx.save(); ctx.translate(-cam.x*0.2, 60 - cam.y*0.05);
  drawMountains(ctx,'#120d2b','#2b0b3a', 0.5);
  ctx.restore();
  // stars
  for(let i=0;i<50;i++){ ctx.fillStyle = (i%7===0? '#9bf':'#8aa'); ctx.fillRect((i*37 + (cam.x*0.02))%width, 40 + (i*17)%200, 1,1); }
}
function drawMountains(ctx,c1,c2,alpha){ ctx.save(); ctx.fillStyle=c1; ctx.beginPath(); ctx.moveTo(0, height); for(let i=0;i<6;i++){ const x = i*(width/5); const y = height*0.5 + Math.sin(i*1.3)*140; ctx.lineTo(x,y); } ctx.lineTo(width, height); ctx.closePath(); ctx.globalAlpha = alpha; ctx.fill(); ctx.restore(); }

// helpers
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// Game instance
let level, player, startTime;
function startGame(){ menu.classList.add('hidden'); hideVictory(); level = new Level(); player = new Player(100,520); showHUD(); gameState = State.PLAYING; camera.x = 0; camera.y = 0; startTime = performance.now(); lastTime = performance.now(); requestAnimationFrame(run); }

function restartLevel(){ if(!level) return; level.setup(); player = new Player(level.currentCheckpoint? level.currentCheckpoint.x + 8 : 100, level.currentCheckpoint? level.currentCheckpoint.y - 60:520); }

function togglePause(){ if(gameState===State.PLAYING){ gameState=State.PAUSED; showPause(); } else if(gameState===State.PAUSED){ gameState=State.PLAYING; hidePause(); lastTime = performance.now(); requestAnimationFrame(run); } }

function run(now){ if(gameState!==State.PLAYING) return; const dt = Math.min(0.033, (now - lastTime)/1000); lastTime = now;
  update(dt);
  render();
  if(level.finished){ // show victory
    gameState = State.VICTORY; finalCrystals.textContent = player.crystals; finalTime.textContent = ((performance.now()-startTime)/1000).toFixed(1); showVictory(); hideHUD(); return; }
  requestAnimationFrame(run);
}

function update(dt){ level.update(dt); player.update(dt,level);
  // camera follow
  const targetX = player.x + player.w/2 - width*0.45; camera.x = lerp(camera.x, targetX, 6*dt); camera.x = clamp(camera.x, -200, level.levelWidth - width + 200);
  // shake
  if(camera.shake>0){ camera.shake = Math.max(0, camera.shake - 60*dt); }
}

function render(){ // clear
  ctx.clearRect(0,0,width,height);
  ctx.save(); // apply camera shake
  const sx = (Math.random()-0.5)*camera.shake; const sy = (Math.random()-0.5)*camera.shake;
  ctx.translate(sx,sy);
  level.draw(ctx,camera);
  player.draw(ctx,camera);
  // progress bar
  drawProgress(ctx);
  ctx.restore();
  // HUD overlays
  document.getElementById('crystalCount').textContent = player.crystals;
}

function drawProgress(ctx){ // small bar top right
  const progress = clamp((player.x)/(level.levelWidth - width*0.5),0,1);
  const bw = 220, bh=10; const bx = width - bw - 24, by=24;
  ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle='rgba(255,255,255,0.06)'; roundRect(ctx,bx,by,bw,bh,6); ctx.fill(); ctx.fillStyle='rgba(50,200,255,0.16)'; roundRect(ctx,bx+2,by+2,(bw-4)*progress,bh-4,6); ctx.fill(); ctx.strokeStyle='rgba(160,80,255,0.4)'; ctx.lineWidth=2; roundRect(ctx,bx,by,bw,bh,6); ctx.stroke(); ctx.restore(); }

// initial draw for menu background animation
(function animateMenuBg(t){ if(gameState===State.MENU){ // simple animated background
    level = level || new Level(); level.update(0.016); ctx.clearRect(0,0,width,height); level.draw(ctx,camera); requestAnimationFrame(animateMenuBg); } })();

// Expose restart via global for keyboard R
window.restartLevel = restartLevel;

// Prevent accidental multiple loops when resuming

// end of file
