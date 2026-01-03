// DOM element references
export const dom = {
  camera: null,
  welcomeScreen: null,
  chatScreen: null,
  messagesContainer: null,
  msgInput: null,
  btnSend: null,
  btnStopNext: null,
  statusInd: null,
  disconnectInd: null,
  videoContainer: null,
  localVideo: null,
  remoteVideoContainer: null,
  noCameraMsg: null,
  videoWaitingMsg: null
};

// Initialize DOM references
export function initDOM() {
  // Create camera element if it doesn't exist
  dom.camera = document.getElementById('camera');
  if (!dom.camera) {
    dom.camera = document.createElement('video');
    dom.camera.id = 'camera';
    dom.camera.autoplay = true;
    dom.camera.playsInline = true;
    dom.camera.style.position = 'absolute';
    dom.camera.style.top = '-9999px';
    dom.camera.style.left = '-9999px';
    dom.camera.style.width = '1px';
    dom.camera.style.height = '1px';
    document.body.appendChild(dom.camera);
  }
  
  dom.welcomeScreen = document.getElementById('welcome-screen');
  dom.chatScreen = document.getElementById('chat-screen');
  dom.messagesContainer = document.getElementById('messages-container');
  dom.msgInput = document.getElementById('msg-input');
  dom.btnSend = document.getElementById('btn-send');
  dom.btnStopNext = document.getElementById('btn-stop-next');
  dom.statusInd = document.getElementById('status-indicator');
  dom.disconnectInd = document.getElementById('disconnect-indicator');
  dom.videoContainer = document.getElementById('video-container');
  dom.localVideo = document.getElementById('local-video');
  dom.remoteVideoContainer = document.getElementById('remote-video-container');
  dom.noCameraMsg = document.getElementById('no-camera-msg');
  dom.videoWaitingMsg = document.getElementById('video-waiting-msg');
}

