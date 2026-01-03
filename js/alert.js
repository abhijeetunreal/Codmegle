// Alert/notification system

export function showAlert(message, type = 'info') {
  // Create alert element
  const alert = document.createElement('div');
  alert.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 max-w-md ${
    type === 'error' ? 'bg-red-100 border-l-4 border-red-500 text-red-700' :
    type === 'warning' ? 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700' :
    type === 'success' ? 'bg-green-100 border-l-4 border-green-500 text-green-700' :
    'bg-blue-100 border-l-4 border-blue-500 text-blue-700'
  }`;
  
  alert.innerHTML = `
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium">${escapeHtml(message)}</p>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-gray-500 hover:text-gray-700">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    </div>
  `;
  
  document.body.appendChild(alert);
  
  // Re-initialize icons
  if (window.lucide) {
    lucide.createIcons();
  }
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (alert.parentElement) {
      alert.remove();
    }
  }, 5000);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

