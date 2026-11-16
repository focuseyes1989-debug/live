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
  const realtimeUrl = 'https://api.sportbo.live/api/v1/matchs/realtime';
  let video;
  let hls;
  let attempt = 0;
  let stopSource = () => {};
  let activeTitle;
  let feedReady = false;
  let liveStale = false;
  let scoreFallback = false;

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
      message.textContent = scoreFallback
        ? 'ESPN · ' + count + (isLive ? ' live · ရမှတ်သာ။ Sutbong ထုတ်လွှင့်မှုစာရင်းကို ပြန်စစ်နေပါတယ်။' : ' upcoming')
        : isLive && liveStale ? 'တိုက်ရိုက်ပွဲစာရင်း အသစ်မရသေးပါ။ အလိုအလျောက် ပြန်စစ်နေပါတယ်။' : count
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

  let refreshTimer;
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
        if (!liveStale && ![8, 9, 10, 11, 12, 13].includes(state)) live.push(match);
      } else if (![8, 9, 10, 11, 12, 13].includes(state)) {
        upcoming.push(match);
      }
    }
    return {live, upcoming};
  }

  async function loadScoreFallback() {
    const day = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Yangon'}).format().replaceAll('-', '');
    const data = await readJson('https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=300&dates=' + day);
    const leagues = new Map((data.leagues || []).map(league => [league.id, league.name]));
    const live = [];
    const upcoming = [];
    for (const event of data.events) {
      const game = event.competitions?.[0];
      const home = game?.competitors.find(team => team.homeAway === 'home');
      const away = game?.competitors.find(team => team.homeAway === 'away');
      if (!home?.team?.displayName || !away?.team?.displayName) continue;
      const match = {
        title: event.name,
        home: home.team.displayName, away: away.team.displayName,
        homeLogo: home.team.logo || home.team.logos?.[0]?.href,
        awayLogo: away.team.logo || away.team.logos?.[0]?.href,
        league: leagues.get(event.league?.id || game.leagueId) || event.league?.name,
        kickoff: Date.parse(event.date) / 1000,
        homeScore: home.score, awayScore: away.score,
        clock: event.status.type.shortDetail,
      };
      if (event.status.type.state === 'in') live.push(match);
      if (event.status.type.state === 'pre') upcoming.push(match);
    }
    return {matches: live, upcoming: upcoming.sort((a, b) => a.kickoff - b.kickoff)};
  }

  async function load() {
    if (refresh.disabled) return;
    clearTimeout(refreshTimer);
    refresh.disabled = true;
    let retrySoon = true;
    try {
      const [feed, realtime] = await Promise.all([
        readJson('./sutbong-matches.json?minute=' + Math.floor(Date.now() / 60000)).catch(() => ({})),
        readJson(realtimeUrl).catch(() => null),
      ]);
      const age = Date.now() - Date.parse(feed.updated);
      liveStale = !Number.isFinite(age) || age > 45 * 60 * 1000;
      const current = Array.isArray(realtime?.result) && age <= 24 * 60 * 60 * 1000
        ? updateFromRealtime(feed, realtime.result) : null;
      let fallback;
      if (liveStale && !current?.live.length) {
        fallback = await loadScoreFallback().catch(() => null);
      }
      scoreFallback = Boolean(fallback);
      if (current?.live.length) liveStale = false;
      retrySoon = liveStale;
      const scheduled = Number.isFinite(age) && age <= 24 * 60 * 60 * 1000 ? feed.upcoming || [] : [];
      renderUpcoming(fallback?.upcoming ?? current?.upcoming ?? scheduled);
      const live = fallback?.matches ?? current?.live ?? (liveStale ? [] : feed.matches);
      list.replaceChildren(...live.map(match => {
        const button = document.createElement(scoreFallback ? 'article' : 'button');
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
        button.append(header, teams);
        if (!scoreFallback) button.append(playIcon);
        button.setAttribute('aria-label', match.title);
        button.setAttribute('aria-description', [match.league, hasScore ? score : 'Score unavailable', clock.textContent].filter(Boolean).join(', '));
        if (!scoreFallback) button.onclick = () => play(match);
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
      refreshTimer = setTimeout(load, retrySoon ? 60000 : 30000);
    }
  }
  refresh.onclick = load;
  load();
})();
