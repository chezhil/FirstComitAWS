"""Aas-Paas query parser Lambda.

POST /parse  ->  { "query": "any tiffin service open right now that's cheap" }

Parses a natural-language query into structured search filters using a
Strands Agents agent with structured (Pydantic) output. The "AI agent"
path is primary; if no model provider is configured or the invocation
fails (no creds, Ollama down, etc.), it degrades to a deterministic
rule-based fallback so the API never breaks during a demo.

Deployed via AWS SAM (template owned by Person 1 / backend/infra) as
ParserFunction with handler `app.lambda_handler`.

Env vars:
  PARSE_MODEL_PROVIDER : "bedrock" (default) | "groq" | "gemini" | "ollama" | "fallback"
  BEDROCK_MODEL_ID     : Bedrock model to use (default claude sonnet 4)
  GEMINI_API_KEY       : required when provider is "gemini"
  GEMINI_MODEL         : gemini-3.6-flash
  GROQ_API_KEY         : required when provider is "groq"
  GROQ_MODEL           : openai/gpt-oss-20b
  OLLAMA_HOST          : http://localhost:11434
  OLLAMA_MODEL         : llama3.1
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Any, Optional

logger = logging.getLogger("aaspaas.parser")
if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s | %(name)s | %(message)s",
    )

CATEGORIES = (
    "pg", "mess", "tiffin", "food", "bar", "grocery", "print_shop", "atm",
    "pharmacy", "medical", "gym", "salon", "laundry", "transport", "other",
)
SORTS = ("cheapest", "nearest", "rating")

# 2km left ATMs and print shops returning nothing in less dense areas;
# 3km covers them without dragging in the next neighbourhood.
DEFAULT_RADIUS_KM = 3.0
MAX_RADIUS_KM = 50.0

try:  # pydantic is a strands dependency; guard anyway for the fallback path
    from pydantic import BaseModel, Field
except Exception:  # pragma: no cover - pydantic ships with strands-agents
    BaseModel = None  # type: ignore
    Field = None  # type: ignore


def _build_output_schema():
    if BaseModel is None:
        return None

    class ParseOutput(BaseModel):
        """Structured search filters extracted from a raw query."""

        category: Optional[str] = Field(
            default=None,
            description=(
                "One of: pg, mess, tiffin, food, bar, grocery, print_shop, atm, "
                "pharmacy, medical, gym, salon, laundry, transport, other. "
                "Set null only if the query does not clearly map to a category."
            ),
        )
        radius_km: float = Field(
            default=DEFAULT_RADIUS_KM,
            description=(
                "Search radius in kilometres. Default 3.0 when the user does "
                "not mention a distance."
            ),
        )
        open_now: bool = Field(
            default=False,
            description=(
                "True only when the query asks for places open right now, e.g. "
                "'open now', 'currently open', 'open at this time'."
            ),
        )
        sort_by: Optional[str] = Field(
            default=None,
            description=(
                "Preferred ordering: 'cheapest' for cheap/budget, 'nearest' for "
                "closest/nearby, 'rating' for best/top-rated, else null."
            ),
        )
        max_price: Optional[int] = Field(
            default=None,
            description=(
                "Maximum price in rupees the user mentioned (e.g. 'under 50', "
                "'below 5000'), else null. Never invent one."
            ),
        )
        keywords: list[str] = Field(
            default_factory=list,
            description=(
                "Leftover descriptive terms useful for fuzzy text search, e.g. "
                "'veg', 'tiffin', 'colour print', 'shared'."
            ),
        )

    return ParseOutput


_SYSTEM_PROMPT = (
    "You extract structured campus-search filters from a student's short "
    "query. Rules:\n"
    "- category: exactly one of the following, or null when unclear. "
    "pg (PG/hostel), mess (mess/canteen), "
    "tiffin (tiffin/dabba), food (restaurant/cafe/bakery/eating out), "
    "bar (bar/pub/drinks), grocery (supermarket/kirana), "
    "print_shop (print/xerox/photocopy/stationery), atm (ATM/cash), "
    "pharmacy (chemist/medicine), medical (hospital/clinic/doctor), "
    "gym, salon (barber/haircut/spa), laundry (dhobi/dry clean), "
    "transport (bus stop/metro), other.\n"
    "- radius_km: default 3.0. Only change it when the user names a distance "
    "('within 1km', 'near 500m').\n"
    "- open_now: true only for 'open now / right now / currently open'.\n"
    "- sort_by: 'cheapest' for cheap/budget, 'nearest' for closest, 'rating' "
    "for best/top-rated, else null.\n"
    "- max_price: only from an explicit rupee amount ('under 50', 'budget "
    "3000', 'Rs 40'), else null.\n"
    "- keywords: leftover descriptive words for fuzzy search; always include "
    "the category word. Never return coordinates.\n"
    "Respond only with the structured output."
)


def _create_agent(provider=None, model=None, api_key=None):
    """Create a Strands agent for a provider (or None to use the fallback).

    Values default to the server's own configuration; a caller may override
    them per request so someone can bring their own key and model without
    the server's key ever reaching the browser.
    """
    provider = (provider or os.environ.get("PARSE_MODEL_PROVIDER", "bedrock")).strip().lower()
    if provider == "fallback":
        return None

    from strands import Agent

    kwargs: dict[str, Any] = {"callback_handler": None}  # silence console spam

    if provider == "ollama":
        from strands.models.ollama import OllamaModel

        kwargs["model"] = OllamaModel(
            host=os.environ.get("OLLAMA_HOST", "http://localhost:11434"),
            model_id=model or os.environ.get("OLLAMA_MODEL", "llama3.1"),
            temperature=0,
        )
    elif provider == "gemini":
        from strands.models.gemini import GeminiModel

        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("PARSE_MODEL_PROVIDER=gemini but GEMINI_API_KEY is unset")

        kwargs["model"] = GeminiModel(
            client_args={"api_key": api_key},
            model_id=model or os.environ.get("GEMINI_MODEL", "gemini-3.6-flash"),
            params={"temperature": 0},
        )
    elif provider == "groq":
        # Groq speaks the OpenAI wire format, so the OpenAI provider works
        # against it with a base_url override. Chosen for a far higher free
        # tier than Gemini's, which throttles after a few dozen parses.
        from strands.models.openai import OpenAIModel

        api_key = api_key or os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ValueError("PARSE_MODEL_PROVIDER=groq but GROQ_API_KEY is unset")

        kwargs["model"] = OpenAIModel(
            client_args={
                "api_key": api_key,
                "base_url": os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            },
            # Must be a Groq model that supports tool use, since the parser
            # relies on structured output. Check Groq's current model list --
            # they retire ids periodically.
            model_id=model or os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b"),
            params={"temperature": 0},
        )
    elif provider == "bedrock":
        from strands.models import BedrockModel

        kwargs["model"] = BedrockModel(
            model_id=model or os.environ.get(
                "BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-4-6"
            ),
            temperature=0,
        )
    # else: fall through to Strands' default (Bedrock).

    return Agent(**kwargs)


_AGENT: Any = None
_AGENT_ERROR: Optional[str] = None
# A Strands Agent rejects overlapping calls ("Agent is already processing a
# request"). One Lambda container only ever handles one request at a time, so
# this never bites in production, but any threaded host -- a local dev server,
# a test harness -- would otherwise see parses fail and silently fall back.
_AGENT_LOCK = threading.Lock()

# Queries repeat heavily ("pg", "atm near me", the example chips), and each
# agent parse costs 1-4 model calls -- enough to exhaust a free tier during a
# demo. Identical queries are answered from here instead. Warm-instance only;
# a cold start just re-earns the entries.
_PARSE_CACHE: dict[str, dict[str, Any]] = {}
_PARSE_CACHE_MAX = 512
_CACHE_LOCK = threading.Lock()


def _cache_key(query: str) -> str:
    return " ".join(query.lower().split())


# One agent per (provider, model, key) so a caller's own settings don't
# disturb the server default, and neither is rebuilt on every request.
_AGENTS: dict[tuple, Any] = {}
_AGENT_ERRORS: dict[tuple, str] = {}


def _get_agent(provider=None, model=None, api_key=None) -> Any:
    """Lazily build an agent for this configuration; None if unavailable."""
    key = (
        (provider or os.environ.get("PARSE_MODEL_PROVIDER", "bedrock")).strip().lower(),
        model or "",
        # Only distinguishes callers; never logged or returned.
        hash(api_key or ""),
    )
    if key in _AGENT_ERRORS:
        return None
    if key not in _AGENTS:
        try:
            _AGENTS[key] = _create_agent(provider, model, api_key)
        except Exception as exc:  # noqa: BLE001 - degrade gracefully
            _AGENT_ERRORS[key] = str(exc)
            logger.warning(
                "Strands agent unavailable (%s); using deterministic fallback", exc
            )
            return None
    return _AGENTS[key]


# ---------------------------------------------------------------------------
# Deterministic fallback (heuristic)
# ---------------------------------------------------------------------------

_STOPWORDS = {
    "a", "an", "any", "the", "is", "at", "my", "i", "me", "and", "or", "to",
    "of", "for", "with", "that", "this", "which", "service", "services",
    "place", "places", "shop", "shops", "open", "now", "right", "currently",
    "still", "looking", "need", "want", "there", "what", "where", "please",
    "find", "nearby", "around", "some", "one", "who", "does", "do", "are",
    "it", "its", "under", "within", "than", "less", "above", "best", "good",
    "top", "rated", "rating", "cheap", "cheapest", "budget", "affordable",
    "cheaper", "inexpensive", "close", "closest", "near", "nearest", "can", "rupees", "rs", "per",
}

_CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("pg", ("pg", "hostel", "paying guest", "room for rent", "accommodation")),
    ("tiffin", ("tiffin", "dabba", "home food", "tiffin service")),
    ("mess", ("mess", "canteen")),
    (
        "print_shop",
        ("print", "xerox", "photocopy", "photostat", "printing", "printout",
         "print out", "print shop", "stationery"),
    ),
    ("atm", ("atm", "cash", "withdraw", "withdrawal", "cashpoint")),
    ("pharmacy", ("pharmacy", "chemist", "medical store", "medicine", "drugstore")),
    (
        "medical",
        ("hospital", "clinic", "doctor", "dentist", "dental", "emergency"),
    ),
    ("bar", ("bar", "pub", "beer", "drinks", "brewery")),
    (
        "grocery",
        ("grocery", "supermarket", "kirana", "provisions", "vegetables",
         "groceries", "convenience store"),
    ),
    ("gym", ("gym", "fitness", "workout")),
    ("salon", ("salon", "barber", "haircut", "parlour", "parlor", "spa", "beauty")),
    ("laundry", ("laundry", "dhobi", "dry clean", "dry cleaning", "washing")),
    (
        "transport",
        ("bus stop", "bus", "metro", "station", "auto stand"),
    ),
    (
        "food",
        ("restaurant", "cafe", "coffee", "food", "eat", "dining", "eatery",
         "lunch", "dinner", "breakfast", "meals", "snacks", "bakery",
         "ice cream", "hotel"),
    ),
]

_OPEN_NOW_RE = re.compile(
    r"\b(open now|right now|currently open|open currently|open at this|"
    r"still open|open right now|open these|working now)\b",
    re.IGNORECASE,
)
_RADIUS_KM_RE = re.compile(
    r"(?:within|inside|near|around|under)\s*(\d+(?:\.\d+)?)\s*kms?",
    re.IGNORECASE,
)
_RADIUS_M_RE = re.compile(
    r"(?:within|inside|near|around|under)\s*(\d+)\s*m(?!etre|b|m)",
    re.IGNORECASE,
)
_PRICE_RE = re.compile(
    r"(?:under|below|less than|cheaper than|max|at most|budget of)\s*"
    r"[rRsS\u20b9\s]*(\d+)",
    re.IGNORECASE,
)
_PRICE_RS_RE = re.compile(r"(?:rs\.?|rupees|inr|\u20b9)\s*(\d+)", re.IGNORECASE)
_DIST_AFTER_RE = re.compile(
    r"\s*(?:kms?|kilometers?|kilometres?|metres?|meters?|m)\b",
    re.IGNORECASE,
)
_CHEAP_RE = re.compile(
    r"\b(cheap|cheapest|budget|affordable|inexpensive|cheaper|low cost|"
    r"value for money)\b",
    re.IGNORECASE,
)
_RATING_RE = re.compile(
    r"\b(best|top rated|top-rated|highest rated|highly rated|good rating|"
    r"well rated)\b",
    re.IGNORECASE,
)
_NEAREST_RE = re.compile(r"\b(closest|nearest)\b", re.IGNORECASE)

# Deliberately broad: any hint the user cares about *when* a place is open.
# Used only to catch a model inventing open_now on a query with no time
# wording at all, so it stays permissive about phrasings we can't enumerate.
_TIME_HINT_RE = re.compile(
    r"\b(now|open|opens|opening|closed?|closing|currently|current|today|"
    r"tonight|late|early|midnight|noon|morning|evening|night|hour|hours|"
    r"24x7|24/7|am|pm|time)\b",
    re.IGNORECASE,
)


def _match_category(text: str) -> Optional[str]:
    for category, needles in _CATEGORY_KEYWORDS:
        for needle in needles:
            if re.search(rf"\b{re.escape(needle)}s?\b", text, re.IGNORECASE):
                return category
    return None


def _heuristic_parse(query: str) -> dict[str, Any]:
    text = query.strip()

    open_now = bool(_OPEN_NOW_RE.search(text))
    radius_km = DEFAULT_RADIUS_KM
    max_price: Optional[int] = None
    sort_by: Optional[str] = None

    m = _RADIUS_KM_RE.search(text)
    if m:
        radius_km = float(m.group(1))
    else:
        m = _RADIUS_M_RE.search(text)
        if m:
            radius_km = max(0.1, float(m.group(1)) / 1000.0)

    for rx in (_PRICE_RE, _PRICE_RS_RE):
        m = rx.search(text)
        # "under 5 km" is a distance, not a price — skip when a unit follows.
        if m and not _DIST_AFTER_RE.match(m.string, m.end(1)):
            max_price = int(m.group(1))
            break

    if _CHEAP_RE.search(text):
        sort_by = "cheapest"
    elif _RATING_RE.search(text):
        sort_by = "rating"
    elif _NEAREST_RE.search(text):
        sort_by = "nearest"

    category = _match_category(text)

    keywords: list[str] = []
    for token in re.findall(r"[a-z0-9]+", text.lower()):
        if token[0].isdigit():
            continue
        if token in _STOPWORDS or len(token) < 3:
            continue
        if token not in keywords:
            keywords.append(token)
    if category:
        seed = {"tiffin": "tiffin", "print_shop": "print", "atm": "atm",
                "pg": "pg", "mess": "mess"}.get(category, category)
        if seed not in keywords:
            keywords.insert(0, seed)
    keywords = keywords[:8]

    return {
        "category": category,
        "radius_km": radius_km,
        "open_now": open_now,
        "sort_by": sort_by,
        "max_price": max_price,
        "keywords": keywords,
    }


# ---------------------------------------------------------------------------
# Public API used by the Lambda handler and tests
# ---------------------------------------------------------------------------

def _reconcile_with_rules(query: str, filters: dict[str, Any]) -> dict[str, Any]:
    """Correct model output for the two purely lexical signals.

    open_now and sort_by depend only on whether the user used certain words,
    so the regexes are more trustworthy there than a small model -- which was
    observed inventing open_now on queries with no time wording, and missing
    'best rated'. Category and keywords are left to the model, which is what
    it's actually better at.
    """
    if filters.get("open_now") and not _TIME_HINT_RE.search(query):
        filters["open_now"] = False

    cheap = _CHEAP_RE.search(query)
    rating = _RATING_RE.search(query)
    nearest = _NEAREST_RE.search(query)

    if not (cheap or rating or nearest):
        # No ordering cue in the query at all, so any sort the model picked
        # was invented (observed: "cheapest" on "print shop within 1km").
        filters["sort_by"] = None
    elif filters.get("sort_by") not in SORTS:
        filters["sort_by"] = (
            "cheapest" if cheap else "rating" if rating else "nearest"
        )

    return filters


def parse_query(query: str, provider=None, model=None, api_key=None) -> dict[str, Any]:
    """Return structured /parse filters for a free-text query."""
    # Model choice is part of the cache identity: the same words parsed by a
    # different model can legitimately differ.
    key = f"{provider or ''}|{model or ''}|{_cache_key(query)}"
    with _CACHE_LOCK:
        hit = _PARSE_CACHE.get(key)
    if hit is not None:
        logger.info("Parsed from cache -> %s", json.dumps(hit))
        return dict(hit)

    filters = _parse_uncached(query, provider, model, api_key)

    with _CACHE_LOCK:
        if len(_PARSE_CACHE) >= _PARSE_CACHE_MAX:
            _PARSE_CACHE.clear()  # crude but bounded; this is a demo-scale cache
        _PARSE_CACHE[key] = dict(filters)
    return filters


def _parse_uncached(query: str, provider=None, model=None, api_key=None) -> dict[str, Any]:
    agent = _get_agent(provider, model, api_key)
    schema = _build_output_schema()

    if agent is not None and schema is not None:
        try:
            with _AGENT_LOCK:
                result = agent(
                    query + "\n\n" + _SYSTEM_PROMPT,
                    structured_output_model=schema,
                )
            raw = result.structured_output.model_dump()
            logger.info("Parsed via Strands agent -> %s", json.dumps(raw))
            return _normalize(_reconcile_with_rules(query, raw))
        except Exception as exc:  # noqa: BLE001 - agent failure is not fatal
            logger.warning("Strands parse failed (%s); using fallback", exc)

    raw = _heuristic_parse(query)
    logger.info("Parsed via heuristic fallback -> %s", json.dumps(raw))
    return _normalize(raw)


def _normalize(filters: dict[str, Any]) -> dict[str, Any]:
    category = filters.get("category")
    if category not in CATEGORIES:
        category = None

    sort_by = filters.get("sort_by")
    if sort_by not in SORTS:
        sort_by = None

    try:
        radius_km = float(filters.get("radius_km", DEFAULT_RADIUS_KM))
    except (TypeError, ValueError):
        radius_km = DEFAULT_RADIUS_KM
    if radius_km <= 0:
        radius_km = DEFAULT_RADIUS_KM
    # Nobody walks 200km to a xerox shop, and an unbounded radius just makes
    # the search scan everything ("within 99999 km" parsed literally before).
    radius_km = min(radius_km, MAX_RADIUS_KM)

    max_price = filters.get("max_price")
    if max_price is None:
        pass
    else:
        try:
            max_price = int(max_price)
        except (TypeError, ValueError):
            max_price = None
        if max_price is not None and max_price <= 0:
            max_price = None

    keywords = [
        k for k in (filters.get("keywords") or [])
        if isinstance(k, str) and k.strip()
    ]

    return {
        "category": category,
        "radius_km": radius_km,
        "open_now": bool(filters.get("open_now", False)),
        "sort_by": sort_by,
        "max_price": max_price,
        "keywords": keywords,
    }


class _BadRequest(Exception):
    """Client sent something unparseable; answer 400 rather than 500."""


def _read_body(event: dict[str, Any]) -> dict[str, Any]:
    body = event.get("body") or {}
    if isinstance(body, (str, bytes)):
        if not body:
            return {}
        try:
            parsed = json.loads(body if isinstance(body, str) else body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise _BadRequest(f"body is not valid JSON: {exc}") from exc
        return parsed if isinstance(parsed, dict) else {}
    return body if isinstance(body, dict) else {}


def _respond(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(payload, ensure_ascii=False),
    }


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """API Gateway handler for POST /parse."""
    try:
        if (event.get("httpMethod") or "POST").upper() == "OPTIONS":
            return _respond(200, {})  # CORS preflight
        try:
            payload = _read_body(event)
        except _BadRequest as exc:
            return _respond(400, {"error": str(exc)})
        query = str(payload.get("query") or "").strip()
        if not query:
            return _respond(400, {"error": "missing field: query"})
        settings = payload.get("settings") or {}
        filters = parse_query(
            query,
            provider=settings.get("provider") or None,
            model=settings.get("model") or None,
            api_key=settings.get("api_key") or None,
        )
        return _respond(200, filters)
    except Exception as exc:  # noqa: BLE001 - never crash the endpoint
        logger.exception("Unhandled error in /parse")
        return _respond(500, {"error": str(exc)})


if __name__ == "__main__":
    import sys

    for q in sys.argv[1:] or [
        "any tiffin service open right now that's cheap",
        "print shop within 1km",
    ]:
        print(q, "->", json.dumps(parse_query(q)))