/**
 * property-panel.js — Handles property panel inspection and viewport chips.
 */

import { state } from '../core/state.js';
import { unitSuffix } from '../utils/formatter.js';

export function renderPropertyPanel(element) {
    const panel = document.getElementById('panel-props');
    if (!panel) return;

    if (!element) {
        panel.innerHTML = `<div class="panel-placeholder">Select an object to inspect</div>`;
        return;
    }

    const tUnit = unitSuffix(state.parsed?.units?.temperature);
    const pUnit = unitSuffix(state.parsed?.units?.pressure);
    const dUnit = unitSuffix(state.parsed?.units?.diameter);

    const groups = [
        {
            title: 'Identity',
            fields: [
                { label: 'Line Number', value: element.pipelineRef || 'SYS-177A' },
                { label: 'Component Type', value: element.isBend ? 'Bend' : 'Pipe' },
                { label: 'Tag', value: element.tag || 'N/A' },
            ]
        },
        {
            title: 'Connectivity',
            fields: [
                { label: 'From Node', value: element.from },
                { label: 'To Node', value: element.to },
            ]
        },
        {
            title: 'Geometry',
            fields: [
                { label: 'Outer Diameter', value: `${element.od || 'N/A'}${dUnit}` },
                { label: 'Wall Thickness', value: `${element.wt || 'N/A'}${dUnit}` },
                { label: 'Length', value: `${Math.round(element.length || 0)}${dUnit}` },
            ]
        },
        {
            title: 'Process',
            fields: [
                { label: 'T1', value: `${element.T1 || 'N/A'}${tUnit}` },
                { label: 'T2', value: `${element.T2 || 'N/A'}${tUnit}` },
                { label: 'T3', value: `${element.T3 || 'N/A'}${tUnit}` },
                { label: 'P1', value: `${element.P1 || 'N/A'}${pUnit}` },
                { label: 'P2', value: `${element.P2 || 'N/A'}${pUnit}` },
                { label: 'Fluid Density', value: element.fluidDensity || 'N/A' },
            ]
        },
        {
            title: 'Material',
            fields: [
                { label: 'Material', value: element.material || 'CS' },
                { label: 'Density', value: element.density || 'N/A' },
            ]
        },
        {
            title: 'Insulation',
            fields: [
                { label: 'Thickness', value: `${element.insulThickness || 0}${dUnit}` },
                { label: 'Density', value: element.insulDensity || 'N/A' },
            ]
        }
    ];

    let html = '';
    for (const group of groups) {
        html += `<div class="prop-group">
            <div class="prop-group-title">${group.title}</div>
            <table class="prop-table">
                ${group.fields.map(f => `
                    <tr>
                        <td class="prop-label">${f.label}</td>
                        <td class="prop-value">${f.value}</td>
                    </tr>
                `).join('')}
            </table>
        </div>`;
    }

    panel.innerHTML = html;
}

export function showViewportChip(element, x, y) {
    let chip = document.getElementById('viewport-prop-chip');
    if (!chip) {
        chip = document.createElement('div');
        chip.id = 'viewport-prop-chip';
        chip.style.cssText = `
            position: absolute;
            background: rgba(255, 255, 255, 0.95);
            border: 1px solid var(--color-border);
            border-radius: 4px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 11px;
            pointer-events: none;
            z-index: 100;
            display: flex;
            flex-direction: column;
            gap: 4px;
            color: #333;
            max-width: 200px;
        `;
        document.body.appendChild(chip);
    }

    if (!element) {
        chip.style.display = 'none';
        return;
    }

    const tUnit = unitSuffix(state.parsed?.units?.temperature);
    const pUnit = unitSuffix(state.parsed?.units?.pressure);

    chip.innerHTML = `
        <div style="font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 2px;">
            ${element.pipelineRef || 'SYS-177A'} &bull; ${element.isBend ? 'Bend' : 'Pipe'}
        </div>
        <div style="display:flex; justify-content: space-between;">
            <span style="color:#666;">Size:</span> <span>Ø${element.od}</span>
        </div>
        <div style="display:flex; justify-content: space-between;">
            <span style="color:#666;">Mat:</span> <span>${element.material || 'CS'}</span>
        </div>
        <div style="display:flex; justify-content: space-between;">
            <span style="color:#666;">T1/P1:</span> <span>${element.T1}${tUnit} / ${element.P1}${pUnit}</span>
        </div>
    `;

    // Offset from cursor to avoid hiding what the user is hovering
    chip.style.left = `${x + 15}px`;
    chip.style.top = `${y + 15}px`;
    chip.style.display = 'block';
}

export function hideViewportChip() {
    const chip = document.getElementById('viewport-prop-chip');
    if (chip) chip.style.display = 'none';
}
