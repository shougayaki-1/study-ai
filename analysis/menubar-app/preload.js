const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nightly', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  setEngine: (engine) => ipcRenderer.invoke('config:set-engine', engine),
  setModel: (model) => ipcRenderer.invoke('config:set-model', model),
  setSchedule: (hour, minute) => ipcRenderer.invoke('config:set-schedule', { hour, minute }),
  setEnabled: (enabled) => ipcRenderer.invoke('config:set-enabled', enabled),
  startRun: () => ipcRenderer.invoke('run:start'),
  listLogs: () => ipcRenderer.invoke('logs:list'),
  readLog: (name) => ipcRenderer.invoke('logs:read', name),
  onRunStatus: (callback) => subscribe('run:status', callback),
  onRunOutput: (callback) => subscribe('run:output', callback),
  onLogsChanged: (callback) => subscribe('logs:changed', callback),
});

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
