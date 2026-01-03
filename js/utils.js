// Utility functions

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

