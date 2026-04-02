/**
 * logger.js — Diagnostic logging utility for data, geometry, and validation issues.
 */

import { emit } from './event-bus.js';

export const logs = [];
const listeners = new Set();

export const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success'
};

export const CATEGORY = {
  IMPORT: 'import',
  GEOMETRY: 'geometry',
  CONTINUITY: 'continuity',
  LABELS: 'labels',
  PROPERTIES: 'properties',
  RESTRAINTS: 'restraints',
  CAMERA: 'camera',
  NAVIGATION: 'navigation',
  THEME: 'theme',
  SECTION: 'section',
  UI: 'ui',
  PERFORMANCE: 'performance'
};

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

export function writeSessionLog(logEntry) {
    try {
        const d = new Date();
        const dateStr = `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear().toString().substr(-2)}`;
        const timeStr = `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}`;
        // Since we are running in the browser we can't write to the local file system directly without a server.
        // We will emit an event so that if there's a backend or electron app it can write it,
        // and also keep it in memory for the export function.
        emit('session-log', { dateStr, timeStr, entry: logEntry });
    } catch(e) {
        console.error('Failed to write session log', e);
    }
}

export function addLog(options) {
  const {
    severity = SEVERITY.INFO,
    category = CATEGORY.UI,
    message,
    objectId = null,
    rowId = null,
    lineNo = null,
    componentType = null,
    propertyName = null,
    expectedValue = null,
    actualValue = null,
    ruleId = null,
    ruleText = null,
    sourceFile = null,
    sourceTable = null
  } = options;

  const logEntry = {
    id: generateId(),
    timestamp: Date.now(),
    severity,
    category,
    message,
    objectId,
    rowId,
    lineNo,
    componentType,
    propertyName,
    expectedValue,
    actualValue,
    ruleId,
    ruleText,
    sourceFile,
    sourceTable,
    resolved: false,
    tags: []
  };

  logs.push(logEntry);

  if (severity === SEVERITY.ERROR || severity === SEVERITY.WARNING) {
      writeSessionLog(logEntry);
  }

  emit('log-added', logEntry);
  notifyListeners();
  return logEntry;
}

export function resolveLog(id) {
  const log = logs.find(l => l.id === id);
  if (log) {
    log.resolved = true;
    emit('log-resolved', log);
    notifyListeners();
  }
}

export function clearLogs() {
  logs.length = 0;
  emit('logs-cleared');
  notifyListeners();
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  for (const listener of listeners) {
    listener(logs);
  }
}
