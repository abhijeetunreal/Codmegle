// Connection and matching logic
import { state } from '../state.js';
import { host, join, disconnect as disconnectP2P, stopHosting } from '../hosting.js';
import { connectToDiscovery } from '../discovery.js';
import { showAlert } from '../alert.js';

export function setupConnectionMethods(app) {
    app.startChat = async function(mode) {
        this.mode = mode || this.mode;
        state.mode = this.mode;
        this.status = 'searching';
        state.isSearching = true;
        this.roomId = null;
        
        // Reset stranger profile
        this.strangerProfile = null;
        if (this.el.strangerStatus) {
            this.el.strangerStatus.textContent = 'Stranger';
        }
        if (this.el.profileBtn) {
            this.el.profileBtn.disabled = true;
        }

        // Save mode to localStorage
        localStorage.setItem('codmegle_mode', this.mode);

        // UI Updates
        this.el.messagesContainer.innerHTML = '<div class="text-center py-4"><div class="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full"><div class="h-2 w-2 bg-blue-500 rounded-full pulse-slow"></div><span class="text-blue-600 text-sm font-medium italic">Looking for someone to chat with...</span></div></div>';
        
        // Video UI
        const chatScreenContainer = document.getElementById('chat-screen-container');
        if (this.mode === 'video') {
            this.el.videoContainer.classList.remove('hidden');
            // Ensure local video container is visible
            if (this.el.localVideoContainer) {
                this.el.localVideoContainer.classList.remove('hidden');
                this.el.localVideoContainer.style.display = 'block';
                this.el.localVideoContainer.style.visibility = 'visible';
                this.el.localVideoContainer.style.opacity = '1';
            }
            if (chatScreenContainer && window.innerWidth >= 1024) {
                chatScreenContainer.classList.add('video-mode');
            }
            // Re-initialize draggable after a short delay to ensure elements are ready
            setTimeout(() => {
                this.initDraggableLocalVideo();
            }, 100);
            try {
                await this.startCamera();
            } catch (e) {
                console.error("Camera error:", e);
                showAlert("Could not access camera. Starting in text mode.", 'warning');
                this.mode = 'text';
                state.mode = 'text';
                this.el.videoContainer.classList.add('hidden');
                if (chatScreenContainer) {
                    chatScreenContainer.classList.remove('video-mode');
                }
            }
        } else {
            this.el.videoContainer.classList.add('hidden');
            if (chatScreenContainer) {
                chatScreenContainer.classList.remove('video-mode');
            }
            this.stopCamera();
        }

        this.updateUIState();
        this.startMatching();
    };
    
    app.startMatching = async function() {
        this.lookingForMatch = true;
        
        try {
            await host();
            
            await new Promise((resolve) => {
                if (state.peer && state.peer.open) {
                    resolve();
                } else if (state.peer) {
                    state.peer.once('open', resolve);
                } else {
                    setTimeout(resolve, 2000);
                }
            });
            
            let isSearching = false;
            let attemptedPeers = new Set();
            let currentConnectionAttempt = null;
            
            const searchInterval = setInterval(async () => {
                if (!this.lookingForMatch || state.isConnected) {
                    clearInterval(searchInterval);
                    this.searchInterval = null;
                    return;
                }
                
                if (currentConnectionAttempt) {
                    return;
                }
                
                if (isSearching) {
                    return;
                }
                
                isSearching = true;
                try {
                    const currentMode = this.mode || 'video';
                    const sessions = await connectToDiscovery(null, currentMode);
                    
                    const availableHosts = sessions.filter(s => {
                        const isNotSelf = s.code !== state.currentShareCode;
                        const isValidCode = s.code && s.code.length === 5;
                        const notAttempted = !attemptedPeers.has(s.code);
                        const hasValidCode = s.code && s.code.trim().length > 0;
                        const sessionMode = s.mode || 'video';
                        const modeMatches = sessionMode === currentMode;
                        return isNotSelf && isValidCode && notAttempted && hasValidCode && modeMatches;
                    });
                    
                    if (availableHosts.length > 0) {
                        const randomIndex = Math.floor(Math.random() * availableHosts.length);
                        const selectedHost = availableHosts[randomIndex];
                        
                        attemptedPeers.add(selectedHost.code);
                        
                        if (attemptedPeers.size > 20) {
                            attemptedPeers.clear();
                        }
                        
                        currentConnectionAttempt = selectedHost.code;
                        
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        if (!this.lookingForMatch || state.isConnected) {
                            currentConnectionAttempt = null;
                            isSearching = false;
                            return;
                        }
                        
                        currentConnectionAttempt = selectedHost.code;
                        join(selectedHost.code);
                        
                        setTimeout(() => {
                            if (!state.isConnected && currentConnectionAttempt === selectedHost.code) {
                                currentConnectionAttempt = null;
                            }
                        }, 12000);
                    } else {
                        if (attemptedPeers.size > 10) {
                            attemptedPeers.clear();
                        }
                    }
                } catch (err) {
                    console.warn("Discovery error:", err);
                } finally {
                    isSearching = false;
                }
            }, 2000);
            
            this.searchInterval = searchInterval;
            
        } catch (err) {
            console.error("Failed to start hosting:", err);
            showAlert("Failed to start connection. Please try again.", 'error');
            this.status = 'idle';
            state.isSearching = false;
            this.updateUIState();
        }
    };
    
    app.joinSession = function(code) {
        if (!state.isConnected) {
            this.status = 'connected';
            state.isConnected = true;
            state.isSearching = false;
            this.lookingForMatch = false;
            this.stopBroadcastingSearch();
            
            this.el.messagesContainer.innerHTML = '<div class="text-center py-4"><div class="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full"><div class="h-2 w-2 bg-green-500 rounded-full"></div><span class="text-green-600 text-sm font-medium">Connected! Say Hi!</span></div></div>';
            
            const chatScreenContainer = document.getElementById('chat-screen-container');
            if (this.mode === 'video') {
                this.el.videoContainer.classList.remove('hidden');
                // Ensure local video container is visible
                if (this.el.localVideoContainer) {
                    this.el.localVideoContainer.classList.remove('hidden');
                    this.el.localVideoContainer.style.display = 'block';
                    this.el.localVideoContainer.style.visibility = 'visible';
                    this.el.localVideoContainer.style.opacity = '1';
                }
                if (chatScreenContainer && window.innerWidth >= 1024) {
                    chatScreenContainer.classList.add('video-mode');
                }
                // Re-initialize draggable
                setTimeout(() => {
                    this.initDraggableLocalVideo();
                }, 100);
            } else if (chatScreenContainer) {
                chatScreenContainer.classList.remove('video-mode');
            }
            
            this.updateUIState();
        }
    };

    app.disconnectChat = function() {
        disconnectP2P();
        stopHosting();
        
        if (this.mode === 'video') {
            this.stopCamera();
        }
        
        this.stopBroadcastingSearch();
        this.status = 'disconnected';
        this.lookingForMatch = false;
        state.isConnected = false;
        state.isSearching = false;
        
        // Clear stranger profile
        this.strangerProfile = null;
        if (this.el.strangerStatus) {
            this.el.strangerStatus.textContent = 'Stranger';
        }
        if (this.el.profileBtn) {
            this.el.profileBtn.disabled = true;
        }
        
        // Reset media button states
        this.isMuted = false;
        this.isVideoEnabled = true;
        
        this.el.messagesContainer.innerHTML = '<div class="text-center py-4"><div class="inline-flex items-center gap-2 px-4 py-2 bg-red-50 rounded-full"><i data-lucide="alert-circle" class="w-4 h-4 text-red-600"></i><span class="text-red-600 text-sm font-medium">Stranger has disconnected.</span></div></div>';
        if (window.lucide) {
            lucide.createIcons();
        }
        
        this.updateUIState();
    };

    app.stopBroadcastingSearch = function() {
        if (this.searchInterval) {
            clearInterval(this.searchInterval);
            this.searchInterval = null;
        }
        this.lookingForMatch = false;
    };
}

