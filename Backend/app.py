from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import re
import pycountry
import langcodes

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

M3U_BASE = "https://iptv-org.github.io/iptv"
M3U_ALL = f"{M3U_BASE}/index.m3u"
ATTR_RE = re.compile(r'(\w[\w-]*)="(.*?)"')



def parse_m3u(text: str):
    """
    Parse .m3u playlist text and return a list of channels
    Each channel = {name, logo, url, tvg_language, tvg_country, group_title}
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    attrs = {}
    name = logo = None

    for ln in lines:
        if ln.startswith("#EXTINF:"):
            attrs = {k.lower(): v for k, v in ATTR_RE.findall(ln)}
            # Channel display name after the first comma
            if "," in ln:
                name = ln.split(",", 1)[1].strip()
            else:
                name = attrs.get("tvg-name") or attrs.get("tvg-id") or "Unknown"
            logo = attrs.get("tvg-logo")

        elif ln.startswith("http"):
            yield {
                "name": name or "Unknown",
                "logo": logo,
                "url": ln,
                "tvg_language": attrs.get("tvg-language"),
                "tvg_country": attrs.get("tvg-country"),
                "group_title": attrs.get("group-title"),
            }
            attrs = {}
            name = logo = None


# ✅ Utility functions to resolve country/lang to code
def sanitize(s: str) -> str:
    return re.sub(r"[^A-Za-z ]+", "", (s or "").strip()).lower()


def resolve_country_to_iso2(user: str) -> str | None:
    if not user:
        return None
    key = user.strip()
    if len(key) == 2 and key.isalpha():
        return key.lower()
    key_norm = sanitize(key)
    try:
        country = pycountry.countries.lookup(key_norm)
        return country.alpha_2.lower()
    except Exception:
        pass
    first = key_norm.split()[0] if key_norm else ""
    if first:
        try:
            country = pycountry.countries.lookup(first)
            return country.alpha_2.lower()
        except Exception:
            pass
    return None


def resolve_language_to_code(user: str) -> str | None:
    if not user:
        return None
    key = user.strip()
    if len(key) == 3 and key.isalpha():
        return key.lower()
    try:
        info = langcodes.find(key)
        alpha3 = info.to_alpha3()
        if alpha3:
            return alpha3.lower()
    except Exception:
        pass
    try:
        lang = pycountry.languages.get(name=key.title())
        if lang and getattr(lang, "alpha_3", None):
            return lang.alpha_3.lower()
    except Exception:
        pass
    if len(key) == 2 and key.isalpha():
        try:
            info = langcodes.find(key)
            return info.to_alpha3().lower()
        except Exception:
            pass
    return None


def fetch_m3u(url: str) -> str:
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        return r.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch playlist: {e}")


@app.get("/channels")
def get_all_channels():
    text = fetch_m3u(M3U_ALL)
    channels = list(parse_m3u(text))
    return {"count": len(channels), "channels": channels}


@app.get("/languages/{lang}")
def channels_by_language(lang: str):
    code = resolve_language_to_code(lang) or lang.strip().lower()
    code = re.sub(r"[^a-z]", "", code)[:5]
    url = f"{M3U_BASE}/languages/{code}.m3u"
    text = fetch_m3u(url)
    channels = list(parse_m3u(text))
    if not channels:
        return {"count": 0, "channels": [], "message": f"No channels available for '{lang}'."}
    return {"count": len(channels), "channels": channels}


@app.get("/countries/{country}")
def channels_by_country(country: str):
    iso = resolve_country_to_iso2(country) or country.strip()[:2].lower()
    iso = re.sub(r"[^a-z]", "", iso)[:2]
    url = f"{M3U_BASE}/countries/{iso}.m3u"
    text = fetch_m3u(url)
    channels = list(parse_m3u(text))
    if not channels:
        return {"count": 0, "channels": [], "message": f"No channels available for '{country}'."}
    return {"count": len(channels), "channels": channels}
