// ================= SCREEN SHARE / HOSTING =================
import { state } from './state.js';
import { dom } from './dom.js';
import { startCamera } from './camera.js';
import { isMobileDevice, isFirefox } from './utils.js';
import { enterViewerMode } from './viewer.js';
import { registerSession, unregisterSession, markSessionConnected, markSessionAvailable, CODMEGLE_PLATFORM_ID } from './discovery.js';
import { showAlert } from './alert.js';

export function stopHosting() {
  // Send disconnect message to peer before closing
  if (state.dataConnection && state.dataConnection.open) {
    try {
      state.dataConnection.send(JSON.stringify({ type: 'DISCONNECT' }));
    } catch (err) {
      console.warn("Could not send disconnect message:", err);
    }
  }
  
  // Mark session as available before unregistering (if it was connected)
  if (state.currentShareCode && state.isConnected) {
    markSessionAvailable(state.currentShareCode).catch(err => {
      console.warn("Failed to mark session as available:", err);
    });
  }
  
  // Unregister from discovery service
  if (state.currentShareCode) {
    unregisterSession(state.currentShareCode);
    state.currentShareCode = null;
  }

  if (state.call) {
    state.call.close();
    state.call = null;
  }
  if (state.hostStream) {
    state.hostStream.getTracks().forEach(track => track.stop());
    state.hostStream = null;
  }
  if (state.dataConnection) {
    state.dataConnection.close();
    state.dataConnection = null;
  }
  
  // Destroy peer to fully clean up
  if (state.peer && !state.peer.destroyed) {
    state.peer.destroy();
    state.peer = null;
  }
  
  state.isHosting = false;
  state.isConnected = false;
}

export async function host() {
  if (state.isHosting) {
    showAlert("Already hosting. Please stop the current session first.", 'warning');
    return;
  }
  
  // Basic UI setup (synchronous, doesn't break gesture context)
  state.isHosting = true;
  
  try {
    // For text mode, don't request any media - just use dummy stream
    if (state.mode === 'text') {
      // Create a dummy stream for text-only mode (no media needed)
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 1, 1);
      
      if (typeof canvas.captureStream === 'function') {
        state.hostStream = canvas.captureStream(1);
      } else if (typeof canvas.mozCaptureStream === 'function') {
        state.hostStream = canvas.mozCaptureStream(1);
      } else {
        throw new Error("Canvas stream not supported");
      }
    } else {
      // Check if device is mobile or if getDisplayMedia is not available
      const isMobile = isMobileDevice();
      const hasDisplayMedia = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
      
      // For video chat mode, use camera instead of screen sharing
      const useCamera = state.mode === 'video' || isMobile || !hasDisplayMedia;
      
      if (useCamera) {
      // Use camera for video chat
      // Clean up any existing peer (can do this async now)
      if (state.peer) {
        state.peer.destroy();
      }
      
      // Ensure camera is started
      if (!dom.camera.srcObject) {
        await startCamera();
      }
      
      // Wait a bit for camera to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!dom.camera.srcObject) {
        throw new Error("Camera not available. Please ensure camera permissions are granted.");
      }
      
      // Use camera stream directly
      state.hostStream = dom.camera.srcObject;
      
      // Display local video for host
      if (window.app && window.app.el && window.app.el.localVideo) {
        window.app.el.localVideo.srcObject = dom.camera.srcObject;
        window.app.el.localVideo.classList.remove('hidden');
        // Ensure video plays
        try {
          await window.app.el.localVideo.play();
        } catch (playErr) {
          console.warn("Video play error:", playErr);
        }
        if (window.app.el.noCameraMsg) {
          window.app.el.noCameraMsg.classList.add('hidden');
        }
      }
    } else if (!isMobile && hasDisplayMedia) {
      // CRITICAL: For desktop with screen sharing, call getDisplayMedia() IMMEDIATELY
      // while still in user gesture context, before any async operations
      // Desktop: Use screen sharing - call immediately in user gesture context
      const isFirefoxBrowser = isFirefox();
      
      if (isFirefoxBrowser) {
        // Firefox: Try different constraint approaches to enable window/screen/tab picker
        // Firefox requires the call to happen synchronously in user gesture context
        console.log("Firefox: Requesting screen share with minimal constraints");
        try {
          // First try with no constraints to let Firefox show its native picker
          state.hostStream = await navigator.mediaDevices.getDisplayMedia({});
          console.log("Firefox: Screen share successful with empty constraints");
        } catch (err) {
          console.log("Firefox: Empty constraints failed, trying video: true", err);
          try {
            // Second try with minimal video constraint
            state.hostStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            console.log("Firefox: Screen share successful with video: true");
          } catch (err2) {
            console.log("Firefox: video: true failed, trying video: { mediaSource }", err2);
            // Third try with explicit mediaSource
            state.hostStream = await navigator.mediaDevices.getDisplayMedia({ 
              video: { mediaSource: 'screen' } 
            });
            console.log("Firefox: Screen share successful with mediaSource");
          }
        }
      } else {
        // Chrome/others: Use full constraints
        state.hostStream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: "always",
            displaySurface: "monitor"
          },
          audio: false 
        });
      }
      
      // Validate stream was obtained
      if (!state.hostStream || !state.hostStream.getVideoTracks() || state.hostStream.getVideoTracks().length === 0) {
        throw new Error("Failed to obtain screen sharing stream");
      }
      
      // Handle when user stops sharing (only for screen sharing, not text mode)
      if (state.hostStream.getVideoTracks().length > 0) {
        state.hostStream.getVideoTracks()[0].onended = () => {
          stopHosting();
        };
      }
    }
  }
    
    // Now do async setup after we have the stream
    // Clean up any existing peer (if not done already)
    if (state.peer) {
      state.peer.destroy();
    }
    
    // Camera is already started if needed (for video/canvas mode)
    
    // Generate 5-character shareable code first
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
    let shareCode = '';
    for (let i = 0; i < 5; i++) {
      shareCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Use the code as PeerJS custom ID
    state.peer = new Peer(shareCode, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });
    
    state.peer.on("error", (err) => {
      console.error("Peer error:", err);
      // Don't stop hosting on peer-unavailable - ID might be taken, but we can still accept connections
      if (err.type !== 'peer-unavailable') {
        console.warn("Peer error (non-critical):", err.type);
      }
    });
    
    // Listen for incoming data connections (for chat)
    state.peer.on("connection", (dataConnection) => {
      console.log("Host received incoming data connection from:", dataConnection.peer);
      
      // Reject if already connected to another peer
      if (state.isConnected) {
        console.log("Already connected, rejecting new data connection from:", dataConnection.peer);
        dataConnection.close();
        return;
      }
      
      // Use this data connection if we don't have one yet, or if it's from the same peer
      if (!state.dataConnection || state.dataConnection.peer !== dataConnection.peer) {
        state.dataConnection = dataConnection;
        
        dataConnection.on('open', () => {
          state.isConnected = true;
          console.log('Data connection opened (host side - incoming)');
          
          // Mark session as connected
          if (state.currentShareCode) {
            markSessionConnected(state.currentShareCode).catch(err => {
              console.warn("Failed to mark session as connected:", err);
            });
          }
          
          if (window.app) {
            window.app.status = 'connected';
            window.app.updateUIState();
          }
        });
        
        dataConnection.on('data', (data) => {
          try {
            const message = JSON.parse(data);
            if (message.type === 'CHAT') {
              // Handle incoming chat message
              if (window.app && window.app.appendMessage) {
                window.app.appendMessage(message);
              }
            } else if (message.type === 'DISCONNECT') {
              console.log("Received DISCONNECT message from peer");
              // Clean up connection
              if (state.call) {
                state.call.close();
                state.call = null;
              }
              if (state.dataConnection === dataConnection) {
                state.dataConnection.close();
                state.dataConnection = null;
              }
              state.isConnected = false;
              
              // Mark session as available again for new connections
              if (state.currentShareCode) {
                markSessionAvailable(state.currentShareCode).catch(err => {
                  console.warn("Failed to mark session as available:", err);
                });
              }
              
              if (window.app) {
                window.app.status = 'disconnected';
                window.app.updateUIState();
              }
              // Don't call stopHosting here as we want to keep hosting for new connections
            }
          } catch (err) {
            console.error('Error parsing data:', err);
          }
        });
        
        dataConnection.on('close', () => {
          console.log('Data connection closed (host side)');
          if (state.dataConnection === dataConnection) {
            state.dataConnection = null;
            // If connection closes unexpectedly, update status
            if (state.isConnected && window.app) {
              state.isConnected = false;
              
              // Mark session as available again
              if (state.currentShareCode) {
                markSessionAvailable(state.currentShareCode).catch(err => {
                  console.warn("Failed to mark session as available:", err);
                });
              }
              
              window.app.status = 'disconnected';
              window.app.updateUIState();
            }
          }
        });
        
        dataConnection.on('error', (err) => {
          console.error('Data connection error (host side):', err);
        });
      }
    });
    
    state.peer.on("call", (incomingCall) => {
      console.log("Host received incoming call from:", incomingCall.peer);
      
      // Reject if already connected to another peer
      if (state.isConnected || state.call) {
        console.log("Already connected, rejecting new call from:", incomingCall.peer);
        incomingCall.close();
        return;
      }
      
      if (state.hostStream) {
        // Answer the call with our stream
        incomingCall.answer(state.hostStream);
        state.call = incomingCall;
        
        // Stop searching for matches since we're now connected
        if (window.app && window.app.lookingForMatch) {
          window.app.lookingForMatch = false;
          if (window.app.searchInterval) {
            clearInterval(window.app.searchInterval);
            window.app.searchInterval = null;
          }
        }
        
        // Mark session as connected in discovery (so it's not available for others)
        if (state.currentShareCode) {
          markSessionConnected(state.currentShareCode).catch(err => {
            console.warn("Failed to mark session as connected:", err);
          });
        }
        
        // Listen for remote stream from the caller (bidirectional)
        state.call.on("stream", (remoteStream) => {
          console.log("Host received remote stream from caller");
          enterViewerMode(remoteStream);
          state.isConnected = true;
          
          // Ensure session is marked as connected
          if (state.currentShareCode) {
            markSessionConnected(state.currentShareCode).catch(err => {
              console.warn("Failed to mark session as connected:", err);
            });
          }
          
          // Update UI
          if (window.app) {
            window.app.status = 'connected';
            window.app.updateUIState();
          }
        });
        
        // Try to create outgoing data connection (in case joiner doesn't create one)
        // But also listen for incoming connections above
        if (!state.dataConnection) {
          try {
            state.dataConnection = state.peer.connect(incomingCall.peer);
            state.dataConnection.on('open', () => {
              state.isConnected = true;
              console.log('Data connection opened (host side - outgoing)');
              if (window.app) {
                window.app.status = 'connected';
                window.app.updateUIState();
              }
            });
            
            state.dataConnection.on('data', (data) => {
              try {
                const message = JSON.parse(data);
                if (message.type === 'CHAT') {
                  // Handle incoming chat message
                  if (window.app && window.app.appendMessage) {
                    window.app.appendMessage(message);
                  }
                  } else if (message.type === 'DISCONNECT') {
                  console.log("Received DISCONNECT message from peer");
                  // Clean up connection
                  if (state.call) {
                    state.call.close();
                    state.call = null;
                  }
                  if (state.dataConnection) {
                    state.dataConnection.close();
                    state.dataConnection = null;
                  }
                  state.isConnected = false;
                  
                  // Mark session as available again
                  if (state.currentShareCode) {
                    markSessionAvailable(state.currentShareCode).catch(err => {
                      console.warn("Failed to mark session as available:", err);
                    });
                  }
                  
                  if (window.app) {
                    window.app.status = 'disconnected';
                    window.app.updateUIState();
                  }
                  // Don't call stopHosting here as we want to keep hosting for new connections
                }
              } catch (err) {
                console.error('Error parsing data:', err);
              }
            });
          } catch (err) {
            console.warn("Could not create outgoing data connection, will wait for incoming:", err);
          }
        }
        
        state.call.on("close", () => {
          console.log("Call closed (host side)");
          state.isConnected = false;
          if (state.dataConnection) {
            state.dataConnection.close();
            state.dataConnection = null;
          }
          
          // Mark session as available again
          if (state.currentShareCode) {
            markSessionAvailable(state.currentShareCode).catch(err => {
              console.warn("Failed to mark session as available:", err);
            });
          }
          
          if (window.app) {
            window.app.status = 'disconnected';
            window.app.updateUIState();
          }
        });
        
        state.call.on("error", (err) => {
          console.error("Call error (host side):", err);
        });
      } else {
        console.error("No stream available to answer call");
        incomingCall.close();
      }
    });
    
    state.peer.on("open", (id) => {
      // id will be the shareCode we set
      const code = id;
      state.currentShareCode = code;
      
      console.log("Host peer opened with code:", code);
      
      // Register with discovery service
      registerSession(code, null, state.mode).catch(err => {
        console.warn("Failed to register session with discovery service:", err);
        // Continue anyway - discovery is optional
      });
      
      // Answer incoming calls with the stream we already have
      if (state.hostStream) {
        // Stream is already set up, ready to accept calls
        console.log("Host ready to accept connections");
      } else {
        console.error("No stream available when peer opened");
        stopHosting();
      }
    });
    
  } catch (err) {
    console.error("Error getting media stream:", err);
    state.isHosting = false;
    
    // Improved error handling with Firefox-specific messages
    const isFirefoxBrowser = isFirefox();
    
    if (isFirefoxBrowser) {
      // Firefox-specific error handling
      if (err.message && (err.message.includes("can not be found here") || err.message.includes("The object can not be found here"))) {
        showAlert("Screen sharing failed. If the window list is empty, please grant Screen Recording permission in System Preferences > Security & Privacy > Privacy > Screen Recording, then restart Firefox.", 'error');
      } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showAlert("Permission denied. Please allow screen sharing access in Firefox. You may need to check Firefox's permissions settings.", 'error');
      } else if (err.name === "AbortError" || err.name === "NotReadableError") {
        showAlert("Screen sharing was cancelled or failed. Please try again and select a window, screen, or tab to share.", 'warning');
      } else {
        showAlert("Firefox screen sharing error: " + (err.message || err.name || "Unknown error") + "\n\nTip: Make sure Firefox has Screen Recording permission in your system settings.", 'error');
      }
    } else {
      // Other browsers
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showAlert("Permission denied. Please allow screen sharing access.", 'error');
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        showAlert("No camera found. Please ensure your device has a camera.", 'error');
      } else if (err.name === "AbortError") {
        showAlert("Screen sharing was cancelled. Please try again.", 'warning');
      } else {
        showAlert("Could not start sharing: " + (err.message || err.name || "Unknown error"), 'error');
      }
    }
  }
}

export async function join(idOrLink) {
  // If we're already hosting, use the existing peer to call
  // Don't destroy the host peer!
  if (state.peer && state.isHosting && state.peer.open && !state.peer.destroyed) {
    console.log("Using existing host peer to call target");
    const peerIdToCall = idOrLink.trim();
    
    // Get local stream
    let localStream = null;
    if (state.mode === 'text') {
      // For text mode, create dummy stream (no media needed)
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 1, 1);
      
      if (typeof canvas.captureStream === 'function') {
        localStream = canvas.captureStream(1);
      } else if (typeof canvas.mozCaptureStream === 'function') {
        localStream = canvas.mozCaptureStream(1);
      } else {
        console.error("Canvas stream not supported");
        return;
      }
    } else if (state.mode === 'video' && dom.camera && dom.camera.srcObject) {
      localStream = dom.camera.srcObject;
    } else if (state.hostStream) {
      localStream = state.hostStream;
    }
    
    if (!localStream) {
      console.error("No local stream available");
      return;
    }
    
      // Make the call using existing peer
      try {
        console.log("Calling peer with existing host peer:", peerIdToCall);
        state.call = state.peer.call(peerIdToCall, localStream);
        
        if (!state.call) {
          throw new Error("Could not initiate call");
        }
        
        // Set up the same handlers as in attemptConnection below
        let connectionTimeout = null;
        
        connectionTimeout = setTimeout(() => {
          if (state.call && !state.isConnected) {
            console.warn(`Connection timeout for ${peerIdToCall} after 8s`);
            if (state.call) {
              state.call.close();
              state.call = null;
            }
            state.isConnected = false;
            if (window.app) {
              window.app.currentConnectionAttempt = null;
            }
          }
        }, 8000);
        
        state.call.on("stream", (remoteStream) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          console.log("Received remote stream - CONNECTION SUCCESS!");
          enterViewerMode(remoteStream);
          state.isConnected = true;
          
          // Mark the target session as connected (if we're joining someone else)
          // Note: The host will mark itself as connected when it receives the call
          
          if (window.app && window.app.lookingForMatch) {
            window.app.lookingForMatch = false;
            if (window.app.searchInterval) {
              clearInterval(window.app.searchInterval);
              window.app.searchInterval = null;
            }
          }
          
          if (window.app) {
            window.app.currentConnectionAttempt = null;
            window.app.status = 'connected';
            window.app.updateUIState();
            if (window.app.el && window.app.el.messagesContainer) {
              window.app.el.messagesContainer.innerHTML = '<div class="text-gray-500 text-sm mb-4 italic">Connected! Say Hi!</div>';
            }
          }
          
          // Set up data connection AFTER call is established
          if (!state.dataConnection) {
            try {
              console.log("Setting up data connection for chat...");
              state.dataConnection = state.peer.connect(peerIdToCall);
              state.dataConnection.on('open', () => {
                state.isConnected = true;
                console.log('Data connection opened (using existing host peer)');
                
                // Mark the target session as connected
                // Note: The host will mark itself as connected when it receives the call
                
                if (window.app) {
                  window.app.status = 'connected';
                  window.app.updateUIState();
                }
              });
              state.dataConnection.on('data', (data) => {
                try {
                  const message = JSON.parse(data);
                  if (message.type === 'CHAT') {
                    console.log('Received chat message:', message.text);
                    if (window.app && window.app.appendMessage) {
                      window.app.appendMessage(message);
                    }
                  } else if (message.type === 'DISCONNECT') {
                    console.log("Received DISCONNECT message from peer");
                    if (state.call) {
                      state.call.close();
                      state.call = null;
                    }
                    if (state.dataConnection) {
                      state.dataConnection.close();
                      state.dataConnection = null;
                    }
                    state.isConnected = false;
                    
                    // Mark the target session as available again
                    if (peerIdToCall) {
                      markSessionAvailable(peerIdToCall).catch(err => {
                        console.warn("Failed to mark session as available:", err);
                      });
                    }
                    
                    if (window.app) {
                      window.app.status = 'disconnected';
                      window.app.updateUIState();
                    }
                  }
                } catch (err) {
                  console.error('Error parsing data:', err);
                }
              });
              state.dataConnection.on('close', () => {
                console.log('Data connection closed');
                if (state.dataConnection) {
                  state.dataConnection = null;
                }
              });
              state.dataConnection.on('error', (err) => {
                console.error('Data connection error:', err);
              });
            } catch (err) {
              console.warn("Could not create data connection:", err);
            }
          }
        });
        
        state.call.on("error", (err) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          console.error(`Call error:`, err.type || err.message);
          if (state.call) {
            state.call.close();
            state.call = null;
          }
          state.isConnected = false;
          if (window.app) {
            window.app.currentConnectionAttempt = null;
          }
        });
        
        return;
    } catch (err) {
      console.error("Error calling with existing peer:", err);
      // Continue to create new peer below
    }
  }
  
  // Clean up any existing peer that's NOT our host
  if (state.peer && !state.isHosting) {
    state.peer.destroy();
    state.peer = null;
  }
  
  // Extract ID from link if it's a full URL
  let id = idOrLink.trim();
  if (id.includes('?join=')) {
    id = id.split('?join=')[1].split('&')[0];
  } else if (id.includes('join=')) {
    id = id.split('join=')[1].split('&')[0];
  }
  
  if (!id || id === "") {
    showAlert("Please enter a valid Share Code or Link", 'warning');
    return;
  }
  
  // Get the user's stream (camera or screen share based on mode)
  let localStream = null;
  try {
    // For text mode, don't request any media - just use dummy stream
    if (state.mode === 'text') {
      // Create a dummy stream for text-only mode (no media needed)
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 1, 1);
      
      if (typeof canvas.captureStream === 'function') {
        localStream = canvas.captureStream(1);
      } else if (typeof canvas.mozCaptureStream === 'function') {
        localStream = canvas.mozCaptureStream(1);
      } else {
        throw new Error("Canvas stream not supported");
      }
    } else {
      const isMobile = isMobileDevice();
      const hasDisplayMedia = navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
      const useCamera = state.mode === 'video' || isMobile || !hasDisplayMedia;
      
      if (useCamera) {
      // Use camera for video chat
      if (!dom.camera.srcObject) {
        await startCamera();
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (dom.camera.srcObject) {
        localStream = dom.camera.srcObject;
        // Display local video
        if (window.app && window.app.el && window.app.el.localVideo) {
          window.app.el.localVideo.srcObject = localStream;
          window.app.el.localVideo.classList.remove('hidden');
          // Ensure video plays
          try {
            await window.app.el.localVideo.play();
          } catch (playErr) {
            console.warn("Video play error:", playErr);
          }
          if (window.app.el.noCameraMsg) {
            window.app.el.noCameraMsg.classList.add('hidden');
          }
        }
      } else {
        throw new Error("Camera not available");
      }
      } else {
        // Use screen sharing
        const isFirefoxBrowser = isFirefox();
        if (isFirefoxBrowser) {
          try {
            localStream = await navigator.mediaDevices.getDisplayMedia({});
          } catch (err) {
            try {
              localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            } catch (err2) {
              localStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { mediaSource: 'screen' } 
              });
            }
          }
        } else {
          localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
              cursor: "always",
              displaySurface: "monitor"
            },
            audio: false 
          });
        }
      }
    }
  } catch (err) {
    console.error("Error getting local stream:", err);
    // Fallback to dummy stream if camera/screen share fails
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 1, 1);
    
    if (typeof canvas.captureStream === 'function') {
      localStream = canvas.captureStream(1);
    } else if (typeof canvas.mozCaptureStream === 'function') {
      localStream = canvas.mozCaptureStream(1);
    }
  }
  
  state.peer = new Peer({
    debug: 1, // Reduced debug level
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.ekiga.net' },
        { urls: 'stun:stun.fwdnet.net' },
        { urls: 'stun:stun.ideasip.com' },
        { urls: 'stun:stun.iptel.org' },
        { urls: 'stun:stun.rixtelecom.se' },
        { urls: 'stun:stun.schlund.de' },
        { urls: 'stun:stunserver.org' },
        { urls: 'stun:stun.softjoys.com' },
        { urls: 'stun:stun.voiparound.com' },
        { urls: 'stun:stun.voipbuster.com' },
        { urls: 'stun:stun.voipstunt.com' },
        { urls: 'stun:stun.voxgratia.org' },
        { urls: 'stun:stun.xten.com' }
      ],
      iceCandidatePoolSize: 10
    }
  });
  
  // Listen for incoming data connections (for chat) - set this up before peer opens
  state.peer.on("connection", (dataConnection) => {
    console.log("Joiner received incoming data connection from:", dataConnection.peer);
    
    // Use this data connection if we don't have one yet
    if (!state.dataConnection || state.dataConnection.peer !== dataConnection.peer) {
      state.dataConnection = dataConnection;
      
      dataConnection.on('open', () => {
        state.isConnected = true;
        console.log('Data connection opened (joiner side - incoming)');
        if (window.app) {
          window.app.status = 'connected';
          window.app.updateUIState();
        }
      });
      
      dataConnection.on('data', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'CHAT') {
            // Handle incoming chat message
            if (window.app && window.app.appendMessage) {
              window.app.appendMessage(message);
            }
                } else if (message.type === 'DISCONNECT') {
                  console.log("Received DISCONNECT message from peer");
                  // Clean up connection
                  if (state.call) {
                    state.call.close();
                    state.call = null;
                  }
                  if (state.dataConnection === dataConnection) {
                    state.dataConnection.close();
                    state.dataConnection = null;
                  }
                  state.isConnected = false;
                  
                  // Mark the host session as available again (peer ID is the host's code)
                  if (dataConnection.peer) {
                    markSessionAvailable(dataConnection.peer).catch(err => {
                      console.warn("Failed to mark session as available:", err);
                    });
                  }
                  
                  if (window.app) {
                    window.app.status = 'disconnected';
                    window.app.updateUIState();
                  }
                }
        } catch (err) {
          console.error('Error parsing data:', err);
        }
      });
      
      dataConnection.on('close', () => {
        console.log('Data connection closed (joiner side)');
        if (state.dataConnection === dataConnection) {
          state.dataConnection = null;
          // If connection closes unexpectedly, mark session as available
          if (state.isConnected && dataConnection.peer) {
            state.isConnected = false;
            markSessionAvailable(dataConnection.peer).catch(err => {
              console.warn("Failed to mark session as available:", err);
            });
            if (window.app) {
              window.app.status = 'disconnected';
              window.app.updateUIState();
            }
          }
        }
      });
      
      dataConnection.on('error', (err) => {
        console.error('Data connection error (joiner side):', err);
      });
    }
  });
  
  state.peer.on("open", (peerId) => {
    console.log("Joiner peer opened with ID:", peerId);
    console.log("Joining with code/ID:", id);
    
    // Use the code/ID directly
    const peerIdToCall = id.trim();
    
    // Connection attempt - no retries, let search interval find next peer on failure
    let connectionTimeout = null;
    
    const attemptConnection = () => {
      try {
        if (!state.peer || !state.peer.open) {
          throw new Error("Peer not ready");
        }
        
        console.log(`Attempting to call peer: ${peerIdToCall}`);
        state.call = state.peer.call(peerIdToCall, localStream);
        
        if (!state.call) {
          throw new Error("Could not initiate call");
        }
        
        console.log("Call initiated, waiting for connection...");
        
        // Set timeout for connection (shorter timeout - if it takes too long, try next peer)
        connectionTimeout = setTimeout(() => {
          if (state.call && !state.isConnected) {
            console.warn(`Connection timeout for ${peerIdToCall} after 8s, will try next peer`);
            if (state.call) {
              state.call.close();
              state.call = null;
            }
            // Don't retry same peer - let search interval find next one
            state.isConnected = false;
            // Search interval will continue and find next peer automatically
          }
        }, 8000); // 8 second timeout - if not connected, try next peer
        
        state.call.on("stream", (remoteStream) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          console.log("Joiner received remote stream from host - CONNECTION SUCCESS!");
          enterViewerMode(remoteStream);
          state.isConnected = true;
          
          // Mark the target session as connected
          // Note: The host will mark itself as connected when it receives the call
          markSessionConnected(peerIdToCall).catch(err => {
            console.warn("Failed to mark target session as connected:", err);
          });
          
          // Stop searching since we're connected
          if (window.app && window.app.lookingForMatch) {
            window.app.lookingForMatch = false;
            if (window.app.searchInterval) {
              clearInterval(window.app.searchInterval);
              window.app.searchInterval = null;
            }
          }
          
          // Clear current connection attempt
          if (window.app) {
            window.app.currentConnectionAttempt = null;
          }
          
          // Update app status
          if (window.app) {
            window.app.status = 'connected';
            window.app.updateUIState();
            // Update messages
            if (window.app.el && window.app.el.messagesContainer) {
              window.app.el.messagesContainer.innerHTML = '<div class="text-gray-500 text-sm mb-4 italic">Connected! Say Hi!</div>';
            }
          }
        });
        
        // Set up outgoing data connection for chat (host will receive it via connection event)
        if (!state.dataConnection) {
          try {
            state.dataConnection = state.peer.connect(peerIdToCall);
            state.dataConnection.on('open', () => {
              state.isConnected = true;
              console.log('Data connection opened (joiner side - outgoing)');
              
              // Mark the target session as connected
              markSessionConnected(peerIdToCall).catch(err => {
                console.warn("Failed to mark target session as connected:", err);
              });
              
              if (window.app) {
                window.app.status = 'connected';
                window.app.updateUIState();
              }
            });
            
            state.dataConnection.on('data', (data) => {
              try {
                const message = JSON.parse(data);
                if (message.type === 'CHAT') {
                  // Handle incoming chat message
                  if (window.app && window.app.appendMessage) {
                    window.app.appendMessage(message);
                  }
                } else if (message.type === 'DISCONNECT') {
                  console.log("Received DISCONNECT message from peer");
                  // Clean up connection
                  if (state.call) {
                    state.call.close();
                    state.call = null;
                  }
                  if (state.dataConnection === dataConnection) {
                    state.dataConnection.close();
                    state.dataConnection = null;
                  }
                  state.isConnected = false;
                  
                  // Mark the target session as available again
                  if (peerIdToCall) {
                    markSessionAvailable(peerIdToCall).catch(err => {
                      console.warn("Failed to mark session as available:", err);
                    });
                  }
                  
                  if (window.app) {
                    window.app.status = 'disconnected';
                    window.app.updateUIState();
                  }
                }
              } catch (err) {
                console.error('Error parsing data:', err);
              }
            });
          } catch (err) {
            console.warn("Could not create outgoing data connection, will wait for incoming:", err);
          }
        }
        
        state.call.on("close", () => {
          console.log("Call closed");
          if (localStream && localStream.getTracks) {
            localStream.getTracks().forEach(track => track.stop());
          }
          if (state.dataConnection) {
            state.dataConnection.close();
            state.dataConnection = null;
          }
          state.isConnected = false;
          
          // Mark session as available again
          if (peerIdToCall) {
            markSessionAvailable(peerIdToCall).catch(err => {
              console.warn("Failed to mark session as available:", err);
            });
          }
          
          setTimeout(() => {
            showAlert("Connection to host lost", 'error');
            if (window.app && window.app.disconnectChat) {
              window.app.disconnectChat();
            }
          }, 500);
        });
        
        state.call.on("error", (err) => {
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
          }
          console.error(`Call error for ${peerIdToCall}:`, err.type || err.message);
          
          // Clean up failed connection
          if (state.call) {
            state.call.close();
            state.call = null;
          }
          
          // For peer-unavailable or connection errors, don't retry same peer
          // Let the search interval find the next available peer
          if (err.type === 'peer-unavailable' || err.message?.includes('Could not connect')) {
            console.log(`Peer ${peerIdToCall} unavailable, search will find next peer`);
            state.isConnected = false;
            // Clear current connection attempt so search can continue
            if (window.app && window.app.currentConnectionAttempt === peerIdToCall) {
              window.app.currentConnectionAttempt = null;
            }
            // Don't stop local stream - we'll need it for next connection
            // Search interval will continue and find next peer automatically
            return;
          }
          
          // Other errors - also let search continue
          state.isConnected = false;
          if (window.app && window.app.currentConnectionAttempt === peerIdToCall) {
            window.app.currentConnectionAttempt = null;
          }
          // Don't show error immediately - let search continue to find next peer
        });
      } catch (err) {
        console.error(`Error initiating call to ${peerIdToCall}:`, err);
        // Don't retry same peer - let search interval find next one
        state.isConnected = false;
        // Search interval will continue and find next peer automatically
        // Don't stop local stream - we'll need it for next connection attempt
      }
    };
    
    // Start connection attempt after peer is ready
    setTimeout(attemptConnection, 1000);
  });
  
  state.peer.on("error", (err) => {
    console.error("Peer error:", err);
    
    // Ignore peer-unavailable errors - they're handled by retry logic
    if (err.type === 'peer-unavailable' || err.message?.includes('Could not connect')) {
      console.log("Peer not available - retry logic will handle this");
      // Don't show error for this, retry logic handles it
      return;
    }
    
    // For other errors, only show if we're not already handling a retry
    if (err.type !== 'peer-unavailable') {
      state.isConnected = false;
      setTimeout(() => {
        showAlert("Connection error: " + (err.message || err.type || "Unknown error"), 'error');
        if (window.app && window.app.disconnectChat) {
          window.app.disconnectChat();
        }
      }, 500);
    }
  });
}

// Send message through data connection
export function sendMessage(text, senderId) {
  if (!state.dataConnection) {
    console.warn('No data connection available');
    return false;
  }
  
  const message = {
    type: 'CHAT',
    sender: senderId,
    text: text,
    timestamp: Date.now()
  };
  
  // Check if connection is open
  if (state.dataConnection.open) {
    try {
      state.dataConnection.send(JSON.stringify(message));
      console.log('Message sent:', text);
      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      return false;
    }
  } else {
    // Wait for connection to open
    console.log('Data connection not open yet, waiting...');
    const sendWhenOpen = () => {
      if (state.dataConnection && state.dataConnection.open) {
        try {
          state.dataConnection.send(JSON.stringify(message));
          console.log('Message sent after connection opened:', text);
        } catch (err) {
          console.error('Error sending message after open:', err);
        }
      } else if (state.dataConnection) {
        // Connection still not open, wait a bit more
        state.dataConnection.once('open', sendWhenOpen);
      }
    };
    
    // Try to wait for connection
    if (state.dataConnection) {
      state.dataConnection.once('open', sendWhenOpen);
    }
    
    return true; // Return true as we're queuing it
  }
}

// Disconnect from current session
export function disconnect() {
  // Send disconnect message to peer before closing
  if (state.dataConnection && state.dataConnection.open) {
    try {
      state.dataConnection.send(JSON.stringify({ type: 'DISCONNECT' }));
    } catch (err) {
      console.warn("Could not send disconnect message:", err);
    }
  }
  
  if (state.dataConnection) {
    state.dataConnection.close();
    state.dataConnection = null;
  }
  
  if (state.call) {
    state.call.close();
    state.call = null;
  }
  
  // Mark session as available before unregistering (if it was connected)
  if (state.currentShareCode && state.isConnected) {
    markSessionAvailable(state.currentShareCode).catch(err => {
      console.warn("Failed to mark session as available:", err);
    });
  }
  
  // Destroy peer to fully clean up
  if (state.peer && !state.peer.destroyed) {
    state.peer.destroy();
    state.peer = null;
  }
  
  if (state.hostStream) {
    state.hostStream.getTracks().forEach(track => track.stop());
    state.hostStream = null;
  }
  
  // Unregister from discovery
  if (state.currentShareCode) {
    unregisterSession(state.currentShareCode);
    state.currentShareCode = null;
  }
  
  state.isConnected = false;
  state.isHosting = false;
}

