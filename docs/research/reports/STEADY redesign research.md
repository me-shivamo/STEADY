# Log Fast, Forgive Often, Show Your Sources

The redesign should be built around one behaviour: getting food logged in seconds, two or three times a day, especially in the first seven days. Every large dataset in the research ties success to how often people log, not to whether they hit their calorie number. That includes 1.4 million MyFitnessPal users, about 12 million Lose It users and a 24-week logging trial. The most common reason people quit is that logging feels "too tedious". For STEADY's lean gainer persona, this leads to five moves:

1. **Make logging fast.** Repeat meals and a single box where you speak or type should be the quickest path. Results the AI is sure about should log straight away with an Undo button, not a confirm screen.
2. **Build three goal-aware rings.** A calorie zone that a gainer closes by reaching it and that never turns red when they go over. A protein floor. A meals-logged ring. Streaks should be forgiving.
3. **Chase consistency, not more raw accuracy.** STEADY's held-out score of about 65% of items within tolerance already matches the best published text-based result (66.8%). Photo apps under-count by 250–345 kcal per meal. The next gains are: the same meal always gives the same number, better portion sizes, Hinglish speech recognition, and showing where each number came from.
4. **Replace the real phone call with a scheduled in-app voice check-in.** Daily calls would cost roughly 90 times more than all of STEADY's other AI combined. India's telecom rules also put the calling number at risk of blacklisting.
5. **Rebuild the logging pipeline so the speed promise is real.** Use one model call plus database lookups that run at the same time, instead of a chain of up to eight steps.

Two things stand between STEADY and the "wow". The first is Hinglish speech recognition: OpenAI's flagship transcriber ranked last on an April 2026 benchmark of Indian Hindi. The second is leaving Expo Go, because every home-screen widget needs it.

The evidence is strongest on retention, streaks and goal psychology. It is weakest on gainers specifically and on AI phone calls. Reddit could not be accessed, so user voice comes from App Store reviews, Hacker News, and Reddit threads quoted in the press.

## How much weight each finding can bear

Every recommendation below is tagged with the strength of the evidence behind it. The labels mean the following:

| Label | What it means in this report |
|---|---|
| Strong | Peer-reviewed trials, large real-world datasets, or official documents (Apple, Google, Expo, regulators, vendor pricing pages) |
| Moderate | Smaller or correlational peer-reviewed studies, or company data with published numbers (Duolingo, MacroFactor) |
| Weak | Pilots, single small studies, vendor or competitor claims, and secondary summaries of papers that couldn't be read directly |
| Opinion | User reviews, Hacker News and press-quoted Reddit comments, coach and blog advice, and this report's own inferences |

There are five limitations to keep in mind.

**Reddit was blocked.** Reddit refuses the research crawler (HTTP 403), and the team did not try to get around that. Every Reddit quote here reached us through an article that quoted it (Fortune, TechRadar, 9to5Google, PiunikaWeb), and upvote counts couldn't be checked. Subreddits like r/gainit, r/loseit and r/fitness_india were completely out of reach.

**App Store reviews skew negative.** The feed favours recent and "most helpful" reviews. In the 200 Cal AI reviews sampled, 92 were two stars or below, yet the app is rated 4.8 from about 373,000 ratings. For HealthifyMe, 29 of 50 sampled reviews were two stars or below, against a 4.55 rating ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616); [HealthifyMe App Store, India](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)). Treat the complaint counts as "share of complaints", not "share of users".

**The user voice doesn't match STEADY's users.** Hacker News leans technical, sceptical and US/EU. Indian App Store reviewers own iPhones, so Android-majority India is under-represented. No Hinglish user feedback turned up anywhere.

**The biggest blind spots are STEADY's own differences.** There is no peer-reviewed study of tracking apps among people trying to gain weight. There is no food-word speech benchmark. There are no published food-accuracy results for any 2026 AI model.

**Several model names will be unfamiliar.** Names such as GPT-6 "luna" and Claude Haiku 5.5 are quoted exactly as the October 2026 pricing pages list them.

## Logging often, not hitting the number, predicts who succeeds

This section answers group A: the core loop and retention, gainers versus losers, how precise logging needs to be, and how to show success at 30 days.

| Question | Recommended answer | Evidence |
|---|---|---|
| What should the core loop reward? | "You logged today", ideally two or three times. Never "you hit your calorie target". | Strong |
| When do people quit? | Within the first seven days. Treat week one as the product, and send a day-7 recap. | Strong (direction), Moderate (exact timing) |
| How do gainers differ from losers? | For gainers, under-eating is the failure and going over is usually success. Protein is the second number. Stop celebrating once the surplus gets large. | Weak (no gainer studies) plus Opinion |
| How precise should logging be? | "Rough but frequent and consistent". Grams are optional. Let an adaptive target absorb steady bias. | Moderate |
| How do we show 30-day success? | A smoothed weight trend against the goal rate, plus days logged, protein-floor days and optional strength gains. Raw daily weights only on tap. | Moderate |

**People quit early and quickly.**
- Of about 190,000 people who tried a photo food-logging app, **only 2.58% became active users** ([JMIR 2014](https://jmir.org/2014/4/e109)).
- In a six-month trial, doctors helped patients install MyFitnessPal. Use fell from **97% of patients in month one to 35% by month six**, and there was no weight difference against normal care. The lead author's summary: "Many patients felt it was too tedious" ([MDedge](https://www.mdedge.com/content/most-weight-loss-apps-are-losers)).
- The largest study, of **1.4 million MyFitnessPal users**, predicted who would reach their goal from first-week behaviour alone. Its accuracy score was 79% on a standard measure called ROC AUC ([Gordon et al. 2019](https://www.arxiv.org/pdf/1904.02813)).
- Duolingo's retention lead calls "the first seven days" the most fragile period ([Lenny's Newsletter](https://lennysnewsletter.com/p/behind-the-product-duolingo-streaks)).

For STEADY, week one is not a warm-up before the product. Week one is the product.

**What predicts success is how often people log, not how long they spend.** In a 24-week programme, people who lost at least 5% of their body weight logged **2.4 times a day, versus 1.6** for those who didn't. Minutes spent logging made no difference ([Harvey et al. 2019](https://pubmed.ncbi.nlm.nih.gov/30801989/)). In Lose It's data, the most engaged "power users" reached 5% weight loss **72.7% of the time, versus 4.87% for occasional users** ([Serrano et al. 2016](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4925935/)). No study compares "hit the target" and "logged consistently" in the same model, so this is several studies pointing the same way rather than proof. Still, nothing points the other way. The daily reward should be "you logged", and the design should cut the time each log takes rather than ask for more care per log.

**The first minute matters as much as the first week.** The most reliable way to earn 1-star reviews in this category is a long onboarding quiz that ends in a paywall. Paywall or billing words appeared in about 52 of the 92 low-rated Cal AI reviews sampled. One reviewer wrote, "It asks 50 questions and then it tells you to pay". A professional athlete wrote, "I know exactly what my macros need to be. I just want a place to track them" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). STEADY has no paywall in v1, which is an advantage. It should still let a new user log a first meal within the first minute and ask for profile details afterwards.

Some users "graduate" and leave for good reasons: "by using the app daily for about a year, I learned how to eat... But there are times like during the holidays" ([Lose It App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629)). A quick "welcome back, here's your last week" path for returning users is worth designing.

**For gainers, the usual rules flip.** No peer-reviewed study of tracking-app use among people trying to gain weight was found; nearly all the research is on losing. What exists is coach advice and app reviews, and they agree: **for a gainer, under-eating is the failure and going over is usually success**. A Cal AI reviewer complained: "If you're not looking to lose weight, this app sucks... It told me to eat 2800 calories a day and nearly 200 grams of protein and would not let me change it" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).

A common Hacker News argument is that effort is good: "Making it easier I would expect to make it also easier to eat more" ([HN](https://news.ycombinator.com/item?id=44222704)). For a gainer that logic runs backwards, because effort that discourages eating is exactly wrong.

Low appetite is the gainer's real bottleneck. One HN user put it this way: "Eating is just a chore to them so they rarely do it... If I'm busy working on something, I will go 12 hours without eating" ([HN](https://news.ycombinator.com/item?id=44738109)). That calls for timely, specific nudges, such as "about 700 kcal short with four hours left; a shake would close it", rather than a passive dashboard. Coaches recommend liquid calories and more frequent meals for this ([Fitbod](https://fitbod.me/blog/how-to-bulk-if-you-have-a-low-appetite/)).

Guardrails still matter for gainers:
- **48.9% of Canadian men aged 16–30** reported bulk-and-cut cycles. These cycles were linked to more severe eating-disorder and muscle-dysmorphia symptoms ([Springer 2022](https://link.springer.com/article/10.1007/s40519-022-01470-y)). Muscle dysmorphia means being obsessed with not looking muscular enough.
- In a sample of 122 men from fitness communities, **about 40% of MyFitnessPal users felt it contributed to disordered eating** ([Linardon & Messer 2019](https://pubmed.ncbi.nlm.nih.gov/30772765/)).

So STEADY should reward reaching a sensible surplus, stop celebrating beyond a cap, and never compare bodies.

**Precision matters less than consistency.** Small pilot trials suggest simplified tracking can match full calorie counting on adherence and weight loss ([PMC9795401](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9795401/)). MacroFactor, the app technical users praise most, asks people to log "as thoroughly and accurately as is reasonable for you". It notes that under-counting is the most common error ([MacroFactor](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)).

The gainer twist is that surpluses are small: "A 250 calorie surplus per day will add half a pound per week. That being off by two tablespoons of oil" ([HN](https://news.ycombinator.com/item?id=44239682)). Gainers need two things:
- **Consistency:** the same meal always logs the same number.
- **An adaptive target:** one that quietly absorbs steady bias. MacroFactor's expenditure estimate caught one user whose real calorie burn was **700 kcal/day above the formula** in about 20 days ([Stronger By Science](https://www.strongerbyscience.com/?p=53698)).

One reviewer summed up the gainer trade-off: the app "does a great job for a lazy person who desires to keep track of their diet/surplus of calories. I would never advertise this for someone going on a diet as the accuracy of the log is like 80%" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).

**Show success at 30 days as a smoothed trend, not as daily weigh-ins.**
- **Weight trends help.** In a six-month trial, daily weighing with a smart scale, a weight graph and weekly feedback emails produced **6.55% weight loss versus 0.35%**, with no psychological harm. The graph's own effect can't be separated from the emails ([UNC Gillings](https://sph.unc.edu/?p=62844)).
- **Smoothing matters more for gainers.** MacroFactor uses a smoothed "trend weight" to filter out water and digestion noise ([MacroFactor](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)). A gainer's real weekly change is about 0.5–1 lb, or 0.2–0.45 kg ([Mind Pump](https://mindpumppodcast.com/blog-post/how-to-gain-weight-if-you-are-a-hardgainer/)). That is smaller than normal day-to-day scale swings.
- **Slow progress is demotivating.** A 2025 analysis of 13,799 negative social posts about fitness apps found that "disappointment at slow progress toward algorithm-generated targets" made people give up ([UCL](https://www.ucl.ac.uk/news/2025/oct/emotional-strain-fitness-and-calorie-counting-apps-revealed)).
- **Ranges feel better.** Range goals produce more sense of accomplishment than single numbers, with equal results ([WashU](https://source.washu.edu/2013/06/why-is-it-easier-to-lose-24-pounds-rather-than-3-pounds/)).

The 30-day screen should lead with something like "Trend +0.9 kg, on pace for your +0.25 kg/week goal". It should then show days logged and rings closed, protein-floor days, and optional strength gains. Raw daily weights should appear only on tap. Early progress predicts long-term success ([Gordon et al.](https://www.arxiv.org/pdf/1904.02813)), so the day-7 recap matters more than the day-30 one.

**How sure we are:**
- **Strong:** early drop-off, logging frequency predicting success, and tedium as the reason people quit.
- **Moderate:** trend graphs helping, and simplified tracking working as well as full tracking.
- **Weak or opinion:** everything specific to gainers, from the "under is failure" framing to the nudge content. It rests on coach advice and reviews.

## Three goal-aware rings that close on behaviour and never turn red

This section answers group B: the Apple Watch-style rings.

| Question | Recommended answer | Evidence |
|---|---|---|
| Which three rings? | (1) Calories, as a goal-aware zone. (2) Protein, as a minimum. (3) Meals logged, as a behaviour ring. | Moderate plus inference |
| Fixed target or zone? | A zone for calories (e.g., 2,800–3,200 kcal for a gainer). Protein as "at least X g". | Moderate |
| What counts as "closed"? | Calories: entering the zone. Protein: reaching the minimum. Logging: three entries, where meals, snacks and shakes all count, and the first entry fills a third of the ring. Above the zone shows as "surplus banked", never red, and is celebrated only up to a cap. | Inference built on Moderate evidence |
| Rewards? | Celebrate unbroken streaks and milestones (day 3, day 7). Use informative praise ("protein floor 5 of 7 days, your best week"). No points or paid items. | Moderate |
| Streak resets or freezes? | The streak counts logging only. About two automatic grace days a week, a pause for travel or illness, offline-safe counting, and never a paid restore. | Moderate |
| Adaptive targets? | Yes, weekly, based on logged intake and trend weight. Explain each change in plain words, cap the step size, and get the user's approval. Never raise the target just because the user did well. | Weak to Moderate |
| Daily or weekly framing? | Daily rings for the habit, plus a weekly verdict on calories. Optional higher targets on training days. | Weak to Moderate |
| Shame and eating-disorder risk? | No red, no failure language, few notifications, a hide-numbers option, a cap on surplus rewards, and a gentle link to help. | Moderate |

**The psychology behind rings is solid, but untested for nutrition.** Two well-replicated effects support rings:
- **Goal-gradient:** effort speeds up as people get close to a goal ([Kivetz et al. 2006](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)).
- **Endowed progress:** a head start raises completion. A 10-stamp loyalty card with 2 stamps already filled beat a plain 8-stamp card ([Nunes & Drèze](https://msbfile03.usc.edu/digitalmeasures/jnunes/intellcont/Endowed%20Progress%20Effect-1.pdf)).

The popular idea that unfinished tasks nag at you (the "Zeigarnik effect") is weaker. A 2025 meta-analysis found no general memory effect, although people do reliably tend to *resume* interrupted tasks ([Ghibellini & Meier 2025](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html)).

**No peer-reviewed study tests Apple's rings causally.** Measuring things also has a cost: across six experiments, tracking made people do more but enjoy it less ([Etkin 2016](https://marketing.wharton.upenn.edu/wp-content/uploads/2016/10/Etkin-Jordan-11-12-15-Hidden-Cost.pdf)). Apple's designer Jay Blahnik described the rings as **"the least you should do every day" rather than the most**. He warned that a goal which feels like a daily challenge leads to burnout ([MobiHealthNews](https://www.mobihealthnews.com/news/jay-blahnik-what-separates-apple-watch-other-fitness-trackers)).

This leads to three rules:
- Rings should mark a sensible minimum, not a stretch goal.
- An open ring should prompt the user to come back at a natural moment ("one meal left to close it"), not create background guilt.
- The logging ring should start partly filled after the first entry.

**Pick three rings that measure different kinds of thing.** Apple deliberately mixed three kinds of ring to show "the whole picture at a glance" ([9to5Mac](https://9to5mac.com/2015/03/09/jay-blahnik-memo/)):
- an outcome ring (Move)
- an intensity ring (Exercise)
- a behaviour ring (Stand)

STEADY's equivalent:
- **Calories** is the outcome ring.
- **Protein** is the quality ring. It is the number gainers keep tracking even after they stop counting calories: "After I have just used to track my protein intake everyday. Easy to use" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).
- **Meals logged** is the behaviour ring. It is the one ring a user can close even on an off-plan day, and the retention data says it matters most.

Two other candidates should stay off the rings. Water adds logging effort with little evidence behind it. Carbs and fat belong in a detail view. The research found no mainstream app running closeable nutrition rings whose colours change with the user's goal direction, so the concept looks open.

**A calorie zone beats a single number.**
- **Ranges keep people engaged.** Range goals ("lose 2–4 lb") led to **more re-engagement than single-number goals ("lose 3 lb"), with the same weight loss**. The low end feels reachable and the high end feels challenging ([WashU](https://source.washu.edu/2013/06/why-is-it-easier-to-lose-24-pounds-rather-than-3-pounds/)).
- **Built-in slack is preferred and works better.** In a diet-points choice, a goal with spare "emergency" days was **chosen 46% of the time versus 25–29%** for the rigid options. In a month-long step study, such goals were **hit up to 40% more often** ([UCLA Anderson Review](https://anderson-review.ucla.edu/emergency-reserves/)).

STEADY should show calories as a zone. Entering the zone closes the ring. Going above the zone shows "surplus banked" in a neutral or warm colour, and above an upper cap the app simply stops celebrating. For users who want to lose weight, the same zone logic applies with neutral "over zone" wording instead of red.

**Reward with recognition, not prizes.** Duolingo's most useful experiment changed what keeps a streak alive. The old rule was "hit your daily XP goal"; the new rule was "do one lesson". The results ([Duolingo](https://blog.duolingo.com/improving-the-streak)):
- **3.3% higher 14-day retention** (relative) and **1% more daily active users**
- a year later, **over 40% more learners on streaks of 7+ days**
- the cost: fewer people hit their daily goals

Two more Duolingo findings ([Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)):
- Learners who reach a 7-day streak are 2.4 times more likely to come back the next day ([Duolingo](https://blog.duolingo.com/improving-the-streak)).
- A milestone animation lifted new-user day-7 retention by 1.7%.

Prizes can backfire. A meta-analysis of 128 studies found that tangible rewards for doing a task *reduce* people's own motivation (effect size −0.40), while informative positive feedback *raises* it (+0.33) ([Deci, Koestner & Ryan 1999](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)). Gamification effects also shrink to "very small to small" months after a programme ends ([Mazeas et al. 2022](https://doaj.org/article/9754f1fd9dd84266b5e5a30336858ad8)). STEADY should:
- celebrate unbroken streaks and milestones
- prefer praise that tells the user something about their own progress
- skip points and paid items
- expect logging speed, not badges, to carry retention once novelty fades

No evidence was found either way on share cards.

**Make streaks forgiving.** Losing a long streak is the most-cited demotivating event in user reviews:
- "I had technical issues with it yesterday and lost my 395-day streak. The app immediately asked for $10 to restore it. And it just kills my desire to use it from here on" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616))
- "because I didn't have good cell reception it stated 0% analyzed and lost my streak" (same source)
- "logging the day after broke the streak and there is no way to adjust that", from a Cronometer user after a hospital stay. Cronometer counts only same-day logging ([Cronometer forum](https://forums.cronometer.com/discussion/5792/streaks)).

The research agrees on four points:
- **Don't dwell on a broken streak.** Highlighting a broken streak lowers re-engagement more than highlighting an unbroken one. Breaks hurt most when people blame themselves, and least when they can repair them ([Silverman & Barasch 2023](https://udspace.udel.edu/items/42ce576b-8e1f-429a-8541-e29e48dbcfbb)).
- **Slack helps people bounce back.** The chance of hitting the goal the day after a miss was **55% with two allowed skips a week, versus 37% under a rigid every-day rule** ([UCLA Anderson Review](https://anderson-review.ucla.edu/emergency-reserves/)).
- **Freezes raise activity.** Allowing two streak freezes instead of one raised Duolingo's daily actives by 0.38% ([Duolingo](https://blog.duolingo.com/how-duolingo-streak-builds-habit)).
- **Apple has moved this way too.** watchOS 11 added "Pause Rings" for up to 90 days without losing award streaks, plus different ring goals for each day of the week ([9to5Mac](https://9to5mac.com/2024/07/16/close-your-ringsbut-in-watchos-11-its-okay-if-you-dont/)).

There is also the "what-the-hell effect". Dieters who *believed* they had blown their diet then ate almost twice as many cookies. That finding reached us only through secondary summaries ([Wikipedia](https://en.wikipedia.org/wiki/Counterregulatory_eating)), but it points the same way.

Recommended streak rules:
- The streak counts "logged something". A day that misses the calorie target never breaks it.
- Two grace days a week apply automatically.
- A pause exists for travel and illness.
- Offline logs count by the time eaten, not the time they sync.
- A late entry for yesterday still counts if made before about noon the next day.
- Restores are never sold.

**Adapt targets weekly and cautiously, and judge calories over the week.** MacroFactor works out a user's real calorie burn from logged intake and smoothed weight, adjusts targets weekly, settles in about 14–30 days, and never forces "make-up" days after over-eating ([MacroFactor](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)). No independent study has validated its method. Adaptive changes can also feel arbitrary. One reviewer wrote, "program cut my calories... I declined as it would have me eating barely 1300 calories" ([MacroFactor App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471)). Apple Watch users complain that the Move goal suggestion keeps rising every time they succeed ([iMore forum](https://forums.imore.com/apple-watch/339518-new-daily-move-suggestion-impossible-reach.html)).

STEADY's rules for adaptive targets:
- Change targets weekly, not daily.
- Explain every change in plain words: "your trend rose 0.1 kg/week against your 0.25 target, so we're adding 150 kcal".
- Cap the step size.
- Get the user's approval.
- Never raise the target just because the user succeeded.
- Promise no precision in the first 2–4 weeks.

On daily versus weekly framing, no trial shows that weekly calorie budgets reduce dropout. A review of planned diet breaks (796 participants) found no benefit on dropout ([PMC10255792](https://pmc.ncbi.nlm.nih.gov/articles/PMC10255792/)). A small single-person study found 80% preferred daily goals ([University of Twente](https://essay.utwente.nl/essays/101038)). The best fit is daily rings for the habit, plus a weekly verdict such as "5 of 7 days in your surplus zone" so one off day is never a failure. Optional per-day targets for training days or weekends would also fit Indian social-eating patterns.

**The shame and eating-disorder risk is real, but concentrated in vulnerable users.**
- **The complaints are about shame, nagging and slow progress.** Of 58,881 posts about five popular fitness apps, 13,799 were negative. They clustered around shame about logging unhealthy food, nagging notifications and slow progress, and users described giving up ([UCL](https://www.ucl.ac.uk/news/2025/oct/emotional-strain-fitness-and-calorie-counting-apps-revealed)). One example: "I just got a notification from my fitness pal reminding me to log my dinner for today but I don't want to bc I'm ashamed I just ate dominos" ([StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)).
- **People with eating disorders often blame the app.** Among 105 people with diagnosed eating disorders, **73% of MyFitnessPal users felt it contributed to their disorder** ([Levinson et al. 2017](https://pubmed.ncbi.nlm.nih.gov/28843591/)).
- **The general population showed no harm.** The one randomised trial (200 women, one month) found **no harm** to eating-disorder risk, mood or body satisfaction ([ClinicalTrials.gov NCT04052529](https://clinicaltrials.gov/study/NCT04052529)). Daily-weighing trials found no rise in binge eating ([UNC Gillings](https://sph.unc.edu/?p=62844)).

The claim that the colour red itself makes people avoid tasks failed independent replication ([Steele 2015](https://www.appstate.edu/~steelekm/documents/Psychonomics2015Poster_Steele.pdf)). The stronger argument against red is its meaning: red says "bad", and for a gainer, being over is good. Users notice when colours are wrong: "sometimes even if i am well under my calorie limit the circle shows as red" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). Apple Watch ring culture shows the compulsion risk: "I feel ashamed but I've been taking a walk at 11:30 p.m. just to complete my ring before midnight" (Reddit, via [Fortune](https://www.fortune.com/well/2025/01/24/apple-watch-bullied-burn-calories-close-rings-obsession-fitness-trackers-notifications)).

MacroFactor never turns numbers red, calling them "just neutral information with no implied judgments attached" ([MacroFactor](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)). STEADY should do the same. It should also:
- keep notifications sparse
- offer a hide-numbers mode
- cap surplus rewards
- show a gentle link to support if logs look extreme

No validated in-app screening method for eating disorders exists, so that last item is a judgement call.

**How sure we are:**
- **Strong:** goal-gradient, endowed progress, range goals, slack days and Duolingo's streak data.
- **Moderate:** the eating-disorder evidence. It is real but mostly cross-sectional, meaning it measures people at one point in time.
- **Opinion or inference:** the choice of the three ring metrics and the exact closing rules. The Apple ring mechanic itself has never been tested causally.

## Voice should share one box with typing, and check your history first

This section answers group C: voice-first logging.

| Question | Recommended answer | Evidence |
|---|---|---|
| Auto-log or confirm? | Hybrid. Results the AI is confident about log instantly with an Undo/Edit bar for about 8–10 seconds. A confirm card appears only when the AI is unsure, when a lot of calories are involved, or when one sentence covers several meals or days. | Moderate (UX research) plus inference (no food-app A/B test exists) |
| Ambiguous food ("a bowl of curry")? | Log the most likely portion and show it ("1 katori, ~250 g"), with 3–4 one-tap portion chips. Ask a question only when the plausible answers differ a lot and the user's history can't decide. | Moderate |
| Several meals in one sentence? | Supported. Every item gets an exact eaten-at time, and items are grouped by meal on the result card. | Moderate (already shipping in MyFitnessPal and HealthifyMe) |
| Repeat meals? | A time-aware "Your usual?" card after about 7 days of data. Resolve "same as yesterday" from history before calling any AI. One tap to log, long-press to tweak. | Strong (repetition data) plus Moderate |
| Photo vs voice vs text? | One entry box where speaking and typing feed the same parser. Photo for restaurant plates. Barcode or label photo for packaged food. | Weak to Moderate (small studies) |
| Hinglish and other languages? | Don't assume OpenAI's transcriber. Test Sarvam Saaras v3 (code-mix mode), Deepgram Nova-3 Multilingual, gpt-4o-mini-transcribe and an audio-native Gemini on STEADY's own Hinglish food clips. | Moderate (benchmarks), with a key gap: no food-word benchmark exists |
| Logging past meals? | Turn "yesterday's dinner", "kal raat" and "subah" into exact times. Confirm whenever a log lands on another day. A timeline lets users press-and-hold any hour to backfill. | Weak to Moderate |

**Voice logging is now standard.** MyFitnessPal, Lose It, Lifesum, MacroFactor and HealthifyMe all ship it. Almost all follow the same flow: speak, the AI parses, a review screen appears, the user taps "Log".
- MyFitnessPal turns speech into text on the phone, sends it to Claude 3.5 Sonnet, and can handle "a whole day of eating across multiple meals" in one go ([Tribe.ai](https://www.tribe.ai/case-studies/myfitnesspal)).
- HealthifyMe's Ria handles **14 Indian languages and Hinglish**, logs several meals at once, and scans the photo gallery to suggest meals the user forgot ([TechCrunch](https://techcrunch.com/2025/12/02/healthify-upgrades-its-ai-assistant-ria-with-real-time-conversation-capabilities)).
- Lose It claims AI loggers log 3.5 times faster, but doesn't publish its method ([Lose It press release](https://www.barchart.com/story/news/31984516/lose-it-finds-ai-powered-logging-boosts-weight-loss-success-and-greater-nutritional-mindfulness)).

In India, Hinglish voice is a necessity, not a differentiator. STEADY's edge has to come from making the confirm step nearly free, and from getting a meal right the second time.

**Log first, offer undo, and confirm only the risky cases.** Nielsen Norman Group, a respected UX research firm, says confirmation dialogs are worth the interruption "only if they prevent errors". Routine confirmations get clicked through out of habit, and undo is better wherever possible. Their example is a bank that asks for confirmation only on unusually large payments ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). Food logging is frequent, low-stakes and easy to reverse, which suits auto-log with undo. But the AI is wrong often enough that fixing it must be easy: in a three-week field study, **users edited 20.7% of AI logs and deleted 5.8%** ([SnappyMeal](https://arxiv.org/html/2511.03907v1)).

So:
- Confident results commit instantly, with the screen reacting within 400 ms (the "Doherty threshold", the point where users start to feel a wait) ([Laws of UX](https://lawsofux.com/doherty-threshold/)).
- An Undo/Edit bar stays up for 8–10 seconds. That duration comes from a community pattern library, not an official spec ([Pattern Playground](https://pattern-playground.onrender.com/patterns/transient-feedback)).
- Low-confidence or high-calorie items, such as an estimated 900-kcal restaurant dish, get a compact confirm card instead.

AI models under-estimate large portions the most ([PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)). That is the worst error for someone trying to eat more, so the assumed portion should always be visible on the logged entry. No food app has published an A/B test of auto-log versus confirm, so STEADY should track its own correction rate.

**Guess sensibly, show the guess, and ask rarely.** The one food-logging study that asked clarifying questions on every log found three problems ([SnappyMeal](https://arxiv.org/html/2511.03907v1)):
- Users wanted to skip questions for simple foods like a banana.
- They disliked questions that ignored how they had logged, such as photo-style wording when they had typed.
- The questions gave no accuracy gain: average calorie error **rose from 148.9 to 161.8 kcal** with follow-up questions alone.

Research on search engines shows that specific questions with 3–5 answer options work better than vague ones. Questions with 2 options were rated "good" 64.6% of the time; questions with 5 options, 84.8% ([Rahmani et al. 2024](https://arxiv.org/html/2402.01934v1)). Low-quality questions actively hurt satisfaction. "Excessive questions" is a recurring Cal AI complaint ([Kimola](https://kimola.com/reports/unlock-insights-cal-ai-review-analysis-report-google-play-157291)). Users already ask the right question themselves: "How does it handle portion sizes? Like if I say 'had a burger' vs 'had a big burger'?" ([HN](https://news.ycombinator.com/item?id=46630604)).

The pattern for STEADY:
- Log the most likely portion and show it.
- Use the user's history first. If "dal, 1 katori" has been logged 20 times, that is the default.
- Ask a blocking question only when the calorie range is wide, and show why the answer matters ("Paneer or chicken? Changes protein by ~15 g").

For Indian home food, one question may matter more than all the others: oil or ghee ("light, normal or heavy tadka?"). As one HN user put it, "A tablespoon of oil is 100 calories, but probably not visible in an image. Sugar in cooked meals is impossible to see" ([HN](https://news.ycombinator.com/item?id=44224023)).

**Repeat meals may save more time than voice.**
- **People eat a small core of foods.** Across 21,006 people and 2.66 million logs, **half of users had just 9 unique foods making up 50% of everything they logged**. Habitual foods were eaten earlier in the day ([Tran et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340925/)).
- **Breakfast repeats most, but whole meals rarely repeat exactly.** In MyFitnessPal diaries, **breakfast items recurred 65% of the time versus 24% for dinner**. Exact whole meals recurred far less (breakfast 11%, dinner 1%) ([Pai & Sabharwal 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9002488/)). Suggestions should therefore be individual foods or editable bundles, not rigid "saved meals".
- **Repetition is linked to better results.** People whose logs were mostly repeats lost 5.9% of body weight versus 4.3%. This was an observational study, not a trial ([APA](https://apa.org/news/press/releases/2026/03/lose-weight-same-meals)).

Apps that do this well are praised:
- MacroFactor suggests your usual foods at the times you usually eat them.
- Carbon only suggests after at least 7 active days and a strong pattern ([Carbon help](https://help.joincarbon.com/en/articles/16242219-smart-suggestions-log-foods-you-eat-often-without-searching)).
- Removing copy/paste was a headline complaint in MyFitnessPal's 2026 redesign ([MyNetDiary](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)).

Users ask for this outright: "why is there not a rapid way to add my most recently logged foods???? The whole point of this app is to reduce the amount of effort to log what you eat" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). Another: "I would love to be able to say to MyFitnessPal that 'I ate this and that food, same as usual'" ([HN](https://news.ycombinator.com/item?id=44224152)). Voice should resolve "same as yesterday's breakfast" or "mera usual nashta" from personal history before touching a database or an AI model.

**Use one box for speaking and typing, because people won't always talk out loud.** No major app publishes how often each input type is used. Small studies point the same way:
- People *expect* photo logging to be better. But in a week-long field study, photos were harder than typing, captured less of what people ate, and people were less likely to keep going ([Silverman et al. 2022](https://udspace.udel.edu/items/d9c90351-88e3-4540-8267-63a247eeea23/full)).
- Voice produced 1.7 times more logging events than text in an 18-person trial ([base2Diet, JMIR](https://formative.jmir.org/2023/1/e46659)).
- In another study, no participant used audio at all, which the authors blame on eating in public ([SnappyMeal](https://arxiv.org/html/2511.03907v1)).
- A speech-journaling study found worries about talking in front of others ([FoodScrap](https://www.microsoft.com/en-us/research/?p=744916)).

User voice splits the same way. One HN user: "I actually think it's quicker to just speak to the LLM about your diet than even taking a picture" ([HN](https://news.ycombinator.com/item?id=44220790)). Another: "I don't know anyone who openly talks to a machine" ([HN](https://news.ycombinator.com/item?id=44238931)). Yet missing voice is now itself a complaint: "one is no voice recording" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).

A lean professional on the metro or in an open office won't always speak. "Voice-first" should mean one box where speaking and typing feed the same parser, with photo for restaurant plates and barcode or label photo for packaged food. Onboarding should lead with the habit loop (usual meals plus voice), not photo magic, whose appeal fades.

**Hinglish speech recognition is the biggest technical risk.** The Voice of India benchmark (April 2026) used unscripted telephone conversations. Its scoring forgives valid spelling and script variants. Word error rate (WER) means the share of words transcribed wrongly, so lower is better. The Hindi results ([Voice of India](https://voiceofindiablogs.ai.joshtalks.com/)):

| Model | Hindi word error rate |
|---|---|
| Sarvam Audio | **5.0%** |
| Gemini 3 Pro | 6.0% |
| Sarvam Saarika 2.5 | 6.2% |
| Deepgram Nova-3 | 13.0% |
| GPT-4o Mini Transcribe | 19.6% |
| GPT-4o Transcribe | **34.0%** |

There are three caveats. The audio is phone-line quality, which is harder than a phone's own microphone. The organiser sells speech data. There is no separate Hinglish score.

Other results:
- On mixed Hindi–English test sets, Whisper-large-v3 scored about 30–34% error, against about 8–16% for specialist models ([Trelis](https://friendli.ai/models/Trelis/whisper-hinglish-preview)).
- Google's Chirp 3 got only 2.6 points worse on mixed-language words ([Vaani benchmark](https://arxiv.org/pdf/2606.21408)).
- Sarvam Saaras v3 has an explicit "codemix" output: Hindi in Devanagari, English words in Latin script ([Sarvam docs](https://docs.sarvam.ai/api/models/saaras)).
- Deepgram Nova-3 Multilingual officially supports Hindi–English switching ([Deepgram changelog](https://developers.deepgram.com/changelog/2025/3/31)).

Nobody has benchmarked recognition of food words like "rajma", "poha", "paneer bhurji" or "ek katori". STEADY should:
- build a test set of 100–200 real Hinglish food clips
- run them through the existing eval harness, scoring food names and quantities rather than general word accuracy
- always show the transcript or the parsed items, so a misheard word is one tap to fix

Cost won't decide this. Every option costs well under a tenth of a US cent per 10-second clip ([OpenAI pricing](https://developers.openai.com/api/docs/pricing); [Deepgram pricing](https://deepgram.com/pricing)). Sarvam's two pages disagree on its price (₹0.49/min on the [API pricing page](https://www.sarvam.ai/api-pricing), ₹1.5/min on the [product page](https://www.sarvam.ai/speech-to-text)), but either is trivial. For global plans, note that Apple's on-device recogniser in iOS 26 doesn't list Hindi ([Gubarenko](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)).

**Past meals need exact times and a check when they land on another day.** Real meal times drift by **about 1.5–2 hours from day to day** ([Tran et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340925/)), so fixed breakfast/lunch/dinner windows break easily. MacroFactor replaced meal buckets with a 24-hour timeline: foods default to "now", and users press and hold any hour to backfill ([MacroFactor](https://macrofactor.com/timeline-based-food-logger/)). Back-logging is a known failure point; Fitbit users found past-day entries landing on "today" ([Fitbit community](https://community.fitbit.com/t5/Android-App/food-log/td-p/1698426)).

STEADY's parser should:
- give every item an exact eaten-at timestamp
- resolve "yesterday's dinner", "kal raat" or "subah" against the phone's clock
- show a grouped confirm card whenever a sentence lands outside today, e.g., "Yesterday dinner: 2 items · Today breakfast: 1 item", because in Hindi "kal" means both yesterday and tomorrow

This is the one place where a confirm step clearly pays for itself, because a meal filed on the wrong day silently corrupts the history.

**How sure we are:**
- **Strong:** the repetition data and the UX research on undo versus confirmation.
- **Moderate:** the speech benchmarks, though they are telephony-based and not about food.
- **Weak:** the input-type evidence (studies of 6–18 people).
- **Opinion or inference:** the hybrid auto-log rule.

## STEADY's 65% already matches the best published result, so chase consistency next

This section answers group D: accuracy and food data.

| Question | Recommended answer | Evidence |
|---|---|---|
| Realistic accuracy target? | Median calorie error of 20% or less (within food-label tolerance), no systematic lean high or low, the same input always giving the same number, and a user correction rate tracked against about 20% | Moderate (benchmarks) plus inference |
| Show sources? | Yes: a small badge on each item ("IFCT", "USDA", "Your usual", "AI estimate") plus the assumed portion | Weak (no calorie-app trial), consistent with trust research |
| Restaurant food? | Treat "restaurant" as a signal to assume more oil and bigger portions. Use calorie numbers from menu or delivery-app screenshots when shared. Skip paid restaurant databases for India for now. | Weak to Moderate |
| Global databases? | USDA (free), plus each launch market's national table, plus Open Food Facts bulk data for barcodes, plus a paid branded/restaurant API only when a market needs it | Strong (official docs) for availability; inference for the combination |
| Crowd-sourced corrections? | Corrections apply to the user's own logs by default. Share them only after several users agree or a reference check passes. Never let users overwrite core generic foods. Remove duplicates. | Moderate |
| Barcodes? | Keep them free. In India, back them up with a nutrition-label photo reader. | Moderate |
| Which AI model? | A fast, cheap model parses everything. Hard cases escalate to a stronger one. Keep the provider swappable, and re-run the eval before switching. | Weak for 2026 models (no food benchmarks), Strong for pricing |

**STEADY is already at the published frontier for text.** NutriBench tested 11,857 meal descriptions from 11 countries. The best result was **66.8% within ±7.5 g of carbs** (GPT-4o reasoning step by step). **Professional nutritionists without lookup tools scored 42.5%** on a subset ([NutriBench](https://arxiv.org/html/2407.12843v6)). STEADY's held-out score of about 65% of items within tolerance therefore sits at the published frontier for text, although the tolerance definitions differ. The comparison holds in spirit, not exactly.

Photo-only estimation is clearly worse:
- **Studies:** GPT-4o and Claude 3.5 Sonnet missed energy by **about 36% on average**, and every model under-estimated more as portions grew ([PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)).
- **NIH test of real apps:** in a test presented in July 2026 and not yet peer-reviewed, MyFitnessPal, Lose It, Cal AI and Appediet **under-counted by about 250–345 kcal per meal** and about 30 g of fat. The lead researcher advised users to "assume actual intake may be higher" ([ScienceDaily](https://sciencedaily.com/releases/2026/07/260726015237.htm)).

The "true" numbers are noisy too:
- US food labels may legally understate calories by up to 20% ([FoodNavigator-USA](https://www.foodnavigator-usa.com/Article/2010/01/06/Low-calorie-foods-could-contain-more-energy-than-labels-state/)).
- **19% of restaurant items were at least 100 kcal over** their stated value ([JAMA 2011](https://pubmed.ncbi.nlm.nih.gov/21771989/)).
- More than a third of people under-report what they eat by over 25% ([PMC12538426](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12538426/)).

STEADY's 24% median error beats photo AI but sits just above label tolerance. A credible public target is a **median error of 20% or less, "better than a dietitian without tools"**, measured on held-out data.

**Portion size is where most of the error comes from.**
- **Portion is the dominant source.** Telling models the true weight cuts error substantially. Everyday units ("a bowl") are harder than grams ([NutriBench](https://arxiv.org/html/2407.12843v6)).
- **Context helps.** Telling the model the meal time and type of venue lowers error across eight models ([arXiv 2507.07048](https://arxiv.org/abs/2507.07048)).
- **Database values add less error.** For cooked Indian foods, table values were within ±5% of lab analysis per food but drifted to **about 27% over a whole day** ([APJCN](https://apjcn.qdu.edu.cn/16_2_22.pdf)).
- **Fat is what apps miss most** ([ScienceDaily](https://sciencedaily.com/releases/2026/07/260726015237.htm)).

What follows for STEADY:
- an India-specific gram table for katori, roti, piece and spoon
- the oil question
- context signals such as home versus restaurant and cuisine
- measuring whether STEADY is *consistently* low or high (signed bias), not just how far off it is
- splitting STEADY's own eval errors into wrong food, wrong portion and wrong database value

**Consistency and visible sources build trust.** Users forgive "roughly right" but not "different every time":
- "You take 3 pictures of the same dish and get a variance of 50% in calories" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616))
- "it has macros that make no sense - like 9g of protein for 1 cup of tortilla chips" (same source)

Technical users trust AI that sits on top of a real database: "I wouldn't trust a pure AI solution without some proper database behind it" ([HN](https://news.ycombinator.com/item?id=44224152)). They praise MacroFactor for letting them "give it text alongside a photo and then adjust the results (broken out by ingredients)" ([HN](https://news.ycombinator.com/item?id=44224162)). Editing one number must not quietly change others, as this reviewer found: "if I try to change the protein to what I'm actually reading it'll change the calories" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).

Evidence that showing sources raises trust is indirect:
- In a 160-person calorie-estimation experiment, an AI that openly committed to honesty earned more trust ([IOS Press](https://ebooks.iospress.nl/volumearticle/63369)).
- About two-thirds of US consumers say it is very important to be told when AI is used ([Purdue](https://ag.purdue.edu/news/2025/09/consumers-mostly-support-ai-tools-to-improve-food-and-agriculture.html)).
- Bevel already markets its verified database over pure AI estimates ([Fitt Insider](https://insider.fitt.co/press-release/bevel-launches-ai-powered-nutrition-app/)).

STEADY's existing rule is the right foundation: numbers come from cache, then USDA, then INDB/IFCT, with AI only as a flagged last resort. The redesign should make that visible.

**For restaurant meals, assume more oil and use any numbers the user shares.** Chains must publish calories in:
- the US (20+ locations)
- England (250+ employees, since April 2022)
- India (10+ outlets or a central licence, since January 2022) ([FSSAI guidance](https://mail.fssai.gov.in/upload/uploadfiles/files/Guidance_Note_Labelling_23_02_2022.pdf))

No API collecting Indian chain menus was found. Nutritionix's ~192,000 menu items are US-focused, by the company's own claim ([Syndigo](https://syndigo.com/fr/blog/nutritionix-datasets-databricks-marketplace/)). Most Indian eating out happens at independent restaurants with no data at all.

So "restaurant" should be a signal that raises the oil and portion assumptions. When a user shares a menu or Swiggy screenshot, the numbers on it should be used. A HealthifyMe reviewer complained that when they uploaded "a screen shot of with written calorific values (from Swiggy) it still captures what it wants to and assign whatever values" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)). A partnership with delivery platforms is a later legal and business question.

**Build the global food database from free national sources plus targeted paid data.** The main options:
- **USDA FoodData Central:** public domain, with a limit of 1,000 requests per hour ([USDA API guide](http://fdc.nal.usda.gov/api-guide/)).
- **Open Food Facts:**
  - Has about 4 million products but is thin in India: **about 10,000 products, against roughly 90,000 on sale** ([OFF blog](https://blog.openfoodfacts.org/en/news/open-food-facts-india-database-reaches-10k-product-milestone)).
  - Uses a share-alike licence and says there are "no assurances that the data is accurate".
  - Allows only 10 searches per minute per IP address ([OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)), so STEADY should download the full data file rather than search it live.
- **FatSecret:** the only commercial API with documented coverage of 62+ countries. Its free startup tier covers US data only; other markets are priced on request ([FatSecret](https://platform.fatsecret.com/api-editions)).
- **National food tables:** authoritative but small, and their licences differ.
  - Canada's file can be used with credit ([Health Canada](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/copyright-guidelines-canadian-nutrient-file.html)).
  - The UK's labelling dataset is non-commercial only ([FN-NBRI](https://fnnbri.quadram.ac.uk/data/)).
  - INDB's redistribution licence is unclear ([PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795)).

A practical combination:
- USDA for generic foods
- each launch market's national table (IFCT/INDB for India)
- Open Food Facts bulk data where it is dense, such as Europe
- a paid branded/restaurant API only when a market demands it

HealthifyMe's main advantage is its Indian dish database: "there are a wide range of Indian dishes here which really aren't there on any other apps" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)). STEADY's INDB/IFCT data is a real asset, as long as it stays clean.

**Keep user corrections personal until they're confirmed.** Crowd-sourced MyFitnessPal data is accurate for energy and macros on average, but weak for sodium and cholesterol ([JMIR 2020](https://www.jmir.org/2020/10/e18237)). The bigger problem is duplicate entries with conflicting values ([Droid-life](https://www.droid-life.com/2022/08/24/myfitnesspal-puts-barcode-scanner-behind-premium-paywall/)). Indian users feel this sharply: "Every food item I search has multiple (sometimes over 10 similar listings) listings with similar names in both Hindi and English, and mostly different calories and nutrients information" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)).

Curated apps control what users can submit. Cronometer reviews every user-submitted food ([Cronometer forum](https://forums.cronometer.com/discussion/comment/16477/)). MacroFactor doesn't let users submit common foods at all ([MacroFactor](https://macrofactorapp.com/version-2-7-0/)). For STEADY:
- A user's correction fixes their own logs immediately, which also improves consistency for them.
- It reaches everyone else only after several independent users agree or a reference check passes.
- There should be one canonical "dal tadka", not ten.

**Keep barcode scanning free, and add a label reader for India.** Barcode scanning is expected. When MyFitnessPal moved it behind a paywall in 2022, users publicly switched apps ([Digital Trends](https://digitaltrends.com/phones/myfitnesspal-barcode-scanning-not-free-premium-subscription)). MacroFactor doesn't list India among its well-covered barcode markets ([MacroFactor help](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region)). In India, having the AI read a photo of the printed nutrition label is likely more reliable than a barcode lookup. Both should be free.

**Use a cheap, fast model for parsing and test before switching.** Prices as of October 2026:
- Fast models cost **$0.05–$0.10 per million input tokens**: gpt-5-nano, gpt-6-luna, Claude Haiku 5.5 and Gemini 2.5 Flash-Lite.
- Frontier models cost $2–$10 ([OpenAI pricing](https://developers.openai.com/api/docs/pricing); [Claude models](https://platform.claude.com/docs/en/about-claude/models/overview); [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).
- Gemini 3.8 Flash doubles in price on 1 January 2027 ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).

No published food benchmark covers any 2026 model, and older results conflict:
- On photos, GPT-4o and Claude 3.5 were roughly tied ([PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)).
- A 2026 carb-counting study found ChatGPT closest and Claude the most likely to under-count, without stating model versions ([PubMed 41969183](https://pubmed.ncbi.nlm.nih.gov/41969183/)).
- Training a mid-sized open model further on food data lifted NutriBench accuracy from **45.6% to 61.7%** ([NutriBench](https://arxiv.org/html/2407.12843v6)). That is a later way to cut costs.

Recommendations:
- A fast model turns every log into structured items with grams and a confidence score.
- Low-confidence items, mixed-dish photos and restaurant meals go to a stronger model.
- Numbers still come from databases.
- Keep the provider swappable (STEADY already uses OpenRouter in evals), and re-run the held-out eval before any switch.
- GPT-4o, STEADY's current photo model, did not appear on OpenAI's current pricing page, so check that it is still available.

**How sure we are:**
- **Strong:** the benchmark and NIH numbers, the label-tolerance figures, and the database licences and limits.
- **Weak:** the case that showing sources builds trust. It is plausible and consistent with the evidence, but no calorie-app study has tested it.
- **Gap:** model choice for 2026 has no food benchmark. STEADY's own eval is the only valid judge.

## The journal should double as the fastest way to re-log

This section answers group E: journal and history views.

| Question | Recommended answer | Evidence |
|---|---|---|
| Day view | A time-ordered timeline with the whole day on one screen, totals per meal, and "add to today" on every item | Opinion (strong, consistent complaints) |
| Week view | Seven bars plus the weekly average against target, leaving out today and empty days | Moderate (industry practice) |
| Month view | A calendar of mini-rings that reflect the user's goal, with a dot on weigh-in days | Opinion (Apple pattern) |
| What else lives there | Weight trend, workouts, optional notes or mood. Food stays the main focus. | Weak |
| Editing past days | Always allowed. Streak credit only for same-day or grace-window logs. Optional "Done for today" marker. | Moderate (industry practice) |
| History length, export, speed | Unlimited history, data export, and instant loading from a copy stored on the phone | Opinion (strong complaints) |

**Users want to see the whole day at once, kept forever, and loaded fast.** History screens in leading apps follow three patterns:
- **A day diary with date navigation:** MyFitnessPal, Cronometer, Lose It.
- **Averages and trends:** MacroFactor shows daily, weekly, monthly and yearly averages and the top foods behind each nutrient ([MacroFactor](https://macrofactor.com/micronutrients-nutrient-explorer/)).
- **A calendar of completion markers:** Apple Fitness shows a monthly calendar of rings ([iDownloadBlog](https://www.idownloadblog.com/2016/10/27/how-to-look-back-at-your-weekly-move-goals-progress-in-the-activity-app/)).

Complaints cluster around hiding or losing the day:
- **Hiding the day:** MyFitnessPal's 2026 "Today" redesign was attacked because the diary was no longer visible at a glance and "has been ruined by being converted to a list of gigantic, space-consuming cards" (Reddit, via [PiunikaWeb](https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/)).
- **Slow history:** Lose It drew complaints about lag when browsing history ([MyNetDiary](https://www.mynetdiary.com/diet-app-scorecard-june-2026.html)).
- **Short history:** HealthifyMe keeps nutrition data for only seven days: "Calorie and macronutrient data is only stored for past 7 days, which makes my weekly deficits tedious to calculate, like I have to use notes app to rewrite all the macros" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)).
- **No export:** "You cannot download your data. That's lame" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).
- **Data loss**, the most devastating of all: "my entire weight data is gone from 2018 up until the data from yesterday! It was quite devastating" ([MyFitnessPal App Store](https://apps.apple.com/us/app/myfitnesspal-calorie-counter/id341232718)).

**Recommended journal design:**
- **Month view:** a calendar of mini-rings.
- **Week view:** seven bars and a weekly average.
- **Day view:** a timeline.

Averages should leave out today and empty days by default. Cronometer lets users filter to completed days for exactly this reason, since partial days drag averages down ([Cronometer support](https://support.cronometer.com/hc/en-us/articles/360019864891)). For a gainer, an artificially low average would push them to over-eat.

The journal should also be a fast logging surface: tap yesterday's meal, then "add to today". MacroFactor lets users copy whole days to "catch up when you mostly ate the same foods" ([MacroFactor](https://macrofactor.com/10-macrofactor-features/)). Optional voice notes are worth a slot, because speech journaling captured reasons and context that encouraged self-reflection ([FoodScrap](https://www.microsoft.com/en-us/research/?p=744916)).

**Allow editing any day, but tie the streak to logging on time.** No major app hard-locks past days. Cronometer offers an optional "Mark Day Complete" that locks a day and cleans up averages ([Cronometer forum](https://forums.cronometer.com/discussion/comment/21511)). STEADY should:
- allow edits to any day at any time, which the coach also needs for accurate data
- count a day toward the streak only if it was logged that day or within the grace window
- add a nightly "Done for today?" prompt, which gives clean data for averages and the coach and doubles as the day's closing moment

**How sure we are:** this section rests on industry practice and strong, consistent user complaints. No data exists on how often users open past days, or on which kind of history view they prefer.

## Skip real phone calls; make the coach a scheduled in-app voice check-in

This section answers group F: the AI coach, and the idea of the AI phoning the user to collect the daily log. The founder's instinct has real evidence behind it. The research supports the *ritual*, not the *phone network*. Here are the four ways to deliver it:

| Option | Feels like a call? | Monthly AI and phone cost per user at 3 min/day | Platform policy | India legal exposure | Build effort |
|---|---|---|---|---|---|
| A. Real phone call (Retell/Vapi plus Twilio/Plivo/Exotel) | Yes, the phone rings | About $9–13 | Outside the app, so no store issue | High: TRAI rules on computer-generated calls | Backend plus telecom registration |
| B. Fake "incoming call" screen (iOS CallKit/PushKit, Android full-screen intent) | Yes, a native ringing screen | About $6–9 | Grey zone: Apple reserves it for VoIP calling apps; Android allows it by default only for calling and alarm apps | Low | High: native code, App Review risk |
| C. Time-sensitive notification ("Coach is ready, tap to talk") that opens an in-app voice session | Partly (no ringing) | About $6–9 for a live conversation; cents for a one-shot check-in (inference) | Allowed on both | Low | Moderate: Expo Notifications already live |
| D. Text or chat check-in notification | No | Cents | Allowed | Low | Lowest |

| Question | Recommended answer | Evidence |
|---|---|---|
| What should the coach do? | Drive logging and give personal feedback on the logs. Not a question-and-answer bot. | Moderate |
| How often should it reach out? | One daily check-in at a time the user picks, skipped if the day is already logged. Extra messages only when something warrants it, like a goal at risk. | Moderate |
| Tone and memory? | Warm, non-judgemental, offers choices. Memory the user can see and edit. "Stop mentioning X" is honoured. Optional tough-love mode. | Weak plus industry practice |
| Can it take actions? | Logging food through the same undo card: yes. Changing targets: only as a suggestion the user approves. | Inference |
| Real call or in-app? | In-app (Option C) for v1. No outbound phone calls in India. | Strong (law, platform docs) plus inference |
| Cost? | A daily 3-minute call is about $9/user/month. All other AI is about $0.10. | Strong (pricing pages) plus arithmetic |
| Is it legal? | US: legal with consent. India: hostile to automated calls from regular numbers. EU/UK: need prior consent and an AI disclosure. | Strong (regulators), Moderate (legal commentary) |
| Will users like it? | Unknown at scale. Most people ignore unknown callers, and Indian users hear a call from a health app as a sales call. | Weak plus Opinion |

**The evidence supports a coach whose job is getting the day logged.**
- **Chatbots help a little with behaviour.** A meta-analysis of 19 trials found small-to-moderate improvements in activity, fruit and vegetable intake and sleep. It did not analyse weight, and **14 of the 19 studies were rated weak** ([npj Digital Medicine 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10290125/)).
- **Weight evidence is weak.** A review of conversational agents for weight management called the evidence weak ([JMIR 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10257112/)).
- **Human coaches add measurable weight loss** on top of apps ([Antoun et al. 2022](https://mhealth.jmir.org/2022/4/e35479/PDF)).
- **The most relevant data comes from India.** A three-year observational study of about 65,000 HealthifyMe users found that users with an AI plus a human coach lost **2.12 kg, versus 1.22 kg for AI only**, at three months. The mechanism was logging: coached users **logged meals 102 versus 49.7 times a week** ([Newswise](https://www.newswise.com/articles/human-ai-coaching-models-boost-weight-loss)).

That is the strongest argument for the founder's idea: a coach whose job is to get the day logged targets the exact mechanism that works. There are three caveats:
- The study was observational, not a trial.
- No trial shows an AI caller can reproduce the human effect.
- In the meta-analysis, text chatbots beat voice chatbots on fruit and vegetable intake, though that rests on few studies.

**One well-timed daily nudge works; more doesn't.** In a trial that randomised notifications day by day, a daily 8 pm notification made people **3.5 times more likely to open the app in the next hour**. The effect didn't fade over 30 days, but it also didn't change how long people kept using the app ([Drink Less trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10337295/)). A year-long trial found that letting users snooze messages was "critical to maintaining buy-in" ([HeartSteps II](https://www.sciencedirect.com/science/article/pii/S1532046424001394)).

Users are split. Some resent nagging: "Hate when my fitness pal asks why I haven't logged my dinner!... leave me alone!" ([StudyFinds](https://studyfinds.com/fitness-app-motivation-study-myfitnesspal)). Others value it: "the daily reminders are a nice nudge if you ask me" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)). The answer is one prompt a day at a time the user picks, skipped if they've already logged, with snooze.

**The coach should be warm, remember what users tell it, and never mis-log silently.** Small studies favour an empathetic tone that offers choices. Humans beat scripted bots on empathy, while bots beat humans on persistence ([PMC9605038](https://pmc.ncbi.nlm.nih.gov/articles/PMC9605038)). Whoop lets users view, edit, delete or turn off its coach's memory ([Whoop](https://www.whoop.com/us/en/thelocker/my-memory-whoop/)).

The cautionary tale is Google Health's Gemini coach, launched in May 2026:
- Users called it "ruined" and "slop".
- One wrote that it "often neglects to add foods when asked, then does so inaccurately" (Reddit, via [TechRadar](https://www.techradar.com/ai-platforms-assistants/this-is-a-neverending-fight-fitbit-users-are-sick-of-google-healths-ai-hallucinations-and-now-its-affecting-their-food-tracking-metrics)).
- Google's own fix list promised less commentary on trivial activity and better recall of "Stop mentioning…" instructions ([9to5Google](https://9to5google.com/2026/05/27/google-health-roadmap-fitbit-backlash/)).

Indian users already find app coaching generic: "The plan they make is worse than what you can get from ChatGPT" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)).

STEADY's coach should:
- never mis-log silently
- stay quiet about trivia
- log food only through the same undo card as everything else
- suggest target changes, never impose them

Carrot Fit shows that an opt-in sarcastic persona can make an app stand out ([MobiHealthNews](https://www.mobihealthnews.com/news/snarky-app-maker-carrot-launches-weight-loss-app)). It should not be the default for a health app.

**Daily phone calls would cost about 90 times more than everything else.** The per-minute price of an AI phone call:
- Retell lists $0.055/min for voice infrastructure. With the AI model, voice and phone line added, the total is **about $0.10/min** on a cost-efficient setup ([Retell](https://www.retellai.com/pricing)).
- Vapi estimates $0.08–$0.13/min ([Vapi](https://vapi.ai/pricing)).

A 3-minute daily call is about $0.30, or **about $9 per user per month**. For today's 36 users, that is about $330 a month.

Running the same conversation inside the app over the internet saves only the phone-line part, about $0.015–0.05/min. For reference, Twilio charges $0.0496/min to Indian mobiles ([Twilio](https://www.twilio.com/en-us/voice/pricing/in)). A live two-way voice conversation in the app still costs about $6–9 per user per month. By comparison, the entire lean logging stack costs about $0.10 per user per month (see the speed section below).

There is a cheaper way to get the "coach asks, I answer" feel. This is the report's inference:
1. The coach's question is a short, pre-generated voice prompt.
2. The user answers in one go.
3. The normal logging pipeline parses the answer.

That costs fractions of a cent per check-in instead of dollars per month.

**India's telecom rules make outbound AI calls risky.**
- **US:** In February 2024, the US regulator (the FCC) ruled that AI voices count as "artificial" voices under its telemarketing law (the TCPA). Such calls are legal with prior consent, an AI disclosure and an easy opt-out; they are not banned ([Orrick](https://orrick.com/Insights/2024/02/Did-the-FCC-Really-Ban-AI-Generated-Voice-Calls-No-But-Restrictions-Apply)).
- **India, 2024:** a TRAI direction of 13 August 2024 tells phone carriers to stop promotional calls, **"including pre-recorded and computer-generated calls"**, from unregistered telemarketers. The penalty is disconnection and **up to 2 years of blacklisting** ([TRAI](https://trai.gov.in/sites/default/files/Direction_13082024.pdf)).
- **India, 2025:** a February 2025 amendment moves business calls onto special number series (140 for promotional calls, 1600 for service calls) and blocks ordinary 10-digit numbers used for business ([Securiti](https://securiti.ai/india-spam-rules-trai-latest-amendment/)).

Nobody has settled whether a coaching call the user scheduled counts as "commercial communication". A compliant route likely means registering on TRAI's DLT system (the telemarketer registry) and getting a 1600-series number. That is heavy for a 36-user startup.

- **UK and EU:** automated marketing calls need prior consent ([Data Protection People](https://dataprotectionpeople.com/resource-centre/pecr-and-phone-calls/)). According to legal commentary, the EU AI Act also requires telling people they are talking to an AI, from 2 August 2026 ([Softcery](https://www.softcery.com/lab/eu-voice-ai-regulations-founders-guide)).

In-app voice avoids the telecom rules entirely.

**Both app stores make a fake ringing screen risky.**
- **iOS:** the push type that can wake an app to ring (PushKit) is only for apps that provide internet phone calling. Every such push must be reported as a real incoming call. Apple's documentation is blunt: "If you are unable to support CallKit in your app, you cannot use PushKit to handle push notifications" ([Apple](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit.md)).
- **Android 14+:** the full-screen "ringing" permission is on by default only for calling and alarm apps. Other apps must ask the user and cope gracefully with a refusal ([Google Play Console Help](https://support.google.com/googleplay/android-developer/answer/13392821)).

A fake incoming-call screen is therefore an App Review risk and needs native code. A time-sensitive notification that opens straight into a voice session is allowed on both platforms.

**Users may not welcome being phoned.**
- **Unknown numbers go unanswered:** 80% of US adults generally don't answer calls from unknown numbers ([Pew 2020](https://www.pewresearch.org/short-reads/2020/12/14/most-americans-dont-answer-cellphone-calls-from-unknown-numbers/)).
- **Indian users expect a sales pitch.** HealthifyMe's sales teams taught them to: "the back end team takes your number from the app and calls you within 24 hours to push their plans" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)).
- **Engagement varies widely.** Korea's CareCall, an AI that phones people living alone, found six engagement types among its users, ranging from highly expressive to silent ([Gerontechnology](https://journal.gerontechnology.org/currentIssueContent.aspx?aid=4820)).

Some demand exists, but it is small. One HN user wrote: "I would be totally fine if I could trigger a 'call' from the app and talk to an AI on the phone for 30s and it could log my meal, give me some advice" ([HN](https://news.ycombinator.com/item?id=44227000)). Note that they want to *trigger* the call themselves. A niche AI-calling app with only two ratings has a user saying "Morning call forces me to decide what I'm doing that day, evening call makes me admit if I slacked" ([CallCoach](https://apps.apple.com/us/app/callcoach-honest-life-coach/id6752913700)). No data exists on answer rates or retention for AI habit calls.

**Recommendation: build Option C as an evening "close your rings" ritual.**
- The user opts in and picks the time.
- It is skipped if the day is already logged.
- It lasts about 30–60 seconds.
- It uses a call-style full-screen view inside the app. That is allowed, because the app is already open.
- The coach greets the user by name. The user says everything they ate, the parsed result appears with undo, and the coach gives one line of feedback.

Also add a "Call me now" button inside the app for users who want it. Revisit real phone calls only as an opt-in premium experiment outside India, with written consent, once the in-app version shows people use it.

**How sure we are:**
- **Strong:** the costs, laws and platform rules.
- **Observational only:** the coaching mechanism (logging frequency). It comes from the HealthifyMe study, not a trial.
- **Weak:** user reception of AI calls. It rests on one HN comment, a two-review app and survey data about unknown callers.

## Widgets need a development build, and the mic button must open the app

This section answers group G: widgets and other surfaces, including Expo constraints.

| Question | Recommended answer | Evidence |
|---|---|---|
| Which surfaces for v1? | iOS home-screen widget (ring, calories/protein left, mic, "repeat last meal"), iOS Lock Screen ring gauge, Android home-screen widget with a mic | Strong (platform docs) for feasibility, Weak for value |
| Can a widget start recording without opening the app? | iOS: not reliably, so the mic should open a screen that is already listening. Android: yes, a widget tap can launch a listening screen. | Strong (docs) plus developer reports |
| Control Center or Action button? | Add one iOS 18 "Log meal" control later. It needs a separately built native part. | Strong (docs) |
| Siri or Google Assistant? | Add a Siri App Shortcut later. Skip "Hey Google": Assistant was removed from most Android phones in September 2026. | Strong to Moderate |
| Watch? | Not for v1 | Inference |
| What does Expo require? | Leave Expo Go for development builds. Upgrade SDK 54 to 56+. Use expo-widgets, and add @bacons/apple-targets only for controls. | Strong (Expo docs) |
| Expected adoption? | About 5–15% of active users unless promoted inside the app. Measure it; don't assume it. | Weak |

**Widgets probably help, but the evidence is thin.** The one credible data point comes from Gratitude, a journaling app. **Widget users retained 25% better, and 10% of daily active users adopted widgets** ([Android Developers Blog](https://android-developers.googleblog.com/2026/05/how-gratitude-widgets-boosted-user-retention-25-percent.html)). That is a correlation, since keen users choose to add widgets. In a non-representative reader poll, about half said they never use widgets ([TidBITS](https://tidbits.com/2024/01/15/do-you-use-it-widgets-see-middling-adoption/)).

User voice is consistently positive:
- "the live activity tracker that displays how many calories you have left right on your lock screen or Apple Watch is a huge feature" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616))
- "Even just a widget that's a big + that takes me straight to the add food screen would be great" ([Cronometer forum](https://forums.cronometer.com/discussion/897/android-widget))

Food logging happens several times a day, which suits a widget better than a once-daily journal. That fit is plausible but unproven.

**On iOS, the widget's mic button should open the app.** iOS widget code runs in a separate, limited process outside the app. Apple says a widget button "should do more than open the app", and that opening the app should use a link instead ([Apple](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)).

Recording without opening the app is unreliable:
- It needs a feature called AudioRecordingIntent (iOS 18+).
- That feature requires the app to start and keep a Live Activity, the live status display on the Lock Screen and Dynamic Island. Without one, "the audio recording stops" ([Apple](https://developer.apple.com/documentation/appintents/audiorecordingintent)).
- Developers report recording failing on real devices unless the app is in the foreground ([Apple Developer Forums](https://developer.apple.com/forums/thread/737258)).
- Lock Screen widget buttons do nothing until the phone is unlocked ([Apple](https://developer.apple.com/documentation/widgetkit/adding-interactivity-to-widgets-and-live-activities)).

So:
- The mic button opens the app straight into a listening screen.
- Buttons that don't need audio, such as "repeat last meal" or a favourite quick-add, update the ring without opening the app.
- Later, an iOS 18 "Control" can put one "Log meal" button in Control Center, on the Lock Screen and on the Action button ([Apple](https://developer.apple.com/documentation/widgetkit/creating-controls-to-perform-actions-across-the-system)).
- Siri App Shortcuts work as soon as the app is installed ([Apple](https://developer.apple.com/documentation/appintents/app-shortcuts)).

**Android is more permissive.** A widget tap can launch a screen directly. Android normally blocks apps from starting the microphone in the background, but it makes an explicit exception for anything started "by interacting with app widgets" ([Android docs](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)).

Voice-assistant integration is not worth building:
- Google began removing Assistant from Android phones on 4 September 2026 ([Let's Data Science](https://letsdatascience.com/news/google-retires-assistant-from-android-devices-september-4-8702bddf)).
- The documentation for the old voice integration (App Actions) doesn't mention Gemini.
- Android Go phones, which are common in India, don't support App Actions at all ([Android docs](https://developer.android.com/develop/devices/assistant/overview)).

Long-press shortcuts on the app icon are a cheap alternative. Watch apps can wait: Wear OS 7 is replacing tiles with "Wear Widgets" ([Android Developers Blog](https://android-developers.googleblog.com/2026/05/whats-new-wear-os-7.html)).

**Every widget means leaving Expo Go.** Expo Go is the ready-made sandbox app you scan a QR code with. It can only run native code that Expo built into it in advance. Widgets need their own native parts, so they require a "development build": STEADY's own compiled app shell, built through EAS. Here is what the tooling looks like:
- **expo-widgets** became stable for iOS widgets and Live Activities in Expo SDK 56 ([Expo blog](https://expo.dev/blog/ios-widgets-and-live-activities-in-expo)). The current docs cover iOS home-screen and Lock Screen widgets, Live Activities, and optional Android widgets. Android widget tap events only arrive while the app is running, and Control Center controls are not documented ([Expo docs](https://docs.expo.dev/versions/latest/sdk/widgets/)).
- **@bacons/apple-targets** is needed for controls. Its own README calls it "highly experimental and not part of any official Expo workflow" ([README](https://unpkg.com/@bacons/apple-targets@3.0.2/README.md)).
- **Voltra** from Callstack is a cross-platform alternative that turns React components into native widgets ([Voltra](https://www.use-voltra.dev/)).

The path:
1. Upgrade from SDK 54 to 56 or later. This changes the version of every native module, which matters given the existing Expo Go version-matching constraint.
2. Move day-to-day development to development builds.
3. Adopt expo-widgets.
4. Add apple-targets only when building the control.

The data flow is simple. After each log, the app writes a small snapshot (calories eaten, goal, protein, last meal) to storage the widget can read, then asks the widget to refresh. The widget never talks to Supabase in v1. To get adoption, prompt users to add the widget from inside the app, which helped Gratitude. Track widget installs, taps and logs-from-widget in PostHog.

**How sure we are:**
- **Strong:** the platform rules, from official Apple, Google and Expo docs.
- **Weak:** the value of widgets. It rests on one correlational case study and user requests.
- **Gap:** whether iOS allows microphone recording from a widget at all. Only forum anecdotes exist, so test it on a real iPhone.

## Charcoal, cream, and one ring that means the same thing everywhere

This section answers group H: visual direction.

| Question | Recommended answer | Evidence |
|---|---|---|
| Palette | Charcoal background (#121212–#1A1A1A) with warm cream text. Light mode flips to a cream background with charcoal text. Saturated colour only for the ring. | Moderate (design guidance) |
| Ring colours | A colour-blind-safe set (e.g., based on the Okabe-Ito palette). Each ring also has an icon, a fixed position and a label. Never red versus green as the only signal. | Strong (colour-blindness rates) |
| Signature element | The goal-aware ring as one object used everywhere: app, widget, Lock Screen, notifications, share images, app icon | Opinion (design commentary) |
| Ring technology | Draw the main ring with Skia, which is included in Expo Go, with a cheap fallback using core Animated. Only one or two animated rings on screen. A static version when the phone's Reduce Motion setting is on. | Strong (docs) plus inference |
| Haptics | On Android, use performAndroidHapticsAsync, which needs no permission. Give each vibration one meaning. Don't rely on haptics during iOS dictation. | Strong (docs) |
| Celebration | A short ring-closing moment (under a second), tested on a low-end Android phone using a release build | Inference |
| Performance budgets | Cold start of 2.5 seconds or less on a 2–3 GB Android phone. Crash rate 0.5% or less. "App not responding" rate 0.2% or less. (Play penalises above 1.09% and 0.47%.) | Strong (Play thresholds) plus inference |

**Use charcoal and cream, not pure black and white, and never rely on colour alone.** Material Design recommends a dark grey around #121212 rather than pure black. Saturated colours on dark backgrounds fail text-contrast checks and appear to "vibrate" ([UXcel](https://uxcel.com/blog/12-principles-of-dark-mode-design-627)). Cream is gentler on the eyes than pure white ([Figma](https://www.figma.com/colors/cream/)).

**Colour blindness affects up to 8% of men** ([WashU](https://sites.wustl.edu/inclusion/?p=862)). Red–green pairs become indistinguishable for the most common types, while the Okabe-Ito palette stays readable ([arXiv 2303.04918](https://arxiv.org/pdf/2303.04918)). Copying Apple's red/green/blue rings would therefore create two problems: a colour-blindness problem and a "looks like Apple Fitness" brand problem.

Users read ring colour as the app's verdict on their day. Cal AI drew this complaint: "Rings are constantly flipping colors and missing entries" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). Some users prefer bars: "I like that they are bars and not circular graphs" ([Cronometer App Store](https://apps.apple.com/us/app/cronometer-calorie-counter/id1145935738)). The detail view can use bars while the ring stays the hero.

**Pair a clean layout with one living object.** Cal AI's design is built from a few structural pieces: macro rings, a calorie card, a calendar strip and a floating add button ([ScreensDesign](https://screensdesign.com/apps/cal-ai-calorie-tracker/?av=3193&id=1739&vt=1)). Users praise it as "nice and clean (compared to MyFitnessPal which is a disaster of too much stuff)" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)).

Apps that win on design pair restraint with one object that changes as the user behaves:
- Opal's gem grows "brighter, more vibrant, and more intricate" as focus improves ([Opal](https://opal.so/blog/designing-for-wellbeing)).
- Apple's ring-closing sparkle is loved enough that developers try to recreate it ([Apple Developer Forums](https://developer.apple.com/forums/thread/750711)).
- Gentler Streak won an Apple Design Award by presenting "tons of numbers in a simple way that everyone could understand" ([Sketch](https://sketch.com/blog/gentler-streak)).

STEADY's signature should be its goal-aware ring, with distinct states: filling, in the zone, and surplus banked. It should look the same everywhere and close with a short, ritual moment.

**Keep motion cheap so low-end Android phones don't stutter.**
- **Frame budget:** at 60 frames per second each frame has 16 ms. Overrun by 1 ms and Android drops the frame entirely ([Android](https://developer.android.com/topic/performance/vitals/render)).
- **Core Animated is limited.** React Native's built-in animation system can run animations off the main JavaScript work only for movement, scaling and fading ([React Native docs](https://reactnative.dev/docs/animations)). Smoothly growing a drawn ring outline therefore needs another route.
- **Reanimated has a ceiling.** It suggests staying around 100 animated components on low-end Android ([Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance)).
- **Skia is ready to use.** The Skia drawing library is included in Expo Go ([Expo docs](https://docs.expo.dev/versions/latest/sdk/skia/)), so the main ring can be prototyped now. Skia animations are usually driven by Reanimated, so its version must match the one Expo Go bundles.
- **There is a cheap fallback:** two half-circles rotated with core Animated.
- **Animation files:** for Lottie animations, running them through Skia reported a 63% frame-rate gain on a low-end Android phone ([react-native-skottie](https://github.com/margelo/react-native-skottie)).
- **Haptics:** performAndroidHapticsAsync needs no vibration permission. The iPhone's vibration motor goes silent while iOS dictation is active ([Expo docs](https://docs.expo.dev/versions/latest/sdk/haptics/)).
- **Play penalties:** Google Play may reduce an app's visibility if more than 1.09% of users see a crash, more than 0.47% see an "app not responding" freeze, or a cold start takes 5 seconds or more ([Android vitals](https://developer.android.com/topic/performance/vitals)).

**How sure we are:**
- **Strong:** the contrast, colour-blindness and performance numbers.
- **Opinion:** the signature-element advice. It is design commentary, with no measurement behind it.
- **Gap:** no benchmark compares ring-drawing approaches on low-end phones. Test on a real budget device.

## A 2.5-second promise needs one model call, not a chain of eight

This section answers group I: the speed promise, latency architecture, offline use, AI cost per user and failure handling.

| Question | Recommended answer | Evidence |
|---|---|---|
| Speed promise | "Say it, it's logged." Food names on screen about 1.5 seconds after the user stops talking. Ring updated in about 2.5 seconds typically, and 5 seconds or less for the slowest 1 in 20 logs. | Strong (perception research) plus inference |
| Latency architecture | Check the personal and common-food cache first, then one structured AI call, then database lookups run at the same time, then one fallback AI call only for foods not found. Show results item by item as they arrive. | Strong (OpenAI guidance) plus inference |
| Offline | Record on the phone, save a pending entry, show it straight away, then parse and sync when back online, with a unique ID per log. Repeat meals work fully offline. | Moderate (established patterns) |
| AI cost per user | About $0.10/month on a lean setup, about $0.80 on a premium one. Add a daily cap per user. | Strong (pricing pages) plus arithmetic |
| Failure handling | Six designed states: success, partial, unsure quantity, speech failed, offline, timeout. Never silently write a wrong number. Show source and confidence per item. Corrections feed back into the cache. | Moderate (Google PAIR, Microsoft HAX guidance) |

**Here is what "instant" means.** Classic response-time research ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)):
- **0.1 seconds** feels instantaneous.
- **1 second** keeps the user's train of thought.
- **10 seconds** loses their attention.

Delays over a couple of seconds need specific progress. Naming each item as it is processed is better supported than a generic shimmering placeholder. In one 136-person test, placeholder skeleton screens actually felt slowest: 59% said the content loaded quickly, versus 74% for a spinner. Another study disagreed, so treat this as mixed ([UX Collective](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a)).

The latency budget below is measured from the moment the user stops talking. "p50" means the typical case. "p95" means the slowest 1 in 20, which is the number to watch, not the average.

| Step | Target |
|---|---|
| Screen reacts or phone vibrates | 100 ms or less |
| Transcript visible | 0.7 s or less |
| Food names visible, one by one | 1.5 s or less |
| Numbers in and ring moves | 2.5 s or less at p50, 5 s or less at p95 |
| Hard timeout | 10 s, then "saved, finishing in background" |

**The current chain of AI steps is the main speed problem.** OpenAI's own latency guide says to make fewer requests, run independent steps in parallel, and not use an AI model where a simple lookup will do. Its key finding: "Cutting 50% of your output tokens may cut ~50% of your latency", while shortening the prompt barely matters ([OpenAI latency guide](https://developers.openai.com/api/docs/guides/latency-optimization)). STEADY's current parse is a chain of up to eight AI steps, each waiting for the last, much like Python code that awaits each call before starting the next.

The proposed pipeline runs on a Supabase Edge Function, STEADY's server code:
1. Clean up the transcript and check the user's frequent foods and a shared cache of common foods. Many repeat logs never touch AI at all.
2. Make **one** structured call to a fast model that returns items, quantities, units and confidence, using short field names.
3. Look every item up at the same time: cache, then USDA, then INDB/IFCT. This is the equivalent of Python's `asyncio.gather` or Java's `CompletableFuture.allOf`.
4. Make one more AI call only for items that weren't found, and flag those numbers as estimates.

On screen, rows should appear as soon as food names arrive. The ring should move to a dimmed, provisional value and then settle when the real numbers land. An unconfirmed estimate should never be saved silently.

Location also matters. Keep the database, server code and AI endpoint close to each other. Supabase offers a Mumbai region ([Supabase](https://supabase.com/docs/guides/platform/regions)), but OpenAI processes Indian traffic outside India ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)).

**Offline logging is a trust feature.** The cautionary tale: "used this app without missing a day for 240 days, went camping, had no service... When I got service a few days later everything was deleted" ([Cal AI App Store](https://apps.apple.com/us/app/cal-ai-calorie-tracker/id6480417616)). MyFitnessPal's offline mode reportedly logs only from recent foods, a low-confidence claim from a competitor's blog ([Nutrola](https://nutrola.app/en/blog/calorie-tracker-that-works-without-internet-offline-2026)). Cronometer users have asked for offline mode for years ([Cronometer forum](https://forums.cronometer.com/discussion/5430/limited-offline-mode-please-its-2022)).

The offline flow for STEADY:
1. Record the clip on the phone and save it.
2. Write a "pending" entry and show a card saying it will log when online.
3. On reconnecting: upload, transcribe, parse and reconcile.

Each log needs a unique ID created on the phone (an "idempotency key"), so a retry can never log the same meal twice. Two established tools can manage the queue: TanStack Query's saved pending updates ([TanStack](https://tanstack.com/query/latest/docs/react/guides/mutations)) and PowerSync's on-phone database for Supabase ([PowerSync](https://docs.powersync.com/integration-guides/supabase)). At 36 users, a simple custom queue is enough. The streak must count the time the food was eaten, not the time it synced.

**AI cost per user is small if the architecture is lean.**
- **Speech-to-text:** about $0.003–0.006 per minute ([OpenAI pricing](https://developers.openai.com/api/docs/pricing); [Deepgram pricing](https://deepgram.com/pricing)). At four voice logs a day, that is about $0.05–0.12 per user per month.
- **Parsing:** a single AI call on Claude Haiku 5.5 costs about $0.00035 per log. A four-step chain on gpt-5-mini costs about $0.0037 ([Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing); [OpenAI pricing](https://developers.openai.com/api/docs/pricing)).

The report's estimate, for a user making 120 logs and sending 20 coach messages a month:
- **Lean setup:** about **$0.10 per active user per month**, or about $1,000 a month at 10,000 monthly users.
- **Premium setup:** about **$0.80 per active user per month**, or about $8,000 a month at 10,000 monthly users.

The design choice (one call versus a chain) moves cost by about 3 times. The choice of model tier moves it by 5–10 times. Newer OpenAI models bill their internal "reasoning" as output, so set reasoning to minimal for parsing. With no revenue in v1, add a daily cap on AI calls per user. Real token counts haven't been measured yet; pull them from the Edge Function logs.

**Design every failure on purpose.** Google's PAIR guidebook says to make failure "safe, boring, and a natural part of the product" and always offer a way forward ([Google PAIR](https://pair.withgoogle.com/chapter/errors-failing/)). Microsoft's HAX guidelines say to make correction and dismissal easy, to fall back gracefully when unsure, and to change behaviour cautiously ([Microsoft HAX](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)). The six states to design:

| State | What the user sees |
|---|---|
| Full success | Logged, with Undo and tap-to-edit on each item |
| Partial | Found items logged, plus "Couldn't find 'X' — pick one or type it" |
| Unsure quantity | One targeted question ("1 katori ≈ 150 g?") |
| Speech failed or empty | An editable transcript, or "try again" |
| No network | Saved to the queue as pending |
| Over 10 seconds | Transcript kept, finishes in the background, manual search offered |

Apple also requires a clear indicator whenever the microphone is recording ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

**How sure we are:**
- **Strong:** the perception limits, OpenAI's latency guidance and the pricing.
- **Inference:** the per-log cost figures and STEADY's own current latency, both unmeasured. Measure them in the Edge Function logs first.
- **Gap:** how background uploads behave on low-end Android phones with aggressive battery savers was not researched.

## Roll the redesign out behind a switch, and delete voice clips after transcription

This section answers group J: rolling out to existing users, and privacy for voice and health data.

| Question | Recommended answer | Evidence |
|---|---|---|
| How to roll out | A remote on/off switch (feature flag, via PostHog) inside a staged store release. Offer "Try the new STEADY" to engaged users first. Keep a "switch back" option for one or two releases. | Strong (Play docs) plus case studies |
| What must not break | History, streaks, goals and custom foods carried over untouched, checked with before-and-after counts. Every common task takes no more taps than today. Nothing free today becomes paid. | Moderate (case studies) |
| How to talk to users | A short in-app "what changed and why" note and a feedback button. With 36 users, message or call them directly. | Inference |
| Voice audio | Delete the raw audio right after transcription. Keep the transcript under the user's control. Keep clips only if the user opts in. | Moderate (industry norms) |
| AI consent | One explicit consent screen naming the AI companies, shown before the first AI use | Strong (Apple guideline 5.1.2(i)) |
| India's DPDP Act | Build notice, consent, erasure, export, a breach plan and a grievance contact before 13 May 2027 | Strong (official timeline, via press) |
| GDPR and other markets | Treat food and weight logs as health data, get explicit consent, and choose a specific data region | Moderate (contested) |
| AI vendor settings | Paid tiers only, because Gemini's free tier uses content to improve Google's products. Request zero data retention where available. Consider the Mumbai region. | Strong (vendor docs) |

**Redesigns go wrong in predictable ways.**
- **Sonos:** after its 2024 app rewrite, the CEO stepped down and the fix cost **$20–30M** ([Fast Company](https://www.fastcompany.com/91259432/sonos-ceo-steps-down-following-a-disastrous-app-redesign)).
- **Snapchat:** its 2018 redesign caused its first-ever fall in daily users, **from 191M to 188M** ([The Week](https://www.theweek.co.uk/95712/why-have-3-million-users-left-snapchat)).
- **MyFitnessPal:** its 2026 "Today" redesign added taps, hid the diary and removed copy shortcuts. The company offered no way back, calling it "our path forward" ([PiunikaWeb](https://piunikaweb.com/2026/04/24/myfitnesspal-new-update-complaints/)). The release before it reportedly erased meal entries ([mwm.ai](https://mwm.ai/articles/app-updates/myfitnesspal-calorie-counter-v26-15-0-causes-data-loss-and-entry-bugs-april-2026)).
- **Fitbit:** removing step streaks in 2023 caused enough backlash that Fitbit promised to bring them back ([TechRadar](https://www.techradar.com/health-fitness/fitbit-responds-to-furious-fans-with-five-much-needed-app-fixes)).

Redesigns can also land well: "the new interface on Healthify is such a big improvement! It's clean, simple" ([HealthifyMe App Store](https://apps.apple.com/in/app/healthify-ai-calorie-tracker/id943712366)). The failures share four traits: everyone forced over at once, extra taps for the core task, removed features, and lost data.

**Only a remote switch can truly undo a bad redesign.** Google Play's staged rollout can be paused, but "users who already updated stay on that version" ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/6346149)). A feature flag fixes this. It is a remote on/off switch that the app checks when it starts, so the new screens can be turned off from the server even after the update has shipped.

The rollout plan:
- Offer the redesign as opt-in first, with a "switch back" option.
- Carry over history, streaks, goals and custom foods untouched, and check the counts before and after.
- Make sure every common task takes no more taps than today. Voice is added; it does not replace manual search.
- Watch ratings, crashes, freezes and logs per user every day during the rollout.

With 36 users, the cheapest research available is to talk to them. That will also show whether they actually match the lean-gainer persona.

**Delete voice clips after transcription.** The industry norm has settled on processing voice in the cloud without keeping recordings by default:
- Apple doesn't keep Siri or dictation audio unless the user opts in ([Apple](https://www.apple.com/legal/privacy/data/en/ask-siri-dictation)).
- Amazon's "Don't save recordings" option deletes audio after processing ([TechCrunch](https://techcrunch.com/2025/03/15/amazons-echo-will-send-all-voice-recordings-to-the-cloud-starting-march-28)).

What the AI vendors do with STEADY's data:
- **OpenAI:**
  - Its API doesn't train on customer data by default.
  - Abuse-monitoring logs last up to 30 days, but none are listed for the transcription endpoint. Zero data retention needs OpenAI's approval.
  - For India, OpenAI offers in-country *storage* only; processing happens elsewhere ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)).
- **Anthropic:** deletes API data within 30 days by default, and offers zero retention by arrangement ([Claude docs](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention)).
- **Google Gemini:** content sent on the free tier *is* used to improve Google's products, so user data must never go through it ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)).

**Apple requires explicit consent before any data goes to an outside AI.** Three App Store guidelines apply ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)):
- **5.1.2(i):** apps must disclose sharing personal data with third parties, "including with third-party AI", and "obtain explicit permission before doing so".
- **5.1.3(i):** health data may not be used for advertising.
- **2.5.14:** microphone use needs a clear recording indicator.

**India's DPDP Act sets a firm deadline.** The DPDP Rules were notified on 13 November 2025. **The core obligations (notice, consent, security safeguards, breach reporting and erasure) apply from 13 May 2027.** Penalties run **up to ₹250 crore** ([Deccan Herald](https://www.deccanherald.com/india/centre-notifies-dpdp-rules-implementation-planned-in-phases-spread-over-12-18-months-3798465); [AZB Partners](https://www.azbpartners.com/?p=87799)). The rules on sending data abroad were not checked against the official text, so a lawyer should confirm them.

**Europe's GDPR is less clear-cut.** It treats health data as a special category that needs explicit consent. Whether calorie and weight logs count as health data is disputed ([Chino.io](https://www.chino.io/compliance/gdpr-compliance-health-applications)). The safe assumption is that they do.

**Data region:** Supabase offers a Mumbai region, and warns that broad regions such as "Europe" can deploy outside the intended jurisdiction ([Supabase](https://supabase.com/docs/guides/platform/regions)). The research did not check where STEADY's project currently lives. Moving it may require creating a new project, which is also unverified.

One consent screen can cover several rules at once: Apple's guideline, DPDP notice and consent, and GDPR explicit consent. STEADY's existing rule already applies: never send voice, transcripts or free text to analytics.

**How sure we are:**
- **Strong:** the platform rules, vendor policies and the DPDP timeline.
- **Moderate:** the GDPR treatment of calorie logs, which is contested and based on secondary sources.
- **Moderate:** the rollout lessons. They come from well-documented case studies, not trials.

## The decisions to make now

1. **Reward logging, not targets.** The streak means "logged something today", and the logging ring closes at three entries (meals, snacks or shakes).
2. **Ship three goal-aware rings.** A calorie zone that closes when the user enters it, where going over shows "surplus banked", never red, and celebration stops at a cap. A protein floor. Meals logged.
3. **Make streaks forgiving.** Two automatic grace days a week, a pause option, offline-safe counting, a next-morning window for backfilling, and never a paid restore.
4. **Use daily rings with a weekly verdict.** Adjust targets weekly, explain each change in plain words, cap the step size, and get the user's approval.
5. **Build one entry box where speaking and typing feed the same parser.** Add "Your usual?" cards after seven days, photo for restaurant plates, and barcode or label photo for packaged food.
6. **Log confident results instantly, with undo.** Show a confirm card only when the AI is unsure, when a lot of calories are involved, or when a log lands on another day. Show the assumed portion with 3–4 one-tap chips, and ask one oil/ghee question for Indian cooked food.
7. **Run a Hinglish food-clip bake-off before choosing speech-to-text.** Compare Sarvam Saaras v3, Deepgram Nova-3 Multilingual, gpt-4o-mini-transcribe and an audio-native Gemini. Don't default to gpt-4o-transcribe.
8. **Adopt explicit accuracy targets.**
   - Median error of 20% or less.
   - Near-zero signed bias.
   - Identical inputs always give identical numbers.
   - The correction rate is tracked.
   - Every item gets a source badge.
   - User corrections stay personal until several users agree.
   - Indian dishes are deduplicated.
9. **Replace the eight-step chain.** Use the cache, then one structured AI call, then lookups that run in parallel, then a fallback call. Set a latency budget, track the slowest-1-in-20 (p95) time, and add an offline queue with a unique ID per log.
10. **Make the coach a scheduled in-app voice check-in.**
    - An evening ritual the user opts into, at a time they choose.
    - Skipped if the day is already logged.
    - Memory the user can edit.
    - Target changes only as suggestions.
    - No outbound phone calls in India.
11. **Upgrade Expo SDK to 56 or later and move to development builds.** Ship iOS and Android widgets whose mic button opens a listening screen, plus a Lock Screen ring gauge.
12. **Adopt the visual system.** Charcoal and cream, a colour-blind-safe ring drawn with Skia as the single signature object, and short celebrations tested on a low-end Android phone.
13. **Ship the redesign carefully, with privacy built in.**
    - Ship behind a PostHog feature flag, opt-in first.
    - No more taps than today, and history untouched.
    - An explicit AI consent screen before the first AI use.
    - Delete audio after transcription, and use paid AI tiers only.
    - Be DPDP-ready before 13 May 2027.

## Questions only the founder can answer

1. **Who are the 36 current users?** Are they gainers, losers or maintainers? If most aren't lean gainers, does the redesign serve them or the new persona, and will you interview them before building?
2. **How wide should a gainer's calorie zone be, and where is the cap?** Coaches suggest a surplus of roughly 250–500 kcal/day ([Bony to Beastly](https://bonytobeastly.com/bulking-guide-for-skinny-beginners/)). Above what intake should STEADY stop celebrating?
3. **What is the minimum age, and the safety stance?** A UCSF researcher estimates about a third of US teenage boys are trying to bulk up, and muscle dysmorphia carries real risks ([NPR](https://www.npr.org/2026/01/14/nx-s1-5671789/bigorexia-dysmorphia-eating-disorder-boys)). Will STEADY allow under-18s? Will a hide-numbers mode ship at launch?
4. **How often may STEADY be wrong without asking?** This sets the confidence level for auto-logging versus showing a confirm card.
5. **Is the real phone call core to the brand?** Is "AI phones you" worth about $9 per user per month plus telecom registration, or does an in-app ritual capture the wow? If calls happen at all, which market goes first?
6. **What is the monthly AI budget before revenue arrives?** Should there be a hard daily cap per user? When does monetisation start, given v1 has none?
7. **Is now the time to leave Expo Go?** Moving to development builds and upgrading the SDK changes the daily workflow and every native module version.
8. **Which markets come after India, and in what order?** This decides which food-database licences to buy (for example, FatSecret's per-market pricing) and which speech vendors to test.
9. **Should STEADY publish an accuracy claim?** If so, which one (e.g., "median error under 20%"), and on what public test set?
10. **Should the Supabase project move to Mumbai, if it isn't there already?** This may mean migrating to a new project.
11. **Should scanned Indian products go back to Open Food Facts?** That would put that data under a share-alike licence.
12. **What is the coach's personality?** One warm default only, or also an opt-in tough-love mode?
13. **How central is photo logging?** Should it stay an equal input, or become a tool mainly for restaurant plates and nutrition labels?

## Conclusion

The gainer persona quietly overturns three industry defaults at once:
- **Effort that discourages eating** turns from a feature into a harm.
- **Going over target** turns from failure into success.
- **Which way the AI's error leans** stops being a cosmetic flaw. For a gainer, over-counting is the harmful direction: the app says they ate enough while the real surplus never happened, so the scale won't move. Rivals tend to under-count, but STEADY's numbers currently run high.

That makes STEADY's real differentiation structural: goal-aware meaning, honest sources and correcting known bias. A darker colour scheme is not enough. The same logic changes what "fast" means. The fastest log is the one the user doesn't have to describe. The repetition data suggests a well-timed "your usual" card at breakfast could beat any voice model on speed, which makes voice the wow for new meals and history the workhorse for the rest. Likewise, the wow of an AI phone call is really about ritual and accountability, which the HealthifyMe data ties to how often people log. An in-app evening check-in captures that mechanism at a tiny fraction of the cost, with none of the telecom risk.

The most valuable research left is STEADY's own, because the published evidence runs out exactly where STEADY differs from everyone else: Indian food, Hinglish speech, and people trying to gain. Four measurements will answer more of the open questions than further desk research:
1. A Hinglish food-clip speech bake-off.
2. Signed-bias tracking in the eval harness.
3. Tap counts for every core task, before and after the redesign.
4. Five conversations with current users.
