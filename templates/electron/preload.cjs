// Expone información mínima del entorno a la app web.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('todo2todo', {
  platform: process.platform,
  isDesktop: true,
});
