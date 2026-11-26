/**
 * Awesome-OS Zero-Asset Procedural 3D White Dragon VTuber Rig (Three.js)
 * ----------------------------------------------------------------------
 * 100% procedural geometry + CanvasTexture (zero .glb / .vrm / .png assets).
 * Edit CHARACTER_PRESETS below to customize your White Dragon VTuber!
 */

export const CHARACTER_PRESETS = {
  whiteDragon: {
    name: 'White Dragon (Lumi)',
    scales: '#f8fafc',
    belly: '#dbeafe',
    accent: '#38bdf8',
    wingMembrane: '#7dd3fc',
    horn: '#f59e0b',
    eyeIris: '#10b981',
    blush: '#fda4af',
    scarf: '#0ea5e9',
    haloRing: true,
    headphones: false,
  },
  cyberDragon: {
    name: 'Omarchy Cyber Dragon',
    scales: '#e2e8f0',
    belly: '#c7d2fe',
    accent: '#818cf8',
    wingMembrane: '#a78bfa',
    horn: '#38bdf8',
    eyeIris: '#34d399',
    blush: '#f472b6',
    scarf: '#1e1b4b',
    haloRing: true,
    headphones: true,
  },
  goldDragon: {
    name: 'Celestial Gold Dragon',
    scales: '#fffbeb',
    belly: '#fef3c7',
    accent: '#f59e0b',
    wingMembrane: '#fcd34d',
    horn: '#d97706',
    eyeIris: '#06b6d4',
    blush: '#fb7185',
    scarf: '#b45309',
    haloRing: true,
    headphones: false,
  },
};

/** Procedural CanvasTexture for glossy expressive dragon eyes (zero .png assets) */
function createDragonEyeTexture(THREE, irisHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  // Soft upper eyelid shadow
  const sh = ctx.createLinearGradient(0, 0, 0, 110);
  sh.addColorStop(0, 'rgba(15,23,42,0.28)');
  sh.addColorStop(1, 'rgba(15,23,42,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, 256, 110);

  // Luminous dragon iris
  const grad = ctx.createRadialGradient(128, 134, 16, 128, 130, 88);
  grad.addColorStop(0, '#ecfdf5');
  grad.addColorStop(0.42, irisHex);
  grad.addColorStop(0.85, irisHex);
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(128, 132, 76, 86, 0, 0, Math.PI * 2);
  ctx.fill();

  // Friendly vertical dragon slit pupil (rounded, cute!)
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.ellipse(128, 132, 22, 54, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bright anime sparkle highlights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(98, 96, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(156, 156, 10, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural CanvasTexture for subtle pearl dragon scales */
function createScaleTexture(THREE, baseHex, accentHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.lineWidth = 2;
  const r = 20;
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 10; col++) {
      const x = col * r * 1.6 + (row % 2 ? r * 0.8 : 0);
      const y = row * r * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI);
      ctx.stroke();
    }
  }
  // Subtle iridescent shimmer band
  const shimmer = ctx.createLinearGradient(0, 0, 256, 256);
  shimmer.addColorStop(0, 'rgba(255,255,255,0.08)');
  shimmer.addColorStop(0.5, accentHex + '14');
  shimmer.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = shimmer;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the Hero Procedural White Dragon VTuber Rig */
export function buildVtuberRig(THREE, preset = CHARACTER_PRESETS.whiteDragon) {
  const root = new THREE.Group();

  const scaleTex = createScaleTexture(THREE, preset.scales, preset.accent);
  const matScales = new THREE.MeshPhysicalMaterial({
    map: scaleTex,
    color: preset.scales,
    roughness: 0.22,
    metalness: 0.08,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
    iridescence: 0.95,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [140, 680],
  });
  const matBelly = new THREE.MeshPhysicalMaterial({
    color: preset.belly,
    roughness: 0.30,
    metalness: 0.04,
    iridescence: 0.55,
    iridescenceIOR: 1.3,
  });
  const matHorn = new THREE.MeshPhysicalMaterial({
    color: preset.horn,
    roughness: 0.20,
    metalness: 0.65,
    clearcoat: 0.8,
    iridescence: 0.6,
  });
  const matAccent = new THREE.MeshPhysicalMaterial({
    color: preset.accent,
    emissive: preset.accent,
    emissiveIntensity: 0.55,
    roughness: 0.16,
    metalness: 0.25,
    iridescence: 1.0,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 760],
  });
  const matWing = new THREE.MeshPhysicalMaterial({
    color: preset.wingMembrane,
    emissive: preset.accent,
    emissiveIntensity: 0.26,
    roughness: 0.18,
    metalness: 0.12,
    clearcoat: 0.9,
    iridescence: 1.0,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [120, 820],
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const matBlush = new THREE.MeshStandardMaterial({
    color: preset.blush,
    transparent: true,
    opacity: 0.42,
    roughness: 0.6,
  });
  const matMouth = new THREE.MeshStandardMaterial({ color: '#9f1239', roughness: 0.45 });
  const matTongue = new THREE.MeshStandardMaterial({ color: '#fb7185', roughness: 0.4 });
  const matScarf = new THREE.MeshStandardMaterial({ color: preset.scarf, roughness: 0.45 });

  // 1. Dragon Torso & Ribbed Belly Plates
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const torsoPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.66, 0.06),
    new THREE.Vector2(0.62, 0.55),
    new THREE.Vector2(0.50, 1.05),
    new THREE.Vector2(0.46, 1.42),
    new THREE.Vector2(0.28, 1.60),
    new THREE.Vector2(0.0, 1.62),
  ];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 32), matScales);
  torso.scale.set(1.0, 1.0, 0.92);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);

  // Ribbed dragon belly plates
  for (let i = 0; i < 6; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36 - i * 0.015, 0.38 - i * 0.015, 0.14, 20, 1, false, -0.7, 1.4), matBelly);
    plate.position.set(0, 0.34 + i * 0.18, 0.19);
    plate.scale.set(1.0, 0.85, 1.0);
    bodyGroup.add(plate);
  }

  // Stylish VTuber tech scarf around base of neck
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 14, 36), matScarf);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.50;
  bodyGroup.add(scarf);

  // Expressive Dragon Forepaws (Arms)
  function makePaw(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.52, 1.24, 0.16);
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(side * 0.24, -0.26, 0.14),
      new THREE.Vector3(side * 0.16, -0.58, 0.30),
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 18, 0.125, 14, false), matScales);
    arm.castShadow = true;
    g.add(arm);

    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 16), matScales);
    paw.scale.set(1.0, 0.85, 1.15);
    paw.position.set(side * 0.16, -0.60, 0.34);
    g.add(paw);

    // 3 cute rounded claws
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 8), matHorn);
      claw.rotation.x = Math.PI / 2.2;
      claw.position.set(side * 0.16 + c * 0.055, -0.63, 0.48);
      g.add(claw);
    }
    return g;
  }
  const leftArm = makePaw(-1);
  const rightArm = makePaw(1);
  bodyGroup.add(leftArm, rightArm);

  // 2. Majestic Scalloped Dragon Wings (pivoted cleanly at the upper back!)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.quadraticCurveTo(0.48, 0.72, 1.28, 0.78);
  wingShape.quadraticCurveTo(1.06, 0.30, 1.16, -0.08);
  wingShape.quadraticCurveTo(0.80, 0.10, 0.74, -0.28);
  wingShape.quadraticCurveTo(0.42, -0.06, 0.26, -0.34);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
  });

  const wings = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.34, 1.38, -0.34);
    const mesh = new THREE.Mesh(wingGeo, matWing);
    if (side === -1) mesh.scale.x = -1;
    mesh.rotation.y = side * -0.38;
    mesh.castShadow = true;
    pivot.add(mesh);

    // Leading-edge wing spar (white dragon bone)
    const sparCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0.01),
      new THREE.Vector3(side * 0.54, 0.56, -0.18),
      new THREE.Vector3(side * 1.22, 0.74, -0.44),
    ]);
    const spar = new THREE.Mesh(new THREE.TubeGeometry(sparCurve, 16, 0.048, 10, false), matScales);
    pivot.add(spar);

    bodyGroup.add(pivot);
    wings.push(pivot);
  }

  // Graceful Dragon Tail curving behind the body
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.25, -0.44),
    new THREE.Vector3(-0.35, 0.12, -0.92),
    new THREE.Vector3(-0.92, 0.30, -0.78),
    new THREE.Vector3(-1.26, 0.62, -0.36),
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 28, 0.12, 12, false), matScales);
  bodyGroup.add(tailMesh);

  // Graceful Dragon Neck + Glowing Dorsal Crest
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.44, -0.02),
    new THREE.Vector3(0, 1.72, -0.06),
    new THREE.Vector3(0, 1.98, 0.02),
  ]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 16, 0.22, 18, false), matScales);
  bodyGroup.add(neck);

  // 3. Sculpted Friendly White Dragon Head (pivot at top of neck!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 2.02, 0.04);
  bodyGroup.add(headGroup);

  // Cranium (friendly rounded dome)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.54, 32, 32), matScales);
  cranium.scale.set(1.04, 0.96, 1.08);
  cranium.position.set(0, 0.34, -0.02);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Sculpted Upper Snout (rounded, friendly dragon muzzle!)
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 24), matScales);
  snout.scale.set(1.02, 0.72, 1.38);
  snout.position.set(0, 0.22, 0.46);
  snout.castShadow = true;
  headGroup.add(snout);

  // Cute dragon nostrils
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), matAccent);
    nostril.scale.set(0.8, 0.6, 1.2);
    nostril.position.set(side * 0.13, 0.29, 0.86);
    headGroup.add(nostril);

    // Rosy cheek blush
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), matBlush);
    blush.position.set(side * 0.38, 0.18, 0.42);
    blush.rotation.y = side * 0.65;
    headGroup.add(blush);
  }

  // Articulated Lower Jaw (pivots smoothly with microphone lip-sync!)
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, 0.10, 0.14);
  headGroup.add(jawPivot);

  const lowerJaw = new THREE.Mesh(new THREE.SphereGeometry(0.30, 24, 20), matBelly);
  lowerJaw.scale.set(0.94, 0.46, 1.38);
  lowerJaw.position.set(0, -0.04, 0.30);
  jawPivot.add(lowerJaw);

  const mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), matMouth);
  mouthCavity.scale.set(0.92, 0.35, 1.15);
  mouthCavity.position.set(0, 0.03, 0.28);
  jawPivot.add(mouthCavity);

  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), matTongue);
  tongue.scale.set(0.9, 0.28, 1.25);
  tongue.position.set(0, 0.02, 0.34);
  jawPivot.add(tongue);

  // Large Expressive Glossy Anime Dragon Eyes
  const eyeTex = createDragonEyeTexture(THREE, preset.eyeIris);
  const matEye = new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.12, metalness: 0.05 });

  function makeDragonEye(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.31, 0.44, 0.42);
    pivot.rotation.y = side * 0.36;

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 24), matEye);
    ball.scale.set(1.0, 1.14, 0.72);
    ball.rotation.y = -Math.PI / 2;
    pivot.add(ball);

    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.22, 8, 12), matScales);
    brow.rotation.z = Math.PI / 2 - side * 0.18;
    brow.position.set(0, 0.21, 0.04);
    pivot.add(brow);
    return { pivot, brow };
  }
  const leftEye = makeDragonEye(-1);
  const rightEye = makeDragonEye(1);
  headGroup.add(leftEye.pivot, rightEye.pivot);

  // Majestic Swept-Back Curved Golden Dragon Horns + Ear Frills!
  for (const side of [-1, 1]) {
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.24, 0.72, 0.02),
      new THREE.Vector3(side * 0.42, 1.06, -0.32),
      new THREE.Vector3(side * 0.56, 1.22, -0.78),
    ]);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 22, 0.078, 12, false), matHorn);
    horn.castShadow = true;
    headGroup.add(horn);

    // Pointed horn tip
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.22, 12), matHorn);
    tip.position.set(side * 0.58, 1.24, -0.86);
    tip.rotation.x = -Math.PI / 2.2;
    tip.rotation.z = -side * 0.25;
    headGroup.add(tip);

    // Swept crystalline ear frills (2 feathers/fins per side)
    for (let f = 0; f < 2; f++) {
      const frill = new THREE.Mesh(new THREE.ConeGeometry(0.085 - f * 0.015, 0.44 - f * 0.08, 6), f === 0 ? matScales : matAccent);
      frill.position.set(side * (0.50 + f * 0.04), 0.46 - f * 0.14, -0.18 - f * 0.06);
      frill.rotation.z = -side * (1.05 + f * 0.25);
      frill.rotation.x = -0.45;
      headGroup.add(frill);
    }
  }

  // Glowing Dorsal Crest Spikes down the back of head & neck
  for (let i = 0; i < 4; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.075 - i * 0.01, 0.24 - i * 0.02, 5), matAccent);
    spike.position.set(0, 0.78 - i * 0.22, -0.26 - i * 0.16);
    spike.rotation.x = -0.75;
    headGroup.add(spike);
  }

  // Optional Cyber Headphones (for Omarchy Cyber Dragon preset!)
  if (preset.headphones) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.04, 12, 32, Math.PI), matScarf);
    band.position.set(0, 0.42, -0.02);
    headGroup.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.10, 20), matScarf);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.56, 0.36, -0.02);
      headGroup.add(cup);
    }
  }

  // Floating Chromatic Halo + Orbiting Lumi Crystal Star
  let halo = null;
  if (preset.haloRing) {
    halo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.024, 14, 48), matAccent);
    halo.rotation.x = Math.PI / 2.2;
    halo.position.set(0, 1.38, -0.18);
    headGroup.add(halo);
  }

  const orbOrbit = new THREE.Group();
  orbOrbit.position.set(0, 2.3, 0);
  root.add(orbOrbit);
  const lumiOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), matAccent);
  lumiOrb.position.set(1.38, 0.1, 0.3);
  orbOrbit.add(lumiOrb);

  // Rig state & animation
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
    dragonSpeed: 0.9,
  };

  function update(dt, elapsed) {
    state.curYaw += (state.targetYaw - state.curYaw) * Math.min(1, dt * 8);
    state.curPitch += (state.targetPitch - state.curPitch) * Math.min(1, dt * 8);

    const breath = Math.sin(elapsed * 2.1) * 0.03;
    const bounce = state.bounceTimer > 0 ? Math.abs(Math.sin(state.bounceTimer * 12)) * 0.22 : 0;
    if (state.bounceTimer > 0) state.bounceTimer = Math.max(0, state.bounceTimer - dt);

    bodyGroup.position.y = breath + bounce;
    bodyGroup.rotation.y = state.curYaw * 0.32;
    bodyGroup.rotation.z = -state.curYaw * 0.06 + Math.sin(elapsed * 1.4) * 0.02;

    headGroup.rotation.y = state.curYaw * 0.65;
    headGroup.rotation.x = state.curPitch * 0.48 + Math.sin(elapsed * 2.1 - 0.5) * 0.025;
    headGroup.rotation.z = -state.curYaw * 0.12;

    // Wing breathing + hype flap!
    const wingSpeed = state.expression === 'hype' || state.bounceTimer > 0 ? 10.0 : 2.1;
    const wingAmp = state.expression === 'hype' || state.bounceTimer > 0 ? 0.38 : 0.10;
    const flap = Math.sin(elapsed * wingSpeed) * wingAmp;
    wings[0].rotation.y = 0.22 + flap;
    wings[1].rotation.y = -0.22 - flap;
    wings[0].rotation.z = -flap * 0.4;
    wings[1].rotation.z = flap * 0.4;

    if (halo) {
      halo.rotation.z = elapsed * 0.7;
      halo.position.y = 1.38 + Math.sin(elapsed * 2.8) * 0.03;
    }

    // Wave paw animation
    if (state.waveTimer > 0) {
      state.waveTimer = Math.max(0, state.waveTimer - dt);
      rightArm.rotation.z = 1.85 + Math.sin(elapsed * 14) * 0.35;
      rightArm.rotation.x = -0.35;
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

    // Expressions + Articulated Dragon Jaw Lip-Sync!
    let lEyeY = 1.0 - state.blinkAmount * 0.92;
    let rEyeY = 1.0 - state.blinkAmount * 0.92;
    let jawRot = 0.04 + state.mouthOpen * 0.46;
    let browLift = 0;

    if (state.expression === 'happy') {
      lEyeY = 0.26;
      rEyeY = 0.26;
      jawRot = Math.max(0.24, jawRot);
      browLift = 0.04;
    } else if (state.expression === 'pog') {
      lEyeY = 1.22;
      rEyeY = 1.22;
      jawRot = Math.max(0.45, jawRot);
      browLift = 0.08;
    } else if (state.expression === 'wink') {
      rEyeY = 0.16;
      jawRot = Math.max(0.14, jawRot);
      browLift = 0.03;
    } else if (state.expression === 'sleepy') {
      lEyeY = 0.36;
      rEyeY = 0.36;
      browLift = -0.04;
    } else if (state.expression === 'hype') {
      lEyeY = 1.20;
      rEyeY = 1.20;
      jawRot = Math.max(0.36, jawRot);
      browLift = 0.07;
    }

    leftEye.pivot.scale.y = Math.max(0.08, lEyeY);
    rightEye.pivot.scale.y = Math.max(0.08, rEyeY);
    leftEye.brow.position.y = 0.21 + browLift;
    rightEye.brow.position.y = 0.21 + browLift;
    jawPivot.rotation.x = jawRot;

    // Orbiting Lumi crystal + smooth chromatic shimmer on crest, halo & wings!
    const hue = (elapsed * 0.14) % 1.0;
    matAccent.emissive.setHSL(hue, 0.85, 0.56);
    matAccent.color.setHSL((hue + 0.08) % 1.0, 0.82, 0.66);
    matWing.emissive.setHSL((hue + 0.15) % 1.0, 0.78, 0.52);

    orbOrbit.rotation.y = elapsed * state.dragonSpeed;
    lumiOrb.rotation.y = elapsed * 2.2;
    lumiOrb.rotation.x = elapsed * 1.4;
    lumiOrb.position.y = 0.1 + Math.sin(elapsed * 3.2) * 0.14;
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
