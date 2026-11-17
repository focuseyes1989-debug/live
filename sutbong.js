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
  const localZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localZoneLabels = {
    'Asia/Yangon': 'Myanmar Time',
    'Asia/Rangoon': 'Myanmar Time',
    'Asia/Bangkok': 'Thailand Time',
  };
  const zoneLabel = localZoneLabels[localZone];
  const kickoffFormat = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    ...(zoneLabel ? {} : {timeZoneName: 'long'}),
  });
  const controls = document.getElementById('sutbong-channels');
  const refresh = document.getElementById('sutbong-refresh');
  const roomIndex = 'https://biz.vnres.co/api/live/livingRoom';
  const realtimeUrl = 'https://api.sportbo.live/api/v1/matchs/realtime';
  const catalogUrl = document.querySelector('meta[name="sutbong-catalog"]')?.content;
  const tvSection = document.getElementById('myanmar-tv');
  const tvList = document.getElementById('myanmar-tv-channels');
  const tvStatus = document.getElementById('myanmar-tv-status');
  const tvNav = document.getElementById('myanmar-tv-nav');
  const watchNav = document.getElementById('watch');
  const dataProgress = document.getElementById('data-progress');
  const dataProgressDetail = document.getElementById('data-progress-detail');
  let tvLoaded = false;
  let tvLoading = false;
  let tvTrigger;
  let video;
  let hls;
  let attempt = 0;
  let stopSource = () => {};
  let activeTitle;
  let feedReady = false;
  let liveStale = false;
  let savedCatalogTime;
  const availableStreams = new Set();

  function showDataProgress(detail) {
    if (panel.open || dataProgress.open) return () => {};
    dataProgressDetail.textContent = detail;
    dataProgress.showModal();
    return () => { if (dataProgress.open && dataProgressDetail.textContent === detail) dataProgress.close(); };
  }

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
      const summary = count
        ? count + (isLive ? (count === 1 ? ' live match' : ' live matches') : ' upcoming')
        : terms.length ? 'ရှာဖွေမှုနဲ့ ကိုက်ညီတဲ့ပွဲ မတွေ့ပါ။'
        : isLive ? 'လက်ရှိ Live ပွဲမရှိပါ။' : 'လာမယ့်ပွဲ မတွေ့သေးပါ။';
      message.textContent = isLive && savedCatalogTime
        ? summary + ' · နောက်ဆုံးရရှိချိန် ' + kickoffFormat.format(savedCatalogTime)
        : isLive && liveStale ? 'တိုက်ရိုက်ပွဲစာရင်း အသစ်မရသေးပါ။ အလိုအလျောက် ပြန်စစ်နေပါတယ်။'
        : summary;
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

  async function readJson(url, timeout = 12000) {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }

  function matchingRooms(rooms, match) {
    return Array.isArray(rooms) ? rooms.filter(room =>
      Object.hasOwn(match.channels || {}, String(room?.id)) && playlist(room?.stream)) : [];
  }

  async function backendRooms(match) {
    if (!catalogUrl || !/^\d+$/.test(match.id)) return [];
    const endpoint = new URL('/rooms.json', catalogUrl);
    endpoint.searchParams.set('match', match.id);
    return matchingRooms(await readJson(endpoint, 6000), match);
  }

  function showStreamAvailability(card, available) {
    const label = card.querySelector('.match-play');
    label.classList.toggle('waiting', !available);
    label.textContent = available ? '▶  Watch' : 'Stream စောင့်နေပါတယ်';
    card.setAttribute('aria-disabled', String(!available));
  }

  async function checkStreams(entries) {
    if (!entries.length) return;
    const directory = await readJson(roomIndex, 3000).catch(() => null);
    for (let offset = 0; offset < entries.length; offset += 4) {
      await Promise.all(entries.slice(offset, offset + 4).map(async ([match, card]) => {
        if (!card.isConnected) return;
        const available = matchingRooms(directory, match).length > 0 ||
          (await backendRooms(match).catch(() => [])).length > 0;
        if (!card.isConnected) return;
        if (available) availableStreams.add(match.id);
        else availableStreams.delete(match.id);
        showStreamAvailability(card, available);
      }));
    }
  }

  function openPlayer(title) {
    const token = ++attempt;
    stopSource();
    hls?.destroy();
    hls = null;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    controls.replaceChildren();
    video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    player.replaceChildren(video);
    playerTitle.textContent = title;
    if (!panel.open) panel.showModal();
    return {token, target: video};
  }

  async function play(match, preferred) {
    tvTrigger = undefined;
    activeTitle = match.title;
    markActiveMatch();
    const {token, target} = openPlayer(match.title);
    playing.textContent = match.title + ' · Connecting…';
    try {
      let rooms = matchingRooms(await readJson(roomIndex, catalogUrl ? 4000 : 12000).catch(() => null), match);
      if (token !== attempt) return;
      const usedWorker = !rooms.length && Boolean(catalogUrl);
      if (usedWorker) rooms = await backendRooms(match);
      if (token !== attempt) return;
      const routes = new Map(rooms.map(room => [String(room.id), playlist(room.stream)]));
      const channels = Object.entries(match.channels).filter(([id]) => routes.get(id));
      if (!channels.length) {
        playing.textContent = match.title + ' · လက်ရှိ ထုတ်လွှင့်နေတဲ့ source မရှိသေးပါ။';
        return;
      }
      const priority = id => (id === preferred ? 2 : 0) +
        (usedWorker && new URL(routes.get(id)).hostname === 'pull.niur.live' ? 1 : 0);
      if (preferred || usedWorker) channels.sort(([a], [b]) => priority(b) - priority(a));
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
        playSource(target, token, source, () => tryChannel(index + 1), match.title + ' · LIVE · ' + name);
      }
      tryChannel(0);
    } catch {
      if (token === attempt) playing.textContent = 'Sutbong stream စာရင်း ယူမရသေးပါ။ ပြန်စမ်းပါ။';
    }
  }

  function playSource(target, token, source, onFailure, liveText) {
    let active = true;
    let timer;
    const next = () => {
      if (active && token === attempt) onFailure();
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
      playing.textContent = liveText;
    };
    target.onwaiting = () => { if (!target.paused) startTimer(); };
    startTimer();
    const start = () => target.play().catch(error => {
      if (!active || token !== attempt) return;
      if (error.name === 'NotAllowedError') {
        clearTimeout(timer);
        playing.textContent = playerTitle.textContent + ' · Play နှိပ်ပါ';
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

  function playTv(channel, trigger) {
    tvTrigger = trigger;
    const {token, target} = openPlayer(channel.name);
    const routes = [channel.stream, ...(channel.fallbacks || [])];
    const sourceLink = document.createElement('a');
    sourceLink.id = 'myanmar-tv-source';
    sourceLink.href = channel.id === 'mrtv4'
      ? 'https://www.pyoneplay.com/livetv/01gt74kf63194hkch7pbsp46he'
      : 'https://www.myanmartvchannels.com/channels/' + channel.id + '/';
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = 'Open channel website';
    controls.append(sourceLink);

    function tryRoute(index) {
      if (token !== attempt) return;
      stopSource();
      hls?.destroy();
      hls = null;
      target.pause();
      target.removeAttribute('src');
      target.load();
      if (index >= routes.length) {
        playing.textContent = 'Channel stream ဖွင့်မရသေးပါ။ Channel website မှာ ကြည့်နိုင်ပါတယ်။';
        return;
      }
      playing.textContent = index ? 'Trying another source…' : 'Connecting…';
      playSource(target, token, routes[index], () => tryRoute(index + 1), channel.name + ' · LIVE');
    }
    tryRoute(0);
  }

  async function loadTvChannels() {
    if (tvLoaded || tvLoading) return;
    tvLoading = true;
    tvStatus.textContent = 'Channel စာရင်း ယူနေပါတယ်…';
    const endProgress = showDataProgress('Myanmar TV channel စာရင်း');
    try {
      const channels = await readJson('./myanmar-tv-channels.json');
      tvList.replaceChildren(...channels.map(channel => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'card';
        const logo = document.createElement('img');
        logo.src = './tv-channels/' + channel.id + '.webp';
        logo.alt = '';
        logo.loading = 'lazy';
        const name = document.createElement('strong');
        name.textContent = channel.name;
        const label = document.createElement('small');
        label.textContent = 'Watch live';
        card.append(logo, name, label);
        card.onclick = () => playTv(channel, card);
        return card;
      }));
      tvStatus.textContent = channels.length + ' channels';
      tvLoaded = true;
    } catch {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.onclick = loadTvChannels;
      tvStatus.replaceChildren('Channel စာရင်း ယူမရသေးပါ။ ', retry);
    } finally {
      tvLoading = false;
      endProgress();
    }
  }

  function renderView() {
    const tv = location.hash === '#myanmar-tv';
    tvSection.hidden = !tv;
    document.getElementById('watch-view').hidden = tv;
    document.getElementById('football-heading').hidden = tv;
    search.closest('.header-search').hidden = tv;
    (tv ? tvNav : watchNav).setAttribute('aria-current', 'page');
    (tv ? watchNav : tvNav).removeAttribute('aria-current');
    if (tv) loadTvChannels();
  }
  window.addEventListener('hashchange', renderView);
  renderView();

  function closePlayer() {
    if (!panel.open) return;
    const selected = tvTrigger || list.querySelector('[aria-current="true"]');
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
    tvTrigger = undefined;
    (selected || refresh).focus();
  }
  close.onclick = closePlayer;
  panel.addEventListener('cancel', event => {
    event.preventDefault();
    closePlayer();
  });

  let countdowns = [];
  function tickCountdowns(now = Date.now()) {
    for (const {label, kickoff} of countdowns) {
      const seconds = Math.ceil((kickoff - now) / 1000);
      if (seconds <= 0) {
        label.textContent = 'Awaiting live status';
        continue;
      }
      const days = Math.floor(seconds / 86400);
      const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
        .map(value => String(value).padStart(2, '0')).join(':');
      label.textContent = 'Starts in ' + (days ? days + 'd ' : '') + clock;
    }
  }

  function renderUpcoming(matches) {
    const fixtures = matches.filter(match => Number.isFinite(match.kickoff) && match.kickoff * 1000 > Date.now());
    countdowns = [];
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
      time.textContent = kickoffFormat.format(kickoff) + (zoneLabel ? ' ' + zoneLabel : '');
      const timing = document.createElement('div');
      timing.className = 'match-timing';
      const label = document.createElement('span');
      label.className = 'match-countdown';
      countdowns.push({label, kickoff: kickoff.getTime()});
      timing.append(label, time);
      card.append(league, teams, timing);
      return card;
    }));
    tickCountdowns();
  }

  let refreshTimer;
  let lastCatalog;

  function catalogAge(feed) {
    return Date.now() - Date.parse(feed?.updated);
  }

  async function readCatalog() {
    const snapshotUrl = './sutbong-matches.json?minute=' + Math.floor(Date.now() / 60000);
    if (catalogUrl) {
      const fresh = await readJson(catalogUrl, 8500).catch(() => null);
      const age = catalogAge(fresh);
      if (Array.isArray(fresh?.matches) && Array.isArray(fresh.upcoming) &&
          age >= -60000 && age < 120000) {
        lastCatalog = fresh;
        return {feed: fresh, backup: false};
      }
    }
    const snapshot = await readJson(snapshotUrl, 5000).catch(() => null);
    const previousAge = catalogAge(lastCatalog);
    const snapshotAge = catalogAge(snapshot);
    const keepPrevious = previousAge >= -60000 && previousAge < 5 * 60000 &&
      (!Number.isFinite(snapshotAge) || previousAge < snapshotAge);
    return {feed: (keepPrevious ? lastCatalog : snapshot) || {}, backup: true};
  }
  function updateFromRealtime(feed, rows) {
    const scores = new Map(rows.filter(row => Array.isArray(row.score)).map(row => [String(row.id), row.score]));
    const originalLive = feed.matches || [];
    const live = [];
    const upcoming = [];
    for (const match of [...originalLive, ...(feed.upcoming || [])]) {
      const score = scores.get(String(match.scoreId));
      const state = Number(score?.[1]);
      const kickoffAge = Date.now() - match.kickoff * 1000;
      if ([2, 3, 4, 5, 7].includes(state) && kickoffAge >= -120000 && kickoffAge <= 4 * 3600000) {
        if (Object.keys(match.channels || {}).length) {
          live.push({
            ...match, homeScore: score[2]?.[0], awayScore: score[3]?.[0],
            halfTime: state === 3, clock: liveStale ? null : match.clock,
          });
        }
      } else if (originalLive.includes(match)) {
        if (![8, 9, 10, 11, 12, 13].includes(state)) live.push({...match, stale: liveStale});
      } else if (![8, 9, 10, 11, 12, 13].includes(state)) {
        upcoming.push(match);
      }
    }
    return {live, upcoming};
  }

  async function loadEspnScores() {
    const day = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Yangon'}).format().replaceAll('-', '');
    const data = await readJson('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=300&dates=' + day, 5000);
    return (data.events || []).flatMap(event => {
      const game = event.competitions?.[0];
      const home = game?.competitors?.find(team => team.homeAway === 'home');
      const away = game?.competitors?.find(team => team.homeAway === 'away');
      const type = event.status?.type;
      const kickoff = Date.parse(event.date) / 1000;
      if (!home?.team?.displayName || !away?.team?.displayName || !type || !Number.isFinite(kickoff)) return [];
      return [{home: home.team.displayName, away: away.team.displayName, kickoff,
        state: type.state, clock: type.shortDetail, halfTime: type.name === 'STATUS_HALFTIME',
        homeScore: home.score, awayScore: away.score}];
    });
  }

  function scoreTeam(name) {
    return searchText(name).replace(/[^\p{L}\p{N}]/gu, '');
  }

  function matchEspnScore(match, scores) {
    if (!match.home || !match.away || !Number.isFinite(Number(match.kickoff))) return null;
    const home = scoreTeam(match.home), away = scoreTeam(match.away);
    const matches = scores.flatMap(score => {
      if (Math.abs(match.kickoff - score.kickoff) > 15 * 60) return [];
      const first = scoreTeam(score.home), second = scoreTeam(score.away);
      if (home === first && away === second) return [score];
      if (home === second && away === first) return [{...score, homeScore: score.awayScore, awayScore: score.homeScore}];
      return [];
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function mergeEspn(catalog, scores, stale) {
    const live = [];
    const upcoming = [];
    for (const [matches, listedLive] of [[catalog.live, true], [catalog.upcoming, false]]) {
      for (const match of matches) {
        const score = matchEspnScore(match, scores);
        if (score?.state === 'post') continue;
        if (score?.state === 'in') {
          const {homeScore, awayScore, clock, halfTime} = score;
          live.push({...match, homeScore: homeScore ?? match.homeScore, awayScore: awayScore ?? match.awayScore, clock, halfTime});
        } else if (listedLive && !stale && !match.stale) {
          live.push(match);
        } else if (!listedLive) {
          upcoming.push(match);
        }
      }
    }
    return {live, upcoming};
  }

  async function load(showProgress = false) {
    if (refresh.disabled) return;
    clearTimeout(refreshTimer);
    const endProgress = showProgress && tvSection.hidden
      ? showDataProgress('Live နဲ့ လာမယ့်ပွဲစာရင်း') : () => {};
    refresh.disabled = true;
    let retrySoon = true;
    try {
      const [{feed, backup}, realtime, scores] = await Promise.all([
        readCatalog(),
        readJson(realtimeUrl, 5000).catch(() => null),
        loadEspnScores().catch(() => []),
      ]);
      const age = catalogAge(feed);
      liveStale = !Number.isFinite(age) || age > 45 * 60 * 1000;
      const current = Array.isArray(realtime?.result) && age <= 24 * 60 * 60 * 1000
        ? updateFromRealtime(feed, realtime.result) : null;
      savedCatalogTime = backup && Number.isFinite(age) ? new Date(feed.updated) : null;
      const recentCatalog = Number.isFinite(age) && age <= 24 * 60 * 60 * 1000;
      const listed = {live: recentCatalog ? feed.matches || [] : [], upcoming: recentCatalog ? feed.upcoming || [] : []};
      const {live, upcoming} = mergeEspn(current || listed, scores, liveStale && !current);
      retrySoon = backup || liveStale || live.some(match => !availableStreams.has(match.id));
      renderUpcoming(upcoming);
      const liveIds = new Set(live.map(match => match.id));
      for (const id of availableStreams) if (!liveIds.has(id)) availableStreams.delete(id);
      const entries = live.map(match => {
        const button = document.createElement('button');
        button.type = 'button';
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
        button.append(header, teams, playIcon);
        showStreamAvailability(button, availableStreams.has(match.id));
        button.setAttribute('aria-label', match.title);
        button.setAttribute('aria-description', [match.league, hasScore ? score : 'Score unavailable', clock.textContent].filter(Boolean).join(', '));
        button.onclick = () => { if (availableStreams.has(match.id)) play(match); };
        return [match, button];
      });
      list.replaceChildren(...entries.map(([, card]) => card));
      void checkStreams(entries);
      markActiveMatch();
      feedReady = true;
      filterMatches();
    } catch {
      status.textContent = 'Sutbong ပွဲစာရင်း ယူမရသေးပါ။';
      upcomingStatus.textContent = 'လာမယ့်ပွဲစာရင်း ယူမရသေးပါ။';
    } finally {
      refresh.disabled = false;
      endProgress();
      refreshTimer = setTimeout(load, retrySoon ? 10000 : 30000);
    }
  }
  refresh.onclick = () => load(true);
  setInterval(() => tickCountdowns(), 1000);
  load(true);
})();
