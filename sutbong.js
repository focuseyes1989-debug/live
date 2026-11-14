(() => {
  const player = document.getElementById('player');
  const playing = document.getElementById('playing');
  const status = document.getElementById('sutbong-status');
  const list = document.getElementById('sutbong-matches');
  const controls = document.getElementById('sutbong-channels');
  const refresh = document.getElementById('sutbong-refresh');
  const roomIndex = 'https://biz.vnres.co/api/live/livingRoom';
  let video;
  let hls;
  let attempt = 0;

  function playlist(stream) {
    try {
      const url = new URL(stream);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      if (/^pull[0-9]+\.scstream\.net$/.test(url.hostname)) url.hostname = 'pull.niues.live';
      if (!['pull.niur.live', 'pull.niues.live'].includes(url.hostname)) return null;
      url.pathname = url.pathname.replace(/\.flv$/i, '.m3u8');
      return url.pathname.endsWith('.m3u8') ? url.href : null;
    } catch {
      return null;
    }
  }

  async function readJson(url) {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  async function play(match, preferred) {
    const token = ++attempt;
    hls?.destroy();
    hls = null;
    video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    const target = video;
    player.replaceChildren(target);
    playing.textContent = match.title + ' · Connecting…';
    player.scrollIntoView({ block: 'nearest' });
    try {
      const rooms = await readJson(roomIndex);
      if (token !== attempt) return;
      const routes = new Map(rooms.map(room => [String(room.id), playlist(room.stream)]));
      const channels = Object.entries(match.channels).filter(([id]) => routes.get(id));
      if (preferred) channels.sort(([a], [b]) => Number(b === preferred) - Number(a === preferred));
      controls.replaceChildren(...channels.map(([id, name]) => {
        const button = document.createElement('button');
        button.textContent = name;
        button.dataset.channel = id;
        button.onclick = () => play(match, id);
        return button;
      }));
      function tryChannel(index) {
        if (token !== attempt) return;
        hls?.destroy();
        hls = null;
        if (index >= channels.length) {
          playing.textContent = match.title + ' · Stream မရသေးပါ။ ပြန်ရွေးပြီး စမ်းပါ။';
          return;
        }
        const [id, name] = channels[index];
        for (const button of controls.children) button.setAttribute('aria-pressed', button.dataset.channel === id);
        const source = routes.get(id);
        const next = () => tryChannel(index + 1);
        target.onplaying = () => {
          if (token === attempt) playing.textContent = match.title + ' · LIVE · ' + name;
        };
        const start = () => target.play().catch(error => {
          if (token === attempt && error.name === 'NotAllowedError') playing.textContent = match.title + ' · Play နှိပ်ပါ';
        });
        if (target.canPlayType('application/vnd.apple.mpegurl')) {
          target.onerror = next;
          target.src = source;
          start();
        } else if (window.Hls?.isSupported()) {
          hls = new Hls();
          const current = hls;
          hls.on(Hls.Events.ERROR, (_, info) => { if (info.fatal && hls === current) next(); });
          hls.on(Hls.Events.MANIFEST_PARSED, start);
          hls.loadSource(source);
          hls.attachMedia(target);
        } else {
          playing.textContent = 'ဒီ browser မှာ HLS player အသုံးပြုလို့ မရပါ။';
        }
      }
      tryChannel(0);
    } catch {
      if (token === attempt) playing.textContent = 'Sutbong stream စာရင်း ယူမရသေးပါ။ ပြန်စမ်းပါ။';
    }
  }

  new MutationObserver(() => {
    if (video && !player.contains(video)) {
      ++attempt;
      hls?.destroy();
      hls = null;
      video = null;
      controls.replaceChildren();
    }
  }).observe(player, {childList: true});

  async function load() {
    refresh.disabled = true;
    try {
      const feed = await readJson('./sutbong-matches.json');
      const age = Date.now() - Date.parse(feed.updated);
      if (!Number.isFinite(age) || age > 45 * 60 * 1000) {
        list.replaceChildren();
        status.textContent = 'Sutbong Live ပွဲစာရင်း အသစ်မရသေးပါ။';
        return;
      }
      status.textContent = feed.matches.length ? feed.matches.length + ' live matches' : 'လက်ရှိ Live ပွဲမရှိပါ။';
      list.replaceChildren(...feed.matches.map(match => {
        const button = document.createElement('button');
        button.className = 'card';
        if (match.home && match.away) {
          button.append(teamLabel(match.home, match.homeLogo), teamLabel(match.away, match.awayLogo));
        } else {
          button.textContent = match.title;
        }
        button.setAttribute('aria-label', match.title);
        button.onclick = () => play(match);
        return button;
      }));
    } catch {
      status.textContent = 'Sutbong ပွဲစာရင်း ယူမရသေးပါ။';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.onclick = load;
  load();
  setInterval(load, 5 * 60 * 1000);
})();
