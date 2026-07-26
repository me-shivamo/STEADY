<div align="center">

# 🥗 STEADY

### AI-Powered Calorie Tracking — Built for Real Life

*Snap a photo or type a meal. Get instant calories and macros.*

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

STEADY is an AI-first calorie and nutrition tracker that gets out of your way. No more manually searching food databases or guessing portion sizes. You snap a photo of your meal or describe it in a chat box, STEADY's AI identifies what's on the plate (or in the text), estimates macros, and logs it — in seconds.

---

## Core Features

<table>
<tr>
<td width="50%">

**📸 AI Photo Scanning**
Point your camera at any meal. GPT-4o Vision identifies food items, estimates portions, and calculates calories + macros.

</td>
<td width="50%">

**💬 AI Text Logging**
Type what you ate in plain English in the same chat screen — the AI extracts the food items and nutrition and logs it.

</td>
</tr>
<tr>
<td width="50%">

**⭕ Calorie Ring & Home Dashboard**
An animated ring on your home screen tracks calories toward your daily goal, alongside macro breakdowns.

</td>
<td width="50%">

**💬 Conversational Onboarding**
A chat-style setup — tap cards to answer, not fill in fields — that ends with a calculated calorie and macro target.

</td>
</tr>
<tr>
<td width="50%">

**⚖️ Weight, Water & Measurements**
Log weight, water intake, and body measurements over time.

</td>
<td width="50%">

**🛠️ Manual Macro Adjustment**
Override calculated calorie/macro targets by hand from Settings.

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
├─────────────────────────────────────────────────────┤
│  Backend       Supabase (PostgreSQL + Auth)          │
│  Storage       Supabase Storage (meal photos)        │
│  Edge Fns      Supabase Edge Functions (Deno)        │
├─────────────────────────────────────────────────────┤
│  AI — Vision   OpenAI GPT-4o (food photo analysis)  │
│  AI — Text     Food/macro extraction from chat text  │
│  Food DB       USDA FoodData Central (RAG cache)     │
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
│   ├── app/          # Home, AI food-log chat, Weight, Water, Body Measurements, Settings
│   ├── auth/         # Welcome, Login, Signup, Password reset
│   └── onboarding/   # Conversational setup (stats, activity, diet, goal, target weight, reveal)
├── components/
│   ├── nutrition/    # MealCard and food UI components
│   ├── onboarding/   # ChatBubble and onboarding-specific UI
│   ├── profile/      # Profile drawer components
│   └── common/       # Shared UI primitives
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
# Fill in your Supabase URL and anon key

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

## Philosophy

Most calorie trackers fail because they're too much friction. Logging a meal shouldn't feel like filing an expense report.

STEADY is built on one principle: **the fastest log is one you'll actually do.** Photo → confirm → done. Or type it in chat.

---

<div align="center">

Built in public · React Native + Expo + Supabase + GPT-4o

*A first mobile app. Made with curiosity and too many snacks.*

</div>
