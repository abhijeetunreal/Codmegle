// Core app structure and initialization
import { initDOM, dom } from '../dom.js';
import { state } from '../state.js';
import { startDiscoveryHost } from '../discovery.js';

export function createApp() {
    return {
        user: null,
        status: 'idle', // idle, searching, connected, disconnected
        mode: 'text',
        roomId: null,
        searchInterval: null,
        localStream: null,
        lookingForMatch: false,
        strangerProfile: null, // Store stranger's profile data
        myProfile: null, // Store user's own profile
        isMuted: false, // Track mute state
        isVideoEnabled: true, // Track video state

        // DOM Elements
        el: {
            messagesContainer: document.getElementById('messages-container'),
            msgInput: document.getElementById('msg-input'),
            btnSend: document.getElementById('btn-send'),
            btnStopNext: document.getElementById('btn-stop-next'),
            btnMute: document.getElementById('btn-mute'),
            btnVideoToggle: document.getElementById('btn-video-toggle'),
            statusInd: document.getElementById('status-indicator'),
            disconnectInd: document.getElementById('disconnect-indicator'),
            videoContainer: document.getElementById('video-container'),
            localVideoContainer: document.getElementById('local-video-container'),
            localVideo: document.getElementById('local-video'),
            noCameraMsg: document.getElementById('no-camera-msg'),
            videoWaitingMsg: document.getElementById('video-waiting-msg'),
            muteIndicator: document.getElementById('mute-indicator'),
            videoOffIndicator: document.getElementById('video-off-indicator'),
            onlineCount: document.getElementById('online-count'),
            splitter: document.getElementById('resizable-splitter'),
            videoPanel: document.querySelector('.desktop-video-panel'),
            chatPanel: document.querySelector('.desktop-chat-panel'),
            profileBtn: document.getElementById('profile-btn'),
            profileModal: document.getElementById('profile-modal-overlay'),
            strangerStatus: document.getElementById('stranger-status'),
            btnSettings: document.getElementById('btn-settings'),
            settingsModal: document.getElementById('settings-modal-overlay'),
            settingsCameraSelect: document.getElementById('settings-camera-select'),
            settingsAudioSelect: document.getElementById('settings-audio-select')
        },

        init: async function() {
            // Initialize DOM references
            initDOM();
            
            // Initialize Lucide Icons
            lucide.createIcons();
            
            // Initialize resizable splitter for desktop
            this.initResizableSplitter();
            
            // Initialize draggable local video
            this.initDraggableLocalVideo();
            
            // Initialize responsive handler for dynamic layout updates
            this.initResponsiveHandler();

            // Get mode from URL or localStorage
            const urlParams = new URLSearchParams(window.location.search);
            const mode = urlParams.get('mode') || localStorage.getItem('codmegle_mode') || 'text';
            this.mode = mode;
            state.mode = mode;

            // Generate or restore User ID
            const savedUserId = localStorage.getItem('codmegle_userId');
            if (savedUserId) {
                this.user = { uid: savedUserId };
            } else {
                this.user = { uid: 'user_' + Math.random().toString(36).substr(2, 9) };
                localStorage.setItem('codmegle_userId', this.user.uid);
            }
            state.userId = this.user.uid;
            
            // Load or create user profile
            this.loadMyProfile();
            
            // Update online count
            this.updateOnlineCount();
            
            // Update online count periodically
            setInterval(() => {
                this.updateOnlineCount();
            }, 5000);

            // Start discovery host (for session discovery)
            startDiscoveryHost();

            // Check for join parameter in URL
            const joinCode = urlParams.get('join');
            if (joinCode) {
                this.joinSession(joinCode);
            } else {
                // Auto-start chat if coming from welcome screen
                this.startChat(mode);
            }
            
            // Apply video-mode class on initial load if needed
            const chatScreenContainer = document.getElementById('chat-screen-container');
            if (this.mode === 'video' && chatScreenContainer && window.innerWidth >= 1024) {
                if (this.el.videoContainer && !this.el.videoContainer.classList.contains('hidden')) {
                    chatScreenContainer.classList.add('video-mode');
                }
            }

            // Input Listeners - Send message on Enter key (only if message contains text)
            this.el.msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    const text = this.el.msgInput.value.trim();
                    if (text && !this.el.msgInput.disabled) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                }
            });

            // Global Key Listener
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.handleStopNext();
            });
        }
    };
}

