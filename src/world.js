import * as THREE from 'three'
import { DESTINATIONS } from './data'

const ROAD_WIDTH = 8

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
  c.width = 512; c.height = 512
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#5a8749'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    const r = 12 + Math.random() * 42
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const tone = Math.random() * 0.5
    g.addColorStop(0, `rgba(${40 + Math.floor(tone * 90)}, ${95 + Math.floor(tone * 70)}, 26, 0.22)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    const r = 2 + Math.random() * 5
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(20,40,10,0.12)'
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

function createAsphaltTexture() {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#43434a'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 256, y = Math.random() * 256
    ctx.fillStyle = `rgba(${Math.floor(Math.random() * 90 + 40)},${Math.floor(Math.random() * 90 + 40)},${Math.floor(Math.random() * 90 + 45)},${0.25 + Math.random() * 0.4})`
    ctx.fillRect(x, y, 1.2, 1.2)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

function createRoadMesh(curve, width, material, terrain, segments = 150) {
  const verts = [], uvs = [], idx = []
  const points = curve.getSpacedPoints(segments)
  for (let i = 0; i < points.length; i++) {
    const t = i / segments
    const p = points[i]
    const y = (terrain ? terrain(p.x, p.z) : 0) + 0.01
    const tan = curve.getTangent(t)
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
    const l = p.clone().addScaledVector(perp, width / 2)
    const r = p.clone().addScaledVector(perp, -width / 2)
    verts.push(l.x, y, l.z, r.x, y, r.z)
    uvs.push(0, i * 0.5, 1, i * 0.5)
    if (i < segments) {
      const b = i * 2
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, material)
}

function createDashes(curve, count = 40, dashLen = 2.2, terrain) {
  const geo = new THREE.PlaneGeometry(0.16, dashLen)
  const mat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const p = curve.getPoint(t)
    const y = (terrain ? terrain(p.x, p.z) : 0) + 0.02
    const tan = curve.getTangent(t)
    const a = Math.atan2(-tan.x, -tan.z)
    dummy.position.set(p.x, y, p.z)
    dummy.rotation.set(-Math.PI / 2, 0, a)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function createEdgeLines(curve, width, terrain, y = 0.02, sp = 110) {
  const points = curve.getSpacedPoints(sp)
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 })
  for (const side of [-1, 1]) {
    const verts = [], idx = []
    for (let i = 0; i < points.length; i++) {
      const t = i / sp
      const p = points[i]
      const yv = (terrain ? terrain(p.x, p.z) : 0) + y
      const tan = curve.getTangent(t)
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const off = side * (width / 2 + 0.15)
      const a = p.clone().addScaledVector(perp, off - 0.06)
      const c = p.clone().addScaledVector(perp, off + 0.06)
      verts.push(a.x, yv, a.z, c.x, yv, c.z)
      if (i < points.length - 1) {
        const b = i * 2
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, mat))
  }
  return group
}

function createBillboardTexture(label, subtitle, colorHex) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024; canvas.height = 512
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'rgba(10, 12, 20, 0.94)'
  roundRectPath(ctx, 0, 0, 1024, 512, 22); ctx.fill()
  ctx.strokeStyle = colorHex; ctx.lineWidth = 5
  roundRectPath(ctx, 5, 5, 1014, 502, 18); ctx.stroke()
  ctx.strokeStyle = colorHex + '55'; ctx.lineWidth = 1.5
  roundRectPath(ctx, 18, 18, 988, 476, 14); ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 92px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(label, 512, 205)
  ctx.strokeStyle = colorHex; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(330, 320); ctx.lineTo(694, 320); ctx.stroke()
  ctx.fillStyle = colorHex
  ctx.font = '38px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(subtitle, 512, 400)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function makeTerrain() {
  return function terrainHeight(x, z) {
    return 0.5 * Math.sin(x * 0.03 + 1.2) * Math.sin(z * 0.028 + 0.4)
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
    [new THREE.Vector3(0, 0, -42), new THREE.Vector3(0, 0, -55), new THREE.Vector3(0, 0, -68), new THREE.Vector3(0, 0, -80)],
    [new THREE.Vector3(42, 0, 0), new THREE.Vector3(55, 0, 0), new THREE.Vector3(68, 0, 0), new THREE.Vector3(80, 0, 0)],
    [new THREE.Vector3(0, 0, 42), new THREE.Vector3(0, 0, 55), new THREE.Vector3(0, 0, 68), new THREE.Vector3(0, 0, 80)],
    [new THREE.Vector3(-42, 0, 0), new THREE.Vector3(-55, 0, 0), new THREE.Vector3(-68, 0, 0), new THREE.Vector3(-80, 0, 0)],
  ]
  const loop = new THREE.CatmullRomCurve3(loopPts, true, 'catmullrom', 0.6)
  curvesOut.push(loop)
  const roadMat = new THREE.MeshStandardMaterial({
    map: createAsphaltTexture(), color: 0xb0b0b6, roughness: 0.85, metalness: 0.05,
  })
  const set = [loop, ...branches.map(pts => new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5))]
  set.forEach((c, i) => {
    curvesOut.push(c)
    scene.add(createRoadMesh(c, ROAD_WIDTH, roadMat, terrain))
    scene.add(createDashes(c, i === 0 ? 70 : 22, 2.0, terrain))
    scene.add(createEdgeLines(c, ROAD_WIDTH, terrain))
  })
  return { curves: set }
}

function buildGround(scene, terrain) {
  const geo = new THREE.PlaneGeometry(280, 280, 100, 100)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, terrain(x, z) - 0.02)
  }
  geo.computeVertexNormals()
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 60)
  }
  const groundTex = createGroundTexture()
  const mat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0xffffff, roughness: 1 })
  const ground = new THREE.Mesh(geo, mat)
  ground.receiveShadow = true
  scene.add(ground)
}

function buildTrees(scene, roadCurves, destPositions, terrain, collisionSystem) {
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.28, 1.8, 5)
  const leafGeo = new THREE.ConeGeometry(1.1, 2.8, 5)
  const count = 90
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 1 }), count)
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2d6a3e, roughness: 0.9 }), count)
  const dummy = new THREE.Object3D()
  const roadSamples = []
  roadCurves.forEach(c => c.getSpacedPoints(150).forEach(p => roadSamples.push({ x: p.x, z: p.z })))
  const clearSpot = (x, z) => {
    for (let i = 0; i < roadSamples.length; i++) {
      const dx = x - roadSamples[i].x, dz = z - roadSamples[i].z
      if (dx * dx + dz * dz < 64) return false
    }
    for (const d of destPositions) {
      const dx = x - d[0], dz = z - d[2]
      if (dx * dx + dz * dz < 400) return false
    }
    return true
  }
  let i = 0, guard = 0
  while (i < count && guard < count * 10) {
    guard++
    const ring = i % 3
    const rMin = 55 + ring * 16, rMax = rMin + 12
    const a = Math.random() * Math.PI * 2
    const r = rMin + Math.random() * (rMax - rMin)
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    if (!clearSpot(x, z)) continue
    const y = terrain(x, z)
    const s = 0.8 + Math.random() * 0.5
    dummy.position.set(x, y + 0.9 * s, z)
    dummy.scale.set(s, s, s)
    dummy.rotation.set(0, Math.random() * Math.PI, 0)
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, y + 2.9 * s, z)
    dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix)
    collisionSystem.addSphere(new THREE.Vector3(x, y + 0.4, z), 0.45)
    i++
  }
  scene.add(trunks); scene.add(leaves)
}

function buildRocks(scene, terrain, collisionSystem) {
  const geo = new THREE.DodecahedronGeometry(1.4)
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1, flatShading: true })
  const count = 30
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 95 + Math.random() * 16
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const y = terrain(x, z)
    const s = 1 + Math.random() * 2.0
    dummy.position.set(x, y + 0.5, z)
    dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    dummy.scale.set(s, s * 0.7, s)
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix)
    collisionSystem.addSphere(new THREE.Vector3(x, y + 0.3, z), 1.0 + s * 0.4)
  }
  scene.add(mesh)
}

function buildStreetLamps(scene, loopCurve, terrain) {
  const points = loopCurve.getSpacedPoints(40)
  const group = new THREE.Group()
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5, 6)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
  const headGeo = new THREE.BoxGeometry(0.7, 0.2, 0.3)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffe6aa, emissiveIntensity: 1.2 })
  const dummy = new THREE.Object3D()
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, points.length)
  const heads = new THREE.InstancedMesh(headGeo, headMat, points.length)
  for (let i = 0; i < points.length; i++) {
    const side = i % 2 === 0 ? 6.2 : -6.2
    const p = points[i]
    const yb = (terrain ? terrain(p.x, p.z) : 0)
    const tan = loopCurve.getTangent(i / points.length)
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
    const pos = p.clone().addScaledVector(perp, side)
    dummy.position.set(pos.x, yb + 2.5, pos.z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix)
    dummy.position.set(pos.x, yb + 4.9, pos.z)
    dummy.rotation.set(0, Math.atan2(-tan.x, -tan.z), 0)
    dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix)
  }
  group.add(poles); group.add(heads)
  scene.add(group)
}

function buildDestination(scene, dest, terrain, collisionSystem) {
  const [cx, , cz] = dest.position
  const [bx, , bz] = dest.building
  const y0 = (terrain ? terrain(bx, bz) : 0)

  const platform = new THREE.Mesh(
    new THREE.CircleGeometry(13, 32),
    new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 0.9 })
  )
  platform.rotation.x = -Math.PI / 2
  platform.position.set(bx, y0 + 0.02, bz)
  platform.receiveShadow = true
  scene.add(platform)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10, 11.5, 40),
    new THREE.MeshBasicMaterial({ color: dest.colorInt, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(bx, y0 + 0.04, bz)
  scene.add(ring)

  const building = new THREE.Mesh(
    new THREE.BoxGeometry(5, 4, 3.5),
    new THREE.MeshStandardMaterial({ color: dest.colorInt, roughness: 0.5 })
  )
  building.position.set(bx, y0 + 2, bz)
  building.castShadow = true
  scene.add(building)

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.35, 4.1),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  )
  roof.position.set(bx, y0 + 4.2, bz)
  scene.add(roof)

  const texture = createBillboardTexture(dest.label, dest.subtitle, dest.color)
  const billboardMat = new THREE.MeshStandardMaterial({
    map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.5, side: THREE.DoubleSide,
  })
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), billboardMat)
  billboard.position.set(cx, y0 + dest.billboardY, cz)
  billboard.rotation.y = dest.rotation
  scene.add(billboard)

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888 })
  ;[[-4, 0], [4, 0]].forEach(([px, pz]) => {
    for (let h = 1; h < dest.billboardY - 1; h += 2.5) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6), poleMat)
      post.position.set(cx + (Math.cos(dest.rotation) * px - Math.sin(dest.rotation) * pz), y0 + h + 1, cz + (Math.sin(dest.rotation) * px + Math.cos(dest.rotation) * pz))
      scene.add(post)
    }
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x444444 }))
    foot.position.set(cx + (Math.cos(dest.rotation) * px - Math.sin(dest.rotation) * pz), y0 + 0.2, cz + (Math.sin(dest.rotation) * px + Math.cos(dest.rotation) * pz))
    foot.castShadow = true
    scene.add(foot)
  })

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({
      color: dest.colorInt, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  )
  flash.rotation.x = -Math.PI / 2
  flash.position.set(bx, y0 + 0.35, bz)
  scene.add(flash)

  collisionSystem.addBox(
    new THREE.Vector3(bx - 3, y0, bz - 2),
    new THREE.Vector3(bx + 3, y0 + 5, bz + 2)
  )

  return { building, billboard, ring, flash }
}

function buildFences(scene, terrain) {
  const limit = 114
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 1 })
  const postMat = new THREE.MeshStandardMaterial({ color: 0x7a4c22, roughness: 1 })
  const postGeo = new THREE.BoxGeometry(0.12, 1.3, 0.12)
  const postPos = []
  for (let p = -limit; p <= limit + 0.001; p += 6) {
    postPos.push([p, limit], [p, -limit], [limit, p], [-limit, p])
  }
  const postMesh = new THREE.InstancedMesh(postGeo, postMat, postPos.length)
  postMesh.castShadow = true
  const dummy = new THREE.Object3D()
  postPos.forEach(([x, z], i) => {
    const y = terrain ? terrain(x, z) : 0
    dummy.position.set(x, y + 0.65, z)
    dummy.rotation.set(0, 0, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    postMesh.setMatrixAt(i, dummy.matrix)
  })
  scene.add(postMesh)
  for (const side of [limit, -limit]) {
    const mid = terrain ? terrain(0, side) : 0
    for (const h of [0.55, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(limit * 2, 0.08, 0.07), woodMat)
      rail.position.set(0, mid + h, side); rail.castShadow = true
      scene.add(rail)
    }
  }
  for (const side of [limit, -limit]) {
    const mid = terrain ? terrain(side, 0) : 0
    for (const h of [0.55, 1.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, limit * 2), woodMat)
      rail.position.set(side, mid + h, 0); rail.castShadow = true
      scene.add(rail)
    }
  }
}

function buildMountains(scene) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3a55, roughness: 1, flatShading: true })
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 1, flatShading: true })
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3
    const r = 155 + Math.random() * 45
    const x = Math.cos(a) * r, z = Math.sin(a) * r
    const h = 28 + Math.random() * 38
    const w = 42 + Math.random() * 55
    const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), rockMat)
    m.position.set(x, h / 2 - 3, z)
    m.rotation.y = Math.random() * Math.PI
    m.castShadow = true
    scene.add(m)
    if (i % 2 === 0) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(w * 0.35, h * 0.2, 6), snowMat)
      snow.position.set(x, h - h * 0.1, z)
      scene.add(snow)
    }
  }
}

function buildStartZone(scene) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(10, 32),
    new THREE.MeshStandardMaterial({ color: 0x232833, roughness: 0.9 })
  )
  pad.rotation.x = -Math.PI / 2
  pad.position.set(0, 0.01, 15)
  pad.receiveShadow = true
  scene.add(pad)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.set(0, 0.02, 15)
  scene.add(ring)
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 160
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 512, 160)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 84px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('START', 256, 78)
  ctx.font = '34px "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = '#9bd0ff'
  ctx.fillText('PORTFOLIO DRIVE', 256, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const txt = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  )
  txt.rotation.x = -Math.PI / 2
  txt.position.set(0, 0.05, 15)
  scene.add(txt)
}

function buildSky(scene) {
  const skyGeo = new THREE.SphereGeometry(380, 32, 20)
  const skyCanvas = document.createElement('canvas')
  skyCanvas.width = 1; skyCanvas.height = 256
  const ctx = skyCanvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#1a1035')
  grad.addColorStop(0.25, '#2d3a6e')
  grad.addColorStop(0.5, '#e87040')
  grad.addColorStop(0.72, '#f4a858')
  grad.addColorStop(1.0, '#f7d794')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 1, 256)
  const skyTex = new THREE.CanvasTexture(skyCanvas)
  skyTex.magFilter = THREE.LinearFilter
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  const sky = new THREE.Mesh(skyGeo, skyMat)
  sky.position.y = 20
  scene.add(sky)

  const sunCanvas = document.createElement('canvas')
  sunCanvas.width = 128; sunCanvas.height = 128
  const sctx = sunCanvas.getContext('2d')
  const sg = sctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  sg.addColorStop(0, 'rgba(255,240,200,1)')
  sg.addColorStop(0.15, 'rgba(255,200,120,0.95)')
  sg.addColorStop(0.45, 'rgba(255,140,60,0.35)')
  sg.addColorStop(1, 'rgba(255,100,40,0)')
  sctx.fillStyle = sg; sctx.fillRect(0, 0, 128, 128)
  const sunTex = new THREE.CanvasTexture(sunCanvas)
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }))
  sunSprite.scale.set(65, 65, 1)
  sunSprite.position.set(30, 55, -200)
  scene.add(sunSprite)

  const clouds = []
  const cloudCanvas = document.createElement('canvas')
  cloudCanvas.width = 256; cloudCanvas.height = 128
  const ccCtx = cloudCanvas.getContext('2d')
  const cg = ccCtx.createRadialGradient(128, 64, 10, 128, 64, 100)
  cg.addColorStop(0, 'rgba(255,255,255,0.45)')
  cg.addColorStop(0.5, 'rgba(255,230,200,0.18)')
  cg.addColorStop(1, 'rgba(255,200,150,0)')
  ccCtx.fillStyle = cg; ccCtx.fillRect(0, 0, 256, 128)
  const cloudTex = new THREE.CanvasTexture(cloudCanvas)
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, fog: false, transparent: true, opacity: 0.45, depthWrite: false })
    const cloud = new THREE.Sprite(mat)
    const sx = 40 + Math.random() * 50
    const sy = 10 + Math.random() * 10
    cloud.scale.set(sx, sy, 1)
    cloud.position.set((Math.random() - 0.5) * 400, 35 + Math.random() * 30, (Math.random() - 0.5) * 400)
    cloud.userData.speed = 0.6 + Math.random() * 1.2
    cloud.userData.bounds = 220
    scene.add(cloud)
    clouds.push(cloud)
  }
  return clouds
}

export function buildWorld(scene, collisionSystem) {
  const curvesOut = []
  const terrain = makeTerrain()
  const { curves } = buildRoadNetwork(scene, curvesOut, terrain)
  buildGround(scene, terrain)
  buildStartZone(scene)
  buildTrees(scene, curves, DESTINATIONS.map(d => d.position), terrain, collisionSystem)
  buildRocks(scene, terrain, collisionSystem)
  buildStreetLamps(scene, curves[0], terrain)
  buildFences(scene, terrain)
  buildMountains(scene)
  const destObjs = DESTINATIONS.map(d => buildDestination(scene, d, terrain, collisionSystem))
  const clouds = buildSky(scene)
  return { curves, destObjs, terrainHeight: terrain, clouds }
}