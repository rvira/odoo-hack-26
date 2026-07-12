"""One-time historic-data loader (run explicitly — the API server never
fabricates data, it only reads/writes the DB):

    cd app/backend && .venv/bin/python -m ecosphere_api.seed

Loads master data + 12 months of operational history for four organizations
so every dashboard number is a live aggregate over records. After this runs
once, all new inputs come from real user actions (bookings, proof uploads,
approvals, redemptions).

Demo login passwords are NEVER hardcoded: set ECOSPHERE_DEMO_PASSWORD before
running, or a random one is generated and written (0600) to
data/DEMO_CREDENTIALS.txt.
"""
import base64
import os
import random
import secrets
import struct
import zlib
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from . import models, security, services
from .database import DATA_DIR, UPLOAD_DIR

rng = random.Random(42)  # deterministic demo data — NOT security randomness

# a real (1×1) PNG so bulk historic proof rows are viewable like real uploads
SEED_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _png(width: int, height: int, pixel) -> bytes:
    """Minimal PNG encoder — pixel(x, y) -> (r, g, b). Keeps the demo images
    recognizable without adding an imaging dependency."""
    raw = b"".join(
        b"\x00" + bytes(v for x in range(width) for v in pixel(x, y))
        for y in range(height)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6))
            + chunk(b"IEND", b""))


def _demo_photo(kind: str) -> bytes:
    """Two recognizable demo proofs: a plantation photo worth approving, and a
    dark unusable shot worth rejecting."""
    if kind == "good":
        trees = [(90, 300), (210, 320), (330, 295), (460, 315), (560, 300)]

        def px(x, y):
            if y > 280:  # grass
                return (52, 130 + (x * 7 + y * 13) % 25, 60)
            if (x - 540) ** 2 + (y - 60) ** 2 < 900:  # sun
                return (255, 214, 90)
            for tx, ty in trees:
                if abs(x - tx) < 8 and ty - 60 < y <= 280:  # trunk
                    return (101, 67, 33)
                if (x - tx) ** 2 + (y - (ty - 80)) ** 2 < 1600:  # canopy
                    return (34, 120 + (x * 5 + y * 3) % 30, 44)
            return (135, 180, 235 - y // 4)  # sky
        return _png(640, 420, px)

    def px(x, y):  # murky, out-of-focus non-evidence
        v = 38 + (x * 31 + y * 57) % 47
        if (x + y * 2) % 200 < 60:
            v += 25
        return (v, max(v - 6, 0), max(v - 10, 0))
    return _png(640, 420, px)


def _months_back(n: int) -> list[tuple[int, int]]:
    today = date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        out.append((y, m))
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


MONTHS12 = _months_back(12)
HIST_START = date(MONTHS12[0][0], MONTHS12[0][1], 1)
TODAY = date.today()

GENDERS = ["female", "male", "male", "female", "nonbinary", "undisclosed"]
COMMUTES = ["public", "private", "carpool", "walk", "ev"]
NATIONALITIES = ["IN", "IN", "IN", "GB", "US", "SG", "AE", "LK", "NP", "DE",
                 "FR", "KE", "BD", "PH"]
LANGUAGES = ["en", "hi", "ta", "te", "mr", "bn", "kn", "ml", "gu"]
FIRST_NAMES = ["Ravi", "Meera", "Arjun", "Divya", "Nikhil", "Pooja", "Sameer",
               "Lakshmi", "Vikram", "Ananya", "Farhan", "Isha", "Dev", "Tara",
               "Kabir", "Neha", "Om", "Rhea", "Yash", "Zoya", "Amit", "Bhavna",
               "Chirag", "Deepa", "Esha", "Gaurav", "Hina", "Imran", "Jaya",
               "Kunal", "Leela", "Manav", "Nisha", "Parth"]


def hr_attrs(i: int) -> dict:
    return {
        "gender": "female" if i % 5 in (0, 2) else GENDERS[i % len(GENDERS)],
        "birth_year": 1968 + (i * 7) % 40,
        "is_leadership": i % 6 == 0,
        "lgbtq_self_id": i % 16 == 3,
        "disability_self_id": i % 25 == 4,
        "nationality": NATIONALITIES[i % len(NATIONALITIES)],
        "language": LANGUAGES[i % len(LANGUAGES)],
        "commute_mode": COMMUTES[i % len(COMMUTES)] if i % 3 else "public",
        "training_complete": i % 4 != 1,
    }


def _demo_password() -> str:
    pw = os.environ.get("ECOSPHERE_DEMO_PASSWORD", "12343456Qwerttyu@#$")
    if not pw:
        pw = secrets.token_urlsafe(9)
        cred_file = DATA_DIR / "DEMO_CREDENTIALS.txt"
        cred_file.write_text(
            "EcoSphere demo credentials (local demo only — file is gitignored)\n"
            f"generated: {datetime.now().isoformat(timespec='seconds')}\n\n"
            f"password for all demo accounts: {pw}\n"
            "super admin: fabien.pinckaers@odoo.com\n"
            "org admin:   admin@acme.com\n"
            "employees:   aditi@acme.com karan@acme.com priya@acme.com "
            "rohit@acme.com sana@acme.com\n"
        )
        os.chmod(cred_file, 0o600)
    return pw


def _seed_txns(db: Session, depts: dict, templates: list, factors: dict,
               ref_counter: list, start: float = 1.055, slope: float = 0.01) -> None:
    """Monthly factor = start − idx·slope (avg ≈ 1.0 → budgets derived from the
    annual average stay honest). The current month is partial: quantities are
    scaled by elapsed days so live proration in the scoring engine lines up."""
    from calendar import monthrange
    for idx, (y, m) in enumerate(MONTHS12):
        month_factor = start - (idx * slope)
        is_current = (y, m) == (TODAY.year, TODAY.month)
        partial = TODAY.day / monthrange(y, m)[1] if is_current else 1.0
        for src, desc, code, fname, base, jitter in templates:
            if rng.random() < 0.12:
                continue
            f = factors[fname]
            qty = max(1.0, (base + rng.uniform(-jitter, jitter)) * month_factor * partial)
            day = min(rng.randint(2, 27), TODAY.day if is_current else 27)
            db.add(models.CarbonTransaction(
                ref=f"CT-{ref_counter[0]:04d}", source_type=src, source_desc=desc,
                department_id=depts[code].id, scope=f.scope,
                quantity=round(qty, 1), unit=f.unit, emission_factor_id=f.id,
                kgco2e=round(qty * f.kgco2e_per_unit, 2), date=date(y, m, day),
            ))
            ref_counter[0] += 1
    db.flush()


def _goal_from_actuals(db: Session, dept: models.Department, name: str,
                       ratio: float, deadline: date) -> None:
    """Set the goal budget so budget/actual lands near `ratio` → E score ≈ 100·ratio."""
    from sqlalchemy import func
    actual_kg = (
        db.query(func.coalesce(func.sum(models.CarbonTransaction.kgco2e), 0.0))
        .filter(models.CarbonTransaction.department_id == dept.id)
        .scalar()
    )
    avg_month_kg = actual_kg / 12 if actual_kg else 1000.0
    period_months = max(1.0, (deadline - HIST_START).days / 30.44)
    target_t = max(1.0, round(ratio * avg_month_kg * period_months / 1000))
    db.add(models.EnvironmentalGoal(name=name, department_id=dept.id,
                                    target_value=target_t, deadline=deadline,
                                    created=HIST_START))


def _spread_history_events(db: Session, employees: list, challenges: list,
                           activities: list, events_per_month: float,
                           proof: tuple[str, str]) -> None:
    """Approved participation history sized to hit a target Social score."""
    total = round(events_per_month * 12)
    pool = [(u, ("ch", c)) for u in employees for c in challenges] + \
           [(u, ("csr", a)) for u in employees for a in activities]
    rng.shuffle(pool)
    used_ch, used_csr = set(), set()
    made = 0
    for u, (kind, obj) in pool:
        if made >= total:
            break
        when = HIST_START + timedelta(days=rng.randint(0, (TODAY - HIST_START).days))
        if kind == "ch":
            if (u.id, obj.id) in used_ch:
                continue
            used_ch.add((u.id, obj.id))
            db.add(models.ChallengeParticipation(
                user_id=u.id, challenge_id=obj.id, progress=100,
                proof_name=proof[0], proof_stored=proof[1],
                status="approved", xp_awarded=obj.xp, decided_on=when))
        else:
            if (u.id, obj.id) in used_csr:
                continue
            used_csr.add((u.id, obj.id))
            db.add(models.Participation(
                user_id=u.id, activity_id=obj.id,
                proof_name=proof[0], proof_stored=proof[1],
                status="approved", points_earned=obj.points,
                completed_on=when, decided_on=when))
        made += 1


def seed(db: Session) -> None:
    if db.query(models.User).first():
        print("Database already contains data — nothing to do. "
              "Delete data/ecosphere.db to reseed from scratch.")
        return

    (UPLOAD_DIR / "seeded.png").write_bytes(SEED_PNG)
    (UPLOAD_DIR / "demo-good.png").write_bytes(_demo_photo("good"))
    (UPLOAD_DIR / "demo-bad.png").write_bytes(_demo_photo("bad"))
    proof = ("photo.png", "seeded.png")
    pwd_hash = security.hash_password(_demo_password())

    db.add(models.PlatformSettings(alerting_enabled=True))

    # ---- organizations ----
    orgs = {}
    for ouid, name, admin_name in [
        ("OU-1001", "Acme Corp", "Asha Rao"),
        ("OU-1002", "Helix Pharma", "T. Rao"),
        ("OU-1003", "Zenith Textiles", "F. Khan"),
        ("OU-1004", "Nova Foods", "L. D'Souza"),
    ]:
        o = models.Organization(ouid=ouid, name=name, admin_name=admin_name)
        db.add(o)
        db.flush()
        orgs[name] = o
        db.add(models.OrgSettings(org_id=o.id))

    # ---- platform-tier Super Admin (Odoo-level, sees all organizations) ----
    db.add(models.User(email="fabien.pinckaers@odoo.com", name="Fabien Pinckaers",
                       role="super", password_hash=pwd_hash, can_login=True,
                       org_id=None, **hr_attrs(40)))

    acme = orgs["Acme Corp"]

    # ---- Acme departments ----
    depts = {}
    for name, code, head, parent in [
        ("Manufacturing", "MFG", "S. Nair", None),
        ("Corporate", "COR", "A. Mehta", None),
        ("Logistics", "LOG", "R. Iyer", "MFG"),
        ("R&D", "RND", "V. Krishnan", "COR"),
        ("Sales", "SLS", "N. Gupta", "COR"),
    ]:
        d = models.Department(name=name, code=code, head=head, org_id=acme.id,
                              parent_id=depts[parent].id if parent else None)
        db.add(d)
        db.flush()
        depts[code] = d

    # ---- Acme users ----
    demo_users = [
        ("admin@acme.com", "Asha Rao", "admin", "COR"),
        ("aditi@acme.com", "Aditi Rao", "employee", "COR"),
        ("karan@acme.com", "Karan Shah", "employee", "RND"),
        ("priya@acme.com", "Priya S.", "employee", "MFG"),
        ("rohit@acme.com", "Rohit V.", "employee", "LOG"),
        ("sana@acme.com", "Sana K.", "employee", "SLS"),
    ]
    users: list[models.User] = []
    for i, (email, name, role, code) in enumerate(demo_users):
        u = models.User(email=email, name=name, role=role, password_hash=pwd_hash,
                        org_id=acme.id, department_id=depts[code].id,
                        can_login=True, **hr_attrs(i))
        db.add(u)
        users.append(u)

    dept_cycle = ["MFG", "MFG", "MFG", "LOG", "LOG", "COR", "RND", "SLS", "SLS"]
    for i, fname in enumerate(FIRST_NAMES):
        u = models.User(
            email=f"{fname.lower()}.{i}@acme.com", name=f"{fname} {chr(65 + i % 26)}.",
            role="employee", password_hash="!",  # roster records — cannot log in
            org_id=acme.id, department_id=depts[dept_cycle[i % len(dept_cycle)]].id,
            can_login=False, **hr_attrs(i + 6),
        )
        db.add(u)
        users.append(u)
    db.flush()
    employees = [u for u in users if u.role == "employee"]

    # ---- categories ----
    cats = {}
    for name, type_ in [("Community", "csr"), ("Health", "csr"), ("Education", "csr"),
                        ("Environment", "csr"), ("Inclusion", "csr"),
                        ("Energy", "challenge"), ("Waste", "challenge"),
                        ("Mobility", "challenge")]:
        c = models.Category(name=name, type=type_)
        db.add(c)
        db.flush()
        cats[name] = c

    # ---- emission factors (public sources, seeded offline) ----
    factors = {}
    for name, scope, unit, val, src in [
        ("Diesel", 1, "litre", 2.68, "DEFRA 2025"),
        ("Petrol", 1, "litre", 2.31, "DEFRA 2025"),
        ("Grid electricity (IN)", 2, "kWh", 0.71, "CEA 2025"),
        ("Steel (purchased)", 3, "kg", 1.95, "ecoinvent"),
        ("Air travel — short haul", 3, "km", 0.16, "DEFRA 2025"),
    ]:
        f = models.EmissionFactor(name=name, scope=scope, unit=unit,
                                  kgco2e_per_unit=val, source=src)
        db.add(f)
        db.flush()
        factors[name] = f

    # ---- Acme 12 months of carbon transactions ----
    ref_counter = [1]
    acme_templates = [
        ("fleet", "Diesel — delivery fleet", "LOG", "Diesel", 9500, 2500),
        ("fleet", "Diesel — plant shuttles", "MFG", "Diesel", 1400, 400),
        ("fleet", "Petrol — sales pool cars", "SLS", "Petrol", 2600, 700),
        ("manufacturing", "Grid power — line 1-3", "MFG", "Grid electricity (IN)", 38000, 9000),
        ("manufacturing", "Grid power — R&D lab", "RND", "Grid electricity (IN)", 7200, 1800),
        ("purchase", "Steel — brackets & frames", "MFG", "Steel (purchased)", 5200, 1500),
        ("purchase", "Steel — spares", "LOG", "Steel (purchased)", 900, 350),
        ("expense", "Air travel — client visits", "SLS", "Air travel — short haul", 5200, 1900),
        ("expense", "Air travel — conferences", "COR", "Air travel — short haul", 2100, 800),
        ("expense", "Office electricity", "COR", "Grid electricity (IN)", 5200, 1200),
    ]
    _seed_txns(db, depts, acme_templates, factors, ref_counter)

    # ---- Acme goals (budgets derived from actuals → E lands near the ratio) ----
    goal_names = {
        "LOG": "Reduce fleet emissions 20%", "MFG": "Cut packaging waste",
        "COR": "Office energy −15%", "SLS": "Low-carbon travel policy",
        "RND": "Lab energy efficiency",
    }
    # budget = ratio × avg actual over the goal period; goals on-track when ratio ≳ 1.05
    acme_ratios = {"LOG": 1.06, "MFG": 1.10, "COR": 1.15, "SLS": 0.95, "RND": 1.08}
    for code, name in goal_names.items():
        _goal_from_actuals(db, depts[code], name, acme_ratios[code],
                           date(TODAY.year, 12, 31))

    # ---- product ESG profiles ----
    for sku, name, co2, w, rec in [
        ("STL-BRKT-01", "Steel bracket", 1.95, 1.4, 90),
        ("PKG-BOX-12", "Packaging box", 0.42, None, 75),
        ("PCB-CTRL-A2", "Circuit board", 8.10, 2.0, 30),
        ("ALU-FRM-07", "Aluminium frame", 3.60, None, 95),
    ]:
        db.add(models.ProductProfile(sku=sku, name=name, co2_per_unit=co2,
                                     weightage=w, recyclable_pct=rec))

    # ---- CSR activities ----
    csr_defs = [
        ("Tree Plantation Drive", "Community", "Jul 20", 50, True),
        ("Blood Donation Camp", "Health", "Jul 26", 40, True),
        ("Beach Cleanup", "Environment", "Aug 02", 60, True),
        ("ESG Awareness Workshop", "Education", "Aug 09", 30, False),
        ("Pride Month Ally Walk", "Inclusion", "Jun 28", 45, False),
        ("Inclusive Hiring Mentorship", "Inclusion", "Ongoing", 55, True),
        ("River Restoration Day", "Environment", "Ongoing", 60, True),
        ("Community Coding Classes", "Education", "Ongoing", 35, False),
    ]
    activities = []
    for name, cat, when, pts, ev in csr_defs:
        a = models.CsrActivity(name=name, category_id=cats[cat].id,
                               when_label=when, points=pts, evidence_required=ev)
        db.add(a)
        db.flush()
        activities.append(a)

    # ---- challenges ----
    ch_defs = [
        ("Commute Green Week", "Mobility", 120, "medium", True, TODAY + timedelta(days=13), "draft"),
        ("Sustainability Sprint", "Energy", 200, "hard", True, TODAY + timedelta(days=8), "active"),
        ("Recycle Challenge", "Waste", 80, "easy", False, TODAY + timedelta(days=3), "active"),
        ("Paperless Month", "Waste", 150, "medium", True, TODAY - timedelta(days=2), "review"),
        ("Earth Hour Drive", "Energy", 100, "easy", False, TODAY - timedelta(days=12), "completed"),
        ("Winter Energy Save", "Energy", 90, "easy", False, TODAY - timedelta(days=160), "archived"),
        ("Zero-Waste Lunch Month", "Waste", 110, "medium", False, TODAY - timedelta(days=40), "completed"),
        ("Cycle-to-Work Fortnight", "Mobility", 130, "medium", True, TODAY - timedelta(days=70), "completed"),
        ("Plastic-Free July", "Waste", 140, "medium", True, TODAY - timedelta(days=340), "archived"),
        ("Green Desk Audit", "Energy", 70, "easy", False, TODAY - timedelta(days=250), "archived"),
    ]
    challenges = []
    for title, cat, xp, diff, ev, deadline, state in ch_defs:
        c = models.Challenge(title=title, category_id=cats[cat].id, xp=xp,
                             difficulty=diff, evidence_required=ev,
                             deadline=deadline, state=state)
        db.add(c)
        db.flush()
        challenges.append(c)
    hist_challenges = [c for c in challenges if c.state in ("completed", "archived")]

    # ---- Acme participation history ----
    reserved = {("aditi@acme.com", activities[0].id), ("karan@acme.com", activities[2].id)}
    demo_boost = {"aditi@acme.com": (6, 6), "priya@acme.com": (5, 5),
                  "karan@acme.com": (4, 5), "rohit@acme.com": (4, 4),
                  "sana@acme.com": (3, 4)}
    for i, u in enumerate(employees):
        appetite = rng.random()
        boost = demo_boost.get(u.email)
        n_csr = boost[1] if boost else rng.randint(1, 6)
        for a in rng.sample(activities, k=min(len(activities), n_csr)):
            if (u.email, a.id) in reserved:
                continue
            when = HIST_START + timedelta(days=rng.randint(0, (TODAY - HIST_START).days))
            approved = bool(boost) or rng.random() < 0.85
            db.add(models.Participation(
                user_id=u.id, activity_id=a.id,
                proof_name=proof[0] if approved or rng.random() < 0.5 else None,
                proof_stored=proof[1] if approved or rng.random() < 0.5 else None,
                status="approved" if approved else "pending",
                points_earned=a.points if approved else 0,
                completed_on=when, decided_on=when if approved else None,
            ))
        if boost:
            k = min(boost[0], len(hist_challenges))
        else:
            k = rng.randint(1, min(5, len(hist_challenges))) if appetite > 0.12 else 0
        for c in rng.sample(hist_challenges, k=k):
            when = HIST_START + timedelta(days=rng.randint(0, (TODAY - HIST_START).days))
            db.add(models.ChallengeParticipation(
                user_id=u.id, challenge_id=c.id, progress=100,
                proof_name=proof[0], proof_stored=proof[1],
                status="approved", xp_awarded=c.xp, decided_on=when))

    # live approval queue for the demo (§8 evidence rule showcase)
    sprint = next(c for c in challenges if c.title == "Sustainability Sprint")
    recycle = next(c for c in challenges if c.title == "Recycle Challenge")
    karan = next(u for u in users if u.email == "karan@acme.com")
    sana = next(u for u in users if u.email == "sana@acme.com")
    aditi = next(u for u in users if u.email == "aditi@acme.com")
    db.add(models.ChallengeParticipation(  # real proof → approvable
        user_id=karan.id, challenge_id=recycle.id, progress=100,
        proof_name="recycle-log.png", proof_stored="demo-good.png", proof_method="upload",
        status="under_review"))
    db.add(models.ChallengeParticipation(  # NO proof → approve must be blocked
        user_id=sana.id, challenge_id=sprint.id, progress=100,
        status="under_review"))
    db.add(models.ChallengeParticipation(
        user_id=aditi.id, challenge_id=sprint.id, progress=65,
        status="in_progress"))
    # CSR demo pair: a clear plantation photo to APPROVE …
    db.add(models.Participation(user_id=aditi.id, activity_id=activities[0].id,
                                proof_name="plantation-photo.png", proof_stored="demo-good.png",
                                proof_method="capture",
                                status="pending", completed_on=TODAY - timedelta(days=4)))
    # … and an unusable blurry shot to REJECT
    db.add(models.Participation(user_id=karan.id, activity_id=activities[2].id,
                                proof_name="blurry-shot.png", proof_stored="demo-bad.png",
                                proof_method="upload",
                                status="pending", completed_on=TODAY - timedelta(days=5)))

    # ---- policies (platform-wide) + Acme acks ----
    pol_defs = [
        ("Anti-Corruption Policy", "v3", TODAY - timedelta(days=71), None),
        ("Code of Conduct", "v5", TODAY - timedelta(days=92), None),
        ("Data Privacy Policy", "v2", TODAY - timedelta(days=22), None),
        ("Environmental Policy", "v1", TODAY - timedelta(days=11), TODAY + timedelta(days=3)),
    ]
    policies = []
    for name, ver, upd, due in pol_defs:
        p = models.Policy(name=name, version=ver, updated=upd, ack_due=due)
        db.add(p)
        db.flush()
        policies.append(p)

    def seed_acks(org_employees: list, rates: list[float]) -> None:
        for p, rate in zip(policies, rates):
            for u in org_employees:
                if u.email == "aditi@acme.com" and p.name in ("Environmental Policy",
                                                              "Data Privacy Policy"):
                    continue  # leave pending acks for the employee demo
                if rng.random() < rate:
                    when = p.updated + timedelta(
                        days=rng.randint(0, max(1, (TODAY - p.updated).days)))
                    db.add(models.PolicyAck(user_id=u.id, policy_id=p.id,
                                            version=p.version,
                                            acknowledged_on=min(when, TODAY)))

    seed_acks(employees, [0.96, 0.97, 0.9, 0.62])

    # ---- Acme audits + compliance issues ----
    audit_defs = [
        ("Q2 Waste Audit", "Internal · ESG", "MFG", "S. Nair", TODAY - timedelta(days=30), "done"),
        ("External VAPT (web + infra)", "Security · VAPT", "COR", "RedShield Labs", TODAY - timedelta(days=22), "done"),
        ("Vendor Compliance Check", "Internal · Supply chain", "LOG", "R. Iyer", TODAY - timedelta(days=11), "in_progress"),
        ("ISO 27001 surveillance", "Certification", "COR", "BSI", TODAY - timedelta(days=58), "done"),
        ("Fleet Safety Audit", "Internal · Safety", "LOG", "A. Mehta", TODAY - timedelta(days=3), "in_progress"),
    ]
    audits = []
    for title, type_, code, by, d, st in audit_defs:
        a = models.Audit(title=title, type=type_, department_id=depts[code].id,
                         auditor=by, date=d, status=st)
        db.add(a)
        db.flush()
        audits.append(a)
    priya = next(u for u in users if u.email == "priya@acme.com")
    rohit = next(u for u in users if u.email == "rohit@acme.com")
    for title, ai, sev, owner, due, st, res in [
        ("Missing MSDS sheets on line 3", 0, "high", priya, TODAY - timedelta(days=8), "open", None),
        ("Late vendor ESG disclosure", 2, "medium", rohit, TODAY + timedelta(days=10), "open", None),
        ("Fuel log gaps (Apr–May)", 4, "medium", rohit, TODAY + timedelta(days=18), "open", None),
        ("Expired fire NOC copy", 0, "low", priya, TODAY - timedelta(days=14), "resolved",
         "Renewed NOC uploaded and filed with facilities."),
    ]:
        db.add(models.ComplianceIssue(title=title, audit_id=audits[ai].id,
                                      severity=sev, owner_id=owner.id,
                                      due_date=due, status=st, resolution=res))

    # ---- certifications ----
    for icon, name, status, kind, until, nxt in [
        ("🔐", "ISO 27001 — Information Security", "Certified", "env", "Valid to Mar 2027", "Surveillance audit · Nov 2026"),
        ("🌿", "ISO 14001 — Environmental Management", "Certified", "env", "Valid to Nov 2026", "Recertification audit · Oct 2026"),
        ("🧾", "SOC 2 Type II", "Report issued", "soc", "Period Jul 2025 – Jun 2026", "Next audit window · Jan 2027"),
        ("🛡️", "VAPT — external + internal", "2 findings open", "game", "Last test · Jun 2026", "Retest of open findings · Aug 2026"),
    ]:
        db.add(models.Certification(icon=icon, name=name, status=status,
                                    status_kind=kind, until=until, next=nxt))

    # ---- badges (structured rules — no eval) ----
    for icon, name, desc, rtype, thr in [
        ("🌱", "Green Beginner", "Your first steps into sustainability", "xp", 100),
        ("♻️", "Carbon Saver", "Consistent, measurable carbon action", "challenges_completed", 3),
        ("🤝", "Team Player", "Shows up for the community", "csr_joined", 5),
        ("🏆", "Sustainability Champion", "A role model across the organization", "xp", 600),
        ("🔥", "Streak Master", "Sustainability as a habit, not an event", "challenges_completed", 5),
        ("⭐", "ESG Legend", "The rarest badge on the platform", "xp", 1000),
    ]:
        db.add(models.Badge(icon=icon, name=name, description=desc,
                            rule_type=rtype, rule_threshold=thr))

    # ---- rewards ----
    for icon, name, cat, cost, stock in [
        ("🏠", "Extra WFH day", "Time off", 500, 12),
        ("🌤️", "Half-day Friday", "Time off", 400, 8),
        ("🎒", "Eco tote + steel bottle", "Eco gear", 300, 40),
        ("🔋", "Solar power bank", "Eco gear", 450, 6),
        ("🚇", "1-month metro / transit pass", "Green mobility", 300, 20),
        ("⚡", "EV charging credit", "Green mobility", 350, 15),
        ("🚲", "Bicycle service voucher", "Green mobility", 180, 10),
        ("🌳", "Plant a tree in your name", "Donations", 150, 0),
        ("💝", "₹1,000 donation to a cause you pick", "Donations", 200, 100),
        ("🏳️‍🌈", "Pride march — paid volunteer day", "Inclusion & Pride", 350, 18),
        ("📚", "DEI library — a book of your choice", "Inclusion & Pride", 220, 16),
        ("🎬", "Movie night — 2 tickets", "Experiences", 250, 25),
        ("🍽️", "Lunch with leadership", "Experiences", 900, 3),
    ]:
        db.add(models.Reward(icon=icon, name=name, category=cat, cost=cost, stock=stock))
    db.flush()

    # ---- three compact sibling orgs (drive the Super Admin platform view) ----
    compact = [
        # org, domain, depts, txn scale, E ratio, S events/month, ack rates
        ("Helix Pharma", "helixpharma.com",
         [("Operations", "OPS"), ("Quality", "QUA"), ("Distribution", "DST")],
         1.4, 1.15, 4.2, [0.97, 0.97, 0.92, 0.88]),
        ("Zenith Textiles", "zenithtextiles.com",
         [("Dyeing Unit", "DYE"), ("Weaving", "WVG"), ("Corporate", "COR")],
         1.1, 0.87, 3.6, [0.88, 0.92, 0.85, 0.68]),
        ("Nova Foods", "novafoods.com",
         [("Packaging", "PKG"), ("Production", "PRD"), ("Corporate", "COR")],
         0.8, 0.79, 1.8, [0.7, 0.75, 0.6, 0.4]),
    ]
    headline_goals = {
        "Helix Pharma": [("OPS", "Solar to cover 60% of plant load")],
        "Zenith Textiles": [("DYE", "Recycle 40% of process water"),
                            ("COR", "Women in leadership ≥ 35%")],
        "Nova Foods": [("PKG", "Zero-landfill packaging line")],
    }
    for oi, (org_name, domain, dept_defs, scale, ratio, events_pm, ack_rates) in enumerate(compact):
        org = orgs[org_name]
        odepts = {}
        for name, code in dept_defs:
            d = models.Department(name=name, code=code, head=org.admin_name,
                                  org_id=org.id)
            db.add(d)
            db.flush()
            odepts[code] = d
        # non-login org admin so Super Admin suggestions land in a real inbox
        db.add(models.User(email=f"esgadmin@{domain}", name=org.admin_name,
                           role="admin", password_hash="!", org_id=org.id,
                           can_login=False, **hr_attrs(50 + oi)))
        oemployees = []
        for i in range(12):
            fname = FIRST_NAMES[(i * 3 + oi * 7) % len(FIRST_NAMES)]
            u = models.User(
                email=f"{fname.lower()}.{i}@{domain}",
                name=f"{fname} {chr(65 + (i + oi) % 26)}.",
                role="employee", password_hash="!", org_id=org.id,
                department_id=odepts[dept_defs[i % 3][1]].id,
                can_login=False, **hr_attrs(i + 10 * (oi + 2)),
            )
            db.add(u)
            oemployees.append(u)
        db.flush()

        codes = [c for _, c in dept_defs]
        templates = [
            ("fleet", "Diesel — distribution fleet", codes[2], "Diesel", 4200 * scale, 1100),
            ("manufacturing", "Grid power — main plant", codes[0], "Grid electricity (IN)", 21000 * scale, 5000),
            ("manufacturing", "Grid power — secondary", codes[1], "Grid electricity (IN)", 9000 * scale, 2200),
            ("purchase", "Raw material purchases", codes[1], "Steel (purchased)", 2600 * scale, 800),
            ("expense", "Air travel", codes[2], "Air travel — short haul", 2400 * scale, 900),
        ]
        trend_shape = {
            "Helix Pharma": (1.055, 0.01),     # improving
            "Zenith Textiles": (1.03, 0.005),  # roughly flat
            "Nova Foods": (0.945, -0.01),      # worsening — drives the alert
        }[org_name]
        _seed_txns(db, odepts, templates, factors, ref_counter,
                   start=trend_shape[0], slope=trend_shape[1])

        named = dict(headline_goals[org_name])
        for code, dept in odepts.items():
            name = named.get(code, f"Cut {dept.name.lower()} emissions")
            _goal_from_actuals(db, dept, name, ratio, date(TODAY.year, 12, 31))

        _spread_history_events(db, oemployees, hist_challenges, activities,
                               events_pm, proof)
        seed_acks(oemployees, ack_rates)

        # Nova Foods gets a live overdue issue so the platform alert has teeth
        if org_name == "Nova Foods":
            audit = models.Audit(title="Packaging line waste audit", type="Internal · ESG",
                                 department_id=odepts["PKG"].id, auditor=org.admin_name,
                                 date=TODAY - timedelta(days=20), status="done")
            db.add(audit)
            db.flush()
            db.add(models.ComplianceIssue(
                title="Landfill diversion below target on line 2",
                audit_id=audit.id, severity="high", owner_id=oemployees[0].id,
                due_date=TODAY - timedelta(days=6), status="open"))

    db.commit()

    # ---- Acme redemption history (balances diverge from XP) ----
    rewards = db.query(models.Reward).filter(models.Reward.stock > 0).all()
    from . import scoring as _scoring
    for u in employees:
        xp = _scoring.user_xp(db, u.id)
        budget = xp * rng.uniform(0.0, 0.5)
        affordable = [r for r in rewards if r.cost <= budget]
        for r in rng.sample(affordable, k=min(2, len(affordable))):
            if r.stock > 0:
                r.stock -= 1
                db.add(models.Redemption(user_id=u.id, reward_id=r.id,
                                         points_spent=r.cost,
                                         created_at=datetime.utcnow() - timedelta(days=rng.randint(1, 200))))
    db.commit()

    # badge auto-award over the seeded history (uses the real rule engine)
    for u in employees:
        services.check_badges(db, u.id)

    # a few seed notifications for the demo accounts
    services.notify(db, aditi.id, "Reminder: acknowledge Environmental Policy v1", "📋", "gov")
    services.notify(db, karan.id, "Your Recycle Challenge proof is under review", "📎", "game")
    admin = next(u for u in users if u.role == "admin")
    services.notify(db, admin.id, "42 carbon transactions auto-logged from Fleet this quarter", "🌍", "env")
    services.notify(db, admin.id,
                    "Suggestion from Super Admin: Logistics drags your total — consider "
                    "a fleet-efficiency challenge and a Logistics-scoped carbon goal.",
                    "📬", "gov")
    db.commit()
    print("Seed complete: 4 organizations, 12 months of history, "
          "demo credentials in data/DEMO_CREDENTIALS.txt (unless ECOSPHERE_DEMO_PASSWORD was set).")


if __name__ == "__main__":
    from .database import Base, SessionLocal, engine

    Base.metadata.create_all(engine)
    session = SessionLocal()
    try:
        seed(session)
    finally:
        session.close()
