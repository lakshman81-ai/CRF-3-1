/**
 * supports-tab.js — Special support list.
 */

import { SPECIAL_SUPPORTS } from '../data/report-data.js';
import { state } from '../core/state.js';
import { renderTableToggles } from '../utils/table-toggle.js';

export function renderSupports(container) {
  const supports = state.sticky.specialSupports || SPECIAL_SUPPORTS;

  container.innerHTML = `
    <div class="report-section" id="section-supports">
      <h3 class="section-heading">Special Support List <span class="add-row-btn" data-target="specialSupports" style="cursor:pointer; color:var(--color-primary); font-size:16px;" title="Add row">＋</span></h3>
      <p class="tab-note">Springs, struts, and low-friction plates identified in the stress analysis.</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Tag Number</th>
            <th>Type</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          ${supports.map((row, idx) => `
            <tr>
              <td class="mono editable-field ss-edit" contenteditable="true" data-idx="${idx}" data-field="node">${row.node ?? ''}</td>
              <td class="mono editable-field ss-edit" contenteditable="true" data-idx="${idx}" data-field="tag">${row.tag || ''}</td>
              <td class="editable-field ss-edit" contenteditable="true" data-idx="${idx}" data-field="type">${row.type || ''}</td>
              <td class="center editable-field ss-edit" contenteditable="true" data-idx="${idx}" data-field="qty">${row.qty || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Special Support edits
  container.querySelectorAll('.ss-edit').forEach(td => {
    td.addEventListener('blur', () => {
      const idx = td.dataset.idx;
      const field = td.dataset.field;
      if (idx !== undefined && field) {
        if (!state.sticky.specialSupports) {
          state.sticky.specialSupports = JSON.parse(JSON.stringify(SPECIAL_SUPPORTS));
        }
        state.sticky.specialSupports[idx][field] = td.textContent.trim();
        import('../core/state.js').then(m => m.saveStickyState());
      }
    });
  });

  // Add row button
  container.querySelector('.add-row-btn')?.addEventListener('click', () => {
      if (!state.sticky.specialSupports) {
          state.sticky.specialSupports = JSON.parse(JSON.stringify(SPECIAL_SUPPORTS));
      }
      state.sticky.specialSupports.push({ node: '', tag: '', type: '', qty: '' });
      import('../core/state.js').then(m => m.saveStickyState());
      import('../core/app.js').then(m => m.goToTab('supports'));
  });

  renderTableToggles(container);
}
