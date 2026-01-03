// ================= SESSION DISCOVERY =================
// Peer-to-peer session discovery using a fixed discovery peer

const DISCOVERY_PEER_ID = 'CODMEGLE_DISCOVERY_V1';
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const CODMEGLE_PLATFORM_ID = 'CODMEGLE_V1'; // Platform identifier to ensure only Codmegle sessions are discovered

let discoveryPeer = null;
let discoveryDataConnection = null;
let sessionRegistry = new Map(); // code -> {code, timestamp, name?}
let isDiscoveryHost = false;
let discoveryCleanupInterval = null;

// Cleanup old sessions periodically
function cleanupOldSessions() {
  const now = Date.now();
  for (const [code, session] of sessionRegistry.entries()) {
    if (now - session.timestamp > SESSION_TIMEOUT) {
      sessionRegistry.delete(code);
      console.log(`Removed stale session: ${code}`);
    }
  }
}

// Start as discovery host (maintains the registry)
export function startDiscoveryHost() {
  if (discoveryPeer) {
    return; // Already started
  }

  console.log('Attempting to start as discovery host...');

  discoveryPeer = new Peer(DISCOVERY_PEER_ID, {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  discoveryPeer.on('open', (id) => {
    console.log('Discovery host ready:', id);
    isDiscoveryHost = true; // Only set to true after successful open
    
    // Start cleanup interval
    discoveryCleanupInterval = setInterval(cleanupOldSessions, 30000); // Every 30 seconds
  });

  discoveryPeer.on('connection', (dataConnection) => {
    console.log('Discovery connection received from:', dataConnection.peer);
    
    dataConnection.on('open', () => {
      console.log('Discovery data channel open');
    });

    dataConnection.on('data', (data) => {
      try {
        const message = JSON.parse(data);
        handleDiscoveryMessage(message, dataConnection);
      } catch (err) {
        console.error('Error parsing discovery message:', err);
      }
    });

    dataConnection.on('close', () => {
      console.log('Discovery connection closed');
    });

    dataConnection.on('error', (err) => {
      console.error('Discovery connection error:', err);
    });
  });

  discoveryPeer.on('error', (err) => {
    // If ID is taken, we're not the host - that's expected, not an error
    if (err.type === 'peer-unavailable' || err.message?.includes('ID is taken') || err.type === 'unavailable-id' || err.type === 'socket-error') {
      // Silently handle - this is expected when discovery peer already exists
      isDiscoveryHost = false;
      // Don't stop the peer yet - let it clean up naturally
      // The error handler will prevent it from being used as host
    } else {
      // Only log actual unexpected errors
      console.warn('Discovery peer error (non-critical):', err.type || err.message);
    }
  });
}

// Stop discovery host
export function stopDiscoveryHost() {
  if (discoveryCleanupInterval) {
    clearInterval(discoveryCleanupInterval);
    discoveryCleanupInterval = null;
  }

  if (discoveryDataConnection) {
    discoveryDataConnection.close();
    discoveryDataConnection = null;
  }

  if (discoveryPeer) {
    discoveryPeer.destroy();
    discoveryPeer = null;
  }

  isDiscoveryHost = false;
  sessionRegistry.clear();
}

// Handle messages from clients
function handleDiscoveryMessage(message, dataConnection) {
  switch (message.type) {
    case 'register':
      // Only register if it's a Codmegle session (has platform identifier)
      if (message.platform !== CODMEGLE_PLATFORM_ID) {
        console.log('Ignoring non-Codmegle session registration:', message.code);
        break;
      }
      
      // Register a new session (only if not already registered or if re-registering)
      sessionRegistry.set(message.code, {
        code: message.code,
        timestamp: message.timestamp || Date.now(),
        name: message.name,
        platform: message.platform || CODMEGLE_PLATFORM_ID,
        mode: message.mode || 'video', // Store mode: 'text' or 'video'
        connected: false // Track if this session is already connected
      });
      console.log('Registered Codmegle session:', message.code, 'mode:', message.mode || 'video');
      
      // Send confirmation
      dataConnection.send(JSON.stringify({
        type: 'register_ack',
        code: message.code,
        success: true
      }));
      break;

    case 'mark_connected':
      // Mark a session as connected
      const connectedSession = sessionRegistry.get(message.code);
      if (connectedSession) {
        connectedSession.connected = true;
        console.log('Marked session as connected:', message.code);
      }
      break;

    case 'mark_available':
      // Mark a session as available
      const availableSession = sessionRegistry.get(message.code);
      if (availableSession) {
        availableSession.connected = false;
        console.log('Marked session as available:', message.code);
      }
      break;

    case 'unregister':
      // Unregister a session
      sessionRegistry.delete(message.code);
      console.log('Unregistered session:', message.code);
      break;

    case 'list':
      // Only send Codmegle sessions if request includes platform identifier
      const requestPlatform = message.platform || '';
      const isCodmegleRequest = requestPlatform === CODMEGLE_PLATFORM_ID;
      
      // Send list of active sessions (only Codmegle ones, available, and not connected)
      // Filter by mode if requested
      const requestMode = message.mode || null;
      const sessions = Array.from(sessionRegistry.values())
        .filter(session => {
          const isRecent = Date.now() - session.timestamp < SESSION_TIMEOUT;
          const isAvailable = !session.connected;
          const isCodmegle = (session.platform === CODMEGLE_PLATFORM_ID) || (!session.platform && isCodmegleRequest);
          // Strict mode matching - if requestMode is specified, session must have matching mode
          // Default to 'video' only if mode is not specified in request
          const sessionMode = session.mode || 'video';
          const matchingMode = !requestMode || sessionMode === requestMode;
          // Only return Codmegle sessions if request is from Codmegle, and matching mode
          return isRecent && isAvailable && isCodmegle && matchingMode;
        })
        .map(session => ({
          code: session.code,
          timestamp: session.timestamp,
          name: session.name,
          mode: session.mode || 'video' // Include mode in response
        }));
      
      dataConnection.send(JSON.stringify({
        type: 'list_response',
        sessions: sessions
      }));
      console.log('Sent Codmegle session list:', sessions.length, 'available sessions');
      break;

    default:
      console.warn('Unknown discovery message type:', message.type);
  }
}

// Track active discovery connections to prevent duplicates
let activeDiscoveryConnections = new Set();

// Connect to discovery peer as client
// mode: optional filter - 'text' or 'video' to only get sessions of that mode
export function connectToDiscovery(onSessionsReceived, mode) {
  return new Promise((resolve, reject) => {
    // First, try to start as host (in case no one else is)
    startDiscoveryHost();
    
    // Wait a bit to see if we become the host (give it time to initialize or error)
    setTimeout(() => {
      if (isDiscoveryHost) {
        // We're the host, return our registry (only Codmegle available sessions)
        // Filter by mode if provided
        const sessions = Array.from(sessionRegistry.values())
          .filter(session => {
            const isRecent = Date.now() - session.timestamp < SESSION_TIMEOUT;
            const isAvailable = !session.connected;
            const isCodmegle = session.platform === CODMEGLE_PLATFORM_ID;
            // Strict mode matching - if mode is specified, session must have matching mode
            const sessionMode = session.mode || 'video';
            const matchingMode = !mode || sessionMode === mode;
            return isRecent && isAvailable && isCodmegle && matchingMode;
          })
          .map(session => ({
            code: session.code,
            timestamp: session.timestamp,
            name: session.name,
            mode: session.mode || 'video'
          }));
        
        if (onSessionsReceived) {
          onSessionsReceived(sessions);
        }
        resolve(sessions);
        return;
      }

      // Connect as client
      const connectionId = Date.now() + Math.random();
      if (activeDiscoveryConnections.has(connectionId)) {
        // Already have an active connection, wait for it
        return;
      }
      activeDiscoveryConnections.add(connectionId);
      
      const clientPeer = new Peer({
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      clientPeer.on('open', () => {
        console.log('Connecting to discovery peer as client...');
        
        try {
          const dataConnection = clientPeer.connect(DISCOVERY_PEER_ID, {
            reliable: true
          });

          dataConnection.on('open', () => {
            console.log('Connected to discovery peer');
            discoveryDataConnection = dataConnection;

            // Request session list with Codmegle platform identifier and mode
            const listRequest = { 
              type: 'list',
              platform: CODMEGLE_PLATFORM_ID
            };
            if (mode) {
              listRequest.mode = mode; // Include mode to filter
            }
            dataConnection.send(JSON.stringify(listRequest));

            // Listen for responses
            dataConnection.on('data', (data) => {
              try {
                const message = JSON.parse(data);
                if (message.type === 'list_response') {
                  console.log('Received session list:', message.sessions.length, 'sessions');
                  // Add mode to each session if not present
                  const sessionsWithMode = message.sessions.map(s => ({
                    ...s,
                    mode: s.mode || 'video'
                  }));
                  if (onSessionsReceived) {
                    onSessionsReceived(sessionsWithMode);
                  }
                  resolve(sessionsWithMode);
                  
                  // Close connection after receiving list
                  setTimeout(() => {
                    dataConnection.close();
                    clientPeer.destroy();
                    activeDiscoveryConnections.delete(connectionId);
                  }, 1000);
                }
              } catch (err) {
                console.error('Error parsing discovery response:', err);
                activeDiscoveryConnections.delete(connectionId);
              }
            });
          });

          dataConnection.on('error', (err) => {
            console.error('Discovery data connection error:', err);
            activeDiscoveryConnections.delete(connectionId);
            reject(err);
          });

          dataConnection.on('close', () => {
            console.log('Discovery data connection closed');
            activeDiscoveryConnections.delete(connectionId);
          });

        } catch (err) {
          console.error('Error connecting to discovery peer:', err);
          activeDiscoveryConnections.delete(connectionId);
          reject(err);
        }
      });

      clientPeer.on('error', (err) => {
        console.error('Client peer error:', err);
        // If discovery peer doesn't exist, we become the host
        if (err.type === 'peer-unavailable' || err.message?.includes('Could not connect')) {
          console.log('Discovery peer not found, starting as host...');
          stopDiscoveryHost();
          startDiscoveryHost();
          
          // Return empty list since we're the first
          const sessions = [];
          if (onSessionsReceived) {
            onSessionsReceived(sessions);
          }
          resolve(sessions);
        } else {
          reject(err);
        }
      });
    }, 500);
  });
}

// Register a session with discovery service
export function registerSession(code, name, mode) {
  if (isDiscoveryHost) {
    // We're the host, add directly with Codmegle platform identifier
    sessionRegistry.set(code, {
      code: code,
      timestamp: Date.now(),
      name: name,
      platform: CODMEGLE_PLATFORM_ID,
      mode: mode || 'video', // Store mode: 'text' or 'video'
      connected: false
    });
    console.log('Registered Codmegle session locally:', code, 'mode:', mode || 'video');
    return Promise.resolve();
  }

  // Connect and register
  return new Promise((resolve, reject) => {
    const clientPeer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    clientPeer.on('open', () => {
      try {
        const dataConnection = clientPeer.connect(DISCOVERY_PEER_ID, {
          reliable: true
        });

        dataConnection.on('open', () => {
          // Send registration with Codmegle platform identifier and mode
          dataConnection.send(JSON.stringify({
            type: 'register',
            code: code,
            timestamp: Date.now(),
            name: name,
            platform: CODMEGLE_PLATFORM_ID,
            mode: mode || 'video' // Include mode in registration
          }));

          // Wait for acknowledgment
          dataConnection.on('data', (data) => {
            try {
              const message = JSON.parse(data);
              if (message.type === 'register_ack' && message.code === code) {
                console.log('Session registered:', code);
                resolve();
                
                // Keep connection open for unregister later
                // Store it for cleanup
                setTimeout(() => {
                  // Close after a short delay
                  dataConnection.close();
                  clientPeer.destroy();
                }, 100);
              }
            } catch (err) {
              console.error('Error parsing registration ack:', err);
            }
          });
        });

        dataConnection.on('error', (err) => {
          console.error('Registration connection error:', err);
          // If discovery peer doesn't exist, start as host and register
          if (err.type === 'peer-unavailable' || err.message?.includes('Could not connect')) {
            startDiscoveryHost();
            registerSession(code, name).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });

      } catch (err) {
        console.error('Error creating registration connection:', err);
        reject(err);
      }
    });

    clientPeer.on('error', (err) => {
      console.error('Registration peer error:', err);
      // If discovery peer doesn't exist, start as host
      if (err.type === 'peer-unavailable' || err.message?.includes('Could not connect')) {
        startDiscoveryHost();
        registerSession(code, name).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

// Mark a session as connected (so it won't be available for new connections)
export function markSessionConnected(code) {
  if (isDiscoveryHost) {
    // We're the host, update directly
    const session = sessionRegistry.get(code);
    if (session) {
      session.connected = true;
      console.log('Marked session as connected:', code);
    }
    return Promise.resolve();
  }

  // Connect and mark as connected
  return new Promise((resolve, reject) => {
    const clientPeer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    clientPeer.on('open', () => {
      try {
        const dataConnection = clientPeer.connect(DISCOVERY_PEER_ID, {
          reliable: true
        });

        dataConnection.on('open', () => {
          dataConnection.send(JSON.stringify({
            type: 'mark_connected',
            code: code
          }));
          
          setTimeout(() => {
            dataConnection.close();
            clientPeer.destroy();
            resolve();
          }, 500);
        });
      } catch (err) {
        clientPeer.destroy();
        reject(err);
      }
    });

    clientPeer.on('error', () => {
      clientPeer.destroy();
      resolve(); // Silently fail, don't block
    });
  });
}

// Mark a session as available (so it can accept new connections)
export function markSessionAvailable(code) {
  if (isDiscoveryHost) {
    // We're the host, update directly
    const session = sessionRegistry.get(code);
    if (session) {
      session.connected = false;
      console.log('Marked session as available:', code);
    }
    return Promise.resolve();
  }

  // Connect and mark as available
  return new Promise((resolve, reject) => {
    const clientPeer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    clientPeer.on('open', () => {
      try {
        const dataConnection = clientPeer.connect(DISCOVERY_PEER_ID, {
          reliable: true
        });

        dataConnection.on('open', () => {
          dataConnection.send(JSON.stringify({
            type: 'mark_available',
            code: code
          }));
          
          setTimeout(() => {
            dataConnection.close();
            clientPeer.destroy();
            resolve();
          }, 500);
        });
      } catch (err) {
        clientPeer.destroy();
        reject(err);
      }
    });

    clientPeer.on('error', () => {
      clientPeer.destroy();
      resolve(); // Silently fail, don't block
    });
  });
}

// Unregister a session
export function unregisterSession(code) {
  if (isDiscoveryHost) {
    // We're the host, remove directly
    sessionRegistry.delete(code);
    console.log('Unregistered session locally:', code);
    return;
  }

  // Try to connect and unregister (best effort, don't block)
    const clientPeer = new Peer({
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

  clientPeer.on('open', () => {
    try {
      const dataConnection = clientPeer.connect(DISCOVERY_PEER_ID, {
        reliable: true
      });

      dataConnection.on('open', () => {
        dataConnection.send(JSON.stringify({
          type: 'unregister',
          code: code
        }));
        
        setTimeout(() => {
          dataConnection.close();
          clientPeer.destroy();
        }, 500);
      });
    } catch (err) {
      // Silently fail
      clientPeer.destroy();
    }
  });

  clientPeer.on('error', () => {
    // Silently fail
    clientPeer.destroy();
  });
}

