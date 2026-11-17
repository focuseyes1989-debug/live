const webOrigin = 'https://focuseyes1989-debug.github.io';
const source = 'https://sutbong.pro/';
const roomDirectory = 'https://biz.vnres.co/api/live/livingRoom';
const responseHeaders = {
  'Access-Control-Allow-Origin': webOrigin,
  'Cache-Control': 'public, max-age=20',
  'X-Content-Type-Options': 'nosniff',
};

export function parseCatalog(html, now = Date.now()) {
  const json = html.match(/<script\b[^>]*\bid=["']matches-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!json) throw new Error('Missing match catalog');
  const rows = JSON.parse(json[1]);
  if (!Array.isArray(rows)) throw new Error('Invalid match catalog');
  const matches = [];
  const upcoming = [];
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.postid ?? '');
    const home = row.home_name;
    const away = row.away_name;
    if (String(row.sport_id) !== '1' || !/^\d+$/.test(id) || seen.has(id) ||
        typeof home !== 'string' || !home || typeof away !== 'string' || !away) continue;
    const details = row.match_data || {};
    const channels = {};
    for (const anchor of details.anchors || []) {
      const channelId = String(anchor.uid || anchor.id || '');
      if (/^\d+$/.test(channelId)) channels[channelId] = anchor.nickName || 'Commentator';
    }
    const kickoff = Number(row.time) || null;
    const state = String(row.status_id);
    const match = {
      id, scoreId: row.ls_id, kickoff, channels, home, away, title: home + ' vs ' + away,
      homeLogo: row.home_logo, awayLogo: row.away_logo,
      league: details.competition_full || details.competition_vi,
    };
    if (['1', 'true'].includes(String(row.is_live).toLowerCase()) && Object.keys(channels).length) {
      matches.push({...match, homeScore: row.home_score, awayScore: row.away_score, halfTime: state === '3'});
    } else if (['0', '1'].includes(state) && kickoff * 1000 > now) {
      upcoming.push(match);
    } else {
      continue;
    }
    seen.add(id);
  }
  upcoming.sort((left, right) => left.kickoff - right.kickoff);
  return {updated: new Date(now).toISOString(), matches, upcoming};
}

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === '/rooms.json' && request.method === 'GET') {
      const id = url.searchParams.get('match');
      const headers = {...responseHeaders, 'Cache-Control': 'no-store'};
      if (!/^\d{1,20}$/.test(id || '')) {
        return Response.json({error: 'Invalid match ID'}, {status: 400, headers});
      }
      try {
        const catalog = await worker.fetch(new Request(new URL('/matches.json', url)), env, context);
        if (!catalog.ok) throw new Error('Catalog unavailable');
        const {matches} = await catalog.json();
        const match = matches.find(item => item.id === id);
        if (!match) return Response.json([], {headers});
        const upstream = await fetch(roomDirectory, {signal: AbortSignal.timeout(6000), redirect: 'error'});
        if (!upstream.ok) throw new Error('Room directory unavailable');
        const rooms = await upstream.json();
        return Response.json(rooms.filter(room => Object.hasOwn(match.channels, String(room.id)))
          .map(({id, stream}) => ({id, stream})), {headers});
      } catch {
        return Response.json({error: 'Stream directory unavailable'}, {status: 503, headers});
      }
    }
    if (url.pathname !== '/matches.json' || request.method !== 'GET') {
      return new Response('Not found', {status: 404});
    }
    url.search = '';
    const key = new Request(url);
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const upstream = await fetch(source, {signal: AbortSignal.timeout(7000), redirect: 'error'});
      if (!upstream.ok) throw new Error('Upstream HTTP ' + upstream.status);
      const data = parseCatalog(await upstream.text());
      const response = Response.json(data, {headers: responseHeaders});
      context.waitUntil(cache.put(key, response.clone()).catch(() => {}));
      return response;
    } catch {
      return Response.json({error: 'Match catalog unavailable'}, {
        status: 503, headers: {...responseHeaders, 'Cache-Control': 'no-store'},
      });
    }
  },
};

export default worker;
