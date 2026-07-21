"""
Build orchestrator.

Fetches Wikipedia articles -> generates questions -> assigns progressive
difficulty (easy=well-known, hard=obscure) -> writes questions.json.
Falls back to static pool if Wikipedia is unreachable.
"""

from __future__ import annotations

import json
import logging
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from distractor import make_distractors  # noqa: E402
from generate_questions import (  # noqa: E402
    Question,
    TIERS,
    assign_difficulty,
    build_question,
    _hash_id,
)
from wikipedia import pick_interesting, fetch_summaries, random_titles, category_members  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("build")

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "questions.json"

# Tiered seed titles: easy = famous, hard = obscure/niche
EASY_TITLES = [
    "Mustafa Kemal Atatürk", "Albert Einstein", "İstanbul", "Türkiye", "Paris",
    "İkinci Dünya Savaşı", "Ay", "Güneş", "DNA", "Leonardo da Vinci",
    "William Shakespeare", "Napoleon Bonaparte", "Mars", "Satürn",
    "Akdeniz", "Nil Nehri", "Sahra Çölü", "Rönesans", "Mozart", "Beethoven",
    "Pablo Picasso", "Vincent van Gogh", "Charles Darwin", "Isaac Newton",
    "Marie Curie", "Nikola Tesla", "Galileo Galilei", "Sokrates", "Platon", "Aristoteles",
    "Roma", "Londra", "Berlin", "Tokyo", "New York", "Mısır", "Fransa", "Almanya",
    "Birinci Dünya Savaşı", "Fransız Devrimi", "Sanayi Devrimi", "Osmanlı İmparatorluğu",
    "Bizans İmparatorluğu", "Roma İmparatorluğu", "İstanbul'un Fethi", "Kurtuluş Savaşı",
    "Çanakkale Savaşı", "Eyfel Kulesi", "Kolezyum", "Piramitler", "Tac Mahal",
]

MEDIUM_TITLES = [
    "Pisagor", "Herodot", "Hipokrat", "Marco Polo", "İbn-i Sina",
    "Kapadokya", "Pamukkale", "Efes", "Troy", "Göbeklitepe",
    "Çin Seddi", "Moğol İmparatorluğu", "İngiliz İmparatorluğu", "Vikingler",
    "Karl Marx", "Friedrich Nietzsche", "Sigmund Freud", "Immanuel Kant",
    "René Descartes", "Baruch Spinoza", "John Locke", "Jean-Jacques Rousseau",
    "Voltaire", "Montesquieu", "Thomas Hobbes", "David Hume",
    "Süleymaniye Camii", "Selimiye Camii", "Topkapı Sarayı", "Ayasofya",
    "Dolmabahçe Sarayı", "Anıtkabir", "Bogazici Üniversitesi",
    "Manzikert Muharebesi", "Mohaç Muharebesi", "Viyana Kuşatması",
    "Amerikan Bağımsızlık Savaşı", "Soğuk Savaş", "Berlin Duvarı",
    "Küba Füze Krizi", "Vietnam Savaşı", "Kore Savaşı",
    "Süveyş Kanalı", "Panama Kanalı", "Cebelitarık Boğazı", "Bering Boğazı",
    "Himalayalar", "Alpler", "And Dağları", "Rocky Dağları", "Amazon Nehri",
    "Atlas Okyanusu", "Pasifik Okyanusu", "Hint Okyanusu", "Karadeniz",
    "Tuna Nehri", "Volga Nehri", "Ganges Nehri", "Yangtze Nehri",
    "1984 (roman)", "Sefiller", "Suç ve Ceza", "Savaş ve Barış",
    "Hamlet", "İlyada", "Odysseia", "Nutuk", "Tutunamayanlar",
    "Küçük Prens", "Simyacı (roman)", "Don Kişot", "Divine Comedy",
    "Frankenstein", "Dracula", "Cesur Yeni Dünya", "Fahrenheit 451",
]

HARD_TITLES = [
    "Antikythera mekanizması", "Babil astronomisi", "Göktürk yazıtı",
    "Orhun Yazıtları", "Divan-ı Lügati't-Türk", "Kutadgu Bilig",
    "Mahmud el-Kaşgari", "Yusuf Has Hacib", "Ahmed Yesevi", "Hacı Bektaş-ı Veli",
    "Mevlana", "Hacı Bayram-ı Veli", "Piri Reis", "Mimar Sinan", "Mimar Kemaleddin",
    "Hezârfen Ahmed Çelebi", "Lagari Hasan Çelebi", "Ali Kuşçu", "Sabuncuoğlu Şerafeddin",
    "Takiyüddin (bilim insanı)", "Kâtip Çelebi", "Evliya Çelebi",
    "Tanzimat", "Islahat Fermanı", "I. Meşrutiyet", "II. Meşrutiyet",
    "Jön Türkler", "İttihat ve Terakki", "Trablusgarp Savaşı", "Balkan Savaşları",
    "Sevr Antlaşması", "Lozan Antlaşması", "Mudanya Mütarekesi",
    "Köprülü Mehmed Paşa", "Sokullu Mehmed Paşa", "Kanuni Sultan Süleyman",
    "Yavuz Sultan Selim", "II. Bayezid", "Fatih Sultan Mehmed", "II. Murad",
    "Çaldıran Muharebesi", "Mercidabık Muharebesi", "Ridaniye Muharebesi",
    "Preveze Deniz Savaşı", "Lepanto Deniz Savaşı", "Varna Muharebesi",
    "Kosova Muharebesi", "Niğbolu Muharebesi", "Ankara Muharebesi",
    "Teorik fizik", "Kuantum dolanıklık", "Süpersimetri", "Kuark",
    "Higgs bozonu", "Karanlık madde", "Karanlık enerji", "Kozmik mikrodalga arka plan",
    "Olay ufku", "Hawking radyasyonu", "Kurt deliği", "Sicim teorisi",
    "M-teorisi", "Holografik ilke", "Antimadde", "Nötrino",
    "Periyodik tablo", "Radyoaktivite", "İzotop", "Radyojenik tarihleme",
    "Paleomanyetizma", "Kıtasal sürüklenme", "Levha tektoniği", "Manto konveksiyonu",
    "Stromatolit", "Kambriyen patlaması", "Pangea", "Gondvana",
    "Mitokondriyal Havva", "Y-chromosomal Adem", "Neanderthal", "Denisovan",
    "Turing makinesi", "Bayes teoremi", "Olasılık teorisi", "Oyun teorisi",
    "Gödel eksiklik teoremi", "Cantor'un köşegen argümanı", "Riemann hipotezi",
    "Fermat'nın son teoremi", "P-NP problemi", "Travmatik matematik",
]

EXPERT_TITLES = [
    "Anaximandros", "Empedokles", "Herakleitos", "Parmenides", "Zenon (Elealı)",
    "Protagoras", "Gorgias", "Epiktetos", "Kirene okulu", "Kinik felsefe",
    "Stoacılık", "Epikürcülük", "Yeni-Platonculuk", "Skepsis",
    "Thales", "Anaksimenes", "Anaksagoras", "Demokritos", "Leukippos",
    "Samoslu Aristarkhos", "Sakızlı Hipokrat", "Knidoslu Öksipür",
    "Bergama krallığı", "Pontus krallığı", "Kappadokia krallığı", "Bithynia krallığı",
    "Tigranes", "Mitridat", "Selevkos İmparatorluğu", "Part İmparatorluğu",
    "Sasani İmparatorluğu", "Göktürk Kağanlığı", "Uygur Kağanlığı", "Hazar Kağanlığı",
    "Bulgar Hanlığı", "Avar Kağanlığı", "Kıpçak Hanlığı", "Altın Orda",
    "İdil Bulgar Devleti", "Karakurum", "Moğol İmparatorluğu",
    "Sümer mitolojisi", "Babil mitolojisi", "Hitit mitolojisi", "Hurri mitolojisi",
    "Ugarit metinleri", "Eski Mısır dini", "Zerdüştlük", "Mani dini", "Mitraizm",
    "Gnostisizm", "Hermetizm", "Neoplatonizm", "İskenderiye okulu",
    "Antik Libya", "Numidya krallığı", "Kartaca", "Pön savaşları",
    "Aşağı Nübye", "Meroe krallığı", "Aksum krallığı", "Zimbabwe krallığı",
    "Malı İmparatorluğu", "Songhay İmparatorluğu", "Gana İmparatorluğu",
    "Kanem-Bornu İmparatorluğu", "Kongo Krallığı", "Mutapa Krallığı",
    "Olmek uygarlığı", "Maya uygarlığı", "Aztek İmparatorluğu", "İnka İmparatorluğu",
    "Toltekler", "Teotihuacan", "Zapotekler", "Mixtekler",
    "Anasazi kültürü", "Mississippi kültürü", "Woodland dönemi",
    "Mohenjo-daro", "Harappa uygarlığı", "Veda dönemi", "Maurya İmparatorluğu",
    "Gupta İmparatorluğu", "Çola Hanedanı", "Pala İmparatorluğu", "Vijayanagara İmparatorluğu",
    "Han Hanedanı", "Tang Hanedanı", "Song Hanedanı", "Ming Hanedanı",
    "Qing Hanedanı", "Heian dönemi", "Kamakura şogunluğu", "Edo dönemi",
    "Khmer İmparatorluğu", "Srivijaya", "Majapahit İmparatorluğu", "Ayutthaya krallığı",
]

WIKI_CATEGORIES = [
    "Türkiye'deki_tarihi_olaylar", "Türk_bilim_insanları", "Türk_yazarlar",
    "Osmanlı_padişahları", "Fizikçiler", "Kimyagerler", "Biyologlar",
    "Matematikçiler", "Filozflar", "Türk_şairler", "Türk_besteciler",
]


def _wiki_questions() -> list[Question]:
    """Fetch articles from Wikipedia, grouped by difficulty tier."""
    articles: list[dict] = []

    # Tier 1-3 (easy): famous articles
    easy = fetch_summaries(EASY_TITLES)
    for a in easy:
        a["_tier"] = random.choice([1, 2, 3])
    articles.extend(easy)
    log.info("Easy articles: %d", len(easy))

    # Tier 4-6 (medium)
    medium = fetch_summaries(MEDIUM_TITLES)
    for a in medium:
        a["_tier"] = random.choice([4, 5, 6])
    articles.extend(medium)
    log.info("Medium articles: %d", len(medium))

    # Tier 7-9 (hard)
    hard = fetch_summaries(HARD_TITLES)
    for a in hard:
        a["_tier"] = random.choice([7, 8, 9])
    articles.extend(hard)
    log.info("Hard articles: %d", len(hard))

    # Tier 10-12 (expert)
    expert = fetch_summaries(EXPERT_TITLES)
    for a in expert:
        a["_tier"] = random.choice([10, 11, 12])
    articles.extend(expert)
    log.info("Expert articles: %d", len(expert))

    # Tier 13-15 (final): fetch from categories for extra depth
    try:
        cat_titles = []
        for cat in WIKI_CATEGORIES[:3]:
            cat_titles.extend(category_members(cat, limit=15))
        random.shuffle(cat_titles)
        cat_articles = fetch_summaries(cat_titles[:20])
        for a in cat_articles:
            a["_tier"] = random.choice([13, 14, 15])
        articles.extend(cat_articles)
        log.info("Category (final) articles: %d", len(cat_articles))
    except Exception as exc:  # noqa: BLE001
        log.warning("Category fetch failed: %s", exc)

    # Also fetch some random articles for variety
    try:
        random_arts = pick_interesting(count=15)
        for a in random_arts:
            a["_tier"] = random.choice([5, 6, 7, 8, 9, 10])
        articles.extend(random_arts)
        log.info("Random articles: %d", len(random_arts))
    except Exception as exc:  # noqa: BLE001
        log.warning("Random fetch failed: %s", exc)

    siblings = [a["title"] for a in articles]
    out: list[Question] = []
    for art in articles:
        difficulty = art.get("_tier", 5)
        q = build_question(art, difficulty, siblings)
        if q:
            out.append(q)

    log.info("Total wiki questions: %d", len(out))
    return out


def _fallback_questions() -> list[Question]:
    """Build a guaranteed pool from static data."""
    pool: list[Question] = []
    # Easy (tier 1-3)
    easy_pairs = [
        ("ülke", "Fransa", "başkenti Paris olan Avrupa ülkesidir"),
        ("ülke", "Almanya", "başkenti Berlin olan Avrupa ülkesidir"),
        ("ülke", "İtalya", "başkenti Roma olan Avrupa ülkesidir"),
        ("ülke", "İspanya", "başkenti Madrid olan Avrupa ülkesidir"),
        ("ülke", "Japonya", "başkenti Tokyo olan Asya ülkesidir"),
        ("şehir", "İstanbul", "Türkiye'nin en kalabalık şehridir"),
        ("şehir", "Ankara", "Türkiye'nin başkentidir"),
        ("şehir", "Paris", "Fransa'nın başkentidir"),
        ("yıl", "1453", "İstanbul'un fethi gerçekleşti"),
        ("yıl", "1923", "Türkiye Cumhuriyeti ilan edildi"),
        ("kişi", "Mustafa Kemal Atatürk", "Türkiye Cumhuriyeti'nin kurucusudur"),
        ("kişi", "Albert Einstein", "Görelilik kuramını geliştiren fizikçidir"),
    ]
    medium_pairs = [
        ("kişi", "Nikola Tesla", "Alternatif akım sistemlerinin öncüsüdür"),
        ("kişi", "Marie Curie", "Radyoaktivite araştırmalarıyla Nobel alan bilim insanıdır"),
        ("kişi", "Charles Darwin", "Evrim kuramını ortaya atan bilim insanıdır"),
        ("kişi", "William Shakespeare", "Hamlet ve Romeo ve Juliet'in yazarıdır"),
        ("eser", "Sefiller", "Victor Hugo'nun ünlü romanıdır"),
        ("eser", "Suç ve Ceza", "Dostoyevski'nin ünlü romanıdır"),
        ("eser", "1984", "George Orwell'ın distopik romanıdır"),
        ("genel", "DNA", "Genetik bilginin saklandığı moleküldür"),
        ("genel", "Kara delik", "Işığın bile kaçamadığı gök cismidir"),
        ("genel", "Rönesans", "Avrupa'da 15-16. yüzyıllardaki yeniden doğuş hareketidir"),
    ]
    hard_pairs = [
        ("kişi", "Piri Reis", "Osmanlı denizcisi ve haritacıdır"),
        ("kişi", "Mimar Sinan", "Osmanlı'nın en ünlü mimarıdır"),
        ("kişi", "Ali Kuşçu", "Osmanlı astronom ve matematikçisidir"),
        ("kişi", "Karl Marx", "Kapital adlı eserin yazarıdır"),
        ("kişi", "Friedrich Nietzsche", "Böyle Söyleydi Zerdüşt'ün yazarıdır"),
        ("eser", "Nutuk", "Mustafa Kemal Atatürk'ün söylevidir"),
        ("eser", "Tutunamayanlar", "Oğuz Atay'ın ünlü romanıdır"),
        ("genel", "Manzikert Muharebesi", "1071'de Türklerin Anadolu'ya girişini sağlayan savaştır"),
        ("genel", "Tanzimat", "1839'da Osmanlı'da başlayan yenileşme hareketidir"),
        ("genel", "Süveyş Kanalı", "Akdeniz ile Kızıldeniz'i birleştiren kanaldır"),
    ]
    expert_pairs = [
        ("kişi", "Mevlana", "Mesnevi'nin yazarı olan Sufi şairdir"),
        ("kişi", "Evliya Çelebi", "Seyahatname'nin yazarıdır"),
        ("kişi", "Kâtip Çelebi", "Osmanlı tarihçi ve coğrafyacısıdır"),
        ("eser", "Orhun Yazıtları", "Türklerin en eski yazılı belgeleridir"),
        ("eser", "Divan-ı Lügati't-Türk", "Kaşgari'nin Türkçe sözlüğüdür"),
        ("eser", "Kutadgu Bilig", "Yusuf Has Hacib'in mesnevisidir"),
        ("genel", "Anaximandros", "Evrenin sınırsız olduğu öğretisini savunan filozoftur"),
        ("genel", "Travmatik matematik", "Gelişimsel hesap bozukluğu olarak da bilinir"),
        ("genel", "Higgs bozonu", "Kütle oluşumunu açıklayan parçacıktır"),
        ("genel", "Karanlık madde", "Evrenin kütlesinin büyük kısmını oluşturduğu düşünülen maddedir"),
    ]

    tier_map = {1: easy_pairs, 2: easy_pairs, 3: easy_pairs,
                4: medium_pairs, 5: medium_pairs, 6: medium_pairs,
                7: hard_pairs, 8: hard_pairs, 9: hard_pairs,
                10: expert_pairs, 11: expert_pairs, 12: expert_pairs,
                13: expert_pairs, 14: expert_pairs, 15: expert_pairs}

    for difficulty in range(1, 16):
        pairs = tier_map[difficulty]
        for cat, correct, fact in pairs:
            tier_name = next((t for d, t in TIERS if d == difficulty), "Kolay")
            ctx = f"{correct} {fact}"
            distractors = make_distractors(correct, ctx)
            opts = distractors + [correct]
            random.shuffle(opts)
            q_text = f"{fact}. Yukarıdaki bilgi hangi şıkka karşılık gelir?"
            pool.append(Question(
                id=_hash_id(correct, q_text, str(difficulty)),
                difficulty=difficulty,
                tier=tier_name,
                category=cat,
                question=q_text,
                correct=correct,
                options=opts,
                source="static",
            ))
    return pool


def main() -> int:
    log.info("Building question pool…")
    wiki_qs = _wiki_questions()
    fb_qs = _fallback_questions()
    log.info("Wiki: %d, Fallback: %d", len(wiki_qs), len(fb_qs))

    combined = wiki_qs + fb_qs
    if not combined:
        log.error("No questions produced. Aborting.")
        return 1

    balanced = assign_difficulty(combined)

    # Ensure at least 4 questions per difficulty tier
    by_diff: dict[int, list[Question]] = {d: [] for d, _ in TIERS}
    for q in balanced:
        by_diff.setdefault(q.difficulty, []).append(q)
    final: list[Question] = []
    for d, _ in TIERS:
        pool = by_diff.get(d, [])
        while len(pool) < 4 and pool:
            dup = random.choice(pool)
            pool.append(Question(
                id=_hash_id(dup.source, dup.question, str(d), "dup"),
                difficulty=dup.difficulty,
                tier=dup.tier,
                category=dup.category,
                question=dup.question,
                correct=dup.correct,
                options=dup.options[:],
                source=dup.source,
            ))
        final.extend(pool)

    random.shuffle(final)
    data = {
        "version": 2,
        "generated_at": os.environ.get("BUILD_TIME", ""),
        "count": len(final),
        "questions": [q.to_dict() for q in final],
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info("Wrote %d questions to %s", len(final), OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
