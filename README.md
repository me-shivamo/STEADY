<div align="center">

# 🥗 STEADY

### AI-Powered Calorie Tracking — Built for Real Life

*Snap a photo. Log a meal. Talk to your nutritionist. That's it.*

<br/>

![React Native](https://img.shields.io/badge/React_Native-0.81-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?style=for-the-badge&logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

![Platform](https://img.shields.io/badge/Platform-iOS_%7C_Android-C8703A?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active_Development-FDF6EC?style=for-the-badge&labelColor=C8703A&color=FDF6EC)

</div>

---

## What is STEADY?

STEADY is an AI-first calorie and nutrition tracker that gets out of your way. No more manually searching food databases or guessing portion sizes. You snap a photo of your meal, STEADY's AI identifies what's on the plate, estimates macros, and logs it — in seconds.

But it goes further than just logging. STEADY includes a built-in **AI Nutritionist** (powered by Claude) that you can actually talk to. Ask it why your energy crashes at 3pm. Ask it to suggest a high-protein breakfast. It knows your food history and gives real, personalized answers.

> *Inspired by CalAI, HealthifyMe, and Journable — built to be better than all three.*

---

## Core Features

<table>
<tr>
<td width="50%">

**📸 AI Photo Scanning**
Point your camera at any meal. GPT-4o Vision identifies food items, estimates portions, and calculates calories + macros. One tap from anywhere in the app.

</td>
<td width="50%">

**🤖 AI Nutritionist Chat**
A Claude-powered nutritionist that knows your entire food history. Type food to log it, or ask a question — it handles both in the same chat.

</td>
</tr>
<tr>
<td width="50%">

**🍽️ Card-Based Journal Feed**
Every meal logged appears as a rich card in your daily feed. Scroll back through your week. See patterns. Edit entries on the fly.

</td>
<td width="50%">

**⭕ Calorie Ring**
A satisfying animated ring on your home screen tracks calories toward your daily goal. Fills up with a haptic pulse every time you log food.

</td>
</tr>
<tr>
<td width="50%">

**💬 Conversational Onboarding**
No forms. A 7-step chat-style setup — tap cards to answer, not type in fields. Feels like talking to a friend, not filling out a tax form.

</td>
<td width="50%">

**🧠 My Foods Memory**
STEADY learns from your edits. Correct a portion size once, it remembers for next time. Your preferences build up over time.

</td>
</tr>
</table>

---

## Tech Stack

```
┌─────────────────────────────────────────────────────┐
│                   STEADY Architecture                │
├─────────────────────────────────────────────────────┤
│  UI Layer      React Native 0.81 + Expo SDK 54      │
│  Language      TypeScript 5.9                        │
│  Navigation    React Navigation (tabs + stack)       │
│  State         Zustand (global store)                │
│  Forms         React Hook Form + Zod validation      │
│  Charts        Victory Native                        │
│  Animations    React Native Reanimated               │
├─────────────────────────────────────────────────────┤
│  Backend       Supabase (PostgreSQL + Auth)          │
│  Storage       Supabase Storage (meal photos)        │
│  Edge Fns      Supabase Edge Functions (Deno)        │
├─────────────────────────────────────────────────────┤
│  AI — Vision   OpenAI GPT-4o (food photo analysis)  │
│  AI — Chat     Anthropic Claude Sonnet (nutritionist)│
│  Food DB       USDA FoodData Central + Open Food Facts│
├─────────────────────────────────────────────────────┤
│  Analytics     PostHog                               │
│  Auth          Supabase Auth + Apple Sign-In         │
└─────────────────────────────────────────────────────┘
```

---

## App Structure

```
src/
├── screens/
│   ├── app/          # Home, Journal, AI Chat, Profile
│   ├── auth/         # Login, Sign Up
│   └── onboarding/   # 7-step conversational setup
├── components/
│   └── nutrition/    # MealCard and food UI components
├── api/              # Supabase + AI API calls
├── store/            # Zustand global state slices
├── navigation/       # Tab + stack navigator config
├── theme/            # Colors, typography, design tokens
└── types/            # TypeScript interfaces
```

---

## Design Language

STEADY uses an **earthy, warm** visual style — designed to feel like a cozy food journal, not a cold fitness tracker.

| Token | Value | Usage |
|---|---|---|
| Background | `#FDF6EC` | Cream — main app background |
| Accent | `#C8703A` | Terracotta — CTAs, active states |
| Text Primary | `#2D1F0E` | Deep brown — headings |
| Text Muted | `#9A7B5A` | Warm grey — subtitles, labels |

---

## Getting Started

**Prerequisites:** Node.js 18+, Expo CLI, iOS Simulator or Android Emulator (or Expo Go on your phone)

```bash
# Clone the repo
git clone https://github.com/cho-zen/steady.git
cd steady

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase URL, anon key, OpenAI key, Anthropic key

# Start the dev server
npm start
```

Then scan the QR code with **Expo Go** on your phone, or press `i` for iOS simulator / `a` for Android.

---

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

AI keys live in Supabase Edge Function secrets — they never touch the client.

---

## Roadmap

- [x] Conversational onboarding
- [x] User profile & settings
- [x] Home dashboard with calorie ring
- [x] PostHog analytics integration
- [ ] AI photo scanning (in progress)
- [ ] AI Nutritionist chat
- [ ] Journal feed with meal cards
- [ ] Barcode scanner (Open Food Facts)
- [ ] Weekly nutrition charts
- [ ] RevenueCat IAP for premium tier

---

## Philosophy

Most calorie trackers fail because they're too much friction. Logging a meal shouldn't feel like filing an expense report.

STEADY is built on one principle: **the fastest log is one you'll actually do.** Photo → confirm → done. Or type it in chat. Or just ask the AI — it'll figure out what you ate from context.

The AI doesn't replace thinking about food. It removes the boring parts so you can focus on the interesting ones.

---

<div align="center">

Built in public · React Native + Expo + Supabase + Claude + GPT-4o

*A first mobile app. Made with curiosity and too many snacks.*

</div>
