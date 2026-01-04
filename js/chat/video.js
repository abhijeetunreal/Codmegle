// Video and camera controls
import { startCamera, stopCamera } from '../camera.js';
import { state } from '../state.js';
import { dom } from '../dom.js';

export function setupVideoMethods(app) {
    app.startCamera = async function() {
        try {
            const stream = await startCamera();
            this.localStream = stream;
            
            // Ensure local video container is visible
            if (this.el.localVideoContainer) {
                this.el.localVideoContainer.classList.remove('hidden');
                this.el.localVideoContainer.style.display = 'block';
                this.el.localVideoContainer.style.visibility = 'visible';
                this.el.localVideoContainer.style.opacity = '1';
            }
            
            if (this.el.localVideo) {
                this.el.localVideo.srcObject = stream;
                this.el.localVideo.classList.remove('hidden');
                this.el.localVideo.style.display = 'block';
                try {
                    await this.el.localVideo.play();
                } catch (playErr) {
                    console.warn("Video play error:", playErr);
                }
            }
            if (this.el.noCameraMsg) {
                this.el.noCameraMsg.classList.add('hidden');
            }
            // Initialize button states after camera starts
            this.isMuted = false;
            this.isVideoEnabled = true;
            // Ensure indicators are hidden initially
            if (this.el.muteIndicator) {
                this.el.muteIndicator.classList.add('hidden');
            }
            if (this.el.videoOffIndicator) {
                this.el.videoOffIndicator.classList.add('hidden');
            }
            this.updateMediaButtonStates();
            
            // Re-initialize draggable after camera starts
            setTimeout(() => {
                this.initDraggableLocalVideo();
            }, 200);
        } catch (e) {
            console.error("Camera error", e);
            if (this.el.localVideo) {
                this.el.localVideo.classList.add('hidden');
            }
            if (this.el.noCameraMsg) {
                this.el.noCameraMsg.classList.remove('hidden');
            }
            throw e;
        }
    };

    app.stopCamera = function() {
        stopCamera();
        this.localStream = null;
        if (this.el.localVideo) {
            this.el.localVideo.srcObject = null;
        }
    };

    app.toggleMute = function() {
        this.isMuted = !this.isMuted;
        
        // Toggle audio tracks in localStream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                if (track.kind === 'audio') {
                    track.enabled = !this.isMuted;
                }
            });
        }
        
        // Toggle audio tracks in state.hostStream
        if (state.hostStream) {
            state.hostStream.getTracks().forEach(track => {
                if (track.kind === 'audio') {
                    track.enabled = !this.isMuted;
                }
            });
        }
        
        // Also check dom.camera.srcObject if it exists
        if (dom.camera && dom.camera.srcObject) {
            dom.camera.srcObject.getTracks().forEach(track => {
                if (track.kind === 'audio') {
                    track.enabled = !this.isMuted;
                }
            });
        }
        
        this.updateMediaButtonStates();
    };

    app.toggleVideo = function() {
        this.isVideoEnabled = !this.isVideoEnabled;
        
        // Toggle video tracks in localStream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                if (track.kind === 'video') {
                    track.enabled = this.isVideoEnabled;
                }
            });
        }
        
        // Toggle video tracks in state.hostStream
        if (state.hostStream) {
            state.hostStream.getTracks().forEach(track => {
                if (track.kind === 'video') {
                    track.enabled = this.isVideoEnabled;
                }
            });
        }
        
        // Also check dom.camera.srcObject if it exists
        if (dom.camera && dom.camera.srcObject) {
            dom.camera.srcObject.getTracks().forEach(track => {
                if (track.kind === 'video') {
                    track.enabled = this.isVideoEnabled;
                }
            });
        }
        
        // Show/hide "No Camera" overlay on local video
        if (this.el.localVideo && this.el.noCameraMsg) {
            if (this.isVideoEnabled) {
                this.el.noCameraMsg.classList.add('hidden');
            } else {
                this.el.noCameraMsg.classList.remove('hidden');
            }
        }
        
        this.updateMediaButtonStates();
    };

    app.updateMediaButtonStates = function() {
        // Update mute button with better visual feedback
        if (this.el.btnMute) {
            const icon = this.el.btnMute.querySelector('i');
            if (icon) {
                // Remove old icon and create new one for better visual update
                const iconName = this.isMuted ? 'mic-off' : 'mic';
                icon.setAttribute('data-lucide', iconName);
                
                // Update button styling with clear visual feedback
                if (this.isMuted) {
                    // Muted state: red styling
                    this.el.btnMute.classList.remove('border-gray-300', 'text-gray-700', 'hover:border-blue-400', 'hover:bg-blue-50', 'bg-white');
                    this.el.btnMute.classList.add('border-red-500', 'bg-red-100', 'text-red-600', 'hover:border-red-600', 'hover:bg-red-200');
                } else {
                    // Unmuted state: normal styling
                    this.el.btnMute.classList.remove('border-red-500', 'bg-red-100', 'text-red-600', 'hover:border-red-600', 'hover:bg-red-200');
                    this.el.btnMute.classList.add('border-gray-300', 'text-gray-700', 'hover:border-blue-400', 'hover:bg-blue-50', 'bg-white');
                }
                
                // Force icon refresh
                lucide.createIcons();
            }
        }
        
        // Update video toggle button with better visual feedback
        if (this.el.btnVideoToggle) {
            const icon = this.el.btnVideoToggle.querySelector('i');
            if (icon) {
                // Remove old icon and create new one for better visual update
                const iconName = this.isVideoEnabled ? 'video' : 'video-off';
                icon.setAttribute('data-lucide', iconName);
                
                // Update button styling with clear visual feedback
                if (!this.isVideoEnabled) {
                    // Video off state: red styling
                    this.el.btnVideoToggle.classList.remove('border-gray-300', 'text-gray-700', 'hover:border-blue-400', 'hover:bg-blue-50', 'bg-white');
                    this.el.btnVideoToggle.classList.add('border-red-500', 'bg-red-100', 'text-red-600', 'hover:border-red-600', 'hover:bg-red-200');
                } else {
                    // Video on state: normal styling
                    this.el.btnVideoToggle.classList.remove('border-red-500', 'bg-red-100', 'text-red-600', 'hover:border-red-600', 'hover:bg-red-200');
                    this.el.btnVideoToggle.classList.add('border-gray-300', 'text-gray-700', 'hover:border-blue-400', 'hover:bg-blue-50', 'bg-white');
                }
                
                // Force icon refresh
                lucide.createIcons();
            }
        }
        
        // Update visual indicators on local video preview
        if (this.el.muteIndicator) {
            const wasHidden = this.el.muteIndicator.classList.contains('hidden');
            // Show indicator when muted (isMuted = true)
            this.el.muteIndicator.classList.toggle('hidden', !this.isMuted);
            // Re-initialize icons when indicator becomes visible
            if (wasHidden && this.isMuted && window.lucide) {
                lucide.createIcons();
            }
        }
        
        if (this.el.videoOffIndicator) {
            const wasHidden = this.el.videoOffIndicator.classList.contains('hidden');
            // Show indicator when video is off (isVideoEnabled = false)
            this.el.videoOffIndicator.classList.toggle('hidden', this.isVideoEnabled);
            // Re-initialize icons when indicator becomes visible
            if (wasHidden && !this.isVideoEnabled && window.lucide) {
                lucide.createIcons();
            }
        }
    };
}

