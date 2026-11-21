(() => {
  const panel = document.getElementById('player-panel');
  const player = document.getElementById('player');
  const fullscreen = document.getElementById('player-fullscreen');
  const install = document.getElementById('install-kay');
  const help = document.getElementById('install-help');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  install.hidden = standalone || !(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  install.onclick = () => help.showModal();
  document.getElementById('close-install').onclick = () => help.close();

  function reset() {
    panel.classList.remove('immersive');
    fullscreen.setAttribute('aria-label', 'Fullscreen');
    fullscreen.title = 'Fullscreen';
  }
  function expandPage() {
    panel.classList.add('immersive');
    fullscreen.setAttribute('aria-label', 'Exit fullscreen');
    fullscreen.title = 'Exit fullscreen';
  }
  fullscreen.onclick = () => {
    const video = player.querySelector('video');
    if (panel.classList.contains('immersive')) { reset(); return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    // iPhone's native video API must be called directly from a user gesture.
    if (video && typeof video.webkitEnterFullscreen === 'function' && video.readyState > 0) {
      try { video.webkitEnterFullscreen(); return; } catch {}
    }
    if (video && typeof video.requestFullscreen === 'function') {
      try { video.requestFullscreen().catch(expandPage); return; } catch {}
    }
    expandPage();
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('immersive')) {
      event.preventDefault(); event.stopImmediatePropagation(); reset();
    }
  }, true);
  panel.addEventListener('close', reset);
  new MutationObserver(() => { if (!panel.open) reset(); }).observe(panel, {attributes: true, attributeFilter: ['open']});
})();
