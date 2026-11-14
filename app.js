const byId = id => document.getElementById(id);

const themeButton = byId('theme');
const themeKey = 'kay-shared-theme';
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  themeButton.title = label;
  themeButton.setAttribute('aria-label', label);
}
try {
  const saved = localStorage.getItem(themeKey) ?? localStorage.getItem('kay-download-theme') ?? localStorage.getItem('kay-live-theme');
  setTheme(saved === 'dark' ? 'dark' : 'light');
} catch {
  setTheme('light');
}
window.addEventListener('storage', event => {
  if (event.key === themeKey) setTheme(event.newValue === 'dark' ? 'dark' : 'light');
});
themeButton.onclick = () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(theme);
  try { localStorage.setItem(themeKey, theme); } catch {}
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
