import * as THREE from 'three'

function softRadialTexture(size, inner, outer) {
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  return t
}

const DUST_MAX = 90

export class Effects {
  constructor(scene, terrain) {
    this.scene = scene
    this.terrain = terrain
    this.group = new THREE.Group()
    scene.add(this.group)

    this.dustPool = []
    const dustTex = softRadialTexture(64, 'rgba(230,200,160,0.5)', 'rgba(220,180,120,0)')
    for (let i = 0; i < DUST_MAX; i++) {
      const mat = new THREE.SpriteMaterial({ map: dustTex, transparent: true, depthWrite: false, opacity: 0 })
      const s = new THREE.Sprite(mat)
      s.visible = false
      this.dustPool.push({ sprite: s, alive: false, life: 0, ttl: 0, vel: new THREE.Vector3(), pos: new THREE.Vector3() })
      this.group.add(s)
    }
    this.dustCursor = 0
    this.dustCtl = 0

    const fireTex = softRadialTexture(48, 'rgba(210,255,170,0.9)', 'rgba(140,220,80,0)')
    this.fireflies = []
    for (let i = 0; i < 70; i++) {
      const mat = new THREE.SpriteMaterial({ map: fireTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
      const s = new THREE.Sprite(mat)
      s.scale.set(0.35, 0.35, 1)
      s.position.set((Math.random() - 0.5) * 150, 1 + Math.random() * 4, (Math.random() - 0.5) * 150)
      this.group.add(s)
      this.fireflies.push({ sprite: s, phase: Math.random() * Math.PI * 2, baseY: s.position.y })
    }

    const colors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xe67e22, 0x9b59b6, 0x1abc9c]
    const balloonMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 })
    this.balloons = []
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), balloonMat.clone())
      m.material.color.setHex(colors[i % colors.length])
      const a = (i / 7) * Math.PI * 2
      m.position.set(Math.cos(a) * (60 + i * 4), 15 + (i % 3) * 5, Math.sin(a) * (60 + i * 4))
      this.group.add(m)
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }))
      str.position.y = -1.6
      m.add(str)
      this.balloons.push({ mesh: m, phase: Math.random() * Math.PI * 2 })
    }

    this.birds = []
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a1922 })
    for (let i = 0; i < 4; i++) {
      const bird = new THREE.Group()
      const wingL = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), birdMat)
      wingL.position.set(-0.5, 0, 0)
      bird.add(wingL)
      const wingR = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), birdMat)
      wingR.position.set(0.5, 0, 0)
      bird.add(wingR)
      bird.rotateY(Math.PI)
      bird.scale.set(0.8, 0.8, 0.8)
      this.group.add(bird)
      this.birds.push({
        group: bird, wingL, wingR, phase: Math.random() * Math.PI * 2,
        radius: 150 + Math.random() * 60, height: 45 + Math.random() * 30,
        c: (i / 4) * Math.PI * 2, speed: 0.1 + Math.random() * 0.12,
      })
    }

    this.windmill = new THREE.Group()
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 11, 8), new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.8 }))
    tower.position.y = 5.5
    this.windmill.add(tower)
    const blades = new THREE.Group()
    blades.position.y = 11
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8a94a0, roughness: 0.6, side: THREE.DoubleSide })
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 6.5), bladeMat)
      blade.position.y = 3.2
      blade.rotation.z = (i / 3) * Math.PI * 2
      const holder = new THREE.Group()
      holder.add(blade)
      holder.rotation.x = 0.4
      blades.add(holder)
    }
    this.windmill.add(blades)
    this.windBlades = blades
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.9 }))
    base.position.y = 0.6
    this.windmill.add(base)
    const wy = this.terrain ? this.terrain(56, -34) : 0
    this.windmill.position.set(56, wy, -34)
    this.windmill.castShadow = true
    this.group.add(this.windmill)

    this.group.traverse(o => { if (o.isMesh) o.castShadow = true })
  }

  confetti(pos, count = 240) {
    const colors = [0xff5b5b, 0xffd479, 0x7de0a5, 0x6cb4ff, 0xd98bff, 0xffa26b]
    if (!this.confettiPool) {
      this.confettiPool = []
      const geo = new THREE.PlaneGeometry(0.16, 0.26)
      for (let i = 0; i < 320; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 }))
        m.visible = false
        this.group.add(m)
        this.confettiPool.push({ mesh: m, alive: false, life: 0, ttl: 0, vel: new THREE.Vector3(), rotV: new THREE.Vector3(), color: colors[i % colors.length] })
      }
    }
    let spawned = 0
    for (const c of this.confettiPool) {
      if (spawned >= count) break
      if (c.alive) continue
      spawned++
      c.alive = true
      c.life = 0
      c.ttl = 3.5 + Math.random() * 4.5
      c.mesh.visible = true
      c.mesh.material.opacity = 0
      c.mesh.material.color.setHex(c.color)
      const a = Math.random() * Math.PI * 2
      const sp = 3 + Math.random() * 9
      c.vel.set(Math.cos(a) * sp, 6 + Math.random() * 8, Math.sin(a) * sp)
      c.rotV.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
      c.mesh.position.set(
        (pos ? pos.x : 0) + (Math.random() - 0.5) * 6,
        (pos ? pos.y : 12) + Math.random() * 4,
        (pos ? pos.z : 0) + (Math.random() - 0.5) * 6
      )
    }
  }

  spawnDust(pos, vel, strength) {
    const p = this.dustPool[this.dustCursor]
    this.dustCursor = (this.dustCursor + 1) % this.dustPool.length
    p.alive = true
    p.life = 0
    p.ttl = 0.6 + Math.random() * 0.5
    p.pos.copy(pos)
    p.vel.set(vel.x * 0.2 + (Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.7, vel.z * 0.2 + (Math.random() - 0.5) * 0.8)
    p.sprite.visible = true
    p.sprite.material.opacity = 0
    p.strength = strength
  }

  update(dt, t, vehicle) {
    const yB = this.dustCtl > 0
    this.dustCtl -= dt
    if (vehicle && vehicle.grounded && Math.abs(vehicle.speed) > 2.5 && !yB) {
      const rearOffset = vehicle.getForward().multiplyScalar(1.8)
      const right = new THREE.Vector3(Math.cos(vehicle.heading), 0, -Math.sin(vehicle.heading))
      ;[-1.4, 1.4].forEach(x => {
        this.dustCtl = Math.max(this.dustCtl, 0)
        if (Math.random() < 0.45) {
          const p = vehicle.position.clone().add(rearOffset).addScaledVector(right, x)
          p.y = this.terrain ? this.terrain(p.x, p.z) + 0.2 : vehicle.position.y
          this.spawnDust(p, vehicle.getForward(), Math.min(1, Math.abs(vehicle.speed) / vehicle.maxSpeed))
        }
      })
    }

    for (const p of this.dustPool) {
      if (!p.alive) continue
      p.life += dt
      if (p.life > p.ttl) { p.alive = false; p.sprite.visible = false; continue }
      p.pos.addScaledVector(p.vel, dt * (1 - p.life / p.ttl))
      p.vel.y -= 0.35 * dt
      const k = p.life / p.ttl
      const s = 0.6 + Math.min(1, p.life * 3) * 1.1
      p.sprite.scale.set(s, s, 1)
      p.sprite.position.copy(p.pos)
      p.sprite.material.opacity = (1 - k) * 0.55 * p.strength
    }

    for (const f of this.fireflies) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + f.phase))
      f.sprite.position.x += Math.sin(t * 0.5 + f.phase) * 0.02
      f.sprite.position.z += Math.cos(t * 0.7 + f.phase) * 0.02
      f.sprite.position.y = f.baseY + Math.sin(t * 1.1 + f.phase) * 0.8
      f.sprite.material.opacity = tw * 0.8
    }

    for (const b of this.balloons) {
      b.mesh.position.y += Math.sin(t * 0.5 + b.phase) * 0.12 * dt
      b.mesh.position.x += Math.sin(t * 0.2 + b.phase) * 0.05 * dt
      b.mesh.rotation.x = Math.sin(t * 0.4 + b.phase) * 0.05
      b.mesh.rotation.z = Math.cos(t * 0.3 + b.phase) * 0.05
    }

    for (const b of this.birds) {
      b.c += b.speed * dt
      const flap = 0.35 + 0.25 * Math.sin(t * 9 + b.phase)
      b.wingL.rotation.z = flap
      b.wingR.rotation.z = -flap
      const x = Math.cos(b.c) * b.radius
      const z = Math.sin(b.c) * b.radius
      b.group.position.set(x, b.height + Math.sin(t * 0.4 + b.phase) * 3, z)
      b.group.rotation.y = Math.atan2(Math.sin(b.c + Math.PI / 2) * b.radius, Math.cos(b.c + Math.PI / 2) * b.radius)
    }

    this.windBlades.rotation.z += dt * 2.2

    if (this.confettiPool) {
      for (const c of this.confettiPool) {
        if (!c.alive) continue
        c.life += dt
        if (c.life > c.ttl) { c.alive = false; c.mesh.visible = false; continue }
        c.vel.y -= 9.8 * dt
        c.mesh.position.addScaledVector(c.vel, dt)
        c.mesh.rotation.x += c.rotV.x * dt
        c.mesh.rotation.y += c.rotV.y * dt
        const gy = this.terrain ? this.terrain(c.mesh.position.x, c.mesh.position.z) + 0.15 : 0.15
        if (c.mesh.position.y < gy) {
          c.mesh.position.y = gy
          c.vel.y = Math.abs(c.vel.y) * 0.35
          c.vel.x *= 0.6; c.vel.z *= 0.6
        }
        const fadeIn = Math.min(1, c.life * 6)
        const fadeOut = c.life > c.ttl - 1 ? Math.max(0, 1 - (c.life - (c.ttl - 1))) : 1
        c.mesh.material.opacity = Math.min(fadeIn, fadeOut)
      }
    }
  }
}

export function buildEffects(scene, terrain) {
  return new Effects(scene, terrain)
}