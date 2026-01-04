// Profile management
import { state } from '../state.js';

export function setupProfileMethods(app) {
    app.loadMyProfile = function() {
        // Load profile from localStorage or create default
        const savedProfile = localStorage.getItem('codmegle_profile');
        if (savedProfile) {
            this.myProfile = JSON.parse(savedProfile);
        } else {
            // Create default profile
            this.myProfile = {
                username: 'User' + this.user.uid.substr(-4),
                age: null,
                location: null,
                interests: null,
                joined: new Date().toISOString()
            };
            localStorage.setItem('codmegle_profile', JSON.stringify(this.myProfile));
        }
    };
    
    app.sendProfile = function() {
        // Send profile to connected peer
        if (!state.dataConnection || !this.myProfile) {
            return;
        }
        
        const profileMessage = {
            type: 'PROFILE',
            profile: this.myProfile,
            timestamp: Date.now()
        };
        
        if (state.dataConnection.open) {
            try {
                state.dataConnection.send(JSON.stringify(profileMessage));
                console.log('Sent profile to peer');
            } catch (err) {
                console.error('Error sending profile:', err);
            }
        } else {
            // Wait for connection to open
            const sendWhenOpen = () => {
                if (state.dataConnection && state.dataConnection.open) {
                    try {
                        state.dataConnection.send(JSON.stringify(profileMessage));
                        console.log('Sent profile after connection opened');
                    } catch (err) {
                        console.error('Error sending profile after open:', err);
                    }
                } else if (state.dataConnection) {
                    state.dataConnection.once('open', sendWhenOpen);
                }
            };
            if (state.dataConnection) {
                state.dataConnection.once('open', sendWhenOpen);
            }
        }
    };
    
    app.showProfile = function() {
        if (!this.strangerProfile && !this.myProfile) {
            return;
        }
        
        const profile = this.strangerProfile || this.myProfile;
        const modal = this.el.profileModal;
        
        if (!modal) return;
        
        // Update modal content
        const avatarText = document.getElementById('profile-avatar-text');
        const profileName = document.getElementById('profile-name');
        const profileStatus = document.getElementById('profile-status');
        const profileUsername = document.getElementById('profile-username');
        const profileAge = document.getElementById('profile-age');
        const profileLocation = document.getElementById('profile-location');
        const profileInterests = document.getElementById('profile-interests');
        const profileJoined = document.getElementById('profile-joined');
        
        // Set avatar initial
        const name = profile.username || 'Stranger';
        avatarText.textContent = name.charAt(0).toUpperCase();
        
        // Set profile information
        profileName.textContent = this.strangerProfile ? 'Stranger' : 'Your Profile';
        profileStatus.textContent = this.strangerProfile ? 'Online' : 'You';
        profileUsername.textContent = profile.username || 'Unknown';
        profileAge.textContent = profile.age ? profile.age + ' years old' : 'Not specified';
        profileLocation.textContent = profile.location || 'Not specified';
        profileInterests.textContent = profile.interests || 'Not specified';
        
        // Format joined date
        if (profile.joined) {
            const joinedDate = new Date(profile.joined);
            const now = new Date();
            const diffDays = Math.floor((now - joinedDate) / (1000 * 60 * 60 * 24));
            if (diffDays === 0) {
                profileJoined.textContent = 'Today';
            } else if (diffDays === 1) {
                profileJoined.textContent = 'Yesterday';
            } else if (diffDays < 7) {
                profileJoined.textContent = diffDays + ' days ago';
            } else {
                profileJoined.textContent = joinedDate.toLocaleDateString();
            }
        } else {
            profileJoined.textContent = 'Just now';
        }
        
        // Show modal
        modal.classList.add('active');
        
        // Re-initialize icons
        if (window.lucide) {
            lucide.createIcons();
        }
    };
    
    app.closeProfile = function(event) {
        if (event && event.target !== event.currentTarget && !event.target.closest('.profile-close-btn')) {
            return;
        }
        
        const modal = this.el.profileModal;
        if (modal) {
            modal.classList.remove('active');
        }
    };
    
    app.updateStrangerStatus = function(profile) {
        if (profile && profile.username) {
            this.el.strangerStatus.textContent = profile.username;
        } else {
            this.el.strangerStatus.textContent = 'Stranger';
        }
    };
    
    app.handleProfileReceived = function(profile) {
        // Store stranger's profile
        this.strangerProfile = profile;
        
        // Update stranger status
        this.updateStrangerStatus(profile);
        
        // Enable profile button
        if (this.el.profileBtn) {
            this.el.profileBtn.disabled = false;
        }
        
        console.log('Received profile from stranger:', profile);
    };
}

