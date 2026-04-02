/**
 * app.js — Tab router and file loading (drag-drop + file picker).
 */

import { state, resetParsedState } from './state.js';
import { emit, on } from './event-bus.js';
import { parse } from '../parser/caesar-parser.js';
import { renderSummary }  from '../tabs/summary-tab.js';
import { renderInput }    from '../tabs/input-tab.js';
import { renderGeometry } from '../tabs/geometry-tab.js';
import { renderStress }   from '../tabs/stress-tab.js';
import { renderSupports } from '../tabs/supports-tab.js';
import { renderNozzle }   from '../tabs/nozzle-tab.js';
import { renderDebug }    from '../tabs/debug-tab.js';

const TABS = [
  { id: 'input',     label: 'Input Data',  render: renderInput    },
  { id: 'geometry',  label: 'Geometry',    render: renderGeometry },
  { id: 'summary',   label: 'Summary',     render: renderSummary  },
  { id: 'stress',    label: 'Stress',      render: renderStress   },
  { id: 'supports',  label: 'Supports',    render: renderSupports },
  { id: 'nozzle',    label: 'Nozzle',      render: renderNozzle   },
  { id: 'debug',     label: 'Debug',       render: renderDebug    },
];

let _activeRenderer = null;

/** Bootstrap the app — called from index.html */
export function init() {
  import('./state.js').then(m => m.loadStickyState()).then(() => {
    _wireHeader();
    _buildTabBar();
    _switchTab('input');
    _wirePrint();
    _wireFileLoad();
  });
}

function _wireHeader() {
  const fields = document.querySelectorAll('.editable-field');
  fields.forEach(f => {
    const key = f.dataset.key;
    if (state.sticky[key]) f.textContent = state.sticky[key];
    
    if (key === 'docNo' && state.sticky.docNoInitialized !== true) {
       f.classList.add('uninitialized');
    } else if (key === 'docNo') {
       f.classList.remove('uninitialized');
    }

    f.addEventListener('blur', () => {
      state.sticky[key] = f.textContent.trim();
      import('./state.js').then(m => m.saveStickyState());
      if (key === 'docNo') {
         state.sticky.docNoInitialized = true;
         f.classList.remove('uninitialized');
         emit('docno-changed', state.sticky.docNo);
      }
    });
  });

  on('docno-changed', val => {
    const docF = document.getElementById('hdr-docno');
    if (docF && docF.textContent !== val) {
      docF.textContent = val;
      docF.classList.remove('uninitialized');
    }
  });

  on('parse-complete', (result) => {
    const sysF = document.getElementById('hdr-system');
    if (sysF && result.meta?.jobName) {
      sysF.textContent = result.meta.jobName;
    }
    // Also docno reset color on new file
    const docF = document.getElementById('hdr-docno');
    if (docF) {
      docF.classList.add('uninitialized');
      state.sticky.docNoInitialized = false;
      import('./state.js').then(m => m.saveStickyState());
    }
  });
  
  // Scope toggles affecting tabs
  on('scope-changed', ({ id, value }) => {
    _updateTabVisibility();
  });
}

function _updateTabVisibility() {
  // mapping from scope IDs to tab IDs
  const tabScopes = { nozzle: 'nozzle', support: 'supports', flange: 'nozzle' };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tid = btn.dataset.tab;
    // Check if any scope linked to this tab is ON
    let visible = true;
    for (const [scopeId, tabIdMatch] of Object.entries(tabScopes)) {
      if (tid === tabIdMatch && state.scopeToggles[scopeId] === false) {
        visible = false;
      }
    }
    // Exception: flange and nozzle are on the same tab now. If either is true, show it.
    if (tid === 'nozzle') {
      visible = state.scopeToggles['nozzle'] || state.scopeToggles['flange'];
    }
    btn.style.display = visible ? '' : 'none';
  });
}

// ── Tab bar ────────────────────────────────────────────────────────────────

function _buildTabBar() {
  const bar = document.getElementById('tab-bar');
  if (!bar) return;
  bar.innerHTML = TABS.map(t =>
    `<button class="tab-btn" data-tab="${t.id}">${t.label}</button>`
  ).join('');
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn) _switchTab(btn.dataset.tab);
  });
}

function _switchTab(tabId) {
  state.activeTab = tabId;
  const content = document.getElementById('tab-content');
  if (!content) return;

  // Update active button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  _updateTabVisibility();

  // Render tab
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;
  tab.render(content);

  emit('tab-changed', tabId);
}

// ── File loading ───────────────────────────────────────────────────────────

function _wireFileLoad() {
  // Drag-and-drop on entire page
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) _loadFile(file);
  });

  // Events from tabs
  on('file-dropped', file => _loadFile(file));
}

function _loadFile(file) {
  const status = document.getElementById('app-status');
  if (status) { status.textContent = `Loading: ${file.name} …`; status.className = 'status-loading'; }

  // Read as ArrayBuffer so we can handle both text and binary ACCDB files.
  const reader = new FileReader();
  reader.onload = e => {
    const buf  = e.target.result;
    // Decode as UTF-8; {fatal:false} replaces bad bytes rather than throwing.
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    // Binary ACCDB: contains null bytes — route to the MDB parser.
    if (text.includes('\u0000')) {
      _processBinaryAccdb(buf, file.name);
    } else {
      _processText(text, file.name);
    }
  };
  reader.onerror = () => {
    if (status) { status.textContent = `Failed to read: ${file.name}`; status.className = 'status-error'; }
  };
  reader.readAsArrayBuffer(file);
}

async function _processBinaryAccdb(arrayBuffer, fileName) {
  const status = document.getElementById('app-status');
  if (status) { status.textContent = `Reading Access database: ${fileName} …`; status.className = 'status-loading'; }

  resetParsedState();
  state.fileName = fileName;

  const log    = [];
  const errors = [];
  log.push({ level: 'INFO', msg: `File loaded: "${fileName}" | ${(arrayBuffer.byteLength / 1024).toFixed(0)} KB | Binary Access database` });

  let result;
  try {
    const { parseBinaryAccdb } = await import('../parser/accdb-mdb.js');
    const accdb = await parseBinaryAccdb(arrayBuffer, fileName, log);

    if (accdb?.embeddedText) {
      // Embedded CAESAR II neutral/XML text found inside a table column — parse normally.
      log.push({ level: 'INFO', msg: 'Handing embedded text to CAESAR II text parser…' });
      globalThis.__tempParsedAccdbPayload = accdb;
      const textResult = parse(accdb.embeddedText, fileName);
      globalThis.__tempParsedAccdbPayload = null;

      if (accdb.jobName) textResult.meta.jobName = accdb.jobName;
      if (accdb.flanges) textResult.flanges = accdb.flanges;
      if (accdb.stresses) textResult.stresses = accdb.stresses;
      if (accdb.displacements) textResult.displacements = accdb.displacements;
      if (accdb.stressDetails) textResult.stressDetails = accdb.stressDetails;
      if (accdb.displacementDetails) textResult.displacementDetails = accdb.displacementDetails;
      if (accdb.units) textResult.units = accdb.units;
      if (accdb.staleValues) textResult.staleValues = accdb.staleValues;
      result = { ...textResult, log: [...log, ...textResult.log] };

    } else if (accdb?.elements?.length > 0) {
      // Structured table extraction succeeded.
      const { validateElements, summarise } = await import('../parser/validator.js');
      const elVal = validateElements(accdb.elements, accdb.nodes);
      for (const e of elVal.errors)   errors.push(e);
      for (const w of elVal.warnings) log.push(w);
      const validation = summarise([], elVal.errors, elVal.warnings);
      result = {
        elements:      accdb.elements,
        nodes:         accdb.nodes,
        bends:         accdb.bends         ?? [],
        restraints:    accdb.restraints    ?? [],
        forces:        accdb.forces        ?? [],
        rigids:        accdb.rigids        ?? [],
        flanges:       accdb.flanges       ?? [],
        stresses:      accdb.stresses      ?? [],
        displacements: accdb.displacements ?? [],
        stressDetails: accdb.stressDetails ?? [],
        displacementDetails: accdb.displacementDetails ?? [],
        units:         accdb.units         ?? {},
        meta:          accdb.meta          ?? {},
        staleValues:   accdb.staleValues   ?? [],
        format:        accdb.format        ?? 'ACCDB-TABLE',
        log, errors, validation,
      };

    } else {
      // Unrecognised schema — surface everything in the Debug tab.
      errors.push({ level: 'ERROR', msg: 'No CAESAR II pipe data could be extracted from this Access database.' });
      errors.push({ level: 'INFO',  msg: 'Export from CAESAR II: File → Neutral File → select all sections → save, then load that file here.' });
      result = {
        elements: [], nodes: {}, bends: [], restraints: [], forces: [], rigids: [],
        units: {}, meta: {}, format: 'ACCDB-BINARY', log, errors,
        validation: { status: 'ERROR', summary: 'Binary ACCDB — schema not recognised' },
      };
    }
  } catch (err) {
    console.error('_processBinaryAccdb threw:', err);
    errors.push({ level: 'ERROR', msg: `Binary ACCDB exception: ${err.message}` });
    result = {
      elements: [], nodes: {}, bends: [], restraints: [], forces: [], rigids: [],
      units: {}, meta: {}, format: 'ACCDB-BINARY', log, errors,
      validation: { status: 'ERROR', summary: `Exception: ${err.message}` },
    };
  }

  state.parsed = result;
  state.log    = result.log;
  state.errors = result.errors;

  const elCount   = result.elements?.length ?? 0;
  const nodeCount = Object.keys(result.nodes ?? {}).length;
  const errCount  = result.errors?.length   ?? 0;

  if (status) {
    status.textContent = `${fileName} — ${elCount} elements, ${nodeCount} nodes${errCount ? `, ${errCount} error(s)` : ''}`;
    status.className   = errCount ? 'status-error' : 'status-ok';
  }

  emit('file-loaded',    { fileName });
  emit('parse-complete', result);

  const tab     = TABS.find(t => t.id === state.activeTab);
  const content = document.getElementById('tab-content');
  if (tab && content) tab.render(content);
}

function _processText(rawText, fileName) {
  resetParsedState();
  state.rawText  = rawText;
  state.fileName = fileName;
  emit('file-loaded', { rawText, fileName });

  let result;
  try {
    result = parse(rawText, fileName);
  } catch (err) {
    console.error('parse() threw:', err);
    const status = document.getElementById('app-status');
    if (status) {
      status.textContent = `Parse error: ${err.message} — check console for details`;
      status.className = 'status-error';
    }
    // Still push a minimal parsed state so the UI doesn't show "No file loaded"
    result = {
      elements: [], nodes: {}, bends: [], restraints: [], forces: [], rigids: [],
      units: {}, meta: {}, format: 'ERROR',
      log: [{ level: 'ERROR', msg: `Unhandled parse exception: ${err.message}` }],
      errors: [{ level: 'ERROR', msg: `Unhandled parse exception: ${err.message}` }],
      validation: { status: 'ERROR', summary: `Parse exception: ${err.message}` },
    };
  }

  state.parsed = result;
  state.log    = result.log;
  state.errors = result.errors;

  const elCount   = result.elements?.length ?? 0;
  const nodeCount = Object.keys(result.nodes ?? {}).length;
  const errCount  = result.errors?.length ?? 0;

  const status = document.getElementById('app-status');
  if (status) {
    status.textContent = `${fileName} — ${elCount} elements, ${nodeCount} nodes${errCount ? `, ${errCount} error(s)` : ''}`;
    status.className = errCount ? 'status-error' : 'status-ok';
  }

  emit('parse-complete', result);

  // Always re-render active tab to reflect new data
  const tab = TABS.find(t => t.id === state.activeTab);
  const content = document.getElementById('tab-content');
  if (tab && content) tab.render(content);
}

/** Navigate to a tab programmatically */
export function goToTab(tabId) { _switchTab(tabId); }

/** Prepare stress report: validate + switch to Summary */
export function prepareReport() {
  const parsed = state.parsed;
  _switchTab('summary');
  // Flash "report ready" status
  const status = document.getElementById('app-status');
  if (status && parsed && parsed.elements?.length) {
    status.textContent = `Report ready — ${parsed.elements.length} elements | ${parsed.format} format | ${parsed.validation?.status ?? 'OK'}`;
    status.className = 'status-ok';
  }
}

// ── Print ──────────────────────────────────────────────────────────────────

function _wirePrint() {
  document.getElementById('print-btn')?.addEventListener('click', _showPrintModal);
  document.getElementById('print-modal-cancel')?.addEventListener('click', _hidePrintModal);
  document.getElementById('print-modal-confirm')?.addEventListener('click', _doPrint);
}

const _printSections = [];

function _showPrintModal() {
  const modal = document.getElementById('print-modal');
  const list = document.getElementById('print-modal-list');
  if (!modal || !list) return;

  _printSections.length = 0;
  let html = '';

  // Get all visible tabs except debug
  const activeTabs = TABS.filter(t => t.id !== 'debug' && document.querySelector(`.tab-btn[data-tab="${t.id}"]`)?.style.display !== 'none');

  // We need to render all tabs temporarily to grab their sections,
  // but it's easier to maintain state. We will map tab renderers to offscreen divs.
  const tempWrap = document.createElement('div');

  activeTabs.forEach((tab, index) => {
    const tabContainer = document.createElement('div');
    tab.render(tabContainer);

    // Find all sections in this tab
    // We treat top-level blocks or headings as sections.
    const h3s = Array.from(tabContainer.querySelectorAll('h3.section-heading'));

    html += `<div style="margin-bottom: 10px;">
      <label style="font-weight:bold; cursor:pointer;">
        <input type="checkbox" checked class="print-tab-toggle" data-idx="${index}"> ${tab.label}
      </label>
      <div style="margin-left:20px; margin-top:5px; display:flex; flex-direction:column; gap:4px;">`;

    h3s.forEach((h3, subIndex) => {
      // Create a unique id to identify this heading later
      const uid = `print-sect-${tab.id}-${subIndex}`;
      // In the actual DOM, we'll find the heading by text content, or inject data-attributes
      _printSections.push({ tabId: tab.id, headingText: h3.textContent, uid });

      html += `<label style="font-size:12px; cursor:pointer;">
        <input type="checkbox" checked class="print-sect-toggle" data-tab-idx="${index}" data-uid="${uid}"> ${h3.textContent}
      </label>`;
    });

    html += `</div></div>`;
  });

  list.innerHTML = html;

  // Wire modal logic
  list.querySelectorAll('.print-tab-toggle').forEach(tabChk => {
    tabChk.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const idx = e.target.dataset.idx;
      list.querySelectorAll(`.print-sect-toggle[data-tab-idx="${idx}"]`).forEach(sectChk => {
        sectChk.checked = isChecked;
      });
    });
  });

  list.querySelectorAll('.print-sect-toggle').forEach(sectChk => {
    sectChk.addEventListener('change', (e) => {
      const idx = e.target.dataset.tabIdx;
      const allSect = Array.from(list.querySelectorAll(`.print-sect-toggle[data-tab-idx="${idx}"]`));
      const tabChk = list.querySelector(`.print-tab-toggle[data-idx="${idx}"]`);
      if (allSect.some(chk => chk.checked)) {
        tabChk.checked = true;
      } else {
        tabChk.checked = false;
      }
    });
  });

  modal.style.display = 'flex';
}

function _hidePrintModal() {
  const modal = document.getElementById('print-modal');
  if (modal) modal.style.display = 'none';
}

function _doPrint() {
  _hidePrintModal();

  // 1. Gather unchecked items
  const uncheckedUids = new Set(
    Array.from(document.querySelectorAll('.print-sect-toggle:not(:checked)'))
         .map(chk => chk.dataset.uid)
  );

  const uncheckedTabs = new Set(
    Array.from(document.querySelectorAll('.print-tab-toggle:not(:checked)'))
         .map(chk => TABS.filter(t => t.id !== 'debug')[parseInt(chk.dataset.idx)].id)
  );

  // Inject geometry canvas as a print-only image BEFORE rendering all tabs
  const geoCanvas = document.querySelector('#canvas-wrap canvas');
  let dataUrl = null;
  if (geoCanvas) {
    try {
      dataUrl = geoCanvas.toDataURL('image/png');
    } catch { /* CORS or no canvas yet */ }
  }

  // To print ALL tabs seamlessly, we must render them all into the DOM.
  // We'll append them to #tab-content temporarily.
  const content = document.getElementById('tab-content');
  const originalHtml = content.innerHTML;
  const originalTabId = state.activeTab;

  content.innerHTML = '';

  const activeTabs = TABS.filter(t => t.id !== 'debug' && document.querySelector(`.tab-btn[data-tab="${t.id}"]`)?.style.display !== 'none');

  activeTabs.forEach(tab => {
    const tabDiv = document.createElement('div');
    if (uncheckedTabs.has(tab.id)) {
      tabDiv.classList.add('print-hidden');
    }
    tab.render(tabDiv);

    // hide specific sections
    const h3s = Array.from(tabDiv.querySelectorAll('h3.section-heading'));
    h3s.forEach((h3, idx) => {
      const uid = `print-sect-${tab.id}-${idx}`;
      if (uncheckedUids.has(uid)) {
        // Find everything from this h3 up to the next h3 (or end of tab)
        h3.classList.add('print-hidden');
        let next = h3.nextElementSibling;
        while (next && !next.matches('h3.section-heading')) {
          next.classList.add('print-hidden');
          next = next.nextElementSibling;
        }
      }
    });

    content.appendChild(tabDiv);
  });

  // Re-inject image now that Geometry tab might have been rendered
  const printGeo = document.getElementById('print-geo-img');
  if (printGeo && dataUrl) {
    printGeo.src = dataUrl;
    printGeo.style.display = 'block';
  } else if (printGeo) {
    printGeo.style.display = 'none';
  }

  // Execute print
  window.print();

  // Restore DOM
  if (printGeo) printGeo.style.display = 'none';
  content.innerHTML = originalHtml;
  _switchTab(originalTabId);
}
