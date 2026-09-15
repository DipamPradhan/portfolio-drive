import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { InputManager, VehicleController, CameraController, CollisionSystem, InteractionSystem } from './engine'
import { buildWorld } from './world'
import { buildEffects } from './effects'
import { PORTFOLIO, DESTINATIONS } from './data'

const IS_AUTOSTART = () => new URLSearchParams(window.location.search).has('autostart')
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawMinimap(ctx, w, h, curves, dests, player, heading, visited) {
  const WORLDSIZE = 250
  const scale = (w - 14) / WORLDSIZE
  const ox = w / 2, oy = h / 2
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(8, 10, 16, 0.85)'
  roundRectPath(ctx, 0, 0, w, h, 10); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
  roundRectPath(ctx, 1, 1, w - 2, h - 2, 9); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const curve of curves) {
    const pts = curve.getSpacedPoints(60)
    ctx.beginPath()
    pts.forEach((p, i) => {
      const mx = ox + p.x * scale, my = oy + p.z * scale
      if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my)
    })
    ctx.stroke()
  }
  for (const dst of dests) {
    const mx = ox + dst.position[0] * scale, my = oy + dst.position[2] * scale
    const isVisited = visited.has(dst.key)
    ctx.fillStyle = isVisited ? '#3ddc84' : dst.color
    ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = isVisited ? 'rgba(61,220,132,0.9)' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.stroke()
    if (isVisited) {
      ctx.strokeStyle = '#03120a'; ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(mx - 2, my); ctx.lineTo(mx - 0.6, my + 1.8); ctx.lineTo(mx + 2.6, my - 1.8); ctx.stroke()
    }
  }
  ctx.save()
  ctx.translate(ox + player.x * scale, oy + player.z * scale)
  ctx.rotate(heading)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3.2, 3.8); ctx.lineTo(0, 1.6); ctx.lineTo(3.2, 3.8); ctx.closePath(); ctx.fill()
  ctx.restore()
}

const PANEL_CONTENT = {
  about: {
    title: 'About Me',
    accent: '#9b59b6',
    body: (u) => (
      <>
        <p className="resume-text">Name: <strong>{u.name}</strong></p>
        <p className="resume-text">Role: {u.role}</p>
        <p className="resume-text">{u.bio}</p>
      </>
    ),
  },
  experience: {
    title: 'Experience',
    accent: '#4a90d9',
    body: (u) => PORTFOLIO.experience.map((e, i) => (
      <div className="item" key={i}>
        <strong>{e.title}</strong>
        <div className="meta">{e.company} &middot; {e.years}</div>
        <div className="desc">{e.desc}</div>
      </div>
    )),
  },
  projects: {
    title: 'Projects',
    accent: '#27ae60',
    body: (u) => PORTFOLIO.projects.map((p, i) => (
      <div className="item" key={i}>
        <strong>{p.title}</strong>
        <div className="desc">{p.desc}</div>
        <div className="tech">{p.tech}</div>
      </div>
    )),
  },
  contact: {
    title: 'Contact',
    accent: '#e74c3c',
    body: (u) => (
      <>
        <div className="item"><strong>Email</strong><div className="desc">{u.email}</div></div>
        <div className="item"><strong>Phone</strong><div className="desc">{u.phone}</div></div>
        <div className="item"><strong>GitHub</strong><div className="desc">{u.github}</div></div>
        <div className="item"><strong>LinkedIn</strong><div className="desc">{u.linkedin}</div></div>
      </>
    ),
  },
}

function approachView(buildingPos, from) {
  const toCar = from.clone().sub(buildingPos)
  toCar.y = 0
  toCar.normalize()
  const pos = buildingPos.clone().addScaledVector(toCar, 18)
  pos.y = buildingPos.y + 4.5
  const look = buildingPos.clone(); look.y += 1.2
  return { pos, look }
}

function behindCarView(vehicle) {
  const behind = new THREE.Vector3(Math.sin(vehicle.heading) * 12, 8, Math.cos(vehicle.heading) * 12)
  const ahead = new THREE.Vector3(-Math.sin(vehicle.heading) * 5, 2.2, -Math.cos(vehicle.heading) * 5)
  return { pos: vehicle.position.clone().add(behind), look: vehicle.position.clone().add(ahead) }
}

function createEngineSound() {
  let ctx = null, master = null, oscL = null, oscH = null, lpf = null, engGain = null, windGain = null, src = null
  let vol = 0.75
  const applyVol = () => {
    if (master) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05)
  }
  const start = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); applyVol(); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination)
    oscL = ctx.createOscillator(); oscL.type = 'sawtooth'; oscL.frequency.value = 55
    oscH = ctx.createOscillator(); oscH.type = 'triangle'; oscH.frequency.value = 55
    lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 700; lpf.Q.value = 1.1
    engGain = ctx.createGain(); engGain.gain.value = 0
    oscL.connect(lpf); oscH.connect(lpf); lpf.connect(engGain); engGain.connect(master)
    oscL.start(); oscH.start()
    const len = Math.floor(ctx.sampleRate * 1.3)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500
    windGain = ctx.createGain(); windGain.gain.value = 0
    src.connect(hp); hp.connect(windGain); windGain.connect(master)
    src.start()
  }
  const update = (speed, gear) => {
    if (!ctx) return
    const sf = Math.min(1, Math.abs(speed) / 20)
    oscL.frequency.setTargetAtTime(50 + sf * 190, ctx.currentTime, 0.08)
    oscH.frequency.setTargetAtTime(50 + sf * 190 * 0.5, ctx.currentTime, 0.08)
    lpf.frequency.setTargetAtTime(500 + sf * 2400, ctx.currentTime, 0.1)
    const engV = sf < 0.04 && gear === 'N' ? 0.05 : 0.15 + sf * 0.6
    engGain.gain.setTargetAtTime(engV, ctx.currentTime, 0.12)
    windGain.gain.setTargetAtTime(sf * sf * 0.32, ctx.currentTime, 0.2)
  }
  const stop = () => {
    if (!ctx) return
    try { if (engGain) engGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15); if (windGain) windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15) } catch (e) {}
  }
  const destroy = () => { try { if (ctx) ctx.close() } catch (e) {} }
  return { start, update, stop, destroy, setVolume: v => { vol = v; applyVol() } }
}

function makeWelcomeCloud(name) {
  const w = 1024, h = 576
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)

  const puff = (x, y, r, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    g.addColorStop(0.65, `rgba(255,246,235,${a * 0.55})`)
    g.addColorStop(1, `rgba(255,240,220,0)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  puff(170, 318, 118, 0.30)
  puff(400, 268, 138, 0.34)
  puff(620, 300, 132, 0.32)
  puff(845, 268, 120, 0.30)
  puff(520, 205, 105, 0.30)
  puff(300, 205, 92, 0.24)
  puff(740, 210, 96, 0.24)
  puff(255, 392, 100, 0.22)
  puff(690, 388, 102, 0.24)
  puff(500, 140, 88, 0.20)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(30,30,10,0.4)'
  ctx.shadowBlur = 22
  ctx.fillStyle = '#ffffff'
  ctx.font = 'italic 700 118px Georgia, "Times New Roman", serif'
  ctx.fillText(name, 512, 300)
  ctx.shadowBlur = 14
  ctx.fillStyle = '#ffe9c7'
  ctx.font = 'italic 46px "Segoe Script", "Segoe UI", cursive'
  ctx.fillText('Welcomes You', 512, 414)

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(50, 28, 1)
  return { sprite, material: mat }
}

export default function App() {
  const containerRef = useRef(null)
  const minimapRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [loadingPct, setLoadingPct] = useState(0)
  const [started, setStarted] = useState(IS_AUTOSTART)
  const [activePanel, setActivePanel] = useState(null)
  const [inView, setInView] = useState(false)
  const [nearbyDest, setNearbyDest] = useState(null)
  const [paused, setPaused] = useState(false)
  const [visited, setVisited] = useState(() => new Set())
  const [complete, setComplete] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [soundOn, setSoundOn] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pd-sound-on') ?? 'true') !== false } catch (e) { return true }
  })
  const [soundVol, setSoundVol] = useState(() => {
    try { const v = Number(localStorage.getItem('pd-sound-vol')); return isNaN(v) ? 75 : Math.max(0, Math.min(100, v)) } catch (e) { return 75 }
  })

  const domRefs = useRef({})
  const gameRef = useRef(null)

  useEffect(() => {
    let t = 0
    const iv = setInterval(() => {
      t = Math.min(100, t + 6 + Math.random() * 5)
      setLoadingPct(Math.round(t))
      if (t >= 100) { clearInterval(iv); setTimeout(() => setLoading(false), 300) }
    }, 55)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe8a97a)
    scene.fog = new THREE.FogExp2(0xe8a97a, 0.0028)

    const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    container.appendChild(renderer.domElement)

    const hemi = new THREE.HemisphereLight(0xffe6c8, 0x3a5c40, 0.75)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.35)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 180
    sun.shadow.camera.left = -70; sun.shadow.camera.right = 70
    sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70
    sun.shadow.bias = -0.0005
    scene.add(sun); scene.add(sun.target)

    const input = new InputManager()
    const vehicle = new VehicleController(scene)
    vehicle.heading = 0.15

    const camCtrl = new CameraController(camera)
    const collision = new CollisionSystem()
    const interaction = new InteractionSystem()

    const { curves, destObjs, terrainHeight, clouds } = buildWorld(scene, collision)
    vehicle.terrainHandler = terrainHeight
    const effects = buildEffects(scene, terrainHeight)
    const audio = createEngineSound()
    const welcome = makeWelcomeCloud(PORTFOLIO.user.name)
    welcome.sprite.position.set(2, 31, -6)
    welcome.sprite.visible = false
    scene.add(welcome.sprite)
    DESTINATIONS.forEach((d, i) => interaction.addDest(d.key, new THREE.Vector3(...d.position), d.label))

    const g = {
      scene, camera, renderer, vehicle, camCtrl, input, collision, interaction, effects,
      curves, destObjs, clouds, sun, terrainHeight, welcome,
      phase: 'idle', introT: 0, focusT: 0, focused: null, destIndex: 0,
      camFrom: new THREE.Vector3(), camTo: new THREE.Vector3(),
      lookFrom: new THREE.Vector3(), lookTo: new THREE.Vector3(),
      introEnd: new THREE.Vector3(), introEndLook: new THREE.Vector3(),
      visited: new Set(), pausedFlag: false, lastPct: 0, lastGear: '', nextDest: null, completed: false,
    }
    gameRef.current = g
    const clock = new THREE.Clock()
    let elapsed = 0
    let lastNearbyKey = null

    const getRefs = () => {
      const r = domRefs.current
      return {
        banner: r.bannerWrap, bannerLabel: r.bannerLabel, bannerDist: r.bannerDist,
        arrow: r.destArrow, gaugeFill: r.gaugeFill, speedText: r.speedText,
        gearText: r.gearText, progressFill: r.progressFill, progressText: r.progressText,
      }
    }

    function animate() {
      if (g._dead) return
      requestAnimationFrame(animate)
      const dt = Math.min(clock.getDelta(), 0.05)
      elapsed += dt

      const { banner, bannerLabel, bannerDist, arrow, gaugeFill, speedText, gearText, progressFill, progressText } = getRefs()

      if (g.phase === 'idle') {
        const t = performance.now() * 0.00022
        camera.position.set(Math.cos(t) * 76, 15 + Math.sin(t * 0.7) * 4, 15 + Math.sin(t) * 76)
        camera.lookAt(0, 3, 15)
        camera.fov += ((60 + Math.sin(t * 0.35) * 2) - camera.fov) * Math.min(1, 2 * dt)
        camera.updateProjectionMatrix()
      } else if (g.phase === 'intro') {
        const introLen = 7.0
        g.introT += dt
        const t = Math.min(1, g.introT / introLen)
        const k1 = THREE.MathUtils.smoothstep(t, 0.0, 0.5)
        const k2 = THREE.MathUtils.smoothstep(t, 0.5, 1.0)
        const a = new THREE.Vector3(46, 44, -46)
        const b = new THREE.Vector3(10, 29, -16)
        camera.position.copy(a).lerp(b, k1).lerp(g.introEnd, k2)
        const la = new THREE.Vector3(0, 5, 8)
        camera.lookAt(la.clone().lerp(g.introEndLook, k2))
        camera.fov = 80 - 18 * k2
        camera.updateProjectionMatrix()
        const W = g.welcome
        if (W) {
          const rin = THREE.MathUtils.smoothstep(t, 0.03, 0.14)
          const rout = 1 - THREE.MathUtils.smoothstep(t, 0.6, 0.84)
          W.material.opacity = rin * rout * 0.95
          const pulse = 1 + 0.035 * Math.sin(elapsed * 1.3)
          W.sprite.scale.set(54 * pulse, 30 * pulse, 1)
          W.sprite.visible = W.material.opacity > 0.01
        }
        if (g.introT > introLen) {
          g.phase = 'play'
          if (g.welcome) g.welcome.material.opacity = 0
          camera.fov = 62; camera.updateProjectionMatrix()
          camCtrl.init = false
        }
      } else if (g.phase === 'play') {
        if (!g.pausedFlag) {
          vehicle.update(dt, input)
          vehicle.position.copy(collision.resolve(vehicle.position, 2.6))
          camCtrl.update(dt, vehicle.position, vehicle.heading)
          const gear = vehicle.speed > 0.5 ? 'D' : vehicle.speed < -0.5 ? 'R' : 'N'
          audio.update(vehicle.speed, gear)
        }
      } else if (g.phase === 'focusIn' || g.phase === 'focusShow') {
        g.focusT += dt
        const k = easeInOut(Math.min(1, g.focusT / 1.15))
        camera.position.lerpVectors(g.camFrom, g.camTo, k)
        camera.lookAt(g.lookFrom.clone().lerp(g.lookTo, k))
        if (g.phase === 'focusIn' && g.focusT >= 1.15) {
          g.phase = 'focusShow'
          setActivePanel(g.focused)
        }
        const d = g.destObjs[g.destIndex]
        if (d) camera.lookAt(d.building.position.clone().add(new THREE.Vector3(0, 1.2, 0)))
      } else if (g.phase === 'focusOut') {
        g.focusT += dt
        const k = easeInOut(Math.min(1, g.focusT / 1.2))
        camera.position.lerpVectors(g.camFrom, g.camTo, k)
        camera.lookAt(g.lookFrom.clone().lerp(g.lookTo, k))
        if (g.focusT >= 1.2) {
          g.phase = 'play'
          g.focused = null
          camCtrl.init = false
        }
      }

      destObjs.forEach((o, i) => {
        const pulse = 0.5 + Math.sin(elapsed * 2 + i * 1.7) * 0.4
        o.flash.material.opacity = pulse
        o.ring.material.opacity = pulse
      })
      clouds.forEach(c => {
        c.position.x += c.userData.speed * dt
        if (c.position.x > c.userData.bounds) c.position.x = -c.userData.bounds
      })
      if (g.phase !== 'idle') {
        sun.position.copy(vehicle.position).add(new THREE.Vector3(40, 60, 30))
        sun.target.position.copy(vehicle.position)
      }
      effects.update(dt, elapsed, g.phase === 'idle' || g.phase === 'intro' ? null : vehicle)

      if (g.phase === 'play' && !g.pausedFlag) {
        const nearby = interaction.update(vehicle.position) || null
        if ((nearby ? nearby.key : null) !== lastNearbyKey) { setNearbyDest(nearby); lastNearbyKey = nearby ? nearby.key : null }
        if (!g.focused && nearby && input.consumePress('e')) beginFocus(nearby.key)
      }
      if (g.phase === 'focusShow' && (input.consumePress('escape') || input.consumePress('x') || g.closeReq)) {
        g.closeReq = false
        exitFocus()
      }

      if (g.phase === 'play' && !g.pausedFlag) {
        if (input.consumePress('r')) {
          vehicle.position.set(0, 0, 15); vehicle.heading = 0.15; vehicle.speed = 0; vehicle.vy = 0; vehicle.grounded = true
          vehicle.wheelY.forEach((_, i) => { vehicle.wheelY[i] = terrainHeight(0, 15); vehicle.wheelVel[i] = 0 })
        }
        if (input.consumePress('p')) {
          g.pausedFlag = !g.pausedFlag
          setPaused(g.pausedFlag)
          if (g.pausedFlag) audio.stop()
        }
        if (input.consumePress('m')) {
          setSoundOn(prev => !prev)
        }
      }

      const pct = Math.round((Math.abs(vehicle.speed) / vehicle.maxSpeed) * 100)
      if (Math.abs(pct - g.lastPct) > 1) {
        g.lastPct = pct
        setSpeedPct(pct)
        if (speedText) speedText.textContent = String(Math.round((pct / 100) * 120))
      }
      const gear = vehicle.speed > 0.5 ? 'D' : vehicle.speed < -0.5 ? 'R' : 'N'
      if (gear !== g.lastGear) { g.lastGear = gear; if (gearText) gearText.textContent = gear }
      if (gaugeFill) {
        const deg = -120 + (g.lastPct / 100) * 240
        gaugeFill.style.background = `conic-gradient(#ffd479 ${deg}deg, rgba(255,255,255,0.07) ${deg}deg)`
      }

      if (g.phase === 'play' && !g.pausedFlag) {
        g.nextDest = interaction.dests.filter(d => !g.visited.has(d.key))[0] || null
        if (g.nextDest && arrow && banner) {
          const dx = g.nextDest.pos.x - vehicle.position.x, dz = g.nextDest.pos.z - vehicle.position.z
          const fx = -Math.sin(vehicle.heading), fz = -Math.cos(vehicle.heading)
          const rel = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz)
          arrow.style.transform = `translate(-50%, -50%) rotate(${rel * 180 / Math.PI}deg)`
          bannerLabel.textContent = g.nextDest.label.toUpperCase()
          bannerDist.textContent = `${Math.round(Math.sqrt(dx * dx + dz * dz))}m`
          banner.style.opacity = 1
        } else if (banner) banner.style.opacity = 0
      }

      const visPct = Math.round((g.visited.size / g.destObjs.length) * 100)
      if (progressFill) progressFill.style.width = `${visPct}%`
      if (progressText) progressText.textContent = `${g.visited.size}/${g.destObjs.length}`

      if (!g.completed && g.visited.size === g.destObjs.length) {
        g.completed = true
        effects.confetti(new THREE.Vector3(vehicle.position.x, 12, vehicle.position.z))
        setComplete(true)
        setTimeout(() => setComplete(false), 7000)
      }

      if (minimapRef.current) {
        const mc = minimapRef.current.getContext('2d')
        drawMinimap(mc, minimapRef.current.width, minimapRef.current.height, curves, DESTINATIONS, vehicle.position, vehicle.heading, g.visited)
      }

      renderer.render(scene, camera)
    }

    function beginFocus(key) {
      const idx = DESTINATIONS.findIndex(d => d.key === key)
      if (idx < 0) return
      g.destIndex = idx
      g.focused = key
      g.vehicle.paused = true
      audio.stop()
      input.clearAll()
      const bPos = g.destObjs[idx].building.position
      const view = approachView(bPos, vehicle.position)
      g.camFrom.copy(camera.position)
      g.lookFrom.copy(bPos).add(new THREE.Vector3(0, 1, 0))
      g.camTo.copy(view.pos)
      g.lookTo.copy(view.look)
      g.focusT = 0
      g.phase = 'focusIn'
      if (!g.visited.has(key)) { g.visited.add(key); setVisited(new Set(g.visited)) }
      setInView(true)
    }

    function exitFocus() {
      input.clearAll()
      g.vehicle.paused = false
      g.camFrom.copy(camera.position)
      g.lookFrom.copy(camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(8)))
      const v = behindCarView(vehicle)
      g.camTo.copy(v.pos)
      g.lookTo.copy(v.look)
      g.focusT = 0
      g.phase = 'focusOut'
      setActivePanel(null)
      setInView(false)
      setPaused(false)
      g.pausedFlag = false
    }

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    animate()

    gameRef.current = g
    gameRef.current.start = () => {
      g.vehicle.paused = false
      audio.start()
      audio.setVolume(soundOn ? soundVol * 0.01 : 0)
      g.phase = 'intro'
      g.introT = 0
      const v = behindCarView(vehicle)
      g.introEnd.copy(v.pos)
      g.introEndLook.copy(v.look)
      g.camFrom.copy(camera.position)
      setPaused(false)
      g.pausedFlag = false
    }
    gameRef.current.beginFocus = beginFocus
    gameRef.current.exitFocus = exitFocus
    gameRef.current.setVolume = v => audio.setVolume(v)

    return () => {
      g._dead = true
      window.removeEventListener('resize', onResize)
      input.destroy()
      camCtrl.destroy()
      audio.destroy()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose() })
        }
      })
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('pd-sound-on', JSON.stringify(soundOn))
      localStorage.setItem('pd-sound-vol', String(soundVol))
    } catch (e) {}
    gameRef.current?.setVolume?.(soundOn ? soundVol * 0.01 : 0)
  }, [soundOn, soundVol])

  useEffect(() => {
    if (started && !loading) gameRef.current?.start?.()
  }, [started, loading])

  const handleStart = () => setStarted(true)
  const closePanel = () => { if (gameRef.current) gameRef.current.closeReq = true }
  const panelConfig = activePanel ? PANEL_CONTENT[activePanel] : null

  useEffect(() => {
    const dot = domRefs.current.cursorDot, ring = domRefs.current.cursorRing
    if (!dot || !ring) return
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y
    const onMove = (e) => { x = e.clientX; y = e.clientY }
    window.addEventListener('mousemove', onMove)
    let raf
    const loop = () => {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16
      dot.style.transform = `translate(${x}px, ${y}px)`
      ring.style.transform = `translate(${rx}px, ${ry}px)`
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div className="cursor-dot" ref={el => { domRefs.current.cursorDot = el }} />
      <div className="cursor-ring" ref={el => { domRefs.current.cursorRing = el }} />

      {loading && (
        <div className="loading-overlay">
          <div className="loader-logo">PORTFOLIO <span className="accent">DRIVE</span></div>
          <div className="loader-bar"><div className="loader-fill" style={{ width: `${loadingPct}%` }} /></div>
          <div className="loader-text">{loadingPct}%</div>
        </div>
      )}

      {!loading && !started && (
        <div className="welcome-overlay">
          <h1>PORTFOLIO <span className="accent">DRIVE</span></h1>
          <p className="subtitle">A journey through my world &mdash; drive, explore, discover</p>
          <div className="controls-grid">
            <span className="key">W / S</span><span className="action">Drive / Brake</span>
            <span className="key">A / D</span><span className="action">Turn</span>
            <span className="key">E</span><span className="action">Enter a section</span>
            <span className="key">R</span><span className="action">Respawn</span>
            <span className="key">P</span><span className="action">Pause</span>
            <span className="key">ESC / X</span><span className="action">Close panel</span>
          </div>
          <button className="start-btn" onClick={handleStart}>Enter the World</button>
        </div>
      )}

      {started && !loading && (
        <div className="hud-overlay">
          <div className="hud-brand">
            <div className="brand-title">PORTFOLIO DRIVE</div>
            <div className="progress-row">
              <div className="progress-bg"><div className="progress-fill" ref={el => { domRefs.current.progressFill = el }} /></div>
              <div className="progress-text" ref={el => { domRefs.current.progressText = el }}>0/4</div>
            </div>
          </div>

          <div className="banner-wrap" ref={el => { domRefs.current.bannerWrap = el }}>
            <div className="banner-arrow" ref={el => { domRefs.current.destArrow = el }}>
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 2 L20 22 L12 16 L4 22 Z" fill="#ffd479" /></svg>
            </div>
            <div className="banner-label" ref={el => { domRefs.current.bannerLabel = el }}>ABOUT</div>
            <div className="banner-dist" ref={el => { domRefs.current.bannerDist = el }}>0m</div>
          </div>

          {paused && !activePanel && (
            <div className="pause-overlay"><div className="pause-box">PAUSED <span className="dim">&middot; press P to resume</span></div></div>
          )}

          {complete && !activePanel && (
            <div className="complete-card">
              <div className="complete-title">JOURNEY COMPLETE</div>
              <div className="complete-sub">You found every corner of my world &mdash; keep driving, explore on.</div>
            </div>
          )}

          {nearbyDest && !activePanel && !inView && (
            <div className="interact-indicator">
              <span className="e-key">E</span> VIEW {nearbyDest.label.toUpperCase()}
            </div>
          )}

          {activePanel && panelConfig && (
            <>
              <div className="panel-backdrop" onClick={closePanel} />
              <div className="hud-panel" style={{ borderLeft: `3px solid ${panelConfig.accent}` }}>
                <div className="panel-header">
                  <h2>
                    <span className="panel-visit" style={{ color: panelConfig.accent }}>SECTION {DESTINATIONS.findIndex(d => d.key === activePanel) + 1}/4 &middot; </span>
                    {panelConfig.title}
                  </h2>
                  <button className="close-btn" onClick={closePanel}>&times;</button>
                </div>
                {panelConfig.body(PORTFOLIO.user)}
                <div className="esc-hint">PRESS ESC OR X TO CLOSE</div>
              </div>
            </>
          )}

          <div className="driving-hud">
            <div className="gauge">
              <div className="gauge-fill" ref={el => { domRefs.current.gaugeFill = el }} />
              <div className="gauge-inner">
                <div className="gear" ref={el => { domRefs.current.gearText = el }}>N</div>
                <div className="speed-val"><span className="speed-num" ref={el => { domRefs.current.speedText = el }}>0</span><span className="speed-unit">km/h</span></div>
              </div>
            </div>
            <div className="controls-hint-bottom">WASD DRIVE &middot; E ENTER &middot; R RESPAWN &middot; P PAUSE &middot; M SOUND</div>
          </div>

          <button className="settings-btn" onClick={() => setShowSettings(v => !v)} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {soundOn
                ? <><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>
                : <><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></>}
            </svg>
          </button>

          {showSettings && (
            <div className="settings-box" onClick={e => e.stopPropagation()}>
              <div className="settings-title">SOUND</div>
              <div className="settings-row">
                <span className="settings-label">Engine &amp; wind</span>
                <button className={`settings-toggle ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn(v => !v)}>
                  {soundOn ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="settings-row">
                <span className="settings-label">Volume</span>
                <input
                  className="volume-slider"
                  type="range" min="0" max="100" step="5"
                  value={soundVol}
                  onChange={e => setSoundVol(Number(e.target.value))}
                />
                <span className="settings-val">{soundVol}%</span>
              </div>
              <div className="settings-hint">M toggles sound while driving</div>
            </div>
          )}

          <canvas ref={minimapRef} width={176} height={176} className="minimap" />
        </div>
      )}

      <div className="grain" />
      <div className="vignette" />
    </div>
  )
}