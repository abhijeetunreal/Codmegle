// Viewer mode for receiving remote streams
import { state } from './state.js';
import { dom } from './dom.js';

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
    remoteVideo.className = 'w-full h-full object-cover';
    
    dom.remoteVideoContainer.appendChild(remoteVideo);
  }
  
  // Update UI
  if (dom.videoWaitingMsg) {
    dom.videoWaitingMsg.classList.add('hidden');
  }
  
  // Handle stream end
  remoteStream.getVideoTracks().forEach(track => {
    track.onended = () => {
      console.log('Remote stream ended');
      state.isConnected = false;
      if (dom.videoWaitingMsg) {
        dom.videoWaitingMsg.classList.remove('hidden');
      }
    };
  });
}


