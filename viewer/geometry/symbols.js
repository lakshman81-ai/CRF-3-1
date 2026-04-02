/**
 * symbols.js — Engineering symbols for anchors, guides, and load arrows.
 * Uses THREE.MeshBasicMaterial (no lighting) for paper-iso look.
 */

import * as THREE from 'three';
import { toThree, SCALE } from './pipe-geometry.js';
import { state } from '../core/state.js';

const MAT_LOAD = new THREE.MeshBasicMaterial({ color: 0xe0a000 });

// Support symbol materials
const COLOR_NORMAL = 0x00C853; // Green A700
const MAT_SUPPORT = new THREE.MeshStandardMaterial({
    color: COLOR_NORMAL,
    roughness: 0.4,
    metalness: 0.1
});

const MAT_SPRING = new THREE.LineDashedMaterial({
    color: COLOR_NORMAL,
    linewidth: 2,
    scale: 1,
    dashSize: 3,
    gapSize: 3,
});

/**
 * Helper to build lateral and vertical arrows.
 */
function makeArrow(direction, offset, od, material) {
    const arrowLen = 1.5 * od;
    const shaftR   = 0.075 * od;
    const headLen  = 0.4 * od;
    const headR    = 0.175 * od;
    const shaftLen = arrowLen - headLen;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 8),
      material
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(headR, headLen, 8),
      material
    );

    const arrowGroup = new THREE.Group();
    arrowGroup.add(shaft);
    arrowGroup.add(head);

    shaft.position.copy(direction).multiplyScalar(offset + shaftLen / 2);
    head.position.copy(direction).multiplyScalar(offset + shaftLen + headLen / 2);

    // Default Cylinder/Cone points up (+Y). Rotate to direction.
    const up = new THREE.Vector3(0, 1, 0);
    // Handle anti-parallel case
    if (up.distanceTo(direction) < 0.001) {
        // already aligned
    } else if (up.distanceTo(direction.clone().negate()) < 0.001) {
        shaft.rotateX(Math.PI);
        head.rotateX(Math.PI);
    } else {
        const quat = new THREE.Quaternion().setFromUnitVectors(up, direction);
        shaft.quaternion.copy(quat);
        head.quaternion.copy(quat);
    }

    return arrowGroup;
}

export function classifySupport(supportName, supportKeywords) {
    const searchStr = `${supportName || ''} ${supportKeywords || ''}`.toUpperCase();

    if (/CA\d+/.test(searchStr) || searchStr.includes('ANCH') || searchStr.includes('ANCHOR')) {
        return 'ANCHOR';
    }
    if (searchStr.includes('GUI') || searchStr.includes('GUIDE')) {
        return 'GUIDE';
    }
    if (searchStr.includes('STOP')) {
        return 'STOP';
    }
    if (searchStr.includes('SPRING') || searchStr.includes('HANGER')) {
        return 'SPRING';
    }
    if (searchStr.includes('RIGID')) {
        return 'RIGID';
    }

    return 'UNKNOWN';
}

export function createSupportSymbol(pos, type, pipeAxis, odInMM) {
    const group = new THREE.Group();
    const p = toThree(pos);
    group.position.copy(p);

    // Apply global scale
    const scale = state.viewerSettings.restraintSymbolScale || 1.0;
    group.scale.set(scale, scale, scale);

    // Scale OD to scene units. Minimum viable OD for symbol proportion if missing.
    let od = (odInMM || 100) * SCALE;

    // Fallback axis if none provided
    const axis = pipeAxis ? pipeAxis.clone().normalize() : new THREE.Vector3(1, 0, 0);

    // Up axis based on convention. If scene is rotated, World Up is Three's Y.
    const isZup = state.viewerSettings.axisConvention === 'Z-up';
    const upAxis = isZup ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 1, 0); // World Y is up in both due to scene rotation

    // Lateral direction
    let lateral = new THREE.Vector3().crossVectors(axis, upAxis);
    if (lateral.length() < 0.01) {
        // pipe is vertical, pick arbitrary lateral
        lateral.set(1, 0, 0);
    }
    lateral.normalize();

    const downDir = upAxis.clone().negate();

    if (type === 'GUIDE' || type === 'ANCHOR') {
        // Arrows must point INWARD toward the pipe centreline
        group.add(makeArrow(lateral.clone(), od / 2, od, MAT_SUPPORT)); // Pointing along lateral from negative side
        group.add(makeArrow(lateral.clone().negate(), od / 2, od, MAT_SUPPORT)); // Pointing opposite lateral from positive side
        group.add(makeArrow(downDir, od / 2, od, MAT_SUPPORT));
    }
    else if (type === 'STOP') {
        group.add(makeArrow(lateral.clone(), od / 2, od, MAT_SUPPORT));
        group.add(makeArrow(lateral.clone().negate(), od / 2, od, MAT_SUPPORT));
    }
    else if (type === 'SPRING') {
        // Vertical dashed arrow
        const arrowLen = 1.5 * od;
        const headLen = 0.4 * od;
        const shaftLen = arrowLen - headLen;

        const pts = [];
        pts.push(downDir.clone().multiplyScalar(od / 2));
        pts.push(downDir.clone().multiplyScalar(od / 2 + shaftLen));
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, MAT_SPRING);
        line.computeLineDistances();
        group.add(line);

        const head = new THREE.Mesh(new THREE.ConeGeometry(0.175 * od, headLen, 8), MAT_SUPPORT);
        head.position.copy(downDir).multiplyScalar(od / 2 + shaftLen + headLen / 2);
        if (downDir.y < 0) head.rotateX(Math.PI);
        group.add(head);
    }
    else if (type === 'RIGID') {
        // Cross symbol in pipe plane
        const rLen = od * 1.2;
        const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05*od, 0.05*od, rLen*2), MAT_SUPPORT);
        const m2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05*od, 0.05*od, rLen*2), MAT_SUPPORT);
        m1.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), lateral.clone().add(upAxis).normalize());
        m2.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), lateral.clone().sub(upAxis).normalize());
        group.add(m1);
        group.add(m2);
    }
    else {
        // UNKNOWN / Fallback
        group.add(makeArrow(downDir, od / 2, od, MAT_SUPPORT));
    }

    return group;
}

// Kept for backward compatibility if needed, but IsometricRenderer should now use createSupportSymbol

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
