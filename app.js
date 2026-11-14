const byId = id => document.getElementById(id);
const watch = byId('watch');
const scores = byId('scores');
const player = byId('player');
let scoresLoaded = false;

const themeButton = byId('theme');
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === 'light' ? 'Dark theme' : 'Light theme';
}
try { setTheme(localStorage.getItem('kay-live-theme') === 'light' ? 'light' : 'dark'); }
catch { setTheme('dark'); }
themeButton.onclick = () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(theme);
  try { localStorage.setItem('kay-live-theme', theme); } catch {}
};

function teamLabel(name, logo) {
  const team = document.createElement('span');
  team.className = 'team';
  const crest = document.createElement('span');
  crest.className = 'crest';
  crest.setAttribute('aria-hidden', 'true');
  crest.textContent = (name || '?').trim().slice(0, 2).toUpperCase();
  if (typeof logo === 'string' && logo.startsWith('https://')) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.onerror = () => image.remove();
    image.src = logo;
    crest.append(image);
  }
  const label = document.createElement('span');
  label.textContent = name;
  team.append(crest, label);
  return team;
}

function showView(isWatch) {
  watch.setAttribute('aria-pressed', isWatch);
  scores.setAttribute('aria-pressed', !isWatch);
  byId('watch-view').hidden = !isWatch;
  byId('scores-view').hidden = isWatch;
  if (!isWatch) {
    const prompt = document.createElement('p');
    prompt.textContent = 'ကြည့်လိုတဲ့ ပွဲကို ရွေးပါ';
    player.replaceChildren(prompt);
    byId('playing').textContent = '';
    if (!scoresLoaded) refreshScores();
  }
}
watch.onclick = () => showView(true);
scores.onclick = () => showView(false);

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
      const detail = document.createElement('small');
      const teams = event.competitions?.[0]?.competitors || [];
      for (const competitor of teams) {
        const team = competitor.team || {};
        card.append(teamLabel(team.displayName || team.name || 'Team', team.logo || team.logos?.[0]?.href));
      }
      if (!teams.length) {
        const title = document.createElement('b');
        title.textContent = event.name;
        card.append(title);
      }
      const score = event.status?.type?.state !== 'pre' && teams.length === 2 ? teams.map(team => team.score ?? '–').join(' : ') + ' · ' : '';
      detail.textContent = score + (event.status?.type?.shortDetail || '');
      card.append(detail);
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
