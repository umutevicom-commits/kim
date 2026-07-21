"""
Distractor generation.

Given a correct answer and optional context (the article extract and a pool
of related titles), produce three plausible but incorrect options. Distractors
are drawn from sibling Wikipedia titles and a curated static pool so the result
is always sensible, never absurd.
"""

from __future__ import annotations

import random
import re
from typing import Any

# Static pools keyed by rough category. These are used as a guaranteed source
# of plausible distractors when the live Wikipedia pool is unavailable or too
# small. Values are real, well-known entities so the options always feel fair.
STATIC_POOL: dict[str, list[str]] = {
    "ülke": ["Almanya", "Fransa", "İtalya", "İspanya", "Rusya", "İngiltere", "Japonya", "Kanada", "Brezilya", "Mısır", "Hindistan", "Çin", "Arjantin", "Polonya", "İsveç", "Norveç", "Yunanistan", "Portekiz", "Meksika", "Güney Kore"],
    "şehir": ["İstanbul", "Ankara", "İzmir", "Paris", "Londra", "Roma", "Berlin", "Madrid", "Tokyo", "New York", "Moskova", "Kahire", "Atina", "Viyana", "Budapeşte", "Amsterdam", "Brüksel", "Lizbon", "Stockholm", "Oslo"],
    "kişi": ["Mustafa Kemal Atatürk", "Albert Einstein", "Isaac Newton", "Nikola Tesla", "Marie Curie", "Charles Darwin", "Leonardo da Vinci", "William Shakespeare", "Mozart", "Beethoven", "Pablo Picasso", "Vincent van Gogh", "Galileo Galilei", "Pythagoras", "Sokrates", "Platon", "Aristoteles", "Cicero", "Napoleon Bonaparte", "Winston Churchill"],
    "yıl": ["1453", "1492", "1789", "1815", "1869", "1903", "1914", "1918", "1939", "1945", "1969", "1989", "2000", "1923", "1776", "1517", "1783", "1848", "1879", "1929"],
    "eser": ["İlyada", "Odysseia", "Divine Comedy", "Hamlet", "Don Kişot", "Sefiller", "Suç ve Ceza", "Savaş ve Barış", "Anna Karenina", "Robinson Crusoe", "Gulliver'in Gezileri", "Frankenstein", "Dracula", "1984", "Cesur Yeni Dünya", "Küçük Prens", "Simyacı", "Nutuk", "Tutunamayanlar", "Beyaz Geceler"],
    "bilim": ["Kuantum mekaniği", "Görelilik kuramı", "Evrim kuramı", "Elektromanyetizma", "Termodinamik", "Hücre teorisi", "Germ teorisi", "DNA", "Big Bang", "Kara delik", "Radyoaktivite", "Periyodik tablo", "Atom teorisi", "Yerçekimi", "Işık hızı", "Entropi", "Fotosentez", "Ozon tabakası", "Kütle-enerji eşdeğerliği", "Süperiletkenlik"],
    "coğrafya": ["Akdeniz", "Karadeniz", "Ege Denizi", "Atlas Okyanusu", "Pasifik Okyanusu", "Hint Okyanusu", "Sahra Çölü", "Himalayalar", "Alpler", "And Dağları", "Rocky Dağları", "Amazon Nehri", "Nil Nehri", "Tuna Nehri", "Volga Nehri", "Kızılderme", "Bering Boğazı", "Cebelitarık Boğazı", "Süveyş Kanalı", "Panama Kanalı"],
    "genel": ["Ankara", "İzmir", "Bursa", "Antalya", "Konya", "Samsun", "Trabzon", "Edirne", "Gaziantep", "Diyarbakır", "Eskişehir", "Kayseri", "Mersin", "Samsun", "Denizli", "Sakarya", "Muğla", "Aydın", "Tekirdağ", "Balıkesir"],
}

CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("ülke", ["ülke", "devlet", "cumhuriyet", "krallık", "imparatorluk", "federasyon"]),
    ("şehir", ["şehir", "başkent", "metropol", "kent", "belediye"]),
    ("kişi", ["doğdu", "öldü", "bilim insanı", "yazar", "şair", "ressam", "besteci", "devlet adamı", "cumhurbaşkanı", "padişah", "kral", "imparator", "filozof", "matematikçi", "fizikçi", "kimyager", "biyolog", "astronom"]),
    ("yıl", ["yıl", "tarih", "yüzyıl", "miladi"]),
    ("eser", ["roman", "kitap", "şiir", "oyun", "senfoni", "tablo", "heykel", "film", "opera"]),
    ("bilim", ["teori", "kuram", "kanun", "denklem", "element", "atom", "molekül", "hücre", "gen", "protein"]),
    ("coğrafya", ["dağ", "nehir", "deniz", "okyanus", "göl", "çöl", "boğaz", "kanal", "ada", "yarımada"]),
]


def classify(text: str) -> str:
    """Best-effort category classification for a piece of text."""
    low = text.lower()
    for cat, kws in CATEGORY_KEYWORDS:
        if any(k in low for k in kws):
            return cat
    return "genel"


def _year_like(value: str) -> bool:
    return bool(re.fullmatch(r"\d{3,4}", value.strip()))


def _distractor_years(correct: str) -> list[str]:
    base = int(correct)
    candidates: list[int] = set()  # type: ignore[assignment]
    pool: set[int] = set()
    for delta in (-200, -150, -100, -75, -50, -25, -20, -10, -5, 5, 10, 20, 25, 50, 75, 100, 150, 200):
        pool.add(base + delta)
    pool.discard(base)
    return [str(y) for y in random.sample(list(pool), 3)]


def make_distractors(correct: str, context: str = "", siblings: list[str] | None = None) -> list[str]:
    """Return exactly three plausible distractors for `correct`."""
    correct_clean = correct.strip()
    if _year_like(correct_clean):
        return _distractor_years(correct_clean)

    cat = classify(f"{correct_clean} {context}")
    pool: list[str] = list(STATIC_POOL.get(cat, STATIC_POOL["genel"]))
    if siblings:
        pool.extend(siblings)

    # De-duplicate, drop the correct answer, drop near-duplicates of it.
    seen: set[str] = {correct_clean.lower()}
    unique: list[str] = []
    for item in pool:
        low = item.strip().lower()
        if low in seen:
            continue
        if correct_clean.lower() in low or low in correct_clean.lower():
            continue
        seen.add(low)
        unique.append(item.strip())

    if len(unique) < 3:
        # Top up from the general pool.
        for item in STATIC_POOL["genel"]:
            low = item.lower()
            if low not in seen:
                seen.add(low)
                unique.append(item)
            if len(unique) >= 3:
                break

    random.shuffle(unique)
    return unique[:3]
