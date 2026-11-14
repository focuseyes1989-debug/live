const byId = id => document.getElementById(id);
const watch = byId('watch');
const scores = byId('scores');
const player = byId('player');
let broadcastFeed;
let scoresLoaded = false;

function showView(isWatch) {
  watch.setAttribute('aria-pressed', isWatch);
  scores.setAttribute('aria-pressed', !isWatch);
  byId('watch-view').hidden = !isWatch;
  byId('scores-view').hidden = isWatch;
  if (!isWatch) {
    const prompt = document.createElement('p');
    prompt.textContent = 'ကြည့်လိုတဲ့ ထုတ်လွှင့်မှုကို ရွေးပါ';
    player.replaceChildren(prompt);
    byId('playing').textContent = '';
    if (!scoresLoaded) refreshScores();
  }
}
watch.onclick = () => showView(true);
scores.onclick = () => showView(false);

function play(item) {
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + item.id + '?playsinline=1';
  frame.title = item.title;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  player.replaceChildren(frame);
  byId('playing').textContent = item.title + ' · ' + item.channel;
  player.scrollIntoView({ block: 'nearest' });
}

function renderBroadcasts() {
  if (!broadcastFeed) return;
  const selected = byId('channel').value;
  const age = Date.now() - Date.parse(broadcastFeed.updated);
  const fresh = Number.isFinite(age) && age < 90 * 60 * 1000;
  const items = broadcastFeed.videos.filter(item =>
    /^[A-Za-z0-9_-]{11}$/.test(item.id) && (!selected || selected === item.channel));
  const rank = {live: 0, upcoming: 1, replay: 2};
  items.sort((a, b) => rank[a.state] - rank[b.state]);
  const live = fresh ? items.filter(item => item.state === 'live').length : 0;
  const status = !fresh ? 'ထုတ်လွှင့်မှုစာရင်း နောက်ဆုံးရအခြေအနေကို စစ်ဆေးနေဆဲပါ။'
    : live ? live + ' live broadcasts'
    : 'လက်ရှိ ရွေးထားတဲ့ channel တွေမှာ Live မရှိသေးပါ။ ပွဲဟောင်းတွေ ပြန်ကြည့်နိုင်ပါတယ်။';
  byId('broadcast-status').textContent = status + (broadcastFeed.unavailable?.length ? ' Channel အချို့ရဲ့စာရင်း ယူမရသေးပါ။' : '');
  byId('broadcasts').replaceChildren(...items.map(item => {
    const button = document.createElement('button');
    button.className = 'card';
    const image = document.createElement('img');
    image.src = 'https://i.ytimg.com/vi/' + item.id + '/mqdefault.jpg';
    image.loading = 'lazy';
    image.alt = '';
    const title = document.createElement('b');
    title.textContent = item.title;
    const label = document.createElement('small');
    label.textContent = item.channel + ' · ' + (fresh ? ({live:'LIVE', upcoming:'Upcoming', replay:'Replay'}[item.state] || '') : 'Broadcast');
    button.append(image, title, label);
    button.onclick = () => play(item);
    return button;
  }));
}

async function loadBroadcasts() {
  try {
    const response = await fetch('./broadcasts.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Feed unavailable');
    broadcastFeed = await response.json();
    renderBroadcasts();
  } catch {
    byId('broadcast-status').textContent = 'ထုတ်လွှင့်မှုစာရင်း ယူမရသေးပါ။ စာမျက်နှာကို refresh ပြန်လုပ်ပါ။';
  }
}
byId('channel').onchange = renderBroadcasts;

async function refreshScores() {
  const status = byId('scores-status');
  const refresh = byId('refresh');
  refresh.disabled = true;
  status.textContent = 'ပွဲစဉ်စာရင်း ယူနေပါတယ်…';
  try {
    const date = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Yangon'}).format().replaceAll('-', '');
    const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=300&dates=' + date;
    const response = await fetch(url, {signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Scores unavailable');
    const {events} = await response.json();
    const order = {in:0, pre:1, post:2};
    events.sort((a,b) => (order[a.status?.type?.state] ?? 3) - (order[b.status?.type?.state] ?? 3) || Date.parse(a.date) - Date.parse(b.date));
    byId('fixtures').replaceChildren(...events.map(event => {
      const card = document.createElement('article');
      card.className = 'card';
      const title = document.createElement('b');
      title.textContent = event.name;
      const detail = document.createElement('small');
      const teams = event.competitions?.[0]?.competitors || [];
      const score = event.status?.type?.state !== 'pre' && teams.length === 2 ? teams.map(team => team.score ?? '–').join(' : ') + ' · ' : '';
      detail.textContent = score + (event.status?.type?.shortDetail || '');
      card.append(title, detail);
      return card;
    }));
    status.textContent = events.length ? events.length + ' matches · ESPN · Myanmar time' : 'ယနေ့ ပွဲစဉ် မတွေ့ပါ။';
    scoresLoaded = true;
  } catch {
    status.textContent = 'ESPN ပွဲစဉ်စာရင်း ယူမရသေးပါ။ Refresh နှိပ်ပြီး ပြန်စမ်းပါ။';
  } finally {
    refresh.disabled = false;
  }
}
byId('refresh').onclick = refreshScores;
loadBroadcasts();
setInterval(loadBroadcasts, 5 * 60 * 1000);
