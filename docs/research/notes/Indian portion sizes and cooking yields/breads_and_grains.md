# Indian breads and grain dishes: measured portion weights and cooking yields

Scope: roti/chapati/phulka, plain and aloo paratha, cooked white rice, poha, upma, plain dosa, idli, chicken biryani. Research date 2026-11-13.

Method note for the report writer. Five sources were read in full: Chiplonkar & Agte 2007 (Appendix I), Rao et al. 2009 (Pune Maternal Nutrition Study), NIN Dietary Guidelines 2011 (Annexures 2, 8 and 14), NIN Dietary Guidelines 2024 (Annexures I and II), and Bognár 2002 (weight-yield tables 29 to 31). We also used the raw INDB recipe and serving-size spreadsheets from the INDB GitHub repo, the IFCT 2017 raw-ingredient moisture values, and USDA FoodData Central portion records. Every number marked "derived" is our own arithmetic on cited values. Derived numbers appear only under Inferences.

---

## Q1. What do ICMR-NIN publications give (DGI 2024, DGI 2011, NVIF/IFCT, "count what you eat" style tables)?

### Takeaway
NIN publishes calories per household unit and raw-cereal portions. It does not publish weighed cooked-piece weights. DGI 2011 Annexure 8 is the most usable NIN table: phulka 80 kcal, paratha 150 kcal, rice 1 cup (200 ml) 170 kcal, idli 2 for 150 kcal, dosa 125 kcal, poha and upma 270 kcal per cup. DGI 2024 adds standard katori volumes (360, 200, 155 and 115 ml) and states its menu quantities as raw weights.

### Cited Findings
- **DGI 2011, Annexure 8 ("Approximate Calorific Value of Some Cooked Preparations", p.106–107).** Each row is the quantity for one serving and its kcal:
  - Rice 1 cup = 170
  - Phulka 1 No. = 80
  - Paratha 1 No. = 150
  - Puri 1 No. = 80
  - Poha 1 cup = 270
  - Upma 1 cup = 270
  - Idli 2 Nos. = 150
  - Dosa 1 No. = 125
  - Kichidi 1 cup = 200
  - Masala dosa 1 No. = 200 (listed under savoury snacks)

  The table gives **no gram weights**. — [NIN, Dietary Guidelines for Indians – A Manual, 2nd ed. 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **DGI 2011, measures.** "Size of Teaspoon, Tablespoon and Cup": cup = 200 ml, teaspoon = 5 ml, tablespoon = 15 ml (p.109). The meal plans also state "1 Cup = 200 ml". — [NIN DGI 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **DGI 2011, Annexure 14 ("Portion Sizes and Menu Plan", p.117).** One cereals & millets portion = **30 g raw**, giving 100 kcal, 3.0 g protein, 20 g carbohydrate and 0.8 g fat. A fat & oils portion = 5 g. — [NIN DGI 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **DGI 2011, Annexure 2a/2b (sample meal plans).** These link raw cereal to household units:
  - Sedentary man, lunch: "Cereals 120 g → Rice 2 Cups, Pulkas 2 Nos."
  - Sedentary woman, lunch: "Cereals 100 g → Rice 1 Cup, Phulkas 2 Nos."
  - Breakfast, man (cereals 70 g + pulses 20 g): "Idli – 4 Nos. / Dosa – 3 Nos. / Upma – 1-1/2 Cup"
  - Breakfast, woman (cereals 50 g + pulses 20 g): "Idli – 3 Nos. / Dosa – 2 Nos. / Upma – 1 Cup"
  - Tea snack (cereals 50 g): "Poha – 1 Cup"

  — [NIN DGI 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **DGI 2024, Annexure I ("Suggested measuring katori/cups and spoons", printed p.111–112).** Large katori C6 = 360 ml, medium C7 = 200 ml, small C8 = 155 ml, small C9 = 115 ml, tablespoon 15 g, teaspoon 5 g. The text says NIN used "a big katori (360ml), a medium katori (200ml), and two small katoris (155ml and 115ml)". It also says household measures "rely on subjective, categorical size assessments (small, medium and large)". — [NIN DGI 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf)
- **DGI 2024 meal plans.** They state "Quantities indicated are for raw ingredients" and "Measures: 1 cup/Katori = 200ml". A pregnancy menu lists "Rice (100g) or Phulka (100g)" as raw cereal. Annexure II gives only raw household measures for infant diets, e.g. rice 10 g = 2 teaspoons and wheat 10 g = 3 teaspoons of flour. — [NIN DGI 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf)
- **DGI 2024 cooking advice.** "Do not cook in excess water and discard it after cooking. Use only enough water for cooking." It also says "Prefer pressure/steam cooking". In other words, NIN recommends the absorption or pressure-cooker method for rice. — [NIN DGI 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf)
- **IFCT 2017 raw-ingredient moisture (needed for yield arithmetic).**
  - Wheat flour, atta (A019): 11.10 ± 0.35 %
  - Rice, raw, milled (A015): 9.93 ± 0.75 %
  - Rice, parboiled, milled (A014): 10.09 %
  - Rice flakes (A011): 10.36 %
  - Wheat semolina (A022): 8.94 %
  - Energy: atta 1340 kJ (≈320 kcal), raw milled rice 1491 kJ (≈356 kcal), rice flakes 1480 kJ, semolina 1396 kJ per 100 g

  IFCT covers raw foods only; it has no cooked chapati, rice or idli. — [IFCT 2017, NIN](https://www.nin.res.in/ebooks/IFCT2017.pdf)

### Inferences
- **Phulka.** Derived: 80 kcal ÷ 3.20 kcal/g atta ≈ **25 g atta per NIN phulka**. Applying the cooked-roti moisture in Q2 (≈35 %) gives a cooked weight of about **34 g**.
- **Rice, 1 cup (200 ml).** Derived: 170 kcal ÷ 3.56 kcal/g ≈ **48 g raw rice**. The meal plans imply 35 to 50 g raw rice per cup, after subtracting 2 phulkas of about 25 g atta each. The Annexure 8 kcal values and the meal plans are not fully consistent. At yield 3.0 a cup is about 145 g cooked; at Chiplonkar's 105 kcal/100 g it is about 160 g.
- **Breakfast items, raw dry ingredients per piece (derived from the meal plans):**

  | Item | Raw dry per piece or cup | NIN kcal |
  |---|---|---|
  | Idli | ≈22.5 g rice + dal | ~75 kcal per idli |
  | Dosa | ≈30–35 g | 125 kcal |
  | Upma | ≈47–50 g rava per 200 ml cup | — |
  | Poha | ≈50 g dry poha per cup | — |

  These numbers are internally consistent with the NIN kcal values.
- **Units differ.** The NIN cup is 200 ml. USDA and the INDB Units file use 240 ml (see Q3). A "cup" or "katori" must never be treated as one universal volume.

### Gaps
- **"Count What You Eat" style table.** We found no NIN document of this type that gives grams per piece for cooked roti, paratha, idli or dosa. The DGI 2024 text we searched has no cooked-weight table and does not repeat the 2011 Annexure 8 kcal table. Some DGI 2024 tables are images, so a figure could have been missed.
- **Nutritive Value of Indian Foods (Gopalan et al.).** Its household-measure appendix could not be accessed in this pass.
- **NNMB, INDDEX24 (India/Uttar Pradesh), FAO/WHO GIFT India.** We found no portion-weight tables for these items.

---

## Q2. What do peer-reviewed Indian studies, photo atlases and lab studies (e.g. Chiplonkar & Agte 2007) report?

### Takeaway
Measured Indian data on cooked-food moisture is good (Chiplonkar & Agte 2007, Pune; 5 replicates per food). Measured data on piece weight is thin. The best Indian weighed-portion study (Rao et al. 2009, rural Pune) reports daily intake and variability, not per-piece means. Its key finding is that roti weight varies little within a household (CV 3 %) but a lot between households (CV 22 %).

### Cited Findings
- **Chiplonkar & Agte 2007, study design.** Agharkar Research Institute, Pune. 104 cooked foods and 92 composite meals. "Five independent replicates of each of the 246 foods were analysed in duplicates". Rice and legumes were pressure-cooked. Breads were "prepared in the form of Roti". Moisture was measured by NIN-manual methods. — [Chiplonkar & Agte, APJCN 2007;16(2):227–239](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Chiplonkar & Agte 2007, Appendix I (lab values per 100 g cooked).**

  | Food | Water % | kcal | Protein g | Fat g | CHO g |
  |---|---|---|---|---|---|
  | Chapati (unleavened whole wheat pancake) | 34.7 | 305 | 8.0 | 9.2 | 47.5 |
  | Sorghum roti | 31.2 | 280 | — | — | — |
  | Pearl millet (bajra) roti | 28.7 | 309 | — | — | — |
  | Rice flour roti | 48.2 | 207 | — | — | — |
  | Maize roti | 35.9 | 266 | — | — | — |
  | Ragi roti | 36.9 | 253 | — | — | — |
  | Alu paratha (potato-stuffed whole wheat roti) | 55.5 | 205 | 4.9 | 6.0 | 41.8 |
  | Methi paratha | 38.8 | 276 | 8.6 | 6.2 | 52.6 |
  | Puri | 23.1 | 396 | — | 17.8 | — |
  | Plain rice (pressure-cooked) | 73.7 | 105 | 1.8 | 0.2 | 24.0 |
  | Pulao | 62.2 | 171 | — | 4.6 | — |
  | Rice + split green gram (khichdi type) | 80.2 | 90 | — | — | — |
  | Kanda pohe (rice flakes, onion, chilli, coriander, coconut, lemon) | 22.3 | 349 | 7.2 | 9.1 | 60 |
  | Upama (roasted semolina with vagar, onion, chilli, ginger) | 48.0 | 238 | 4.2 | 6.5 | 41 |
  | Idli-chatni (2:1 rice/urad, steamed, *eaten with coconut chutney*) | 45.5 | 231 | 5.4 | 3.2 | 45 |
  | Dosa (3:1 rice/urad, shallow-fried, *with potato, onion, chilli, oil*, i.e. masala-type) | 39.5 | 260 | 6.0 | 4.1 | 50 |

  — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Chiplonkar & Agte 2007, illustrative worked example (not measured portions).** "Methi paratha 2 … 60 g" and "Rice 1 bowl 100 g". The methi paratha recipe example used 250 g raw ingredients giving 380 g cooked. — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Chiplonkar & Agte 2007, accuracy of food tables.** Raw-ingredient food tables corrected for measured moisture matched the lab within about ±5 % for macronutrients in single cooked foods. At daily intake, the estimated/measured ratios were energy 108, protein 112, fat 127 and carbohydrate 97. — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Rao et al. 2009 (Pune Maternal Nutrition Study), pilot (n = 30 households).** Field workers weighed rotis, rice and dal in each house:
  - Roti weight within a household: CV 3 %
  - Roti weight between households: CV 22 %
  - Cooked rice servings: CV 28.5 %; dal 33.6 %; vegetables 39.9 %
  - Energy per 100 g of roti between households: CV 5–10 %

  The authors concluded that an average weight per household (of three servings) was needed. — [Rao, Kanade, Joshi, Yajnik. Public Health Nutr 2009;12(9):1470–1476](https://doi.org/10.1017/S1368980008004424)
- **Rao et al. 2009, Table 2 (n = 41 rural pregnant women, 40–50 km from Pune; weighed reference vs modified 24-h recall; g/day eaten).**

  | Food | n | Weighed (g/day) | Recall (g/day) |
  |---|---|---|---|
  | Roti (wheat/bajra/sorghum "roties") | 32 | 284.8 ± 177.9 | 300.2 ± 189.5 |
  | Chapati | 18 | 138.3 ± 90.8 | 124.5 ± 88.5 |
  | Cooked rice | 17 | 201.8 ± 95.7 | 170.4 ± 94.5 |

  None of the method differences were significant. Food was weighed on Ishida scales with 5 g resolution, and cooked samples were dried at 100 °C. — [Rao et al. 2009](https://doi.org/10.1017/S1368980008004424)
- **Photo atlases (exist, but numbers not accessed).**
  - MDRF "Atlas of Indian Foods" (Sudha, Anjana, Krishnaswamy, 2024) covers regional foods "with the real image and standard portion sizes". — [Dr Mohan's / MDRF](https://drmohans.com/atlas-of-indian-foods/)
  - A North-Indian online portion-size tool (Mediterr J Nutr Metab 2023;16(4):293–312) has 368 recipes and 313 photographed foods for urban North Indian adults. — [IOS Press MNM230039](https://content.iospress.com/articles/mediterranean-journal-of-nutrition-and-metabolism/mnm230039)
  - An Indian-thali computer-vision dataset (ICVGIP 2025) has gram-level weight labels for 267 plates and 41 dishes. Search summary only; the PDF was over 10 MB and could not be opened. — [ICVGIP Food Scanner](https://cdn.iiit.ac.in/cdn/cvit.iiit.ac.in/images/ConferencePapers/2025/ICVGIP_Food_Scanner.pdf)
- **South-Asian comparator (Southern Nepal photo atlas).** Agreement between weighed and image-recalled portions was only "modest" for rice and vegetable curry, and dal images were not reliably selected. — [Harris-Fry et al. 2016 (UCL)](https://discovery-pp.ucl.ac.uk/1478285/1/Harris%20Fry%20et%20al%20Development%20and%20validation%20of%20a%20photographic%20food%20atlas%20for%20portion%20size%20assessment%20in%20the%20southern%20plains%20of%20Nepal%20AAM.pdf)
- **Chapati moisture, secondary.** A Near-East FAO composition table lists about 30.9 % moisture for whole-wheat chapati (from a search summary, not opened). — [FAO X6879E](https://www.fao.org/3/x6879e/x6879e03.htm)

### Inferences
- **Cooked-roti moisture is well established at 33–35 %.** Sources: Chiplonkar 34.7 %, USDA FNDDS 35.4 %, USDA SR 33.0 % (Q4), and FAO ~31 %. Confidence A.
- **Flour to cooked roti.** Derived: 1 g atta (88.9 % solids) gives about 1.33–1.38 g cooked roti at 33–35 % moisture, plus any ghee. So:

  | Atta per roti | Cooked weight (no ghee) |
  |---|---|
  | 18 g | ≈25 g |
  | 25 g | ≈34 g |
  | 30 g | ≈41 g |
  | 36 g | ≈49 g |

- **Plain rice moisture.** Chiplonkar's 73.7 % is wetter than USDA's 68 %. Indian pressure-cooked rice is softer and wetter than US rice, which pushes the raw-to-cooked yield up (Q4).
- **Two Chiplonkar values are not "plain" items.** Idli (eaten with chutney) and dosa (masala-type) include their accompaniments. Kanda pohe at 22.3 % water and 349 kcal/100 g is much drier and denser than typical home poha. It looks like a coconut-rich Pune recipe, or a sample that dried before analysis. Treat it as an upper bound on poha energy density, not a default.
- **Calibrate per household.** Rao's CV figures support asking each user once for "your roti size" or a gram weight, then reusing it. Within-household roti variation is about 3 %, but the population default will be off by roughly ±22 % for any given home.

### Gaps
- We found no Indian peer-reviewed study that reports a **mean weighed weight per chapati, phulka, paratha, idli or dosa** together with diameter and sample size. Atlas weights (MDRF 2024, MNM 2023) and the ICVGIP dataset exist but could not be read.
- We found no measured **diameter-to-weight** relation for Indian rotis. USDA FNDDS gives one by diameter (Q4).
- We found no measured **plain idli** or **plain dosa** moisture (excluding chutney and filling) in an Indian peer-reviewed source.
- A study of multigrain-atta chapati moisture (about 30–33 % at 0 h) appeared in search snippets but its source was not verified.

---

## Q3. What do the INDB recipe and serving-size files imply (recipes_servingsize, pieces per recipe)?

### Takeaway
INDB's per-piece weights are **raw-ingredient mass divided by the number of pieces**. No cooking water loss is applied, all added water is kept, and some batter or soak water is left out entirely. That makes INDB useful for **flour, oil and filling per piece**, but not for cooked piece weight or kcal per 100 g of breads, dosa and poha. Implied values: chapati 36 g (20 g atta), plain paratha 56 g (≈10 g oil), aloo paratha 93 g, idli 25 g, a "plate" of boiled rice 300 g from 100 g raw.

### Cited Findings
- **INDB method.** Nutrients per 100 g are computed by summing raw ingredients and dividing by the summed raw ingredient weight. The Stata code comments read "Convert to amount per 100 g recipe without nutrient retention factor", with `collapse (sum) amount_g` per recipe. Water is converted at 1 g/ml, 5 g/tsp and 15 g/tbsp. — [INDB GitHub (INDB.do)](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-); [Vijayakumar et al., Curr Dev Nutr 2024;8(7):103790](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- **Per-recipe data (INDB `recipes.xlsx`, `recipes_servingsize.xlsx`, `INDB.xlsx`).** Grams per unit are our computation: `unit_serving_energy_kcal` ÷ `energy_kcal` × 100. All rows from the [INDB GitHub repo](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-).
  - **ASC096 Chapati/Roti.** 80 g atta + "enough water" coded as 4 tbsp (60 g) + 1 tsp ghee. One serving is 4 chapatis, giving **36.0 g per chapati**, 72.8 kcal each and 202 kcal/100 g.
  - **ASC097 Plain parantha.** 80 g atta + 2 tbsp oil + 4 tbsp water. One serving is 3 parathas, giving **55.8 g per paratha**, 166 kcal each and 16.9 g fat/100 g (≈9.4 g fat per piece).
  - **ASC098 Aloo parantha.** 80 g atta + 80 g potato + 25 g onion + chilli and spices + 2 tbsp oil + 4 tbsp water. One serving is 3 parathas, giving **93.4 g per paratha**, 191 kcal each and 10.2 g fat/100 g (≈9.5 g fat per piece).
  - **ASC113 Boiled rice.** 100 g rice ("Rice, parboiled, milled") + "double the quantity of rice by volume", coded as 200 ml water. One serving is 1 plate, giving **300 g per plate**, 352 kcal per plate and 117 kcal/100 g.
  - **ASC144 Idli.** 60 g rice + 20 g urad dal + 120 ml water. There are 2 servings of 4 idlis; the remark "size of servings from back of the manual" changed the original "2 to 3" to 4. This gives **25.1 g per idli**, 34.5 kcal each and 137.5 kcal/100 g.
  - **BFP148 Plain dosa.** 50 g raw rice + 50 g parboiled rice + 30 g urad + 1 tbsp butter, with **no water** in the recipe. There are 2 servings of 2 dosas, marked "serving unit – guessed". This gives **36.1 g per dosa**, 137.6 kcal each and **380.9 kcal/100 g**.
  - **ASC146 Masala dosa.** 2 dosas including 100 g potato, 75 g onion and 2 tbsp oil "for frying". This gives **209.7 g per dosa**, 345 kcal each and 164.6 kcal/100 g.
  - **ASC147 Rava dosa.** 73.4 g per dosa, 167 kcal.
  - **BFP044 Poha.** 40 g flaked rice + 30 g potato + 10 g peanuts + 10 g oil + spices, **no soak water**. Two bowls give **54.6 g per bowl**, 161 kcal each and **294.5 kcal/100 g**.
  - **BFP045 Vegetable poha.** 40 g poha + 60 g water + vegetables + 10 g oil. Two bowls give **97.8 g per bowl**, 176.6 kcal each and 180.5 kcal/100 g.
  - **BFP039 Suji upma.** 40 g semolina + 100 ml water + 15 g oil + 30 g onion + others. Two bowls give **106.3 g per bowl**, 157 kcal each and 147.9 kcal/100 g.
  - **ASC122 Mutton biryani.** 100 g rice + 100 g boneless mutton + 100 g onion + 50 g tomato + curd, milk, spices, and "Fat 4 tbsp" coded as **4 tsp** of oil. No cooking water. Two plates give **207.8 g per plate**, 396 kcal each and 190.8 kcal/100 g.
  - **ASC123 Vegetable biryani.** 301.6 g per plate, 527 kcal.
  - **BFP142 Chicken pulao.** One "plate" from 80 g rice + 100 g chicken (with bone) + 360 ml water and stock, giving **668 g per plate** and 723 kcal.
  - INDB has **no chicken biryani** recipe.
- **INDB Units file.** It defines "1 cup = 240ml = 240g", which differs from the NIN 200 ml cup. — [INDB Units.xlsx](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
- **INDB paper.** Only 42.62 % of recipe ingredients matched a nutrient-retention factor. Serving sizes come from two University of Delhi manuals plus food blogs. — [Vijayakumar et al. 2024 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)

### Inferences
- **What INDB can supply.**
  - Chapati: **20 g atta and ≈1.25 g ghee per piece**
  - Plain paratha: **≈27 g atta and ≈10 g oil per piece**
  - Aloo paratha: **≈27 g atta, ≈37 g filling (~40 % of raw mass) and ≈10 g oil per piece**
  - Poha: **20 g dry poha and 5 g oil per bowl**
  - Upma: **20 g rava and 7.5 g oil per bowl**
  - Idli: **≈10 g dry rice + dal per idli**, which is small. NIN implies about 22 g.
- **Dough to cooked chapati (derived).** The INDB chapati dough weighs 36.25 g. At 34.7 % cooked moisture, the cooked piece would be about 28.5 g, a **≈21 % weight loss** on the tawa. At a lower dough hydration of about 60 %, the loss is about 15 %.
- **INDB kcal/100 g is biased for these items.**
  - Chapati is too low: 202 kcal vs 305 kcal measured by Chiplonkar, because dough water is retained.
  - Plain dosa is far too high: 381 kcal vs about 200–260, because batter water is omitted.
  - Poha is too high: 294 kcal, because soak water is omitted.
- **Rice "plate" of 300 g.** This is an assumption built into the INDB recipe (100 g raw + 200 g water, zero evaporation), not a measurement. It happens to match yield 3.0 (Q4).
- **INDB mutton biryani "plate" of 208 g.** This is not a realistic cooked plate weight because the rice-cooking water is left out. With 50 g raw rice per plate at a 3.0 yield, the cooked plate is closer to 250–280 g (derived). The tbsp-to-tsp coding of the fat also lowers its energy.
- **Coding inconsistencies.** Chicken pulao at 668 g per plate and "guessed" serving units show that INDB serving counts need case-by-case review before reuse.

### Gaps
- INDB records no cooked total weight for any recipe, so measured yields cannot be recovered from it.

---

## Q4. What do USDA, Bognár (2002) and FAO/INFOODS give for rice and flatbreads?

### Takeaway
Bognár's measured yields put polished long-grain rice at **2.98×** (boiled, n = 140) and **2.94×** (stewed/absorption, n = 25). Parboiled is 2.90–3.04×, brown 2.60× and round-grain 3.19×. Pan-cooked flour pancakes lose about 11 % of weight (yield 0.89) and baked bread about 10 % (0.90). USDA's portion records give roti at 27 / 40 / 52 g for 6″ / 7″ / 8″ diameters with about 35 % water, and cooked white rice at 158 g per 240 ml cup with 68 % water. USDA's ARS "Table of Cooking Yields" covers meat and poultry only.

### Cited Findings
- **Bognár 2002, Table 29 ("Weight yield factors by cooking of cereal based dishes – grains and flakes"); edible-part yield ± CI, n.** Here *a* = boil or pressure-boil and *c* = stew, pressure-stew or microwave-stew.
  - Rice, long grain, polished: **boiled 2.98 ± 0.05 (n = 140)**; **stewed 2.94 ± 0.09 (n = 25)**; stew with fat and ingredients 2.97 (n = 3)
  - Rice, long grain, parboiled: boiled 2.90 ± 0.05 (n = 43); stewed 3.04 ± 0.10 (n = 11); stew 2.89 (n = 3)
  - Rice, long grain, unpolished (brown): boiled 2.60 ± 0.32 (n = 7); stewed 2.60 (n = 5)
  - Rice, round grain, polished, boiled: 3.19 ± 0.43 (n = 8)
  - Rice, pre-cooked, boiled: 3.43 (n = 1)
  - Risotto (polished): 2.83 (n = 16)
  - Millet boiled 2.40; pearl barley boiled 2.50; whole wheat boiled 1.78

  — [Bognár A., *Tables on weight yield of food and retention factors of food constituents…*, BFE-R-02-03, Karlsruhe 2002](https://publikationen.bibliothek.kit.edu/9642002/1928)
- **Bognár 2002, Table 30 (cereal flour and pastry).** Pancake, wholemeal flour, pan-fried: **0.89 ± 0.02 (n = 2)**. Pancake, white flour: 0.89. Egg-free hard-wheat pasta, boiled: 2.10. **Table 31 (bread):** rye, wheat, wholemeal and mixed breads all 0.90 ± 0.02 (dough to baked bread). — [Bognár 2002](https://publikationen.bibliothek.kit.edu/9642002/1928)
- **Bognár 2002, worked example and validation.** 260 g polished long-grain rice + 9 g salt gives 807 g cooked rice, with 538 g water uptake (conversion factor 8.07 per 100 g portion). In the validation table, boiled rice measured 73.2 % water against 73.6 % calculated. — [Bognár 2002](https://publikationen.bibliothek.kit.edu/9642002/1928)
- **USDA FNDDS 2707713, "Bread, chappatti or roti".** Small 6″ = 27 g, medium 7″ = 40 g, large 8″ = 52 g; "quantity not specified" = 40 g; water 35.4 g/100 g. — [USDA FoodData Central 2707713](https://fdc.nal.usda.gov/food-details/2707713/portions)
- **USDA SR Legacy 171844, "Bread, chapati or roti, plain, commercially prepared".** 1 piece = 68 g; water 33.0 g/100 g. — [USDA FDC 171844](https://fdc.nal.usda.gov/food-details/171844/measures)
- **USDA FNDDS 2708408, "Rice, white, cooked, no added fat".** 1 cup cooked = 158 g; "quantity not specified" = 118 g; water 68.0 %. The oil-cooked version (2708404) is 163 g per cup with 66.1 % water. — [USDA FDC 2708408](https://fdc.nal.usda.gov/food-details/2708408/portions)
- **USDA ARS cooking-yield table.** It is the "USDA Table of Cooking Yields for Meat and Poultry" (title), so it gives no rice or flatbread yields. — [USDA ARS](https://ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.pdf)
- **FAO/INFOODS food-matching guidance.** "Calculation of recipes is preferable to taking similar cooked foods. Calculating food component values from cooked foods based on raw foods by using appropriate nutrient retention and yield factors." — [FAO/INFOODS Guidelines for Food Matching v1.2 (2012), via INFOODS standards & guidelines](https://www.fao.org/infoods/infoods/standards-guidelines/en/)

### Inferences
- **Yield is set by cooked moisture.** Derived, with IFCT raw rice at 9.93 % moisture and no solids lost: yield ≈ 0.90 / (1 − cooked moisture).

  | Cooked moisture | Yield | Example |
  |---|---|---|
  | 64 % | ≈2.5× | — |
  | 68 % | ≈2.8× | USDA |
  | 70 % | ≈3.0× | Bognár |
  | 73.7 % | ≈3.4× | Chiplonkar, Pune pressure-cooked |

  Bognár's own example implies about 6 % solids loss: 807 g × 26.8 % solids ≈ 216 g, against about 229 g of solids in 260 g raw rice.
- **Absorption vs boiling.** Bognár found no meaningful difference (2.98 vs 2.94) for polished long-grain rice. His "boil" category includes pressure-boiling, and his tables do not separate drained (excess water) from absorption cooking.
- **Diameter.** USDA's 27 / 40 / 52 g for 6–8″ is the only diameter-indexed roti weight we found. It is US-recipe based (NHANES), so it serves as a comparator, not an Indian measurement. The commercial 68 g SR piece reflects thicker packaged roti.
- **Flatbreads.** Bognár's 0.89 (pan-fried pancake) and 0.90 (bread) agree with our INDB-derived dough-to-chapati loss of about 15–21 %.

### Gaps
- We did not locate USDA Agriculture Handbook 102 (food yields by preparation stage) rice values in this pass.
- We found no FAO/INFOODS yield table specific to Indian flatbreads.
- We found no measured yield for **drained (excess-water) basmati vs absorption** cooking, nor for solids lost into the discarded starch water. The searched Indian rice "water uptake ratio" studies (lab cooking-quality tests) could not be opened (HTTP 403).

---

## Q5. Why do sources disagree (roti 30 g vs 50 g; rice yield 2.0× vs 3.0×)?

### Takeaway
Roti weights differ mainly because of **atta per piece** (≈18–36 g), what is weighed (raw dough vs cooked), and **home thin phulka vs commercial or restaurant roti**. Rice yields differ because of **cooked moisture** (64–74 %), variety and parboiling, and cooking method. A further cause is **volume vs weight confusion**: "1 cup raw gives 3 cups cooked" is a volume ratio.

### Cited Findings
- **Roti weights by source.**

  | Source | Weight | What it measures |
  |---|---|---|
  | INDB | 36 g | Raw dough mass (20 g atta) — [INDB](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-) |
  | USDA FNDDS | 27 / 40 / 52 g | Small / medium / large cooked — [FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/portions) |
  | USDA SR | 68 g | Commercial piece — [FDC 171844](https://fdc.nal.usda.gov/food-details/171844/measures) |
  | Chiplonkar worked example | 30 g | Methi paratha, illustrative — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf) |
  | NIN phulka | 80 kcal | Implies ≈25 g atta, ≈34 g cooked (derived) — [NIN DGI 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf) |

- **Between-household spread.** Roti weight CV is 22 % between households and 3 % within them, in rural Pune. — [Rao et al. 2009](https://doi.org/10.1017/S1368980008004424)
- **Regional breads.** In rural Maharashtra, "roties" are mostly wheat, bajra or sorghum breads. Daily roti intake (284.8 g) was about twice chapati intake (138.3 g) among women who ate each. — [Rao et al. 2009](https://doi.org/10.1017/S1368980008004424) Millet rotis are drier than wheat chapati (bajra 28.7 %, sorghum 31.2 % water). — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Rice yields by source.**
  - Bognár 2.60 (brown) to 3.19 (round-grain), with polished long grain at 2.98 — [Bognár 2002](https://publikationen.bibliothek.kit.edu/9642002/1928)
  - INDB 3.0 by construction — [INDB](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
  - Pune pressure-cooked rice at 73.7 % water — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
  - USDA at 68 % water — [FDC 2708408](https://fdc.nal.usda.gov/food-details/2708408/portions)

### Inferences
- **"30 g" vs "50 g" roti.** Both can be right. A thin home phulka from about 20–22 g atta weighs about 28–30 g cooked. A North-Indian or dhaba tawa roti from 35–40 g atta weighs about 48–55 g. Commercial packaged roti is about 68 g. A 30 g figure can also be a raw-dough or raw-atta weight mislabelled as cooked.
- **"2.0×" rice yields.** These usually come from firmer or parboiled rice cooked al dente (e.g. biryani rice partly cooked before dum), from weighing after cooling and evaporation, or from volume-based kitchen guides. Soft Indian pressure-cooker rice sits at 3.0–3.4×. Cooked weight is the safer logging basis, and the app should convert using about 3.0× with a moisture-aware range.
- **Region.**
  - South and East India eat more rice per meal, and rice and idli/dosa dominate; Western North-American datasets underrepresent this.
  - North India has larger rotis and ghee-heavy parathas.
  - West and central India (Maharashtra, Karnataka) have thicker jowar and bajra bhakri.

### Gaps
- We found no Indian study that measures the same item across regions or across home and restaurant settings to quantify these differences directly.

---

## Q6 (objective). Recommended default grams per unit, S/M/L range, yield and moisture

### Takeaway
Defaults below combine the measured evidence above. Confidence grades:
- **A**: several measured sources agree
- **B**: one good measured source, or several consistent derived ones
- **C**: weak or secondary

Only cooked-roti moisture and the rice yield factor reach A. Every per-piece weight is B or C, so the app should invite a one-time per-user calibration for roti, rice serving and paratha.

### Cited Findings
- Moisture, yields and per-piece anchors are as cited in Q1–Q5:
  - [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
  - [Bognár 2002](https://publikationen.bibliothek.kit.edu/9642002/1928)
  - [USDA FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/portions)
  - [USDA FDC 2708408](https://fdc.nal.usda.gov/food-details/2708408/portions)
  - [INDB](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
  - [NIN DGI 2011](https://www.nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
  - [NIN DGI 2024](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf)
  - [Rao et al. 2009](https://doi.org/10.1017/S1368980008004424)
- **Consumer databases for biryani (low confidence, unverified).** "1 bowl (298g) of Biryani contains 535 calories". Lamb biryani 1 plate = 306 g, 722 kcal. — [Welling.ai](https://www.welling.ai/calories-nutrition-facts/biryani). Blogs give 350–450 g for restaurant chicken biryani. We found no measured study.

### Inferences

**Recommended defaults** (cooked, as served; all are our synthesis)

| Item | Default (M) | S / L | Key parameters | Conf. |
|---|---|---|---|---|
| Roti / chapati (wheat, home) | **35 g** | 25 g / 50 g | ≈25 g atta (S 18, L 36). Cooked = 1.36 × atta + ghee. Moisture 33–35 % (default 34.7). Dough→cooked loss ≈15–22 %. Ghee if applied ≈1–3 g. 6/7/8″ ≈ 27/40/52 g (USDA) | Weight B; moisture **A** |
| Phulka (thin, flame-puffed, no fat) | **30 g** | 22 g / 40 g | ≈22 g atta; NIN phulka = 80 kcal (≈25 g atta) | B |
| Commercial / restaurant roti, tandoori roti | 60 g | 45 / 80 g | USDA commercial 68 g; restaurant sizes vary | C |
| Plain paratha | **50 g** | 35 g / 80 g | ≈27–30 g atta. **Oil/ghee 6 g default (range 3–12 g)**: INDB 10 g per piece; NIN 150 kcal ≈ 30 g atta + 6 g fat. Restaurant lachha or tawa parathas run 80–120 g | C |
| Aloo paratha | **100 g** | 70 g / 150 g | ≈27–35 g atta. **Filling ≈35–45 % by weight** (INDB ≈40 % of raw mass). Fat ≈6 g/100 g measured (Chiplonkar), ≈9–10 g per piece (INDB). Moisture 55.5 %, 205 kcal/100 g | Per-100 g B; weight C |
| Cooked white rice yield | **3.0× raw** | 2.6× / 3.4× | Polished 2.94–2.98 (Bognár, n = 165); parboiled 2.9–3.0; brown 2.6; soft pressure-cooked ≈3.4. Moisture default 70 % (range 64–74) | **A** (yield), B (Indian moisture) |
| Rice, 1 katori (200 ml medium) | **130 g** | 100 g (155 ml) / 240 g (360 ml) | At ≈0.66 g/ml (USDA 158 g per 240 ml); packed rice runs higher | C |
| Rice, plate (home meal) | **250 g** | 150 g / 350 g | INDB plate 300 g (100 g raw); rural Pune women ate 202 ± 96 g/day; NIN cup ≈48 g raw ≈145–160 g | C |
| Poha (plate) | **150 g** | 100 g / 250 g | ≈40–50 g dry poha (NIN cup ≈50 g) + 5–10 g oil (INDB 5 g per bowl); kcal/100 g ≈150–200 for home style. Chiplonkar's dry kanda pohe 349 is an upper bound | C |
| Upma (plate / bowl) | **150 g** | 100 g / 250 g | ≈40–50 g rava (NIN cup ≈47–50 g) + ≈7 g oil (INDB 7.5 g per bowl). Moisture ≈48 % (Chiplonkar), up to ≈70 % for wetter INDB-style recipes | C |
| Idli (plain, medium) | **40 g** | 25 g / 60 g | NIN ≈22 g dry rice + dal per idli (≈75 kcal); INDB small idli 25 g (10 g dry). Batter ≈40–50 g per medium idli (derived) | C |
| Plain dosa (home) | **60 g** | 40 g / 100 g | NIN ≈30–35 g dry batter solids + 3–5 g oil, 125 kcal; restaurant paper or roast dosa larger. Masala dosa total ≈180–210 g incl. ≈80–100 g potato filling (INDB 210 g; NIN 200 kcal) | C |
| Chicken biryani, home plate | **300 g** | 200 g / 400 g | INDB has no chicken biryani. Mutton biryani 50 g raw rice + 50 g meat per plate → ≈250–280 g once cooking water is counted (derived); veg biryani INDB 302 g | C |
| Chicken biryani, restaurant / delivery | **450 g** | 350 g / 600 g | Only consumer and blog numbers (298–450 g). No measured Indian study found | C |

**Design implications**
- Store **raw-ingredient anchors** (atta, rava, poha or rice per piece, plus fat per piece) and a **yield/moisture parameter**, not just cooked grams. This lets the resolver move between raw, dough and cooked, and recalculate kcal when a user says "thin", "big" or "with ghee".
- Do not use INDB kcal/100 g for chapati, plain dosa or poha without a moisture correction. Use the Chiplonkar-measured densities instead:

  | Item | kcal/100 g (Chiplonkar) |
  |---|---|
  | Chapati | 305 |
  | Aloo paratha | 205 |
  | Methi paratha | 276 |
  | Rice | 105 |
  | Upma | 238 |

### Gaps
- No measured Indian **restaurant or delivery** portion weights for biryani, dosa, paratha or roti were found. These defaults are the weakest in the set.
- No measured **oil uptake per paratha** (home vs dhaba) was found. Searches turned up only general frying literature and anecdotes.
- No measured **dry poha → cooked yield** (soak-water uptake) or **rava → upma** yield was found. The water-to-rava ratio varies (INDB 2.5:1 by weight), and we have no measured cooked weight.
- No measured **plain idli or plain dosa piece weights** with sample sizes were found. The MDRF Atlas of Indian Foods (2024) and the North-Indian portion tool (MNM 2023) are the most likely sources and should be obtained.
