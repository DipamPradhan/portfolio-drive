import * as THREE from 'three'

export class InputManager {
  constructor() {
    this.keys = {}
    this.justPressed = {}
    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase()
      if (!this.keys[k]) this.justPressed[k] = true
      this.keys[k] = true
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault()
    }
    this._onKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }
  get forward() { return this.keys['w'] || this.keys['arrowup'] }
  get backward() { return this.keys['s'] || this.keys['arrowdown'] }
  get left() { return this.keys['a'] || this.keys['arrowleft'] }
  get right() { return this.keys['d'] || this.keys['arrowright'] }
  consumePress(k) { if (this.justPressed[k]) { this.justPressed[k] = false; return true } return false }
  clearAll() { this.keys = {}; this.justPressed = {} }
  destroy() { window.removeEventListener('keydown', this._onKeyDown); window.removeEventListener('keyup', this._onKeyUp) }
}

const WHEEL_CONFIG = [
  { x: -1.4, z: -1.7, front: true },
  { x: 1.4, z: -1.7, front: true },
  { x: -1.4, z: 1.7, front: false },
  { x: 1.4, z: 1.7, front: false },
]

export class VehicleController {
  constructor(scene) {
    this.scene = scene
    this.position = new THREE.Vector3(0, 0, 15)
    this.heading = 0
    this.speed = 0
    this.prevSpeed = 0
    this.steerAngle = 0
    this.rotateRate = 0
    this.vy = 0
    this.grounded = true
    this.impactVel = 0

    this.maxSpeed = 20
    this.maxReverse = 7
    this.accel = 12
    this.brake = 28
    this.reverseAccel = 9
    this.drag = 0.5
    this.aero = 0.12
    this.steerSpeed = 6
    this.maxSteer = 0.66
    this.turnSens = 3.3

    this.rideHeight = 1.55
    this.wheelRadius = 0.85
    this.gravity = 24
    this.springK = 65
    this.springDamp = 12
    this.trackWidth = 2.8
    this.wheelBase = 3.4

    this.paused = false
    this.frontWheels = []
    this.allWheels = []
    this.wheelY = [this.position.y, this.position.y, this.position.y, this.position.y]
    this.wheelVel = [0, 0, 0, 0]
    this.bodyPitch = 0
    this.bodyRoll = 0
    this.pitchVel = 0
    this.rollVel = 0
    this.pitchTarget = 0
    this.rollTarget = 0
    this.bodyBob = 0
    this.yawFlex = 0
    this.vib = 0
    this.impactKick = 0
    this.tailMat = null
    this.reverseMats = []
    this._tailI = 0.9

    this.group = new THREE.Group()
    this.group.rotation.order = 'YXZ'
    this.chassis = new THREE.Group()
    this.group.add(this.chassis)
    this.body = new THREE.Group()
    this.group.add(this.body)
    this._buildModel()
    scene.add(this.group)
  }

  _buildModel() {
    const g = this.body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b6628, roughness: 0.6, metalness: 0.15 })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.85, metalness: 0.35 })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e2026, roughness: 0.9 })
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x7ec8e3, roughness: 0.05, metalness: 0.7 })
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xffefb0, emissiveIntensity: 1.6 })
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2222, emissiveIntensity: 0.9 })
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.92 })
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, roughness: 0.3, metalness: 0.75 })
    const springMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.4, metalness: 0.6 })
    const axleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, metalness: 0.5 })
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8, metalness: 0.4 })

    // ---- frame rails ----
    ;[-0.55, 0.55].forEach(x => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 5.6), frameMat)
      rail.position.set(x, 0.05, -0.1)
      g.add(rail)
    })
    ;[-1.6, 0, 1.6].forEach(z => {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.14, 0.12), frameMat)
      cross.position.set(0, 0.05, z)
      g.add(cross)
    })

    // ---- axle housings ----
    const axleZ = [-1.7, 1.7]
    axleZ.forEach(az => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), axleMat)
      tube.rotation.z = Math.PI / 2
      tube.position.set(0, -0.35, az)
      g.add(tube)
      const diff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), axleMat)
      diff.position.set(0, -0.35, az)
      g.add(diff)
    })

    // ---- coil springs + shocks at each wheel ----
    WHEEL_CONFIG.forEach(cfg => {
      const coilCount = 6
      const coilH = 0.65, coilR = 0.08
      for (let j = 0; j < coilCount; j++) {
        const t = j / coilCount
        const ring = new THREE.Mesh(new THREE.TorusGeometry(coilR, 0.022, 6, 10, Math.PI * 2), springMat)
        ring.position.set(cfg.x, -0.18 + t * coilH, cfg.z)
        ring.rotation.x = Math.PI / 2
        ring.rotation.y = t * Math.PI * 0.35
        g.add(ring)
      }
      const shockOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.55, 6), darkMat)
      shockOuter.position.set(cfg.x * 1.15, -0.15, cfg.z)
      g.add(shockOuter)
      const shockInner = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 6), rimMat)
      shockInner.position.set(cfg.x * 1.15, -0.45, cfg.z)
      g.add(shockInner)
    })

    // ---- body tub (lower, sits on frame) ----
    const tub = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 3.8), bodyMat)
    tub.position.set(0, 0.75, -0.05)
    tub.castShadow = true
    g.add(tub)

    // ---- hood ----
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 1.3), bodyMat)
    hood.position.set(0, 0.85, -2.3)
    hood.castShadow = true
    g.add(hood)
    const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.0), bodyMat)
    hoodBulge.position.set(0, 1.06, -2.15)
    g.add(hoodBulge)

    // ---- grille + headlights ----
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.14), darkMat)
    grille.position.set(0, 0.88, -3.0)
    g.add(grille)
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.02), trimMat)
      bar.position.set(0, 0.72 + i * 0.09, -3.06)
      g.add(bar)
    }
    ;[-0.7, 0.7].forEach(x => {
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), lightMat)
      hl.rotation.x = Math.PI / 2
      hl.position.set(x, 0.92, -3.02)
      g.add(hl)
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.13, 8), trimMat)
      rim.rotation.x = Math.PI / 2
      rim.position.set(x, 0.92, -3.08)
      g.add(rim)
    })

    // ---- fender flares (wide, hug the tyres) ----
    WHEEL_CONFIG.forEach(cfg => {
      const flare = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.35), darkMat)
      flare.position.set(cfg.x * 1.12, 0.38, cfg.z * 0.88)
      flare.rotation.y = cfg.front ? 0.1 : -0.1
      g.add(flare)
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.35), bodyMat)
      arch.position.set(cfg.x * 1.18, 0.55, cfg.z * 0.88)
      g.add(arch)
    })

    // ---- cab / windshield ----
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.2), bodyMat)
    cowl.position.set(0, 1.2, -0.75)
    g.add(cowl)
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.88), windowMat)
    windshield.position.set(0, 1.52, -0.55)
    windshield.rotation.x = -0.36
    windshield.rotation.order = 'XYZ'
    g.add(windshield)
    const rearWin = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.7), windowMat)
    rearWin.position.set(0, 1.58, 1.3)
    rearWin.rotation.x = 0.42
    g.add(rearWin)
    ;[-0.98, 0.98].forEach(x => {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.58), windowMat)
      sw.position.set(x, 1.55, 0.3)
      sw.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2
      g.add(sw)
    })

    // ---- roof ----
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.12, 1.85), bodyMat)
    roof.position.set(0, 1.95, 0.15)
    roof.castShadow = true
    g.add(roof)

    // ---- roll cage ----
    const cageMat = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.7, metalness: 0.4 })
    const bar = (x, z, fromY, toY, radius = 0.04) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, toY - fromY, 6), cageMat)
      b.position.set(x, (fromY + toY) / 2, z)
      g.add(b)
    }
    ;[-0.98, 0.98].forEach(x => {
      bar(x, -0.4, 1.4, 1.88)
      bar(x, 0.85, 1.4, 1.88)
    })
    ;[-0.4, 0.85].forEach(z => {
      ;[-0.98, 0.98].forEach(x => {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.96, 6), cageMat)
        top.rotation.z = Math.PI / 2
        top.position.set(x, 1.9, z)
        g.add(top)
      })
    })
    const hoopF = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.032, 6, 14, Math.PI), cageMat)
    hoopF.position.set(0, 1.6, -0.45)
    hoopF.rotation.y = Math.PI / 2
    g.add(hoopF)

    // ---- snorkel ----
    const snorkel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 8), cageMat)
    snorkel.position.set(1.1, 1.55, -0.65)
    g.add(snorkel)
    const snorkelHead = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.38, 8), cageMat)
    snorkelHead.rotation.x = Math.PI / 2
    snorkelHead.position.set(1.1, 2.32, -0.82)
    g.add(snorkelHead)

    // ---- bull bar ----
    ;[-0.85, 0.85].forEach(x => {
      const vb = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6), cageMat)
      vb.position.set(x, 0.72, -3.08)
      g.add(vb)
    })
    const bullTop = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.74, 6), cageMat)
    bullTop.rotation.z = Math.PI / 2
    bullTop.position.set(0, 0.98, -3.08)
    g.add(bullTop)
    const bullMid = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 1.66, 6), cageMat)
    bullMid.rotation.z = Math.PI / 2
    bullMid.position.set(0, 0.65, -3.12)
    g.add(bullMid)

    // ---- roof rack + cargo ----
    ;[-0.35, 0.0, 0.42].forEach(z => {
      const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), cageMat)
      cross.rotation.z = Math.PI / 2
      cross.position.set(0, 2.1, z)
      g.add(cross)
    })
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.82), trimMat)
    cargo.position.set(0, 2.24, -0.12)
    cargo.castShadow = true
    g.add(cargo)

    // ---- bumpers + tow hooks ----
    const bf = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.26, 0.45), darkMat)
    bf.position.set(0, 0.42, -3.08); bf.castShadow = true; g.add(bf)
    const br = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.26, 0.45), darkMat)
    br.position.set(0, 0.42, 3.08); br.castShadow = true; g.add(br)
    ;[-0.9, 0.9].forEach(x => {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.032, 6, 10, Math.PI * 1.8), cageMat)
      hook.position.set(x, 0.18, -3.18); g.add(hook)
    })

    // ---- taillights + reverse lights ----
    ;[-0.82, 0.82].forEach(x => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.08), tailMat)
      tl.position.set(x, 0.82, 2.98)
      g.add(tl)
    })
    this.tailMat = tailMat
    const revMat = new THREE.MeshBasicMaterial({ color: 0xfff8ec, transparent: true, opacity: 0 })
    ;[-0.5, 0.5].forEach(x => {
      const rv = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.05), revMat)
      rv.position.set(x, 0.85, 2.96)
      g.add(rv)
      this.reverseMats.push(revMat)
    })

    // ---- spare wheel (big) ----
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 12), tireMat)
    spare.rotation.x = Math.PI / 2
    spare.position.set(0, 1.15, 2.75)
    spare.castShadow = true
    g.add(spare)
    const spareRim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.24, 8), rimMat)
    spareRim.rotation.x = Math.PI / 2
    spareRim.position.set(0, 1.15, 2.76)
    g.add(spareRim)
    const spareBracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.3), darkMat)
    spareBracket.position.set(0, 1.35, 2.55)
    g.add(spareBracket)

    // ---- big monster truck wheels ----
    const TW = 0.52
    const tireGeo = new THREE.CylinderGeometry(this.wheelRadius, this.wheelRadius, TW, 20)
    const rimGeo = new THREE.CylinderGeometry(0.42, 0.42, TW + 0.04, 10)
    const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, TW + 0.06, 8)
    const treadGeo = new THREE.TorusGeometry(this.wheelRadius, 0.06, 6, 20)
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.98 })

    WHEEL_CONFIG.forEach((cfg, i) => {
      const susp = new THREE.Group()
      susp.position.set(cfg.x, this.wheelRadius - this.rideHeight, cfg.z)
      const pivot = new THREE.Group()
      susp.add(pivot)
      const spin = new THREE.Group()
      pivot.add(spin)

      const tire = new THREE.Mesh(tireGeo, tireMat)
      tire.rotation.z = Math.PI / 2
      tire.castShadow = true
      spin.add(tire)

      for (let t = 0; t < 14; t++) {
        const angle = (t / 14) * Math.PI * 2
        const tread = new THREE.Mesh(treadGeo, treadMat)
        tread.rotation.y = angle
        tread.position.set(0, 0, 0)
        spin.add(tread)
      }

      const rim = new THREE.Mesh(rimGeo, rimMat)
      rim.rotation.z = Math.PI / 2
      spin.add(rim)
      const hub = new THREE.Mesh(hubGeo, rimMat)
      hub.rotation.z = Math.PI / 2
      spin.add(hub)

      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.04, 0.03, 0.36), rimMat)
        spoke.rotation.x = (s / 5) * Math.PI
        spoke.position.set(0, 0, 0)
        spin.add(spoke)
      }

      this.chassis.add(susp)
      this.allWheels.push({ susp, pivot, spin, i, config: cfg })
      if (cfg.front) this.frontWheels.push({ susp, pivot, spin, i, config: cfg })
    })
  }

  wheelWorldPos(i) {
    const cfg = WHEEL_CONFIG[i]
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading)
    return new THREE.Vector3(
      this.position.x + cfg.x * cos - cfg.z * sin,
      this.position.y,
      this.position.z + cfg.x * sin + cfg.z * cos
    )
  }

  update(dt, input) {
    if (this.paused) return
    const abs = Math.abs(this.speed)
    const maxS = this.maxSpeed
    const air = this.grounded ? 1 : 0.55

    let inSteer = 0
    if (input.left) inSteer += 1
    if (input.right) inSteer -= 1
    const steerTarget = inSteer * this.maxSteer
    this.steerAngle += (steerTarget - this.steerAngle) * Math.min(1, this.steerSpeed * dt)
    if (Math.abs(this.steerAngle) < 0.004) this.steerAngle = 0

    const speedFrac = Math.min(1, abs / maxS)
    let authority = this.turnSens * air
    if (abs < 0.8) authority *= Math.max(0, abs / 0.8 - 0.05)
    authority *= 1 - 0.28 * speedFrac
    this.prevHeading = this.heading
    this.heading += this.steerAngle * authority * dt

    this.prevSpeed = this.speed
    if (input.forward) {
      if (this.speed < -0.3) this.speed = Math.min(0, this.speed + this.brake * dt)
      else if (this.speed < maxS) this.speed += this.accel * air * Math.max(0, 1 - Math.pow(speedFrac, 1.3)) * dt
    } else if (input.backward) {
      if (this.speed > 0.7) this.speed = Math.max(0, this.speed - this.brake * dt)
      else if (this.speed > -this.maxReverse) this.speed -= this.reverseAccel * air * Math.max(0, 1 - Math.min(1, abs / this.maxReverse)) * dt
    } else {
      this.speed *= Math.pow(1 - this.drag, dt)
      this.speed -= Math.sign(this.speed) * this.aero * this.speed * this.speed * dt
      if (Math.abs(this.speed) < 0.06) this.speed = 0
    }
    this.speed = Math.max(-this.maxReverse, Math.min(this.speed, maxS))

    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading))
    this.position.addScaledVector(fwd, this.speed * dt)

    this.rotateRate = (this.heading - this.prevHeading) / dt
    if (this.terrainHandler) this._suspension(dt)

    const spin = this.speed * 1.2 * dt
    this.allWheels.forEach(w => { w.spin.rotation.x += spin })
    this.frontWheels.forEach(w => { w.pivot.rotation.y = this.steerAngle })

    const braking = (input.forward && this.speed < -0.3) || (input.backward && this.speed > 0.7)
    const tailT = braking ? 3.6 : 0.9
    this._tailI += (tailT - this._tailI) * Math.min(1, 9 * dt)
    if (this.tailMat) this.tailMat.emissiveIntensity = this._tailI
    const revT = this.speed < -0.4 ? 1 : 0
    this.reverseMats.forEach(m => {
      m.opacity += (revT - m.opacity) * Math.min(1, 9 * dt)
    })

    this.group.position.copy(this.position)
    this.group.rotation.y = this.heading
    this.chassis.rotation.set(0, 0, 0)
    this.body.rotation.x = this.bodyPitch
    this.body.rotation.y = this.yawFlex
    this.body.rotation.z = this.bodyRoll
    this.body.position.y = this.bodyBob
  }

  _suspension(dt) {
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading)
    let center = 0
    for (let i = 0; i < 4; i++) {
      const cfg = WHEEL_CONFIG[i]
      const wx = this.position.x + cfg.x * cos - cfg.z * sin
      const wz = this.position.z + cfg.x * sin + cfg.z * cos
      const g = this.terrainHandler(wx, wz)
      const acc = this.springK * (g - this.wheelY[i]) - this.springDamp * this.wheelVel[i]
      this.wheelVel[i] += acc * dt
      this.wheelY[i] += this.wheelVel[i] * dt
      center += this.wheelY[i]
    }
    center /= 4
    const front = (this.wheelY[0] + this.wheelY[1]) / 2
    const rear = (this.wheelY[2] + this.wheelY[3]) / 2
    const left = (this.wheelY[0] + this.wheelY[2]) / 2
    const right = (this.wheelY[1] + this.wheelY[3]) / 2

    const supportY = center + this.rideHeight
    if (this.position.y <= supportY && this.vy <= 0) {
      const impact = this.vy
      this.impactVel = impact
      this.position.y = supportY
      this.vy = 0
      this.grounded = true
      if (impact < -5) {
        this.bodyBob = Math.min(0.1, -impact * 0.012)
        this.impactKick = Math.min(0.5, -impact * 0.045)
      }
    } else if (this.position.y <= supportY) {
      this.position.y = supportY
      this.vy = 0
      this.grounded = true
    } else {
      this.vy -= this.gravity * dt
      this.position.y += this.vy * dt
      this.impactVel = this.vy
      this.grounded = false
    }
    this.impactKick *= Math.pow(0.02, dt)
    this.bodyBob *= Math.pow(0.02, dt)

    const transLong = (this.speed - this.prevSpeed) / dt
    const speedFrac = Math.min(1, Math.abs(this.speed) / this.maxSpeed)
    const slopeFit = 0.42
    this.pitchTarget = -Math.atan2((rear - front) * slopeFit, this.wheelBase) +
      THREE.MathUtils.clamp(transLong * 0.005, -0.12, 0.12) +
      this.impactKick
    this.rollTarget = -Math.atan2((left - right) * slopeFit, this.trackWidth) -
      this.steerAngle * speedFrac * speedFrac * 0.24

    const K = 60, D = 9
    this.pitchVel += (this.pitchTarget - this.bodyPitch) * K * dt - this.pitchVel * D * dt
    this.bodyPitch += this.pitchVel * dt
    this.rollVel += (this.rollTarget - this.bodyRoll) * K * dt - this.rollVel * D * dt
    this.bodyRoll += this.rollVel * dt

    const noise = Math.random() * 2 - 1
    this.vib += (noise - this.vib) * Math.min(1, 22 * dt)
    const shake = this.vib * speedFrac * 0.0045 * (this.grounded ? 1 : 0)
    this.bodyPitch += shake
    this.bodyRoll += -shake * 0.75
    this.yawFlex += (-this.steerAngle * speedFrac * 0.045 - this.yawFlex) * Math.min(1, 6 * dt)

    this.bodyPitch = THREE.MathUtils.clamp(this.bodyPitch, -0.14, 0.14)
    this.bodyRoll = THREE.MathUtils.clamp(this.bodyRoll, -0.2, 0.2)
    this.bodyBob = THREE.MathUtils.clamp(this.bodyBob, -0.15, 0.15)

for (let i = 0; i < 4; i++) {
      const w = this.allWheels[i]
      const travel = THREE.MathUtils.clamp(this.wheelY[i] - center, -0.42, 0.55) * 0.9
      w.susp.position.y = this.wheelRadius - this.rideHeight + travel
    }
  }

  getForward() { return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)) }
}

export class CameraController {
  constructor(camera) {
    this.camera = camera
    this.smoothPos = new THREE.Vector3()
    this.smoothTarget = new THREE.Vector3()
    this.init = false
  }
  destroy() {}
  update(dt, pos, heading) {
    const behind = new THREE.Vector3(Math.sin(heading) * 14, 9, Math.cos(heading) * 14)
    const targetPos = pos.clone().add(behind)
    const ahead = new THREE.Vector3(-Math.sin(heading) * 5, 2.5, -Math.cos(heading) * 5)
    const targetLook = pos.clone().add(ahead)
    if (!this.init) { this.smoothPos.copy(targetPos); this.smoothTarget.copy(targetLook); this.init = true }
    const f = 1 - Math.exp(-4.0 * dt)
    const fl = 1 - Math.exp(-5.0 * dt)
    this.smoothPos.lerp(targetPos, f)
    this.smoothTarget.lerp(targetLook, fl)
    this.camera.position.copy(this.smoothPos)
    this.camera.lookAt(this.smoothTarget)
  }
}

export class CollisionSystem {
  constructor() {
    this.spheres = []
    this.boxes = []
    this.bounds = { minX: -115, maxX: 115, minZ: -115, maxZ: 115 }
  }
  addSphere(c, r) { this.spheres.push({ c: c.clone(), r }) }
  addBox(mn, mx) { this.boxes.push({ mn: mn.clone(), mx: mx.clone() }) }
  resolve(pos, vr) {
    let p = pos.clone(); const b = this.bounds
    p.x = Math.max(b.minX + vr, Math.min(b.maxX - vr, p.x))
    p.z = Math.max(b.minZ + vr, Math.min(b.maxZ - vr, p.z))
    for (const s of this.spheres) {
      const dx = p.x - s.c.x, dz = p.z - s.c.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      const minD = s.r + vr
      if (dist < minD && dist > 0.01) {
        const nx = dx / dist, nz = dz / dist
        p.x = s.c.x + nx * minD; p.z = s.c.z + nz * minD
      }
    }
    for (const box of this.boxes) {
      const cx = Math.max(box.mn.x, Math.min(p.x, box.mx.x))
      const cz = Math.max(box.mn.z, Math.min(p.z, box.mx.z))
      const dx = p.x - cx, dz = p.z - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < vr && dist > 0.01) {
        const nx = dx / dist, nz = dz / dist
        p.x = cx + nx * vr; p.z = cz + nz * vr
      } else if (dist <= 0.01) {
        const dL = p.x - box.mn.x, dR = box.mx.x - p.x
        const dF = box.mx.z - p.z, dB = p.z - box.mn.z
        const m = Math.min(dL, dR, dF, dB)
        if (m === dL) p.x = box.mn.x - vr
        else if (m === dR) p.x = box.mx.x + vr
        else if (m === dF) p.z = box.mx.z + vr
        else p.z = box.mn.z - vr
      }
    }
    return p
  }
}

export class InteractionSystem {
  constructor() { this.dests = []; this.nearby = null; this.radius = 16 }
  addDest(key, pos, label) { this.dests.push({ key, pos: pos.clone(), label }) }
  update(vp) {
    this.nearby = null; let md = this.radius
    for (const d of this.dests) {
      const dist = vp.distanceTo(d.pos)
      if (dist < md) { md = dist; this.nearby = d }
    }
    return this.nearby
  }
}