import concurrent.futures
import json
import re
import urllib.request
from pathlib import Path

CHANNELS = {
    "pyoneplaysports": "Pyone Play Sports",
    "TheAFCHub": "The AFC Hub",
    "OFCFootball": "OFC",
    "Concacaf": "Concacaf",
    "GermanFootball": "German Football",
    "USL": "USL",
    "BarclaysWSL": "Barclays WSL",
    "BarclaysWSL2": "Barclays WSL 2",
}

def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from objects(child)

def check_broadcast(entry):
    url = "https://www.youtube.com/watch?v=" + entry["id"]
    with urllib.request.urlopen(url, timeout=10) as response:
        html = response.read().decode()
    marker = re.search(r"var ytInitialPlayerResponse\s*=\s*", html)
    if not marker:
        return
    data = json.JSONDecoder().raw_decode(html[marker.end():])[0]
    details = data.get("microformat", {}).get("playerMicroformatRenderer", {}).get("liveBroadcastDetails", {})
    if details.get("endTimestamp"):
        entry["state"] = "replay"
    elif details.get("isLiveNow"):
        entry["state"] = "live"
    elif details.get("startTimestamp"):
        entry["state"] = "upcoming"
    if details.get("startTimestamp"):
        entry["starts"] = details["startTimestamp"]


def videos(handle, name):
    request = urllib.request.Request(
        f"https://www.youtube.com/@{handle}/streams",
        headers={"Accept-Language": "en-US,en;q=0.9", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode()
    start = re.search(r"var ytInitialData\s*=\s*", html)
    if not start:
        raise ValueError("Channel data unavailable")
    data = json.JSONDecoder().raw_decode(html[start.end():])[0]
    entries = []
    for item in objects(data):
        if item.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
            continue
        video_id = item.get("contentId", "")
        if not re.fullmatch(r"[\w-]{11}", video_id, re.ASCII):
            continue
        meta = item.get("metadata", {}).get("lockupMetadataViewModel", {})
        title = meta.get("title", {}).get("content")
        if not isinstance(title, str) or not title:
            continue
        overlays = item.get("contentImage", {}).get("thumbnailViewModel", {}).get("overlays", [])
        badges = [obj["thumbnailBadgeViewModel"] for obj in objects(overlays) if "thumbnailBadgeViewModel" in obj]
        labels = {badge.get("text", "").strip().lower() for badge in badges}
        state = "live" if labels & {"live", "live now"} else "upcoming" if "upcoming" in labels else "replay"
        entries.append({"id": video_id, "title": title, "channel": name, "state": state})
    if not entries:
        raise ValueError("No broadcast cards found")
    return entries[:12]

if __name__ == "__main__":
    from datetime import datetime, timezone

    errors = []
    entries = []
    with concurrent.futures.ThreadPoolExecutor() as pool:
        jobs = {pool.submit(videos, handle, name): name for handle, name in CHANNELS.items()}
        for job, name in jobs.items():
            try:
                entries.extend(job.result())
            except (OSError, ValueError, KeyError) as error:
                print(f"{name}: {error}")
                errors.append(name)
    if not entries:
        raise SystemExit("All broadcast sources unavailable")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        checks = [pool.submit(check_broadcast, entry) for entry in entries if entry["state"] != "replay"]
        for check in checks:
            try:
                check.result()
            except (OSError, ValueError) as error:
                print(f"Could not verify a broadcast: {error}")
    feed = {"updated": datetime.now(timezone.utc).isoformat(), "videos": entries, "unavailable": errors}
    Path(__file__).with_name("broadcasts.json").write_text(json.dumps(feed, ensure_ascii=False), encoding="utf-8")
    print(f"{len(entries)} broadcasts, {sum(row['state'] == 'live' for row in entries)} live")
