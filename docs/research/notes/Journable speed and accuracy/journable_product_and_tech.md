# Journable (AI calorie counter): product, features and technical approach

_Researched 2026-11-11. "Official" means the claim comes from Journable's own website, store listings, privacy policy, blog or developer replies. "Independent" means third-party QA, data-scraping or user-review evidence. Store figures were fetched on 2026-11-11 unless another date is given._

## 1. App identity: developer, platforms, launch dates, listings, and similarly named apps

### Takeaway
"Journable" (sometimes misspelled "journble") is **Journable: AI Calorie Counter**, a chat-first AI calorie and exercise tracker. Journable LLC publishes it from a Seattle mailing address, and the privacy policy is issued by "Multicoded LLC" at the same address. It launched on iOS on 2024-03-08 and on Android on 2024-03-13, and it is far bigger on Android (1M+ downloads, 124K reviews) than on iOS (518 ratings). The co-founders are Steve Hoyek and someone called Georges, whose surname is not public.

### Cited Findings
- **iOS:** the app is "Journable: AI Calorie Counter", id 6477719720, seller and artist Journable LLC. First release was `2024-03-08T08:00:00Z`. The current version is 2.1.264, released `2026-10-20`. File size is 87,183,360 bytes, minimum iOS is 15.6, genre is Health & Fitness, and the seller URL is journable.com. Source: [iTunes Lookup API](https://itunes.apple.com/lookup?id=6477719720&country=us)
- **iOS listing details:** the subtitle is "Diet, Exercise & Macro Tracker" and the rating is 4.8 from 518 ratings. It runs on iPhone and iPad (iOS 15.6+), on Mac with M1 or later, and on Apple Vision. **No Apple Watch app is listed.** It shows English plus 71 other languages, including Hindi. The copyright line reads "© 2022 Journable LLC". Source: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Android:** package `com.journable.app`, 4.7 stars from 124K reviews, "1M+" downloads, updated Oct 19, 2026. The page data gives a first-release date of Mar 13, 2024. The developer is "Journable LLC, info@journable.com, 113 Cherry St, Seattle, WA 98104, United States, +1 206-992-1330". Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Privacy policy operator:** "This Privacy Notice for Multicoded LLC … when you … Download and use our mobile application (Journable)". The contact is "Multicoded LLC 113 Cherry St PMB 42861 Seattle, WA 98104". The policy was last updated August 19, 2025. Source: [Privacy policy (Termly)](https://app.termly.io/document/privacy-policy/b256e222-60d2-42e0-b7ea-379548211541), linked from [journable.com](https://www.journable.com)
- **Co-founders:** the Product Hunt launch comment reads "Steve & Georges here, co-founders of a new mobile app we are very excited to launch: Journable! … an AI chatbot that makes meal & exercise calorie tracking as easy as texting your friend." This text was visible only in a search-result snippet; the rendered page did not show it. Source: [Product Hunt makers](https://www.producthunt.com/products/journable/makers), [Steve Hoyek PH activity](https://www.producthunt.com/@stevehoyek/activity)
- **Steve Hoyek hosts the company podcast "The Weigh In by Journable".** In the 2026-07-23 episode the guest is Georges Fayad, a personal trainer and co-founder of Move Lebanon. Steve says Fayad is *not* his Journable co-founder: "a mutual friend who is one of your clients… George, the other George… He's actually my co-founder, just to be very specific." Source: [Journable blog/podcast, 2026-07-23](https://www.journable.com/blog/georges-fayad-training-to-feel-good)
- **Product Hunt launches:** the first was on May 1, 2024 ("Chat your way to health & fitness with AI powered tracking"), and a second was on Jan 1, 2025 ("AI nutrition assistant"). The listing has one 5.0 review. Source: [Product Hunt](https://www.producthunt.com/products/journable). The website shows a Product Hunt "top post topic" weekly badge (post_id 454768). Source: [journable.com](https://www.journable.com)
- **Website:** journable.com is built on Webflow (it loads scripts from `cdn.prod.website-files.com`). Its tagline is "Chat your way to Health & Fitness". Source: [journable.com](https://www.journable.com)
- **Unrelated apps with similar names:**
  - "Journable", an open-source Linux bullet-journal app by Björn Daase (`net.daase.journable`). Sources: [Flathub](https://flathub.org/apps/details/net.daase.journable), [AlternativeTo](https://alternativeto.net/software/journable/about)
  - A guided-journaling product listed as "Journable Inc." Source: [creati.ai](https://creati.ai/es/ai-tools/journable/)
  - **journable.net is NOT official.** Its footer says "Independent fan-built reference page. Not officially affiliated", and its download and subscribe links go to krioneru.com. Treat its claims as unreliable. For example, it says "From $2.49/mo" and mentions voice input, and neither claim appears in any official source. Source: [journable.net](https://journable.net/)
  - A search for the misspelling "journble" found no app by that name; results resolved to Journable. Source: [search results incl. appwisp](https://appwisp.com/app/android/com.journable.app)

### Inferences
- "PMB 42861" means a private mailbox. Together with the Lebanese guests and venues on the podcast (Move Lebanon, Batroun), this suggests a small team, possibly based outside the US, using a US LLC and mail address. This is **not confirmed**.
- The 2022 copyright against a March 2024 launch suggests the LLC or the project existed before the app shipped.
- Reviews on Play outnumber App Store ratings by about 240×. That points to a largely Android, global user base, which fits the 72 localizations and the ad/attribution SDKs listed in section 3.

### Gaps
- Georges's surname and both founders' backgrounds. No LinkedIn or press profile was found.
- What "Multicoded LLC" is and how it relates to Journable LLC. No registry or web presence was found.
- The country where the team is based.

## 2. Logging methods and exact flows (text, voice, photo, barcode, chat, Watch, Siri, widgets; taps; confirm vs auto-log; edits)

### Takeaway
Journable has **two input modes**: free-text chat and photo (camera or gallery). It also has a **favorites/recents shortcut** and **auto-complete** from past entries. All of these sit in one persistent bottom bar labelled "What did you eat or exercise?". The AI result becomes a meal card in the day's diary, with an itemised breakdown and default portions, and you change it through an Edit (pencil) screen. Public evidence conflicts on whether there is a review step before saving: the blog says there is, while QA testing and the screenshots look like log-first, edit-after. **Barcode, voice, Apple Watch, Siri, widgets and Apple Health / Health Connect have no official evidence of existing as of Nov 2026.**

### Cited Findings
- **Official description:** "lets you log meals and exercise through a simple chat interface with text or photos. It is designed for speed and simplicity"; "Just text our AI about your meals and exercise, and it will count the calories and macros for you"; "as simple as chatting with ChatGPT". Source: [iTunes Lookup API description](https://itunes.apple.com/lookup?id=6477719720&country=us), [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Website:** "Log meals and exercise with a user-friendly AI chat, no databases needed." It also says "Enjoying a meal out? Too many ingredients? Prefer not to type? … just snap a photo of your meal and our advanced AI will instantly and accurately estimate your portion size, macros, and calorie count." Source: [journable.com](https://www.journable.com)
- **The home screen, from App Store screenshots** (viewed 2026-11-11):
  - A persistent bottom input bar reads "What did you eat or exercise?" and has three icons: bookmark (favorites), gallery image and camera.
  - Above it are a date strip and a "Today" calendar dropdown, then a Calories card (Food / Exercise / Remaining) and a Macros card (Carbs / Protein / Fat against targets).
  - Each logged meal is a card listing its items with portions, for example "Whole wheat bread (1 slice)", "Fried egg (1 large)" and "Mashed avocado (2 tbsp)". Each item shows its own calories, carbs, protein and fat, and the card shows meal totals with a % of the daily target, a timestamp, an edit pencil and an overflow menu.
  - A typed example, "Grilled Salmon Fillet with Steamed Broccoli and a Cup of Brown Rice", becomes three items: "Grilled Salmon (3 oz)", "Steamed Broccoli (1 cup)" and "Brown Rice (1 cup)".
  - Source: [App Store US screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Photo screenshot:** a camera view with per-ingredient labels, for example "Potato 130 cal.", "Chicken 280 cal.", "Tomato 20 cal." and "Avocado 120 cal.". The description says the AI "estimates portion size, calories, and macros, for each ingredient". Source: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Exercise is logged in the same bar.** "45 minutes tennis" becomes 400 kcal and "3km light jog" becomes 210 kcal, each with a prose explanation. Source: [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Independent QA (QAwerk, 2025-11-27, iPhone 14 Pro Max, iOS 18.6.2):**
  - Text flow: "Tap the 'What did you eat or exercise?' field and type 'Cappuccino,' then tap 'Return'". This produces an entry with estimated nutrition.
  - Photo flow: "Tap the 'Image' icon to add a meal and add the first photo."
  - Editing: "Tap the 'Edit' icon" opens a "Meal edit" page where items can be added or removed, followed by "Save".
  - Source: [QAwerk Bug Crawl](https://bugcrawl.qawerk.com/weekly-bug-crawl/bugs-found-in-journable-ai-calorie-counter-for-ios/)
- **Official blog on review-before-save** (2026-07-23): "use Journable to log a meal by photo or description, then review and adjust the result before saving". The stated goal is to "let the person who ate the meal confirm the details." Source: [Journable blog: How accurate are AI calorie counters?](https://www.journable.com/blog/how-accurate-are-ai-calorie-counters)
- **Official blog on homemade meals** (2026-07-29): "log a homemade meal from a photo or description, then correct ingredients and portions before saving". Source: [Journable blog: homemade food](https://www.journable.com/blog/how-to-count-calories-in-homemade-food)
- **Favorites and recents:** the description says "Favorite Foods: Quickly log your most frequent meals or exercise entries with a single tap." A developer reply on 2025-08-05 says "tap the button next to the chatbox to open the Favorites and Recent Entries tab". Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Auto-complete:** a developer reply (Feb 2; year not shown) to a request to "archive food items by nicknames" says that while typing, auto-complete suggests past entries, and that meals can be saved and reused. Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **Barcode is not offered.** A Play review on 2026-10-19 says it "would really benefit from Health Connect synchronization and a bar code scanning ability". The developer reply treats both as suggestions. Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Voice:** neither the official description nor the website mentions voice. A third-party aggregator summarising reviews says "Voice: Not mentioned. Input is text or photo." Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720). Only the unofficial journable.net claims voice. Source: [journable.net](https://journable.net/)
- **Apple Health:** the developer replied on 2025-03-11 that it is "on the roadmap and coming soon". Users were still asking for Apple Health and Apple Watch sync in later reviews (a Russian review, Jun 30 reply; a Play review, Oct 2026). Sources: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews), [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)
- **Users on speed:** "type in what was eaten and get visual macros" (App Store review "Efficient and accurate", 2025-07-24). Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews). Reviewers say it takes the "painful data entry out of the calorie tracking". Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)
- **Users on photo editing:** "Does a great job of analysing pictures of food and you can edit it if it's not quite right" (Play review, 2025-07-23). Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Processing failure:** one reviewer says that after a photo upload the app stayed in "processing" and never showed nutrition. Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)

### Inferences
- The **minimum interaction**, inferred from the UI and not measured, is:
  - Text: tap the field, type, then tap send/Return.
  - Repeat food: tap the bookmark, then tap the item.
  - Photo: tap the camera, then the shutter.
  - No meal-type picker (breakfast, lunch and so on) appears in any screenshot. Cards are just timestamped, which removes a step most legacy trackers require.
- The confirmation model is ambiguous. For text, the QA steps and screenshots suggest an **auto-log-then-edit** flow. The 2026 blog wording ("review and adjust … before saving") may describe a photo review step, or it may be aspirational. Testing the app directly would settle it.
- One input box serves both food and exercise, with no mode switch. That suggests an LLM classifier routes each message.

### Gaps
- No published timing figures (seconds to log) or tap counts.
- Siri / App Intents, home-screen or lock-screen widgets, and Wear OS / watchOS: no mention anywhere, official or independent.
- Whether a multi-turn chat correction such as "actually it was 2 eggs" is supported. Only the unofficial journable.net claims it.

## 3. AI models/providers and technical stack

### Takeaway
The only official disclosure of an AI vendor is the privacy policy (updated 2025-08-19): AI features are provided "through third-party service providers … including OpenAI", covering "Image analysis, Natural language processing, AI automation". No specific model is named anywhere. The Android app is built in **Flutter**, with Firebase, Adjust, RevenueCat, AdMob and Facebook ad SDKs.

### Cited Findings
- **AI vendors:** "We provide the AI Products through third-party service providers ("AI Service Providers"), including OpenAI. … your input, output, and personal information will be shared with and processed by these AI Service Providers." The policy lists the AI functions as "Image analysis, Natural language processing, AI automation". Source: [Privacy policy (last updated Aug 19, 2025)](https://app.termly.io/document/privacy-policy/b256e222-60d2-42e0-b7ea-379548211541)
- **Other privacy-policy details:**
  - Third-party categories include "Cloud Computing Services, Data Analytics Services, AI Platforms, Data Storage Service Providers, Payment Processors, … Performance Monitoring Tools, User Account Registration & Authentication Services, Ad Networks".
  - Payments go through "Apple App Store … Google Play Store … RevenueCat and Stripe".
  - Google Analytics is used.
  - "Our servers are located in the United States".
  - Health data is processed as sensitive information.
  - Social login is offered via Facebook and X.
  - Source: [Privacy policy](https://app.termly.io/document/privacy-policy/b256e222-60d2-42e0-b7ea-379548211541)
- **Play data-safety label:** "No data shared with third parties". Collects personal info, app activity, and app info and performance. Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **SDK scan** (AppGoblin, last scanned 2026-10-25):
  - Development tools: Flutter, Kotlin, Square, Google
  - Product analytics: Firebase
  - Attribution: Adjust
  - Business: RevenueCat
  - Mediation: AdMob
  - Ad networks: Google, Facebook
  - No OpenAI SDK was detected, which is consistent with AI calls going through Journable's own backend.
  - Source: [AppGoblin](https://appgoblin.info/apps/com.journable.app)
- **Cost link:** a developer reply on 2026-04-21 says "Journable requires a subscription to help cover the costs of AI technology and maintain a stable service." Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Marketing language:** "Powered by advanced AI"; "as simple as chatting with ChatGPT". Source: [App Store description via Lookup API](https://itunes.apple.com/lookup?id=6477719720&country=us)
- **Photo pipeline:** the official blog describes the generic pipeline as identifying food, naming items, estimating portions ("Infer area, depth, volume, or weight from a two-dimensional image") and matching nutrition data. It explicitly says these figures "should not be treated as a performance claim for Journable". Source: [Journable blog, 2026-07-23](https://www.journable.com/blog/how-accurate-are-ai-calorie-counters)

### Inferences
- With OpenAI as the named provider and per-item JSON-like output (item, portion, kcal, C/P/F, plus micronutrients and prose explanation), the likely architecture is a single multimodal OpenAI call per message, returning structured nutrition directly from the model. Section 4 has the evidence that no lookup database is involved. The specific model (GPT-4o, 4.1, 5, etc.) is unknown.
- The Play label "No data shared" is consistent with Google's rule that sharing with service providers on the developer's behalf is not "sharing". It does not contradict the OpenAI disclosure.

### Gaps
- The model name, any fine-tuning, prompt design, latency figures and whether more than one provider is used ("including OpenAI" leaves room for others).
- No job posts, engineering blog, Hacker News, Indie Hackers or Reddit posts by the team describing the tech were found. Searches for Reddit threads returned nothing.

## 4. Food databases and source display

### Takeaway
There is **no evidence of any nutrition database** (USDA, Nutritionix, FatSecret, Open Food Facts, Edamam, restaurant data). Official copy markets the absence of one ("no databases needed"). The UI shows no source attribution and no verified-versus-user-entry distinction. Nutrition values appear to be AI-generated.

### Cited Findings
- **Website:** "Chat-Based Calorie Tracker: Log meals and exercise with a user-friendly AI chat, no databases needed." Source: [journable.com](https://www.journable.com)
- **Entry detail screenshot:** an AI "Explanation" paragraph sits above a "Nutrition Facts" panel listing total carbohydrates, dietary fiber, sugar, added sugars, sugar alcohols, net carbs, protein, total fat, saturated fat, trans fat, polyunsaturated fat and more. **No source label or database name appears** on any screenshot. Source: [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Blog on databases in general:** calorie values come from "reference foods, calculated recipes, or manufacturer labels", citing USDA FoodData Central, and "two apps could recognize the same plate yet return different totals because they select different database records or default serving sizes." It does not say which database, if any, Journable uses. Source: [Journable blog, 2026-07-23](https://www.journable.com/blog/how-accurate-are-ai-calorie-counters)
- **Independent bug, food semantics:** typing "Lactose-free cappuccino" returned *higher* calories, carbs, protein and fat than "Cappuccino". Source: [QAwerk, 2025-11-27](https://bugcrawl.qawerk.com/weekly-bug-crawl/bugs-found-in-journable-ai-calorie-counter-for-ios/)
- **User reports of drift:** the same foods give inconsistent values. One user reported "inconsistent values for previously logged foods, even with the same entries"; this was a paying annual subscriber, Sep 23, likely 2025. Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews). Another reviewer said calorie and macro values "varied too much to trust". Source: [Google Play (en)](https://play.google.com/store/apps/details?id=com.journable.app&hl=en)

### Inferences
- The run-to-run inconsistency, the semantic error with lactose-free milk and the "no databases needed" positioning all point to values generated by an LLM, not retrieved from a database. This is Journable's main accuracy weakness, and a database-grounded approach could improve on it.

### Gaps
- No official statement confirming or denying database grounding. No sub-processor list naming a nutrition API.

## 5. Portion sizes, ambiguous foods, restaurant and international foods (incl. Indian), multilingual input

### Takeaway
The AI fills in default portions ("3 oz", "1 cup", "1 large") and shows them in the item name, so the user can see and edit the assumption. Journable claims "all local & international foods" and offers 72 store localizations, but there is no specific evidence on Indian food. Photo portion estimation is the weakest point in independent evidence.

### Cited Findings
- **Default portions in item names:** "Grilled Salmon (3 oz)", "Brown Rice (1 cup)", "Fried egg (1 large)", "Mashed avocado (2 tbsp)". Source: [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **International and restaurant food claims:**
  - "All local & international foods supported". Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
  - "Journable's AI understands a wide variety of foods, from homemade meals to restaurant dishes." Source: [journable.com](https://www.journable.com)
  - The app supports "your grandma's best recipes, international dishes & drinks". Source: [Product Hunt](https://www.producthunt.com/products/journable)
- **Languages:**
  - The App Store lists English plus 71 more languages, including Hindi, Arabic, Chinese, Japanese, Korean, Russian and Swahili. Source: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
  - The affiliate page says "available in all languages". Source: [Journable Affiliate Program](https://www.journable.com/affiliate-program)
  - Reviews in Spanish and Russian exist. Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **Photo portion error (independent):** a kitchen-scale check found meat logged as about 2 oz actually weighed about 5.5 oz, and a vegetable was overestimated by about 2 oz. Source: [App Store review "Inaccurate against weighing"](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **Photo inconsistency (independent):** the same plate photographed at two distances gave 630 kcal and 470 kcal. Source: [QAwerk, 2025-11-27](https://bugcrawl.qawerk.com/weekly-bug-crawl/bugs-found-in-journable-ai-calorie-counter-for-ios/)
- **Portion rescaling error:** a reviewer halved a 400 g, 700 kcal fish package and got 250 or 450 kcal instead of 350. They say the same happens when correcting photo portions. Source: [mwm.ai review summary](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)
- **Official accuracy guidance** (blog, 2026-07-23):
  - Hidden fats such as oil, butter and dressings are listed as things photos usually cannot show.
  - The recommended review steps are to confirm foods, check the main portions, "Add invisible extras", use known quantities from packages or restaurant data, and sanity-check against similar past meals.
  - The post cites a 2023 review of 52 studies in which relative calorie errors ranged from 0.10% to 38.3%.
  - Source: [Journable blog](https://www.journable.com/blog/how-accurate-are-ai-calorie-counters)
- **Exercise estimates are generic:** "for an average adult, depending on weight and pace. This estimate assumes a moderate pace and average body weight." Source: [App Store screenshot "Easily Log Your Exercise"](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)

### Inferences
- Edits appear to go back through the AI rather than being scaled arithmetically per gram. The fish-halving error, and the QAwerk case where removing a 0-kcal item cut the total from 620 to 356, suggest the whole meal is re-estimated when edited. That makes edits non-deterministic.
- The exercise screenshot suggests user body weight is not passed into exercise estimates, or at least was not when the screenshot was made.

### Gaps
- No evidence, positive or negative, on Indian dishes (dal, roti, thali portions), regional units such as katori or piece, or input in Hindi or Hinglish.
- No published accuracy benchmark from Journable.

## 6. Learning from corrections, memory of frequent foods, personalisation

### Takeaway
Memory is limited to **favorites, recent entries, saved meals and auto-complete of past entries**. There is no evidence that the AI learns from user corrections, and independent reports of the same food getting different values suggest it does not reuse past values.

### Cited Findings
- **Favorites and recents:** "Favorite foods and recent entries"; "log your most frequent meals or exercise entries with a single tap". Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Auto-complete and saved meals:** a developer reply says auto-complete suggests past entries and saved meals can be reused. Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **User requests:** users asked for regular-meal saving (Play, 2025-07-23) and named meals (App Store, 2025-08-31). The developer pointed both to the existing favorites and recents features. Sources: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US), [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **No reuse of past values:** "inconsistent values for previously logged foods, even with the same entries". Source: [App Store reviews](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720?see-all=reviews)
- **Goals:** "Personalized Goal Setting: Set your own health goals" and a "Calorie & macro calculator", for weight loss, muscle gain or maintenance. Sources: [journable.com](https://www.journable.com), [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Official advice on repeat meals** (2026-07-29): "turn the corrected version into your repeatable baseline". Source: [Journable blog](https://www.journable.com/blog/how-to-count-calories-in-homemade-food)

### Inferences
- Re-logging a favorite is probably a stored copy, which makes it consistent. Typing the same food again probably triggers a fresh AI estimate, which explains the drift reports.

### Gaps
- Whether corrections feed back into future estimates. Nothing public was found.

## 7. Features around the log (insights, targets, macros, micros, integrations, widgets, social)

### Takeaway
Journable has a compact feature set:
- Daily calorie and macro rings
- Per-meal AI "Explanation" text
- A full nutrition-facts panel
- Weight tracker
- Weekly summary that can be shared
- Water tracker
- Reminders
- "Track Better Together", a shared feed and leaderboard

It has **no health-platform integrations** and no widgets have been found.

### Cited Findings
- **Daily view:** a Calories card (Food, Exercise, Remaining) and a Macros card (carbs, protein and fat against targets). A month calendar colours days green or red. Source: [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Micronutrients:** the app tracks "fiber, sugar, net carbs, and vitamins". The nutrition-facts panel shows added sugars, sugar alcohols and saturated, trans and polyunsaturated fat. Sources: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US), [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **AI insights:** "Get smart nutritional insights and guidance about your entries". The screenshot shows a per-meal "Explanation" paragraph. Source: [App Store](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Weekly Summary screen:** shows "249 calories under budget this week", "7 out of 7 days tracked", per-day food, exercise and remaining figures, macros over or under target, and a share button. The description says "easily share your progress with your Personal Trainer, Nutritionist, Dietitian, friends or family". Source: [App Store screenshots and description](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Weight Tracker:** current versus target weight, with week, month, year and all-time charts. Source: [App Store screenshots](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720)
- **Water tracker:** one reviewer says it counts only plain water, not other drinks. Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)
- **Social feature:** "Track Better Together — Stay accountable with a shared feed & leaderboard. Share your daily food journal with the people who support your goals: friends, family, or a nutrition professional." Source: [journable.com/track-better-together](https://www.journable.com/track-better-together)
- **Possible pro product:** robots.txt disallows `/pro-download/`, `/invite-pro/` and `/invite/`. This hints at a "pro" or invite flow, possibly for coaches. Source: [journable.com/robots.txt](https://www.journable.com/robots.txt)
- **No health integrations:** Apple Health and Health Connect are not integrated, per the user requests and developer replies cited in section 2. No Apple Watch app is listed. Sources: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720), [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)

### Inferences
- The "pro" paths plus "share with your … Dietitian" suggest Journable is testing a coach or professional channel. This is not confirmed.

### Gaps
- Widgets, Siri and smart-notification details. "Smart Reminders" are described only as "custom alerts".
- What "Journable Pro" is.

## 8. Pricing, paywall, users, ratings, funding, team, founder statements

### Takeaway
Journable uses a hard paywall after a free trial or entry allowance: **US$9.99 a month or $39.99 a year** on iOS, with ads in the free tier. Users complained that the entry limit was not disclosed upfront, and the developer has said it plans to make this clearer. Android has 1M+ downloads (third-party estimates: about 1.9M installs and about 119K MAU). No funding has been found.

### Cited Findings
- **iOS prices:** in-app purchases at $9.99 (monthly) and $39.99 (annual). Source: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720). Play lists in-app purchases at "$7.99 - $39.99 per item". Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Paywall terms:** "Journable includes a free trial. A subscription is required afterward to continue logging food and exercise, and it unlocks unlimited entries, full features, and an ad-free experience." Source: [iTunes Lookup API](https://itunes.apple.com/lookup?id=6477719720&country=us)
- **Paywall complaint** (Play, 2026-04-21, 45 found it helpful): "I spent an hour in the app only to stumble upon the fact that my free entries were almost gone." The developer replied: "We are also working to make this much clearer upfront." Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
- **Affiliate program:** 50% of a referred subscriber's revenue for up to 12 months. Referral codes give a "7-day free trial of Journable Premium", and payouts are monthly via PayPal. Source: [journable.com/affiliate-program](https://www.journable.com/affiliate-program)
- **Scale:**
  - Play: "1M+" downloads, 4.7 stars, 124K reviews. Source: [Google Play](https://play.google.com/store/apps/details?id=com.journable.app&hl=en_US)
  - AppGoblin estimates "1.9M installs", 4.76 from 123K ratings with 801 new ratings in a week, about 119K MAU and "$10K+ monthly revenue est.". These are third-party estimates. Source: [AppGoblin](https://appgoblin.info/apps/com.journable.app)
  - iOS: 4.75 from 518 ratings. Source: [iTunes Lookup API](https://itunes.apple.com/lookup?id=6477719720&country=us). mwm.ai estimates "50k+" App Store downloads. Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)
  - QAwerk (2025-11-27) recorded "100K+ downloads". Source: [QAwerk](https://bugcrawl.qawerk.com/weekly-bug-crawl/bugs-found-in-journable-ai-calorie-counter-for-ios/)
- **Team and founders:** Steve Hoyek and Georges (surname unknown) are co-founders. Source: [Product Hunt makers](https://www.producthunt.com/products/journable/makers). Steve hosts The Weigh In podcast on the Journable blog. Source: [Journable blog](https://www.journable.com/blog/georges-fayad-training-to-feel-good)
- **Launch positioning:** "focused on simplicity, efficiency, and functionality". Source: [Product Hunt](https://www.producthunt.com/products/journable)

### Inferences
- Revenue of about $10K+ a month on about 1–2M installs (if the third-party estimate is right) suggests most users are low-monetising Android users in emerging markets, with ads helping to cover AI costs. The Adjust and Facebook SDKs suggest paid acquisition.

### Gaps
- Funding: no Crunchbase, press or investor information was found.
- Team size.
- Founder interviews about how the product works: none found beyond the Product Hunt launch comment. The podcast episodes are about wellness, not product.
- No Hacker News, Indie Hackers or Reddit threads by the team were found.

## 9. Release-notes history (speed and accuracy changes)

### Takeaway
Release notes carry no information: every visible iOS release says only "Improvements to the AI chat for simpler calorie tracking." The cadence is high, roughly every 1–3 weeks in 2026. The public changelog says nothing about speed or accuracy changes.

### Cited Findings
- **Visible iOS history:** 25 versions from 2.1.182 (Jan 8, 2026) to 2.1.264 (Oct 20, 2026), all with the identical note "Improvements to the AI chat for simpler calorie tracking." The dates are 2.1.182 Jan 8, 2.1.185 Jan 15, 2.1.188 Jan 19, 2.1.193 Jan 27, 2.1.196 Feb 5, 2.1.199 Feb 15, 2.1.202 Feb 27, 2.1.205 Mar 10, 2.1.209 Mar 22, 2.1.211 Mar 31, 2.1.213 Apr 6, 2.1.215 Apr 17, 2.1.222 May 9, 2.1.224 May 25, 2.1.226 May 27, 2.1.230 Jun 19, 2.1.234 Jun 20, 2.1.238 Jul 2, 2.1.243 Jul 22, 2.1.245 Jul 29, 2.1.248 Aug 4, 2.1.250 Sep 3, 2.1.260 Oct 7, 2.1.262 Oct 12 and 2.1.264 Oct 20. Source: [App Store US](https://apps.apple.com/us/app/journable-ai-calorie-counter/id6477719720). The year 2026 is confirmed by the `currentVersionReleaseDate` of 2026-10-20. Source: [iTunes Lookup API](https://itunes.apple.com/lookup?id=6477719720&country=us)
- **Earlier versions, from review timestamps:** 2.0.66 (Oct 1, 2024), 2.0.73 (Nov 5, 2024), 2.1.019 (Feb 6, 2025), 2.1.063 (Apr 25, 2025), 2.1.107 (Jul 24, 2025), 2.1.157 (Nov 18, 2025). Source: [mwm.ai](https://mwm.ai/apps/journable-ai-calorie-counter/6477719720)

### Inferences
- A major version 2.0 existed by October 2024, about 7 months after launch. The jump from 2.0.x to 2.1.x happened around late 2024 to early 2025. What changed is unknown.

### Gaps
- Notes for 1.x, 2.0 and 2.1.0. A full history from before 2026 was not retrievable.
- Any changelog naming speed, model or accuracy improvements.
