import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

from update_sutbong import load_matches


def catalog():
    matches, upcoming = load_matches(timeout=5)
    return {"updated": datetime.now(timezone.utc).isoformat(),
            "matches": matches, "upcoming": upcoming}


def rooms_for_match(match_id):
    match = next((row for row in catalog()["matches"] if row["id"] == match_id), None)
    if match is None:
        return []
    request = Request("https://biz.vnres.co/api/live/livingRoom",
                      headers={"User-Agent": "Mozilla/5.0 LiveSport/0.1"})
    with urlopen(request, timeout=4) as response:
        rooms = json.load(response)
    return [{"id": room["id"], "stream": room["stream"]} for room in rooms
            if str(room.get("id")) in match["channels"]
            and isinstance(room.get("stream"), str)
            and room["stream"].startswith("https://")]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        request = urlsplit(self.path)
        match_id = parse_qs(request.query).get("match", [""])[0]
        is_rooms = request.path == "/rooms.json" or bool(match_id)
        if is_rooms and not re.fullmatch(r"[0-9]{1,20}", match_id):
            self.send_json(400, {"error": "Invalid match ID"})
            return
        try:
            data = rooms_for_match(match_id) if is_rooms else catalog()
        except (OSError, ValueError, KeyError, TypeError) as error:
            # Report the failing upstream status without logging stream URLs.
            print("Sutbong request failed:", type(error).__name__, getattr(error, "code", ""))
            self.send_json(503, {"error": "Sutbong data unavailable"})
            return
        self.send_json(200, data, "public, max-age=15, s-maxage=20" if not is_rooms else "no-store")

    def send_json(self, status, data, cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "https://focuseyes1989-debug.github.io")
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))
