"""
Video lookup for the deployed site: GET /api/video/<shortcode>

A Vercel Python function. It does the same job as server/videoApi.ts does
under `npm run dev`: run yt-dlp, logged in as the spare Instagram account,
and return one direct .mp4 link the app plays in its own <video> player.
Anything that isn't a single video tells the app to use Instagram's embed.

The login comes from the IG_COOKIES_B64 environment variable (the
cookies.txt file, base64-encoded). vercel.json rewrites
/api/video/<code> to /api/video?code=<code>.

Keep pick_video() in step with pickVideo() in server/videoApi.ts.
"""

import base64
import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

SHORTCODE = re.compile(r"^[A-Za-z0-9_-]{5,64}$")

# Vercel's CDN keeps answers so repeat views don't hit Instagram again.
# Instagram's video links last for days; refresh well before that.
OK_CACHE = "public, s-maxage=3600, max-age=0"
MISS_CACHE = "public, s-maxage=600, max-age=0"


def cookie_file():
    """Write the login from the env var to a temp file yt-dlp can read."""
    raw = os.environ.get("IG_COOKIES_B64", "").strip()
    if not raw:
        return None
    path = os.path.join(tempfile.gettempdir(), "ig-cookies.txt")
    # Each warm instance writes it once; yt-dlp may update it afterwards.
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(base64.b64decode(raw))
    return path


def classify_error(message):
    s = message.lower()
    if "no video" in s or "there is no video" in s:
        return "not-video"
    if "login required" in s or "log in" in s or "cookies" in s or "checkpoint" in s:
        return "login-expired"
    return "failed"


def prefer_full(formats):
    """Full files over DASH pieces when both exist."""
    full = [f for f in formats if not str(f.get("format_id") or "").startswith("dash-")]
    return full or formats


def pick_video(info):
    """Choose one progressive .mp4 that has both picture and sound."""
    formats = info.get("formats") or []
    # Carousels come back as playlists; the embed handles swiping between items.
    if info.get("_type") == "playlist" or not formats:
        return {"type": "embed", "reason": "not-video"}
    mp4s = [
        f for f in formats
        if f.get("url") and f.get("ext") == "mp4"
        and str(f.get("protocol") or "").startswith("http")
        and f.get("vcodec") != "none"
    ]
    # DASH pieces are video-only or audio-only; the full files list no audio codec.
    with_sound = [f for f in mp4s if f.get("acodec") != "none"]
    # Silent reels have no audio anywhere. If sound exists only as a separate
    # track, a video-only file would play silently, so use the embed instead.
    separate_audio = any(
        f.get("vcodec") == "none" and f.get("acodec") and f.get("acodec") != "none" for f in formats
    )
    playable = with_sound or ([] if separate_audio else prefer_full(mp4s))
    if not playable:
        return {"type": "embed", "reason": "not-video"}
    best = playable[0]
    for f in playable[1:]:
        h = f.get("height") or 0
        if h > (best.get("height") or 0) and h <= 1920:
            best = f
    result = {"type": "video", "url": best["url"]}
    width = best.get("width") or info.get("width")
    height = best.get("height") or info.get("height")
    if width:
        result["width"] = width
    if height:
        result["height"] = height
    if info.get("thumbnail"):
        result["poster"] = info["thumbnail"]
    return result


def lookup(shortcode):
    cookies = cookie_file()
    if not cookies:
        return {"type": "embed", "reason": "no-login"}
    try:
        import yt_dlp
    except ImportError:
        return {"type": "embed", "reason": "no-ytdlp"}
    opts = {
        "cookiefile": cookies,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "skip_download": True,
        "socket_timeout": 15,
    }
    # /p/ works for reels too, and for regular posts that are videos.
    url = f"https://www.instagram.com/p/{shortcode}/"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.sanitize_info(ydl.extract_info(url, download=False))
    except Exception as e:  # yt-dlp raises DownloadError and friends
        return {"type": "embed", "reason": classify_error(str(e))}
    try:
        return pick_video(info)
    except Exception:
        return {"type": "embed", "reason": "failed"}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = (query.get("code") or [""])[0]
        if not SHORTCODE.match(code):
            return self.send(400, {"type": "embed", "reason": "failed"}, "no-store")
        result = lookup(code)
        if result["type"] == "video":
            cache = OK_CACHE
        elif result["reason"] in ("not-video", "failed"):
            cache = MISS_CACHE
        else:
            # Setup problems go away as soon as they're fixed; don't cache them.
            cache = "no-store"
        self.send(200, result, cache)

    def send(self, status, body, cache):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
