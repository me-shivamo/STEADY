#!/usr/bin/env python3
"""
Generate the message-catalogue section of NOTIFICATIONS.md.

Same reasoning as gen-notification-seed.py: .claude/plans/notifications.md is the
source of truth for copy, so the documentation is generated from it rather than
transcribed. A hand-copied table would start drifting from the database the
first time anybody edits a line.

Writes between the two marker comments in NOTIFICATIONS.md, leaving everything
else untouched:
    <!-- BEGIN GENERATED CATALOGUE -->
    <!-- END GENERATED CATALOGUE -->

Run:  python3 scripts/gen-notification-docs.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOGUE = ROOT / ".claude/plans/notifications.md"
TARGET = ROOT / "NOTIFICATIONS.md"

BEGIN = "<!-- BEGIN GENERATED CATALOGUE -->"
END = "<!-- END GENERATED CATALOGUE -->"

SECTION_TITLES = {
    "A": "A · Onboarding", "B": "B · Celebrations", "C": "C · Feature discovery",
    "D": "D · Groups", "E": "E · Mealtime", "F": "F · Lapse and win-back",
    "G": "G · Streak at risk", "H": "H · Weight and progress",
    "I": "I · Water", "J": "J · Recaps",
}

# The plain-English trigger, matching the conditions in enqueue_due_events()
# (migrations 038 and 039). Kept here rather than parsed from the catalogue's
# prose so the docs state what the CODE actually does, not what the plan said.
TRIGGERS = {
    "welcome": "Day 0, ~10 min after signup",
    "how_to_log_food": "Day 0, nothing logged yet",
    "first_log_nudge_evening": "Day 0, after 19:00, still nothing logged",
    "day1_morning": "Day 1, nothing logged today",
    "day2_photo_tip": "Days 2-3",
    "day3_reminders_screen": "Days 3-4, no reminder set",
    "day7_first_week": "Days 7-9",
    "first_log_celebration": "Their first ever food log",
    "daily_target_hit": "Calories within 10% of target AND protein met",
    "first_week_complete": "7 active days, within first 14 days",
    "streak_milestone": "Streak hits 3, 7, 14, 30, 50 or 100",
    "perfect_week": "All 7 of the last 7 days logged",
    "discover_chat_water": "Days 2-4, never logged water (and water tracking on)",
    "discover_chat_logging": "Days 4-6, never used the chat",
    "discover_groups": "Days 5-6, not in a group",
    "discover_progress_screen": "Days 6-8, 4+ active days",
    "group_never_opened": "⚠️ Not wired up (no screen-open tracking)",
    "group_no_join_day7": "Days 7-10, still not in a group",
    "group_member_joined": "Someone joins your group (owner only)",
    "group_activity": "A group member logged today, you haven't",
    "lunch_nudge": "After 12:00, no meal logged today",
    "dinner_nudge": "After 19:00, fewer than 2 meals logged",
    "under_eating_evening": "After 20:00, 1+ meal but under 50% of calorie target",
    "lapse_1d": "1 day silent, after an active week",
    "lapse_3d": "3 days silent",
    "lapse_7d": "7 days silent",
    "lapse_14d": "14 days silent",
    "lapse_30d": "30 days silent (the last message we ever send)",
    "streak_risk_evening": "After 19:00, streak 3+ alive, nothing logged today",
    "weigh_in_nudge_7d": "7+ days since last weigh-in",
    "weight_milestone": "Each whole kg toward the goal, vs first weigh-in",
    "water_behind_afternoon": "After 15:00, under 40% of water goal",
    "weekly_recap": "Sunday, 3+ active days that week",
}

TONE_RE = re.compile(r"^(funny|serious|motivational|cute-angry|friendly|rage-bait|persona:[a-z-]+)$")


def esc(s: str) -> str:
    """Escape pipes so copy containing '|' cannot break the markdown table."""
    return s.replace("|", "\\|")


def parse():
    sections, section, current = [], None, None
    for raw in CATALOGUE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()

        m = re.match(r"^# ([A-J]) · ", line)
        if m:
            section = {"key": m.group(1), "events": []}
            sections.append(section)
            continue

        m = re.match(r"^### `([a-z0-9_]+)` · channel `([a-z]+)`", line)
        if m and section is not None:
            current = {"key": m.group(1), "channel": m.group(2), "rows": []}
            section["events"].append(current)
            continue

        if current is not None and line.startswith("| ") and line.count("|") >= 4:
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) == 3 and TONE_RE.match(cells[0]):
                current["rows"].append(cells)
    return sections


def main():
    if not CATALOGUE.exists():
        sys.exit(f"Catalogue not found: {CATALOGUE}")
    if not TARGET.exists():
        sys.exit(f"Target not found: {TARGET}")

    sections = parse()
    total = sum(len(e["rows"]) for s in sections for e in s["events"])
    events = sum(len(s["events"]) for s in sections)
    if not total:
        sys.exit("Parsed no messages.")

    out = [BEGIN, ""]
    out.append(f"> **{events} events · {total} messages.** Generated from "
               "`.claude/plans/notifications.md` by `scripts/gen-notification-docs.py`. "
               "Edit the catalogue, re-run the script, do not edit this section by hand.")
    out.append("")
    out.append("Triggers below describe what `enqueue_due_events()` actually checks "
               "(migrations 038 and 039), not what the original plan proposed. "
               "⚠️ marks events whose templates exist but which nothing currently queues.")
    out.append("")

    for s in sections:
        out.append(f"### {SECTION_TITLES.get(s['key'], s['key'])}")
        out.append("")
        out.append("| Event | Fires when | Tone | Title | Body |")
        out.append("|---|---|---|---|---|")
        for e in s["events"]:
            trig = TRIGGERS.get(e["key"], "—")
            for i, (tone, title, body) in enumerate(e["rows"]):
                # Event key and trigger only on the first row of each block, so
                # the eye can find the boundaries in a long table.
                key_cell = f"`{e['key']}`" if i == 0 else ""
                trig_cell = trig if i == 0 else ""
                out.append(f"| {key_cell} | {trig_cell} | `{tone}` | {esc(title)} | {esc(body)} |")
        out.append("")

    out.append(END)

    text = TARGET.read_text(encoding="utf-8")
    if BEGIN in text and END in text:
        pre = text.split(BEGIN)[0]
        post = text.split(END)[1]
        text = pre + "\n".join(out) + post
    else:
        sys.exit(f"Markers not found in {TARGET.name}. Add {BEGIN} / {END} first.")

    TARGET.write_text(text, encoding="utf-8")
    print(f"Updated {TARGET.name}: {events} events, {total} messages across {len(sections)} sections")


if __name__ == "__main__":
    main()
