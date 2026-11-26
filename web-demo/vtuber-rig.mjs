/**
 * Awesome-OS Zero-Asset Procedural 3D VTuber Rig (Three.js)
 * ---------------------------------------------------------
 * 100% procedural geometry + CanvasTexture (zero .glb / .vrm / .png assets).
 * Edit CHARACTER_PRESETS below to restyle or script your own VTuber character!
 */

export const CHARACTER_PRESETS = {
  lumi: {
    name: 'Lumi Chromatic',
    skin: '#ffe0c8',
    blush: '#ff8da1',
    hairPrimary: '#38bdf8',
    hairAccent: '#818cf8',
    eyeIris: '#34d399',
    eyeHighlight: '#ffffff',
    outfitPrimary: '#1e293b',
    outfitTrim: '#38bdf8',
    scarfColor: '#f43f5e',
    dragonPrimary: '#f8fafc',
    dragonAccent: '#38bdf8',
    headphones: true,
    catEars: true,
    haloRing: true,
  },
  omarchy: {
    name: 'Omarchy Cyber',
    skin: '#fde2cf',
    blush: '#f7768e',
    hairPrimary: '#7aa2f7',
    hairAccent: '#bb9af7',
    eyeIris: '#9ece6a',
    eyeHighlight: '#ffffff',
    outfitPrimary: '#1a1b26',
    outfitTrim: '#7aa2f7',
    scarfColor: '#e0af68',
    dragonPrimary: '#c0caf5',
    dragonAccent: '#bb9af7',
    headphones: true,
    catEars: false,
    haloRing: true,
  },
  dragon: {
    name: 'White Dragon Spirit',
    skin: '#fff1e6',
    blush: '#fda4af',
    hairPrimary: '#f8fafc',
    hairAccent: '#60a5fa',
    eyeIris: '#f59e0b',
    eyeHighlight: '#ffffff',
    outfitPrimary: '#0f172a',
    outfitTrim: '#34d399',
    scarfColor: '#38bdf8',
    dragonPrimary: '#ffffff',
    dragonAccent: '#34d399',
    headphones: false,
    catEars: true,
    haloRing: true,
  },
};

/** Procedural CanvasTexture for glossy anime eyes (zero .png assets) */
function createEyeTexture(THREE, irisHex, highlightHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // Sclera
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  // Upper eyelid soft shadow
  const shadow = ctx.createLinearGradient(0, 0, 0, 120);
  shadow.addColorStop(0, 'rgba(30,41,59,0.28)');
  shadow.addColorStop(1, 'rgba(30,41,59,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, 256, 120);

  // Outer iris gradient
  const grad = ctx.createRadialGradient(128, 134, 18, 128, 128, 86);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.35, irisHex);
  grad.addColorStop(0.82, irisHex);
  grad.addColorStop(1, '#0b101b');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(128, 132, 74, 86, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner bright crescent
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.arc(128, 166, 42, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.fill();

  // Pupil
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.ellipse(128, 130, 28, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Specular anime highlights
  ctx.fillStyle = highlightHex;
  ctx.beginPath();
  ctx.arc(102, 98, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(154, 152, 9, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural CanvasTexture for subtle stylized jacket/outfit fabric */
function createOutfitTexture(THREE, primaryHex, trimHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle diagonal weave + center zipper trim
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();
  }
  ctx.fillStyle = trimHex;
  ctx.fillRect(122, 0, 12, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the complete zero-asset procedural VTuber rig + orbiting White Dragon companion */
export function buildVtuberRig(THREE, preset = CHARACTER_PRESETS.lumi) {
  const root = new THREE.Group();

  const matSkin = new THREE.MeshStandardMaterial({ color: preset.skin, roughness: 0.45, metalness: 0.02 });
  const matBlush = new THREE.MeshStandardMaterial({
    color: preset.blush,
    roughness: 0.6,
    transparent: true,
    opacity: 0.42,
  });
  const matHair = new THREE.MeshStandardMaterial({ color: preset.hairPrimary, roughness: 0.32, metalness: 0.12 });
  const matHairAccent = new THREE.MeshStandardMaterial({
    color: preset.hairAccent,
    roughness: 0.25,
    metalness: 0.2,
    emissive: preset.hairAccent,
    emissiveIntensity: 0.12,
  });
  const matOutfit = new THREE.MeshStandardMaterial({
    map: createOutfitTexture(THREE, preset.outfitPrimary, preset.outfitTrim),
    roughness: 0.55,
    metalness: 0.08,
  });
  const matTrim = new THREE.MeshStandardMaterial({
    color: preset.outfitTrim,
    roughness: 0.22,
    metalness: 0.35,
    emissive: preset.outfitTrim,
    emissiveIntensity: 0.25,
  });
  const matScarf = new THREE.MeshStandardMaterial({ color: preset.scarfColor, roughness: 0.5 });

  // 1. Torso (LatheGeometry silhouette — zero .glb!)
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const torsoPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.56, 0.02),
    new THREE.Vector2(0.46, 0.55),
    new THREE.Vector2(0.36, 1.05),
    new THREE.Vector2(0.44, 1.38),
    new THREE.Vector2(0.22, 1.54),
    new THREE.Vector2(0.0, 1.56),
  ];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 32), matOutfit);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // Glowing tech collar / scarf
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.095, 16, 36), matScarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.48;
  scarf.castShadow = true;
  bodyGroup.add(scarf);

  const collarGlow = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 12, 36), matTrim);
  collarGlow.rotation.x = Math.PI / 2;
  collarGlow.position.y = 1.41;
  bodyGroup.add(collarGlow);

  // Arms (TubeGeometry along smooth CatmullRomCurve3)
  function makeArm(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.44, 1.36, 0);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.22, -0.35, 0.06),
      new THREE.Vector3(side * 0.16, -0.78, 0.16),
    ]);
    const armMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.11, 14, false), matOutfit);
    armMesh.castShadow = true;
    g.add(armMesh);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), matSkin);
    hand.position.set(side * 0.16, -0.82, 0.18);
    g.add(hand);
    return g;
  }
  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  bodyGroup.add(leftArm, rightArm);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.34, 20), matSkin);
  neck.position.y = 1.66;
  bodyGroup.add(neck);

  // 2. Head Group (pivot at neck for natural VTuber tracking!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.84, 0);
  bodyGroup.add(headGroup);

  // Sculpted stylized anime head (slightly tapered chin)
  const headGeo = new THREE.SphereGeometry(0.62, 36, 36);
  const pos = headGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const chinTaper = y < 0 ? 1.0 + y * 0.22 : 1.0;
    const cheekPull = y < 0 && z > 0 ? 1.03 : 1.0;
    pos.setXYZ(i, x * chinTaper * cheekPull, y * 1.06, z * 0.96);
  }
  headGeo.computeVertexNormals();
  const headMesh = new THREE.Mesh(headGeo, matSkin);
  headMesh.position.y = 0.42;
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Blush cheeks
  for (const side of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), matBlush);
    blush.position.set(side * 0.32, 0.30, 0.53);
    blush.rotation.y = side * 0.38;
    headGroup.add(blush);
  }

  // Expressive Eyes (CanvasTexture + blink scaling + pupil look-at!)
  const eyeTex = createEyeTexture(THREE, preset.eyeIris, preset.eyeHighlight);
  const matEye = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.15, metalness: 0.05 });
  const matBrow = new THREE.MeshStandardMaterial({ color: preset.hairPrimary, roughness: 0.4 });

  function makeEye(side) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.22, 0.44, 0.50);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 24), matEye);
    ball.scale.set(1.0, 1.12, 0.65);
    ball.rotation.y = -Math.PI / 2;
    eyePivot.add(ball);

    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 10, 24, Math.PI * 0.85), matOutfit);
    lash.position.set(0, 0.03, 0.05);
    lash.rotation.z = Math.PI * 0.08;
    eyePivot.add(lash);

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.14, 6, 12), matBrow);
    brow.rotation.z = Math.PI / 2 - side * 0.12;
    brow.position.set(side * 0.01, 0.21, 0.04);
    eyePivot.add(brow);
    return { eyePivot, ball, brow };
  }
  const leftEye = makeEye(-1);
  const rightEye = makeEye(1);
  headGroup.add(leftEye.eyePivot, rightEye.eyePivot);

  // Cute tiny nose
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 12), matSkin);
  nose.rotation.x = Math.PI / 2.2;
  nose.position.set(0, 0.34, 0.60);
  headGroup.add(nose);

  // Lip-sync animated Mouth
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, 0.18, 0.55);
  const mouthInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#9f1239', roughness: 0.4 }),
  );
  mouthInner.scale.set(1.25, 0.22, 0.45);
  mouthGroup.add(mouthInner);
  headGroup.add(mouthGroup);

  // Procedural Layered Anime Hair (back cap + curved TubeGeometry bangs + twin side locks!)
  const hairGroup = new THREE.Group();
  hairGroup.position.y = 0.44;
  headGroup.add(hairGroup);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.665, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.68), matHair);
  hairCap.rotation.x = -0.22;
  hairCap.castShadow = true;
  hairGroup.add(hairCap);

  // Flowing front bangs & side locks via CatmullRomCurve3
  const bangSpecs = [
    { x: -0.34, z: 0.46, drop: -0.36, r: 0.10, accent: false },
    { x: -0.14, z: 0.56, drop: -0.24, r: 0.095, accent: true },
    { x: 0.08, z: 0.58, drop: -0.28, r: 0.10, accent: false },
    { x: 0.30, z: 0.48, drop: -0.34, r: 0.095, accent: true },
    { x: -0.58, z: 0.14, drop: -0.78, r: 0.125, accent: false },
    { x: 0.58, z: 0.14, drop: -0.78, r: 0.125, accent: false },
  ];
  for (const b of bangSpecs) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(b.x * 0.55, 0.56, b.z * 0.45),
      new THREE.Vector3(b.x, 0.26, b.z),
      new THREE.Vector3(b.x * 1.06, b.drop, b.z * 0.92),
    ]);
    const strand = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 18, b.r, 12, false),
      b.accent ? matHairAccent : matHair,
    );
    strand.castShadow = true;
    hairGroup.add(strand);
  }

  // Ahoge (bouncy top hair strand!)
  const ahogeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.62, 0.05),
    new THREE.Vector3(0.08, 0.88, 0.12),
    new THREE.Vector3(0.24, 0.92, 0.02),
  ]);
  const ahoge = new THREE.Mesh(new THREE.TubeGeometry(ahogeCurve, 14, 0.045, 10, false), matHairAccent);
  hairGroup.add(ahoge);

  // Optional Cat/Fox Ears
  if (preset.catEars) {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.42, 4), matHair);
      ear.position.set(side * 0.38, 0.62, -0.02);
      ear.rotation.z = -side * 0.34;
      ear.rotation.y = side * 0.25;
      hairGroup.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.26, 4), matBlush);
      inner.position.set(side * 0.37, 0.60, 0.04);
      inner.rotation.z = -side * 0.34;
      hairGroup.add(inner);
    }
  }

  // Optional Cyber Headphones
  if (preset.headphones) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.045, 12, 36, Math.PI), matOutfit);
    band.position.y = 0.08;
    hairGroup.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 24), matOutfit);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.67, -0.02, 0.02);
      hairGroup.add(cup);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.024, 10, 24), matTrim);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(side * 0.73, -0.02, 0.02);
      hairGroup.add(ring);
    }
  }

  // Floating Chromatic Halo Ring
  let halo = null;
  if (preset.haloRing) {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.024, 14, 48), matTrim);
    halo.rotation.x = Math.PI / 2.2;
    halo.position.set(0, 1.05, -0.14);
    hairGroup.add(halo);
  }

  // 3. Orbiting Procedural Chibi White Dragon Companion (sculpted head, horns, eyes, dorsal ridge, scalloped wings!)
  const dragonOrbit = new THREE.Group();
  dragonOrbit.position.set(0, 2.25, 0);
  root.add(dragonOrbit);

  const dragonGroup = new THREE.Group();
  dragonGroup.position.set(1.42, 0.12, 0.25);
  dragonGroup.rotation.y = -0.35;
  dragonOrbit.add(dragonGroup);

  const matDragon = new THREE.MeshStandardMaterial({ color: preset.dragonPrimary, roughness: 0.28, metalness: 0.08 });
  const matDragonBelly = new THREE.MeshStandardMaterial({ color: '#e0f2fe', roughness: 0.4 });
  const matDragonGlow = new THREE.MeshStandardMaterial({
    color: preset.dragonAccent,
    emissive: preset.dragonAccent,
    emissiveIntensity: 0.48,
    roughness: 0.22,
    side: THREE.DoubleSide,
  });
  const matDragonHorn = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.25, metalness: 0.55 });
  const matDragonEye = new THREE.MeshStandardMaterial({
    color: '#10b981',
    emissive: '#34d399',
    emissiveIntensity: 0.9,
    roughness: 0.1,
  });

  // Plump chibi torso + tapering serpentine tail
  const dragonTorso = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), matDragon);
  dragonTorso.scale.set(0.95, 0.88, 1.35);
  dragonGroup.add(dragonTorso);

  const dragonBelly = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), matDragonBelly);
  dragonBelly.scale.set(0.85, 0.72, 1.15);
  dragonBelly.position.set(0, -0.045, 0.02);
  dragonGroup.add(dragonBelly);

  // Tapering tail segments + spade tip
  const tailSegs = [
    { z: -0.20, y: -0.02, r: 0.085 },
    { z: -0.32, y: -0.05, r: 0.062 },
    { z: -0.43, y: -0.03, r: 0.044 },
    { z: -0.53, y: 0.02, r: 0.030 },
  ];
  for (const seg of tailSegs) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(seg.r, 12, 12), matDragon);
    s.position.set(0, seg.y, seg.z);
    dragonGroup.add(s);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(seg.r * 0.45, seg.r * 1.4, 4), matDragonGlow);
    fin.position.set(0, seg.y + seg.r * 1.1, seg.z);
    fin.rotation.x = -0.35;
    dragonGroup.add(fin);
  }
  // Glowing diamond tail spade
  const spadeShape = new THREE.Shape();
  spadeShape.moveTo(0, 0);
  spadeShape.lineTo(0.07, 0.06);
  spadeShape.lineTo(0, 0.16);
  spadeShape.lineTo(-0.07, 0.06);
  spadeShape.closePath();
  const tailSpade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(spadeShape, { depth: 0.015, bevelEnabled: false }),
    matDragonGlow,
  );
  tailSpade.rotation.x = Math.PI / 2;
  tailSpade.position.set(0, 0.03, -0.55);
  dragonGroup.add(tailSpade);

  // Cute sculpted dragon head (cranium + snout + glowing eyes + swept-back golden horns!)
  const dHead = new THREE.Group();
  dHead.position.set(0, 0.10, 0.22);
  dragonGroup.add(dHead);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 18), matDragon);
  cranium.scale.set(1.0, 0.92, 1.05);
  dHead.add(cranium);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.14), matDragon);
  snout.position.set(0, -0.02, 0.12);
  dHead.add(snout);

  for (const side of [-1, 1]) {
    // Glowing emerald dragon eyes
    const dEye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), matDragonEye);
    dEye.position.set(side * 0.078, 0.025, 0.095);
    dHead.add(dEye);

    // Swept-back golden dragon horns
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.055, 0.085, -0.01),
      new THREE.Vector3(side * 0.11, 0.17, -0.10),
      new THREE.Vector3(side * 0.15, 0.22, -0.22),
    ]);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 12, 0.018, 8, false), matDragonHorn);
    dHead.add(horn);

    // Cute side cheek fins
    const earFin = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 4), matDragonGlow);
    earFin.position.set(side * 0.12, -0.01, -0.03);
    earFin.rotation.z = -side * 1.1;
    earFin.rotation.x = -0.4;
    dHead.add(earFin);
  }

  // Real scalloped dragon wings (ExtrudeGeometry pivoted at shoulders!)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.16, 0.22, 0.38, 0.20);
  wingShape.quadraticCurveTo(0.32, 0.08, 0.34, -0.04);
  wingShape.quadraticCurveTo(0.24, 0.02, 0.20, -0.09);
  wingShape.quadraticCurveTo(0.12, -0.02, 0.06, -0.10);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });

  const dragonWings = [];
  for (const side of [-1, 1]) {
    const wingPivot = new THREE.Group();
    wingPivot.position.set(side * 0.11, 0.07, 0.01);
    const wingMesh = new THREE.Mesh(wingGeo, matDragonGlow);
    if (side === -1) wingMesh.scale.x = -1;
    wingMesh.rotation.y = side * -0.25;
    wingPivot.add(wingMesh);
    dragonGroup.add(wingPivot);
    dragonWings.push(wingPivot);
  }

  // Rig state for smooth spring physics & live scripting
  const state = {
    expression: 'neutral',
    targetYaw: 0,
    targetPitch: 0,
    curYaw: 0,
    curPitch: 0,
    mouthOpen: 0,
    blinkTimer: 2.2,
    blinkAmount: 0,
    waveTimer: 0,
    bounceTimer: 0,
    dragonSpeed: 0.75,
  };

  function update(dt, elapsed) {
    // Smooth spring tracking
    state.curYaw += (state.targetYaw - state.curYaw) * Math.min(1, dt * 8);
    state.curPitch += (state.targetPitch - state.curPitch) * Math.min(1, dt * 8);

    // Idle breathing + optional bounce script
    const breath = Math.sin(elapsed * 2.2) * 0.025;
    const bounce = state.bounceTimer > 0 ? Math.abs(Math.sin(state.bounceTimer * 12)) * 0.18 : 0;
    if (state.bounceTimer > 0) state.bounceTimer = Math.max(0, state.bounceTimer - dt);

    bodyGroup.position.y = breath + bounce;
    bodyGroup.rotation.y = state.curYaw * 0.35;
    bodyGroup.rotation.z = -state.curYaw * 0.08 + Math.sin(elapsed * 1.4) * 0.02;

    headGroup.rotation.y = state.curYaw * 0.65;
    headGroup.rotation.x = state.curPitch * 0.55 + Math.sin(elapsed * 2.2 - 0.5) * 0.03;
    headGroup.rotation.z = -state.curYaw * 0.14;

    // Ahoge & halo bounce
    ahoge.rotation.z = Math.sin(elapsed * 4.5) * 0.08 - state.curYaw * 0.15;
    if (halo) {
      halo.rotation.z = elapsed * 0.8;
      halo.position.y = 1.05 + Math.sin(elapsed * 3.0) * 0.03;
    }

    // Wave animation
    if (state.waveTimer > 0) {
      state.waveTimer = Math.max(0, state.waveTimer - dt);
      rightArm.rotation.z = 2.1 + Math.sin(elapsed * 14) * 0.35;
      rightArm.rotation.x = -0.3;
    } else {
      rightArm.rotation.z += (Math.sin(elapsed * 1.8) * 0.06 - rightArm.rotation.z) * Math.min(1, dt * 6);
      rightArm.rotation.x += (0 - rightArm.rotation.x) * Math.min(1, dt * 6);
    }
    leftArm.rotation.z = -Math.sin(elapsed * 1.8) * 0.06;

    // Auto-blink
    state.blinkTimer -= dt;
    if (state.blinkTimer <= 0) {
      state.blinkAmount = 1;
      state.blinkTimer = 2.4 + Math.random() * 2.8;
    } else {
      state.blinkAmount = Math.max(0, state.blinkAmount - dt * 9);
    }

    // Expression modifiers
    let lEyeScaleY = 1.0 - state.blinkAmount * 0.92;
    let rEyeScaleY = 1.0 - state.blinkAmount * 0.92;
    let mouthW = 1.25;
    let mouthH = 0.18 + state.mouthOpen * 1.15;
    let browLift = 0;

    if (state.expression === 'happy') {
      lEyeScaleY = 0.25;
      rEyeScaleY = 0.25;
      mouthW = 1.65;
      mouthH = Math.max(0.55, mouthH);
      browLift = 0.04;
    } else if (state.expression === 'pog') {
      lEyeScaleY = 1.2;
      rEyeScaleY = 1.2;
      mouthW = 0.95;
      mouthH = Math.max(1.25, mouthH);
      browLift = 0.08;
    } else if (state.expression === 'wink') {
      rEyeScaleY = 0.15;
      mouthW = 1.45;
      browLift = 0.03;
    } else if (state.expression === 'sleepy') {
      lEyeScaleY = 0.38;
      rEyeScaleY = 0.38;
      mouthW = 0.85;
      browLift = -0.04;
    } else if (state.expression === 'hype') {
      lEyeScaleY = 1.18;
      rEyeScaleY = 1.18;
      mouthW = 1.8;
      mouthH = Math.max(0.85, mouthH);
      browLift = 0.07;
    }

    leftEye.eyePivot.scale.y = Math.max(0.08, lEyeScaleY);
    rightEye.eyePivot.scale.y = Math.max(0.08, rEyeScaleY);
    leftEye.brow.position.y = 0.21 + browLift;
    rightEye.brow.position.y = 0.21 + browLift;

    mouthInner.scale.set(mouthW, mouthH, 0.45);

    // Orbiting White Dragon companion (smooth shoulder-pivoted wing flap)
    dragonOrbit.rotation.y = elapsed * state.dragonSpeed;
    dragonGroup.position.y = 0.12 + Math.sin(elapsed * 3.5) * 0.16;
    const flap = Math.sin(elapsed * 10) * 0.52;
    dragonWings[0].rotation.z = -flap;
    dragonWings[1].rotation.z = flap;
  }

  return {
    root,
    state,
    update,
    api: {
      setExpression: (expr) => { state.expression = expr; },
      wave: (sec = 1.8) => { state.waveTimer = sec; },
      bounce: (sec = 1.2) => { state.bounceTimer = sec; },
      setLook: (yaw, pitch) => { state.targetYaw = yaw; state.targetPitch = pitch; },
      setMouth: (v) => { state.mouthOpen = Math.max(0, Math.min(1, v)); },
      setDragonSpeed: (s) => { state.dragonSpeed = s; },
    },
  };
}
