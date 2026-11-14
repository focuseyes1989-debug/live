import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


def load_matches():
    request = Request("https://sutbong.pro/", headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=20) as response:
        html = response.read(4_000_000).decode("utf-8")
    block = re.search(r"""<script\b[^>]*\bid=["']matches-data["'][^>]*>(.*?)</script>""", html, re.S)
    if not block:
        raise ValueError("Sutbong match list unavailable")
    matches = []
    seen = set()
    for row in json.loads(block[1]):
        if str(row.get("sport_id")) != "1" or str(row.get("is_live")).lower() not in {"1", "true"}:
            continue
        key = str(row.get("postid", ""))
        home, away = row.get("home_name"), row.get("away_name")
        if key in seen or not key.isdigit() or not home or not away:
            continue
        channels = {}
        for anchor in (row.get("match_data") or {}).get("anchors") or []:
            channel_id = str(anchor.get("uid") or anchor.get("id") or "")
            if channel_id.isdigit():
                channels[channel_id] = anchor.get("nickName") or "Commentator"
        if channels:
            seen.add(key)
            matches.append({
                "id": key,
                "title": f"{home} vs {away}",
                "home": home,
                "away": away,
                "homeLogo": row.get("home_logo"),
                "awayLogo": row.get("away_logo"),
                "channels": channels,
            })
    return matches


if __name__ == "__main__":
    matches = load_matches()
    feed = {"updated": datetime.now(timezone.utc).isoformat(), "matches": matches}
    Path(__file__).with_name("sutbong-matches.json").write_text(json.dumps(feed, ensure_ascii=False), encoding="utf-8")
    print(f"{len(matches)} Sutbong live matches")
