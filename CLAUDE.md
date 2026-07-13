# STEADY — Claude Instructions

## ALWAYS DO THIS FIRST
**Before doing anything else in a conversation — read `.claude/rules.md` in full.** Every rule there applies to every action. Do not write code, install packages, or make decisions before reading it.

## Always follow these rules
See `.claude/rules.md` for the full rules. The two most important ones:

**Rule 1 — After every meaningful action (writing code, installing packages, making decisions, hitting milestones), add an entry to `DEVLOG.md`.**

Entries should be written in a conversational, build-in-public voice — like a dev blog post or tweet thread. First-person plural ("We built...", "We decided...", "We ran into..."). Enough context that someone reading it cold understands what happened and why.

**Rule 2 — Teach before you build.** Before any code or technical action, explain what it is, why we're doing it, how it fits the system architecture, and log the learning to `LEARNING.md`.

## Project context
This is STEADY — an AI calorie tracking app for iOS + Android. Full product plan is in `.claude/plans/`. Memory files with all design decisions are in `.claude/memory/`.

## Tech stack
React Native + Expo · Supabase · OpenAI GPT-4o (food photos) · Claude claude-sonnet-4-6 (AI nutritionist) · Zustand · TypeScript

## Developer background
Non-JS background (Python/Java/C++). Explain TypeScript patterns, React hooks, and mobile-specific concepts clearly. Don't assume familiarity with JSX or the React ecosystem.
