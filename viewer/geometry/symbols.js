/**
 * symbols.js — Engineering symbols for anchors, guides, and load arrows.
 * Uses THREE.MeshBasicMaterial (no lighting) for paper-iso look.
 */

import * as THREE from 'three';
import { toThree, SCALE } from './pipe-geometry.js';

const MAT_ANCHOR  = new THREE.MeshBasicMaterial({ color: 0xcc2200 });
const MAT_GUIDE   = new THREE.MeshBasicMaterial({ color: 0x888888 });
const MAT_LOAD    = new THREE.MeshBasicMaterial({ color: 0xe0a000 });

/**
 * Anchor symbol — solid red box at node position.
 * @param {object} pos  {x, y, z} in mm
 */
// Helper to create a Box mesh (wireframe option for pencil style)
function createBox(pos, hw, material, wireframe = false) {
  const geo = new THREE.BoxGeometry(hw, hw, hw);
  const mesh = new THREE.Mesh(geo, material);
  if (wireframe) {
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: material.color }));
    mesh.add(line);
    mesh.material.transparent = true;
    mesh.material.opacity = 0.2;
  }
  mesh.position.copy(pos);
  return mesh;
}

// Helper to create a Disc (cylinder) mesh
function createDisc(pos, normal, outerRadius, thickness, material) {
  const geo = new THREE.CylinderGeometry(outerRadius, outerRadius, thickness, 16);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(pos);
  const axis = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(axis, normal.clone().normalize());
  return mesh;
}

// Helper to create a cylinder
function createCylinder(start, end, radius, material) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len === 0) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(start).add(dir.multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

  // Also add wireframe for pencil style
  const edges = new THREE.EdgesGeometry(geo);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: material.color }));
  mesh.add(line);
  mesh.material.transparent = true;
  mesh.material.opacity = 0.2;

  return mesh;
}

export function createAnchorSymbol(pos) {
  const p = toThree(pos);
  const group = new THREE.Group();

  const r = 0.015; // 15mm scaled base radius
  const strapR = r * 1.1;
  const baseW = r * 3;

  // Clamping strap (oversized thin disc crossing pipe axis)
  const strap = createDisc(p, new THREE.Vector3(1, 0, 0), strapR, r * 0.4, MAT_ANCHOR);
  group.add(strap);

  // Base block (anchor to ground/structure)
  const basePos = p.clone().add(new THREE.Vector3(0, -r * 1.5, 0));
  const base = createBox(basePos, baseW, MAT_ANCHOR, true);
  group.add(base);

  // Vertical legs connecting strap to base
  const legLeft = createCylinder(
      p.clone().add(new THREE.Vector3(-r, 0, 0)),
      basePos.clone().add(new THREE.Vector3(-r, r * 0.5, 0)),
      r * 0.2,
      MAT_ANCHOR
  );
  if (legLeft) group.add(legLeft);

  const legRight = createCylinder(
      p.clone().add(new THREE.Vector3(r, 0, 0)),
      basePos.clone().add(new THREE.Vector3(r, r * 0.5, 0)),
      r * 0.2,
      MAT_ANCHOR
  );
  if (legRight) group.add(legRight);

  return group;
}

/**
 * Guide symbol — pencil style guide based on PCF Fixer logic
 * @param {object} pos  {x, y, z} in mm
 */
export function createGuideSymbol(pos) {
  const p = toThree(pos);
  const group = new THREE.Group();

  const r = 0.015;
  const loopR = r * 1.2;
  const loopThickness = r * 0.15;

  // Guide loop (thin vertical disc)
  const loop = createDisc(p, new THREE.Vector3(1, 0, 0), loopR, loopThickness, MAT_GUIDE);
  group.add(loop);

  // Slide pad
  const padPos = p.clone().add(new THREE.Vector3(0, -r, 0));
  const pad = createBox(padPos, r * 1.5, MAT_GUIDE, true);
  if (pad) {
      pad.scale.set(1, 0.2, 1);
      group.add(pad);
  }

  return group;
}

/**
 * Applied force arrow — yellow ArrowHelper pointing in force direction.
 * @param {object} pos  node position {x, y, z} in mm
 * @param {object} force  {fx, fy, fz} in N
 */
export function createForceArrow(pos, force) {
  const dir = new THREE.Vector3(force.fy, force.fz, force.fx).normalize();
  if (dir.length() < 0.01) return null;

  const origin = toThree(pos);
  const length = 0.05;
  const arrow = new THREE.ArrowHelper(dir, origin, length, 0xe0a000, 0.015, 0.01);
  return arrow;
}
