// Camera management
import { dom } from './dom.js';

let cameraStream = null;

export async function startCamera() {
  try {
    if (cameraStream) {
      return cameraStream;
    }
    
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    if (dom.camera) {
      dom.camera.srcObject = cameraStream;
      dom.camera.autoplay = true;
      dom.camera.playsInline = true;
      // Ensure the hidden camera element plays to keep stream active
      dom.camera.play().catch(err => {
        console.warn("Camera element play error:", err);
      });
    }
    
    return cameraStream;
  } catch (err) {
    console.error("Camera error:", err);
    throw err;
  }
}

export function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (dom.camera) {
    dom.camera.srcObject = null;
  }
}

