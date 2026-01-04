// Messaging functionality
import { sendMessage as sendP2PMessage } from '../hosting.js';
import { showAlert } from '../alert.js';
import { connectToDiscovery } from '../discovery.js';
import { state } from '../state.js';

export function setupChatMethods(app) {
    app.sendMessage = function() {
        const text = this.el.msgInput.value.trim();
        if (!text || this.status !== 'connected' || !state.isConnected) return;

        const msgPayload = {
            type: 'CHAT',
            sender: this.user.uid,
            text: text,
            timestamp: Date.now()
        };

        this.appendMessage(msgPayload);

        if (!sendP2PMessage(text, this.user.uid)) {
            showAlert("Message could not be sent. Connection may be lost.", 'warning');
        }

        this.el.msgInput.value = '';
    };

    app.appendMessage = function(msg) {
        const isMe = msg.sender === this.user.uid;
        const div = document.createElement('div');
        div.className = `message-bubble flex ${isMe ? 'justify-end' : 'justify-start'} mb-4`;
        
        const time = new Date(msg.timestamp);
        const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        
        div.innerHTML = `
            <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%] md:max-w-[65%] lg:max-w-[70%]">
                <div class="flex items-center gap-2 mb-1.5 px-1">
                    <span class="text-xs font-semibold ${isMe ? 'text-blue-600' : 'text-gray-600'}">${isMe ? 'You' : 'Stranger'}</span>
                    <span class="text-xs text-gray-400">${timeStr}</span>
                </div>
                <div class="px-4 py-3 rounded-2xl shadow-lg ${isMe ? 'bg-gradient-message-you text-white rounded-br-sm' : 'bg-gradient-message-stranger text-gray-800 border border-gray-200 rounded-bl-sm'}">
                    <p class="break-words text-sm md:text-base leading-relaxed">${this.escapeHtml(msg.text)}</p>
                </div>
            </div>
        `;
        this.el.messagesContainer.appendChild(div);
        this.el.messagesContainer.scrollTop = this.el.messagesContainer.scrollHeight;
        
        if (window.lucide) {
            lucide.createIcons();
        }
    };

    app.escapeHtml = function(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    };
    
    app.updateOnlineCount = async function() {
        try {
            const allSessions = await connectToDiscovery();
            const validSessions = allSessions.filter(s => s.code && s.code.length === 5);
            const count = validSessions.length;
            this.el.onlineCount.innerText = count > 0 ? count.toLocaleString() + ' online' : 'Connecting...';
        } catch (err) {
            console.warn("Error updating online count:", err);
            this.el.onlineCount.innerText = '... online';
        }
    };
}

