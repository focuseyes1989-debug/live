const byId = id => document.getElementById(id);

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
