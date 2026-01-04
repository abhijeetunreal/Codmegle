// Main entry point - assembles all chat modules
import { createApp } from './app.js';
import { setupChatMethods } from './chat.js';
import { setupVideoMethods } from './video.js';
import { setupUIMethods } from './ui.js';
import { setupProfileMethods } from './profile.js';
import { setupConnectionMethods } from './connection.js';
import { host, join, sendMessage as sendP2PMessage, disconnect as disconnectP2P, stopHosting } from '../hosting.js';

// Create app instance
const app = createApp();

// Setup all method modules
setupChatMethods(app);
setupVideoMethods(app);
setupUIMethods(app);
setupProfileMethods(app);
setupConnectionMethods(app);

// Make functions available globally
window.host = host;
window.join = join;
window.sendP2PMessage = sendP2PMessage;
window.disconnectP2P = disconnectP2P;
window.stopHosting = stopHosting;

// Make app available globally
window.app = app;

// Initialize on load
window.onload = function() {
    app.init();
};

