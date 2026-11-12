# STEADY — Claude Instructions

## ALWAYS DO THIS FIRST
**Before doing anything else in a conversation — read `.claude/rules.md` in full.** Every rule there applies to every action. Do not write code, install packages, or make decisions before reading it.

## Always follow these rules
See `.claude/rules.md` for the full rules. The two most important ones:

**Rule 1 — After every meaningful action (writing code, installing packages, making decisions, hitting milestones), add an entry to `docs/journal/DEVLOG.md`.**

Entries should be written in a conversational, build-in-public voice — like a dev blog post or tweet thread. First-person plural ("We built...", "We decided...", "We ran into..."). Enough context that someone reading it cold understands what happened and why.

**Rule 2 — Teach before you build.** Before any code or technical action, explain what it is, why we're doing it, how it fits the system architecture, and log the learning to `docs/journal/LEARNING.md`.

## Project context
This is STEADY — an AI calorie tracking app for iOS + Android. Full product plan is in `.claude/plans/`. Memory files with all design decisions are in `.claude/memory/`.
All other docs live under `docs/` (index in `docs/README.md`); only `README.md` and `CLAUDE.md` stay at the repo root.

## Tech stack
React Native + Expo · Supabase · OpenAI GPT-4o (food photos) · Claude claude-sonnet-4-6 (AI nutritionist) · Zustand · TypeScript

## Developer background
Non-JS background (Python/Java/C++). Explain TypeScript patterns, React hooks, and mobile-specific concepts clearly. Don't assume familiarity with JSX or the React ecosystem.

## Social post drafts (X and LinkedIn)

Follow the post guide at /home/shivam/Silver-Intelligence/work-log/x-linkedin-post-guide.md
(master copy; read it fresh each time a post comes up).

- Do not draft a post for every task. At the end of a task, check the work against the bar in
  section 2 of the guide. Only if it passes, draft a post and save it to this workspace's
  social-posts file, `docs/social/social-posts.md` (gitignored, newest first). Say so in one line.
- If it is borderline, do not draft: mention it in one line as a possible post and let the user
  decide.
- Never name the company, the product or specific features in a post.
- When the user shares how a posted draft performed, record it as section 12 describes.
- When a trigger in section 13 fires, tell the user the guide is due for a re-check, and update
  it only with their go-ahead.
- DEVLOG.md entries are the internal build log, not post drafts. The bar and the no-names rule
  apply to drafts in the social-posts file, not to DEVLOG.md.
