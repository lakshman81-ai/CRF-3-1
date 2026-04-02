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

  /** 3D Viewer Settings */
  viewerSettings: {
    // Camera
    cameraMode: '3d-orbit',
    projection: 'perspective',
    fov: 60,
    nearPlane: 0.1,
    farPlane: 1000000,
    rotateSpeed: 1.0,
    panSpeed: 1.0,
    zoomSpeed: 1.0,
    dampingFactor: 0.08,
    invertX: false,
    invertY: false,
    zoomToCursor: true,
    autoNearFar: true,

    // Axis
    axisConvention: 'Z-up',
    upAxis: 'Z',
    northAxis: 'Y',
    eastAxis: 'X',
    showAxisGizmo: true,
    gizmoSize: 80,
    gizmoPosition: 'bottom-left',

    // View Cube
    showViewCube: true,
    viewCubeSize: 120,
    viewCubePosition: 'top-right',
    viewCubeOpacity: 0.85,
    viewCubeAnimDuration: 400,

    // Labels
    showLabels: true,
    labelMode: 'smart-density',
    labelDensity: 0.5,
    labelFontSize: 12,
    labelBackground: true,
    labelLeaderLines: true,
    labelCollisionMode: 'hide',
    labelPinning: false,
    labelPrecision: 2,

    // Restraints
    showRestraints: true,
    showOnlySelectedRestraints: false,
    showActiveRestraints: false,
    showRestraintNames: true,
    showRestraintGUIDs: false,
    restraintSymbolScale: 1.0,
    filterSupportType: 'all',
    highlightFiredState: true,

    // Section
    sectionEnabled: false,
    sectionAxis: 'X',
    sectionOffset: 0,
    sectionCap: true,
    clipIntersection: false,

    // Appearance
    themePreset: 'IsoTheme',
    renderStyle: 'iso',
    backgroundColor: '#1A1A2E',
    antialias: true,
    showGrid: true,
    showLegend: true,

    // Selection
    showTransparency: false,
    selectionColor: '#FFA500',
    hoverColor: '#88CCFF',

    // Properties
    showProperties: true,
    propertyGroups: 'all',
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
    const savedSticky = localStorage.getItem('concise-viewer-sticky');
    if (savedSticky) {
      const parsed = JSON.parse(savedSticky);
      Object.assign(state.sticky, parsed);
    }

    const savedViewer = localStorage.getItem('viewer3d_settings');
    if (savedViewer) {
      const parsed = JSON.parse(savedViewer);
      Object.assign(state.viewerSettings, parsed);
    }
  } catch(e) {}
}

/** Save overrides to localStorage */
export function saveStickyState() {
  try {
    localStorage.setItem('concise-viewer-sticky', JSON.stringify(state.sticky));
    localStorage.setItem('viewer3d_settings', JSON.stringify(state.viewerSettings));
  } catch(e) {}
}
