const { contextBridge, ipcRenderer } = require('electron');

// Minimal surface: trigger Steam login and receive the auth-callback result.
// Never expose raw Node/fs/ipcRenderer APIs to the renderer.
contextBridge.exposeInMainWorld('forge', {
  version: process.env.npm_package_version,
  steam: {
    login: () => ipcRenderer.invoke('steam:login'),
    onCallback: (callback) =>
      ipcRenderer.on('steam:callback', (_event, steamId64) => callback(steamId64)),
    fetchLibrary: (steamId64) => ipcRenderer.invoke('steam:fetchLibrary', steamId64),
  },
});
