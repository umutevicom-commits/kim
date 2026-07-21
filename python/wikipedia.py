"""
Wikipedia API client for fetching Turkish article content.

Fetches summaries, categories, and related data from the Turkish Wikipedia
REST API and the MediaWiki Action API. All network access is optional:
if the API is unreachable, callers fall back to the bundled static pool.
"""

from __future__ import annotations

import json
import logging
import random
import time
import urllib.parse
import urllib.request
from typing import Any

log = logging.getLogger("wikipedia")

WIKI_API = "https://tr.wikipedia.org/w/api.php"
WIKI_REST = "https://tr.wikipedia.org/api/rest_v1/page/summary/"
USER_AGENT = "KimMilyonerOlmakIster/1.0 (educational quiz generator; contact: dev@example.com)"

TIMEOUT = 10
DELAY = 0.5  # seconds between requests to avoid 429


def _get(url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Perform a GET request and return parsed JSON. Returns {} on failure."""
    full = url
    if params:
        full = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        time.sleep(DELAY)
        return data
    except Exception as exc:  # noqa: BLE001
        log.warning("Wikipedia request failed for %s: %s", full, exc)
        time.sleep(DELAY * 2)
        return {}


def get_summary(title: str) -> dict[str, Any]:
    """Fetch the REST summary for a single article title."""
    safe = urllib.parse.quote(title.replace(" ", "_"))
    return _get(f"{WIKI_REST}{safe}")


def random_titles(count: int = 20, namespace: int = 0) -> list[str]:
    """Fetch `count` random article titles from namespace 0 (main)."""
    data = _get(WIKI_API, {
        "action": "query",
        "format": "json",
        "list": "random",
        "rnnamespace": namespace,
        "rnlimit": str(count),
    })
    return [p["title"] for p in data.get("query", {}).get("random", []) if "title" in p]


def category_members(category: str, limit: int = 50) -> list[str]:
    """Fetch member titles of a Wikipedia category."""
    data = _get(WIKI_API, {
        "action": "query",
        "format": "json",
        "list": "categorymembers",
        "cmtitle": f"Kategori:{category}",
        "cmlimit": str(limit),
        "cmtype": "page",
    })
    return [m["title"] for m in data.get("query", {}).get("categorymembers", []) if m.get("ns") == 0]


def fetch_summaries(titles: list[str]) -> list[dict[str, Any]]:
    """Fetch summaries for a list of titles, returning rich article dicts."""
    out: list[dict[str, Any]] = []
    for title in titles:
        s = get_summary(title)
        if not s or s.get("type") == "disambiguation":
            continue
        extract = (s.get("extract") or "").strip()
        if len(extract) < 80:
            continue
        out.append({
            "title": s.get("title") or title,
            "extract": extract,
            "description": s.get("description") or "",
            "categories": _page_categories(title),
        })
    return out


def _page_categories(title: str) -> list[str]:
    """Fetch the categories for a single page (used for distractor sourcing)."""
    data = _get(WIKI_API, {
        "action": "query",
        "format": "json",
        "prop": "categories",
        "titles": title,
        "cllimit": "10",
    })
    pages = data.get("query", {}).get("pages", {})
    cats: list[str] = []
    for page in pages.values():
        for c in page.get("categories", []):
            cat = c.get("title", "").replace("Kategori:", "")
            if cat and "Gizli" not in cat and "Vikisel" not in cat:
                cats.append(cat)
    return cats


def pick_interesting(count: int = 40) -> list[dict[str, Any]]:
    """Fetch a batch of random articles and return the ones with usable extracts."""
    titles = random_titles(count=count * 2)
    random.shuffle(titles)
    summaries = fetch_summaries(titles[:count])
    return summaries
