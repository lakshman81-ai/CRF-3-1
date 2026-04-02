/**
 * labels.js — CSS2DRenderer labels for node numbers and segment annotations.
 *
 * Requires CSS2DRenderer and CSS2DObject from Three.js addons.
 * The renderer must be initialised and appended to the DOM by isometric-renderer.js.
 */

import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toThree } from './pipe-geometry.js';
import { state } from '../core/state.js';

/**
 * Create a node number label.
 * @param {number} nodeId
 * @param {object} pos  {x, y, z} in mm (CAESAR II coords)
 * @returns {CSS2DObject}
 */
export function createNodeLabel(nodeId, pos) {
  const div = document.createElement('div');
  div.className = 'node-label';
  div.textContent = nodeId;
  div.style.cssText = `
    font: 600 10px/1 "Courier New", monospace;
    color: #222;
    background: rgba(255,255,255,0.75);
    padding: 1px 3px;
    border: 1px solid #aaa;
    border-radius: 2px;
    pointer-events: none;
    white-space: nowrap;
  `;

  const obj = new CSS2DObject(div);
  const p = toThree(pos);

  if (state.viewerSettings?.axisConvention === 'Z-up') {
      p.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  }

  obj.position.copy(p);
  obj.userData.type = 'node-label';
  return obj;
}

/**
 * Create a segment annotation label (T1 / P1 / pipeline ref / material).
 * @param {string} text
 * @param {object} midPos  midpoint position {x, y, z} in mm
 * @returns {CSS2DObject}
 */
export function createSegmentLabel(text, midPos) {
  const div = document.createElement('div');
  div.className = 'seg-label';
  div.textContent = text;

  const fontSize = state.viewerSettings.labelFontSize || 12;
  const bgStyle = state.viewerSettings.labelBackground ? 'background: rgba(255,255,255,0.85); border: 1px solid rgba(0,0,0,0.1);' : 'background: transparent; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;';

  div.style.cssText = `
    font: 500 ${fontSize}px "Arial", sans-serif;
    color: #333;
    ${bgStyle}
    padding: 2px 5px;
    border-radius: 3px;
    pointer-events: none;
    white-space: nowrap;
    opacity: ${state.viewerSettings.showLabels ? 1 : 0};
  `;

  const obj = new CSS2DObject(div);
  const p = toThree(midPos);

  if (state.viewerSettings?.axisConvention === 'Z-up') {
      p.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  }

  obj.position.copy(p);
  obj.userData.type = 'seg-label';
  obj.userData.text = text;
  return obj;
}

/**
 * Get the text for a segment label based on legendField.
 * @param {object} el  parsed element
 * @param {string} legendField  'pipelineRef'|'T1'|'T2'|'P1'|'material'|'HeatMap:*'
 * @param {Function} materialFromDensity
 */
export function segmentLabelText(el, legendField, materialFromDensity) {
  if (legendField.startsWith('HeatMap:')) {
    const field = legendField.split(':')[1];
    const val = el[field] ?? '—';
    const unit = field === 'P1' ? ' bar' : '°C';
    return `${field}=${val}${unit}`;
  }
  switch (legendField) {
    case 'T1':          return `T1=${el.T1 ?? '—'}°C`;
    case 'T2':          return `T2=${el.T2 ?? '—'}°C`;
    case 'P1':          return `P1=${el.P1 ?? '—'} bar`;
    case 'material':    return el.material || materialFromDensity(el.density);
    case 'pipelineRef': return `SYS-177A`;
    case 'none':        return '';
    default:            return '';
  }
}

/**
 * Compute stretches: groups of collinear elements sharing the same direction
 * vector (within tolerance). Returns array of { elements, midPos, text }.
 * Used to place one label per straight run instead of per element.
 *
 * @param {Array} elements  parsed elements with dx/dy/dz/fromPos/toPos
 * @param {string} legendField
 * @param {Function} materialFromDensity
 * @returns {Array<{midPos: {x,y,z}, text: string}>}
 */
export function computeStretches(elements, legendField, materialFromDensity) {
  if (!elements.length) return [];

  // Normalise a direction vector to a canonical key (sign-independent)
  const dirKey = (dx, dy, dz) => {
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    let nx = dx / len, ny = dy / len, nz = dz / len;
    // Canonical: ensure first non-zero component is positive
    for (const v of [nx, ny, nz]) {
      if (Math.abs(v) > 0.01) { if (v < 0) { nx=-nx; ny=-ny; nz=-nz; } break; }
    }
    return `${Math.round(nx*100)},${Math.round(ny*100)},${Math.round(nz*100)}`;
  };

  const stretches = [];
  let current = null;
  let currentDirKey = null;

  for (const el of elements) {
    // Ignore elements missing positions
    if (!el.fromPos || !el.toPos) continue;

    const dk = dirKey(el.dx, el.dy, el.dz);
    const text = segmentLabelText(el, legendField, materialFromDensity);

    if (dk === currentDirKey && current && current.text === text) {
      current.elements.push(el);
      // Extend the stretch endpoint
      current.endPos = el.toPos;
    } else {
      if (current && current.startPos && current.endPos) {
        // Compute midpoint of the completed stretch
        const mid = {
          x: (current.startPos.x + current.endPos.x) / 2,
          y: (current.startPos.y + current.endPos.y) / 2,
          z: (current.startPos.z + current.endPos.z) / 2,
        };
        stretches.push({ elements: current.elements, midPos: mid, text: current.text });
      }
      current = { elements: [el], startPos: el.fromPos, endPos: el.toPos, text, dirKey: dk };
      currentDirKey = dk;
    }
  }

  // Push last stretch
  if (current && current.startPos && current.endPos) {
    const mid = {
      x: (current.startPos.x + current.endPos.x) / 2,
      y: (current.startPos.y + current.endPos.y) / 2,
      z: (current.startPos.z + current.endPos.z) / 2,
    };
    stretches.push({ elements: current.elements, midPos: mid, text: current.text });
  }

  return filterStretchesByDensity(stretches);
}

function filterStretchesByDensity(stretches) {
    const mode = state.viewerSettings.labelMode || 'smart-density';
    if (mode === 'none' || !state.viewerSettings.showLabels) return [];
    if (mode === 'all') return stretches;

    // Smart density logic: deduplicate
    const kept = [];
    const textCounts = new Map();

    // Sort stretches by length so longer stretches get priority for labels
    const sorted = [...stretches].sort((a, b) => b.elements.length - a.elements.length);

    for (const s of sorted) {
        if (!s.text) continue;

        const count = textCounts.get(s.text) || 0;
        let keep = false;

        if (mode === 'run-only') {
            // Keep strictly one label per unique text per large run area
            // simplified here to just limit max labels per text
            if (count < 1) keep = true;
        } else if (mode === 'smart-density') {
            const density = state.viewerSettings.labelDensity !== undefined ? state.viewerSettings.labelDensity : 0.5;
            // Higher density allows more repeats. 1.0 allows all.
            const maxAllowed = Math.max(1, Math.floor(density * 5));
            if (count < maxAllowed) keep = true;
        }

        if (keep) {
            kept.push(s);
            textCounts.set(s.text, count + 1);
        }
    }

    return kept;
}
