// UI management and interactions
import { state } from '../state.js';

export function setupUIMethods(app) {
    app.updateUIState = function() {
        const isConnected = this.status === 'connected';
        const isSearching = this.status === 'searching';
        const isDisconnected = this.status === 'disconnected';

        this.el.msgInput.disabled = !isConnected;
        this.el.btnSend.disabled = !isConnected;
        this.el.msgInput.placeholder = isConnected ? "Type your message..." : (isDisconnected ? "Stranger disconnected" : "Waiting for connection...");
        
        // Enable/disable profile button
        if (this.el.profileBtn) {
            this.el.profileBtn.disabled = !isConnected || !this.strangerProfile;
        }
        
        // Show/hide media control buttons (only in video mode and when searching or connected)
        const showMediaButtons = this.mode === 'video' && (isSearching || isConnected);
        if (this.el.btnMute) {
            this.el.btnMute.classList.toggle('hidden', !showMediaButtons);
        }
        if (this.el.btnVideoToggle) {
            this.el.btnVideoToggle.classList.toggle('hidden', !showMediaButtons);
        }
        
        // Update media button states
        if (showMediaButtons) {
            this.updateMediaButtonStates();
        }
        
        if (isDisconnected) {
            this.el.btnStopNext.className = "h-11 sm:h-12 px-4 sm:px-6 font-bold rounded-xl shadow-md text-xs sm:text-sm uppercase tracking-wide transition-all bg-gradient-primary hover:shadow-lg text-white active:translate-y-0.5 flex-shrink-0 justify-center items-center";
            this.el.btnStopNext.innerHTML = '<span class="flex items-center gap-1.5"><i data-lucide="refresh-cw" class="w-4 h-4"></i><span class="hidden sm:inline">New Chat</span></span><span class="ml-1 text-xs text-blue-200 hidden sm:block -mt-0.5">Esc</span>';
        } else {
            this.el.btnStopNext.className = "h-11 sm:h-12 px-4 sm:px-6 font-bold rounded-xl shadow-md text-xs sm:text-sm uppercase tracking-wide transition-all bg-white border-2 border-gray-300 hover:border-red-400 hover:bg-red-50 hover:text-red-600 text-gray-700 active:translate-y-0.5 flex-shrink-0 justify-center items-center";
            this.el.btnStopNext.innerHTML = '<span class="flex items-center gap-1.5"><i data-lucide="x" class="w-4 h-4"></i><span class="hidden sm:inline">Stop</span></span><span class="ml-1 text-xs text-gray-400 hidden sm:block -mt-0.5">Esc</span>';
        }
        
        if (window.lucide) {
            lucide.createIcons();
        }

        this.el.statusInd.classList.toggle('hidden', !isSearching);
        this.el.disconnectInd.classList.toggle('hidden', !isDisconnected);
        this.el.videoWaitingMsg.classList.toggle('hidden', !isSearching);

        if (isConnected) {
            this.el.msgInput.focus();
            // Send profile when connected
            setTimeout(() => {
                this.sendProfile();
            }, 500);
        }
    };

    app.handleStopNext = function() {
        if (this.status === 'connected' || this.status === 'searching') {
            this.disconnectChat();
        } else if (this.status === 'disconnected') {
            this.disconnectChat();
            setTimeout(() => {
                this.startChat(this.mode);
            }, 500);
        }
    };

    app.initResizableSplitter = function() {
        const splitter = this.el.splitter;
        const videoPanel = this.el.videoPanel;
        const chatPanel = this.el.chatPanel;
        const chatScreenContainer = document.getElementById('chat-screen-container');
        
        if (!splitter || !videoPanel || !chatPanel || !chatScreenContainer) {
            return; // Elements not available (mobile view)
        }
        
        // Only enable splitter when in video mode and on desktop
        const isVideoMode = () => {
            return window.innerWidth >= 1024 && 
                   this.el.videoContainer && 
                   !this.el.videoContainer.classList.contains('hidden');
        };
        
        // Restore saved panel widths from localStorage
        const savedChatWidth = localStorage.getItem('codmegle_chatPanelWidth');
        if (savedChatWidth) {
            const width = parseFloat(savedChatWidth);
            if (width >= 20 && width <= 50) { // Between 20% and 50% of screen
                chatPanel.style.width = width + '%';
            }
        }
        
        let isDragging = false;
        let startX = 0;
        let startChatWidth = 0;
        const minVideoWidth = 400; // pixels
        const minChatWidth = 300; // pixels
        
        const startDrag = (e) => {
            if (!isVideoMode()) return; // Only on desktop and in video mode
            
            isDragging = true;
            startX = e.clientX || e.touches?.[0]?.clientX || 0;
            startChatWidth = parseFloat(getComputedStyle(chatPanel).width);
            
            splitter.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
        };
        
        const doDrag = (e) => {
            if (!isDragging) return;
            
            const currentX = e.clientX || e.touches?.[0]?.clientX || 0;
            const deltaX = startX - currentX; // Inverted because we're dragging left
            const containerWidth = splitter.parentElement.offsetWidth;
            
            // Calculate new chat panel width
            let newChatWidth = startChatWidth + deltaX;
            let newChatPercent = (newChatWidth / containerWidth) * 100;
            
            // Apply constraints
            const minChatPercent = (minChatWidth / containerWidth) * 100;
            const maxChatPercent = 50; // Max 50% of screen
            const minVideoPercent = (minVideoWidth / containerWidth) * 100;
            
            if (newChatPercent < minChatPercent) {
                newChatPercent = minChatPercent;
            } else if (newChatPercent > maxChatPercent) {
                newChatPercent = maxChatPercent;
            } else if (newChatPercent > (100 - minVideoPercent)) {
                newChatPercent = 100 - minVideoPercent;
            }
            
            chatPanel.style.width = newChatPercent + '%';
            
            e.preventDefault();
        };
        
        const stopDrag = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            splitter.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save panel width to localStorage
            const chatWidth = parseFloat(getComputedStyle(chatPanel).width);
            const containerWidth = splitter.parentElement.offsetWidth;
            const chatPercent = (chatWidth / containerWidth) * 100;
            localStorage.setItem('codmegle_chatPanelWidth', chatPercent.toString());
            
            e.preventDefault();
        };
        
        // Mouse events
        splitter.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        
        // Touch events for potential touch device support
        splitter.addEventListener('touchstart', startDrag);
        document.addEventListener('touchmove', doDrag);
        document.addEventListener('touchend', stopDrag);
        
        // Handle window resize - ensure constraints are maintained
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (isVideoMode()) {
                    const containerWidth = splitter.parentElement.offsetWidth;
                    const currentChatPercent = parseFloat(chatPanel.style.width) || 35;
                    const chatWidth = (currentChatPercent / 100) * containerWidth;
                    
                    // Re-apply constraints on resize
                    const minChatPercent = (minChatWidth / containerWidth) * 100;
                    const minVideoPercent = (minVideoWidth / containerWidth) * 100;
                    
                    let newChatPercent = currentChatPercent;
                    if (newChatPercent < minChatPercent) {
                        newChatPercent = minChatPercent;
                    } else if (newChatPercent > (100 - minVideoPercent)) {
                        newChatPercent = 100 - minVideoPercent;
                    }
                    
                    if (newChatPercent !== currentChatPercent) {
                        chatPanel.style.width = newChatPercent + '%';
                        localStorage.setItem('codmegle_chatPanelWidth', newChatPercent.toString());
                    }
                }
            }, 100);
        });
    };
    
    app.initDraggableLocalVideo = function() {
        // Remove existing event listeners if any (to prevent duplicates)
        const localVideoContainer = this.el.localVideoContainer;
        const videoContainer = this.el.videoContainer;
        
        if (!localVideoContainer || !videoContainer) {
            // Try to initialize later if elements aren't ready
            setTimeout(() => {
                if (this.el.localVideoContainer && this.el.videoContainer) {
                    this.initDraggableLocalVideo();
                }
            }, 500);
            return;
        }
        
        // Restore saved position from localStorage
        const savedPosition = localStorage.getItem('codmegle_localVideoPosition');
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                if (pos.top !== undefined && pos.left !== undefined) {
                    localVideoContainer.style.top = pos.top;
                    localVideoContainer.style.left = pos.left;
                    localVideoContainer.style.bottom = 'auto';
                    localVideoContainer.style.right = 'auto';
                }
            } catch (e) {
                console.warn('Failed to restore local video position:', e);
            }
        }
        
        // Make sure pointer events work on the container
        localVideoContainer.style.pointerEvents = 'auto';
        if (this.el.localVideo) {
            this.el.localVideo.style.pointerEvents = 'none';
        }
        
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        
        const getPosition = (element) => {
            const rect = element.getBoundingClientRect();
            const containerRect = videoContainer.getBoundingClientRect();
            return {
                left: rect.left - containerRect.left,
                top: rect.top - containerRect.top
            };
        };
        
        const startDrag = (e) => {
            // Don't start drag if clicking on indicators
            if (e.target.closest('#mute-indicator') || e.target.closest('#video-off-indicator')) {
                return;
            }
            
            if (!localVideoContainer || localVideoContainer.classList.contains('hidden')) {
                return;
            }
            
            isDragging = true;
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            
            const pos = getPosition(localVideoContainer);
            startX = clientX;
            startY = clientY;
            startLeft = pos.left;
            startTop = pos.top;
            
            localVideoContainer.style.transition = 'none';
            localVideoContainer.style.cursor = 'grabbing';
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
            e.stopPropagation();
        };
        
        const doDrag = (e) => {
            if (!isDragging || !localVideoContainer) return;
            
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            
            if (clientX === 0 && clientY === 0) return; // Invalid coordinates
            
            const deltaX = clientX - startX;
            const deltaY = clientY - startY;
            
            const containerRect = videoContainer.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;
            const elementWidth = localVideoContainer.offsetWidth;
            const elementHeight = localVideoContainer.offsetHeight;
            
            // Calculate new position
            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;
            
            // Constrain to container bounds
            newLeft = Math.max(0, Math.min(newLeft, containerWidth - elementWidth));
            newTop = Math.max(0, Math.min(newTop, containerHeight - elementHeight));
            
            localVideoContainer.style.left = newLeft + 'px';
            localVideoContainer.style.top = newTop + 'px';
            localVideoContainer.style.bottom = 'auto';
            localVideoContainer.style.right = 'auto';
            
            e.preventDefault();
            e.stopPropagation();
        };
        
        const stopDrag = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            localVideoContainer.style.transition = '';
            localVideoContainer.style.cursor = 'move';
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save position to localStorage
            if (localVideoContainer) {
                localStorage.setItem('codmegle_localVideoPosition', JSON.stringify({
                    top: localVideoContainer.style.top,
                    left: localVideoContainer.style.left
                }));
            }
            
            e.preventDefault();
            e.stopPropagation();
        };
        
        // Mouse events - use capture phase to ensure we catch the event
        localVideoContainer.addEventListener('mousedown', startDrag, true);
        document.addEventListener('mousemove', doDrag, true);
        document.addEventListener('mouseup', stopDrag, true);
        
        // Touch events for mobile
        localVideoContainer.addEventListener('touchstart', startDrag, { passive: false, capture: true });
        document.addEventListener('touchmove', doDrag, { passive: false, capture: true });
        document.addEventListener('touchend', stopDrag, { capture: true });
        
        // Prevent video controls from interfering with dragging
        if (this.el.localVideo) {
            this.el.localVideo.style.pointerEvents = 'none';
            this.el.localVideo.style.userSelect = 'none';
            this.el.localVideo.draggable = false;
        }
        
        // Also prevent dragging on child elements
        const noCameraMsg = this.el.noCameraMsg;
        if (noCameraMsg) {
            noCameraMsg.style.pointerEvents = 'none';
        }
    };
    
    app.initResponsiveHandler = function() {
        const chatScreenContainer = document.getElementById('chat-screen-container');
        if (!chatScreenContainer) return;
        
        const updateVideoMode = () => {
            const isDesktop = window.innerWidth >= 1024;
            const isVideoMode = this.mode === 'video';
            const isVideoVisible = this.el.videoContainer && !this.el.videoContainer.classList.contains('hidden');
            
            if (isDesktop && isVideoMode && isVideoVisible) {
                chatScreenContainer.classList.add('video-mode');
            } else {
                chatScreenContainer.classList.remove('video-mode');
            }
        };
        
        // Initial update
        updateVideoMode();
        
        // Handle window resize with debouncing
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                updateVideoMode();
            }, 150);
        });
        
        // Handle orientation change on mobile devices
        window.addEventListener('orientationchange', () => {
            // Wait for orientation change to complete
            setTimeout(() => {
                updateVideoMode();
            }, 200);
        });
    };
}

