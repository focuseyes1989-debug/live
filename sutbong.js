(() => {
  const player = document.getElementById('player');
  const panel = document.getElementById('player-panel');
  const close = document.getElementById('close-player');
  const playerTitle = document.getElementById('player-title');
  const playing = document.getElementById('playing');
  const status = document.getElementById('sutbong-status');
  const list = document.getElementById('sutbong-matches');
  const upcomingList = document.getElementById('upcoming-matches');
  const upcomingStatus = document.getElementById('upcoming-status');
  const search = document.getElementById('match-search');
  const kickoffFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Yangon', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  });
  const controls = document.getElementById('sutbong-channels');
  const refresh = document.getElementById('sutbong-refresh');
  const roomIndex = 'https://biz.vnres.co/api/live/livingRoom';
  let video;
  let hls;
  let attempt = 0;
  let stopSource = () => {};
  let activeTitle;
  let feedReady = false;
  let liveStale = false;

  function searchText(value) {
    return value.normalize('NFKD').toLowerCase().replace(/\p{Diacritic}/gu, '');
  }

  function matchSearchText(match) {
    return searchText([match.home, match.away, match.title, match.league].filter(Boolean).join(' '));
  }

  function filterMatches() {
    if (!feedReady) return;
    const terms = searchText(search.value).trim().split(/\s+/).filter(Boolean);
    for (const [cards, message, isLive] of [[list, status, true], [upcomingList, upcomingStatus, false]]) {
      let count = 0;
      for (const card of cards.children) {
        card.hidden = !terms.every(term => card.dataset.search.includes(term));
        if (!card.hidden) count++;
      }
      message.textContent = isLive && liveStale ? 'တိုက်ရိုက်ပွဲစာရင်း အသစ်မရသေးပါ။ Refresh နှိပ်ပြီး ပြန်စမ်းပါ။' : count
        ? count + (isLive ? (count === 1 ? ' live match' : ' live matches') : ' upcoming')
        : terms.length ? 'ရှာဖွေမှုနဲ့ ကိုက်ညီတဲ့ပွဲ မတွေ့ပါ။'
        : isLive ? 'လက်ရှိ Live ပွဲမရှိပါ။' : 'လာမယ့်ပွဲ မတွေ့သေးပါ။';
    }
  }

  search.addEventListener('input', filterMatches);

  function markActiveMatch() {
    for (const card of list.children) {
      if (card.getAttribute('aria-label') === activeTitle) card.setAttribute('aria-current', 'true');
      else card.removeAttribute('aria-current');
    }
  }

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
    activeTitle = match.title;
    markActiveMatch();
    const token = ++attempt;
    stopSource();
    hls?.destroy();
    hls = null;
    controls.replaceChildren();
    video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    const target = video;
    player.replaceChildren(target);
    playerTitle.textContent = match.title;
    if (!panel.open) panel.showModal();
    playing.textContent = match.title + ' · Connecting…';
    try {
      const rooms = await readJson(roomIndex);
      if (token !== attempt) return;
      const routes = new Map(rooms.map(room => [String(room.id), playlist(room.stream)]));
      const channels = Object.entries(match.channels).filter(([id]) => routes.get(id));
      if (!channels.length) {
        playing.textContent = match.title + ' · လက်ရှိ ထုတ်လွှင့်နေတဲ့ source မရှိသေးပါ။';
        return;
      }
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
        stopSource();
        hls?.destroy();
        hls = null;
        if (index >= channels.length) {
          playing.textContent = match.title + ' · ရနိုင်တဲ့ source အားလုံးကို စမ်းပြီးပါပြီ။ Stream မရသေးပါ။';
          return;
        }
        const [id, name] = channels[index];
        for (const button of controls.children) button.setAttribute('aria-pressed', button.dataset.channel === id);
        const source = routes.get(id);
        playing.textContent = match.title + ' · ' + (index ? 'Trying another source…' : 'Connecting…') + ' · ' + name;
        let active = true;
        let timer;
        const next = () => {
          if (active && token === attempt) tryChannel(index + 1);
        };
        const startTimer = () => {
          clearTimeout(timer);
          timer = setTimeout(next, 12000);
        };
        stopSource = () => {
          active = false;
          clearTimeout(timer);
          target.onplaying = target.onwaiting = target.onerror = null;
        };
        target.onerror = next;
        target.onplaying = () => {
          clearTimeout(timer);
          playing.textContent = match.title + ' · LIVE · ' + name;
        };
        target.onwaiting = () => { if (!target.paused) startTimer(); };
        startTimer();
        const start = () => target.play().catch(error => {
          if (!active || token !== attempt) return;
          if (error.name === 'NotAllowedError') {
            clearTimeout(timer);
            playing.textContent = match.title + ' · Play နှိပ်ပါ';
          } else if (error.name !== 'AbortError') next();
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
          stopSource();
          playing.textContent = 'ဒီ browser မှာ HLS player အသုံးပြုလို့ မရပါ။';
        }
      }
      tryChannel(0);
    } catch {
      if (token === attempt) playing.textContent = 'Sutbong stream စာရင်း ယူမရသေးပါ။ ပြန်စမ်းပါ။';
    }
  }

  function closePlayer() {
    if (!panel.open) return;
    const selected = list.querySelector('[aria-current="true"]');
    ++attempt;
    stopSource();
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    player.replaceChildren();
    controls.replaceChildren();
    playing.textContent = '';
    activeTitle = undefined;
    markActiveMatch();
    panel.close();
    (selected || refresh).focus();
  }
  close.onclick = closePlayer;
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    closePlayer();
  });

  function renderUpcoming(matches) {
    const fixtures = matches.filter(match => Number.isFinite(match.kickoff) && match.kickoff * 1000 > Date.now());
    upcomingList.replaceChildren(...fixtures.map(match => {
      const card = document.createElement('article');
      card.className = 'card upcoming-card';
      card.dataset.search = matchSearchText(match);
      const league = document.createElement('span');
      league.className = 'match-league';
      league.textContent = match.league || 'Football';
      const teams = document.createElement('div');
      teams.className = 'match-teams';
      teams.append(teamLabel(match.home, match.homeLogo), teamLabel(match.away, match.awayLogo));
      const time = document.createElement('time');
      const kickoff = new Date(match.kickoff * 1000);
      time.className = 'match-kickoff';
      time.dateTime = kickoff.toISOString();
      time.textContent = kickoffFormat.format(kickoff) + ' MMT';
      card.append(league, teams, time);
      return card;
    }));
  }

  async function load() {
    refresh.disabled = true;
    try {
      const feed = await readJson('./sutbong-matches.json');
      const age = Date.now() - Date.parse(feed.updated);
      if (!Number.isFinite(age) || age > 24 * 60 * 60 * 1000) {
        feedReady = false;
        list.replaceChildren();
        upcomingList.replaceChildren();
        upcomingStatus.textContent = 'လာမယ့်ပွဲစာရင်း အသစ်မရသေးပါ။';
        status.textContent = 'Sutbong Live ပွဲစာရင်း အသစ်မရသေးပါ။';
        return;
      }
      liveStale = age > 45 * 60 * 1000;
      renderUpcoming(feed.upcoming || []);
      const live = liveStale ? [] : feed.matches;
      list.replaceChildren(...live.map(match => {
        const button = document.createElement('button');
        button.className = 'card';
        button.dataset.search = matchSearchText(match);
        const header = document.createElement('span');
        header.className = 'match-header';
        const league = document.createElement('span');
        league.className = 'match-league';
        league.textContent = match.league || 'Football';
        const clock = document.createElement('span');
        clock.className = 'match-clock';
        clock.textContent = match.halfTime ? 'HT' : match.clock || 'LIVE';
        header.append(league, clock);
        const teams = document.createElement('span');
        teams.className = 'match-teams';
        const hasScore = [match.homeScore, match.awayScore].every(score =>
          (typeof score === 'number' || typeof score === 'string') && /^\d+$/.test(String(score)));
        const score = hasScore ? match.homeScore + ' : ' + match.awayScore : '—';
        if (match.home && match.away) {
          const result = document.createElement('strong');
          result.className = 'match-score';
          result.textContent = score;
          teams.append(teamLabel(match.home, match.homeLogo), result, teamLabel(match.away, match.awayLogo));
        } else {
          teams.textContent = match.title;
        }
        const playIcon = document.createElement('span');
        playIcon.className = 'match-play';
        playIcon.setAttribute('aria-hidden', 'true');
        playIcon.textContent = '▶  Watch';
        button.append(header, teams, playIcon);
        button.setAttribute('aria-label', match.title);
        button.setAttribute('aria-description', [match.league, hasScore ? score : 'Score unavailable', clock.textContent].filter(Boolean).join(', '));
        button.onclick = () => play(match);
        return button;
      }));
      markActiveMatch();
      feedReady = true;
      filterMatches();
    } catch {
      status.textContent = 'Sutbong ပွဲစာရင်း ယူမရသေးပါ။';
      upcomingStatus.textContent = 'လာမယ့်ပွဲစာရင်း ယူမရသေးပါ။';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.onclick = load;
  load();
  setInterval(load, 5 * 60 * 1000);
})();
