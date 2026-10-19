"""
Neon Rift - Main entry point
Stage 1+2 prototype: window, loop, arena, player movement, camera, basic HUD,
projectiles, simple enemies, collisions, and XP orbs.

Run: python main.py
Stage 3 additions: pause menu, level-up modal with choices, basic ability framework
"""

import os
import sys
import math
import random
import json
import time
from pathlib import Path

try:
    import pygame
    from pygame import gfxdraw
except Exception as e:
    print("Pygame is required to run this game. Install with: python -m pip install pygame")
    raise

# Basic config
BASE_DIR = Path(__file__).resolve().parent
SCREEN_W, SCREEN_H = 1280, 720
ARENA_W, ARENA_H = 2400, 1600  # large arena
TARGET_FPS = 60

# Colors
COLOR_BG = (8, 10, 20)
COLOR_DEEP = (6, 12, 30)
COLOR_CYAN = (54, 246, 255)
COLOR_CYAN_DIM = (24, 120, 140)
COLOR_MAGENTA = (255, 50, 200)
COLOR_RED = (255, 80, 80)
COLOR_ORANGE = (255, 160, 60)
COLOR_PURPLE = (180, 80, 220)
COLOR_GREEN = (80, 255, 140)
COLOR_UI = (50, 200, 220)
WHITE = (255, 255, 255)

# Utility functions

def clamp(v, a, b):
    return max(a, min(b, v))


def lerp(a, b, t):
    return a + (b - a) * t


# Camera
class Camera:
    def __init__(self, w, h):
        self.x = 0
        self.y = 0
        self.w = w
        self.h = h
        self.smooth = 8.0

    def update(self, dt, target_x, target_y):
        tx = clamp(target_x - self.w // 2, 0, ARENA_W - self.w)
        ty = clamp(target_y - self.h // 2, 0, ARENA_H - self.h)
        self.x = lerp(self.x, tx, clamp(self.smooth * dt, 0, 1))
        self.y = lerp(self.y, ty, clamp(self.smooth * dt, 0, 1))


# Basic GameObject
class GameObject:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.dead = False

    def update(self, dt):
        pass

    def draw(self, surf, cam):
        pass


# Ability system
class Ability:
    def __init__(self, id, name, kind='active', desc='', cooldown=5.0, duration=0.0):
        self.id = id
        self.name = name
        self.kind = kind  # 'active' or 'passive'
        self.desc = desc
        self.cooldown_max = cooldown
        self.cooldown = 0.0
        self.duration = duration

    def ready(self):
        return self.cooldown <= 0.0

    def start_cooldown(self):
        self.cooldown = self.cooldown_max

    def update(self, dt):
        if self.cooldown > 0:
            self.cooldown -= dt


# Player
class Player(GameObject):
    def __init__(self, x, y):
        super().__init__(x, y)
        self.vx = 0.0
        self.vy = 0.0
        self.speed = 420.0  # units per second
        self.radius = 18
        self.color = COLOR_CYAN
        self.health = 100
        self.max_health = 100
        self.invuln = 0.0
        self.dash_cool = 0.0
        self.dash_cool_max = 1.8
        self.dash_speed = 900
        self.dashing = 0.0
        self.fire_cool = 0.0
        self.fire_rate = 0.14
        self.projectiles = []
        self.damage = 14
        self.knockback = 200
        self.level = 1
        self.xp = 0
        self.next_xp = 50
        self.orb_radius = 28
        # abilities: slot-based (1-3)
        self.ability_slots = [None, None, None]

    def screen_pos(self, cam):
        return self.x - cam.x, self.y - cam.y

    def aim_angle(self, mx, my, cam):
        sx, sy = self.screen_pos(cam)
        return math.atan2(my - sy, mx - sx)

    def add_ability(self, ability):
        # try to place in first empty slot
        for i in range(3):
            if self.ability_slots[i] is None:
                self.ability_slots[i] = ability
                return i
        # if full, replace a random slot
        idx = random.randint(0, 2)
        self.ability_slots[idx] = ability
        return idx

    def use_ability(self, idx, game):
        if idx < 0 or idx >= 3:
            return False
        a = self.ability_slots[idx]
        if a is None or not a.ready():
            return False
        # implement basic ability effects by id
        if a.id == 'blink':
            # teleport forward a short distance
            mx, my = pygame.mouse.get_pos()
            ang = self.aim_angle(mx, my, game.cam)
            dist = 180
            self.x += math.cos(ang) * dist
            self.y += math.sin(ang) * dist
            # clamp
            self.x = clamp(self.x, self.radius + 10, ARENA_W - self.radius - 10)
            self.y = clamp(self.y, self.radius + 10, ARENA_H - self.radius - 10)
            a.start_cooldown()
            return True
        elif a.id == 'shield':
            # brief invulnerability
            self.invuln = max(self.invuln, 0.9)
            a.start_cooldown()
            return True
        elif a.id == 'charged_shot':
            # fire a high damage projectile
            mx, my = pygame.mouse.get_pos()
            ang = self.aim_angle(mx, my, game.cam)
            speed = 1100
            px = self.x + math.cos(ang) * (self.radius + 10)
            py = self.y + math.sin(ang) * (self.radius + 10)
            p = Projectile(px, py, ang, speed, int(self.damage * 3.0), owner='player', ttl=1.6, radius=8, color=COLOR_ORANGE)
            projectiles.append(p)
            a.start_cooldown()
            return True
        return False

    def update(self, dt, inputs, mx, my, cam, projectiles):
        if self.dead:
            return
        ax = ay = 0
        keys = inputs
        if keys[pygame.K_w]:
            ay -= 1
        if keys[pygame.K_s]:
            ay += 1
        if keys[pygame.K_a]:
            ax -= 1
        if keys[pygame.K_d]:
            ax += 1
        # normalize
        mag = math.hypot(ax, ay)
        if mag > 0:
            ax /= mag
            ay /= mag
        target_vx = ax * self.speed
        target_vy = ay * self.speed
        accel = 14.0
        self.vx = lerp(self.vx, target_vx, clamp(accel * dt, 0, 1))
        self.vy = lerp(self.vy, target_vy, clamp(accel * dt, 0, 1))

        # dash
        if self.dash_cool > 0:
            self.dash_cool -= dt
        if self.dashing > 0:
            # dash active
            self.dashing -= dt
            self.x += self.dash_dir_x * self.dash_speed * dt
            self.y += self.dash_dir_y * self.dash_speed * dt
        else:
            self.x += self.vx * dt
            self.y += self.vy * dt

        if keys[pygame.K_SPACE] and self.dash_cool <= 0 and (self.vx != 0 or self.vy != 0):
            self.dashing = 0.18
            l = math.hypot(self.vx, self.vy)
            if l == 0:
                self.dash_dir_x, self.dash_dir_y = 0, 0
            else:
                self.dash_dir_x = self.vx / l
                self.dash_dir_y = self.vy / l
            self.dash_cool = self.dash_cool_max

        # firing
        if self.fire_cool > 0:
            self.fire_cool -= dt
        if inputs and pygame.mouse.get_pressed()[0]:
            if self.fire_cool <= 0:
                ang = self.aim_angle(mx, my, cam)
                speed = 820
                px = self.x + math.cos(ang) * (self.radius + 8)
                py = self.y + math.sin(ang) * (self.radius + 8)
                projectile = Projectile(px, py, ang, speed, self.damage, owner='player')
                projectiles.append(projectile)
                self.fire_cool = self.fire_rate

        # clamp to arena
        self.x = clamp(self.x, self.radius + 10, ARENA_W - self.radius - 10)
        self.y = clamp(self.y, self.radius + 10, ARENA_H - self.radius - 10)

        # invuln
        if self.invuln > 0:
            self.invuln -= dt

        # update ability cooldowns
        for a in self.ability_slots:
            if a is not None:
                a.update(dt)

    def draw(self, surf, cam, t):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        # glow
        for i in range(3, 0, -1):
            s = int(self.radius * (1 + i * 0.18))
            pygame.gfxdraw.filled_circle(surf, sx, sy, s, (10, 60, 80, 40))
        # body - layered geometric
        pygame.gfxdraw.filled_trigon(surf, sx, sy - 2, sx - 12, sy + 12, sx + 12, sy + 12, COLOR_CYAN)
        pygame.gfxdraw.aatrigon(surf, sx, sy - 2, sx - 12, sy + 12, sx + 12, sy + 12, (150, 200, 255))
        # core
        core_r = 6 + int(math.sin(t * 7) * 1.5)
        pygame.gfxdraw.filled_circle(surf, sx, sy + 2, core_r, COLOR_CYAN)
        pygame.gfxdraw.aacircle(surf, sx, sy + 2, core_r + 2, COLOR_CYAN_DIM)
        # draw ability cooldowns on HUD near bottom-right
        for i in range(3):
            bx = SCREEN_W - 140 + i * 44
            by = SCREEN_H - 58
            pygame.draw.rect(surf, (18, 20, 24), (bx - 2, by - 2, 40, 40))
            if self.ability_slots[i] is None:
                txt = pygame.font.SysFont('Consolas', 18).render(str(i+1), True, (120,120,120))
                surf.blit(txt, (bx + 12, by + 10))
            else:
                a = self.ability_slots[i]
                # background
                pygame.draw.rect(surf, (30, 40, 50), (bx, by, 36, 36))
                # simple icon: first letter
                icon = pygame.font.SysFont('Consolas', 18).render(a.name[0], True, WHITE)
                surf.blit(icon, (bx + 10, by + 6))
                # cooldown overlay
                if a.cooldown > 0:
                    h = int((a.cooldown / max(1e-6, a.cooldown_max)) * 36)
                    s = pygame.Surface((36, 36), pygame.SRCALPHA)
                    s.fill((6, 6, 8, 180))
                    surf.blit(s, (bx, by))
                    txt = pygame.font.SysFont('Consolas', 14).render(f'{int(a.cooldown)}', True, (240,200,200))
                    surf.blit(txt, (bx + 8, by + 10))


# Projectile
class Projectile(GameObject):
    def __init__(self, x, y, ang, speed, damage, owner='enemy', ttl=2.5, radius=5, color=COLOR_CYAN):
        super().__init__(x, y)
        self.vx = math.cos(ang) * speed
        self.vy = math.sin(ang) * speed
        self.damage = damage
        self.owner = owner
        self.ttl = ttl
        self.radius = radius
        self.color = color
        self.bounces = 0

    def update(self, dt):
        self.ttl -= dt
        if self.ttl <= 0:
            self.dead = True
            return
        self.x += self.vx * dt
        self.y += self.vy * dt
        # arena bounds
        if self.x < 0 or self.y < 0 or self.x > ARENA_W or self.y > ARENA_H:
            self.dead = True

    def draw(self, surf, cam):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        pygame.gfxdraw.filled_circle(surf, sx, sy, self.radius, self.color)
        pygame.gfxdraw.aacircle(surf, sx, sy, self.radius + 1, (200, 255, 255))


# Enemy base
class Enemy(GameObject):
    def __init__(self, x, y, hp=30, speed=120, color=COLOR_MAGENTA, radius=16):
        super().__init__(x, y)
        self.hp = hp
        self.max_hp = hp
        self.speed = speed
        self.color = color
        self.radius = radius
        self.hit_flash = 0.0
        self.type = 'enemy'
        self.damage = 8

    def take_damage(self, amount, source=None):
        self.hp -= amount
        self.hit_flash = 0.12
        if self.hp <= 0:
            self.dead = True

    def update(self, dt, player, projectiles, enemies):
        # decrement hit flash timer here (dt is available in update)
        if self.hit_flash > 0:
            self.hit_flash -= dt

    def draw(self, surf, cam):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        col = self.color
        if self.hit_flash > 0:
            col = (255, 255, 255)
        # layered silhouette
        pygame.gfxdraw.filled_circle(surf, sx, sy, self.radius + 4, (20, 20, 30, 60))
        pygame.gfxdraw.filled_circle(surf, sx, sy, self.radius, col)
        pygame.gfxdraw.aacircle(surf, sx, sy, self.radius + 1, (255, 255, 255))
        # hp bar
        hp_w = int((self.hp / self.max_hp) * (self.radius * 2))
        pygame.draw.rect(surf, (30, 30, 40), (sx - self.radius, sy - self.radius - 10, self.radius * 2, 6))
        pygame.draw.rect(surf, (50, 200, 220), (sx - self.radius, sy - self.radius - 10, hp_w, 6))


class Chaser(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, hp=28, speed=120, color=COLOR_MAGENTA, radius=14)
        self.type = 'chaser'

    def update(self, dt, player, projectiles, enemies):
        dx = player.x - self.x
        dy = player.y - self.y
        d = math.hypot(dx, dy)
        if d > 1:
            self.x += (dx / d) * self.speed * dt
            self.y += (dy / d) * self.speed * dt
        # contact damage
        if d < self.radius + player.radius:
            player_take_damage(player, self.damage, self)


class Dasher(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, hp=36, speed=90, color=COLOR_ORANGE, radius=16)
        self.type = 'dasher'
        self.state = 'idle'
        self.timer = random.uniform(0.6, 1.6)
        self.charge_dir = (0, 0)
        self.charge_speed = 700

    def update(self, dt, player, projectiles, enemies):
        self.timer -= dt
        dx = player.x - self.x
        dy = player.y - self.y
        d = math.hypot(dx, dy)
        if self.state == 'idle':
            # slow roam
            if d > 1:
                self.x += (dx / d) * (self.speed * 0.6) * dt
                self.y += (dy / d) * (self.speed * 0.6) * dt
            if self.timer <= 0:
                self.state = 'telegraph'
                self.timer = 0.45
                # dir towards player
                if d > 1:
                    self.charge_dir = (dx / d, dy / d)
        elif self.state == 'telegraph':
            # flash indicator handled in draw
            if self.timer <= 0:
                self.state = 'charge'
                self.timer = 0.18
        elif self.state == 'charge':
            self.x += self.charge_dir[0] * self.charge_speed * dt
            self.y += self.charge_dir[1] * self.charge_speed * dt
            if self.timer <= 0:
                self.state = 'idle'
                self.timer = random.uniform(0.6, 1.6)
        # contact
        if d < self.radius + player.radius:
            player_take_damage(player, int(self.damage * 1.4), self)

    def draw(self, surf, cam):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        pygame.gfxdraw.filled_circle(surf, sx, sy, self.radius + 6, (25, 18, 26))
        pygame.gfxdraw.filled_circle(surf, sx, sy, self.radius, self.color)
        # telegraph
        if getattr(self, 'state', None) == 'telegraph':
            # draw a directional triangle
            dx, dy = self.charge_dir
            ang = math.atan2(dy, dx)
            tx = sx + math.cos(ang) * (self.radius + 24)
            ty = sy + math.sin(ang) * (self.radius + 24)
            pygame.gfxdraw.filled_trigon(surf, sx + int(dx * 6), sy + int(dy * 6), int(tx), int(ty), sx - int(dy * 6), sy + int(dx * 6), (255,140,80))


class Ranged(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, hp=26, speed=80, color=COLOR_RED, radius=15)
        self.type = 'ranged'
        self.attack_cool = random.uniform(1.0, 2.0)

    def update(self, dt, player, projectiles, enemies):
        self.attack_cool -= dt
        dx = player.x - self.x
        dy = player.y - self.y
        d = math.hypot(dx, dy)
        # maintain distance
        desired = 280
        if d < desired - 20:
            # back away
            if d > 1:
                self.x -= (dx / d) * self.speed * dt
                self.y -= (dy / d) * self.speed * dt
        elif d > desired + 30:
            if d > 1:
                self.x += (dx / d) * self.speed * dt
                self.y += (dy / d) * self.speed * dt
        if self.attack_cool <= 0 and d < 700:
            ang = math.atan2(dy, dx)
            p = Projectile(self.x, self.y, ang, 420, 12, owner='enemy', color=COLOR_RED)
            projectiles.append(p)
            self.attack_cool = random.uniform(1.2, 2.0)
        # contact
        if d < self.radius + player.radius:
            player_take_damage(player, int(self.damage * 1.1), self)


class Tank(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, hp=120, speed=48, color=COLOR_PURPLE, radius=28)
        self.type = 'tank'
        self.damage = 24

    def update(self, dt, player, projectiles, enemies):
        dx = player.x - self.x
        dy = player.y - self.y
        d = math.hypot(dx, dy)
        if d > 1:
            self.x += (dx / d) * self.speed * dt
            self.y += (dy / d) * self.speed * dt
        if d < self.radius + player.radius:
            player_take_damage(player, self.damage, self)


class Swarm(Enemy):
    def __init__(self, x, y):
        super().__init__(x, y, hp=12, speed=180, color=COLOR_RED, radius=10)
        self.type = 'swarm'
        self.wiggle = random.random() * 10

    def update(self, dt, player, projectiles, enemies):
        self.wiggle += dt * 12
        dx = player.x - self.x + math.sin(self.wiggle) * 30
        dy = player.y - self.y + math.cos(self.wiggle) * 30
        d = math.hypot(dx, dy)
        if d > 1:
            self.x += (dx / d) * self.speed * dt
            self.y += (dy / d) * self.speed * dt
        if d < self.radius + player.radius:
            player_take_damage(player, int(self.damage * 0.7), self)


# Experience orb
class ExperienceOrb(GameObject):
    def __init__(self, x, y, amount=10):
        super().__init__(x, y)
        self.amount = amount
        self.radius = 9
        self.age = 0

    def update(self, dt, player):
        self.age += dt
        # attraction
        dx = player.x - self.x
        dy = player.y - self.y
        d = math.hypot(dx, dy)
        if d < 200:
            pull = (200 - d) / 200.0
            self.x += (dx / (d + 1e-6)) * 220 * pull * dt
            self.y += (dy / (d + 1e-6)) * 220 * pull * dt
        if d < player.orb_radius:
            player.xp += self.amount
            self.dead = True

    def draw(self, surf, cam, t):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        r = int(6 + math.sin(t * 6) * 2)
        pygame.gfxdraw.filled_circle(surf, sx, sy, r + 2, (20, 40, 20))
        pygame.gfxdraw.filled_circle(surf, sx, sy, r, COLOR_GREEN)
        pygame.gfxdraw.aacircle(surf, sx, sy, r + 2, (160, 255, 200))


# Small particle
class Particle(GameObject):
    def __init__(self, x, y, vx, vy, ttl, color):
        super().__init__(x, y)
        self.vx = vx
        self.vy = vy
        self.ttl = ttl
        self.color = color
        self.age = 0

    def update(self, dt):
        self.age += dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        if self.age >= self.ttl:
            self.dead = True

    def draw(self, surf, cam):
        sx, sy = int(self.x - cam.x), int(self.y - cam.y)
        a = int(255 * (1 - (self.age / self.ttl)))
        col = (self.color[0], self.color[1], self.color[2], a)
        pygame.gfxdraw.filled_circle(surf, sx, sy, 2, col)


# Global helpers

enemies = []
projectiles = []
particles = []
orbs = []


def spawn_enemy(kind, x=None, y=None):
    if x is None:
        x = random.randint(60, ARENA_W - 60)
    if y is None:
        y = random.randint(60, ARENA_H - 60)
    # avoid player spawn overlap done by caller
    if kind == 'chaser':
        e = Chaser(x, y)
    elif kind == 'dasher':
        e = Dasher(x, y)
    elif kind == 'ranged':
        e = Ranged(x, y)
    elif kind == 'tank':
        e = Tank(x, y)
    elif kind == 'swarm':
        e = Swarm(x, y)
    else:
        e = Chaser(x, y)
    enemies.append(e)
    return e


def player_take_damage(player, amount, source=None):
    if player.invuln > 0 or player.dead:
        return
    player.health -= amount
    player.invuln = 0.9
    # knockback
    if source is not None:
        dx = player.x - source.x
        dy = player.y - source.y
        d = math.hypot(dx, dy)
        if d > 0:
            player.x += (dx / d) * 12
            player.y += (dy / d) * 12
    # death
    if player.health <= 0:
        player.dead = True


# Wave manager (simple)
class WaveManager:
    def __init__(self):
        self.elapsed = 0.0
        self.spawn_timer = 0.0
        self.spawn_interval = 1.4
        self.wave = 1
        self.killed = 0

    def update(self, dt, player):
        self.elapsed += dt
        self.spawn_timer -= dt
        # scale difficulty
        if self.elapsed > 15 and self.wave < 2:
            self.wave = 2
            self.spawn_interval *= 0.9
        if self.elapsed > 40 and self.wave < 3:
            self.wave = 3
            self.spawn_interval *= 0.85
        # more waves later
        if self.spawn_timer <= 0:
            self.spawn_timer = self.spawn_interval
            # choose enemy type based on elapsed
            choices = ['chaser'] * 6
            if self.elapsed > 6:
                choices += ['swarm'] * 3
            if self.elapsed > 12:
                choices += ['dasher'] * 2
            if self.elapsed > 25:
                choices += ['ranged'] * 2
            if self.elapsed > 45:
                choices += ['tank'] * 1
            kind = random.choice(choices)
            # spawn away from player
            for _ in range(12):
                x = random.randint(40, ARENA_W - 40)
                y = random.randint(40, ARENA_H - 40)
                if math.hypot(player.x - x, player.y - y) > 220:
                    spawn_enemy(kind, x, y)
                    break


# UI Manager (simplified)
class UIManager:
    def __init__(self):
        self.font = pygame.font.SysFont('Consolas', 18)

    def draw_hud(self, surf, player, wave_mgr, cam, t):
        # health
        x = 18
        y = 18
        # background panel
        pygame.draw.rect(surf, (10, 14, 20), (x - 8, y - 8, 300, 84), 0)
        # health bar
        pygame.draw.rect(surf, (40, 40, 50), (x, y, 220, 18))
        hw = int((player.health / player.max_health) * 220)
        pygame.draw.rect(surf, COLOR_CYAN, (x, y, hw, 18))
        # health text
        txt = self.font.render(f'HP {player.health}/{player.max_health}', True, WHITE)
        surf.blit(txt, (x + 6, y + 22))
        # xp bar
        pygame.draw.rect(surf, (40, 40, 50), (x, y + 44, 220, 12))
        xp_w = int((player.xp / player.next_xp) * 220)
        pygame.draw.rect(surf, (80, 240, 140), (x, y + 44, clamp(xp_w, 0, 220), 12))
        lvl = self.font.render(f'Level {player.level}', True, (200, 180, 255))
        surf.blit(lvl, (x + 230, y + 40))
        # wave/time
        time_txt = self.font.render(f'Wave {wave_mgr.wave}   Time {int(wave_mgr.elapsed)}s', True, (180, 180, 220))
        surf.blit(time_txt, (SCREEN_W - 220, 18))
        # dash cooldown indicator
        ddx = SCREEN_W - 220
        ddy = 54
        pygame.draw.rect(surf, (30, 30, 40), (ddx, ddy, 200, 12))
        dval = clamp(1 - (player.dash_cool / player.dash_cool_max), 0, 1)
        pygame.draw.rect(surf, (60, 200, 220), (ddx, ddy, int(200 * dval), 12))

    def draw_pause_menu(self, surf):
        # dim
        overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        overlay.fill((6, 8, 12, 180))
        surf.blit(overlay, (0, 0))
        # panel
        w = 420
        h = 260
        x = SCREEN_W // 2 - w // 2
        y = SCREEN_H // 2 - h // 2
        pygame.draw.rect(surf, (16, 18, 24), (x, y, w, h))
        pygame.gfxdraw.rectangle(surf, (x, y, w, h), (80,200,220))
        title = self.font.render('Paused', True, WHITE)
        surf.blit(title, (x + 18, y + 18))
        # menu items (not fully interactive beyond basics)
        items = ['Resume (Esc)', 'Restart Wave (R)', 'Controls', 'Settings', 'Save & Quit (Q)']
        for i, it in enumerate(items):
            txt = self.font.render(it, True, (180, 180, 200))
            surf.blit(txt, (x + 24, y + 64 + i * 34))

    def draw_level_modal(self, surf, choices, timer):
        # dim behind modal
        overlay = pygame.Surface((SCREEN_W, SCREEN_H), pygame.SRCALPHA)
        overlay.fill((6, 8, 12, 200))
        surf.blit(overlay, (0, 0))
        # modal box
        w = 760
        h = 260
        x = SCREEN_W // 2 - w // 2
        y = SCREEN_H // 2 - h // 2
        pygame.draw.rect(surf, (12, 14, 18), (x, y, w, h))
        pygame.gfxdraw.rectangle(surf, (x, y, w, h), (120,180,240))
        title = self.font.render('Level Up! Choose an upgrade', True, WHITE)
        surf.blit(title, (x + 18, y + 12))
        # timer
        timetxt = self.font.render(f'Auto-pick in {int(timer)}s', True, (200, 160, 160))
        surf.blit(timetxt, (x + w - 160, y + 16))
        # draw 3 cards
        card_w = 220
        card_h = 170
        gap = 36
        start_x = x + 24
        for i, c in enumerate(choices):
            cx = start_x + i * (card_w + gap)
            cy = y + 48
            pygame.draw.rect(surf, (18, 20, 22), (cx, cy, card_w, card_h))
            pygame.gfxdraw.rectangle(surf, (cx, cy, card_w, card_h), (80,200,220))
            # index
            idx_txt = self.font.render(str(i+1), True, (160, 160, 180))
            surf.blit(idx_txt, (cx + 8, cy + 8))
            if c['type'] == 'stat':
                name = c['name']
                desc = c['desc']
                name_txt = self.font.render(name, True, WHITE)
                surf.blit(name_txt, (cx + 12, cy + 32))
                desc_txt = self.font.render(desc, True, (200, 200, 210))
                surf.blit(desc_txt, (cx + 12, cy + 64))
            elif c['type'] == 'ability':
                a = c['ability']
                name_txt = self.font.render(a.name, True, WHITE)
                surf.blit(name_txt, (cx + 12, cy + 32))
                desc_txt = self.font.render(a.desc, True, (200, 200, 210))
                surf.blit(desc_txt, (cx + 12, cy + 64))


# Save manager (simple JSON)
class SaveManager:
    def __init__(self, path):
        self.path = path
        self.data = {'best_time': 0, 'currency': 0}
        self.load()

    def load(self):
        try:
            if os.path.exists(self.path):
                with open(self.path, 'r') as f:
                    self.data = json.load(f)
        except Exception as e:
            print('Failed to load save, resetting.', e)
            self.data = {'best_time': 0, 'currency': 0}

    def save(self):
        try:
            with open(self.path, 'w') as f:
                json.dump(self.data, f)
        except Exception as e:
            print('Failed to save:', e)


# Main Game class
class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((SCREEN_W, SCREEN_H))
        pygame.display.set_caption('Neon Rift')
        self.clock = pygame.time.Clock()
        self.cam = Camera(SCREEN_W, SCREEN_H)
        self.ui = UIManager()
        self.save = SaveManager(BASE_DIR / 'save.json')
        self.player = Player(ARENA_W // 2, ARENA_H // 2)
        self.wave = WaveManager()
        self.running = True
        self.t = 0.0
        # stage3 state
        self.paused = False
        self.show_level_modal = False
        self.level_choices = []
        self.level_timer = 0.0
        self.level_timeout = 10.0  # seconds before auto-pick
        # ability/upgrade pool
        self.ability_pool = [
            Ability('blink', 'Blink', 'active', 'Teleport forward a short distance', cooldown=6.0),
            Ability('shield', 'Shield', 'active', 'Brief invulnerability', cooldown=12.0),
            Ability('charged_shot', 'Charged Shot', 'active', 'Fire a powerful shot', cooldown=8.0),
        ]
        self.stat_pool = [
            {'id': 'damage', 'name': 'Damage Up', 'desc': '+3 damage'},
            {'id': 'firerate', 'name': 'Fire Rate', 'desc': 'Faster firing'},
            {'id': 'speed', 'name': 'Speed', 'desc': '+20 speed'},
            {'id': 'maxhp', 'name': 'Max HP', 'desc': '+10 max HP'},
        ]
        # spawn initial enemies
        for _ in range(6):
            spawn_enemy('chaser', random.randint(100, ARENA_W - 100), random.randint(100, ARENA_H - 100))

    def start_level_modal(self):
        # build 3 choices, can include active abilities
        choices = []
        pool = []
        # mix abilities and stats
        pool += [{'type': 'ability', 'ability': a} for a in self.ability_pool]
        pool += [{'type': 'stat', **s} for s in self.stat_pool]
        # pick 3 unique
        pick = random.sample(pool, 3)
        for p in pick:
            if p['type'] == 'ability':
                # clone ability instance so cooldowns are separate
                a = Ability(p['ability'].id, p['ability'].name, p['ability'].kind, p['ability'].desc, p['ability'].cooldown_max)
                choices.append({'type': 'ability', 'ability': a})
            else:
                choices.append({'type': 'stat', 'id': p['id'], 'name': p['name'], 'desc': p['desc']})
        self.level_choices = choices
        self.level_timer = self.level_timeout
        self.show_level_modal = True
        self.paused = True

    def apply_level_choice(self, idx):
        if idx < 0 or idx >= len(self.level_choices):
            return
        c = self.level_choices[idx]
        if c['type'] == 'stat':
            if c['id'] == 'damage':
                self.player.damage += 3
            elif c['id'] == 'firerate':
                self.player.fire_rate = max(0.06, self.player.fire_rate - 0.02)
            elif c['id'] == 'speed':
                self.player.speed += 20
            elif c['id'] == 'maxhp':
                self.player.max_health += 10
                self.player.health += 10
        elif c['type'] == 'ability':
            a = c['ability']
            self.player.add_ability(a)
        # close modal
        self.show_level_modal = False
        self.paused = False
        self.level_choices = []

    def restart_wave(self):
        enemies.clear()
        particles.clear()
        orbs.clear()
        self.wave = WaveManager()
        for _ in range(6):
            spawn_enemy('chaser', random.randint(100, ARENA_W - 100), random.randint(100, ARENA_H - 100))
        self.player.health = self.player.max_health
        self.player.x = ARENA_W // 2
        self.player.y = ARENA_H // 2

    def run(self):
        while self.running:
            dt = self.clock.tick(TARGET_FPS) / 1000.0
            self.t += dt
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                if event.type == pygame.KEYDOWN:
                    # hotkeys for abilities 1-3
                    if event.key == pygame.K_1:
                        if self.show_level_modal:
                            self.apply_level_choice(0)
                        elif not self.paused:
                            self.player.use_ability(0, self)
                    if event.key == pygame.K_2:
                        if self.show_level_modal:
                            self.apply_level_choice(1)
                        elif not self.paused:
                            self.player.use_ability(1, self)
                    if event.key == pygame.K_3:
                        if self.show_level_modal:
                            self.apply_level_choice(2)
                        elif not self.paused:
                            self.player.use_ability(2, self)
                    if event.key == pygame.K_ESCAPE:
                        # do not allow escaping level modal; it must be chosen or timeout
                        if self.show_level_modal:
                            pass
                        else:
                            self.paused = not self.paused
                    if event.key == pygame.K_r and self.paused and not self.show_level_modal:
                        self.restart_wave()
                    if event.key == pygame.K_q and self.paused and not self.show_level_modal:
                        # save and quit
                        self.save.save()
                        self.running = False
                if event.type == pygame.MOUSEBUTTONDOWN:
                    if self.show_level_modal and event.button == 1:
                        # check card clicks
                        mx, my = event.pos
                        # compute card rects same as draw
                        w = 760
                        h = 260
                        x = SCREEN_W // 2 - w // 2
                        y = SCREEN_H // 2 - h // 2
                        card_w = 220
                        card_h = 170
                        gap = 36
                        start_x = x + 24
                        for i in range(len(self.level_choices)):
                            cx = start_x + i * (card_w + gap)
                            cy = y + 48
                            if cx <= mx <= cx + card_w and cy <= my <= cy + card_h:
                                self.apply_level_choice(i)
                                break

            # ability key handling also via get_pressed for mouse abilities
            mx, my = pygame.mouse.get_pos()
            keys = pygame.key.get_pressed()

            # if pause menu open (not level modal), skip updates and render pause
            if self.paused and not self.show_level_modal:
                # still need to draw frame and pause menu
                self.screen.fill(COLOR_BG)
                self.draw_arena(self.screen, self.cam, self.t)
                self.draw_structures(self.screen, self.cam, self.t)
                for o in orbs:
                    o.draw(self.screen, self.cam, self.t)
                for e in enemies:
                    e.draw(self.screen, self.cam)
                for p in projectiles:
                    p.draw(self.screen, self.cam)
                for pa in particles:
                    pa.draw(self.screen, self.cam)
                self.player.draw(self.screen, self.cam, self.t)
                self.ui.draw_hud(self.screen, self.player, self.wave, self.cam, self.t)
                self.ui.draw_pause_menu(self.screen)
                pygame.display.flip()
                continue

            # if level modal open, update only the modal timer and draw modal
            if self.show_level_modal:
                # decrement timer
                self.level_timer -= dt
                if self.level_timer <= 0:
                    # auto-pick random
                    choice_idx = random.randint(0, len(self.level_choices) - 1)
                    self.apply_level_choice(choice_idx)
                # draw frame (frozen gameplay) with modal on top
                self.screen.fill(COLOR_BG)
                self.draw_arena(self.screen, self.cam, self.t)
                self.draw_structures(self.screen, self.cam, self.t)
                for o in orbs:
                    o.draw(self.screen, self.cam, self.t)
                for e in enemies:
                    e.draw(self.screen, self.cam)
                for p in projectiles:
                    p.draw(self.screen, self.cam)
                for pa in particles:
                    pa.draw(self.screen, self.cam)
                self.player.draw(self.screen, self.cam, self.t)
                self.ui.draw_hud(self.screen, self.player, self.wave, self.cam, self.t)
                self.ui.draw_level_modal(self.screen, self.level_choices, self.level_timer)
                pygame.display.flip()
                continue

            # normal updates
            self.player.update(dt, keys, mx, my, self.cam, projectiles)
            self.cam.update(dt, self.player.x, self.player.y)
            # update enemies
            for e in enemies:
                e.update(dt, self.player, projectiles, enemies)
            # update projectiles
            for p in projectiles:
                p.update(dt)
                # collisions
                if p.owner == 'player':
                    for e in enemies:
                        if not e.dead and math.hypot(p.x - e.x, p.y - e.y) < (p.radius + e.radius):
                            e.take_damage(p.damage, p)
                            p.dead = True
                            # particles
                            for _ in range(6):
                                particles.append(Particle(p.x, p.y, random.uniform(-160,160), random.uniform(-160,160), random.uniform(0.3,0.7), COLOR_CYAN))
                            break
                else:
                    if not self.player.dead and math.hypot(p.x - self.player.x, p.y - self.player.y) < (p.radius + self.player.radius):
                        player_take_damage(self.player, p.damage, p)
                        p.dead = True
            # player-enemy collisions handled in enemy update
            # update particles
            for pa in particles:
                pa.update(dt)
            for orb in orbs:
                orb.update(dt, self.player)
            # cleanup dead
            for col in (enemies, projectiles, particles, orbs):
                col[:] = [c for c in col if not c.dead]
            # enemy death XP
            for e in list(enemies):
                if e.dead:
                    # spawn xp orbs
                    for _ in range(random.randint(1, 3)):
                        orbs.append(ExperienceOrb(e.x + random.uniform(-8,8), e.y + random.uniform(-8,8), amount=8))
                    # particles
                    for _ in range(18):
                        particles.append(Particle(e.x, e.y, random.uniform(-300,300), random.uniform(-300,300), random.uniform(0.5,1.0), (255,120,200)))
                    enemies.remove(e)
                    self.wave.killed += 1
            # update wave manager
            self.wave.update(dt, self.player)

            # level up: start a modal for each level (handle one at a time)
            if self.player.xp >= self.player.next_xp and not self.show_level_modal:
                self.player.xp -= self.player.next_xp
                self.player.level += 1
                self.player.next_xp = int(self.player.next_xp * 1.35)
                # start modal
                self.start_level_modal()

            # clear screen
            self.screen.fill(COLOR_BG)
            # draw arena (grid)
            self.draw_arena(self.screen, self.cam, self.t)
            # draw structures (simple glowing barriers)
            self.draw_structures(self.screen, self.cam, self.t)
            # draw orbs
            for o in orbs:
                o.draw(self.screen, self.cam, self.t)
            # draw enemies
            for e in enemies:
                e.draw(self.screen, self.cam)
            # draw projectiles
            for p in projectiles:
                p.draw(self.screen, self.cam)
            # draw particles
            for pa in particles:
                pa.draw(self.screen, self.cam)
            # draw player
            self.player.draw(self.screen, self.cam, self.t)
            # UI
            self.ui.draw_hud(self.screen, self.player, self.wave, self.cam, self.t)

            pygame.display.flip()

        self.save.save()
        pygame.quit()

    def draw_arena(self, surf, cam, t):
        # floor gradient
        rect = pygame.Rect(-cam.x, -cam.y, ARENA_W, ARENA_H)
        # draw grid
        spacing = 64
        ox = int((t * 18) % spacing)
        oy = int((t * 12) % spacing)
        for gx in range(-spacing, ARENA_W + spacing, spacing):
            pygame.draw.line(surf, (12, 18, 30), (gx - cam.x + ox, -cam.y), (gx - cam.x + ox, ARENA_H - cam.y))
        for gy in range(-spacing, ARENA_H + spacing, spacing):
            pygame.draw.line(surf, (12, 18, 30), (-cam.x, gy - cam.y + oy), (ARENA_W - cam.x, gy - cam.y + oy))
        # subtle center vignette
        pygame.gfxdraw.box(surf, rect, (6, 10, 22))

    def draw_structures(self, surf, cam, t):
        # draw glowing rectangles as barriers
        for i in range(6):
            x = 200 + i * 360
            y = 120 + (i % 3) * 280
            sx = int(x - cam.x)
            sy = int(y - cam.y)
            w = 120
            h = 18
            # glow
            pygame.draw.rect(surf, (20, 40, 60), (sx - 8, sy - 8, w + 16, h + 16))
            pygame.draw.rect(surf, (40, 80, 120), (sx, sy, w, h))
            pygame.gfxdraw.rectangle(surf, (sx, sy, w, h), (80,200,220))


if __name__ == '__main__':
    try:
        Game().run()
    except Exception as e:
        print('An error occurred:', e)
        pygame.quit()
        raise
