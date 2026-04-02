/**
 * accdb-mdb.js — Binary Access database (ACCDB/MDB) reader for native CAESAR II files.
 *
 * CAESAR II stores its model in a Jet/ACE Access database. This module:
 *   1. Opens the database with mdb-reader (CDN, no build step)
 *   2. Enumerates all tables and logs their schema
 *   3. Looks for embedded CAESAR II neutral/XML text in any MEMO column
 *   4. Tries to extract pipe element rows from tables whose columns match
 *      CAESAR II field-name patterns (FROM_NODE, DIAMETER, WALL_THICK, etc.)
 *   5. Falls back to a clear diagnostic error with export instructions
 */

import { pipeLength, round } from '../utils/formatter.js';

// importmap keys (index.html)
const MDB_CDN    = 'mdb-reader';   // → esm.sh/mdb-reader@2
const BUFFER_CDN = 'https://esm.sh/buffer@6'; // Node.js Buffer polyfill for browser

// ── Column name matchers ───────────────────────────────────────────────────
// Each entry is a list of candidate names (checked case-insensitively, then
// by partial match). First match wins.
const COLS = {
  from:    ['FROM_NODE', 'FROM', 'FROMNODE', 'NODE_FROM', 'NODEFROM', 'FNODE'],
  to:      ['TO_NODE',   'TO',   'TONODE',   'NODE_TO',   'NODETO',   'TNODE'],
  dx:      ['DELTA_X',   'DX',   'DELTAX',   'D_X',  'LENGTH_X', 'X'],
  dy:      ['DELTA_Y',   'DY',   'DELTAY',   'D_Y',  'LENGTH_Y', 'Y'],
  dz:      ['DELTA_Z',   'DZ',   'DELTAZ',   'D_Z',  'LENGTH_Z', 'Z'],
  od:      ['DIAMETER',  'OD',   'OUTSIDE_DIAMETER', 'PIPE_OD', 'PIPE_DIAMETER'],
  wall:    ['WALL_THICK','WALL', 'WALLTHICK','THICKNESS', 'WALL_THICKNESS', 'WT'],
  insul:   ['INSUL_THICK','INSULATION','INSUL','INSUL_THICKNESS'],
  T1:      ['TEMP_EXP_C1','TEMPERATURE1','TEMP1','T1','OPER_TEMP','DESIGN_TEMP'],
  T2:      ['TEMP_EXP_C2','TEMPERATURE2','TEMP2','T2','OPER_TEMP2','DESIGN_TEMP2'],
  P1:      ['PRESSURE1', 'PRESSURE','P1','OPER_PRESSURE','DESIGN_PRESSURE'],
  P2:      ['PRESSURE2', 'P2', 'OPER_PRESSURE2', 'DESIGN_PRESSURE2', 'HYDRO_PRESSURE'],
  density: ['PIPE_DENSITY','DENSITY','MATERIAL_DENSITY'],
  matName: ['MATERIAL_NAME','MATERIAL','MAT_NAME','MATERIAL_NUM'],
  corr:    ['CORR_ALLOW', 'CORROSION', 'CORROSION_ALLOWANCE', 'CA'],
  rest:    ['REST_PTR', 'RESTRAINT_PTR', 'RESTRAINT'],
};

function matchCol(colNames, key) {
  const upper = colNames.map(c => c.toUpperCase());
  const patterns = COLS[key] ?? [];
  // Exact match first
  for (const pat of patterns) {
    const i = upper.indexOf(pat.toUpperCase());
    if (i >= 0) return colNames[i];
  }
  // Partial-contain match
  for (const pat of patterns) {
    const i = upper.findIndex(c => c.includes(pat.toUpperCase()));
    if (i >= 0) return colNames[i];
  }
  return null;
}

function num(row, col, fallback = 0) {
  if (!col) return fallback;
  const v = parseFloat(row[col]);
  return isFinite(v) ? v : fallback;
}

function normalizeKey(text) {
  return String(text ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function roundField(value, decimals = 2) {
  const n = round(value, decimals);
  return n === null ? null : n;
}

function numericCell(row, col) {
  if (!col) return { present: false, value: null, raw: null };
  const raw = row[col];
  if (raw === null || raw === undefined || raw === '') return { present: false, value: null, raw };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { present: false, value: null, raw };
  return { present: true, value: n, raw };
}

function resolveNumeric(row, col, prev, fallback = 0, decimals = 2) {
  const cell = numericCell(row, col);
  if (cell.present) {
    return { value: roundField(cell.value, decimals), source: 'direct', column: col };
  }
  if (prev !== undefined && prev !== null) {
    return { value: prev, source: 'carry', column: col };
  }
  return { value: roundField(fallback, decimals), source: 'default', column: col };
}

function resolveString(row, col, prev, fallback = '') {
  if (!col) {
    if (prev !== undefined && prev !== null && prev !== '') return { value: prev, source: 'carry', column: col };
    return { value: fallback, source: 'default', column: col };
  }
  const raw = row[col];
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    return { value: String(raw).trim(), source: 'direct', column: col };
  }
  if (prev !== undefined && prev !== null && prev !== '') {
    return { value: prev, source: 'carry', column: col };
  }
  return { value: fallback, source: 'default', column: col };
}

function createStaleBucket() {
  return new Map();
}

function pushStale(bucket, field, source, value, tableName, column, rowIdx) {
  if (!field || source === 'direct') return;
  const key = `${field}::${source}`;
  const entry = bucket.get(key) ?? {
    field,
    source,
    count: 0,
    value,
    table: tableName,
    column,
    samples: [],
  };
  entry.count += 1;
  if (entry.samples.length < 5) {
    entry.samples.push(`${tableName} row ${rowIdx + 1}`);
  }
  bucket.set(key, entry);
}

function summarizeStale(bucket) {
  return [...bucket.values()].sort((a, b) => a.field.localeCompare(b.field) || a.source.localeCompare(b.source));
}

function defaultUnits() {
  return {
    length: 'mm',
    temperature: 'C',
    pressure: 'KPa',
    stress: 'KPa',
    displacement: 'mm',
    force: 'N',
    rotation: 'deg',
    moment: 'N.m',
    density: 'kg/cu.m.',
    mass: 'kg',
    tables: {},
    factors: {},
  };
}

function maybeUnitKey(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  if (key.includes('TEMP')) return 'temperature';
  if (key.includes('PRESS')) return 'pressure';
  if (key.includes('STRESS')) return 'stress';
  if (key.includes('DISP')) return 'displacement';
  if (key.includes('FORCE')) return 'force';
  if (key.includes('MOMENT')) return 'moment';
  if (key.includes('ROT')) return 'rotation';
  if (key.includes('DENS')) return 'density';
  if (key.includes('MASS')) return 'mass';
  if (key.includes('LENGTH') || key === 'LEN' || key === 'COORD' || key === 'COORDS') return 'length';
  return null;
}

function normalizeUnitText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function setUnit(tableUnits, key, value) {
  const normalized = normalizeUnitText(value);
  if (!normalized) return;
  tableUnits[key] = normalized;
}

function extractInputUnitsTable(rows) {
  const row = rows.find(r => r && Object.keys(r).length) ?? rows[0];
  if (!row) return null;

  const tableUnits = {};
  const fieldMap = {
    length: 'LENGTH',
    force: 'FORCE',
    mass: 'MASS_DYN',
    moment: 'MOMENT_IN',
    stress: 'STRESS',
    temperature: 'TEMP',
    pressure: 'PRESSURE',
    density: 'PIPE_DENSITY',
    displacement: 'LENGTH',
    rotation: 'RUNITS',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
      setUnit(tableUnits, key, row[col]);
    }
  }

  const factorMap = {
    length: 'CLENGTH',
    force: 'CFORCE',
    mass: 'CMASS_DYN',
    momentIn: 'CMOMENT_IN',
    momentOut: 'CMOMENT_OUT',
    stress: 'CSTRESS',
    temperature: 'CTEMP',
    pressure: 'CPRESSURE',
    modulus: 'CEMOD',
    pipeDensity: 'CPDENS',
    insulDensity: 'CIDENS',
    fluidDensity: 'CFDENS',
    trans: 'CTRANS',
    rotStiff: 'CROTSTIFF',
    unifLoad: 'CUNIFLOAD',
  };

  const factors = {};
  for (const [key, col] of Object.entries(factorMap)) {
    if (row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
      const n = Number(row[col]);
      if (Number.isFinite(n)) factors[key] = n;
    }
  }
  if (Object.keys(factors).length) tableUnits.factors = factors;

  return Object.keys(tableUnits).length ? tableUnits : null;
}

function extractUnitsFromTable(tableName, cols, rows) {
  const tableUnits = {};
  const lowerName = String(tableName ?? '').toLowerCase();
  if (lowerName.includes('input_units')) {
    return extractInputUnitsTable(rows);
  }
  const colMap = cols.map(c => ({ raw: c, norm: normalizeKey(c) }));

  for (const { raw, norm } of colMap) {
    const colUnitKey = maybeUnitKey(norm);
    if (colUnitKey && (norm.includes('UNIT') || norm.includes('UOM'))) {
      const sample = rows.map(r => r[raw]).find(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (sample !== undefined) tableUnits[colUnitKey] = String(sample).trim();
    }
  }

  if (lowerName.includes('output_displacements')) {
    for (const row of rows.slice(0, 20)) {
      setUnit(tableUnits, 'displacement', row.DUNITS);
      setUnit(tableUnits, 'rotation', row.RUNITS);
    }
  }

  if (lowerName.includes('output_stresses') || lowerName.includes('output_component_stresses')) {
    for (const row of rows.slice(0, 20)) {
      setUnit(tableUnits, 'stress', row.SUNITS || row.STRESS_UNITS || row.UNITS || row.UNIT);
      setUnit(tableUnits, 'force', row.FUNITS);
      setUnit(tableUnits, 'moment', row.MUNITS);
    }
  }

  if (lowerName.includes('unit')) {
    for (const row of rows.slice(0, 50)) {
      const values = cols
        .map(c => row[c])
        .filter(v => v !== null && v !== undefined && String(v).trim() !== '');
      if (values.length < 2) continue;

      const first = String(values[0]).trim();
      const second = String(values[1]).trim();
      const key = maybeUnitKey(first);
      if (key && second) {
        tableUnits[key] = second;
      } else if (/^[A-Z0-9_\- ]+$/i.test(first) && second) {
        const guessedKey = maybeUnitKey(first) || normalizeKey(first).toLowerCase();
        if (guessedKey) tableUnits[guessedKey] = second;
      }
    }
  }

  return Object.keys(tableUnits).length ? tableUnits : null;
}

function mergeUnits(globalUnits, tableUnits, tableName) {
  if (!tableUnits) return;
  globalUnits.tables[tableName] = tableUnits;
  if (tableUnits.factors) {
    globalUnits.factors = globalUnits.factors || {};
    globalUnits.factors[tableName] = tableUnits.factors;
  }
  for (const [key, value] of Object.entries(tableUnits)) {
    if (key === 'tables' || key === 'factors') continue;
    globalUnits[key] = value;
  }
}

function summarizeStressRows(rows) {

  const byCase = new Map();
  for (const row of rows) {
    const key = String(row.loadCase ?? 'Case').trim();
    const current = byCase.get(key) ?? { loadCase: key, node: row.node, calc: row.calc, allow: row.allow, ratio: row.ratio, status: row.status };
    if ((row.ratio ?? -Infinity) >= (current.ratio ?? -Infinity)) {
      current.node = row.node;
      current.calc = row.calc;
      current.allow = row.allow;
      current.ratio = row.ratio;
      current.status = row.status;
    }
    byCase.set(key, current);
  }
  return [...byCase.values()].sort((a, b) => b.ratio - a.ratio);
}

function summarizeDisplacementRows(rows) {
  const byCase = new Map();
  for (const row of rows) {
    const key = String(row.loadCase ?? 'Case').trim();
    const mag = Math.max(Math.abs(row.dx || 0), Math.abs(row.dy || 0), Math.abs(row.dz || 0));
    const current = byCase.get(key) ?? { loadCase: key, node: row.node, dx: row.dx, dy: row.dy, dz: row.dz, magnitude: mag };
    if (mag >= (current.magnitude ?? -Infinity)) {
      current.node = row.node;
      current.dx = row.dx;
      current.dy = row.dy;
      current.dz = row.dz;
      current.magnitude = mag;
      current.component = Math.abs(row.dy || 0) >= Math.abs(row.dx || 0) && Math.abs(row.dy || 0) >= Math.abs(row.dz || 0)
        ? 'DY'
        : Math.abs(row.dx || 0) >= Math.abs(row.dz || 0)
          ? 'DX'
          : 'DZ';
    }
    byCase.set(key, current);
  }
  return [...byCase.values()].sort((a, b) => b.magnitude - a.magnitude);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {string}      fileName
 * @param {object[]}    log        — mutable; entries pushed here
 * @returns {object|null}  partial parsed result, or null on failure
 */
export async function parseBinaryAccdb(arrayBuffer, fileName, log) {
  // ── 1. Polyfill Buffer + load mdb-reader ─────────────────────────────────
  // mdb-reader uses Node.js Buffer methods (e.g. .copy()) internally.
  // In the browser we must polyfill globalThis.Buffer BEFORE importing the
  // library so its module-level Buffer references resolve to the polyfill.
  let MDBReader;
  try {
    if (typeof globalThis.Buffer === 'undefined' || typeof globalThis.Buffer.from !== 'function') {
      const bufMod = await import(BUFFER_CDN);
      globalThis.Buffer = bufMod.Buffer ?? bufMod.default?.Buffer ?? bufMod.default ?? bufMod;
    }
    const mod = await import(/* @vite-ignore */ MDB_CDN);
    MDBReader = mod.default ?? mod.MDBReader ?? mod;
    if (typeof MDBReader !== 'function') throw new Error('MDBReader is not a constructor');
  } catch (e) {
    log.push({ level: 'ERROR', msg: `mdb-reader library failed to load: ${e.message}` });
    log.push({ level: 'INFO',  msg: 'Requires internet access to load CDN libraries. Alternatively export from CAESAR II as a neutral text file.' });
    return null;
  }

  // ── 2. Open database ─────────────────────────────────────────────────────
  // Pass a proper Buffer (not a raw Uint8Array) so .copy() and other
  // Node.js Buffer methods are available to mdb-reader internals.
  let reader;
  try {
    const buf = globalThis.Buffer.from(arrayBuffer);
    reader = new MDBReader(buf);
  } catch (e) {
    log.push({ level: 'ERROR', msg: `Cannot open as Access database: ${e.message}` });
    log.push({ level: 'INFO',  msg: 'The file may use an unsupported Access version, be password-protected, or be corrupted.' });
    return null;
  }

  const tableNames = reader.getTableNames();
  log.push({ level: 'INFO', msg: `ACCDB opened — ${tableNames.length} table(s): ${tableNames.join(', ')}` });

  // ── Find JOBNAME, FLANGE, STRESS and DISPLACEMENT info globally ──────────────────────────────
  let jobName = null;
  let flanges = [];
  let stresses = [];
  let displacements = [];
  const units = defaultUnits();
  const staleBucket = createStaleBucket();

  for (const tName of tableNames) {
    try {
      const t = reader.getTable(tName);
      const rawCols = t.getColumnNames();
      const tCols = rawCols.map(c => c.toUpperCase());
      const rows = t.getData();

      const tableUnits = extractUnitsFromTable(tName, rawCols, rows);
      mergeUnits(units, tableUnits, tName);
      if (tableUnits) {
        const unitPairs = Object.entries(tableUnits).map(([k, v]) => `${k}=${v}`).join(', ');
        log.push({ level: 'INFO', msg: `Units extracted from "${tName}": ${unitPairs}` });
      }

      // Extract JobName
      if (!jobName && tCols.some(c => c.includes('JOBNAME') || c.includes('PROJECT'))) {
        const tr = rows[0];
        if (tr) {
          const jk = Object.keys(tr).find(k => k.toUpperCase().includes('JOBNAME') || k.toUpperCase() === 'JOB');
          if (jk && tr[jk]) jobName = String(tr[jk]).trim();
        }
      }
      // Extract Flange
      if (tName.toLowerCase().includes('output_flange')) {
        for (const fr of rows) {
           const node = fr['NODE'] || fr['NODE_NUM'] || '—';
           const method = String(fr['METHOD'] || 'Equivalent Pressure').replace('method', '').trim();
           const maxPct = fr['RATIO'] || fr['MAX_PERCENT'] || fr['PERCENT'] || '—';
           const status = fr['STATUS'] || fr['PASSFAIL'] || (parseFloat(maxPct) <= 100 ? 'PASS' : parseFloat(maxPct) > 100 ? 'FAIL' : 'PASS');
           flanges.push({ 
             location: `Node ${node}`, 
             method: method, 
             standard: 'Generic', 
             status: String(status).toUpperCase() === 'FAIL' || status === '1' ? 'FAIL' : 'PASS',
             maxPct: typeof maxPct === 'number' ? maxPct.toFixed(1) : parseFloat(maxPct).toFixed(1)
           });
        }
      }

      // Extract Stresses
      if (tName.toLowerCase().includes('output_stress')) {
        for (const sr of rows) {
            const node = sr['FROM_NODE'] || sr['NODE'] || '—';
            const loadCase = sr['CASE'] || sr['LCASE_NAME'] || `Case ${sr['LCASE_NUM']}`;
            const calcRaw = sr['CODE_STRESST'] || sr['CODE_STRESSF'] || sr['CODE_STRESS'] || sr['CALC_STRESS'] || 0;
            const allowRaw = sr['ALLOW_STRESST'] || sr['ALLOW_STRESSF'] || sr['ALLOW_STRESS'] || sr['ALLOWABLE'] || null;
            const calc = roundField(calcRaw, 2) ?? 0;
            const allow = allowRaw !== null && allowRaw !== undefined && allowRaw !== '' ? roundField(allowRaw, 2) : null;
            const ratioRaw = sr['PRCT_STRT'] || sr['PRCT_STRF'] || sr['RATIO'] || (allowRaw ? (Number(calcRaw) / Number(allowRaw) * 100) : 0);
            const ratio = roundField(ratioRaw, 1) ?? 0;
            const status = sr['CHECK_STATUS'] || (ratio <= 100 ? 'PASS' : 'FAIL');

            stresses.push({
                node,
                loadCase,
                calc,
                allow,
                ratio,
                status: String(status).toUpperCase().includes('PASS') ? 'PASS' : 'FAIL',
            });
        }
        log.push({ level: 'OK', msg: `Extracted ${stresses.length} stress records from "${tName}"` });
      }

      // Extract Displacements
      if (tName.toLowerCase().includes('output_displacement')) {
        for (const dr of rows) {
            const node = dr['NODE'] || dr['NODE_NUM'] || '—';
            const loadCase = dr['CASE'] || dr['LCASE_NAME'] || `Case ${dr['LCASE_NUM']}`;
            const dx = roundField(dr['DX'] || 0, 2) ?? 0;
            const dy = roundField(dr['DY'] || 0, 2) ?? 0;
            const dz = roundField(dr['DZ'] || 0, 2) ?? 0;

            displacements.push({
                node,
                loadCase,
                dx,
                dy,
                dz,
            });
        }
        log.push({ level: 'OK', msg: `Extracted ${displacements.length} displacement records from "${tName}"` });
      }

    } catch(e) {}
  }

  // ── 3. Strategy A — look for embedded CAESAR II neutral/XML text ──────────
  for (const name of tableNames) {
    try {
      const table = reader.getTable(name);
      const cols  = table.getColumnNames();
      const rows  = table.getData();
      for (const col of cols) {
        for (const row of rows.slice(0, 10)) {
          const val = row[col];
          if (typeof val === 'string' && val.length > 200) {
            if (/^#\$\s*(VERSION|ELEMENTS|CONTROL)/m.test(val)) {
              log.push({ level: 'OK', msg: `Found embedded CAESAR II neutral text in table "${name}", column "${col}"` });
              return { embeddedText: val, jobName, flanges, stresses: summarizeStressRows(stresses), stressDetails: stresses, displacements: summarizeDisplacementRows(displacements), displacementDetails: displacements, units, staleValues: summarizeStale(staleBucket) };
            }
            if (val.includes('<CAESARII') || val.includes('<PIPINGMODEL')) {
              log.push({ level: 'OK', msg: `Found embedded CAESARII XML text in table "${name}", column "${col}"` });
              return { embeddedText: val, jobName, flanges, stresses: summarizeStressRows(stresses), stressDetails: stresses, displacements: summarizeDisplacementRows(displacements), displacementDetails: displacements, units, staleValues: summarizeStale(staleBucket) };
            }
          }
        }
      }
    } catch { /* skip unreadable tables */ }
  }

  // ── 4. Strategy B — find table with FROM/TO node + geometry columns ───────
  for (const name of tableNames) {
    try {
      const table = reader.getTable(name);
      const cols  = table.getColumnNames();

      const fromCol = matchCol(cols, 'from');
      const toCol   = matchCol(cols, 'to');
      const odCol   = matchCol(cols, 'od');
      const dxCol   = matchCol(cols, 'dx');
      const dyCol   = matchCol(cols, 'dy');
      const dzCol   = matchCol(cols, 'dz');

      // Need at minimum: FROM + TO + either geometry (dx/dy/dz) or size (OD)
      if (!fromCol || !toCol || (!odCol && !dxCol)) continue;

      const wallCol   = matchCol(cols, 'wall');
      const insulCol  = matchCol(cols, 'insul');
      const t1Col     = matchCol(cols, 'T1');
      const t2Col     = matchCol(cols, 'T2');
      const p1Col     = matchCol(cols, 'P1');
      const p2Col     = matchCol(cols, 'P2');
      const densCol   = matchCol(cols, 'density');
      const matCol    = matchCol(cols, 'matName');
      const corrCol   = matchCol(cols, 'corr');
      const restCol   = matchCol(cols, 'rest');

      log.push({ level: 'INFO', msg: `Pipe-like table "${name}": FROM="${fromCol}" TO="${toCol}" OD="${odCol ?? '—'}" DX="${dxCol ?? '—'}" columns: ${cols.length}` });

      const rows = table.getData();
      log.push({ level: 'INFO', msg: `  → ${rows.length} row(s)` });

      const elements = [];
      const nodes    = {};
      const restraints = [];
      const restraintIds = new Set();

      // Carry-forward (same pattern as XML parser)
      let pOd = 0, pWall = 0, pInsul = 0, pT1 = 0, pT2 = 0, pP1 = 0, pP2 = 0, pDens = 7.833e-3, pMat = 'CS', pCorr = 0;

      // Origin for first node
      const firstFrom = parseInt(rows[0]?.[fromCol]) || 0;
      if (firstFrom > 0) nodes[firstFrom] = { x: 0, y: 0, z: 0 };

      for (let i = 0; i < rows.length; i++) {
        const row  = rows[i];
        const from = parseInt(row[fromCol]) || 0;
        const to   = parseInt(row[toCol])   || 0;
        if (!from || !to || from === to) continue;

        const dx = roundField(num(row, dxCol), 3) ?? 0;
        const dy = roundField(num(row, dyCol), 3) ?? 0;
        const dz = roundField(num(row, dzCol), 3) ?? 0;

        const odRes    = resolveNumeric(row, odCol,    pOd,    0, 3);
        const wallRes  = resolveNumeric(row, wallCol,  pWall,  0, 3);
        const insulRes = resolveNumeric(row, insulCol, pInsul, 0, 3);
        const t1Res    = resolveNumeric(row, t1Col,    pT1,    0, 2);
        const t2Res    = resolveNumeric(row, t2Col,    pT2,    0, 2);
        const p1Res    = resolveNumeric(row, p1Col,    pP1,    0, 2);
        const p2Res    = resolveNumeric(row, p2Col,    pP2,    0, 2);
        const densRes  = resolveNumeric(row, densCol,  pDens,  7.833e-3, 4);
        const corrRes  = resolveNumeric(row, corrCol,   pCorr,  0, 3);
        const matRes   = resolveString(row, matCol,     pMat,   'CS');

        const od       = odRes.value;
        const wall     = wallRes.value;
        const insul    = insulRes.value;
        const T1       = t1Res.value;
        const T2       = t2Res.value;
        const P1       = p1Res.value;
        const P2       = p2Res.value;
        const density  = densRes.value;
        const material = matRes.value;
        const corrosion = corrRes.value;

        pOd = od;  pWall = wall;  pInsul = insul;
        pT1 = T1;  pT2 = T2;      pP1 = P1;  pP2 = P2;
        pDens = density; pMat = material;  pCorr = corrosion;

        pushStale(staleBucket, 'OD', odRes.source, od, name, odCol, i);
        pushStale(staleBucket, 'WALL', wallRes.source, wall, name, wallCol, i);
        pushStale(staleBucket, 'INSUL', insulRes.source, insul, name, insulCol, i);
        pushStale(staleBucket, 'T1', t1Res.source, T1, name, t1Col, i);
        pushStale(staleBucket, 'T2', t2Res.source, T2, name, t2Col, i);
        pushStale(staleBucket, 'P1', p1Res.source, P1, name, p1Col, i);
        pushStale(staleBucket, 'P2', p2Res.source, P2, name, p2Col, i);
        pushStale(staleBucket, 'DENSITY', densRes.source, density, name, densCol, i);
        pushStale(staleBucket, 'CORR', corrRes.source, corrosion, name, corrCol, i);
        pushStale(staleBucket, 'MATERIAL', matRes.source, material, name, matCol, i);

        if (!nodes[from]) nodes[from] = { x: 0, y: 0, z: 0 };
        const origin = nodes[from];
        const toPos  = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
        if (!nodes[to]) nodes[to] = toPos;

        const restPtr = parseInt(row[restCol]) || 0;

        elements.push({
          index: i, from, to, dx, dy, dz, od, wall, insul,
          T1, T2, P1, P2, corrosion,
          E_cold: 203390.7, E_hot: 178960.6, density, poisson: 0.292,
          material,
          length:  pipeLength(dx, dy, dz),
          fromPos: { ...origin },
          toPos:   { ...toPos },
          hasBend: false,
          restPtr: restPtr
        });

        if (restPtr > 0 && !restraintIds.has(from)) {
          // Add a basic restraint tag if a pointer is found and node isn't tagged yet
          restraints.push({ ptr: restPtr, node: from, type: 'Support (ACCDB)', isAnchor: false, dofs: [1], stiffness: 1e10 });
          restraintIds.add(from);
        }
      }

      // We already extracted JOBNAME, FLANGE, STRESSES, and DISPLACEMENTS globally earlier.
      // Re-use `jobName`, `flanges`, `stresses`, `displacements` from outer scope.

      if (elements.length > 0) {
        log.push({ level: 'OK', msg: `Extracted ${elements.length} element(s) from ACCDB table "${name}"` });
        return {
          elements, nodes,
          bends: [], restraints, forces: [], rigids: [], flanges,
          stresses: summarizeStressRows(stresses),
          stressDetails: stresses,
          displacements: summarizeDisplacementRows(displacements),
          displacementDetails: displacements,
          units,
          staleValues: summarizeStale(staleBucket),
          meta: { sourceTable: name, jobName },
          format: 'ACCDB-TABLE',
        };
      }

      log.push({ level: 'WARN', msg: `Table "${name}" matched structure but yielded 0 valid elements` });
    } catch (e) {
      log.push({ level: 'WARN', msg: `Table "${name}" unreadable: ${e.message}` });
    }
  }

  // ── 5. Nothing found — dump full schema for diagnostics ──────────────────
  log.push({ level: 'WARN', msg: 'No CAESAR II pipe data recognized. Full table schema:' });
  for (const name of tableNames) {
    try {
      const table    = reader.getTable(name);
      const cols     = table.getColumnNames();
      const rowCount = table.getData().length;
      log.push({ level: 'INFO', msg: `  "${name}": ${rowCount} row(s) | ${cols.join(', ')}` });
    } catch (e) {
      log.push({ level: 'WARN', msg: `  "${name}": unreadable — ${e.message}` });
    }
  }

  log.push({ level: 'ERROR', msg: 'No pipe element data could be extracted from this Access database.' });
  log.push({ level: 'INFO',  msg: 'Export from CAESAR II: File → Neutral File → select all sections → save (generates a text file you can load here).' });
  return null;
}
