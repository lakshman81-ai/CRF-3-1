/**
 * xml-elements.js — Parse CAESARII XML format (used by SAMPLE2.ACCDB, RELIEF-FLANGED.ACCDB).
 *
 * XML format attributes on <PIPINGELEMENT>:
 *   FROM_NODE, TO_NODE, DELTA_X, DELTA_Y, DELTA_Z
 *   DIAMETER, WALL_THICK, INSUL_THICK, CORR_ALLOW
 *   TEMP_EXP_C1 (T1), TEMP_EXP_C2 (T2)
 *   PRESSURE1 (P1), HYDRO_PRESSURE
 *   MODULUS (E_cold), HOT_MOD1 (E_hot)
 *   POISSONS, PIPE_DENSITY, FLUID_DENSITY
 *   MATERIAL_NAME, MATERIAL_NUM
 *
 * IMPORTANT — Property inheritance:
 *   CAESAR II only writes an attribute when it *changes* from the previous element.
 *   Absent attributes must carry forward from the previous element, not default to 0.
 *
 * Sentinel value: -1.0101 means "not set / use default"
 */

import { pipeLength } from '../../utils/formatter.js';

const SENTINEL = -1.0101;
const isSentinel = v => Math.abs(v - SENTINEL) < 0.001;

/** Read a numeric attribute; return null if absent or sentinel (caller handles inheritance). */
const attrNum = (el, name) => {
  const raw = el.getAttribute(name);
  if (raw === null) return null;
  const n = parseFloat(raw);
  return (isNaN(n) || isSentinel(n)) ? null : n;
};

/** Read a string attribute; return null if absent or empty. */
const attrStr = (el, name) => {
  const raw = el.getAttribute(name);
  return (raw === null || raw === '') ? null : raw;
};

/** Resolve: use element's own value if present, otherwise carry forward from prev, otherwise use hardcoded fallback. */
const resolve = (own, prev, fallback) => own !== null ? own : (prev !== undefined && prev !== null ? prev : fallback);
const resolveStr = (own, prev, fallback) => own !== null ? own : (prev !== undefined && prev !== null ? prev : fallback);

export function parseXmlElements(rawText, log) {
  const elements   = [];
  const nodes      = {};
  const bends      = [];
  const restraints = [];
  const forces     = [];
  const rigids     = [];

  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(rawText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) throw new Error(parseError.textContent.slice(0, 120));
  } catch (e) {
    log.push({ level: 'ERROR', msg: `XML parse failed: ${e.message}` });
    return { elements, nodes, bends, restraints, forces, rigids };
  }

  // Model metadata
  const model = doc.querySelector('PIPINGMODEL');
  if (model) {
    const jobName = model.getAttribute('JOBNAME') ?? '—';
    const numElt  = model.getAttribute('NUMELT') ?? '?';
    log.push({ level: 'INFO', msg: `XML PIPINGMODEL: JOBNAME="${jobName}" | NUMELT=${numElt}` });
  }

  // Collect all PIPINGELEMENT nodes
  const elNodes = [...doc.querySelectorAll('PIPINGELEMENT')];
  if (!elNodes.length) {
    log.push({ level: 'WARN', msg: 'XML: no <PIPINGELEMENT> found' });
    return { elements, nodes, bends, restraints, forces, rigids };
  }

  // Set origin for first node
  const firstFrom = Math.round(parseFloat(elNodes[0].getAttribute('FROM_NODE') ?? 0));
  nodes[firstFrom] = { x: 0, y: 0, z: 0 };

  // ── Property carry-forward state ──────────────────────────────────────────
  // CAESAR II omits attributes that haven't changed since the previous element.
  // We track the last seen value for every inheritable property.
  let prev = {
    od:      null,
    wall:    null,
    insul:   null,
    corrosion: null,
    T1:      null,
    T2:      null,
    P1:      null,
    Phyd:    null,
    E_cold:  null,
    E_hot:   null,
    poisson: null,
    density: null,
    matName: null,
  };

  elNodes.forEach((el, idx) => {
    // ── Geometry (always explicit per-element) ────────────────────────────
    const from = Math.round(parseFloat(el.getAttribute('FROM_NODE') ?? 0));
    const to   = Math.round(parseFloat(el.getAttribute('TO_NODE')   ?? 0));
    const dx   = parseFloat(el.getAttribute('DELTA_X') ?? 0) || 0;
    const dy   = parseFloat(el.getAttribute('DELTA_Y') ?? 0) || 0;
    const dz   = parseFloat(el.getAttribute('DELTA_Z') ?? 0) || 0;

    // ── Inheritable properties (carry forward when absent) ────────────────
    const ownOd      = attrNum(el, 'DIAMETER');
    const ownWall    = attrNum(el, 'WALL_THICK');
    const ownInsul   = attrNum(el, 'INSUL_THICK');
    const ownCorr    = attrNum(el, 'CORR_ALLOW');
    const ownT1      = attrNum(el, 'TEMP_EXP_C1');
    const ownT2      = attrNum(el, 'TEMP_EXP_C2');
    const ownP1      = attrNum(el, 'PRESSURE1');
    const ownPhyd    = attrNum(el, 'HYDRO_PRESSURE');
    const ownEcold   = attrNum(el, 'MODULUS');
    const ownEhot    = attrNum(el, 'HOT_MOD1');
    const ownPoisson = attrNum(el, 'POISSONS');
    const ownDensity = attrNum(el, 'PIPE_DENSITY');
    const ownMat     = attrStr(el, 'MATERIAL_NAME');

    const od      = resolve(ownOd,      prev.od,      0);
    const wall    = resolve(ownWall,    prev.wall,    0);
    const insul   = resolve(ownInsul,   prev.insul,   0);
    const corrosion= resolve(ownCorr,   prev.corrosion, 0);
    const T1      = resolve(ownT1,      prev.T1,      0);
    const T2      = resolve(ownT2,      prev.T2,      0);
    const P1      = resolve(ownP1,      prev.P1,      0);
    const Phyd    = resolve(ownPhyd,    prev.Phyd,    0);
    const E_cold  = resolve(ownEcold,   prev.E_cold,  203390.7);
    const E_hot   = resolve(ownEhot,    prev.E_hot,   178960.6);
    const poisson = resolve(ownPoisson, prev.poisson, 0.292);
    const density = resolve(ownDensity, prev.density, 7.833e-3);
    const matName = resolveStr(ownMat,  prev.matName, 'CS');

    // Update carry-forward state
    prev = { od, wall, insul, corrosion, T1, T2, P1, Phyd, E_cold, E_hot, poisson, density, matName };

    // ── Node positions ────────────────────────────────────────────────────
    if (!nodes[from]) nodes[from] = { x: 0, y: 0, z: 0 };
    const origin = nodes[from];
    const toPos  = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
    if (!nodes[to]) nodes[to] = toPos;

    const len = pipeLength(dx, dy, dz);

    elements.push({
      index: idx, from, to, dx, dy, dz,
      od, wall, insul, corrosion, T1, T2, P1, P_hydro: Phyd,
      E_cold, E_hot, density, poisson,
      material: matName,
      length: len,
      fromPos: { ...origin },
      toPos:   { ...toPos },
      hasBend: false,
    });

    // Parse child RIGID elements
    [...el.querySelectorAll('RIGID')].forEach(rig => {
      const w = parseFloat(rig.getAttribute('WEIGHT') ?? 0);
      if (w > 0) rigids.push({ node: from, mass: w, type: rig.getAttribute('TYPE') ?? 'Rigid' });
    });

    // Parse child DISPLACEMENTS (restraints)
    [...el.querySelectorAll('DISPLACEMENTS')].forEach(disp => {
      const nodeNum = Math.round(parseFloat(disp.getAttribute('NODE_NUM') ?? from));
      restraints.push({ node: nodeNum, type: 'Fixed (XML)', isAnchor: true, dofs: [1,2,3,4,5,6], stiffness: 1e13 });
    });
  });

  // ── Bends ────────────────────────────────────────────────────────────────
  [...doc.querySelectorAll('BEND')].forEach((bend) => {
    const nearNode = Math.round(parseFloat(bend.getAttribute('NEAR_NODE') ?? 0));
    const radius   = parseFloat(bend.getAttribute('BEND_RADIUS') ?? 0);
    const elIdx = elements.findIndex(e => e.to === nearNode || e.from === nearNode);
    if (elIdx >= 0) {
      elements[elIdx].hasBend = true;
      bends.push({ elementIndex: elIdx, radius, nearNode });
    }
  });

  // ── Restraints ───────────────────────────────────────────────────────────
  [...doc.querySelectorAll('RESTRAINT')].forEach(r => {
    const node = Math.round(parseFloat(r.getAttribute('NODE') ?? 0));
    const type = r.getAttribute('RESTRAINT_TYPE') ?? 'Fixed';
    if (node > 0) {
      restraints.push({ node, type, isAnchor: type.includes('ANCHOR') || type === 'Fixed', dofs: [1,2,3], stiffness: 1e13 });
    }
  });

  // ── Summary log ──────────────────────────────────────────────────────────
  log.push({ level: 'INFO', msg: `XML ELEMENTS: ${elements.length} element(s) → ${Object.keys(nodes).length} node(s)` });
  if (bends.length)      log.push({ level: 'INFO', msg: `XML BEND: ${bends.length} bend(s)` });
  if (restraints.length) log.push({ level: 'INFO', msg: `XML RESTRAINT: ${restraints.length} restraint node(s)` });
  if (rigids.length) {
    const maxMass = Math.max(...rigids.map(r => r.mass));
    log.push({ level: 'INFO', msg: `XML RIGID: ${rigids.length} rigid element(s) — max mass ${maxMass.toFixed(1)} kg` });
  }

  // Count how many elements had to inherit each key property (diagnostic)
  const inherited = elements.filter((e, i) => {
    const el = doc.querySelectorAll('PIPINGELEMENT')[i];
    return el && el.getAttribute('DIAMETER') === null;
  }).length;
  if (inherited > 0) {
    log.push({ level: 'INFO', msg: `XML ELEMENTS: ${inherited} element(s) inherited DIAMETER from previous (CAESAR II property carry-forward)` });
  }

  if (elements.length > 0) {
    const uniqueODs = [...new Set(elements.map(e => e.od.toFixed(1)))].filter(v => parseFloat(v) > 0);
    log.push({ level: 'INFO', msg: `XML ELEMENTS: OD sizes → ${uniqueODs.join(', ')} mm` });
    const mats = [...new Set(elements.map(e => e.material || 'CS'))];
    log.push({ level: 'INFO', msg: `XML ELEMENTS: Materials → ${mats.join(', ')}` });
  }

  return { elements, nodes, bends, restraints, forces, rigids };
}
