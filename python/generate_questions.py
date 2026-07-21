"""
Question generation.

Consumes Wikipedia article summaries and turns them into multiple-choice
quiz questions. Each question has one correct answer and three plausible
distractors produced by `distractor.make_distractors`. A small set of
hand-authored templates cover the common article shapes (person, place,
year, work, concept) so the output reads like a real quiz, not a raw
Wikipedia extract.
"""

from __future__ import annotations

import hashlib
import random
import re
from dataclasses import dataclass
from typing import Any

from distractor import make_distractors

YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b")
CAPITAL_RE = re.compile(r"başkenti\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)", re.IGNORECASE)


@dataclass
class Question:
    id: str
    difficulty: int          # 1..15
    tier: str                # human-readable tier name
    category: str
    question: str
    correct: str
    options: list[str]       # 4 entries, shuffled, includes correct
    source: str              # article title used as source

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "difficulty": self.difficulty,
            "tier": self.tier,
            "category": self.category,
            "question": self.question,
            "correct": self.correct,
            "options": self.options,
            "source": self.source,
        }


TIERS = [
    (1, "Kolay"),
    (2, "Kolay"),
    (3, "Kolay"),
    (4, "Orta"),
    (5, "Orta"),
    (6, "Orta"),
    (7, "Zor"),
    (8, "Zor"),
    (9, "Zor"),
    (10, "Çok Zor"),
    (11, "Çok Zor"),
    (12, "Uzman"),
    (13, "Uzman"),
    (14, "Profesör"),
    (15, "Final"),
]


def _hash_id(*parts: str) -> str:
    h = hashlib.sha1("::".join(parts).encode("utf-8")).hexdigest()
    return h[:12]


def _find_year(text: str) -> str | None:
    m = YEAR_RE.search(text)
    return m.group(1) if m else None


def _article_kind(article: dict[str, Any]) -> str:
    desc = (article.get("description") or "").lower()
    extract = (article.get("extract") or "").lower()
    if any(k in desc for k in ["şehir", "başkent", "metropol"]):
        return "place"
    if any(k in desc for k in ["ülke", "devlet", "cumhuriyet"]):
        return "country"
    if any(k in desc for k in ["doğmuş", "yazar", "besteci", "ressam", "bilim", "filozof", "devlet adamı", "siyasetçi", "kral", "imparator"]):
        return "person"
    if any(k in extract for k in ["doğdu", "doğumlu", "öldü", "vefat"]):
        return "person"
    if any(k in desc for k in ["roman", "kitap", "film", "şiir", "senfoni", "tablo"]):
        return "work"
    if any(k in extract for k in ["kuram", "teori", "kanun", "denklem"]):
        return "concept"
    return "general"


def _shorten(text: str, max_words: int = 14) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).strip(" ,.;:") + "…"


def build_question(article: dict[str, Any], difficulty: int, siblings: list[str] | None = None) -> Question | None:
    """Build a single Question from a Wikipedia article, or None if it doesn't fit."""
    title = article.get("title") or ""
    extract = (article.get("extract") or "").strip()
    desc = (article.get("description") or "").strip()
    if not extract or len(extract) < 80:
        return None

    kind = _article_kind(article)
    tier_name = next((t for d, t in TIERS if d == difficulty), "Kolay")
    context = f"{title} {desc} {extract}"

    q_text: str = ""
    correct: str = ""

    if kind == "person":
        year = _find_year(extract)
        if year and random.random() < 0.5:
            q_text = f"{title} ile ilgili aşağıdakilerden hangisi doğrudur? ({_shorten(extract, 10)})"
            correct = year
            from distractor import _distractor_years  # local import to avoid cycle
            opts = _distractor_years(year)
            opts.append(year)
            random.shuffle(opts)
        else:
            q_text = f"Bu kişi kimdir? {_shorten(extract)}"
            correct = title
            opts = make_distractors(correct, context, siblings) + [correct]
            random.shuffle(opts)
    elif kind == "place":
        q_text = f"Hangi şehir {_shorten(extract, 12)}?"
        correct = title
        opts = make_distractors(correct, context, siblings) + [correct]
        random.shuffle(opts)
    elif kind == "country":
        q_text = f"Hangi ülke {_shorten(extract, 12)}?"
        correct = title
        opts = make_distractors(correct, context, siblings) + [correct]
        random.shuffle(opts)
    elif kind == "work":
        q_text = f"Aşağıdaki eserlerden hangisi {_shorten(extract, 12)}?"
        correct = title
        opts = make_distractors(correct, context, siblings) + [correct]
        random.shuffle(opts)
    elif kind == "concept":
        q_text = f"Aşağıdakilerden hangisi {_shorten(extract, 12)} ile ilgili bir kavramdır?"
        correct = title
        opts = make_distractors(correct, context, siblings) + [correct]
        random.shuffle(opts)
    else:
        # General: ask which entity the extract describes.
        q_text = f"Aşağıdaki ifadelerden hangisi {_shorten(extract, 12)} bağlamında doğrudur?"
        correct = title
        opts = make_distractors(correct, context, siblings) + [correct]
        random.shuffle(opts)

    return Question(
        id=_hash_id(title, q_text),
        difficulty=difficulty,
        tier=tier_name,
        category=kind,
        question=q_text,
        correct=correct,
        options=opts,
        source=title,
    )


def assign_difficulty(questions: list[Question]) -> list[Question]:
    """Re-balance a flat list so each difficulty tier (1..15) is represented."""
    by_diff: dict[int, list[Question]] = {d: [] for d, _ in TIERS}
    for q in questions:
        by_diff.setdefault(q.difficulty, []).append(q)
    out: list[Question] = []
    for d, _ in TIERS:
        pool = by_diff.get(d, [])
        if pool:
            random.shuffle(pool)
            out.extend(pool)
    return out
