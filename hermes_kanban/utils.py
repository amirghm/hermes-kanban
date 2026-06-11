"""
hermes_kanban.utils
~~~~~~~~~~~~~~~~~~~~

Small helper functions used across the package.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict


def utcnow_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def slugify(text: str, max_length: int = 80) -> str:
    """Convert *text* into a URL-safe slug.

    >>> slugify("Hello World!")
    'hello-world'
    """
    slug = re.sub(r"[^\w\s-]", "", text.lower())
    slug = re.sub(r"[\s_]+", "-", slug).strip("-")
    return slug[:max_length]


def clamp(value: int, lo: int, hi: int) -> int:
    """Clamp *value* between *lo* and *hi* (inclusive)."""
    return max(lo, min(hi, value))


def safe_int(value: Any, default: int = 0) -> int:
    """Try to cast *value* to ``int``, returning *default* on failure."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def merge_dict(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Return a shallow merge of *base* with *override*.

    Values from *override* take precedence.
    """
    merged = dict(base)
    merged.update({k: v for k, v in override.items() if v is not None})
    return merged


def truncate(text: str, length: int = 200, suffix: str = "…") -> str:
    """Truncate *text* to *length* characters, appending *suffix* if truncated."""
    if len(text) <= length:
        return text
    return text[: length - len(suffix)] + suffix
