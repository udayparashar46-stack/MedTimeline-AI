"""Database seeder for canonical tests and seed aliases.

Loads seed definitions from aliases.json and seeds the SQLite database
with canonical tests and global aliases if not already populated.
"""

import json
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.models.test import Test
from app.db.models.test_alias import TestAlias
from app.services.normalization.normalizer import normalize_test_name

SEED_FILE = Path(__file__).parent / "seed" / "aliases.json"


def seed_canonical_tests(db: Session) -> int:
    """Seed canonical tests and global aliases into the database.
    
    Idempotent: skips existing tests and aliases. Returns count of seeded tests.
    """
    if not SEED_FILE.exists():
        return 0

    with open(SEED_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    seeded_tests_count = 0

    for item in data:
        canonical_name = item["canonical_name"].strip()
        category = item.get("category")
        preferred_unit = item.get("preferred_unit")
        aliases = item.get("aliases", [])

        # Check if test exists
        existing_test = db.execute(
            select(Test).where(Test.canonical_name == canonical_name)
        ).scalar_one_or_none()

        if not existing_test:
            test = Test(
                canonical_name=canonical_name,
                category=category,
                preferred_unit=preferred_unit,
                is_seeded=True,
            )
            db.add(test)
            db.commit()
            db.refresh(test)
            seeded_tests_count += 1
        else:
            test = existing_test

        # Always include canonical name itself as an alias, deduplicated by normalized key
        norm_to_raw = {}
        for raw_alias in [canonical_name] + aliases:
            norm = normalize_test_name(raw_alias)
            if norm and norm not in norm_to_raw:
                norm_to_raw[norm] = raw_alias

        for norm, raw_alias in norm_to_raw.items():
            existing_alias = db.execute(
                select(TestAlias).where(
                    TestAlias.alias_normalized == norm,
                    TestAlias.patient_id.is_(None),
                )
            ).scalars().first()

            if not existing_alias:
                alias_obj = TestAlias(
                    test_id=test.id,
                    alias_normalized=norm,
                    raw_alias=raw_alias,
                    source="seed",
                    patient_id=None,
                )
                db.add(alias_obj)

    db.commit()
    return seeded_tests_count
