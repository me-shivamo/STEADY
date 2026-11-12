# Accuracy of AI Nutrition Estimation & Global Food Data Sources (researched 2026-10-27)

> Context for the report writer: STEADY's held-out internal eval (dataset-v4, Aug 2026) puts ~65% of items within tolerance, with ~24% median calorie error. The architecture: an LLM parses foods and portions, and numbers come from cache → USDA FDC → INDB/IFCT → AI estimate (last resort). "Search-snippet" marks figures taken from search-result summaries where the primary page could not be fetched (PMC/PubMed blocked direct fetches); everything else was read from the cited page.

## 1. How accurate is AI food estimation, and how does it compare with dietitians, labels and manual logging?

### Takeaway
Text-based LLM estimation reaches about two-thirds of items within tolerance at the published state of the art (NutriBench: GPT-4o + CoT, 66.8% within ±7.5 g carbs). That is equal to or better than professional nutritionists working without lookup tools (42.5%). Photo-only estimation is clearly worse: ~36% MAPE for energy from GPT-4o/Claude 3.5, and commercial photo apps (MyFitnessPal, Lose It, Cal AI, Appediet) **under-count by 250–345 kcal per meal** in an NIH test. STEADY's ~65% / 24% median error sits at the text SOTA, and the "ground truth" it competes with is itself noisy: label calories may legally be up to +20% and self-report under-states intake by 25% or more for many people.

### Cited Findings
**NutriBench (text meal descriptions → carbohydrate grams)**
- 11,857 human-verified meal descriptions from 11 countries (US WWEIA plus 10 FAO/WHO GIFT countries); 12 LLMs tested under Base, CoT, RAG and RAG+CoT prompting; published at ICLR 2025 — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Best: GPT-4o + CoT, **66.82% Acc@7.5 g**, 99.16% answer rate, MAE 8.61 g. Best open model: Llama 3.1-405B-FP8 + RAG+CoT, 59.89%. The 12-model average was 43.24% (Base) and 47.46% (CoT) — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Fine-tuning Gemma2-27B raised accuracy from 45.61% to **61.71%** (MAE 9.57 g, 100% answer rate) — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Humans: 3 professional nutritionists on 72 US meals scored **42.45%** without lookup. With lookup, one nutritionist scored 59.72%. GPT-4o + CoT scored 60.56% on the same 72. Nutritionists took ~43 min for the set; GPT-4o-mini took ~2 min — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Type-1 diabetes simulation (44,800 runs): GPT-4o CoT carb estimates gave 69.88% time-in-range and 4.18% time-below-range. The 3 nutritionists scored 65.93–66.97% and 6.76–8.79% — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Abstract wording differs by version. v1 says LLMs are "comparable" to nutritionists; v2 says "more accurate and faster" — [v1](https://arxiv.org/html/2407.12843v1); [v2](https://arxiv.org/html/2407.12843v2)

**General LLMs on food photos and descriptions (peer-reviewed)**
- Fridolfsson et al., *Current Developments in Nutrition* 9(10):107556 (2025): 52 standardized photos (16 single components, 36 meals; small, medium and large portions). References were weighed and analysed in Dietist NET. ChatGPT-4o and Claude 3.5 Sonnet had weight MAPE of **36.3% / 37.3%** and energy MAPE of ~**35.8%**, with correlations of 0.65–0.81. Gemini 1.5 Pro had MAPE of 64.2–109.9% (r 0.58–0.73). **All models under-estimated, more so as portions grew** (bias slopes −0.23 to −0.50). The authors call these models comparable to traditional self-report but "not yet suitable for precise dietary assessment in clinical or athletic populations" — [Europe PMC record / PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- Zagaroli et al., *Diabetes, Obesity & Metabolism* 28(7):5627–5636 (2026): 124 meals; reference carbs from 2 paediatric diabetologists and 1 nutritionist using USDA FDC and Italian CREA tables. Clinician median was 30.32 g. ChatGPT 30.75 g, Gemini 30.40 g, DeepSeek 29.75 g, Claude 29.25 g. **Only ChatGPT met ±5% equivalence**; Gemini and DeepSeek met ±10%; Claude had the largest negative bias and widest dispersion. Most models under-estimated. Model versions are not stated in the abstract — [PubMed 41969183](https://pubmed.ncbi.nlm.nih.gov/41969183/)
- Qiu, Lo et al., IEEE JBHI 28(12) (2024): GPT-4V detected food with up to 87.5% accuracy under challenging conditions and used nearby objects as scale references — [arXiv 2312.08592](https://arxiv.org/abs/2312.08592). A 2025 review cites the published version as GPT-4V weight MAE **46.3 g vs dietitians 48.5 g**; the preprint reported 54.6 g vs 43.6 g for humans. The versions conflict — [arXiv 2312.08592](https://arxiv.org/abs/2312.08592); [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- Taiwan "Diabot-GPT-4o" study against weighed food records: plain GPT-4o recognised 74% of items from images alone; energy was roughly within ±10–20%; fat and protein were less consistent (search-snippet) — [UMN Experts](https://experts.umn.edu/en/publications/customized-multimodal-diabot-gpt-4o-enhances-accuracy-of-image-ba/)
- Cureus poster testing GPT-5.2, Gemini and Claude: no significant mean bias, but wide Bland-Altman limits of agreement for kcal and large per-meal variability (search-snippet) — [Cureus poster 3217](https://www.cureus.com/posters/3217-validity-and-reliability-of-photo-based-ai-estimates-of-meal-calories-and-macronutrients)
- Ready-to-eat meal box labels: 4 dietitians were consistent (CV < 15%) except for fat, saturated fat and sodium. 5 chatbots reached 70–90% accuracy on kcal and macros and all under-estimated sodium (search-snippet) — [PMC12526241](https://pmc.ncbi.nlm.nih.gov/articles/PMC12526241/)

**Commercial apps (independent test)**
- NIH/NIDDK (Hengist, Charles), presented at NUTRITION 2026 (ASN, 25 July 2026) and not yet peer-reviewed. MyFitnessPal, LoseIt!, CalAI and Appediet were tested on 102 metabolic-kitchen meals with ingredients weighed to 0.1 g. They **under-estimated by ~250–345 kcal per meal** and fat by ~30 g. Carbs were the most consistent. MFP and LoseIt were better on higher-calorie meals. A follow-up on more than 200 meals found worse under-counting on high-fat keto meals. Photos were used without manual portion adjustment — [ScienceDaily](https://sciencedaily.com/releases/2026/07/260726015237.htm); [HealthDay](https://www.healthday.com/health-news/nutrition/how-accurate-are-photo-based-calorie-apps-4-are-put-to-the-test)
- Media summary of the same study: the apps "missed about a third" of meal energy — [Epocrates](https://www.epocrates.com/online/article/ai-calorie-counting-apps-miss-a-third-of-meal-calories)
- University of Sydney (Chen et al., *Nutrients*, 2024) screened 800 apps and evaluated 18 AI-integrated and manual logging apps. It found "large discrepancies" in AI energy estimation and warned that inaccuracies "may potentially be unsafe" — [Nutrition Insight](https://nutritioninsight.com/news/ai-overhaul-food-tracking-apps-need-further-development-study-finds.html)

**Vendor claims (unverified)**
- SnapCalorie (vendor): "average expected error for a 500 calorie dish is ±80 calories on an iPhone Pro and ±130 on a regular iPhone" (~16% and ~26%), based on the company's own Nutrition5k data (5,000 weighed dishes) — [App Store](https://apps.apple.com/us/app/-/id1574239307)
- SnapCalorie co-founder (vendor): human reviewers reduce caloric error "to under 20%" — [TechCrunch](https://techcrunch.com/?p=2561037)
- Lose It CEO (vendor): Snap It accuracy is "87.3% up to 97.1%". These are food-recognition benchmarks on Food-101, not calorie accuracy — [MobiHealthNews](https://mobihealthnews.com/node/139446)
- A blog test reported Snap It food ID at 67.3% and portion error of ±23%, with no clear method (low reliability) — [calorie-trackers.com](https://calorie-trackers.com/reviews/lose-it/)

**Human, label and self-report baselines**
- US FDA lets packaged-food calories exceed the label by up to 20%. Urban et al. (J Am Diet Assoc, 2010) found 29 restaurant meals averaged +18% over stated calories and 10 frozen meals +8% — [FoodNavigator-USA](https://www.foodnavigator-usa.com/Article/2010/01/06/Low-calorie-foods-could-contain-more-energy-than-labels-state/); [Tufts Daily](https://www.tuftsdaily.com/article/2010/03/tufts-studys-findings-motivates-congressman-to-take-action)
- Urban et al. (JAMA, 2011) bomb-calorimetered 269 items from 42 restaurants. The mean was within 10 kcal/portion of stated values (n.s.), but **19% of items were ≥100 kcal over**. Lower-calorie items tended to contain more energy than stated — [PubMed 21771989](https://pubmed.ncbi.nlm.nih.gov/21771989/); [ScienceDaily](https://www.sciencedaily.com/releases/2011/07/110719161538.htm)
- Against doubly labelled water, more than one-third of people may under-report energy intake by more than 25%. Under-reporting was ~41% in obese vs ~19% in non-obese adolescents. A 2025 study of older adults with overweight found 50% under-reporting — [PMC12538426](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12538426/); [PMC12034172](https://pmc.ncbi.nlm.nih.gov/articles/PMC12034172)
- Licensed Japanese dietitians estimating from meal photos were 85% (SD 10) accurate for calories and 78% (SD 17) for protein, with significant variation between dietitians — [Fujita Health Univ.](https://pure.fujita-hu.ac.jp/en/publications/estimation-of-dietary-nutritional-content-using-an-online-system-/)

### Inferences
- STEADY's ~65% within-tolerance on held-out data matches NutriBench's best text result (66.8%), though the tolerance definitions differ. Its 24% median calorie error is better than photo-only LLMs (~36% MAPE) but above the ±20% label tolerance. A defensible public target: "median error ≤ 20% (inside food-label tolerance), better than a dietitian without tools".
- Every independent photo study finds **systematic under-estimation**, worst for fat and large portions. STEADY should measure *signed* bias, not just absolute error, and should consider a fat/oil correction for restaurant and Indian cooked dishes.
- The NutriBench fine-tuning result (+16 points on a 27B model) suggests a tuned small model could approach frontier parsing accuracy at much lower cost and latency.

### Gaps
- No independent, per-app accuracy numbers for MyFitnessPal Meal Scan or Lose It Snap It alone; the NIH abstract does not break results down by app.
- No NutriBench-style results yet for 2026 frontier models (GPT-6.x, Gemini 3.8/4, Claude 5.x). Published comparisons use GPT-4o, Claude 3.5 and Gemini 1.5-era models and may not transfer.
- No India-specific LLM accuracy benchmark found (NutriBench includes only 18 Indian meals).

## 2. Where does error come from: food identification, portion size, or database values?

### Takeaway
Portion size is the dominant and most consistent error source. Giving models the true weight cuts error substantially, under-estimation grows with portion size, and natural-unit portions ("a bowl") are harder than grams. Recognition is fairly good for common foods (74–88%) but drops for unfamiliar regional dishes. Database values add a smaller error for macros (≈±5% per food) that can compound to ~27% at daily level for cooked Indian foods, and hidden fats (oil, sauces) drive the systematic under-count.

### Cited Findings
- Providing the ground-truth food weight to GPT-4.1 and other models "substantially" reduced nutrient error (BCB '25; search-snippet) — [ODU Digital Commons](https://digitalcommons.odu.edu/computerscience_fac_pubs/417)
- All 3 LLMs under-estimated, with the bias increasing with portion size (slopes −0.23 to −0.50) — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- In NutriBench, most models had higher error for natural serving descriptions than for metric ones. GPT-4o/4o-mini did better with metric portions — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Adding a geometry-based portion head to flagship MLLMs (Gemini, GPT, Claude) cut per-food portion error by **33–41%** versus the MLLM alone, on 3 real-world benchmarks, without depth sensors — [arXiv 2607.16514](https://arxiv.org/abs/2607.16514). A search-snippet summary of the same paper (not confirmed in the abstract) reports recognition coverage of 87% (Nutrition5k), 88% (NV-Real) and 64% (FPB), with the FPB gap attributed to unfamiliar regional dishes — [arXiv 2607.16514](https://arxiv.org/abs/2607.16514)
- Recognition: GPT-4V detected food up to 87.5% of the time, and a cuisine hint ("African cuisine") shifted recognition to the correct regional dishes (banku, ugali) — [arXiv 2312.08592](https://arxiv.org/abs/2312.08592). GPT-4o recognised 74% of items from images (search-snippet) — [UMN Experts](https://experts.umn.edu/en/publications/customized-multimodal-diabot-gpt-4o-enhances-accuracy-of-image-ba/)
- Contextual metadata (GPS → venue type, timestamp → meal type) significantly reduced MAE and MAPE for calories, macros and portion size across 8 multimodal models (ACETADA dataset) — [arXiv 2507.07048](https://arxiv.org/abs/2507.07048)
- Depth data "greatly improve[s] portion size predictions" in Nutrition5k — [Nutrition5k, arXiv 2103.03375](https://arxiv.org/pdf/2103.03375). SnapCalorie's own claim of ±80 kcal with LiDAR vs ±130 kcal without fits this (vendor) — [App Store](https://apps.apple.com/us/app/-/id1574239307)
- Humans also struggle with portions. Only 42% of portion estimates from photos were correct in a Danish lunch study (range 19–77%), and larger portions were harder (search-snippet) — [DTU Orbit](https://orbit.dtu.dk/en/publications/accuracy-of-food-photographs-for-quantifying-food-servings-in-a-l/). Text-based portion aids were more accurate than image-based ones in a Dutch study of 40 people — [WUR](https://research.wur.nl/en/publications/the-accuracy-of-portion-size-estimation-using-food-images-and-tex/)
- Database error: an Indian study of cooked foods found Indian table values for macros within ±5% of lab analysis, but error rose to ~27% at daily-intake level. Micronutrient agreement was poor — [APJCN](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- Macronutrients are fairly consistent across national databases, while micronutrients (vitamins A and C, calcium, iron) differ much more — [Measurement Toolkit](https://measurement-toolkit.org/diet/introduction/food-composition)
- Natural biological variability sets a floor on database accuracy — [National Academies](https://nap.nationalacademies.org/read/618/chapter/9)
- Fat is the macro most under-counted by apps (~30 g per meal), especially in high-fat meals — [ScienceDaily](https://sciencedaily.com/releases/2026/07/260726015237.htm)

### Inferences
- For STEADY's text/voice-first flow, the biggest lever is **portion resolution**: mapping "1 katori dal" or "2 rotis" to grams with an India-specific gram table, then asking one clarifying question only when portion uncertainty is high. This is consistent with STEADY's existing "portions correct gram weights" design.
- Passing context (cuisine/locale, meal time, home vs restaurant) to the model is a cheap, evidence-backed accuracy gain.
- Decomposing STEADY's own eval errors into recognition, portion and database components would show which lever matters most; no published split exists for Indian food.

### Gaps
- No published study quantifies the share of total calorie error from identification vs portion vs database for mixed real-world meals, and none for Indian cuisine.
- Could not read the full text of arXiv 2607.16514 to confirm the per-benchmark recognition figures.

## 3. What accuracy do users consider trustworthy, and does showing sources or confidence help?

### Takeaway
Evidence is thin. No study defines a numeric "trustworthy" accuracy threshold for calorie apps. What exists suggests users value fast multiple input modes, and that they edit about 1 in 5 AI logs. Experts and researchers now publicly warn that photo apps under-count, so credibility depends on admitting uncertainty. Disclosure of AI use is broadly expected.

### Cited Findings
- SnappyMeal (multimodal AI logging app, 3-week in-the-wild deployment): of 502 logs, **20.7% were edited and 5.8% deleted**. Users "strongly praised the multiple available input methods" and reported strong perceived accuracy. Follow-up questions added friction and did not make logging easier than traditional methods — [arXiv 2511.03907](https://arxiv.org/html/2511.03907v1)
- In a 160-participant calorie-estimation task with an AI agent, an agent that explicitly acknowledged honesty drew higher subjective trust than agents that were transparent about process or fair about biases (preliminary) — [IOS Press FAIA230121](https://ebooks.iospress.nl/volumearticle/63369); [TU Delft](https://research.tudelft.nl/en/publications/building-appropriate-trust-in-ai-the-significance-of-integrity-ce/)
- Purdue Consumer Food Insights (Aug 2025, ~1,200 US consumers): most support AI in food and agriculture, and almost two-thirds say disclosure of AI use is very or extremely important — [Purdue](https://ag.purdue.edu/news/2025/09/consumers-mostly-support-ai-tools-to-improve-food-and-agriculture.html)
- The NIH lead researcher advised users to "assume actual intake may be higher" than photo apps report, a public credibility hit for AI photo logging — [ScienceDaily](https://sciencedaily.com/releases/2026/07/260726015237.htm)
- Of 80 food-tracking apps reviewed, 78 (97.5%) scored below average on automation, and transparency was rated only "acceptable" — [arXiv 2208.02490](https://arxiv.org/pdf/2208.02490)
- A PR-commissioned survey (1,040 US/UK consumers, Oct 2024) found that 62% of supplement users would let AI analyse their dietary needs, but they expect disclosure of AI use (low rigour) — [Ingredient Communications press release](https://cdn.uc.assets.prezly.com/95fb60bc-c09d-4850-9769-58e3c87c0b4f/-/inline/no/PRESS%20RELEASE%20-%20Trust%20in%20AI%20is%20highest%20among%20supplement%20users%20new%20research%20finds.pdf)
- Founder anecdotes say users like photo logging but distrust estimates for messy meals (anecdotal) — [Indie Hackers](https://www.indiehackers.com/post/what-users-hated-about-calai-while-testing-an-ai-nutrition-tracker-62a373b84d)

### Inferences
- A ~20% edit rate is a useful benchmark for STEADY's own "correction rate" metric. Fewer edits, without a drop in accuracy, is a proxy for trust.
- Showing the data source ("USDA", "IFCT 2017", "AI estimate") and flagging low-confidence items honestly fits the integrity finding and differentiates STEADY from photo apps now publicly shown to under-count. This has not been tested in a calorie-app RCT.
- Clarifying questions must be rare and adaptive. SnappyMeal shows they add friction, which conflicts with a "speed" promise.

### Gaps
- No peer-reviewed study on whether showing confidence ranges or data sources changes trust or retention in calorie apps.
- No research on the error level users find acceptable (e.g., ±10% vs ±20%).

## 4. Which food databases are available worldwide, and what are their licences, costs, limits and coverage?

### Takeaway
USDA FoodData Central (public domain, 1,000 req/hr) and Open Food Facts (ODbL, ~4M products but thin outside Europe; ~10K Indian products) are the only free global-scale options. Commercial APIs (FatSecret: 62+ countries; Nutritionix: US-heavy; Passio; Edamam) cover branded and restaurant food but price per market or on request. National tables are authoritative but small (1.5K–6K foods each), mostly free to download, and vary in commercial-use terms.

### Cited Findings
**USDA FoodData Central**
- Public domain (CC0 1.0); attribution requested. The API needs a data.gov key and allows 1,000 requests/hour/IP (DEMO_KEY: 30/hr, 50/day); exceeding this blocks the key for 1 hour; higher limits on request. Data types: Foundation, SR Legacy, FNDDS (Survey), Experimental and Branded (from the USDA Global Branded Foods Database) — [FDC API Guide](http://fdc.nal.usda.gov/api-guide/)

**Open Food Facts**
- Licence: ODbL for the database, DbCL for contents, CC BY-SA for images. The docs say "there are no assurances that the data is accurate, complete, or reliable." Rate limits: 15 product reads/min/IP, 10 searches/min/IP ("don't use for search-as-you-type"); limits apply per user when a mobile app calls directly; a custom User-Agent is required — [OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- Size: ~3.5M products at end-2024 (+500K in 2024) — [OFF Collective Achievements 2024](https://blog.openfoodfacts.org/?p=6344); ~4M products across ~180 countries by May 2025 — [OFF webinar deck](https://blog.openfoodfacts.org/wp-content/uploads/2025/05/Webinar-Open-Food-Facts-Science.pdf); [Wikipedia](https://en.wikipedia.org/wiki/Open_Food_Facts)
- India: crossed 10,000 products in Sept 2024, 4,000 of them added that year — [OFF blog](https://blog.openfoodfacts.org/en/news/open-food-facts-india-database-reaches-10k-product-milestone). The Nov 2024 India dashboard estimates ~90,000 products sold in India; only 2% of Indian products have a Nutri-Score — [OFF wiki India dashboard](https://wiki.openfoodfacts.org/Dashboard/India)

**FatSecret Platform API**
- Basic: free, 5,000 calls/day, US data only, attribution required. Premier Free: startups (<US$1M revenue and <US$1M raised), non-profits and students; unlimited calls; US data (other regions discounted); attribution required. Premier: priced on request "based on the number of markets"; 62+ country datasets; 26 languages; white-label. Image recognition and NLP are add-ons billed in tiers of 25,000 inputs per market (50% off for startups). FatSecret claims 90%+ global UPC/EAN coverage and "100% verified" items (vendor claims) — [FatSecret editions](https://platform.fatsecret.com/api-editions)

**Nutritionix (owned by Syndigo since 2018)**
- Vendor claim: 975,000+ grocery products, 192,000+ restaurant menu items and 38,000+ generic foods, described as "dietitian-verified" — [Syndigo](https://syndigo.com/fr/blog/nutritionix-datasets-databricks-marketplace/). An older page cites 800+ restaurant brands — [Syndigo](https://syndigo.com/?p=71923). Pricing is not public (pricing page returned HTTP 402) — [Nutritionix business](https://www.nutritionix.com/business)

**Edamam**
- Third-party listings conflict: Enterprise Basic $14/mo (100K calls), Core $69/mo, Plus $299/mo (5M calls) per one source; Core at $49/mo in a 2022 blog — [APIs.io](https://apis.io/plans/edamam/edamam-plans-pricing/); [1stwebdesigner](https://1stwebdesigner.com/?p=158134). An official legacy product page is marked retired — [Edamam](https://developer.edamam.com/nutrition-data-API)

**Passio Nutrition-AI**
- Token pricing: 10M tokens at $2.50/M (entry), 150M at $2.00/M, 2,000M at $1.50/M; overage $2.50/M. Photo cost is stated as 5K tokens on one page and 20–30K on the FAQ (conflict). 3.5M+ foods; SDK and REST; food recognition, barcode and label OCR — [Passio Nutrition AI](https://www.passio.ai/nutrition-ai); [Passio FAQ](https://passio.ai/faq)

**Curated consumer-app databases (for comparison)**
- MacroFactor: 1.36M+ verified items. Branded coverage is strong in the Anglosphere and "hit-or-miss elsewhere". Barcode coverage is excellent in the US, CA, UK, AU, IE, NZ, JP, FR and ES; India is not listed. Restaurant items are weaker — [MacroFactor help](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region)
- HealthifyMe (India) claims 20,000+ dishes with katori and bowl units (vendor claim, closed database without documented methodology) — [HealthifyMe blog](https://www.healthifyme.com:443/blog/calculate-calorie-intake-indian-foods); [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795)

**National databases**
- India INDB: 1,095 individual foods plus 1,014 commonly consumed recipes, built mainly from ICMR-NIN IFCT 2017 with gaps filled from IFCT 2004 and UK/US databases. Described as open-access in the paper, but the redistribution licence is unclear — [INDB paper, PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795)
- India IFCT 2017: reported as 586 foods (secondary news source; verify against ICMR-NIN) — [IASVN](https://iasvn.org/en/tin-tuc/India-releases-the-world’s-most-advanced-and-comprehensive-analytical-database-of-national-food-nutritional-composition-5300.html)
- UK CoFID (McCance & Widdowson): free Excel download on GOV.UK; API key on request from Quadram FN-NBRI. The separate Food Labelling dataset/API is CC BY-NC-SA 4.0, so commercial use needs permission — [FN-NBRI data](https://fnnbri.quadram.ac.uk/data/); [CoFID FAQ](https://fnnbri.quadram.ac.uk/?p=34)
- Canada CNF 2015: ~5,690 foods with up to 152 nutrients; CSV, Excel and Access downloads; Crown copyright, usable without further permission if Health Canada is credited — [Health Canada CNF download](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-2015-download-files.html); [CNF copyright](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/copyright-guidelines-canadian-nutrient-file.html)
- Australia AFCD Release 3 (Dec 2025): 1,588 foods; ≥58 core nutrients and up to 268 in total; replaces NUTTAB. The separate AUSNUT 2011–13 survey database has 5,740 foods — [FSANZ AFCD](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/about-afcd); [AFCD Release 3 PDF](https://www.foodstandards.gov.au/sites/default/files/2025-12/About%20the%20Australian%20Food%20Composition%20Database%20-%20Release%203.pdf)
- Japan MEXT Standard Tables 2020 (8th revised edition): 2,478 foods (+287 vs 2015); expanded prepared-food data; enlarged 2023 update — [MEXT PDF](https://www.mext.go.jp/content/20201225-mxt_kagsei-mext_01110_011.pdf); [ChemLinked](https://food.chemlinked.com/news/food-news/japan-updates-food-composition-standard-tables)
- Brazil TBCA (USP/FoRC): 6,182 foods and ingredients — [Agência FAPESP](https://agencia.fapesp.br/tabela-brasileira-de-composicao-de-alimentos-se-transforma-em-ecossistema-digital-de-pesquisa/59305). TACO (UNICAMP) has ~500 foods — [Revista Pesquisa FAPESP](https://revistapesquisa.fapesp.br/mesa-a-brasileira/)
- China Food Composition Table, Standard Edition 6, Release 1 (2018) is listed by FAO INFOODS; food count not found — [FAO INFOODS China](https://www.fao.org/infoods/infoods/tables-and-databases/china/en/)
- EuroFIR FoodEXplorer: searches ~26–40 national datasets (counts vary by page); membership required; publishing data needs national licence terms and written EuroFIR approval 28 days ahead — [EuroFIR FoodEXplorer](https://www.eurofir.org/our-tools/foodexplorer/); [EuroFIR access](https://www.eurofir.org/food-information/how-to-access-fcdbs/)

### Inferences
- A practical global stack would be: USDA FDC (generic) + national tables per launch market (IFCT/INDB for India, CoFID UK, CNF, AFCD, MEXT, TBCA) + OFF for barcodes where it is dense (EU) + a paid branded/restaurant API (FatSecret Premier is the only one with documented 62-country coverage) for markets where OFF is thin.
- OFF's 10 searches/min/IP limit makes it unsuitable for live search from a backend IP. Use the bulk data dump and a local index instead.
- FatSecret Premier Free (US-only) fits STEADY's startup size but not its India-first market. Indian data would require paid Premier pricing.

### Gaps
- No current public pricing for Nutritionix, FatSecret Premier or Passio enterprise; Edamam's official prices were not reachable.
- No official INDB redistribution licence found; IFCT 2017 food count rests on a secondary source.
- China's 6th-edition food count and licence were not found.
- No independent audit of FatSecret's "90%+ barcode coverage" claim, by country.

## 5. How available is restaurant nutrition data, and how do apps handle non-chain restaurants?

### Takeaway
Chain calorie data exists by law in the US (20+ locations), UK (250+ employees, since April 2022) and India (10+ outlets or a central licence, since 2022), but "reasonable basis" accuracy rules are loose (19% of US items were ≥100 kcal over). Nutritionix aggregates ~192K US-centric menu items. For independent restaurants, which make up most Indian eating out, there is no data source. Apps fall back to decomposing the dish into ingredients and padding for oil and portion size.

### Cited Findings
- US FDA menu labelling covers chains with 20+ locations under the same name; FDA estimated 1,640 chains and 278,600 locations. It requires a "reasonable basis" (databases, lab analysis, cookbooks, calculations) and substantiation on request. Compliance date: Dec 1, 2015 — [Mondaq](https://mondaq.com/unitedstates/food-and-drugs-law/402226/menu-labeling-the-fdas-final-rules-and-guidance); [FSR Magazine](https://www.fsrmagazine.com/industry-news/making-sense-fda-s-menu-labeling-rule/)
- Restaurant label accuracy: mean within 10 kcal, but 19% of items ≥100 kcal over stated (JAMA 2011); no FDA limit on restaurant over-statement — [PubMed 21771989](https://pubmed.ncbi.nlm.nih.gov/21771989/); [Tufts Daily](https://www.tuftsdaily.com/article/2010/03/tufts-studys-findings-motivates-congressman-to-take-action)
- England: in force from 6 April 2022 for out-of-home businesses with 250+ employees (franchises included). Calories must be shown at the point of choice, including online menus and delivery platforms — [Action on Salt](https://www.actiononsalt.org.uk/news/news/2021/news-stories/calorie-labelling-on-menus-to-be-introduced-in-cafes-restaurants-and-takeaways-.html); [Reading Food Law](https://www.reading.ac.uk/foodlaw/news/21188.htm). A BMJ Open study of 117 outlets compared compliance before and after implementation — [Cambridge repository](https://www.repository.cam.ac.uk/items/3499e358-5473-45a6-b24d-43c64246fafe)
- India FSSAI: notified 21 Aug 2020, with businesses holding a central licence or 10+ outlets required to show calories per serving and serving size, plus a 2,000 kcal reference statement. Compliance was from 1 Jan 2022, with calorie-verification sampling paused until 30 June 2022. Turnover thresholds for central licence differ between sources (₹25 cr vs ₹50 cr) — [FSSAI Guidance Note, Feb 2022](https://mail.fssai.gov.in/upload/uploadfiles/files/Guidance_Note_Labelling_23_02_2022.pdf); [S.S. Rana](https://ssrana.in/articles/display-calorie-values-menus-fssai/); [Finshots](https://finshots.in/archive/calorie-count-on-your-menus/)
- Nutritionix: 192,000+ restaurant menu items (vendor) and ~800+ brands (older page) — [Syndigo](https://syndigo.com/fr/blog/nutritionix-datasets-databricks-marketplace/)
- MacroFactor: restaurant coverage is weak because "restaurants rarely publish nutrition data" and major chains are only sometimes included — [MacroFactor help](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region)
- MyFitnessPal restaurant logging surfaces nearby chains; independents must supply menus (dated article) — [Vice/Motherboard](https://motherboard.vice.com/en/article/78k9yz/heres-how-myfitness-pal-just-made-dining-out-much-easier-for-dieters)
- Competitor blog advice: decompose into ingredients, log the sauce, assume high oil on glossy dishes, and scale portions up at full-service restaurants. "Grilled chicken salad" can range from 350 to 900 kcal (low-rigour source) — [NutriScan blog](https://nutriscan.app/blog/posts/best-app-restaurant-meal-logging-2026-dbcccb9473)

### Inferences
- In India, chain calorie data (FSSAI-mandated) is published on menus and delivery apps but is not aggregated in any API found. Scraping or partnering (e.g., with delivery platforms) is an open opportunity and a legal question.
- For non-chain restaurant dishes, STEADY should treat "restaurant" as a context flag that raises the oil/fat and portion priors, given the documented under-count of fat.

### Gaps
- No aggregated India chain-menu nutrition dataset or API found; FSSAI compliance rates unknown.
- No current FDA amendment status checked beyond the 2014–2015 sources.

## 6. What problems do crowd-sourced databases have, and how do curated apps avoid them?

### Takeaway
Crowd-sourced databases (MyFitnessPal, Lose It) are fine on average for energy and macros but unreliable for sodium, cholesterol and saturated fat, and duplicates with conflicting values hurt search-based logging. Curated apps (Cronometer, MacroFactor) lean on lab-grade databases and human review of every user submission. No study was found on the specific risk of user corrections propagating to all users.

### Cited Findings
- Evenepoel et al., JMIR 2020: MyFitnessPal vs the Belgian Nubel database (50 participants, 4-day records ×2). Strong correlations for energy, carbohydrates, fat, protein, fibre and sugar; weak for cholesterol and sodium. The app is "accurate for energy, macronutrients, sugar and fiber" but not cholesterol or sodium — [JMIR e18237 via Europe PMC](https://www.jmir.org/2020/10/e18237); [PMC7641788](https://pmc.ncbi.nlm.nih.gov/articles/PMC7641788)
- JMIR mHealth 2024 (836 food codes, 42 items, 5 apps including MyFitnessPal in Chinese and English, plus LoseIt!): 4 apps significantly under-estimated saturated fat, all under-estimated cholesterol, with high variability for beef, chicken and seafood (search-snippet) — [JMIR mHealth 2024 e54509](https://mhealth.jmir.org/2024/1/e54509/PDF)
- Teixeira et al. 2018: MFP tended to under-estimate nutrients "probably due to inadequacies in their database", with good relative validity for energy and fibre (search-snippet) — [Nutrition Evidence summary](https://nutrition-evidence.com/article/363501/accuracy-of-nutrient-calculations-using-the-consumer-focused-online-app-myfitnesspal-validation-study)
- Search-based logging suffers from "countless duplicate products of the same name, sometimes with differing nutrient information and serving sizes" — [Droid-life](https://www.droid-life.com/2022/08/24/myfitnesspal-puts-barcode-scanner-behind-premium-paywall/)
- Cronometer staff say every user-submitted food is reviewed by the curation team, with data from NCCDB, USDA, ESHA, CNF and IFCDB — [Cronometer forums](https://forums.cronometer.com/discussion/comment/16477/)
- MacroFactor: common foods come from licensed research-grade sources and users cannot submit common foods or recipes. User-submitted branded entries are machine-validated and reviewed by the Open Food Facts community, but are not guaranteed to be manually verified — [MacroFactor v2.7.0 notes](https://macrofactorapp.com/version-2-7-0/). Its help centre says user submissions are human-checked before being added publicly — [MacroFactor help](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region)
- Competitor marketing (not independent): Nutrola reports MFP calorie error of 11.3–12.9% vs Cronometer at 3.8%, with numbers inconsistent across posts — [Nutrola](https://nutrola.app/en/blog/calorie-tracker-accuracy-comparison-2026)
- OFF warns there are "no assurances that the data is accurate" — [OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)

### Inferences
- STEADY should keep user corrections **per-user by default** (personal overrides), and promote a correction to the shared cache only after independent agreement from several users or a check against a reference database. This mirrors Cronometer and MacroFactor review gates.
- Never let the user-entered layer override curated generic foods (MacroFactor blocks user submissions of common foods).

### Gaps
- No peer-reviewed study on correction propagation or "poisoning" of shared food databases in consumer apps.
- The claimed 2022 *J Food Composition and Analysis* figure ("27% of crowdsourced entries had >10% macro error") appears only in a competitor blog and could not be verified.

## 7. How much do users rely on barcode scanning, and how good is barcode coverage in India and globally?

### Takeaway
Barcode scanning is considered table stakes. MyFitnessPal's 2022 paywall caused significant backlash and switching. Coverage is strong in North America, Western Europe, Japan and Australasia but weak in India: Open Food Facts had ~10K Indian products versus ~90K sold, and MacroFactor does not list India among well-covered markets. No public data shows what share of logs come from barcodes.

### Cited Findings
- MyFitnessPal moved barcode scanning to Premium effective 1 Oct 2022 (new free accounts blocked from 1 Sept), with Premium at $19.99/mo or $79.99/yr — [Digital Trends](https://digitaltrends.com/phones/myfitnesspal-barcode-scanning-not-free-premium-subscription); [Slashdot/The Verge](https://news.slashdot.org/story/22/08/25/1955238/myfitnesspal-paywalls-barcode-scanner-that-made-counting-calories-easy)
- Backlash: r/loseit users discussed moving to Cronometer, Lose It or Macros. Later Play Store reviews describe switching to Lose It (aggregator source) — [Slashdot](https://news.slashdot.org/story/22/08/25/1955238/myfitnesspal-paywalls-barcode-scanner-that-made-counting-calories-easy); [Kimola](https://kimola.com/reports/myfitnesspal-removes-free-barcode-scanner-feature-140890)
- Barcode scanning is one of the most commonly implemented technologies in commercial diet apps and is claimed to reduce recording burden — [Cambridge Core](https://www.cambridge.org/core/product/89358D29215F914E8B6ED31777FF99FC/core-reader)
- In a Dutch study, MyFitnessPal correctly identified 96% of scanned products and SparkPeople 5%; energy values were available for 99% of scanned products — [WUR](https://research.wur.nl/en/publications/food-identification-by-barcode-scanning-in-the-netherlands-a-qual/)
- India on OFF: 10K products (Sept 2024) vs ~90K estimated on sale; 2% Nutri-Score and 2% NOVA coverage — [OFF blog](https://blog.openfoodfacts.org/en/news/open-food-facts-india-database-reaches-10k-product-milestone); [OFF India dashboard](https://wiki.openfoodfacts.org/Dashboard/India)
- FatSecret claims 90%+ global UPC/EAN coverage (vendor) — [FatSecret](https://platform.fatsecret.com/api-editions)
- MacroFactor rates barcode coverage excellent in the US, CA, UK, AU, IE, NZ, JP, FR and ES; India not listed — [MacroFactor help](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region)

### Inferences
- For India, label OCR (photographing the nutrition panel, which FSSAI mandates on packs) is likely a more reliable fallback than barcode lookup. Contributing scanned products back to OFF (ODbL share-alike) would build coverage, but it would bring STEADY's derived database under share-alike terms.
- Keeping barcode scanning free is a cheap differentiator, given the MFP backlash.

### Gaps
- No public data on the share of logs that come from barcode scans in any app.
- No 2025–2026 OFF India product count (the live API returned 503); no GS1 India data found.

## 8. Which models should parse food text and photos (Oct 2026), and what are the latency/cost trade-offs?

### Takeaway
All three labs now offer cheap fast tiers at $0.05–$0.30 per million input tokens (GPT-5-nano / gpt-6-luna, Gemini Flash-Lite, Claude Haiku 5.5), with frontier models at $2–$10 input. Published food benchmarks cover only 2024–25 models, where GPT-4o and Claude 3.5 were roughly tied on photos and well ahead of Gemini 1.5. Accuracy therefore needs to come from STEADY's own held-out eval. Note that Gemini Flash prices double on 1 Jan 2027.

### Cited Findings
**Current pricing (USD per 1M tokens, standard tier; pages read 2026-10-27)**
- OpenAI: gpt-6-astra $10 / $50 (input/output); gpt-6.1-sol $2 / $10; gpt-6.1-terra $1 / $5; **gpt-6-luna $0.10 / $0.50**; gpt-5.6-luna $0.20 / $1.20; gpt-5.4-mini $0.75 / $4.50; gpt-5.4-nano $0.20 / $1.25; gpt-5-nano $0.05 / $0.40; gpt-4o-mini $0.15 / $0.60. Batch and Flex are ~50% off. "Priority" was renamed "Fast mode" on 30 July 2026 at ~2× price. Regional data-residency endpoints carry a +10% uplift for models released after 5 March 2026 — [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- Anthropic: Claude Fable 5.1 $10 / $50; Claude Opus 5.5 $4 / $20; Claude Sonnet 5.5 $2 / $10 ("best combination of speed and intelligence"); **Claude Haiku 5.5 from $0.10 / $0.50** ("fastest… for high-volume, latency-sensitive tasks such as classification, extraction"). All have vision, 1M context and a June 2026 knowledge cutoff. Batch is 50% off; cache reads cost 5–10% of input — [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- Google (page updated 2026-10-26): Gemini 4 Argon $2 / $10, rising to $4 / $20 on 1 Dec 2026; Gemini 3.8 Flash $0.75 / $3.75, rising to $1.50 / $7.50 on 1 Jan 2027; Gemini 3.5 Flash-Lite $0.30 / $2.50; Gemini 3.1 Flash-Lite $0.25 / $1.50; Gemini 2.5 Flash-Lite $0.10 / $0.40; Gemini 3.1 Pro still in Preview ($2 / $12). Most Flash and Flash-Lite models have a free tier; batch is 50% off. Live audio model gemini-3.8-live is $0.75 text input / $3.00 audio input — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Model accuracy evidence (older generations)**
- On photos, GPT-4o ≈ Claude 3.5 Sonnet (~36–37% MAPE), both far better than Gemini 1.5 Pro (64–110%) — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- Carb counting (2026 paper, versions unstated): ChatGPT best (±5% equivalence), Gemini and DeepSeek at ±10%, Claude the most negatively biased — [PubMed 41969183](https://pubmed.ncbi.nlm.nih.gov/41969183/)
- NutriBench: GPT-4o CoT 66.8% vs GPT-4o-mini lower. CoT helped on average (+4 points across 12 models). RAG helped metric queries but CoT alone beat RAG+CoT for natural-portion queries — [NutriBench arXiv v6](https://arxiv.org/html/2407.12843v6)
- Structured extraction: LLMStructBench (Feb 2026, 22 models) found prompting strategy matters more than model size for structured-data extraction — [arXiv 2602.14743](https://arxiv.org/abs/2602.14743v1). JSONSchemaBench measured constrained-decoding time-to-first-token of ~0.1–0.3 s for lighter frameworks vs 3–4 s for Outlines (open-weight setups) — [arXiv 2501.10868](https://arxiv.org/pdf/2501.10868)
- Blog claim (low rigour): cheap Flash-class models handle 90%+ of simple extractions; flagship models reach 99%+ on simple-to-medium schemas — [CallSphere, May 2026](https://callsphere.ai/blog/llm-comparison-structured-data-extraction-lowest-latency-may-2026)

### Inferences
- Illustrative cost: a text parse of ~1,500 input + 300 output tokens costs ~$0.0003 on a $0.10/$0.50 model (Haiku 5.5, gpt-6-luna) vs ~$0.006 on a $2/$10 model (Sonnet 5.5, gpt-6.1-sol). Routing 80–90% of logs to the fast tier keeps cost per user per month in cents.
- Recommended pattern: a fast-tier model parses everything into structured output (items, grams, confidence). Low-confidence items, photos of mixed dishes and restaurant meals escalate to a frontier model. Numbers still come from databases, not the LLM.
- Gemini's announced 2× price rises (Dec 2026 / Jan 2027) and OpenAI's +10% regional surcharge argue for keeping the parser provider-agnostic (STEADY already uses OpenRouter in evals) and re-running the held-out eval when switching.
- GPT-4o (STEADY's current photo model per CLAUDE.md) did not appear in the OpenAI pricing extract (only gpt-4o-mini did). Its availability and price should be verified before the redesign.

### Gaps
- No food or nutrition benchmark results for any 2026 model (GPT-6.x, Claude 5.5, Gemini 3.8/4).
- No vendor-neutral latency (TTFT) measurements for current fast tiers on structured extraction or vision; this needs in-house measurement.
- Claude Haiku 5.5's "from" pricing implies tiers; the conditions were not read from the full pricing page.
