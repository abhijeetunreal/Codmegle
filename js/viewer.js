// Viewer mode for receiving remote streams
import { state } from './state.js';
import { dom } from './dom.js';
import { getSavedDevicePreferences } from './camera.js';

export function enterViewerMode(remoteStream) {
  state.remoteStream = remoteStream;
  state.isConnected = true;
  
  // Display remote video
  if (dom.remoteVideoContainer) {
    // Clear placeholder
    dom.remoteVideoContainer.innerHTML = '';
    
    // Create video element
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = remoteStream;
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.muted = false; // Explicitly enable audio so users can hear remote person
    remoteVideo.className = 'w-full h-full object-cover';
    
    // Apply saved speaker preference if available
    const prefs = getSavedDevicePreferences();
    if (prefs.speakerId && typeof remoteVideo.setSinkId === 'function') {
      remoteVideo.setSinkId(prefs.speakerId).catch(err => {
        console.warn("Failed to set audio output device:", err);
      });
    }
    
    // Ensure video plays with audio
    remoteVideo.play().catch(err => {
      console.warn("Remote video play error:", err);
    });
    
    dom.remoteVideoContainer.appendChild(remoteVideo);
  }
  
  // Update UI
  if (dom.videoWaitingMsg) {
    dom.videoWaitingMsg.classList.add('hidden');
  }
  
  // Handle stream end for both video and audio tracks
  remoteStream.getVideoTracks().forEach(track => {
    track.onended = () => {
      console.log('Remote video stream ended');
      state.isConnected = false;
      if (dom.videoWaitingMsg) {
        dom.videoWaitingMsg.classList.remove('hidden');
      }
    };
  });
  
  // Handle audio track end
  remoteStream.getAudioTracks().forEach(track => {
    track.onended = () => {
      console.log('Remote audio stream ended');
    };
  });
}


