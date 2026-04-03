/**
 * config-tab.js - Dedicated UI for viewer3DConfig.
 */

import { state, saveStickyState } from '../core/state.js';
import { emit, on } from '../core/event-bus.js';
import { DEFAULT_VIEWER3D_CONFIG, VIEWER_ACTION_IDS } from '../viewer-3d-defaults.js';
import { updateViewer3DConfig } from '../viewer-3d-config.js';

let _listenersRegistered = false;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function renderConfig(container) {
  if (!_listenersRegistered) {
    on('viewer3d-config-changed', () => {
      const c = document.getElementById('tab-content');
      if (state.activeTab === 'config' && c) renderConfig(c);
    });
    _listenersRegistered = true;
  }

  const cfg = state.viewer3DConfig || clone(DEFAULT_VIEWER3D_CONFIG);

  container.innerHTML = `
    <div class="report-section" id="section-viewer3d-config">
      <h3 class="section-heading">3D Viewer Config (Legacy)</h3>
      <p class="tab-note">Dedicated top-level settings for the 3D Viewer tab only.</p>

      <div class="cfg-grid">
        <label><input type="checkbox" id="cfg-disable-all" ${cfg.disableAllSettings ? 'checked' : ''}> Disable all settings (show original viewer3D)</label>
        <label>Vertical Axis
          <select id="cfg-vertical-axis">
            <option value="Z" ${String(cfg.coordinateMap?.verticalAxis) === 'Z' ? 'selected' : ''}>Z-up</option>
            <option value="Y" ${String(cfg.coordinateMap?.verticalAxis) === 'Y' ? 'selected' : ''}>Y-up</option>
          </select>
        </label>
        <label>Legend Mode
          <select id="cfg-legend-mode">
            <option value="none" ${cfg.legend?.mode === 'none' ? 'selected' : ''}>none</option>
            <option value="od" ${cfg.legend?.mode === 'od' ? 'selected' : ''}>od</option>
            <option value="material" ${cfg.legend?.mode === 'material' ? 'selected' : ''}>material</option>
            <option value="supportKind" ${cfg.legend?.mode === 'supportKind' ? 'selected' : ''}>support kind</option>
            <option value="heatmap" ${cfg.legend?.mode === 'heatmap' ? 'selected' : ''}>heatmap</option>
          </select>
        </label>
        <label><input type="checkbox" id="cfg-heatmap-enabled" ${cfg.heatmap?.enabled ? 'checked' : ''}> Heatmap enabled</label>
        <label>Heatmap Metric
          <input id="cfg-heatmap-metric" value="${_esc(cfg.heatmap?.metric || 'T1')}">
        </label>
        <label>Heatmap Buckets
          <input id="cfg-heatmap-buckets" type="number" min="2" max="12" value="${Number(cfg.heatmap?.bucketCount || 5)}">
        </label>
      </div>

      <h4 class="sub-heading" style="margin-top:1rem">Component Panel</h4>
      <div class="cfg-grid">
        <label><input type="checkbox" id="cfg-cp-enabled" ${cfg.componentPanel?.enabled ? 'checked' : ''}> Enable panel</label>
        <label><input type="checkbox" id="cfg-cp-raw" ${cfg.componentPanel?.showRawAttributes ? 'checked' : ''}> Show raw attributes</label>
        <label><input type="checkbox" id="cfg-cp-common" ${cfg.componentPanel?.showCommonSection ? 'checked' : ''}> Show common section</label>
        <label><input type="checkbox" id="cfg-cp-geometry" ${cfg.componentPanel?.showGeometrySection ? 'checked' : ''}> Show geometry section</label>
        <label><input type="checkbox" id="cfg-cp-process" ${cfg.componentPanel?.showProcessSection ? 'checked' : ''}> Show process section</label>
        <label><input type="checkbox" id="cfg-cp-support" ${cfg.componentPanel?.showSupportSection ? 'checked' : ''}> Show support section</label>
      </div>

      <h4 class="sub-heading" style="margin-top:1rem">Toolbar Actions</h4>
      <div class="cfg-actions-grid" id="cfg-actions-grid">
        ${VIEWER_ACTION_IDS.map((id) => {
          const checked = cfg.actions?.[id]?.enabled !== false;
          return `<label><input type="checkbox" data-action-id="${id}" ${checked ? 'checked' : ''}> ${id}</label>`;
        }).join('')}
      </div>

      <h4 class="sub-heading" style="margin-top:1rem">Import / Export</h4>
      <textarea id="cfg-json" class="mono" style="width:100%;min-height:140px">${_esc(JSON.stringify(cfg, null, 2))}</textarea>

      <div class="debug-controls" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-primary" id="cfg-apply">Apply</button>
        <button class="btn-secondary" id="cfg-reset-viewer">Reset Viewer3DConfig Defaults</button>
        <button class="btn-secondary" id="cfg-reset-cam">Reset Camera/Nav Defaults</button>
        <button class="btn-secondary" id="cfg-import-json">Import JSON</button>
      </div>
    </div>
  `;

  container.querySelector('#cfg-apply')?.addEventListener('click', () => {
    _applyForm(container);
  });

  container.querySelector('#cfg-reset-viewer')?.addEventListener('click', () => {
    state.viewer3DConfig = clone(DEFAULT_VIEWER3D_CONFIG);
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'config-tab', reason: 'reset-all' });
  });

  container.querySelector('#cfg-reset-cam')?.addEventListener('click', () => {
    state.viewer3DConfig = updateViewer3DConfig(state.viewer3DConfig, {
      camera: clone(DEFAULT_VIEWER3D_CONFIG.camera),
      controls: clone(DEFAULT_VIEWER3D_CONFIG.controls),
      coordinateMap: clone(DEFAULT_VIEWER3D_CONFIG.coordinateMap),
      presets: clone(DEFAULT_VIEWER3D_CONFIG.presets),
    });
    saveStickyState();
    emit('viewer3d-config-changed', { source: 'config-tab', reason: 'reset-camera-nav' });
  });

  container.querySelector('#cfg-import-json')?.addEventListener('click', () => {
    const txt = container.querySelector('#cfg-json')?.value || '';
    try {
      const parsed = JSON.parse(txt);
      state.viewer3DConfig = updateViewer3DConfig(DEFAULT_VIEWER3D_CONFIG, parsed);
      saveStickyState();
      emit('viewer3d-config-changed', { source: 'config-tab', reason: 'import-json' });
    } catch (e) {
      alert(`Invalid JSON: ${e.message}`);
    }
  });
}

function _applyForm(container) {
  const actionPatch = {};
  container.querySelectorAll('[data-action-id]').forEach((el) => {
    actionPatch[el.getAttribute('data-action-id')] = {
      enabled: !!el.checked,
    };
  });

  const patch = {
    disableAllSettings: !!container.querySelector('#cfg-disable-all')?.checked,
    coordinateMap: {
      verticalAxis: container.querySelector('#cfg-vertical-axis')?.value || 'Z',
    },
    legend: {
      mode: container.querySelector('#cfg-legend-mode')?.value || 'none',
    },
    heatmap: {
      enabled: !!container.querySelector('#cfg-heatmap-enabled')?.checked,
      metric: container.querySelector('#cfg-heatmap-metric')?.value || 'T1',
      bucketCount: Number(container.querySelector('#cfg-heatmap-buckets')?.value || 5),
    },
    componentPanel: {
      enabled: !!container.querySelector('#cfg-cp-enabled')?.checked,
      showRawAttributes: !!container.querySelector('#cfg-cp-raw')?.checked,
      showCommonSection: !!container.querySelector('#cfg-cp-common')?.checked,
      showGeometrySection: !!container.querySelector('#cfg-cp-geometry')?.checked,
      showProcessSection: !!container.querySelector('#cfg-cp-process')?.checked,
      showSupportSection: !!container.querySelector('#cfg-cp-support')?.checked,
    },
    actions: actionPatch,
  };

  state.viewer3DConfig = updateViewer3DConfig(state.viewer3DConfig, patch);
  saveStickyState();
  emit('viewer3d-config-changed', { source: 'config-tab', reason: 'apply' });
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
