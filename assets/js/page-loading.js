document.documentElement.classList.add('is-loading');
window.addEventListener('load', () => {
  document.documentElement.classList.remove('is-loading');
}, { once: true });
