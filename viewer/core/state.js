/**
 * state.js — Shared singleton state for the viewer app.
 * All modules read/write through this object; changes are broadcast via event-bus.
 */

export const state = {
  /** Sticky user overrides for persistent text fields */
  sticky: {
    code: 'ASME B31.3 - 2016',
    project: 'Petroleum Development Oman-PDO',
    facility: 'Inlet Separation and Boosting Facility, Ohanet',
    docNo: 'XX-XX-PFEED-',
    revision: 'Rev 0',
    references: [], // user-edited rows
    assumptions: [], // user-edited HTML
    notes: [], // user-edited HTML
  },

  /** Raw text of the loaded ACCDB file */
  rawText: null,
  /** Filename of the loaded file */
  fileName: null,
  /** Parsed CAESAR II data object */
  parsed: null,
  /** Parser log entries [{level, msg}] */
  log: [],
  /** Validation errors [{level, msg, elementIndex?}] */
  errors: [],
  /** Currently active tab id */
  activeTab: 'summary',
  /** Table toggle states */
  tableToggles: {},
  /** Scope toggle states */
  scopeToggles: {
    code: true,
    nozzle: true,
    support: true,
    hydro: false,
    flange: true,
  },
  /** Nodes pinned to the Applied Loads table */
  pinnedLoadNodes: [],
  /** Legend field selection for geometry tab */
  legendField: 'pipelineRef',
  /** Geometry overlay toggles */
  geoToggles: {
    nodeLabels: true,
    supports: true,
    maxLegendLabels: 3,
  },
  /** Input tab picker selections */
  inputToggles: {
    props: [],
    classes: [],
  },
};

export function resetParsedState() {
  state.rawText = null;
  state.fileName = null;
  state.parsed = null;
  state.log = [];
  state.errors = [];
  state.pinnedLoadNodes = [];
  state.inputToggles.props = [];
  state.inputToggles.classes = [];
}

/** Retrieve overrides from localStorage */
export function loadStickyState() {
  try {
    const saved = localStorage.getItem('concise-viewer-sticky');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state.sticky, parsed);
    }
  } catch(e) {}
}

/** Save overrides to localStorage */
export function saveStickyState() {
  try {
    localStorage.setItem('concise-viewer-sticky', JSON.stringify(state.sticky));
  } catch(e) {}
}
