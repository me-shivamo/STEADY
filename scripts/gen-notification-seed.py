#!/usr/bin/env python3
"""
Generate the notification seed migration from .claude/plans/notifications.md.

The markdown catalogue is the source of truth for copy: it is what Shivam reads
and edits, and it is validated for em-dashes and banner length by the checker.
Hand-transcribing 198 messages into SQL would create a second source of truth
that drifts from the first the moment either is edited. So the SQL is generated.

Re-run after editing the catalogue:
    python3 scripts/gen-notification-seed.py

Writes supabase/migrations/036_seed_events.sql (overwrites; the file is an
artifact, not something to edit by hand).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / ".claude/plans/notifications.md"
OUT = ROOT / "supabase/migrations/036_seed_events.sql"

# `**Opens:** Home` -> the deep-link key understood by navigationRef.ts.
OPENS = {
    "home": "home", "camera": "camera", "water": "water", "weight": "weight",
    "progress": "progress", "reminders": "reminders", "chat": "chat",
    "group": "group", "groups": "groups",
}

# Priority decides who wins when several events are due at once. Lower wins.
# A celebration must always beat a nag: hitting your target and skipping dinner
# should get you the congratulations, not the telling off.
SECTION_PRIORITY = {
    "B": 10,  # celebrations
    "G": 20,  # streak at risk
    "E": 30,  # mealtime
    "A": 40,  # onboarding
    "D": 50,  # groups
    "H": 55,  # weight
    "I": 55,  # water
    "C": 60,  # feature discovery
    "J": 70,  # recaps
    "F": 80,  # lapse
}

# Events that must go out at the next cron tick rather than waiting for the
# user's best hour. Congratulating someone on their first ever log four hours
# after they did it is worse than not congratulating them: the moment has gone
# and the message reads like a bot catching up on its backlog.
IMMEDIATE = {
    "first_log_celebration", "daily_target_hit", "streak_milestone",
    "weight_milestone", "group_member_joined", "perfect_week",
    "first_week_complete",
}

# Celebrations are exempt from the daily frequency cap. They are rare, earned,
# and they are the reason people leave notifications switched on at all.
BYPASS_CAP = IMMEDIATE | {"day7_first_week"}

# How long a queued instance stays worth sending, in hours.
TTL = {"streak_risk_evening": 3, "lunch_nudge": 4, "dinner_nudge": 4,
       "under_eating_evening": 3, "group_activity": 6}
DEFAULT_TTL = 24


def sq(s: str) -> str:
    """Quote a SQL string literal, doubling embedded single quotes."""
    return "'" + s.replace("'", "''") + "'"


def parse():
    if not CATALOGUE.exists():
        sys.exit(f"Catalogue not found: {CATALOGUE}")

    events, templates = [], []
    section = None
    current = None

    for raw in CATALOGUE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()

        m = re.match(r"^# ([A-J]) · ", line)
        if m:
            section = m.group(1)
            continue

        # ### `event_key` · channel `channel`
        m = re.match(r"^### `([a-z0-9_]+)` · channel `([a-z]+)`", line)
        if m:
            current = {"key": m.group(1), "channel": m.group(2),
                       "section": section, "deep_link": "home",
                       "win_start": 8, "win_end": 21}
            events.append(current)
            continue

        if current and line.startswith("**Fires:**"):
            # Derive the band from an explicit local time where the catalogue
            # gives one ("20:00 local"). Everything else keeps the full allowed
            # day and lets pick_send_hour choose freely.
            t = re.search(r"(\d{1,2}):(\d{2}) local", line)
            if t:
                h = int(t.group(1))
                current["win_start"] = max(8, min(h, 21))
                current["win_end"] = max(current["win_start"], min(h + 2, 21))
            o = re.search(r"\*\*Opens:\*\*\s*([A-Za-z]+)", line)
            if o:
                current["deep_link"] = OPENS.get(o.group(1).lower(), "home")
            continue

        # | tone | Title | Body |
        if current and line.startswith("| ") and line.count("|") >= 4:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) != 3:
                continue
            tone, title, body = cells
            if tone in ("Tone", "") or set(tone) <= set("-"):
                continue
            if not re.match(r"^(funny|serious|motivational|cute-angry|friendly|rage-bait|persona:[a-z-]+)$", tone):
                continue
            templates.append({"event": current["key"], "tone": tone,
                              "title": title, "body": body,
                              "channel": current["channel"],
                              "deep_link": current["deep_link"]})
    return events, templates


def main():
    events, templates = parse()
    if not events or not templates:
        sys.exit(f"Parsed nothing useful ({len(events)} events, {len(templates)} templates).")

    # Fail loudly on anything the database would reject anyway. Better to stop
    # here than to produce a migration that dies halfway through applying.
    for t in templates:
        for field in ("title", "body"):
            if re.search(r"[—–]", t[field]):
                sys.exit(f"Em-dash in {t['event']}/{t['tone']}: {t[field]}")
        if len(t["body"]) > 120 or len(t["title"]) > 60:
            sys.exit(f"Too long: {t['event']}/{t['tone']}")

    out = [
        "-- GENERATED FILE. Do not edit by hand.",
        "--",
        "-- Source: .claude/plans/notifications.md",
        "-- Regenerate: python3 scripts/gen-notification-seed.py",
        "--",
        "-- The markdown catalogue is the source of truth for notification copy:",
        "-- it is what gets read, reviewed and validated (em-dashes, banner",
        "-- lengths). Transcribing 198 messages into SQL by hand would create a",
        "-- second source of truth that drifts from the first the moment either",
        "-- side is edited, so this file is generated from it instead.",
        "--",
        f"-- {len(events)} event types, {len(templates)} templates.",
        "",
        "-- Celebrations must not wait for the adaptive send hour. Telling someone",
        "-- 'first meal logged!' four hours after they logged it reads like a bot",
        "-- catching up on a backlog, so these go out at the next cron tick.",
        "ALTER TABLE public.notification_event_types",
        "  ADD COLUMN IF NOT EXISTS immediate BOOLEAN NOT NULL DEFAULT FALSE;",
        "",
        "INSERT INTO public.notification_event_types",
        "  (event_key, channel, deep_link, window_start, window_end, priority, ttl_hours, bypasses_cap, immediate)",
        "VALUES",
    ]

    rows = []
    for e in events:
        rows.append(
            f"  ({sq(e['key'])}, {sq(e['channel'])}, {sq(e['deep_link'])}, "
            f"{e['win_start']}, {e['win_end']}, {SECTION_PRIORITY.get(e['section'], 100)}, "
            f"{TTL.get(e['key'], DEFAULT_TTL)}, "
            f"{'TRUE' if e['key'] in BYPASS_CAP else 'FALSE'}, "
            f"{'TRUE' if e['key'] in IMMEDIATE else 'FALSE'})"
        )
    out.append(",\n".join(rows))
    # Idempotent: re-running the generated migration retunes existing rows
    # rather than failing on the primary key.
    out.append("""ON CONFLICT (event_key) DO UPDATE SET
  channel = EXCLUDED.channel, deep_link = EXCLUDED.deep_link,
  window_start = EXCLUDED.window_start, window_end = EXCLUDED.window_end,
  priority = EXCLUDED.priority, ttl_hours = EXCLUDED.ttl_hours,
  bypasses_cap = EXCLUDED.bypasses_cap, immediate = EXCLUDED.immediate;
""")

    # Replace rather than append, so editing a line in the catalogue and
    # regenerating does not leave the old wording behind as an active variant.
    out.append("DELETE FROM public.notification_templates WHERE event_key IS NOT NULL;")
    out.append("")
    out.append("INSERT INTO public.notification_templates")
    out.append("  (event_key, title, variant_text, tone, channel, deep_link, is_ai_generated, active)")
    out.append("VALUES")
    trows = [
        f"  ({sq(t['event'])}, {sq(t['title'])}, {sq(t['body'])}, {sq(t['tone'])}, "
        f"{sq(t['channel'])}, {sq(t['deep_link'])}, FALSE, TRUE)"
        for t in templates
    ]
    out.append(",\n".join(trows) + ";")
    out.append("")

    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(events)} event types, {len(templates)} templates")
    tones = {}
    for t in templates:
        tones[t["tone"].split(":")[0]] = tones.get(t["tone"].split(":")[0], 0) + 1
    print("  tones:", ", ".join(f"{k}={v}" for k, v in sorted(tones.items())))


if __name__ == "__main__":
    main()
