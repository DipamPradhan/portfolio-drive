import * as THREE from 'three'
import { DESTINATIONS } from './data'

const ROAD_WIDTH = 9
const WORLD_SIZE = 280

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

function createGroundTexture() {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 1024
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#49683c'; ctx.fillRect(0, 0, 1024, 1024)
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024
    const r = 8 + Math.random() * 55
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = Math.random() > 0.5
    g.addColorStop(0, dark ? 'rgba(25,45,18,0.25)' : 'rgba(120,145,55,0.20)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024
    const len = 2 + Math.random() * 8
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(160,175,90,0.18)' : 'rgba(20,35,15,0.16)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y - len * 0.25); ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function createDirtTexture() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#705a3e'; ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    const v = 45 + Math.random() * 55
    ctx.fillStyle = `rgba(${v + 30},${v + 15},${v * 0.65},${0.15 + Math.random() * 0.28})`
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function createAsphaltTexture() {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#35383c'; ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    const v = Math.floor(55 + Math.random() * 70)
    ctx.fillStyle = `rgba(${v},${v},${v},${0.18 + Math.random() * 0.32})`
    ctx.fillRect(x, y, 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8
  return tex
}

function createRoadMesh(curve, width, material, terrain, segments = 180) {
  const verts = [], uvs = [], idx = []
  const points = curve.getSpacedPoints(segments)
  for (let i = 0; i < points.length; i++) {
    const t = i / segments
    const p = points[i]
    const y = terrain(p.x, p.z) + 0.035
    const tan = curve.getTangent(t)
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
    const l = p.clone().addScaledVector(perp, width / 2)
    const r = p.clone().addScaledVector(perp, -width / 2)
    verts.push(l.x, terrain(l.x, l.z) + 0.04, l.z, r.x, terrain(r.x, r.z) + 0.04, r.z)
    uvs.push(0, i * 0.42, 1, i * 0.42)
    if (i < segments) {
      const b = i * 2
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx); geo.computeVertexNormals()
  const mesh = new THREE.Mesh(geo, material)
  mesh.receiveShadow = true
  return mesh
}

function createDashes(curve, count, terrain) {
  const geo = new THREE.PlaneGeometry(0.13, 2.4)
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.8 })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const p = curve.getPoint(t), tan = curve.getTangent(t)
    dummy.position.set(p.x, terrain(p.x, p.z) + 0.055, p.z)
    dummy.rotation.set(-Math.PI / 2, 0, Math.atan2(-tan.x, -tan.z))
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function createEdgeLines(curve, width, terrain) {
  const points = curve.getSpacedPoints(130)
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0xb9b6a9, roughness: 0.9 })
  for (const side of [-1, 1]) {
    const verts = [], idx = []
    for (let i = 0; i < points.length; i++) {
      const t = i / 130, p = points[i]
      const tan = curve.getTangent(t)
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const off = side * (width / 2 + 0.16)
      const a = p.clone().addScaledVector(perp, off - 0.055)
      const b = p.clone().addScaledVector(perp, off + 0.055)
      verts.push(a.x, terrain(a.x, a.z) + 0.06, a.z, b.x, terrain(b.x, b.z) + 0.06, b.z)
      if (i < 130) {
        const n = i * 2; idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setIndex(idx); geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, mat))
  }
  return group
}

function createBillboardTexture(label, subtitle, colorHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#10151a'; roundRectPath(ctx, 0, 0, 1024, 512, 28); ctx.fill()
  ctx.strokeStyle = colorHex; ctx.lineWidth = 6; roundRectPath(ctx, 7, 7, 1010, 498, 22); ctx.stroke()
  ctx.fillStyle = '#ffffff'; ctx.font = '800 88px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label.toUpperCase(), 512, 210)
  ctx.strokeStyle = colorHex; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(280, 315); ctx.lineTo(744, 315); ctx.stroke()
  ctx.fillStyle = '#cbd2d8'; ctx.font = '36px system-ui, sans-serif'; ctx.fillText(subtitle, 512, 390)
  return new THREE.CanvasTexture(canvas)
}

function makeTerrain() {
  const smoothPulse = (v) => {
    const x = THREE.MathUtils.clamp(v, 0, 1)
    return x * x * (3 - 2 * x)
  }
  return function terrainHeight(x, z) {
    let y = 0.55 * Math.sin(x * 0.027 + 1.1) * Math.sin(z * 0.024 + 0.3)
    y += 0.22 * Math.sin(x * 0.071 - z * 0.045)
    y += 0.12 * Math.sin((x + z) * 0.13)

    // A smooth monster-truck jump line through the central off-road arena.
    // These height changes are deliberately broad so the vehicle suspension can follow them.
    const jump1 = Math.exp(-(((x - 18) ** 2) / 80 + ((z - 18) ** 2) / 42)) * 2.6
    const jump2 = Math.exp(-(((x - 18) ** 2) / 75 + ((z - 2) ** 2) / 48)) * 1.9
    const jump3 = Math.exp(-(((x - 18) ** 2) / 90 + ((z + 18) ** 2) / 58)) * 2.9
    const bank = Math.exp(-(((x + 18) ** 2) / 180 + (z ** 2) / 120)) * 0.9
    y += jump1 + jump2 + jump3 + bank

    // Flatten the spawn and destination approaches so the vehicle never starts on a slope.
    const spawnFalloff = Math.exp(-((x * x) / 180 + ((z - 15) ** 2) / 140))
    y *= 1 - spawnFalloff * 0.95
    return y
  }
}

function buildRoadNetwork(scene, curvesOut, terrain) {
  const loopPts = [
    new THREE.Vector3(-35, 0, -25), new THREE.Vector3(-15, 0, -42),
    new THREE.Vector3(15, 0, -42), new THREE.Vector3(35, 0, -25),
    new THREE.Vector3(42, 0, 0), new THREE.Vector3(35, 0, 25),
    new THREE.Vector3(15, 0, 42), new THREE.Vector3(-15, 0, 42),
    new THREE.Vector3(-35, 0, 25), new THREE.Vector3(-42, 0, 0),
  ]
  const branches = [
    [new THREE.Vector3(0, 0, -42), new THREE.Vector3(0, 0, -56), new THREE.Vector3(0, 0, -69), new THREE.Vector3(0, 0, -80)],
    [new THREE.Vector3(42, 0, 0), new THREE.Vector3(56, 0, 0), new THREE.Vector3(69, 0, 0), new THREE.Vector3(80, 0, 0)],
    [new THREE.Vector3(0, 0, 42), new THREE.Vector3(0, 0, 56), new THREE.Vector3(0, 0, 69), new THREE.Vector3(0, 0, 80)],
    [new THREE.Vector3(-42, 0, 0), new THREE.Vector3(-56, 0, 0), new THREE.Vector3(-69, 0, 0), new THREE.Vector3(-80, 0, 0)],
  ]
  const loop = new THREE.CatmullRomCurve3(loopPts, true, 'catmullrom', 0.6)
  const roadMat = new THREE.MeshStandardMaterial({ map: createAsphaltTexture(), color: 0x9b9a96, roughness: 0.88, metalness: 0.02 })
  const set = [loop, ...branches.map(pts => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5))]
  set.forEach((curve, i) => {
    curvesOut.push(curve)
    scene.add(createRoadMesh(curve, ROAD_WIDTH, roadMat, terrain))
    scene.add(createDashes(curve, i === 0 ? 70 : 24, terrain))
    scene.add(createEdgeLines(curve, ROAD_WIDTH, terrain))
  })
  return { curves: set }
}

function buildGround(scene, terrain) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 140, 140)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, terrain(x, z) - 0.04)
  }
  geo.computeVertexNormals()
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 55, uv.getY(i) * 55)
  const mat = new THREE.MeshStandardMaterial({ map: createGroundTexture(), roughness: 1 })
  const ground = new THREE.Mesh(geo, mat); ground.receiveShadow = true; scene.add(ground)

  // Irregular rectangular dirt arena. It follows the same terrain so it never
  // becomes the floating circular patch that used to sit under the destination signs.
  const patchW = 62, patchD = 58, seg = 20
  const patchGeo = new THREE.PlaneGeometry(patchW, patchD, seg, seg)
  patchGeo.rotateX(-Math.PI / 2)
  const pp = patchGeo.attributes.position
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i) + 18, z = pp.getZ(i) + 2
    pp.setY(i, terrain(x, z) + 0.015)
    pp.setX(i, x); pp.setZ(i, z)
  }
  patchGeo.computeVertexNormals()
  const dirt = new THREE.Mesh(patchGeo, new THREE.MeshStandardMaterial({ map: createDirtTexture(), color: 0x8a7658, roughness: 1 }))
  dirt.receiveShadow = true; scene.add(dirt)
}

function buildTrees(scene, roadCurves, destPositions, terrain, collisionSystem) {
  const count = 150
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 7)
  const crownGeo = new THREE.ConeGeometry(1.8, 5.5, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3523, roughness: 1 })
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x294d2d, roughness: 1 })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count)
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count)
  const dummy = new THREE.Object3D(), used = []
  let made = 0, attempts = 0
  while (made < count && attempts < count * 25) {
    attempts++
    const x = (Math.random() - 0.5) * 220, z = (Math.random() - 0.5) * 220
    const r = Math.hypot(x, z)
    if (r < 52 || r > 108) continue
    if (Math.abs(x) < 9 || Math.abs(z) < 9) continue
    if (Math.abs(x - 18) < 24 && Math.abs(z) < 30) continue
    let near = false
    for (const curve of roadCurves) {
      // Curves do not expose a cheap closest-point query in this project, so
      // sample each road densely enough to keep trees safely off the roadway.
      for (let s = 0; s <= 24; s++) {
        const p = curve.getPoint(s / 24)
        if (Math.hypot(x - p.x, z - p.z) < 11) { near = true; break }
      }
      if (near) break
    }
    for (const d of destPositions) if (Math.hypot(x - d[0], z - d[2]) < 15) near = true
    if (near) continue
    used.push([x, z])
    const y = terrain(x, z), h = 2.2 + Math.random() * 2.8, s = 0.7 + Math.random() * 0.7
    dummy.position.set(x, y + 1.1, z); dummy.scale.set(s, h / 3.2, s); dummy.rotation.y = Math.random() * Math.PI
    dummy.updateMatrix(); trunks.setMatrixAt(made, dummy.matrix)
    dummy.position.set(x, y + 2.4, z); dummy.scale.set(s, h / 3.2, s); dummy.updateMatrix(); crowns.setMatrixAt(made, dummy.matrix)
    collisionSystem.addSphere(new THREE.Vector3(x, y, z), 1.1)
    made++
  }
  trunks.count = made; crowns.count = made; trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true
  trunks.castShadow = true; crowns.castShadow = true; crowns.receiveShadow = true
  scene.add(trunks); scene.add(crowns)
}

function buildShrubs(scene, terrain) {
  const count = 110
  const geo = new THREE.DodecahedronGeometry(0.55, 0)
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f6735, roughness: 1, flatShading: true })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = 48 + Math.random() * 55
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrain(x, z)
    const s = 0.6 + Math.random() * 1.1
    dummy.position.set(x, y + 0.45 * s, z); dummy.scale.set(s, s * (0.7 + Math.random() * 0.4), s); dummy.rotation.set(Math.random(), Math.random(), Math.random())
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; scene.add(mesh)
}

function buildRocks(scene, terrain, collisionSystem) {
  const count = 70
  const geo = new THREE.DodecahedronGeometry(1, 1)
  const mat = new THREE.MeshStandardMaterial({ color: 0x625d56, roughness: 1, flatShading: true })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 82
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (Math.abs(x - 18) < 28 && Math.abs(z) < 35) { i--; continue }
    const y = terrain(x, z), s = 0.45 + Math.random() * 1.7
    dummy.position.set(x, y + s * 0.55, z); dummy.scale.set(s * 1.2, s * 0.7, s); dummy.rotation.set(Math.random(), Math.random(), Math.random())
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix)
    collisionSystem.addSphere(new THREE.Vector3(x, y, z), Math.max(0.7, s * 0.7))
  }
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh)
}

function makeBox(scene, geometry, material, x, y, z, rotY = 0, shadow = true) {
  const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.rotation.y = rotY
  m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m
}

function buildParkour(scene, terrain, collisionSystem) {
  const group = new THREE.Group(); group.name = 'monster-truck-parkour'
  const dirtMat = new THREE.MeshStandardMaterial({ map: createDirtTexture(), color: 0x967452, roughness: 1 })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.85, metalness: 0.15 })
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x60422c, roughness: 1 })
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc86d32, roughness: 0.75 })

  // Starting gate for the off-road course.
  makeBox(scene, new THREE.BoxGeometry(0.45, 5, 0.45), darkMat, 13, terrain(13, 30) + 2.5, 30)
  makeBox(scene, new THREE.BoxGeometry(0.45, 5, 0.45), darkMat, 23, terrain(23, 30) + 2.5, 30)
  makeBox(scene, new THREE.BoxGeometry(10.5, 0.5, 0.5), stripeMat, 18, terrain(18, 30) + 4.5, 30)

  // Three visible jump tables. They sit directly over the matching terrain bumps.
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x75553a, roughness: 1 })
  const rampGeo = new THREE.CylinderGeometry(5.8, 7.2, 11, 12, 1, false, -Math.PI / 2, Math.PI)
  for (const z of [18, 2, -18]) {
    const ramp = new THREE.Mesh(rampGeo, rampMat)
    ramp.rotation.z = Math.PI / 2
    ramp.rotation.y = Math.PI / 2
    ramp.position.set(18, terrain(18, z) + 0.05, z)
    ramp.scale.set(1, 0.28, 1)
    ramp.castShadow = true; ramp.receiveShadow = true; group.add(ramp)
  }

  // Timber bridge with side rails; the center is open underneath so it reads as a raised obstacle.
  const bridgeZ = -1
  makeBox(scene, new THREE.BoxGeometry(11, 0.55, 7), woodMat, 18, terrain(18, bridgeZ) + 1.1, bridgeZ, 0)
  for (const x of [13, 23]) {
    makeBox(scene, new THREE.BoxGeometry(0.25, 1.6, 7.2), darkMat, x, terrain(x, bridgeZ) + 2.0, bridgeZ)
  }
  // Intentionally no collision box here: the bridge is a drive-over obstacle,
  // and the terrain/suspension handles the truck crossing it.

  // Slalom gates on the flat approach.
  for (let i = 0; i < 7; i++) {
    const z = 30 - i * 8
    const side = i % 2 ? -1 : 1
    const x = 18 + side * 5.5
    const y = terrain(x, z)
    makeBox(scene, new THREE.CylinderGeometry(0.11, 0.14, 2.2, 8), stripeMat, x, y + 1.1, z)
  }

  // Large tractor-tire obstacles beside the course.
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x17191a, roughness: 0.98 })
  for (let i = 0; i < 4; i++) {
    const x = 6 + (i % 2) * 24, z = 10 - Math.floor(i / 2) * 18
    const y = terrain(x, z)
    const tire = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.55, 10, 20), tireMat)
    tire.rotation.x = Math.PI / 2; tire.position.set(x, y + 2.2, z); tire.castShadow = true; group.add(tire)
  }

  // Rock step line, sized so the monster truck can climb it.
  const stepMat = new THREE.MeshStandardMaterial({ color: 0x57524b, roughness: 1, flatShading: true })
  for (let i = 0; i < 5; i++) {
    const x = 32 + i * 2.3, z = -22 + i * 1.2, y = terrain(x, z)
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), stepMat)
    rock.scale.set(1.25, 0.8, 1.1); rock.position.set(x, y + 0.8, z); rock.rotation.y = i * 0.7; rock.castShadow = true; group.add(rock)
  }

  // Course signage without any glowing circular target underneath it.
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 256
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#11161a'; ctx.fillRect(0, 0, 768, 256)
  ctx.strokeStyle = '#f08a3c'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 752, 240)
  ctx.fillStyle = '#fff'; ctx.font = '800 62px system-ui'; ctx.textAlign = 'center'; ctx.fillText('OFF-ROAD PARKOUR', 384, 105)
  ctx.fillStyle = '#c9d0d5'; ctx.font = '30px system-ui'; ctx.fillText('JUMPS  •  BRIDGE  •  ROCK CRAWL', 384, 168)
  const signTex = new THREE.CanvasTexture(canvas)
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8, side: THREE.DoubleSide })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.35), signMat)
  sign.position.set(18, terrain(18, 33) + 4.0, 33); sign.rotation.y = Math.PI; sign.castShadow = true; group.add(sign)

  scene.add(group)
}

function buildTrailMarkers(scene, terrain) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b3028, roughness: 1 })
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xe27737, roughness: 0.8 })
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.1, r = 38 + (i % 3) * 2
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = terrain(x, z)
    makeBox(scene, new THREE.CylinderGeometry(0.035, 0.05, 1.4, 6), poleMat, x, y + 0.7, z)
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.35), flagMat)
    flag.position.set(x + 0.28, y + 1.12, z); flag.rotation.y = Math.random() * Math.PI; scene.add(flag)
  }
}

function buildStreetLamps(scene, curve, terrain) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.7, metalness: 0.45 })
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe7b5, emissive: 0xffb45c, emissiveIntensity: 1.3 })
  const group = new THREE.Group()
  for (let i = 0; i < 36; i++) {
    const t = i / 36, p = curve.getPoint(t), tan = curve.getTangent(t)
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
    const pos = p.clone().addScaledVector(perp, ROAD_WIDTH / 2 + 2.4)
    const y = terrain(pos.x, pos.z)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.09, 5.2, 7), poleMat)
    pole.position.set(pos.x, y + 2.6, pos.z); group.add(pole)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lampMat)
    head.position.set(pos.x, y + 5.15, pos.z); group.add(head)
  }
  scene.add(group)
}

function buildFences(scene, terrain) {
  const limit = 114
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6d4b2e, roughness: 1 })
  const railMat = new THREE.MeshStandardMaterial({ color: 0x795738, roughness: 1 })
  const geo = new THREE.BoxGeometry(0.16, 1.5, 0.16)
  const positions = []
  for (let p = -limit; p <= limit; p += 6) positions.push([p, limit], [p, -limit], [limit, p], [-limit, p])
  const mesh = new THREE.InstancedMesh(geo, postMat, positions.length), dummy = new THREE.Object3D()
  positions.forEach(([x, z], i) => { dummy.position.set(x, terrain(x, z) + 0.75, z); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix) })
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; scene.add(mesh)
  for (const side of [limit, -limit]) {
    const y = terrain(0, side)
    for (const h of [0.55, 1.15]) makeBox(scene, new THREE.BoxGeometry(limit * 2, 0.09, 0.09), railMat, 0, y + h, side)
  }
  for (const side of [limit, -limit]) {
    const y = terrain(side, 0)
    for (const h of [0.55, 1.15]) makeBox(scene, new THREE.BoxGeometry(0.09, 0.09, limit * 2), railMat, side, y + h, 0)
  }
}

function buildDestination(scene, dest, terrain, collisionSystem) {
  const [cx, , cz] = dest.position
  const [bx, , bz] = dest.building
  const y0 = terrain(bx, bz)

  // Rectangular plaza replaces the old circular platform/ring, eliminating the distracting circle beneath every billboard.
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(18, 0.18, 11), new THREE.MeshStandardMaterial({ color: 0x292d30, roughness: 0.9 }))
  plaza.position.set(bx, y0 + 0.09, bz); plaza.receiveShadow = true; scene.add(plaza)
  for (let i = -2; i <= 2; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.012, 0.12), new THREE.MeshStandardMaterial({ color: dest.colorInt, roughness: 0.7 }))
    stripe.position.set(bx + i * 3.0, y0 + 0.19, bz + 4.2); scene.add(stripe)
  }

  const buildingMat = new THREE.MeshStandardMaterial({ color: 0x4c5558, roughness: 0.75, metalness: 0.08 })
  const accentMat = new THREE.MeshStandardMaterial({ color: dest.colorInt, roughness: 0.45, metalness: 0.15 })
  const building = makeBox(scene, new THREE.BoxGeometry(6.5, 4.2, 4.5), buildingMat, bx, y0 + 2.1, bz)
  const accent = makeBox(scene, new THREE.BoxGeometry(6.7, 0.18, 4.7), accentMat, bx, y0 + 4.25, bz)
  const roof = makeBox(scene, new THREE.BoxGeometry(7.1, 0.32, 5.1), new THREE.MeshStandardMaterial({ color: 0x202427, roughness: 0.8 }), bx, y0 + 4.48, bz)
  roof.castShadow = true; accent.castShadow = true

  // Glass entrance and small awning.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8db5bf, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.7 })
  makeBox(scene, new THREE.BoxGeometry(2.0, 2.4, 0.08), glassMat, bx, y0 + 1.35, bz - 2.27)
  makeBox(scene, new THREE.BoxGeometry(3.2, 0.16, 1.2), accentMat, bx, y0 + 2.75, bz - 2.55)

  const texture = createBillboardTexture(dest.label, dest.subtitle, dest.color)
  const billboardMat = new THREE.MeshStandardMaterial({ map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.35, side: THREE.DoubleSide })
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), billboardMat)
  billboard.position.set(cx, y0 + dest.billboardY + 0.6, cz); billboard.rotation.y = dest.rotation; billboard.castShadow = true; scene.add(billboard)

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x34393d, roughness: 0.65, metalness: 0.5 })
  for (const px of [-4.4, 4.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 7.0, 8), poleMat)
    post.position.set(cx + Math.cos(dest.rotation) * px, y0 + 3.2, cz - Math.sin(dest.rotation) * px)
    post.castShadow = true; scene.add(post)
  }

  // A thin rectangular light strip instead of a giant glowing circle.
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.22), new THREE.MeshBasicMaterial({ color: dest.colorInt, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
  flash.position.set(bx, y0 + 0.23, bz + 4.6); flash.rotation.y = dest.rotation; scene.add(flash)

  collisionSystem.addBox(new THREE.Vector3(bx - 3.4, y0, bz - 2.4), new THREE.Vector3(bx + 3.4, y0 + 5, bz + 2.4))
  return { building, billboard, ring: null, flash, plaza }
}



function createBrandBillboardTexture(title, subtitle, accent = '#f0a14a', dark = '#10161b') {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 512
  const ctx = c.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 1024, 512)
  grad.addColorStop(0, dark); grad.addColorStop(0.55, '#202b31'); grad.addColorStop(1, '#0c1115')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1024, 512)
  ctx.strokeStyle = accent; ctx.lineWidth = 10; ctx.strokeRect(18, 18, 988, 476)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(42, 42, 940, 8)
  ctx.fillStyle = accent; ctx.font = '900 74px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, 62, 170)
  ctx.fillStyle = '#f3f5f6'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText(subtitle, 64, 225)
  ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.font = '500 22px system-ui, sans-serif'; ctx.fillText('EXPLORE • BUILD • DRIVE', 64, 278)
  ctx.fillStyle = accent; ctx.font = '900 31px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('MapidX', 958, 452)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '600 17px system-ui, sans-serif'; ctx.fillText('PORTFOLIO DRIVE', 958, 477)
  return new THREE.CanvasTexture(c)
}

function buildCreativeBillboards(scene, terrain, curves) {
  const ideas = [
    ['MapidX', 'THE DIGITAL TRAIL', '#f0a14a'],
    ['KEEP EXPLORING', 'There is always another route.', '#67d4ff'],
    ['BUILT TO CREATE', 'Ideas become experiences.', '#d67cff'],
    ['OFF-ROAD MODE', 'Take the rough path.', '#6ee7a8'],
    ['FULL-STACK // 3D', 'Code it. Shape it. Drive it.', '#ffd166'],
    ['NO SHORTCUTS', 'Build something people remember.', '#ff6f61'],
    ['FIND YOUR LINE', 'Speed is optional. Curiosity is not.', '#9ad1ff'],
    ['MAPIDX GARAGE', 'Where code meets horsepower.', '#ff9f43'],
  ]
  const candidates = [
    [-112, -42, 0.35], [-105, 48, -0.45], [-72, -112, 0.15], [38, -116, -0.2],
    [112, -55, 1.15], [116, 42, 2.0], [62, 112, 3.0], [-46, 116, -2.6],
    [-126, 88, -0.7], [126, -98, 2.25], [-128, -92, 0.65], [96, 118, 2.8],
  ]

  const roadPoints = []
  for (const curve of curves) {
    for (let i = 0; i <= 40; i++) roadPoints.push(curve.getPoint(i / 40))
  }

  let made = 0
  for (let i = 0; i < candidates.length; i++) {
    const [x, z, rot] = candidates[i]
    // Keep signs away from roads, the central stunt arena, and destination plazas.
    if (Math.hypot(x, z) < 62) continue
    if (roadPoints.some(p => Math.hypot(p.x - x, p.z - z) < ROAD_WIDTH * 1.7)) continue

    const [title, subtitle, accent] = ideas[i % ideas.length]
    const y = terrain(x, z)
    const group = new THREE.Group()
    group.position.set(x, y + 4.4, z)
    group.rotation.y = rot

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x252b2f, roughness: 0.62, metalness: 0.5 })
    const frame = new THREE.Mesh(new THREE.BoxGeometry(8.9, 4.9, 0.18), frameMat)
    frame.castShadow = true; frame.receiveShadow = true; group.add(frame)

    const tex = createBrandBillboardTexture(title, subtitle, accent)
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.35, 4.18), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.24, side: THREE.DoubleSide }))
    board.position.z = -0.11; group.add(board)

    for (const px of [-3.55, 3.55]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.0, 8), frameMat)
      post.position.set(px, -2.45, 0); post.castShadow = true; group.add(post)
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.12, 0.12), frameMat)
    brace.position.set(0, -2.0, 0); group.add(brace)

    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.75 })
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.08, 0.06), lampMat)
    lamp.position.set(0, 2.18, -0.18); group.add(lamp)

    scene.add(group)
    made++
  }

  // A large landmark sign makes the MapidX identity visible from the central roads.
  const signX = -48, signZ = -48, sy = terrain(signX, signZ)
  const hero = new THREE.Group(); hero.position.set(signX, sy + 5.5, signZ); hero.rotation.y = Math.PI * 0.25
  const heroFrame = new THREE.Mesh(new THREE.BoxGeometry(11.5, 5.7, 0.24), new THREE.MeshStandardMaterial({ color: 0x1c2327, roughness: 0.6, metalness: 0.55 }))
  heroFrame.castShadow = true; hero.add(heroFrame)
  const heroTex = createBrandBillboardTexture('MapidX', 'WELCOME TO THE PORTFOLIO DRIVE', '#ffb454', '#111820')
  const heroBoard = new THREE.Mesh(new THREE.PlaneGeometry(10.9, 5.1), new THREE.MeshStandardMaterial({ map: heroTex, emissive: 0xffffff, emissiveMap: heroTex, emissiveIntensity: 0.3, side: THREE.DoubleSide }))
  heroBoard.position.z = -0.14; hero.add(heroBoard)
  for (const px of [-4.6, 4.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 6.0, 8), new THREE.MeshStandardMaterial({ color: 0x343b40, roughness: 0.65, metalness: 0.45 }))
    post.position.set(px, -2.85, 0); post.castShadow = true; hero.add(post)
  }
  scene.add(hero)
  return made + 1
}

function buildMountains(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x343c49, roughness: 1, flatShading: true })
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xbcc7d0, roughness: 1, flatShading: true })
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.1, r = 155 + Math.random() * 40
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 30 + Math.random() * 45, w = 35 + Math.random() * 45
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 8), rockMat)
    m.position.set(x, h / 2 - 5, z); m.rotation.y = Math.random() * Math.PI; m.castShadow = true; scene.add(m)
    if (i % 2 === 0) { const s = new THREE.Mesh(new THREE.ConeGeometry(w * 0.34, h * 0.24, 7), snowMat); s.position.set(x, h - 6, z); scene.add(s) }
  }
}

function buildStartZone(scene, terrain) {
  const y = terrain(0, 15)
  // Rectangular launch pad: no circular start marker.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(14, 0.16, 22), new THREE.MeshStandardMaterial({ color: 0x24292d, roughness: 0.9 }))
  pad.position.set(0, y + 0.08, 15); pad.receiveShadow = true; scene.add(pad)
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf0a14a, roughness: 0.75 })
  for (const z of [7, 15, 23]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(11, 0.025, 0.16), lineMat); line.position.set(0, y + 0.18, z); scene.add(line)
  }
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 180
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#11161a'; ctx.fillRect(0, 0, 768, 180); ctx.strokeStyle = '#f0a14a'; ctx.lineWidth = 7; ctx.strokeRect(5, 5, 758, 170)
  ctx.fillStyle = '#fff'; ctx.font = '800 64px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PORTFOLIO DRIVE', 384, 95)
  const tex = new THREE.CanvasTexture(canvas)
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.35), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
  txt.rotation.x = -Math.PI / 2; txt.position.set(0, y + 0.2, 15); scene.add(txt)

  // Start gantry gives the spawn a real off-road-event feel.
  const gantryMat = new THREE.MeshStandardMaterial({ color: 0x25292c, roughness: 0.7, metalness: 0.45 })
  for (const x of [-6.2, 6.2]) makeBox(scene, new THREE.BoxGeometry(0.35, 4.5, 0.35), gantryMat, x, y + 2.25, 25)
  makeBox(scene, new THREE.BoxGeometry(12.7, 0.35, 0.35), gantryMat, 0, y + 4.35, 25)
}

function buildUtilityPoles(scene, terrain) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.8, metalness: 0.35 })
  const wireMat = new THREE.LineBasicMaterial({ color: 0x24282b, transparent: true, opacity: 0.7 })
  const pts = []
  for (let i = -90; i <= 90; i += 15) {
    const x = i, z = -112, y = terrain(x, z)
    makeBox(scene, new THREE.CylinderGeometry(0.06, 0.09, 7, 7), poleMat, x, y + 3.5, z)
    const arm = makeBox(scene, new THREE.BoxGeometry(2.1, 0.08, 0.08), poleMat, x, y + 6.3, z)
    pts.push(new THREE.Vector3(x, y + 6.3, z))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts); scene.add(new THREE.Line(geo, wireMat))
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(380, 32, 20)
  const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 256
  const ctx = canvas.getContext('2d'), grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#111827'); grad.addColorStop(0.28, '#25395e'); grad.addColorStop(0.55, '#b15e46'); grad.addColorStop(0.78, '#e7a15b'); grad.addColorStop(1, '#f1cf91')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1, 256)
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.BackSide, fog: false }))
  sky.position.y = 25; scene.add(sky)

  const sunCanvas = document.createElement('canvas'); sunCanvas.width = 128; sunCanvas.height = 128
  const sctx = sunCanvas.getContext('2d'), sg = sctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  sg.addColorStop(0, 'rgba(255,248,220,1)'); sg.addColorStop(0.2, 'rgba(255,205,130,0.95)'); sg.addColorStop(0.5, 'rgba(255,145,70,0.3)'); sg.addColorStop(1, 'rgba(255,100,40,0)')
  sctx.fillStyle = sg; sctx.fillRect(0, 0, 128, 128)
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sunCanvas), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }))
  sun.scale.set(70, 70, 1); sun.position.set(45, 62, -190); scene.add(sun)

  const clouds = []
  const cloudCanvas = document.createElement('canvas'); cloudCanvas.width = 256; cloudCanvas.height = 128
  const cc = cloudCanvas.getContext('2d'), cg = cc.createRadialGradient(128, 64, 10, 128, 64, 100)
  cg.addColorStop(0, 'rgba(255,255,255,0.38)'); cg.addColorStop(0.55, 'rgba(240,230,215,0.14)'); cg.addColorStop(1, 'rgba(255,190,140,0)')
  cc.fillStyle = cg; cc.fillRect(0, 0, 256, 128)
  const cloudTex = new THREE.CanvasTexture(cloudCanvas)
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, opacity: 0.35 + Math.random() * 0.2, depthWrite: false }))
    cloud.scale.set(35 + Math.random() * 55, 8 + Math.random() * 12, 1)
    cloud.position.set((Math.random() - 0.5) * 420, 34 + Math.random() * 35, (Math.random() - 0.5) * 420)
    cloud.userData.speed = 0.4 + Math.random() * 0.8; cloud.userData.bounds = 230
    scene.add(cloud); clouds.push(cloud)
  }
  return clouds
}

export function buildWorld(scene, collisionSystem) {
  const curvesOut = []
  const terrain = makeTerrain()
  const { curves } = buildRoadNetwork(scene, curvesOut, terrain)
  buildGround(scene, terrain)
  buildStartZone(scene, terrain)
  buildParkour(scene, terrain, collisionSystem)
  buildTrees(scene, curves, DESTINATIONS.map(d => d.position), terrain, collisionSystem)
  buildShrubs(scene, terrain)
  buildRocks(scene, terrain, collisionSystem)
  buildTrailMarkers(scene, terrain)
  buildCreativeBillboards(scene, terrain, curves)
  buildStreetLamps(scene, curves[0], terrain)
  buildUtilityPoles(scene, terrain)
  buildFences(scene, terrain)
  buildMountains(scene)
  const destObjs = DESTINATIONS.map(d => buildDestination(scene, d, terrain, collisionSystem))
  const clouds = buildSky(scene)
  return { curves, destObjs, terrainHeight: terrain, clouds }
}
