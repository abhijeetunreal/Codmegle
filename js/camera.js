// Camera management
import { dom } from './dom.js';

let cameraStream = null;

// Enumerate available devices
export async function enumerateDevices() {
  try {
    // Request permission first to get device labels (some browsers require this)
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      // Permission denied or devices unavailable, but we can still enumerate
      console.warn("Could not get initial media access for device enumeration:", e);
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    const cameras = devices
      .filter(device => device.kind === 'videoinput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
        kind: device.kind
      }));
    
    const microphones = devices
      .filter(device => device.kind === 'audioinput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${device.deviceId.substring(0, 8)}`,
        kind: device.kind
      }));
    
    const speakers = devices
      .filter(device => device.kind === 'audiooutput')
      .map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Speaker ${device.deviceId.substring(0, 8)}`,
        kind: device.kind
      }));
    
    return { cameras, microphones, speakers };
  } catch (err) {
    console.error("Device enumeration error:", err);
    return { cameras: [], microphones: [], speakers: [] };
  }
}

// Get saved device preferences
export function getSavedDevicePreferences() {
  return {
    cameraId: localStorage.getItem('codmegle_selectedCameraId') || null,
    audioId: localStorage.getItem('codmegle_selectedAudioId') || null,
    speakerId: localStorage.getItem('codmegle_selectedSpeakerId') || null
  };
}

// Save device preferences
export function saveDevicePreferences(cameraId, audioId, speakerId) {
  if (cameraId) {
    localStorage.setItem('codmegle_selectedCameraId', cameraId);
  } else {
    localStorage.removeItem('codmegle_selectedCameraId');
  }
  
  if (audioId) {
    localStorage.setItem('codmegle_selectedAudioId', audioId);
  } else {
    localStorage.removeItem('codmegle_selectedAudioId');
  }
  
  if (speakerId) {
    localStorage.setItem('codmegle_selectedSpeakerId', speakerId);
  } else {
    localStorage.removeItem('codmegle_selectedSpeakerId');
  }
}

export async function startCamera(videoDeviceId = null, audioDeviceId = null) {
  try {
    // If no device IDs provided, try to load from preferences
    if (!videoDeviceId && !audioDeviceId) {
      const prefs = getSavedDevicePreferences();
      videoDeviceId = prefs.cameraId;
      audioDeviceId = prefs.audioId;
    }
    
    // Build constraints
    const constraints = {
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
    };
    
    // Stop existing stream if switching devices
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    
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

// Switch devices during active call
export async function switchDevice(videoDeviceId = null, audioDeviceId = null) {
  try {
    // If no device IDs provided, try to load from preferences
    if (!videoDeviceId && !audioDeviceId) {
      const prefs = getSavedDevicePreferences();
      videoDeviceId = prefs.cameraId;
      audioDeviceId = prefs.audioId;
    }
    
    // Build constraints - if switching only one device, keep the other from current stream
    const constraints = {
      video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
      audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
    };
    
    // Stop old tracks first
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    
    // Get new stream
    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Update cameraStream reference
    cameraStream = newStream;
    
    // Update camera element
    if (dom.camera && cameraStream) {
      dom.camera.srcObject = cameraStream;
      try {
        await dom.camera.play();
      } catch (playErr) {
        console.warn("Camera element play error after device switch:", playErr);
      }
    }
    
    return cameraStream;
  } catch (err) {
    console.error("Device switch error:", err);
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

// Get current stream
export function getCurrentStream() {
  return cameraStream;
}

