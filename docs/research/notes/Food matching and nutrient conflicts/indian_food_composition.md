# Indian food composition data: sources, provenance, cross-source differences, and default/portion rules

*Research notes, 2026-11-12. Primary sources were read directly where possible: the INDB paper full text (via Europe PMC), INDB's own `recipes.xlsx` and `Units.xlsx` from GitHub, the IFCT 2017 values (npm packaging of the NIN tables), USDA FoodData Central API records, the NIN *Dietary Guidelines for Indians* (2011) PDF, the EuroFIR recipe guideline PDF, and Chiplonkar & Agte (2007) lab data. The INDB per-100 g values were reproduced from raw ingredients with a script, so the explanations of the INDB anomalies below are verified, not guessed. Local copy of INDB used by STEADY: `scripts/data/indb.json` (1,014 rows, identical values to INDB.xlsx for the rows checked).*

## 1. INDB (Indian Nutrient Databank): who built it, method, coverage, validation, licence, known issues

### Takeaway
INDB (Vijayakumar, Dubasi, Awasthi of Anuvaad Solutions, New Delhi; Jaacks of the University of Edinburgh; *Curr Dev Nutr* 2024; CC BY; Gates-funded) is **calculated, not analysed**. For each recipe it adds up the nutrients of the raw ingredients and divides by the summed **raw** ingredient weight. **No yield factor is applied.** That means no water loss in cooking, all added water is kept, and **all deep-frying oil in the pan is counted as eaten**. The result is systematic errors in three directions: dry-heat breads come out too low per 100 g, watery dals too low (or simply very dilute), and deep-fried items far too high (~700+ kcal, ~70–90 g fat/100 g). Batter recipes that omit their water come out far too high as well (plain dosa 381).

### Cited Findings
**Provenance and method (from the paper)**
- Authors and venue: Aswathy Vijayakumar, Hima Bindu Dubasi, Ananya Awasthi (Anuvaad Solutions, New Delhi) and Lindsay M. Jaacks (Global Academy of Agriculture and Food Systems, University of Edinburgh). "Development of an Indian Food Composition Database", *Current Developments in Nutrition* 8(7):103790. Published 13 June 2024 (received 31 Dec 2023). DOI 10.1016/j.cdnut.2024.103790. Licensed CC BY 4.0, funded by the Bill & Melinda Gates Foundation, PMID 39071807. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/); [Europe PMC full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11277795/fullTextXML); [DOI](https://doi.org/10.1016/j.cdnut.2024.103790)
- The actual INDB paper is the one above. No paper called "Anuvaad INDB 2024" by other authors turned up. "Anuvaad" is the authors' organisation. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Two stages: (1) **1,095 raw food items**: 528 from IFCT 2017, 369 more from "IFCT 2004", with gaps (e.g., carbohydrate and fibre for eggs, meat, fish) filled from UK CoFID. (2) **1,014 recipes**, with each ingredient matched first to IFCT 2017/2004, then UK CoFID (n=144 ingredients), then USDA (n=54 ingredients). — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Recipe sources: "Basic Food Preparation, 4th ed." (611 recipes; Raina et al., Orient BlackSwan 2011) and "The Art & Science of Cooking, 5th ed." (513 recipes; Khanna et al., Elite 2007). Both are University of Delhi teaching manuals. 258 duplicates were removed, and 148 recipes from "popular Indian food blogs" were added because the manuals are more than 10 years old. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/). The GitHub README gives the counts as 490/378/148. Those add up to 1,016, not 1,014, and the README says 148 in one place and 150 in another. — [GitHub README](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)
- Calculation, quoted: "The nutrient content of all ingredients in a recipe was summed to obtain the total nutrient content per 100 g of the recipe and per serving of the recipe." Ingredient amounts were entered "as grams, milliliters, tablespoons, teaspoons, or sprigs." — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- **No yield factor.** The authors list it as future work: "Other next steps include correction for loss or gain in weight while cooking, generally referred to as yield factor." — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Retention factors (USDA Table of Nutrient Retention Factors, Release 6, 2007) were used **only in a sensitivity analysis**, only for minerals and vitamins (not energy or macronutrients), and matched only **42.62%** of recipe ingredients. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/); [USDA RF Release 6](https://agdatacommons.nal.usda.gov/articles/dataset/USDA_Table_of_Nutrient_Retention_Factors_Release_6_2007_/24660888/1)
- Energy: IFCT 2017 energy is in kJ and IFCT 2004 in kcal. INDB converted with the FAO factors 1 kJ = 0.239 kcal and 1 kcal = 4.184 kJ. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/); [FAO energy conversion](https://www.fao.org/3/Y5022E/y5022e04.htm)
- Validation: there is **no comparison against lab-analysed dishes**. The only external check was against UK CoFID composite dishes, where INDB differed "nonsystematically" (higher for some dishes and nutrients, lower for others). Packaged foods are excluded. The paper's own example: vegetable samosa 443 kcal/100 g vs khichdi 57 kcal/100 g. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Repository: Stata `INDB.do` plus `INDB.xlsx`, `recipes.xlsx`, `Units.xlsx`, `UK_fct.xlsx`, `US_fct.xlsx`, `USDA_nrf.xlsx`, `recipes_servingsize.xlsx`. IFCT source files "must be requested from the original source and are not included". The README states no separate licence (the paper's CC BY applies to the article). — [GitHub](https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-)

**Verified mechanics, reproduced from INDB's own `recipes.xlsx` + IFCT 2017 values**
- `Units.xlsx` maps vague quantities to fixed amounts: "Oil — Frying — 2 cups"; "1 cup = 240 ml = 240 g"; "Water — to make dough — 3 tbsp"; "Oil — Tempering — 2 tbsp". — [Units.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/Units.xlsx)
- **Chapati/Roti (ASC096) = 202.31 kcal/100 g.** Recipe: whole wheat flour 80 g; water "enough to make a soft dough" → 4 tbsp (60 g); ghee 1 tsp. IFCT 2017 atta (A019) is 1340 kJ = 320.3 kcal/100 g, with 11.1% moisture and 1.53 g fat. 80 g atta + 60 g water + ~3.9 g ghee gives (256.2 + 35) kcal / 143.9 g = 202.4 kcal/100 g and 3.56 g fat, which matches INDB **exactly**. INDB's roti is therefore **raw dough** at ~48% moisture. — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx); [IFCT 2017 values (npm @ifct2017/compositions)](https://unpkg.com/@ifct2017/compositions/index.csv)
- **Boiled rice (ASC113) = 117.19 kcal/100 g.** Recipe: parboiled rice 100 g + water 200 ml. IFCT A014 is 1471 kJ = 351.6 kcal/100 g, so 351.6 / 300 g = 117.2. All cooking water is assumed retained (yield 3.0×, ~70% moisture). — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx); [IFCT values](https://unpkg.com/@ifct2017/compositions/index.csv)
- **Washed moong dal (ASC151) = 50.0 kcal/100 g.** Recipe: green gram dal 30 g, oil 1 tsp, spices, salt ½ tsp, **water 1 cup (240 ml)**. That is ~280 g of finished dish from 30 g of dry dal (≈10.7 g dry dal per 100 g, ~87% moisture). IFCT B010 green gram dal is 1363 kJ = 325.8 kcal/100 g. Other INDB dals: whole moong 53.7, mixed dal 61.9, whole masoor 54.1, dal makhani 74.0, khatti dal 34.8, "moong dal with vadi" 24.1. — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx); local `scripts/data/indb.json`
- **Poori (ASC107) = 737.63 kcal and 77.61 g fat per 100 g.** Recipe: atta 80 g, fat "for frying" → **sunflower oil 480 ml**, ghee 1 tsp, water 4 tbsp, salt. Treating the 480 ml as 480 g, all retained, gives (1.22 + 480 + 3.9) g fat / ~625 g = 77.6% fat, which matches INDB **exactly**. The whole kadhai of oil is assumed to be eaten. — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx)
- **Khasta kachori (ASC365) = 712.73 kcal and 72.27 g fat.** Recipe: maida 100 g, urad dal 30 g, oil "for frying" **480 ml**, plus 1.5 tbsp and 2 tsp oil. Same mechanism. — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx)
- Scale of the frying problem (computed over all 1,014 INDB recipes): **131 recipes** have a deep-frying oil line, mostly 480 ml (63 recipes), 240 ml (34) or "2 C" (27). Their **median fat is 67.8 g/100 g**, and 104 of them have ≥50 g fat/100 g. Across all of INDB, **111 recipes have ≥50 g fat/100 g** and **99 have ≥550 kcal/100 g**. Extremes: soyabean muthias 839 kcal/90 g fat, masala vada 826, chilli paneer 778/84 g fat, rice-moong dal cheela 798/82 g fat, paneer kofta curry 671/72 g fat. — computed from [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx) and `scripts/data/indb.json`
- **Plain dosa (BFP148) = 380.91 kcal.** The recipe lists rice 50 g + parboiled rice 50 g + urad dal 30 g + butter 1 tbsp + fenugreek + salt, and **no water at all**, so the value is per 100 g of dry batter ingredients. Masala dosa (ASC146) includes 120 ml water + potato + onion, which is why it comes out at 164.58. Other wet dishes with no water listed: "Rice dal porridge (khichdi)" BFP554 = 383.3, "Maa chaane ki dal" OSR155 = 344.7, "Namkeen daliya" BFP577 = 295.1, "Moong bean dosa (pesarattu)" OSR103 = 286.0. Compare "Plain khichdi" BFP144 at 57.0, which includes 480 ml water. — [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx); `scripts/data/indb.json`

### Inferences
- INDB rows fall into roughly four regimes, depending on whether the recipe lists water and/or frying oil:
  - (a) Dry-heat breads: under-concentrated, because dough water is never lost.
  - (b) Wet dishes: correct per serving but very dilute per 100 g, because all water is kept.
  - (c) Deep-fried items: grossly over-concentrated, because all frying oil is counted.
  - (d) Recipes that omit their water: dry-matter basis, so too concentrated.
  
  This alone explains the dosa 381 vs 165 contradiction and the 700 kcal kachori.
- INDB's **per-serving** totals are right for regime (b) (the whole recipe *is* the serving: 30 g dal + water = 1 serving ≈ 141 kcal), but wrong for (c) and (d). The **per-100 g** values are only safe to multiply by a gram estimate when the gram estimate refers to the same physical state (raw dough, undrained pot contents).
- Because INDB's ingredient-level data is open, its anomalies can be **fixed at source** rather than discarded:
  - re-run the sum with a cooked-weight yield factor;
  - replace "for frying" oil with an absorbed-fat amount;
  - add the missing batter water.
- Before any fix, rows with fat ≥40–50 g/100 g that are not fats, nuts or oilseeds, plus regime (d) rows, should be treated as suspect.

### Gaps
- The task statement's "INDB 'Dal moong' ~44 kcal" is not in `scripts/data/indb.json`. The closest rows are ASC151 "Washed moong dal" at 50.0 and BFP174 "Moong dal with vadi" at 24.1. The 44 figure may come from an edited or merged `food_items` row. Check it in the database.
- `recipes_servingsize.xlsx` and the "total weight of the recipe (g)" field the paper describes could not be downloaded (timeout). Total weight was inferred as the sum of ingredient weights, and the reproductions above match INDB to within rounding.
- No published independent validation of INDB against analysed dishes was found (as of Nov 2026). The GitHub issue tracker (2 open issues) was not read.

## 2. IFCT 2017, NIN's earlier tables, NIN cooked-dish values and NIN household measures

### Takeaway
IFCT 2017 (Longvah, Ananthan, Bhaskarachary, Venkaiah; ICMR-NIN) is the authoritative **analytical** table for **raw** Indian foods: 528 key foods, 151 components, regional composite samples from 6 regions, energy in kJ. It has no cooked dishes. NIN's only official cooked-dish energy values found are the **per-serving** values in the *Dietary Guidelines for Indians* (2011 Annexure 8). Those values are consistent with lab data and sit well below INDB for fried foods.

### Cited Findings
- Citation: Longvah T, Ananthan R, Bhaskarachary K, Venkaiah K. *Indian Food Composition Tables 2017*. National Institute of Nutrition (ICMR), Hyderabad. 151 nutrient components for **528 key foods**. "All data originate from regional composite samples averaged for six geographical regions." Key foods are those contributing up to 75% of population nutrient intake. The tables are not exhaustive, and vitamin values vary with processing. — [Vikaspedia summary of IFCT 2017](https://en.vikaspedia.in/viewcontent/health/nutrition/nutritive-value-of-foods/indian-food-composition-tables?lgn=en); [NIN IFCT 2017 PDF](https://nin.res.in/ebooks/IFCT2017.pdf)
- The INDB paper restates this: IFCT 2017 covers 528 raw items (e.g., "uncooked rice, wheat flour, and tomatoes") but "does not include data for composite dishes, i.e., chapattis or curries". The key-foods selection covers 75% of intake of energy, fat, protein and 8 micronutrients. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Down To Earth's 2017 coverage headlined "nutritive value of 586 foods" and noted the first Indian FCT appeared in 1937, with a ~28-year gap before 2017. This conflicts with the 528 count; it may count sub-items. — [Down To Earth](https://www.downtoearth.org.in/food/india-s-new-food-composition-table-provides-data-on-nutritive-value-of-586-foods-56840)
- Sample IFCT 2017 values per 100 g raw (energy in kJ, converted at ÷4.184):

  | Food | Energy | Moisture | Protein | Fat |
  |---|---|---|---|---|
  | Atta (A019) | 1340 kJ = 320 kcal | 11.1% | 10.57 g | 1.53 g |
  | Maida (A018) | 1472 kJ = 352 kcal | | | |
  | Parboiled milled rice (A014) | 1471 kJ = 352 kcal | 10.09% | | |
  | Raw milled rice (A015) | 1491 kJ = 356 kcal | | | |
  | Green gram dal (B010) | 1363 kJ = 326 kcal | | | |
  | Red gram dal (B021) | 1384 kJ = 331 kcal | | | |
  | Lentil dal (B013) | 1349 kJ = 322 kcal | | | |
  | Black gram dal (B003) | 1356 kJ = 324 kcal | | | |

  All of these are averaged over 6 regions. — [IFCT 2017 values, npm @ifct2017/compositions](https://unpkg.com/@ifct2017/compositions/index.csv)
- **NIN DGI 2011, Annexure 8 "Approximate Calorific Value of Some Cooked Preparations"** (kcal per serving):
  - Cereals: rice 1 cup 170; **phulka 1 = 80**; paratha 1 = 150; **puri 1 = 80**; idli 2 = 150; **dosa 1 = 125**; khichdi 1 cup 200; poha 1 cup 270; upma 1 cup 270.
  - Pulses: **plain dhal ½ cup = 100**; sambar 1 cup = 110.
  - Vegetables and meat: vegetable with gravy 1 cup 170, dry 1 cup 150; chicken curry ¾ cup 240.
  - Snacks: **bajji/pakora 8 = 280**; **samosa 1 = 200**; masala dosa 1 = 200; **pea kachori 2 = 380**; vada 2 = 140.
  - The same document defines **1 cup = 200 ml, 1 teaspoon = 5 ml, 1 tablespoon = 15 ml**. — [NIN Dietary Guidelines for Indians, 2011 (PDF)](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- NIN DGI 2011 portion definitions (Annexure 14), **raw g per portion**: cereals & millets 30 g = 100 kcal; pulses 30 g = 100 kcal; milk 100 ml = 70 kcal; fat & oils 5 g = 45 kcal; vegetables 100 g; fruits 100 g; sugar 5 g. The sample meal plan for a sedentary man: lunch cereals 120 g → "Rice 2 cups + Pulkas 2"; pulses 20 g → "Dhal ½ cup"; vegetables 150 g → "veg curry ¾ cup". Visible fat is **25 g/day (man) and 20 g/day (woman)**. — [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- DGI 2024 (released May 2024) expresses recommendations as daily **raw** amounts: cereals 250 g, pulses 85 g, vegetables 400 g, fruits 100 g, nuts 35 g, milk 300 ml, fats/oils 25–30 g (27–30 g in one table), salt 5 g. Reference adult: 65 kg sedentary man at 2000 kcal. It introduces "My plate for the day". India, China and WHO use raw-gram units, while the US uses cup and ounce equivalents. — [Shah, Sachdeva, Chaudhari, IJMR 2025;162(1):53-65](https://ijmr.org.in/dietary-guidelines-across-different-countries-comparisons-to-dietary-guidelines-for-indians-2024/)
- INDB used "IFCT 2004" for 369 items not in IFCT 2017. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)

### Inferences
- The NIN per-serving values imply small servings. Phulka at 80 kcal ≈ 25 g atta. ½ cup (100 ml) dal at 100 kcal ≈ 20 g dry pulse + a little fat. Rice at 170 kcal per 200 ml cup is about 127 kcal/100 g if a 200 ml cup holds about 134 g. That 134 g is scaled from USDA's 158–163 g per 240 ml cup and is an assumption, not a NIN figure.
- NIN per-serving fried-snack values (puri 80 kcal; samosa 200; 8 pakoras 280) contradict INDB's per-100 g fried values by roughly 2–3×, given any realistic piece weight.
- "IFCT 2004" in INDB most likely refers to NIN's older *Nutritive Value of Indian Foods* tables (Gopalan et al., reprinted 2004). This is an inference; it was not confirmed from a primary source.

### Gaps
- The DGI 2024 PDF URL ([nin.res.in/.../DGI24thJune2024fin.pdf](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI24thJune2024fin.pdf)) returned 404 or HTML on fetch. It was not confirmed whether DGI 2024 keeps the 2011 cooked-preparation calorie annexure or the 200 ml cup.
- The IFCT 2017 PDF text could not be extracted (encoded fonts). The analytical methods (proximate analysis, energy factors used to compute kJ) were not verified. One check: the IFCT atta energy (1340 kJ) is not reproduced by 17/37/17 kJ/g factors plus 8 kJ/g fibre, so the exact energy-factor convention is unverified.
- No NIN dataset of cooked or standard recipes with measured composition was found. NIN apps (e.g., "Nutrify India Now") were not researched.
- The details of NIN's older NVIF (Gopalan) tables were not verified in this session.

## 3. Why USDA values for Indian foods differ (roti, dal, rice), with worked dry-matter comparisons

### Takeaway
Almost all of the big cross-source gaps are **water and fat, not the flour or the pulse**. On a dry-matter basis, roti, dal and rice energy agree across INDB, USDA and lab analysis to within ~15%. The headline numbers differ because:
- USDA's roti is a **commercial, frozen, fat-containing** product (7–9 g fat, 33–35% water);
- USDA's "Dal" is **thick boiled lentils + 4% ghee** (66% water);
- INDB's dal has ~87% water and its roti is raw dough;
- the "97" rice row is **glutinous** rice.

For deep-fried foods, INDB, not USDA, is the outlier.

### Cited Findings
**USDA records (fetched via the FDC API, Nov 2026)**
- **FDC 2707713, Survey (FNDDS), "Bread, chappatti or roti"**: 299 kcal, protein 7.85, **fat 9.2**, carbohydrate 46.1, fibre 9.7, **water 35.4 g**. Its only input food is 100 g of SR "Bread, chapati or roti, whole wheat, commercially prepared, frozen". Portions: small 6" = 27 g, **medium 7" = 40 g**, large 8" = 52 g, "quantity not specified" = 40 g. Published 10/31/2024. — [FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/nutrients)
- **FDC 171844, SR Legacy, "Bread, chapati or roti, plain, commercially prepared"**: 297 kcal, protein 11.25, **fat 7.45**, carbohydrate 46.36, **water 33.0 g**, "piece" = 68 g. FDC 174075 (whole wheat, commercially prepared, frozen): 299 kcal, fat 9.2, water 35.4. — [FDC 171844](https://fdc.nal.usda.gov/food-details/171844/nutrients); [FDC 174075](https://fdc.nal.usda.gov/food-details/174075/nutrients)
- **FDC 2707427, Survey (FNDDS), "Dal"**: 145 kcal, protein 8.6, fat 4.31, carbohydrate 19.2, fibre 7.5, **water 66.3 g**. The recipe is "Lentils, mature seeds, cooked, boiled, without salt" 96 g + "Butter oil, anhydrous" (ghee) 4 g + salt 0.8 g. 1 cup = 240 g. Category: Beans, peas, legumes. — [FDC 2707427](https://fdc.nal.usda.gov/food-details/2707427/nutrients)
- Rice:
  - FDC 2708408 "Rice, white, cooked, no added fat" (FNDDS): 129 kcal, water 68.0.
  - **FDC 2708404 "Rice, white, cooked, made with oil"**: **151 kcal**, fat 3.12, water 66.1. Recipe: 158 g cooked rice + 4.67 g vegetable oil + 1 g salt per cup; 1 cup cooked = 163 g.
  - **SR 169711 "Rice, white, glutinous, unenriched, cooked"**: **97 kcal**, water 76.6.
  - SR 168930 medium-grain white rice, cooked, unenriched: 130 kcal.
  
  — [FDC 2708404](https://fdc.nal.usda.gov/food-details/2708404/nutrients); [FDC 2708408](https://fdc.nal.usda.gov/food-details/2708408/nutrients); [FDC 169711](https://fdc.nal.usda.gov/food-details/169711/nutrients); [FDC 168930](https://fdc.nal.usda.gov/food-details/168930/nutrients)

**Independent lab-analysed Indian cooked foods: Chiplonkar & Agte 2007**
- Agharkar Research Institute, Pune: 104 cooked foods and 92 composite meals, each analysed in 5 independent replicates in duplicate, using NIN manual methods. Food-table values **adjusted for the observed cooked moisture** matched lab energy within **~3.1% on average** (95% CI 1.9–4.2%). Fat differed significantly for most groups, and vitamins were overestimated by 28–56%. — [Chiplonkar & Agte, Asia Pac J Clin Nutr 2007;16(2):227-239](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- Lab values per 100 g cooked weight from the same paper, Appendix I. These were Pune home-style preparations; rice and legumes were pressure-cooked.

  | Dish | Water | Energy | Notes |
  |---|---|---|---|
  | **Chapati** (whole wheat) | 34.7 g | **305 kcal** | fat 9.2 (this chapati contains fat) |
  | Jowar roti | 31.2 g | 280 kcal | fat 1.7 |
  | Bajra roti | 28.7 g | 309 kcal | |
  | Ragi roti | 36.9 g | 253 kcal | |
  | Aloo paratha | 55.5 g | 205 kcal | fat 6.0 |
  | Methi paratha | 38.8 g | 276 kcal | |
  | **Puri** | 23.1 g | **396 kcal** | **fat 17.8** |
  | **Plain rice** | 73.7 g | **105 kcal** | |
  | Rice + split green gram (khichdi) | 80.2 g | 90 kcal | |
  | **Split redgram curry** (toor dal) | 84.9 g | **68 kcal** | fat 1.7 |
  | Green gram | 83.0 g | 80 kcal | |
  | Lentil | 68.6 g | 142 kcal | fat 4.0 |
  | Legume-group mean (n=17) | 17.4 g dry part (~83% water) | 77 kcal | |

  — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)

**Worked comparisons.** Dry-matter (DM) energy = kcal ÷ (100 − water) × 100. Computations are by this researcher from the cited values.
- **Roti**:
  - INDB: 202 kcal at ~48% water → **3.88 kcal/g DM**.
  - USDA SR: 297 at 33% → **4.43**.
  - Lab chapati: 305 at 34.7% → **4.67**.
  - Plain atta (IFCT, no fat): 320.3 ÷ 88.9 → **3.60**.
  
  The DM differences come from fat. USDA and lab chapatis carry 7–9 g fat vs 3.6 g in INDB. A plain phulka from IFCT atta at ~35% cooked moisture works out to ≈ **234 kcal/100 g**, and with 1 tsp ghee per 80 g atta (INDB's recipe) ≈ **252**. Per 40 g roti (the FNDDS "medium"): INDB 81, plain phulka ≈ 94, with ghee ≈ 101, USDA 119, lab chapati 122. NIN gives 80 kcal/phulka. — [FDC 171844](https://fdc.nal.usda.gov/food-details/171844/nutrients); [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf); [IFCT values](https://unpkg.com/@ifct2017/compositions/index.csv); [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **Dal**:
  - INDB moong dal: 50 kcal at ~87% water → ~3.8 kcal/g DM.
  - USDA "Dal": 145 at 66.3% → 4.30.
  - Lab toor dal: 68 at 84.9% → 4.50.
  - Lab lentil: 142 at 68.6% → 4.52.
  
  Dry-pulse concentration is ≈10.7 g per 100 g in INDB, ≈20 g per 100 ml in NIN's "½ cup dhal = 20 g pulses = 100 kcal", and roughly 30+ g in USDA's boiled-lentil dal. Boiled lentils at ~115 kcal against ~320–350 kcal dry implies ~3× yield. **The 3× gap between 50 and 145 is consistency (water), not composition.** Is 44–50 kcal/100 g plausible? Yes for thin, home-style dal: lab-analysed Indian dals measured 50–80 kcal at 83–89% water. — [FDC 2707427](https://fdc.nal.usda.gov/food-details/2707427/nutrients); [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf); [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- **Rice** (97/117/151):
  - INDB 117 at 70% water → 3.91 kcal/g DM.
  - USDA plain 129 at 68% → 4.03.
  - Lab plain rice 105 at 73.7% → 3.99.
  - 97 is **glutinous** rice (wrong match).
  - 151 is rice **cooked with oil** (USDA adds ~3 g fat/100 g).
  
  Plain cooked rice is **~105–130 kcal/100 g**, with the spread driven by water ratio and the drained vs absorption method. — [FDC 169711](https://fdc.nal.usda.gov/food-details/169711/nutrients); [FDC 2708404](https://fdc.nal.usda.gov/food-details/2708404/nutrients); [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **Deep-fried items** (INDB vs lab, per 100 g):

  | Item | INDB | Lab | Overstatement |
  |---|---|---|---|
  | Poori | 738 kcal / 77.6 g fat | 396 kcal / 17.8 g fat | ~1.9× |
  | Khasta kachori vs moong-dal kachori | 713 | 330 (fat 12.0) | ~2.2× |
  | Pakora | 672–713 | onion pakoda 208 (fat 9.0) | ~3.3× |
  | Medu vada | 745 | 272 (fat 13.5) | ~2.7× |
  | Vegetable samosa (INDB paper) | 443 | 261 (fat 10.9) | ~1.7× |

  — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf); [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- **Dosa**:
  - INDB plain dosa 381 (dry-ingredient basis) vs masala dosa 165 (potato and water dilute it).
  - Lab dosa (3:1 rice:urad, with potato filling) 260 kcal at 39.5% water; lab idli + chutney 231.
  - NIN: dosa 125 kcal/piece; masala dosa 200/piece.
  
  — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf); [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- UK work found recipe calculation that includes water loss and fat uptake: water loss up to 24% across 10 South Asian dishes, and puri fat uptake up to **18.4 g/100 g**. Calculated values were generally above analysed values. — [Chen, Gilbert & Khokhar, Food Chem 2009;113(3):825-831 (White Rose eprint)](https://eprints.whiterose.ac.uk/5414)

### Inferences
- "Users report numbers too high" is consistent with three confirmed paths:
  - (1) USDA commercial roti (297, 7–9 g fat) used for home phulkas (~230–250 kcal/100 g, ~2–4 g fat) → ~20–25% too high per gram;
  - (2) USDA thick-lentil dal (145) used for thin home dal (50–100) → 1.5–3× too high per gram;
  - (3) INDB fried and dry-basis rows (poori, pakora, kachori, plain dosa, BFP554 khichdi 383, maa chaane ki dal 345) → 1.5–3.3× too high.
  
  INDB's thin-dal and raw-dough roti values err in the other direction (too low).
- For watery dishes, kcal/100 g is the wrong thing to "pick a source" for. The robust quantity is **dry ingredient per serving** (g dal per katori, g atta per roti) + fat per serving. Water only changes the gram weight.
- USDA is fine for what it describes (US commercial and FNDDS recipes). It is mismatched to Indian home cooking, not wrong.

### Gaps
- USDA FNDDS entries for dosa, idli, puri and samosa could not be retrieved: the API DEMO_KEY was rate-limited (429) and STEADY's FDC key is not in the local `.env`. Re-run with the project key.
- SR "Lentils, boiled, without salt" (FDC 172421) was not fetched. ~115 kcal is back-calculated from FNDDS 2707427, not read directly.
- The lab chapati (9.2 g fat) is a Pune preparation. No lab value for a plain fat-free North Indian phulka was found.

## 4. Recipe calculation methods (EuroFIR/INFOODS/USDA) and frying fat absorption

### Takeaway
The EuroFIR harmonised procedure handles the two things INDB skipped. It applies a **weight yield factor at recipe level** (cooked weight ÷ raw weight) and **retention factors at ingredient level**. For frying, it inserts **only the fat absorbed**, not the frying medium. Lab data put the fat in Indian deep-fried items at ~9–18 g/100 g of finished product, not 70–90 g.

### Cited Findings
- EuroFIR guideline for food business operators (14 pp.; published as Machackova et al., *Food Chemistry* 238 (2018) 35–41) defines "Yield factor (YF) = Total cooked weight (g) / Total weight of raw ingredients (g)". It advises: "Use a cooking test to determine your own weight yield factor (YF) for your recipe", or borrow YFs from the literature (e.g., Bognár 2002). — [EuroFIR recipe guideline PDF](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf); [Quadram citation](https://quadram.ac.uk/publications/eurofir-guideline-on-calculation-of-nutrient-content-of-foods-for-food-business-operators-food-chemistry-238-2018-35-41/)
- Same guideline, on frying: "Fat used as a cooking medium is to be considered in some types of foods (e.g. frying breaded schnitzel, French fries) because fat intake could be significant and cannot be omitted in calculations. In this case insert only the amount of fat absorbed." It defines the yield-factor weight change as "a result of moisture (e.g. water) and solid (e.g. fat) losses or gains". — [EuroFIR recipe guideline PDF](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf)
- The EuroFIR harmonisation proposal (Reinivuo & Laitinen, 2007) recommends weight yield at **recipe level** and nutrient retention at **ingredient level**, as the method most widely used in European databases. — [Final recipe calc harmonisation PDF](https://www.eurofir.org/how-do-recipes-and-composite-foods-come-to-their-nutritional-values/wp-content/uploads/Final_recipe_calc_harmonisation.pdf); background rules report: [Vásquez-Caicedo et al. 2007](https://fao.org/uploads/media/vasquez-caicedo_et_al__2007_recipe_rulesD2.2.9_02.pdf); partner inventory: [Reinivuo 2007](https://www.fao.org/uploads/media/reinivuvo_2007_Eurofir_inventory_recipes_D2.2.12_M2.2.4_02.pdf)
- INDB applied USDA Release 6 retention factors (micronutrients only, sensitivity analysis) and no yield factors. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Indian-food fat uptake evidence:
  - Lab-analysed puri 17.8 g fat/100 g; medu vada 13.5; potato vada 17.3; kachori 12.0; samosa 10.9; onion pakoda 9.0; vegetable cutlet 19.5 — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf).
  - Puri fat uptake up to 18.4 g/100 g by recipe calculation with fat-uptake parameters — [Chen, Gilbert & Khokhar 2009](https://eprints.whiterose.ac.uk/5414).
  - Poori reported at 24% fat, the highest of the traditional fried cereal products studied (others 5–13%), citing Sharavathy et al. 2001. Oil uptake depends on dough moisture. — [PMC4486596](https://pmc.ncbi.nlm.nih.gov/articles/PMC4486596)
- Chiplonkar & Agte show the practical shortcut: raw-food-table values **adjusted for the measured moisture of the cooked dish** reproduce lab energy within ~3%. Their worked example derives a dish-specific correction factor from raw vs cooked weights. — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)

### Inferences
- A correct INDB-style recalculation for STEADY would:
  - (1) sum raw-ingredient nutrients excluding frying oil;
  - (2) add absorbed fat at ~10–18 g per 100 g finished product, or ~5–15% of dough or batter weight, calibrated to the lab values above;
  - (3) divide by **cooked** weight = raw weight × YF, using dish-class YFs or target cooked moisture from Chiplonkar & Agte (e.g., roti ~35%, rice ~70–74%, dal ~83–87%, puri ~23%, dosa ~40%).
- Fixing energy and macros only needs yield and fat absorption. Retention factors matter only for vitamins, which STEADY does not display.

### Gaps
- Bognár (2002) yield tables and the FAO/INFOODS yield database were not retrieved, so there are no published per-dish YFs specifically for chapati, dal or dosa beyond the lab moisture values above.
- The pakora and samosa oil-uptake percentages in the frying-chemistry papers found by search (JMBFS etc.) were not read in full.

## 5. Indian household measures and standard portions (katori, bowl, glass, roti, rice)

### Takeaway
There is **no national standard katori**. Published studies calibrate household utensils locally, and NIN uses a 200 ml cup. Roti size is the main portion variable (27/40/52 g for 6/7/8-inch in USDA FNDDS; NIN's 80 kcal phulka implies ~25 g flour). Reference portion sizes from national surveys can badly underestimate real servings (55–60% in one Haryana study).

### Cited Findings
- NIN: 1 cup = 200 ml, 1 tsp = 5 ml, 1 tbsp = 15 ml. Standard raw portion = 30 g cereal ≈ 100 kcal, 30 g pulse ≈ 100 kcal, 5 g fat = 45 kcal. Meal plan: 20 g pulses → "dhal ½ cup", 120 g cereals → "rice 2 cups + 2 pulkas". — [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf)
- USDA FNDDS chapati portions: small 6" = 27 g, medium 7" = 40 g, large 8" = 52 g. SR Legacy "piece" = 68 g (commercial). Cooked white rice: 1 US cup = 158–163 g. Dal: 1 cup = 240 g. — [FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/nutrients); [FDC 171844](https://fdc.nal.usda.gov/food-details/171844/nutrients); [FDC 2708404](https://fdc.nal.usda.gov/food-details/2708404/nutrients); [FDC 2707427](https://fdc.nal.usda.gov/food-details/2707427/nutrients)
- Gupta N, Verma S, Singh A, Tandon N, Puri S, Arora NK. "Adaptation of Locally Available Portion Sizes for FFQs…", *Indian J Community Med* 2016;41(3):228. A Haryana utensil survey (74 serving utensils, 27 households) derived bowl/serving sizes of **small 240 ml, medium 320 ml, large 600 ml**. Reference portion sizes used in national surveys "would have underestimated the food consumed by the child by 55–60%". — [PMC4919938](https://pmc.ncbi.nlm.nih.gov/articles/PMC4919938)
- A northern-India FFQ validation used a **katori labelled as 200 g** and a 200 ml glass as visual aids. This is from a search snippet; the full text was not read. — [NMJI 2014;26(5)](https://nmji.in/nmji/archives/Volume-26/Issue-5/OA-II-26-5-2014.pdf)
- NINA-DISH (India Health Study; 3,908 adults aged 35–69 in New Delhi, Mumbai and Trivandrum) is an interviewer-administered software tool with portion-size questions, linked to a nutrient database "modified from a set of existing international databases containing data on Indian foods and recipes". A search snippet says it used household measures (glasses, katoris, spoons) and **cardboard cut-outs in five sizes for chapati/dosa/paratha**; the full text was not accessible. — [Daniel et al., Br J Nutr 2014 (Europe PMC)](https://europepmc.org/article/PMC/PMC5652307)
- A University of Delhi (Lady Irwin College) team developed food-photograph-series software for portion estimation in urban North Indian adults: 368 recipes and photographs of 313 food items (*Mediterranean J Nutr Metab* 2023, doi 10.3233/MNM-230039). Details are from a search snippet; the page returned 403. — [IOS Press MNM230039](https://content.iospress.com/articles/mediterranean-journal-of-nutrition-and-metabolism/mnm230039)
- INDB itself stores "number of servings" and "serving size" per recipe, but serving sizes are missing for pickles/preserves and weaning foods. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)

### Inferences
- Reasonable defaults with stated uncertainty:
  - **roti/phulka** 30–40 g cooked (from ~25–30 g atta); "small" ≈ 27 g, "large" ≈ 50 g;
  - **katori** 150–200 ml, but treat it as user-calibratable, since studies use 200 g and local surveys find 240–320 ml "medium" bowls;
  - **cup of cooked rice** ≈ 130–160 g (200–240 ml);
  - **glass** 200 ml.
  
  These are synthesis, not a single authoritative standard.
- Portion error is likely larger than per-100 g error for Indian meals. One survey found 55–60% underestimation from reference portions, while the per-100 g gaps are ±20% on a dry-matter basis. Asking the user for piece size or katori size probably beats switching sources.

### Gaps
- No ICMR-NIN publication giving a canonical katori volume or bowl/plate weights was found.
- No validated photo atlas with published weights for Indian dishes was accessible. Details of the Lady Irwin tool and any NIN atlas remain unverified.
- Regional variation in roti size (e.g., thin Gujarati rotli vs thick North Indian roti vs Maharashtrian poli) has no quantitative source here.

## 6. Other Indian datasets and tools

### Takeaway
Besides IFCT and INDB, the useful *documented* sources are lab-analysed cooked-food datasets (Chiplonkar & Agte 2007, Pune, 246 foods/meals), NIN's per-serving cooked values, and UK CoFID's South Asian dishes. Commercial apps (HealthifyMe etc.) are undocumented and closed. RecipeDB uses USDA nutrition, not Indian tables.

### Cited Findings
- Chiplonkar & Agte 2007: a lab database of **246 cooked foods and meals** from Pune, with full proximate and micronutrient values per 100 g cooked weight (Appendix I). This is the best open source found for cooked Indian moisture and fat. — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- UK CoFID "include[s] a large range of Indian foods due to the popularity of Indian cuisine in the United Kingdom". INDB used it for 144 ingredients. Khokhar's group produced analysed and recipe-calculated values for South Asian dishes eaten in the UK. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/); [Chen, Gilbert & Khokhar 2009](https://eprints.whiterose.ac.uk/5414)
- RecipeDB (IIIT-Delhi, Ganesh Bagler's lab): 118,171 recipes and 23,548 ingredients from global recipe sites, with nutrition from **USDA** profiles. — [Batra et al., Database 2020 (PMC7687679)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7687679/)
- The INDB authors say RecipeDB and apps such as HealthifyMe "lack documentation of their methodology, and the databases underlying them are not open-access". — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- FKG.in (Gupta, Dey, Das, Trilok-Kumar, Jain; arXiv 2412.05248, v3 Sep 2025): a knowledge-graph + LLM workflow to compute Indian recipe composition from IFCT, INDB and the Nutritionix API. It is a work in progress with no accuracy evaluation reported. — [arXiv 2412.05248](https://arxiv.org/abs/2412.05248)
- NINA-DISH nutrient database (India Health Study): built for epidemiology, adapted from international databases with Indian recipes. No public download was found. — [Daniel et al. 2014](https://europepmc.org/article/PMC/PMC5652307)
- Regional analysed-recipe studies exist (e.g., Assam cereal/pulse recipes; Himachal sesame preparations; Das et al. 2005–2009, Singh et al. 2003), cited by INDB as the only analysed composite-dish data. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)

### Inferences
- For calibrating cooked-dish moisture and absorbed fat, Chiplonkar & Agte's appendix is directly usable as a reference table. It covers the main Indian staples (roti types, rice, dals, fried snacks, idli/dosa, poha, upma).
- Commercial app values (HealthifyMe, Nutritionix India) cannot be audited and should not be treated as ground truth.

### Gaps
- Not researched or verified this session: Open Food Facts India coverage, INDDEX24 India content, HealthifyMe's claimed database size, Nutritionix India, MDRF (Chennai) South Indian cooked-food databases, and state-level databases. The search returned nothing citable for Open Food Facts India or HealthifyMe size.

## 7. Recommendation: defaults for (a) cooked Indian dishes, (b) raw Indian ingredients, (c) Western/packaged foods, and handling home-cooking oil variance

### Takeaway
No single source should be the default for cooked Indian dishes as-is.
- **(a) Cooked Indian dishes:** use INDB as the **recipe skeleton** but repair it. Apply a cooked yield (target moisture) and replace frying oil with absorbed fat. Sanity-check against lab-analysed values (Chiplonkar & Agte) and NIN per-serving values. Quarantine INDB fried and no-water rows until repaired.
- **(b) Raw Indian ingredients:** IFCT 2017.
- **(c) Generic Western foods:** USDA (Foundation/SR/FNDDS). **Packaged foods:** labels.
- **Oil:** model it as an explicit, adjustable per-serving component.

### Cited Findings (evidence underpinning the recommendation)
- IFCT 2017 is analytical, multi-region, and covers 528 key raw foods; INDB is calculated and has no yield factor. — [Vikaspedia](https://en.vikaspedia.in/viewcontent/health/nutrition/nutritive-value-of-foods/indian-food-composition-tables?lgn=en); [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- Raw-table values corrected to cooked moisture match lab energy within ~3%, which supports "IFCT + yield" as a sound basis for cooked dishes. — [APJCN 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- EuroFIR: count only the fat absorbed; determine YF by cooking test or literature. — [EuroFIR guideline](https://www.eurofir.org/wp-admin/wp-content/uploads/2015/12/EUROFIR-RECIPE-GUIDELINE_FINAL.pdf)
- INDB excludes packaged foods. — [PMC11277795](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795/)
- USDA roti and dal entries describe a commercial frozen chapati (7–9 g fat) and a thick lentil + ghee dish. — [FDC 2707713](https://fdc.nal.usda.gov/food-details/2707713/nutrients); [FDC 2707427](https://fdc.nal.usda.gov/food-details/2707427/nutrients)
- NIN's visible-fat guidance is 20–25 g/day (DGI 2011) and 25–30 g/day (DGI 2024 summary). INDB's standard dal uses 1 tsp oil per 30 g-dal serving, and NIN's fat portion is 5 g = 45 kcal. — [NIN DGI 2011](https://nin.res.in/downloads/DietaryGuidelinesforNINwebsite.pdf); [IJMR 2025](https://ijmr.org.in/dietary-guidelines-across-different-countries-comparisons-to-dietary-guidelines-for-indians-2024/); [recipes.xlsx](https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/recipes.xlsx)

### Inferences (opinion and synthesis, flagged as such)
- **(a) Cooked Indian dishes — repaired-INDB default with lab cross-check:**
  - (1) For deep-fried rows, replace the "for frying" oil (240/480 ml) with absorbed fat targeting the lab values: ~10–18 g fat/100 g (puri ~18, vada ~13–17, kachori ~12, samosa ~11, pakora ~9).
  - (2) For breads, divide by cooked weight at ~30–38% moisture.
  - (3) For dal and curry, either keep INDB's thin-dal per-100 g and let portion carry the variation, or (better) store dal as "g dry pulse + g fat per katori" and offer thin/medium/thick: ~50 / ~80–100 / ~140 kcal/100 g, anchored by INDB, lab and NIN, and USDA/lab-lentil respectively.
  - (4) For no-water batter rows (plain dosa, pesarattu, BFP554, OSR155), add the water and cook-out. Lab dosa is ~260 kcal at ~40% water; NIN's 125 kcal per dosa gives a per-piece check.
  - Until repaired, flag INDB rows with fat ≥40 g/100 g (excluding fats, nuts and oilseeds) or kcal ≥450 for non-dry dishes, and prefer an alternative.
- **Sanity bounds for cooked staples** (synthesised from lab + NIN + USDA):
  - plain phulka 230–260 kcal/100 g (~80–100 kcal per 30–40 g piece);
  - plain rice 105–130;
  - thin–medium dal 50–100;
  - poori 350–400;
  - plain dosa ~200–260 per 100 g, ~125 per piece.
  
  Values far outside these ranges should be flagged.
- **(b) Raw ingredients:** IFCT 2017 (kJ ÷ 4.184), keeping the existing `(raw)` suffix rule so raw rows never satisfy cooked queries. Use USDA SR/Foundation only for ingredients missing from IFCT, as INDB itself did (via UK CoFID/USDA).
- **(c) Western/packaged:** USDA Foundation/SR/FNDDS for generic Western foods. For Indian packaged foods, use label data (FSSAI-mandated panels, Open Food Facts), since neither IFCT nor INDB covers them.
- **Oil and ghee variance:** represent cooked dishes as base dish (standard recipe oil) + an oil-level modifier (none / light ≈ ½ tsp / normal ≈ 1 tsp ≈ 4.5 g / heavy ≈ 2–3 tsp per serving). Show it in the UI, because a 1-tsp difference (~40 kcal) is comparable to the whole thin-dal serving's non-fat energy. Restaurant and dhaba versions need a higher default.

  The magnitude of restaurant oil use is **unsourced** (see Gaps).
- **Cross-source conflict rule:** compare values on a dry-matter, fat-adjusted basis before declaring a conflict. If they agree after adjusting for water and fat, the "conflict" is a state or recipe mismatch (raw vs cooked, thin vs thick, commercial vs home), and the fix is matching the right state, not choosing a "winner".

### Gaps
- No published study quantifying home vs restaurant oil use per Indian dish was found. No validated yield-factor table specific to Indian dishes was found beyond the Chiplonkar & Agte moisture values.
- No head-to-head accuracy evaluation of INDB vs USDA vs IFCT-plus-yield against weighed, lab-analysed Indian meals in a calorie-tracking context was found.
- The proposed sanity ranges are the researcher's synthesis from the cited lab, NIN and USDA values. They should be validated with STEADY's eval harness before being hard-coded.
