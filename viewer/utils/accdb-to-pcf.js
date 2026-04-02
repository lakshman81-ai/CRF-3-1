/**
 * accdb-to-pcf.js
 * Implements the 3-stage data transformation:
 * Stage 1: ACCDB (Parsed) -> Universal CSV Format
 * Stage 2: Universal CSV -> Simplified PCF Data Table Format
 */

// ── Stage 1: ACCDB to Universal CSV ──────────────────────────────────────────

export function buildUniversalCSV(parsed) {
  if (!parsed || !parsed.elements) return [];

  const elements = parsed.elements;
  const bends = parsed.bends || [];
  const restraints = parsed.restraints || [];
  const rigids = parsed.rigids || [];
  const sifs = parsed.sifs || []; // Assuming parser provides this, else empty

  // Index auxiliary arrays by their pointers for O(1) lookup
  const bendIdx = {};
  bends.forEach(b => bendIdx[b.ptr] = b);

  const restIdx = {};
  restraints.forEach(r => restIdx[r.ptr] = r);

  const rigidIdx = {};
  rigids.forEach(r => rigidIdx[r.ptr] = r);

  const csvRows = [];

  elements.forEach(el => {
    // Stage 1 maps the raw parsed element properties into a flat, denormalized row
    // mimicking the ~130-column universal CSV from CAESAR-CII-Converter-2
    const row = {
      // Element Identity
      ELEMENTID: el.index,
      FROM_NODE: el.from,
      TO_NODE: el.to,
      LINE_NO: el.lineNo || '',

      // Geometry
      DELTA_X: el.dx || 0,
      DELTA_Y: el.dy || 0,
      DELTA_Z: el.dz || 0,
      DIAMETER: el.od || 0,
      WALL_THICK: el.wall || 0,
      INSUL_THICK: el.insul || 0,

      // Pointers
      BEND_PTR: el.bendPtr || 0,
      REST_PTR: el.restPtr || el.restraintPtr || 0,
      RIGID_PTR: el.rigidPtr || 0,
      INT_PTR: el.sifPtr || 0,
      FLANGE_PTR: el.flangePtr || 0,
      REDUCER_PTR: el.reducerPtr || 0,

      // Material / Thermal / Press
      T1: el.T1 || 0,
      T2: el.T2 || 0,
      P1: el.P1 || 0,
      P2: el.P2 || 0,
      MATERIAL_NAME: el.material || '',
    };

    // Join Bends
    if (row.BEND_PTR && bendIdx[row.BEND_PTR]) {
      const b = bendIdx[row.BEND_PTR];
      row.BND_RADIUS = b.radius;
      row.BND_ANGLE1 = b.angle1;
      row.BND_NODE1 = b.node1;
      row.BND_NODE2 = b.node2;
    }

    // Join Restraints
    if (row.REST_PTR && restIdx[row.REST_PTR]) {
      const r = restIdx[row.REST_PTR];
      row.RST_NODE_NUM = r.node;
      row.RST_TYPE = r.type;
    }

    // Join Rigids
    if (row.RIGID_PTR && rigidIdx[row.RIGID_PTR]) {
      const r = rigidIdx[row.RIGID_PTR];
      row.RGD_WGT = r.weight;
    }

    csvRows.push(row);
  });

  return csvRows;
}

// ── Stage 2: Universal CSV to PCF Data Table ─────────────────────────────────

export function normalizeToPCF(csvRows, options = {}) {
  const method = options.method || 'default';
  if (method === 'ContEngineMethod') {
    return normalizeToPCFWithContinuity(csvRows, options);
  }

  const segments = [];
  let i = 0;

  while (i < csvRows.length) {
    const row = csvRows[i];

    // Determine type heuristics (simplified from normalizer.ts)
    let type = 'PIPE';
    if (row.BEND_PTR > 0) type = 'PIPE'; // Usually leads to a bend
    else if (row.RIGID_PTR > 0) type = row.FLANGE_PTR > 0 ? 'FLANGE' : 'VALVE';
    else if (row.INT_PTR > 0) type = 'TEE';
    else if (row.REDUCER_PTR > 0) type = 'REDUCER';

    // Create base segment
    const baseSegment = {
      FROM_NODE: row.FROM_NODE,
      TO_NODE: row.TO_NODE,
      LINE_NO: row.LINE_NO,
      COMPONENT_TYPE: type,
      DELTA_X: row.DELTA_X,
      DELTA_Y: row.DELTA_Y,
      DELTA_Z: row.DELTA_Z,
      DIAMETER: row.DIAMETER,
      WALL_THICK: row.WALL_THICK,
      BEND_PTR: row.BEND_PTR || undefined,
      RIGID_PTR: row.RIGID_PTR || undefined,
      INT_PTR: row.INT_PTR || undefined,
      T1: row.T1,
      P2: row.P2,
      P1: row.P1,
      MATERIAL_NAME: row.MATERIAL_NAME
    };

    // Apply Support Tags if Restraint exists
    if (row.RST_TYPE) {
      baseSegment.SUPPORT_TAG = row.RST_TYPE;
    }

    segments.push(baseSegment);

    // Look-ahead for Bends (CAESAR II defines bends over 3 nodes usually)
    if (row.BEND_PTR > 0 && i + 2 < csvRows.length) {
      const r1 = csvRows[i + 1];
      const r2 = csvRows[i + 2];

      // Insert ghost segments
      segments.push({
        ...baseSegment,
        FROM_NODE: r1.FROM_NODE,
        TO_NODE: r1.TO_NODE,
        DELTA_X: r1.DELTA_X, DELTA_Y: r1.DELTA_Y, DELTA_Z: r1.DELTA_Z,
        COMPONENT_TYPE: 'GHOST'
      });
      segments.push({
        ...baseSegment,
        FROM_NODE: r2.FROM_NODE,
        TO_NODE: r2.TO_NODE,
        DELTA_X: r2.DELTA_X, DELTA_Y: r2.DELTA_Y, DELTA_Z: r2.DELTA_Z,
        COMPONENT_TYPE: 'GHOST'
      });

      // Insert the actual composite BEND segment
      segments.push({
        FROM_NODE: r1.FROM_NODE,
        TO_NODE: r2.TO_NODE,
        LINE_NO: baseSegment.LINE_NO,
        COMPONENT_TYPE: 'BEND',
        DELTA_X: r1.DELTA_X + r2.DELTA_X,
        DELTA_Y: r1.DELTA_Y + r2.DELTA_Y,
        DELTA_Z: r1.DELTA_Z + r2.DELTA_Z,
        DIAMETER: baseSegment.DIAMETER,
        WALL_THICK: baseSegment.WALL_THICK,
        CONTROL_NODE: r1.TO_NODE, // Intersect node
        T1: baseSegment.T1,
        P2: baseSegment.P2,
        P1: baseSegment.P1,
        MATERIAL_NAME: baseSegment.MATERIAL_NAME
      });

      i += 3; // Skip next two as they were consumed by the bend
    } else {
      i += 1;
    }
  }

  return segments;
}

function _classifyComponent(row) {
  if (row.INT_PTR > 0) return 'TEE';
  if (row.REDUCER_PTR > 0) return 'REDUCER-CONCENTRIC';
  if (row.BEND_PTR > 0) return 'BEND';
  if (row.RIGID_PTR > 0) return row.FLANGE_PTR > 0 ? 'FLANGE' : 'VALVE';
  return 'PIPE';
}

function _supportNameFromType(type = '') {
  const t = String(type).toUpperCase();
  if (t.includes('ANCHOR')) return 'ANC';
  if (t.includes('GUIDE') || t.includes('+Y')) return 'GDE';
  return 'RST';
}

function _fmtCoord(v, decimals) {
  return Number(v ?? 0).toFixed(decimals);
}

function _msgDirection(dx, dy, dz) {
  const ax = Math.abs(dx ?? 0);
  const ay = Math.abs(dy ?? 0);
  const az = Math.abs(dz ?? 0);
  if (ax >= ay && ax >= az) return (dx ?? 0) >= 0 ? 'EAST' : 'WEST';
  if (ay >= ax && ay >= az) return (dy ?? 0) >= 0 ? 'NORTH' : 'SOUTH';
  return (dz ?? 0) >= 0 ? 'UP' : 'DOWN';
}

function _coordOrNull(pt) {
  if (!pt) return null;
  return pt;
}

function _coordForPcf(pt) {
  if (!pt) return { x: 1, y: 0, z: 0 };
  if ((pt.x ?? 0) === 0 && (pt.y ?? 0) === 0 && (pt.z ?? 0) === 0) return { x: 1, y: 0, z: 0 };
  return pt;
}

export function normalizeToPCFWithContinuity(csvRows, options = {}) {
  if (!Array.isArray(csvRows) || !csvRows.length) return [];

  const nodePos = new Map();
  const first = csvRows[0];
  nodePos.set(first.FROM_NODE, { x: 0, y: 0, z: 0 });

  // Resolve node positions from FROM/TO + deltas using iterative continuity pass.
  let progress = true;
  let guard = 0;
  while (progress && guard < csvRows.length * 4) {
    guard += 1;
    progress = false;
    for (const r of csvRows) {
      const a = nodePos.get(r.FROM_NODE);
      const b = nodePos.get(r.TO_NODE);
      const dx = Number(r.DELTA_X || 0);
      const dy = Number(r.DELTA_Y || 0);
      const dz = Number(r.DELTA_Z || 0);
      if (a && !b) {
        nodePos.set(r.TO_NODE, { x: a.x + dx, y: a.y + dy, z: a.z + dz });
        progress = true;
      } else if (!a && b) {
        nodePos.set(r.FROM_NODE, { x: b.x - dx, y: b.y - dy, z: b.z - dz });
        progress = true;
      }
    }
  }

  const segments = [];
  let seq = 1;
  for (const r of csvRows) {
    const p1 = _coordOrNull(nodePos.get(r.FROM_NODE));
    const p2 = _coordOrNull(nodePos.get(r.TO_NODE));
    const comp = _classifyComponent(r);
    const bore = Number(r.DIAMETER || 0);
    const supportName = _supportNameFromType(r.RST_TYPE);

    segments.push({
      METHOD: 'ContEngineMethod',
      SEQ_NO: seq++,
      PIPELINE_REFERENCE: r.LINE_NO || '',
      COMPONENT_TYPE: comp,
      REF_NO: `${r.LINE_NO || 'LINE'}_${r.ELEMENTID ?? seq}`,
      FROM_NODE: r.FROM_NODE,
      TO_NODE: r.TO_NODE,
      EP1: p1,
      EP2: p2,
      DELTA_X: Number(r.DELTA_X || 0),
      DELTA_Y: Number(r.DELTA_Y || 0),
      DELTA_Z: Number(r.DELTA_Z || 0),
      DIAMETER: bore,
      WALL_THICK: Number(r.WALL_THICK || 0),
      MATERIAL: r.MATERIAL_NAME || '',
      T1: Number(r.T1 || 0),
      P2: Number(r.P2 || 0),
      P1: Number(r.P1 || 0),
      RIGID_WEIGHT: Number(r.RGD_WGT || 0),
      SUPPORT_NAME: '',
      SUPPORT_GUID: '',
      SUPPORT_COORDS: null,
      SKEY: comp === 'FLANGE' ? 'FLWN'
        : comp === 'VALVE' ? 'VBFL'
        : comp === 'BEND' ? 'BEBW'
        : comp === 'TEE' ? 'TEBW'
        : comp.startsWith('REDUCER') ? 'RCBW' : '',
    });

    // Restraints connected by REST_PTR to TO-node are exported as SUPPORT rows.
    if (r.RST_TYPE) {
      segments.push({
        METHOD: 'ContEngineMethod',
        SEQ_NO: seq++,
        PIPELINE_REFERENCE: r.LINE_NO || '',
        COMPONENT_TYPE: 'SUPPORT',
        REF_NO: `${r.LINE_NO || 'LINE'}_SUP_${r.TO_NODE}`,
        FROM_NODE: r.TO_NODE,
        TO_NODE: r.TO_NODE,
        EP1: null,
        EP2: null,
        DELTA_X: 0,
        DELTA_Y: 0,
        DELTA_Z: 0,
        DIAMETER: 0,
        WALL_THICK: 0,
        MATERIAL: '',
        T1: 0,
        P1: 0,
        RIGID_WEIGHT: 0,
        SUPPORT_NAME: supportName,
        SUPPORT_GUID: `UCI:${r.TO_NODE}`,
      SUPPORT_COORDS: p2,
        SKEY: '',
      });
    }
  }
  return segments;
}

export function buildPcfFromContinuity(segments, options = {}) {
  const decimals = options.decimals === 1 ? 1 : 4;
  const sourceName = options.sourceName || 'export';
  const pipeline = segments.find(s => s.PIPELINE_REFERENCE)?.PIPELINE_REFERENCE || sourceName;
  const lines = [
    'ISOGEN-FILES ISOGEN.FLS',
    'UNITS-BORE MM',
    'UNITS-CO-ORDS MM',
    'UNITS-WEIGHT KGS',
    'UNITS-BOLT-DIA MM',
    'UNITS-BOLT-LENGTH MM',
    `PIPELINE-REFERENCE export ${pipeline}`,
    '    PROJECT-IDENTIFIER P1',
    '    AREA A1',
    '',
  ];

  for (const s of segments) {
    if (s.COMPONENT_TYPE === 'SUPPORT') {
      lines.push('MESSAGE-SQUARE');
      lines.push(`    SUPPORT, RefNo:=${s.REF_NO}, SeqNo:${s.SEQ_NO}, ${s.SUPPORT_NAME || 'RST'}, ${s.SUPPORT_GUID || 'UCI:UNKNOWN'}`);
      lines.push('SUPPORT');
      const c = _coordForPcf(s.SUPPORT_COORDS);
      lines.push(`    CO-ORDS    ${_fmtCoord(c.x, decimals)} ${_fmtCoord(c.y, decimals)} ${_fmtCoord(c.z, decimals)} ${_fmtCoord(0, decimals)}`);
      lines.push(`    <SUPPORT_NAME>    ${s.SUPPORT_NAME || 'RST'}`);
      lines.push(`    <SUPPORT_GUID>    ${s.SUPPORT_GUID || 'UCI:UNKNOWN'}`);
      lines.push('');
      continue;
    }

    const len = Math.sqrt((s.DELTA_X ** 2) + (s.DELTA_Y ** 2) + (s.DELTA_Z ** 2));
    lines.push('MESSAGE-SQUARE');
    lines.push(`    ${s.COMPONENT_TYPE}, ${s.MATERIAL || 'CS'}, LENGTH=${Math.round(Math.abs(len))}MM, ${_msgDirection(s.DELTA_X, s.DELTA_Y, s.DELTA_Z)}, RefNo:=${s.REF_NO}, SeqNo:${s.SEQ_NO}`);
    lines.push(s.COMPONENT_TYPE);
    const a = _coordForPcf(s.EP1);
    const b = _coordForPcf(s.EP2);
    lines.push(`    END-POINT    ${_fmtCoord(a.x, decimals)} ${_fmtCoord(a.y, decimals)} ${_fmtCoord(a.z, decimals)} ${_fmtCoord(s.DIAMETER, decimals)}`);
    lines.push(`    END-POINT    ${_fmtCoord(b.x, decimals)} ${_fmtCoord(b.y, decimals)} ${_fmtCoord(b.z, decimals)} ${_fmtCoord(s.DIAMETER, decimals)}`);
    if (s.COMPONENT_TYPE === 'PIPE' && s.PIPELINE_REFERENCE) {
      lines.push(`    PIPELINE-REFERENCE export ${s.PIPELINE_REFERENCE}`);
    }
    if (s.SKEY) lines.push(`    <SKEY>  ${s.SKEY}`);
    if (s.P1) lines.push(`    COMPONENT-ATTRIBUTE1    ${Math.round(s.P1 * 100)} KPA`);
    if (s.T1) lines.push(`    COMPONENT-ATTRIBUTE2    ${Math.round(s.T1)} C`);
    if (s.MATERIAL) lines.push(`    COMPONENT-ATTRIBUTE3    ${s.MATERIAL}`);
    if (s.WALL_THICK) lines.push(`    COMPONENT-ATTRIBUTE4    ${s.WALL_THICK} MM`);
    if (s.RIGID_WEIGHT && s.COMPONENT_TYPE !== 'PIPE') lines.push(`    COMPONENT-ATTRIBUTE8    ${s.RIGID_WEIGHT} KG`);
    lines.push(`    COMPONENT-ATTRIBUTE97    =${s.REF_NO}`);
    lines.push(`    COMPONENT-ATTRIBUTE98    ${s.SEQ_NO}`);
    lines.push('');
  }

  // CRLF is mandatory by spec.
  return lines.join('\r\n');
}

// ── Stage 3: PCF Adapter for Renderer ─────────────────────────────────────────

export function adaptForRenderer(segments, originalParsed) {
  // The IsometricRenderer expects the "original" format with `dx, dy, dz`, `from`, `to`, `od`.
  // Here we map the PCF segments back into a format the renderer can digest without
  // breaking the rest of the application.

  const rendererElements = segments.map(seg => ({
    // Identity mapping
    from: seg.FROM_NODE,
    to: seg.TO_NODE,
    lineNo: seg.LINE_NO,

    // Geometry mapping
    dx: seg.DELTA_X,
    dy: seg.DELTA_Y,
    dz: seg.DELTA_Z,
    od: seg.DIAMETER,
    wall: seg.WALL_THICK,
    fromPos: seg.EP1 || undefined,
    toPos: seg.EP2 || undefined,

    // Additional renderer fields
    T1: seg.T1,
    P1: seg.P1,
    P2: seg.P2,
    material: seg.MATERIAL_NAME || seg.MATERIAL,

    // Component type handling (specifically bends)
    isBend: seg.COMPONENT_TYPE === 'BEND',
    isGhost: seg.COMPONENT_TYPE === 'GHOST',
    controlNode: seg.CONTROL_NODE,

    // Support tags
    support: seg.SUPPORT_TAG ? { type: seg.SUPPORT_TAG } : null
  }));

  return {
    ...originalParsed,
    elements: rendererElements
  };
}
