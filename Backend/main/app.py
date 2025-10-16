# main/app.py
import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from math import ceil
import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

# -------------------------
# Config / paths / constants
# -------------------------
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)

LANG_FILE = os.path.join(DATA_DIR, "languages.json")
COUNTRY_FILE = os.path.join(DATA_DIR, "countries.json")
CHANNEL_INDEX_URL = "https://iptv-org.github.io/iptv/index.m3u"
CHANNEL_CACHE_TTL = timedelta(minutes=30)   # how long channel list + validation is considered fresh
CHANNEL_VALIDATE_CONCURRENCY = 10           # concurrent requests when validating streams
HTTP_TIMEOUT = 12.0

app = FastAPI(title="IPTV Unified API (languages, countries, channels)")

# add CORS support (paste right after `app = FastAPI(...)`)
from fastapi.middleware.cors import CORSMiddleware

# adjust origins for dev/prod
_allowed_origins = [
     # Vite dev
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
    'https://lulu-tv.netlify.app' 
    # add your production origin(s) here, e.g. "https://my-frontend.example"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

class LanguageEntry(BaseModel):
    name: str
    channels: Optional[int] = None
    playlist_url: Optional[str] = None
    code: Optional[str] = None


class City(BaseModel):
    name: str
    playlist_url: Optional[str]
    code: Optional[str]


class Subdivision(BaseModel):
    name: str
    playlist_url: Optional[str]
    code: Optional[str]
    cities: List[City] = []


class Country(BaseModel):
    name: str
    playlist_url: Optional[str]
    code: Optional[str]
    subdivisions: List[Subdivision] = []
    cities: List[City] = []


class Channel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    tvg_id: Optional[str] = None
    tvg_name: Optional[str] = None
    tvg_logo: Optional[str] = None
    group: Optional[str] = None
    language: Optional[str] = None
    country: Optional[str] = None
    url: Optional[str] = None

    # validation metadata
    working: Optional[bool] = None
    hls_compatible: Optional[bool] = None
    last_checked: Optional[str] = None
    check_error: Optional[str] = None


# -------------------------
# Utilities: load local cached files
# -------------------------
def _load_json_file(path: str) -> Optional[Dict[str, Any]]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


# -------------------------
# Languages: read from languages.json (or fallback to remote if requested)
# -------------------------
async def _read_or_fetch_languages(force: bool = False) -> List[Dict]:
    # prefer local file
    file_data = _load_json_file(LANG_FILE)
    if file_data and not force:
        return file_data.get("items", [])
    # fallback: fetch remote and parse quickly (only if force=True)
    if force:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get("https://iptv-org.github.io/iptv/index.language.m3u")
            r.raise_for_status()
            text = r.text
        # quick parse (similar to previous parse_index_text)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if lines and lines[0].lower().startswith("language"):
            lines = lines[1:]
        items = []
        for ln in lines:
            parts = [p.strip() for p in ln.split("\t") if p.strip()]
            if len(parts) < 3:
                parts = [p for p in re.split(r"\s{2,}", ln) if p]
            if len(parts) >= 3:
                name, channels_str, playlist = parts[0], parts[1], parts[2]
                try:
                    channels = int(channels_str)
                except Exception:
                    channels = None
                code = None
                try:
                    code = os.path.splitext(os.path.basename(playlist))[0]
                except Exception:
                    code = None
                items.append({"name": name, "channels": channels, "playlist_url": playlist, "code": code})
        # save to file for future
        try:
            with open(LANG_FILE, "w", encoding="utf-8") as f:
                json.dump({"updated_at": datetime.utcnow().isoformat(), "items": items}, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
        return items
    return []


# -------------------------
# Countries: read from countries.json (or fallback to remote if requested)
# -------------------------
async def _read_or_fetch_countries(force: bool = False) -> List[Dict]:
    file_data = _load_json_file(COUNTRY_FILE)
    if file_data and not force:
        return file_data.get("items", [])
    # If forced, fetch remote and parse (same logic as previous parse_country_index)
    if force:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            r = await client.get("https://iptv-org.github.io/iptv/index.country.m3u")
            r.raise_for_status()
            text = r.text
        # reuse parsing strategy from previous code (simplified)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        items = []
        current_country = None
        current_subdivision = None
        for ln in lines:
            parts = [p for p in re.split(r"\t+|\s{2,}", ln) if p]
            if len(parts) < 2:
                m = re.search(r"(https?://\S+)$", ln)
                if m:
                    url = m.group(1)
                    name = ln[:m.start()].strip()
                    parts = [name, url]
            if len(parts) < 2:
                continue
            name, url = parts[0].strip(), parts[-1].strip()
            url_lower = url.lower()
            def _code(u: str) -> Optional[str]:
                try:
                    return os.path.splitext(os.path.basename(u))[0]
                except Exception:
                    return None
            if "/countries/" in url_lower:
                country = {"name": name, "playlist_url": url, "code": _code(url), "subdivisions": [], "cities": []}
                items.append(country)
                current_country = country
                current_subdivision = None
            elif "/subdivisions/" in url_lower:
                if current_country is None:
                    current_country = {"name": "unknown", "playlist_url": None, "code": None, "subdivisions": [], "cities": []}
                    items.append(current_country)
                subdivision = {"name": name, "playlist_url": url, "code": _code(url), "cities": []}
                current_country["subdivisions"].append(subdivision)
                current_subdivision = subdivision
            elif "/cities/" in url_lower:
                city = {"name": name, "playlist_url": url, "code": _code(url)}
                if current_subdivision is not None:
                    current_subdivision["cities"].append(city)
                elif current_country is not None:
                    current_country["cities"].append(city)
                else:
                    unknown = {"name": "unknown", "playlist_url": None, "code": None, "subdivisions": [], "cities": [city]}
                    items.append(unknown)
                    current_country = unknown
                    current_subdivision = None
            else:
                # attach as country-level city/sub-item
                city = {"name": name, "playlist_url": url, "code": _code(url)}
                if current_subdivision:
                    current_subdivision["cities"].append(city)
                elif current_country:
                    current_country["cities"].append(city)
                else:
                    items.append({"name": name, "playlist_url": url, "code": _code(url), "subdivisions": [], "cities": []})
                    current_country = items[-1]
                    current_subdivision = None
        try:
            with open(COUNTRY_FILE, "w", encoding="utf-8") as f:
                json.dump({"updated_at": datetime.utcnow().isoformat(), "items": items}, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
        return items
    return []


# -------------------------
# helpers: resolve q to a specific playlist (languages/countries/subdivisions/cities)
# -------------------------
async def _resolve_playlist_for_query(q: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Try to interpret q as a known language/country/subdivision/city code or name
    using local data files. Returns a dict with:
      { type: 'language'|'country'|'subdivision'|'city', code: str, url: str }
    or None if not matched.
    """
    if not q:
        return None
    ql = (q or "").strip().lower()

    # languages
    langs = await _read_or_fetch_languages()
    for it in langs:
        code = (it.get("code") or "").lower()
        name = (it.get("name") or "").lower()
        if ql == code or ql == name:
            return {"type": "language", "code": code, "url": it.get("playlist_url")}

    # countries, subdivisions, cities
    countries = await _read_or_fetch_countries()
    for c in countries:
        c_code = (c.get("code") or "").lower()
        c_name = (c.get("name") or "").lower()
        if ql == c_code or ql == c_name:
            return {"type": "country", "code": c_code, "url": c.get("playlist_url")}
        # subdivisions
        for s in (c.get("subdivisions") or []):
            s_code = (s.get("code") or "").lower()
            s_name = (s.get("name") or "").lower()
            if ql == s_code or ql == s_name:
                return {"type": "subdivision", "code": s_code, "url": s.get("playlist_url")}
        # cities
        for city in (c.get("cities") or []):
            ci_code = (city.get("code") or "").lower()
            ci_name = (city.get("name") or "").lower()
            if ql == ci_code or ql == ci_name:
                return {"type": "city", "code": ci_code, "url": city.get("playlist_url")}
    return None


async def _fetch_text(url: str) -> str:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text

# -------------------------
# Channels: parse index.m3u and validate
# -------------------------
# in-memory cache for channels + validation metadata
_channels_cache: Dict[str, Any] = {
    "items": None,            # List[Dict] parsed channels
    "last_loaded": None,      # datetime
    "validated_map": {},      # url -> validation result dict
    "lock": asyncio.Lock()
}


EXTINF_RE = re.compile(r'#EXTINF:-?\d+(?:\s+(.+))?,(.*)$')
ATTR_RE = re.compile(r'([\w-]+?)="([^"]*)"')


def parse_m3u_index(text: str) -> List[Dict]:
    """
    Parse an M3U index into channel dicts.
    We expect repeating patterns:
      #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="..." ,Channel name
      https://stream.url/...
    """
    lines = [ln.strip() for ln in text.splitlines()]
    items: List[Dict] = []
    i = 0
    last_extinf_attrs = None
    last_name = None
    while i < len(lines):
        ln = lines[i]
        if ln.startswith('#EXTINF'):
            m = EXTINF_RE.match(ln)
            attrs = {}
            display_name = None
            if m:
                raw_attrs = m.group(1) or ""
                display_name = (m.group(2) or "").strip()
                for attr_m in ATTR_RE.finditer(raw_attrs):
                    k = attr_m.group(1)
                    v = attr_m.group(2)
                    attrs[k] = v
            last_extinf_attrs = attrs
            last_name = display_name
            # next non-empty non-comment line likely the URL
            j = i + 1
            while j < len(lines) and (lines[j] == "" or lines[j].startswith('#')):
                j += 1
            if j < len(lines):
                url = lines[j].strip()
                item = {
                    "id": attrs.get("tvg-id") or attrs.get("id") or None,
                    "name": attrs.get("tvg-name") or last_name or None,
                    "tvg_name": attrs.get("tvg-name") or last_name or None,
                    "tvg_id": attrs.get("tvg-id") or None,
                    "tvg_logo": attrs.get("tvg-logo") or None,
                    "group": attrs.get("group-title") or attrs.get("group") or None,
                    "language": attrs.get("tvg-language") or attrs.get("language") or None,
                    "country": attrs.get("tvg-country") or attrs.get("country") or None,
                    "url": url,
                }
                items.append(item)
                i = j  # advance to URL line index; loop will i+=1 later
            else:
                # no url following; just move on
                pass
        i += 1
    return items


async def _fetch_channel_index_text() -> str:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.get(CHANNEL_INDEX_URL)
        r.raise_for_status()
        return r.text


async def _load_channels(force: bool = False) -> List[Dict]:
    """
    Load/parse channel index with caching. If cached and not expired, return cached items.
    """
    async with _channels_cache["lock"]:
        if _channels_cache["items"] and _channels_cache["last_loaded"]:
            if not force and (datetime.utcnow() - _channels_cache["last_loaded"] < CHANNEL_CACHE_TTL):
                return _channels_cache["items"]
        # fetch & parse
        text = await _fetch_channel_index_text()
        parsed = parse_m3u_index(text)
        _channels_cache["items"] = parsed
        _channels_cache["last_loaded"] = datetime.utcnow()
        # keep validated_map but don't clear so we keep previous validation results
        return parsed


# Validation helpers
async def _head_or_get(url: str, client: httpx.AsyncClient) -> Tuple[int, Dict[str, str], Optional[bytes]]:
    """
    Try HEAD first; if it fails or returns non-200, try GET for a small chunk.
    Returns (status_code, headers, sample_bytes_or_none)
    """
    try:
        r = await client.head(url, follow_redirects=True)
        if r.status_code == 200:
            return r.status_code, r.headers, None
        # otherwise try GET and fetch a little
    except Exception:
        pass
    # GET small chunk
    try:
        r = await client.get(url, follow_redirects=True, timeout=HTTP_TIMEOUT)
        return r.status_code, r.headers, r.content[:4096] if r.content else None
    except Exception:
        return 0, {}, None


def _detect_hls_from_headers_and_sample(headers: Dict[str, str], sample: Optional[bytes]) -> Tuple[bool, Optional[str]]:
    """
    Enhanced HLS detection:
    - Checks content-type headers for mpegurl variants
    - If sample bytes includes playlist markers (#EXTM3U, EXT-X-STREAM-INF, EXTINF)
      tries to extract CODECS from EXT-X-STREAM-INF to decide compatibility
    - If sample looks binary but Content-Type is video/* and contains 'mp4' etc, we treat as non-HLS
    Returns (is_hls_compatible, reason)
    """
    ct = (headers.get("content-type") or "").lower()
    if "mpegurl" in ct or "vnd.apple.mpegurl" in ct or "application/vnd.apple.mpegurl" in ct or ct.endswith("m3u8"):
        return True, f"content-type indicates mpegurl ({ct})"

    if sample:
        try:
            s = sample.decode(errors="ignore")
        except Exception:
            s = ""
        # playlist markers
        if "#EXTM3U" in s or "#EXTINF" in s or "#EXT-X-STREAM-INF" in s:
            # try extract CODECS from EXT-X-STREAM-INF lines
            # e.g. #EXT-X-STREAM-INF:BANDWIDTH=... ,CODECS="avc1.42E01E,mp4a.40.2"
            codecs_found = []
            for line in s.splitlines():
                if line.startswith("#EXT-X-STREAM-INF"):
                    m = re.search(r'CODECS="([^"]+)"', line)
                    if m:
                        codecs_found.extend([c.strip().lower() for c in m.group(1).split(",")])
            # heuristic: if codecs include common H.264/AVC or mp4a audio, assume playable by hls.js
            if codecs_found:
                ok_codecs = [c for c in codecs_found if ("avc" in c or "h264" in c or "mp4a" in c or "aac" in c)]
                if ok_codecs:
                    return True, f"playlist with CODECS {','.join(codecs_found)}"
                # codecs present but not known/compatible
                return False, f"playlist with unrecognized CODECS {','.join(codecs_found)}"
            return True, "playlist markers present"
        # if sample starts with ftyp box (mp4) but no m3u8 markers — likely direct mp4 stream (not HLS)
        if sample[:12].startswith(b'\x00\x00\x00') and b'ftyp' in sample[:64]:
            return False, "sample indicates fMP4/MP4 fragment (no playlist)"
    # fallback: if content-type looks like video/h264 or video/mp2t we might still treat as non-HLS
    if "video" in ct:
        return False, f"content-type video but not m3u8 ({ct})"
    return False, None

async def validate_channel_entry(entry: Dict, client: httpx.AsyncClient, sem: asyncio.Semaphore) -> Dict:
    """
    Validate a single parsed channel entry:
    - try to reach URL
    - detect if it's an HLS playlist (m3u8/mpegurl) or not
    - return validation dict with keys: working(bool), hls_compatible(bool), last_checked(str), check_error(optional)
    """
    url = entry.get("url")
    result = {"working": False, "hls_compatible": False, "last_checked": None, "check_error": None}
    if not url:
        result["check_error"] = "no url"
        return result

    async with sem:
        try:
            status, headers, sample = await _head_or_get(url, client)
        except Exception as e:
            result["check_error"] = f"fetch error: {e}"
            return result

    result["last_checked"] = datetime.utcnow().isoformat()
    if not status or status >= 400:
        result["check_error"] = f"HTTP status {status}"
        result["working"] = False
        return result

    # mark as "working" if we got 2xx
    result["working"] = 200 <= status < 400

    is_hls, reason = _detect_hls_from_headers_and_sample(headers, sample)
    result["hls_compatible"] = bool(is_hls)
    if reason:
        result["check_error"] = reason if not result["check_error"] else f"{result['check_error']}; {reason}"
    return result


async def validate_channels_for_list(entries: List[Dict]) -> None:
    """
    Validate a list of channel dicts (in-place update of _channels_cache['validated_map']).
    Only validates those entries whose url is not already validated or whose last check is stale.
    """
    sem = asyncio.Semaphore(CHANNEL_VALIDATE_CONCURRENCY)
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        tasks = []
        now = datetime.utcnow()
        for e in entries:
            url = e.get("url")
            if not url:
                continue
            prev = _channels_cache["validated_map"].get(url)
            # if previously validated recently, skip
            if prev and "last_checked" in prev:
                try:
                    last = datetime.fromisoformat(prev["last_checked"])
                    if now - last < CHANNEL_CACHE_TTL:
                        continue
                except Exception:
                    pass
            tasks.append(validate_channel_entry(e, client, sem))
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            # attach results to map in same order by url
            idx = 0
            for e in entries:
                url = e.get("url")
                if not url:
                    continue
                # we may have skipped some, so check
                res = None
                if idx < len(results):
                    candidate = results[idx]
                    # if candidate is exception, convert to error
                    if isinstance(candidate, Exception):
                        res = {"working": False, "hls_compatible": False, "last_checked": datetime.utcnow().isoformat(), "check_error": str(candidate)}
                    else:
                        res = candidate
                    idx += 1
                else:
                    continue
                _channels_cache["validated_map"][url] = res


# -------------------------
# Global validation job state
# -------------------------
_validation_job = {
    "running": False,
    "started_at": None,
    "finished_at": None,
    "total": 0,
    "validated": 0,
    "errors": 0,
    "progress": 0.0,
    "lock": asyncio.Lock()
}


async def validate_all_channels(force_refresh: bool = False):
    """
    Validate all parsed channels in background. Updates _channels_cache['validated_map'].
    This is intended to run as a background task (asyncio.create_task).
    """
    async with _validation_job["lock"]:
        if _validation_job["running"]:
            return  # another worker is running

        _validation_job["running"] = True
        _validation_job["started_at"] = datetime.utcnow().isoformat()
        _validation_job["finished_at"] = None
        _validation_job["total"] = 0
        _validation_job["validated"] = 0
        _validation_job["errors"] = 0
        _validation_job["progress"] = 0.0

    try:
        # optionally refresh channels list
        items = await _load_channels(force=force_refresh)
        urls = [it.get("url") for it in items if it.get("url")]
        _validation_job["total"] = len(urls)
        if _validation_job["total"] == 0:
            return

        sem = asyncio.Semaphore(CHANNEL_VALIDATE_CONCURRENCY)
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            # create tasks in batches to avoid gigantic concurrency
            tasks = []
            for it in items:
                url = it.get("url")
                if not url:
                    continue
                # schedule validation using existing validate_channel_entry
                tasks.append(validate_channel_entry(it, client, sem))

            # gather in chunks to allow progress updates
            chunk_size = max(10, CHANNEL_VALIDATE_CONCURRENCY * 2)
            idx = 0
            total = len(tasks)
            while idx < total:
                chunk = tasks[idx: idx + chunk_size]
                results = await asyncio.gather(*chunk, return_exceptions=True)
                # map results back to urls in same slice
                slice_items = items[idx: idx + chunk_size]
                for i, res in enumerate(results):
                    # determine corresponding entry:
                    ent = slice_items[i] if i < len(slice_items) else None
                    url = ent.get("url") if ent else None
                    if isinstance(res, Exception):
                        _channels_cache["validated_map"][url] = {"working": False, "hls_compatible": False, "last_checked": datetime.utcnow().isoformat(), "check_error": str(res)}
                        _validation_job["errors"] += 1
                    else:
                        _channels_cache["validated_map"][url] = res
                        if res.get("working"):
                            _validation_job["validated"] += 1
                    _validation_job["progress"] = (len(_channels_cache["validated_map"]) / _validation_job["total"]) * 100.0
                idx += chunk_size

    finally:
        _validation_job["running"] = False
        _validation_job["finished_at"] = datetime.utcnow().isoformat()


# Endpoint to trigger background validation
@app.post("/api/v1/channels/validate-all")
async def trigger_validate_all(force_refresh: bool = Query(False, description="Force re-fetch channel index before validating")):
    if _validation_job["running"]:
        raise HTTPException(status_code=409, detail="validation already running")
    # schedule background task
    asyncio.create_task(validate_all_channels(force_refresh))
    return {"started": True, "started_at": datetime.utcnow().isoformat()}


# Endpoint to inspect validation job status
@app.get("/api/v1/channels/validate-status")
async def validate_status():
    # basic snapshot
    return {
        "running": _validation_job["running"],
        "started_at": _validation_job["started_at"],
        "finished_at": _validation_job["finished_at"],
        "total": _validation_job["total"],
        "validated": _validation_job["validated"],
        "errors": _validation_job["errors"],
        "progress_percent": round(_validation_job["progress"], 2),
        "validated_map_size": len(_channels_cache["validated_map"]),
    }

@app.on_event("startup")
async def startup_event():
    # Preload languages & countries from disk (non-blocking minimal)
    # Preload channels list (parsing only) but NOT full validation to avoid heavy startup
    try:
        await _read_or_fetch_languages()
        await _read_or_fetch_countries()
        # preload channel list (parsing) but do not validate all channels at startup
        await _load_channels()
    except Exception:
        pass


# --- Languages endpoints ---
@app.get("/api/v1/languages", response_model=List[LanguageEntry])
async def list_languages(q: Optional[str] = None, refresh: bool = False):
    items = await _read_or_fetch_languages(force=refresh)
    if q:
        ql = q.lower()
        items = [it for it in items if ql in (it.get("name") or "").lower() or ql == (it.get("code") or "").lower()]
    return items


@app.get("/api/v1/languages/{code}", response_model=LanguageEntry)
async def get_language(code: str):
    items = await _read_or_fetch_languages()
    for it in items:
        if (it.get("code") and it["code"].lower() == code.lower()) or (it.get("name") and it["name"].lower() == code.lower()):
            return it
    raise HTTPException(status_code=404, detail="language not found")


# --- Countries endpoints ---
@app.get("/api/v1/countries", response_model=List[Country])
async def list_countries(q: Optional[str] = None, refresh: bool = False):
    items = await _read_or_fetch_countries(force=refresh)
    if q:
        ql = q.lower()
        items = [c for c in items if ql in (c.get("name") or "").lower() or ql == (c.get("code") or "").lower()]
    return items


@app.get("/api/v1/countries/{country_code}", response_model=Country)
async def get_country(country_code: str):
    items = await _read_or_fetch_countries()
    for c in items:
        if c.get("code") and c["code"].lower() == country_code.lower():
            return c
        if c.get("name") and c["name"].lower() == country_code.lower():
            return c
    raise HTTPException(status_code=404, detail="country not found")


@app.get("/api/v1/countries/{country_code}/subdivisions/{sub_code}", response_model=Subdivision)
async def get_subdivision(country_code: str, sub_code: str):
    items = await _read_or_fetch_countries()
    country = None
    for c in items:
        if (c.get("code") and c["code"].lower() == country_code.lower()) or (c.get("name") and c["name"].lower() == country_code.lower()):
            country = c
            break
    if not country:
        raise HTTPException(status_code=404, detail="country not found")
    for s in country.get("subdivisions", []):
        if (s.get("code") and s["code"].lower() == sub_code.lower()) or (s.get("name") and s["name"].lower() == sub_code.lower()):
            return s
    raise HTTPException(status_code=404, detail="subdivision not found")


@app.get("/api/v1/cities/{city_code}", response_model=City)
async def get_city(city_code: str):
    items = await _read_or_fetch_countries()
    for c in items:
        for city in c.get("cities", []):
            if (city.get("code") and city["code"].lower() == city_code.lower()) or (city.get("name") and city["name"].lower() == city_code.lower()):
                return city
        for s in c.get("subdivisions", []):
            for city in s.get("cities", []):
                if (city.get("code") and city["code"].lower() == city_code.lower()) or (city.get("name") and city["name"].lower() == city_code.lower()):
                    return city
    raise HTTPException(status_code=404, detail="city not found")


# --- Channels endpoints ---
@app.get("/api/v1/channels", response_model=List[Channel])
async def list_channels(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    q: Optional[str] = None,
    refresh: bool = False,
    validate: bool = Query(False, description="If true, validate channel URLs before returning"),
    working_only: bool = Query(True, description="If true, only return channels that are marked working (after validation)."),
):
    """
    Paginated list of channels parsed from the remote index.
    - page, limit: pagination
    - q: search text against name/group/country/language
    - refresh=true: force re-fetch/parse of index.m3u
    - validate=true: actively validate URLs (may be slow)
    - working_only=true: after validation filter out non-working
    """
    # If q matches a known language/country/subdivision/city, fetch that specific playlist
    special = await _resolve_playlist_for_query(q) if q else None
    if special and special.get("url"):
        text = await _fetch_text(special["url"])
        items = parse_m3u_index(text)

        # Annotate parsed items with known code to make filtering/UX consistent
        t = special.get("type")
        code = (special.get("code") or "").lower()
        if t == "language":
            for it in items:
                it["language"] = it.get("language") or code
        else:
            # derive ISO2 country prefix for subdivision/city codes like "in-ka"
            cc = code.split("-", 1)[0] if "-" in code else code[:2]
            cc = re.sub(r"[^a-z]", "", cc.lower())
            for it in items:
                it["country"] = it.get("country") or cc
    else:
        # Fallback: full index with text search
        items = await _load_channels(force=refresh)

        # apply search filter first (nice to narrow validation scope)
        if q:
            ql = q.lower()
            items = [
                it for it in items
                if (it.get("name") and ql in it.get("name", "").lower())
                or (it.get("group") and ql in it.get("group", "").lower())
                or (it.get("country") and ql in (it.get("country") or "").lower())
                or (it.get("language") and ql in (it.get("language") or "").lower())
            ]

    # pagination
    total = len(items)
    start = (page - 1) * limit
    end = start + limit
    page_items = items[start:end]

    # if validate flag set, run validation for page_items; otherwise rely on validated_map if available
    if validate:
        await validate_channels_for_list(page_items)

    # assemble Channel models and attach validation info from cache (if any)
    out: List[Channel] = []
    for it in page_items:
        url = it.get("url")
        vald = _channels_cache["validated_map"].get(url) if url else None
        ch = Channel(
            id=it.get("id"),
            name=it.get("name"),
            tvg_id=it.get("tvg_id"),
            tvg_name=it.get("tvg_name"),
            tvg_logo=it.get("tvg_logo"),
            group=it.get("group"),
            language=it.get("language"),
            country=it.get("country"),
            url=url,
            working=vald.get("working") if vald else None,
            hls_compatible=vald.get("hls_compatible") if vald else None,
            last_checked=vald.get("last_checked") if vald else None,
            check_error=vald.get("check_error") if vald else None,
        )
        out.append(ch)

    # If working_only requested, filter by working==True. If no validation was done and working flags are None,
    # then being strict would return empty — therefore if working_only we force validation for items missing validated info.
    if working_only:
        # find items missing validation in the current out set
        missing_validation_urls = [c.url for c in out if c.url and _channels_cache["validated_map"].get(c.url) is None]
        if missing_validation_urls:
            # validate those
            to_validate = [it for it in page_items if it.get("url") in missing_validation_urls]
            await validate_channels_for_list(to_validate)
            # rebuild out
            new_out = []
            for it in page_items:
                url = it.get("url")
                vald = _channels_cache["validated_map"].get(url) if url else None
                ch = Channel(
                    id=it.get("id"),
                    name=it.get("name"),
                    tvg_id=it.get("tvg_id"),
                    tvg_name=it.get("tvg_name"),
                    tvg_logo=it.get("tvg_logo"),
                    group=it.get("group"),
                    language=it.get("language"),
                    country=it.get("country"),
                    url=url,
                    working=vald.get("working") if vald else None,
                    hls_compatible=vald.get("hls_compatible") if vald else None,
                    last_checked=vald.get("last_checked") if vald else None,
                    check_error=vald.get("check_error") if vald else None,
                )
                new_out.append(ch)
            out = new_out
        # now filter
        out = [c for c in out if c.working]

    return out

@app.get("/api/v1/channels/count")
async def channels_count(q: Optional[str] = None):
    # If q resolves to a specific playlist, count from that playlist directly
    special = await _resolve_playlist_for_query(q) if q else None
    if special and special.get("url"):
        text = await _fetch_text(special["url"])
        items = parse_m3u_index(text)
        return {"total": len(items)}

    # Otherwise count from full index with text search
    items = await _load_channels()
    if q:
        ql = q.lower()
        items = [
            it for it in items
            if (it.get("name") and ql in it.get("name", "").lower())
            or (it.get("group") and ql in it.get("group", "").lower())
            or (it.get("country") and ql in (it.get("country") or "").lower())
            or (it.get("language") and ql in (it.get("language") or "").lower())
        ]
    total = len(items)
    return {"total": total}


@app.get("/api/v1/channels/summary")
async def channels_summary():
    """
    Quick summary: total channels parsed, validated count, working count, last_loaded.
    """
    items = await _load_channels()
    parsed_count = len(items)
    validated_map = _channels_cache["validated_map"]
    validated_count = len(validated_map)
    working_count = sum(1 for v in validated_map.values() if v.get("working"))
    return {
        "parsed_count": parsed_count,
        "validated_count": validated_count,
        "working_count": working_count,
        "last_loaded": _channels_cache["last_loaded"].isoformat() if _channels_cache["last_loaded"] else None,
    }

@app.get("/api/v1/debug/sample")
async def debug_sample(n: int = Query(5, ge=1, le=100)):
    """
    Return a small sample of parsed channels and counts of non-null language/country
    to help verify parser output quickly.
    """
    items = await _load_channels()
    n = min(max(n, 1), 100)
    sample_src = items[:n]
    sample = [
        {
            "name": it.get("name"),
            "tvg_logo": it.get("tvg_logo"),
            "url": it.get("url"),
            "language": it.get("language"),
            "country": it.get("country"),
            "group": it.get("group"),
        }
        for it in sample_src
    ]
    nonnull_language = sum(1 for it in items if (it.get("language") or "").strip())
    nonnull_country = sum(1 for it in items if (it.get("country") or "").strip())
    return {
        "total": len(items),
        "sample_count": len(sample),
        "nonnull_language": nonnull_language,
        "nonnull_country": nonnull_country,
        "sample": sample,
    }
