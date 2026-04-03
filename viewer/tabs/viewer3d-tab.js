/**
 * viewer3d-tab.js - 3D Viewer tab with dedicated viewer3DConfig wiring.
 */

import { state, saveStickyState } from '../core/state.js';
import { on, emit } from '../core/event-bus.js';
import { addTraceEvent } from '../core/logger.js';
import { buildUniversalCSV, normalizeToPCF } from '../utils/accdb-to-pcf.js';
import { PcfViewer3D } from '../viewer-3d.js';
import { getResolvedViewer3DConfig } from '../viewer-3d-config.js';
import { resolveActionOrder, executeViewerAction } from '../viewer-actions.js';
import { buildComponentPanelModel } from '../viewer3d/component-panel-model.js';

let _viewer = null;
let _listenersRegistered = false;
let _shortcutHandler = null;
let _selectedComponent = null;

const ACTION_LABELS = {
  NAV_SELECT: 'Select',
  NAV_ORBIT: 'Orbit',
  NAV_PLAN_X: 'PlanX',
  NAV_ROTATE_Y: 'RotY',
  NAV_ROTATE_Z: 'RotZ',
  NAV_PAN: 'Pan',
  VIEW_FIT_ALL: 'FitAll',
  VIEW_FIT_SELECTION: 'FitSel',
  VIEW_TOGGLE_PROJECTION: 'Proj',
  SNAP_ISO_NW: 'NW',
  SNAP_ISO_NE: 'NE',
  SNAP_ISO_SW: 'SW',
  SNAP_ISO_SE: 'SE',
  SECTION_BOX: 'SecBox',
  SECTION_PLANE_UP: 'SecUp',
  SECTION_DISABLE: 'SecOff',
};

const ACTION_ICONS = {
  NAV_SELECT: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 3v14l4-3 3 7 2-1-3-7h6z"/></svg>',
  NAV_ORBIT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-20 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(70 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>',
  NAV_PLAN_X: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12a7 7 0 1 1 7 7"/><polyline points="10,17 12,19 10,21" fill="currentColor" stroke="currentColor"/></svg>',
  NAV_ROTATE_Y: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="3.5" ry="8"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="3,2"/></svg>',
  NAV_ROTATE_Z: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="8" ry="3.5"/><line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="3,2"/></svg>',
  NAV_PAN: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14m-7-7h14m-14 0l3-3m-3 3l3 3m11-3l-3-3m3 3l-3 3"/></svg>',
  VIEW_FIT_ALL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8v8H8z"/></svg>',
  VIEW_FIT_SELECTION: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="7" width="10" height="10" rx="1"/><circle cx="12" cy="12" r="2"/></svg>',
  VIEW_TOGGLE_PROJECTION: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16v16H4z M4 4l5 5 M20 4l-5 5 M4 20l5-5 M20 20l-5-5"/></svg>',
  SNAP_ISO_NW: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="currentColor">NW</text></svg>',
  SNAP_ISO_NE: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="currentColor">NE</text></svg>',
  SNAP_ISO_SW: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="currentColor">SW</text></svg>',
  SNAP_ISO_SE: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15" text-anchor="middle" font-size="7" fill="currentColor">SE</text></svg>',
  SECTION_BOX: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" stroke-dasharray="4 2"/><path d="M4 12h16"/></svg>',
  SECTION_PLANE_UP: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14h16"/><path d="M12 18V6"/><path d="M8 10l4-4 4 4"/></svg>',
  SECTION_DISABLE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M8 8l8 8"/></svg>',
};

export function renderViewer3D(container) {
  const cfg = getResolvedViewer3DConfig(state);
  const themeClass = `geo-theme-${String(state.viewerSettings.themePreset || 'NavisDark').toLowerCase()}`;
  const isLiveMount = container?.isConnected && container.id === 'tab-content';

  if (!_listenersRegistered) {
    on('parse-complete', () => _rerenderIfActive());
    on('file-loaded', () => _rerenderIfActive());
    on('viewer3d-config-changed', () => _rerenderIfActive());
    on('support-mapping-changed', () => _rerenderIfActive());
    on('tab-changed', (tabId) => {
      if (tabId !== 'viewer3d') _disposeViewer();
    });
    _listenersRegistered = true;
  }

  if (isLiveMount) {
    _disposeViewer();
  }

  const parsed = state.parsed;
  const components = _buildViewerComponents(parsed);
  const supportComponents = components.filter((c) => String(c.type || '').toUpperCase() === 'SUPPORT' || String(c.type || '').toUpperCase() === 'ANCI');
  if (parsed?.restraints?.length && supportComponents.length === 0) {
    components.push(..._buildSupportFallbackComponents(parsed));
  }
  if (isLiveMount) state.viewer3dComponents = components;

  const summary = _summariseComponents(components);
  const actions = resolveActionOrder(cfg);
  const showComponentPanel = !cfg.disableAllSettings && cfg.featureFlags?.componentPanel !== false && cfg.componentPanel?.enabled !== false;
  const addOnDisabledAttr = cfg.disableAllSettings ? 'disabled' : '';

  container.innerHTML = `
    <div class="geo-tab ${themeClass}" id="section-viewer3d">
      ${_renderToolbar(cfg, actions)}
      <div class="geo-main-area" style="width:100%;">
        <div class="geo-top-controls">
          <strong style="letter-spacing:0.05em;text-transform:uppercase;color:var(--color-primary-dark);">3D Viewer</strong>
          <span class="tab-note" style="margin:0;">
            ${parsed ? `${components.length} rendered component(s) from ${state.fileName ?? 'current file'}` : 'Load an .ACCDB file to build the model'}
          </span>

          <label class="control-label">
            Vertical Axis
            <select id="viewer3d-vertical-axis">
              <option value="Z" ${String(cfg.coordinateMap?.verticalAxis || 'Z') === 'Z' ? 'selected' : ''}>Z-up</option>
              <option value="Y" ${String(cfg.coordinateMap?.verticalAxis || 'Z') === 'Y' ? 'selected' : ''}>Y-up</option>
            </select>
          </label>
          <label class="control-label">
            Legend
            <select id="viewer3d-top-legend-mode" ${addOnDisabledAttr}>
              <option value="none" ${String(cfg.legend?.mode || 'none') === 'none' ? 'selected' : ''}>none</option>
              <option value="od" ${String(cfg.legend?.mode || 'none') === 'od' ? 'selected' : ''}>od</option>
              <option value="material" ${String(cfg.legend?.mode || 'none') === 'material' ? 'selected' : ''}>material</option>
              <option value="supportKind" ${String(cfg.legend?.mode || 'none') === 'supportKind' ? 'selected' : ''}>support kind</option>
              <option value="heatmap" ${String(cfg.legend?.mode || 'none') === 'heatmap' ? 'selected' : ''}>heatmap</option>
            </select>
          </label>
          <label class="control-label">
            <input type="checkbox" id="viewer3d-top-node-labels" ${cfg.legend?.canvasLabels?.showNodeIds ? 'checked' : ''} ${addOnDisabledAttr}>
            Node Nos.
          </label>
          <label class="control-label">
            <input type="checkbox" id="viewer3d-top-heatmap-enabled" ${cfg.heatmap?.enabled ? 'checked' : ''} ${addOnDisabledAttr}>
            Heatmap
          </label>
          <label class="control-label">
            Metric
            <select id="viewer3d-top-heatmap-metric" ${addOnDisabledAttr}>
              <option value="T1" ${String(cfg.heatmap?.metric || 'T1') === 'T1' ? 'selected' : ''}>T1</option>
              <option value="T2" ${String(cfg.heatmap?.metric || 'T1') === 'T2' ? 'selected' : ''}>T2</option>
              <option value="P1" ${String(cfg.heatmap?.metric || 'T1') === 'P1' ? 'selected' : ''}>P1</option>
            </select>
          </label>
          <label class="control-label" style="margin-left:auto;">
            Steps
            <input id="viewer3d-top-heatmap-buckets" type="number" min="2" max="12" style="width:56px" value="${Number(cfg.heatmap?.bucketCount || 5)}" ${addOnDisabledAttr}>
          </label>
          <label class="control-label">
            Box Pad
            <input id="viewer3d-section-boxpad" type="number" step="50" style="width:64px" value="0">
          </label>
          <label class="control-label">
            Plane Offset
            <input id="viewer3d-section-planeoffset" type="number" step="50" style="width:64px" value="0">
          </label>
          <button class="btn-secondary" id="viewer3d-open-config">Config</button>
          <button class="btn-secondary" id="viewer3d-fit-btn">Fit All</button>
          <button class="btn-secondary" id="viewer3d-fit-sel-btn">Fit Selection</button>
          <button class="btn-secondary" id="viewer3d-reset-btn">Reset</button>
        </div>

        <div class="geo-body">
          <div class="canvas-wrap" id="viewer3d-canvas-wrap">
            ${components.length
              ? '<div class="canvas-placeholder" id="viewer3d-placeholder" style="display:none;">Load an .ACCDB file to render the model</div>'
              : `<div class="canvas-placeholder" id="viewer3d-placeholder">${parsed ? 'No drawable geometry could be built from the converted ACCDB data.' : 'Load an .ACCDB file to render the model'}</div>`
            }
          </div>

          <aside class="geo-side-panel viewer3d-summary-panel">
            <div class="side-panel-tabs">
              ${showComponentPanel ? '<button class="panel-tab active" type="button" data-target="v3d-panel-component">Component Panel</button>' : ''}
              <button class="panel-tab ${showComponentPanel ? '' : 'active'}" type="button" data-target="v3d-panel-summary">Summary / Legend</button>
            </div>
            ${showComponentPanel ? `<div class="panel-content active" id="v3d-panel-component" style="display:block;">${_renderComponentPanel(cfg)}</div>` : ''}
            <div class="panel-content ${showComponentPanel ? '' : 'active'}" id="v3d-panel-summary" style="display:${showComponentPanel ? 'none' : 'block'};">
              ${_renderSummaryLegend(cfg, summary, parsed, components)}
            </div>
          </aside>
        </div>

        <div class="geo-status" id="viewer3d-status">
          <span>${parsed ? 'ACCDB-derived model ready' : 'Waiting for data'}</span>
          <span>${state.fileName ?? 'No file loaded'}</span>
        </div>
      </div>
    </div>
  `;

  _wireSidePanelTabs(container);

  if (!components.length || !isLiveMount) return;

  const wrap = container.querySelector('#viewer3d-canvas-wrap');
  if (!wrap) return;

  _viewer = new PcfViewer3D(wrap, {
    viewerConfig: cfg,
    onSelectionChange: (comp) => {
      _selectedComponent = comp || null;
      _updateComponentPanel(container, cfg);
      addTraceEvent({ type: 'selection', category: 'viewer3d', payload: { componentId: comp?.id || null, componentType: comp?.type || null } });
    },
    onTrace: (evt) => addTraceEvent(evt),
  });
  _viewer.render(components);

  if (cfg.heatmap?.enabled) {
    _viewer.applyHeatmap?.({
      metric: cfg.heatmap.metric,
      bucketCount: cfg.heatmap.bucketCount,
      palette: cfg.heatmap.palette,
      nullColor: cfg.heatmap.nullColor,
    });
  }

  _wireViewerControls(container, cfg, actions);
  _registerShortcuts(cfg, actions);
}

function _rerenderIfActive() {
  const content = document.getElementById('tab-content');
  if (state.activeTab === 'viewer3d' && content) renderViewer3D(content);
}

function _disposeViewer() {
  if (_shortcutHandler) {
    window.removeEventListener('keydown', _shortcutHandler);
    _shortcutHandler = null;
  }
  if (_viewer) {
    _viewer.dispose();
    _viewer = null;
  }
}

function _wireViewerControls(container, cfg, actions) {
  container.querySelector('#viewer3d-fit-btn')?.addEventListener('click', () => _viewer?.fitAll?.());
  container.querySelector('#viewer3d-fit-sel-btn')?.addEventListener('click', () => _viewer?.fitSelection?.());
  container.querySelector('#viewer3d-reset-btn')?.addEventListener('click', () => _viewer?.fitAll?.());
  container.querySelector('#viewer3d-open-config')?.addEventListener('click', () => {
    import('../core/app.js').then((m) => m.goToTab?.('config'));
  });

  container.querySelector('#viewer3d-vertical-axis')?.addEventListener('change', (e) => {
    const axis = String(e.target.value || 'Z').toUpperCase() === 'Y' ? 'Y' : 'Z';
    state.viewer3DConfig.coordinateMap = {
      ...(state.viewer3DConfig.coordinateMap || {}),
      verticalAxis: axis,
      axisConvention: axis === 'Y' ? 'Y-up' : 'Z-up',
      gridPlane: 'auto',
    };
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'viewer3d-tab', reason: 'vertical-axis' });
  });

  container.querySelectorAll('[data-viewer-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const actionId = btn.getAttribute('data-viewer-action');
      executeViewerAction(_viewer, actionId);
    });
  });

  const legendMode = container.querySelector('#viewer3d-top-legend-mode');
  legendMode?.addEventListener('change', () => {
    state.viewer3DConfig.legend.mode = legendMode.value;
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'viewer3d-tab', reason: 'legend-mode' });
  });
  const nodeLabels = container.querySelector('#viewer3d-top-node-labels');
  nodeLabels?.addEventListener('change', () => {
    state.viewer3DConfig.legend.canvasLabels = {
      ...(state.viewer3DConfig.legend.canvasLabels || {}),
      showNodeIds: !!nodeLabels.checked,
    };
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'viewer3d-tab', reason: 'node-labels' });
  });

  const heatmapEnabled = container.querySelector('#viewer3d-top-heatmap-enabled');
  const heatmapMetric = container.querySelector('#viewer3d-top-heatmap-metric');
  const heatmapBuckets = container.querySelector('#viewer3d-top-heatmap-buckets');

  const applyHeatmapConfig = () => {
    state.viewer3DConfig.heatmap.enabled = !!heatmapEnabled?.checked;
    state.viewer3DConfig.heatmap.metric = heatmapMetric?.value || 'T1';
    state.viewer3DConfig.heatmap.bucketCount = Number(heatmapBuckets?.value || 5);
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'viewer3d-tab', reason: 'heatmap-updated' });
  };

  heatmapEnabled?.addEventListener('change', applyHeatmapConfig);
  heatmapMetric?.addEventListener('change', applyHeatmapConfig);
  heatmapBuckets?.addEventListener('change', applyHeatmapConfig);

  const boxPad = container.querySelector('#viewer3d-section-boxpad');
  boxPad?.addEventListener('change', () => {
    const val = Number(boxPad.value || 0);
    _viewer?.setSectionBoxPadding?.(val);
  });
  const planeOffset = container.querySelector('#viewer3d-section-planeoffset');
  planeOffset?.addEventListener('change', () => {
    const val = Number(planeOffset.value || 0);
    _viewer?.setSectionPlaneOffset?.(val);
  });
}

function _registerShortcuts(cfg) {
  if (_shortcutHandler) {
    window.removeEventListener('keydown', _shortcutHandler);
    _shortcutHandler = null;
  }

  if (cfg.disableAllSettings || cfg.featureFlags?.shortcuts === false) return;

  _shortcutHandler = (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const actionId = cfg.shortcuts?.[event.code];
    if (!actionId) return;
    event.preventDefault();
    executeViewerAction(_viewer, actionId);
  };
  window.addEventListener('keydown', _shortcutHandler);
}

function _wireSidePanelTabs(container) {
  const tabs = container.querySelectorAll('.panel-tab[data-target]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      container.querySelectorAll('.panel-tab[data-target]').forEach((x) => x.classList.remove('active'));
      container.querySelectorAll('.panel-content').forEach((x) => {
        x.classList.remove('active');
        x.style.display = 'none';
      });
      tab.classList.add('active');
      const panel = container.querySelector(`#${target}`);
      if (panel) {
        panel.classList.add('active');
        panel.style.display = 'block';
      }
    });
  });
}

function _renderToolbar(cfg, actions) {
  if (cfg.disableAllSettings) return '';
  if (cfg.featureFlags?.toolbar === false || cfg.toolbar?.enabled === false) return '';

  const style = `style="opacity:${Number(cfg.toolbar?.opacity ?? 1)}"`;
  return `
    <div class="geo-toolbar viewer3d-toolbar" ${style}>
      ${actions.map((actionId) => {
        const tooltip = cfg.actions?.[actionId]?.tooltip || ACTION_LABELS[actionId] || actionId;
        const title = `title="${_esc(tooltip)}"`;
        return `<button class="btn-icon viewer3d-icon-btn" data-viewer-action="${actionId}" aria-label="${_esc(tooltip)}" ${title}>${ACTION_ICONS[actionId] || _esc(ACTION_LABELS[actionId] || actionId)}</button>`;
      }).join('')}
    </div>
  `;
}

function _updateComponentPanel(container, cfg) {
  const panel = container.querySelector('#v3d-panel-component');
  if (!panel) return;
  panel.innerHTML = _renderComponentPanel(cfg);
}

function _renderComponentPanel(cfg) {
  if (cfg.disableAllSettings) {
    return '<div class="panel-placeholder">Disable-all mode enabled: add-on component panel is bypassed.</div>';
  }
  if (cfg.featureFlags?.componentPanel === false || cfg.componentPanel?.enabled === false) {
    return '<div class="panel-placeholder">Component panel is disabled in viewer3DConfig.</div>';
  }
  const model = buildComponentPanelModel(_selectedComponent, cfg.componentPanel || {});
  if (!model.sections.length) return '<div class="panel-placeholder">Select a component to inspect.</div>';

  return `
    <div class="geo-legend-panel">
      <div class="legend-title">${_esc(model.title)}</div>
      ${model.sections.map((section) => `
        <h4 class="sub-heading" style="margin:0.6rem 0 0.4rem">${_esc(section.title)}</h4>
        <table class="data-table" style="font-size:11px;">
          <tbody>
            ${section.rows.map(([k, v]) => `<tr><td>${_esc(k)}</td><td class="mono">${_esc(String(v ?? '-'))}</td></tr>`).join('')}
          </tbody>
        </table>
      `).join('')}
    </div>
  `;
}

function _renderSummaryLegend(cfg, summary, parsed, components) {
  const legendMode = cfg.legend?.mode || 'none';
  const heat = cfg.heatmap || {};
  const typeCounts = summary;
  const nodes = Object.keys(parsed?.nodes || {}).length;
  const elements = parsed?.elements?.length || 0;
  const csvRows = parsed ? buildUniversalCSV(parsed, { supportMappings: state.sticky?.supportMappings || [] }) : [];
  const pipeRefs = [...new Set((components || []).map((c) => c.attributes?.['PIPELINE-REFERENCE']).filter(Boolean))];

  return `
    <div class="geo-legend-panel">
      <div class="legend-title">Legend / Heatmap</div>
      <div class="legend-row"><span>Mode</span><span class="mono" style="margin-left:auto;">${_esc(String(legendMode))}</span></div>
      <div class="legend-row"><span>Heatmap</span><span class="mono" style="margin-left:auto;">${heat.enabled ? 'ON' : 'OFF'}</span></div>
      <div class="legend-row"><span>Metric</span><span class="mono" style="margin-left:auto;">${_esc(String(heat.metric || 'T1'))}</span></div>
      <div class="legend-row"><span>Steps</span><span class="mono" style="margin-left:auto;">${Number(heat.bucketCount || 5)}</span></div>
      <div class="legend-row"><span>Canvas Labels</span><span class="mono" style="margin-left:auto;">${cfg.legend?.canvasLabels?.enabled === false ? 'off' : 'on'}</span></div>
      <div class="tab-note" style="margin:4px 0 10px 0;">Adjust via header controls. Selecting a legend mode shows labels in 3D.</div>

      <h4 class="sub-heading" style="margin-top:1rem;">Component Mix</h4>
      ${typeCounts.length
        ? typeCounts.map((row) => `<div class="legend-row"><span>${_esc(row.type)}</span><span class="mono" style="margin-left:auto;">${row.count}</span></div>`).join('')
        : '<div class="panel-placeholder">No components.</div>'}

      <h4 class="sub-heading" style="margin-top:1rem;">Source Summary</h4>
      <div class="legend-row"><span class="legend-swatch" style="background:#1e90ff"></span><span>${elements} parsed element(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#32cd32"></span><span>${nodes} resolved node(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#808080"></span><span>${summary.length} rendered component group(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#ff4500"></span><span>ACCDB data via accdb-to-pcf.js</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#8a2be2"></span><span>${csvRows.length} universal CSV row(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#e07020"></span><span>${pipeRefs.length ? `${pipeRefs.length} pipeline reference(s)` : 'No pipeline reference found'}</span></div>
    </div>
  `;
}

function _buildViewerComponents(parsed) {
  if (!parsed?.elements?.length) return [];

  const csvRows = buildUniversalCSV(parsed, { supportMappings: state.sticky?.supportMappings || [] });
  const segments = normalizeToPCF(csvRows, { method: 'ContEngineMethod' });
  if (!segments.length) return [];

  const nodePos = _resolveNodePositions(csvRows);
  const components = [];

  for (const seg of segments) {
    const type = String(seg.COMPONENT_TYPE || 'PIPE').toUpperCase();
    if (type === 'GHOST' || type === 'MESSAGE-SQUARE') continue;

    const p1 = _pt(seg.EP1) || _pt(nodePos.get(seg.FROM_NODE));
    const p2 = _pt(seg.EP2) || _pt(nodePos.get(seg.TO_NODE));
    const centre = type === 'BEND'
      ? (_pt(nodePos.get(seg.CONTROL_NODE)) || _midPoint(p1, p2))
      : (_pt(seg.CENTRE_POINT) || null);
    const supportCoord = _pt(seg.SUPPORT_COORDS) || _pt(nodePos.get(seg.FROM_NODE)) || _pt(nodePos.get(seg.TO_NODE));

    const attributes = {
      'PIPELINE-REFERENCE': seg.PIPELINE_REFERENCE || '',
      MATERIAL: seg.MATERIAL || '',
      SKEY: seg.SKEY || '',
      'COMPONENT-ATTRIBUTE1': seg.P1 ? `${Math.round(seg.P1 * 100)} KPA` : '',
      'COMPONENT-ATTRIBUTE2': seg.T1 ? `${Math.round(seg.T1)} C` : '',
      'COMPONENT-ATTRIBUTE3': seg.MATERIAL || '',
      'COMPONENT-ATTRIBUTE4': seg.WALL_THICK ? `${seg.WALL_THICK} MM` : '',
      'COMPONENT-ATTRIBUTE8': seg.RIGID_WEIGHT ? `${seg.RIGID_WEIGHT} KG` : '',
      'COMPONENT-ATTRIBUTE97': seg.REF_NO || '',
      'COMPONENT-ATTRIBUTE98': seg.SEQ_NO || '',
    };

    if (type === 'SUPPORT') {
      const supportName = seg.SUPPORT_NAME || seg.SUPPORT_TAG || 'RST';
      attributes.SKEY = supportName;
      attributes.SUPPORT_TAG = seg.SUPPORT_TAG || '';
      attributes.SUPPORT_NAME = supportName;
      attributes.SUPPORT_KIND = seg.SUPPORT_KIND || '';
      attributes.SUPPORT_DESC = seg.SUPPORT_DESC || '';
      attributes.SUPPORT_FRICTION = seg.SUPPORT_FRICTION ?? '';
      attributes.SUPPORT_GAP = seg.SUPPORT_GAP ?? '';
      attributes.SUPPORT_GUID = seg.SUPPORT_GUID || 'UCI:UNKNOWN';
      attributes.SUPPORT_DOFS = seg.SUPPORT_DOFS || '';
      attributes['COMPONENT-ATTRIBUTE1'] = supportName;
      attributes['<SUPPORT_NAME>'] = supportName;
      attributes['<SUPPORT_GUID>'] = seg.SUPPORT_GUID || 'UCI:UNKNOWN';
      attributes.AXIS_COSINES = seg.AXIS_COSINES || '';
      attributes.PIPE_AXIS_COSINES = seg.PIPE_AXIS_COSINES || '';
      if (seg.SUPPORT_COORDS) {
        attributes.SUPPORT_COORDS = `${seg.SUPPORT_COORDS.x ?? 0}, ${seg.SUPPORT_COORDS.y ?? 0}, ${seg.SUPPORT_COORDS.z ?? 0}`;
      }
    }

    components.push({
      id: seg.REF_NO || `viewer3d-${seg.SEQ_NO}`,
      type,
      points: p1 && p2 ? [p1, p2] : [],
      centrePoint: centre,
      branch1Point: null,
      coOrds: type === 'SUPPORT' ? supportCoord : null,
      bore: Number(seg.DIAMETER || 0),
      fixingAction: '',
      attributes,
      source: seg,
    });
  }

  return components;
}

function _buildSupportFallbackComponents(parsed) {
  const supports = [];
  if (!parsed?.restraints?.length || !parsed?.nodes) return supports;

  for (const r of parsed.restraints) {
    const nodeId = Number(r.node ?? r.NODE ?? r.id);
    const pos = parsed.nodes?.[nodeId] || parsed.nodes?.[String(nodeId)];
    if (!pos) continue;

    const rawType = String(r.rawType || r.type || r.name || 'RST').trim();
    const blockCode = String(r.supportBlock || '').toUpperCase() || ((rawType.toUpperCase().match(/\bCA\d+\b/) || [])[0] || '');
    const supportKind = blockCode === 'CA100'
      ? 'GDE'
      : (blockCode === 'CA150' || blockCode === 'CA250')
        ? 'RST'
        : /(^|[^A-Z0-9])(RIGID\s+)?ANC(HOR)?([^A-Z0-9]|$)|\bFIXED\b/i.test(rawType)
          ? 'ANC'
          : /(\bGDE\b|\bGUI\b|GUIDE|SLIDE|SLID|HANGER)/i.test(rawType)
            ? 'GDE'
            : /(\bRST\b|\bREST\b|\+Y)/i.test(rawType)
              ? 'RST'
              : /STOP/i.test(rawType)
                ? 'STP'
                : 'UNK';

    const supportName = blockCode || supportKind;
    if (supportKind === 'UNK' && !r.axisCosines) continue;

    supports.push({
      id: `support-${nodeId}-${supportName || supportKind}`,
      type: 'SUPPORT',
      points: [],
      centrePoint: null,
      branch1Point: null,
      coOrds: _pt(pos),
      bore: Number(pos.bore || 0),
      fixingAction: '',
      attributes: {
        SKEY: supportName,
        SUPPORT_TAG: rawType,
        SUPPORT_NAME: supportName,
        SUPPORT_KIND: supportKind,
        SUPPORT_DESC: r.supportDescription || '',
        SUPPORT_GUID: `UCI:${nodeId}`,
        '<SUPPORT_NAME>': supportName,
        '<SUPPORT_GUID>': `UCI:${nodeId}`,
        AXIS_COSINES: r.axisCosines
          ? `${r.axisCosines.x ?? 0}, ${r.axisCosines.y ?? 0}, ${r.axisCosines.z ?? 0}`
          : '',
      },
    });
  }

  return supports;
}

function _resolveNodePositions(csvRows) {
  const nodePos = new Map();
  if (!csvRows?.length) return nodePos;

  const first = csvRows[0];
  if (first?.FROM_NODE !== undefined) {
    nodePos.set(first.FROM_NODE, { x: 0, y: 0, z: 0 });
  }

  let progress = true;
  let guard = 0;
  while (progress && guard < csvRows.length * 4) {
    guard += 1;
    progress = false;
    for (const row of csvRows) {
      const a = nodePos.get(row.FROM_NODE);
      const b = nodePos.get(row.TO_NODE);
      const dx = Number(row.DELTA_X || 0);
      const dy = Number(row.DELTA_Y || 0);
      const dz = Number(row.DELTA_Z || 0);

      if (a && !b) {
        nodePos.set(row.TO_NODE, { x: a.x + dx, y: a.y + dy, z: a.z + dz });
        progress = true;
      } else if (!a && b) {
        nodePos.set(row.FROM_NODE, { x: b.x - dx, y: b.y - dy, z: b.z - dz });
        progress = true;
      }
    }
  }

  return nodePos;
}

function _pt(v) {
  if (!v) return null;
  return {
    x: Number(v.x ?? 0),
    y: Number(v.y ?? 0),
    z: Number(v.z ?? 0),
    bore: Number(v.bore ?? 0),
  };
}

function _midPoint(a, b) {
  if (!a || !b) return null;
  return {
    x: (Number(a.x) + Number(b.x)) / 2,
    y: (Number(a.y) + Number(b.y)) / 2,
    z: (Number(a.z) + Number(b.z)) / 2,
    bore: Number(a.bore || b.bore || 0),
  };
}

function _summariseComponents(components) {
  const counts = new Map();
  for (const comp of components || []) {
    const type = String(comp.type || 'UNKNOWN').toUpperCase();
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function _renderSummary(summary, parsed, components) {
  const nodes = Object.keys(parsed?.nodes || {}).length;
  const elements = parsed?.elements?.length || 0;
  const csvRows = parsed ? buildUniversalCSV(parsed, { supportMappings: state.sticky?.supportMappings || [] }) : [];
  const pipeRefs = [...new Set((components || []).map((c) => c.attributes?.['PIPELINE-REFERENCE']).filter(Boolean))];

  return `
    <div class="geo-legend-panel">
      <div class="legend-title">Source Summary</div>
      <div class="legend-row"><span class="legend-swatch" style="background:#1e90ff"></span><span>${elements} parsed element(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#32cd32"></span><span>${nodes} resolved node(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#808080"></span><span>${summary.length} rendered component group(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#ff4500"></span><span>ACCDB data via accdb-to-pcf.js</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#8a2be2"></span><span>${csvRows.length} universal CSV row(s)</span></div>
      <div class="legend-row"><span class="legend-swatch" style="background:#e07020"></span><span>${pipeRefs.length ? `${pipeRefs.length} pipeline reference(s)` : 'No pipeline reference found'}</span></div>
    </div>

    <h4 class="sub-heading" style="margin-top:1rem">Component Types</h4>
    <div class="table-scroll" style="max-height:220px;">
      <table class="data-table" style="width:100%;">
        <thead><tr><th>Type</th><th style="width:80px">Count</th></tr></thead>
        <tbody>
          ${summary.length
            ? summary.map((row) => `<tr><td>${_esc(row.type)}</td><td class="mono">${row.count}</td></tr>`).join('')
            : '<tr><td colspan="2" class="center muted">No 3D components available</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
