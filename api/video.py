"""
Video lookups for the deployed site, as one Vercel Python function.

  GET  /api/video/<shortcode>   playable .mp4 link, or "use the embed"
  GET  /api/cron/video-check    daily login check (Vercel cron); alerts you if it's broken
  GET  /api/login-refresh       password-protected page to paste a fresh cookies file
  POST /api/login-refresh       saves it

vercel.json rewrites those paths to /api/video?action=...

It does the same job as server/videoApi.ts does under `npm run dev`: run
yt-dlp, logged in as the spare Instagram account, and return one direct .mp4
link the app plays in its own <video> player.

The login (a cookies.txt file) lives in Redis when it's connected,
so the cookies Instagram refreshes on each request are saved back and the
session lasts longer. Without Redis it's read from the IG_COOKIES_B64 env var.

Keep pick_video() in step with pickVideo() in server/videoApi.ts.

Env:
  IG_COOKIES_B64            starting login (base64 cookies.txt); seeds Redis
  REDIS_URL                 Redis (added when you connect it in Vercel), or
  KV_REST_API_URL/_TOKEN    Upstash's REST pair (UPSTASH_REDIS_REST_* also work)
  REFRESH_PASSWORD          enables /api/login-refresh
  CRON_SECRET               Vercel sends it to the cron; other callers are refused
  HEALTH_SHORTCODE          a reel the daily check looks up
  NTFY_TOPIC                push alert via ntfy.sh (optional)
  RESEND_API_KEY + ALERT_EMAIL   email alert via Resend (optional)
"""

import base64
import hmac
import html
import json
import os
import re
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

SHORTCODE = re.compile(r"^[A-Za-z0-9_-]{5,64}$")
DEFAULT_HEALTH_SHORTCODE = "DeCq7x8Rsgh"

# Vercel's CDN keeps answers so repeat views don't hit Instagram again.
# Instagram's video links last for days; refresh well before that.
OK_CACHE = "public, s-maxage=3600, max-age=0"
MISS_CACHE = "public, s-maxage=600, max-age=0"

COOKIES_KEY = "ig:cookies"
GEN_KEY = "ig:cookies:gen"  # bumped on every manual refresh

SETUP_REASONS = ("no-login", "login-expired", "no-ytdlp")


# ---------- storage ----------

def _rest_config():
    url = os.environ.get("KV_REST_API_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
    token = os.environ.get("KV_REST_API_TOKEN") or os.environ.get("UPSTASH_REDIS_REST_TOKEN")
    return (url.rstrip("/"), token) if url and token else None


def _redis_config():
    """Storage is on when either an Upstash REST pair or a REDIS_URL is set."""
    return _rest_config() or os.environ.get("REDIS_URL") or None


_client = None


def redis(*command):
    """One Redis command, as text. Raises on failure."""
    rest = _rest_config()
    if rest:
        url, token = rest
        req = urllib.request.Request(
            url,
            data=json.dumps(list(command)).encode(),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.load(resp).get("result")
    # Plain Redis (what Vercel's Redis integration provides as REDIS_URL).
    global _client
    if _client is None:
        import redis as redis_py

        _client = redis_py.Redis.from_url(
            os.environ["REDIS_URL"], decode_responses=True, socket_timeout=5, socket_connect_timeout=5
        )
    result = _client.execute_command(*command)
    return str(result) if isinstance(result, int) else result


def env_cookies():
    raw = os.environ.get("IG_COOKIES_B64", "").strip()
    if not raw:
        return None
    try:
        return base64.b64decode(raw).decode()
    except Exception:
        return None


def load_cookies():
    """Returns (cookies text or None, generation or None)."""
    if _redis_config():
        try:
            text = redis("GET", COOKIES_KEY)
            gen = redis("GET", GEN_KEY)
            if text:
                return text, gen
            seed = env_cookies()
            if seed:
                redis("SET", COOKIES_KEY, seed)
            return seed, gen
        except Exception:
            pass  # storage down: fall back to the env var for this request
    return env_cookies(), None


def save_refreshed(text, gen):
    """Save the cookies yt-dlp updated, unless a manual refresh happened meanwhile."""
    if not _redis_config() or "sessionid" not in text:
        return
    try:
        if redis("GET", GEN_KEY) == gen:
            redis("SET", COOKIES_KEY, text)
    except Exception:
        pass


def save_manual(text):
    redis("SET", COOKIES_KEY, text)
    redis("INCR", GEN_KEY)


# ---------- lookup ----------

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
    cookies, gen = load_cookies()
    if not cookies:
        return {"type": "embed", "reason": "no-login"}
    try:
        import yt_dlp
    except ImportError:
        return {"type": "embed", "reason": "no-ytdlp"}

    # A file per request: yt-dlp reads it, then writes back what Instagram changed.
    fd, path = tempfile.mkstemp(suffix=".txt")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(cookies)
        opts = {
            "cookiefile": path,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "skip_download": True,
            "socket_timeout": 15,
        }
        # /p/ works for reels too, and for regular posts that are videos.
        url = f"https://www.instagram.com/p/{shortcode}/"
        info = None
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.sanitize_info(ydl.extract_info(url, download=False))
        except Exception as e:  # yt-dlp raises DownloadError and friends
            result = {"type": "embed", "reason": classify_error(str(e))}
        else:
            try:
                result = pick_video(info)
            except Exception:
                result = {"type": "embed", "reason": "failed"}

        # A dead login's cookies aren't worth keeping.
        if result.get("reason") != "login-expired":
            try:
                with open(path) as f:
                    updated = f.read()
                if updated != cookies:
                    save_refreshed(updated, gen)
            except OSError:
                pass
        return result
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


# ---------- alerts ----------

def post_json(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    urllib.request.urlopen(req, timeout=10).close()


def send_alert(title, message):
    sent = []
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if topic:
        try:
            req = urllib.request.Request(
                f"https://ntfy.sh/{topic}",
                data=message.encode(),
                headers={"Title": title, "Priority": "high", "Tags": "warning"},
            )
            urllib.request.urlopen(req, timeout=10).close()
            sent.append("ntfy")
        except Exception:
            pass
    key, to = os.environ.get("RESEND_API_KEY", "").strip(), os.environ.get("ALERT_EMAIL", "").strip()
    if key and to:
        try:
            post_json(
                "https://api.resend.com/emails",
                {"from": "Saved Feed <onboarding@resend.dev>", "to": [to], "subject": title, "text": message},
                {"Authorization": f"Bearer {key}"},
            )
            sent.append("email")
        except Exception:
            pass
    return sent


def site_url():
    host = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL") or os.environ.get("VERCEL_URL") or ""
    return f"https://{host}" if host else ""


def run_check():
    code = os.environ.get("HEALTH_SHORTCODE", "").strip() or DEFAULT_HEALTH_SHORTCODE
    result = lookup(code)
    if result["type"] == "video":
        return {"ok": True, "shortcode": code}
    reason = result["reason"]
    refresh = f"{site_url()}/api/login-refresh"
    if reason in ("login-expired", "no-login"):
        title = "Saved Feed: Instagram login needs refreshing"
        message = (
            "Videos on the site are showing as embeds because the spare account's login "
            f"{'expired' if reason == 'login-expired' else 'is missing'}.\n\n"
            "Log into the spare account in its browser profile, clear any security prompt, "
            f"export cookies.txt, and paste it at {refresh}"
        )
    else:
        title = "Saved Feed: video check failed"
        message = (
            f"The daily check looked up reel {code} and got '{reason}'. If that reel was deleted "
            "or isn't a video, set HEALTH_SHORTCODE in Vercel to one that is. Otherwise Instagram "
            f"may be blocking the login: log in, clear any prompt, and paste fresh cookies at {refresh}"
        )
    return {"ok": False, "shortcode": code, "reason": reason, "alerted": send_alert(title, message)}


# ---------- refresh page ----------

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Refresh login</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; background: #0b0b0d; color: #ececf1; font: 16px/1.5 -apple-system, system-ui, sans-serif; }}
  main {{ max-width: 560px; margin: 0 auto; padding: 32px 16px; }}
  h1 {{ font-size: 22px; margin: 0 0 8px; }}
  p {{ color: #a1a1aa; margin: 0 0 20px; }}
  label {{ display: block; font-size: 14px; color: #a1a1aa; margin: 16px 0 6px; }}
  input, textarea {{ box-sizing: border-box; width: 100%; background: #17171b; color: inherit; border: 1px solid #2c2c33; border-radius: 10px; padding: 10px 12px; font: inherit; }}
  textarea {{ height: 160px; font: 12px/1.4 ui-monospace, monospace; }}
  button {{ margin-top: 20px; width: 100%; padding: 12px; border: 0; border-radius: 10px; background: #ececf1; color: #0b0b0d; font: 600 16px system-ui, sans-serif; }}
  .msg {{ padding: 12px 14px; border-radius: 10px; margin-bottom: 20px; }}
  .ok {{ background: #12301f; color: #8ee6b0; }}
  .bad {{ background: #3a1518; color: #ffb4b4; }}
</style></head>
<body><main>
  <h1>Refresh Instagram login</h1>
  <p>Paste the spare account's cookies.txt (or pick the file). It's saved for the video lookups and tested right away.</p>
  {message}
  <form method="post">
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required>
    <label for="file">cookies.txt</label>
    <input id="file" type="file" accept=".txt,text/plain">
    <label for="cookies">…or paste it</label>
    <textarea id="cookies" name="cookies" required spellcheck="false"></textarea>
    <button type="submit">Save and test</button>
  </form>
</main>
<script>
  document.getElementById('file').addEventListener('change', async (e) => {{
    const f = e.target.files[0]
    if (f) document.getElementById('cookies').value = await f.text()
  }})
</script>
</body></html>"""


def page(message="", kind="ok"):
    box = f'<div class="msg {kind}">{html.escape(message)}</div>' if message else ""
    return PAGE.format(message=box)


def refresh_page(body):
    password = os.environ.get("REFRESH_PASSWORD", "")
    form = parse_qs(body)
    given = (form.get("password") or [""])[0]
    if not password or not hmac.compare_digest(given.encode(), password.encode()):
        return 403, page("Wrong password.", "bad")
    if not _redis_config():
        return 500, page("Storage isn't connected. Connect a Redis database to this project in Vercel first.", "bad")
    text = (form.get("cookies") or [""])[0].replace("\r\n", "\n").strip() + "\n"
    if "instagram.com" not in text or "sessionid" not in text:
        return 400, page("That doesn't look like an Instagram cookies.txt (no sessionid). Export it while logged in.", "bad")
    try:
        save_manual(text)
    except Exception:
        return 500, page("Couldn't save to storage. Try again.", "bad")
    check = run_check()
    if check["ok"]:
        return 200, page("Saved. Test lookup worked: videos are back.")
    return 200, page(f"Saved, but the test lookup returned '{check['reason']}'. Re-export and try again.", "bad")


# ---------- routing ----------

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        action = (query.get("action") or [""])[0]
        if action == "check":
            secret = os.environ.get("CRON_SECRET", "")
            auth = self.headers.get("Authorization", "")
            if not secret or not hmac.compare_digest(auth.encode(), f"Bearer {secret}".encode()):
                return self.send_json(401, {"ok": False, "reason": "unauthorized"}, "no-store")
            return self.send_json(200, run_check(), "no-store")
        if action == "refresh":
            if not os.environ.get("REFRESH_PASSWORD"):
                return self.send_html(404, page("This page is off. Set REFRESH_PASSWORD in Vercel to turn it on.", "bad"))
            return self.send_html(200, page())

        code = (query.get("code") or [""])[0]
        if not SHORTCODE.match(code):
            return self.send_json(400, {"type": "embed", "reason": "failed"}, "no-store")
        result = lookup(code)
        if result["type"] == "video":
            cache = OK_CACHE
        elif result["reason"] in SETUP_REASONS:
            # Setup problems go away as soon as they're fixed; don't cache them.
            cache = "no-store"
        else:
            cache = MISS_CACHE
        self.send_json(200, result, cache)

    def do_POST(self):
        query = parse_qs(urlparse(self.path).query)
        if (query.get("action") or [""])[0] != "refresh":
            return self.send_json(405, {"ok": False}, "no-store")
        if not os.environ.get("REFRESH_PASSWORD"):
            return self.send_html(404, page("This page is off. Set REFRESH_PASSWORD in Vercel to turn it on.", "bad"))
        length = min(int(self.headers.get("Content-Length") or 0), 256 * 1024)
        body = self.rfile.read(length).decode(errors="replace")
        status, content = refresh_page(body)
        self.send_html(status, content)

    def send_json(self, status, body, cache):
        self.send(status, json.dumps(body).encode(), "application/json", cache)

    def send_html(self, status, content):
        self.send(status, content.encode(), "text/html; charset=utf-8", "no-store")

    def send(self, status, data, content_type, cache):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", cache)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
