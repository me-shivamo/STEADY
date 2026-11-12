# Resolving conflicting nutrient values across food composition sources, and building one canonical value per food concept

*Research notes compiled 2026-11-12 for STEADY (Supabase Postgres; India first, then US, then global; shared verified food table mixing USDA FDC, INDB and IFCT 2017). "Cited Findings" are evidence, with a source date where known. "Inferences" are opinion or synthesis, including the proposed STEADY playbook. Several primary PDFs (EuroFIR QI guidelines, the USDA-vs-EuroFIR comparison report, FNDDS documentation, the FAO/INFOODS conversion guideline) could not be text-extracted in this environment. Where a finding rests only on a search-engine summary or abstract, it says so.*

## 1. FAO/INFOODS compilation guidance: analytical vs borrowed vs recipe-calculated values, source hierarchy, provenance flags

### Takeaway
FAO/INFOODS does not set a rigid "own-country analytical > regional > borrowed > calculated" ladder. The rules are: prefer values from validated analytical methods, only compare or aggregate foods that match on identity, part, processing state and water/fat content, rate recipe-calculated values below analytical ones, recalculate energy yourself instead of copying it, and document at value level why each value was chosen. The strongest rule for STEADY's conflicts is the one about water. Raw and cooked foods, or dishes with different water contents, must never be averaged or compared directly. Recipes must apply yield factors, and summing raw ingredients is "not recommended" for cooked dishes.

### Cited Findings
**Greenfield & Southgate, *Food Composition Data*, 2nd ed. (FAO, 2003), Ch. 10 "Quality considerations in the compilation of a food composition database"**
- Preference "should be given to values obtained by means of validated methods" that match methods in international use. With many values, use the mean (or median). With few or highly variable values, the compiler judges reliability from sample documentation, method and QA, and "must record the evidence used to select the values." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Recipe-based estimates using retention factors "must be assigned lower confidence levels than analytical values." When a questionable value is the only one available, "one can only retain the questionable value and assign to it a lower confidence code." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Borrowed values must be traced to their original source, because a citation "frequently leads only to another set of tables." Before combining samples, "the compiler must consider whether the different samples of foods are compatible," which "requires comparing water and fat contents." The compiler must also consider "whether the adjustment of values to a constant base is justified." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Older values should be replaced only with evidence of real change. "Differences not obviously due to these factors must be investigated." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Seasonal or consumption-weighted means are allowed if the weighting is documented. Separate records should be kept for distinct varieties: a single "apple" record is inappropriate when cultivar data exist. — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Audit trail: keep a "changes" database recording the reason for every change, and never reuse food codes. "Foods that cannot be unambiguously identified should be flagged as such in the database." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Recipe calculation is covered in Appendix 6, "Calculation of the composition of dishes prepared from recipes." — [FAO 2003 table of contents](https://www.fao.org/4/y4705e/y4705e00.htm)

**FAO/INFOODS *Guidelines for Checking Food Composition Data prior to the Publication of a User Table/Database*, v1.0 (2012; Charrondière, Stadlmayr, Haytowitz, Oseredczuk et al.)**
- Database management has three tiers. The **archival DB** holds original data as received, including own analyses. The **reference DB** is where data are aggregated, calculated, estimated, compared, evaluated, completed and quality-rated. The **user DB/table** holds the published selection. Checks run at every level, with a final check before release. — [FAO/INFOODS 2012, ap810e](https://www.fao.org/3/ap810e/ap810e.pdf)
- The reference DB should carry a "standardized nutrients" field that "will contain the selected value to be published in the user table/DB," alongside all raw tagnames. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- "Values of different INFOODS tagnames cannot be compared or combined directly, because different analytical methods, definitions or expressions for these components yield significantly different values." Only values with the same tagname and keywords may be combined. Example: crude fibre (FIBC) must be excluded when averaging total dietary fibre (FIBTG). — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- "It is advisable to avoid copying calculated values from other sources (e.g. energy or vitamin equivalents). These values should always be calculated in ones own DB based on the contributing values and the definition chosen." The checklist adds "No energy values of the user table/DB were copied from other sources", and kJ should not be derived from kcal. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Water: "Only foods with similar water contents have been aggregated. If water contents of food items were significantly different, their nutrient values should have been adjusted before aggregation (e.g. check that values of raw and boiled rice were not aggregated...)." Water should be given for every food and should match the food description. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Recipes: "For recipe calculations, yield factors (YF) and nutrient retention factors (RF) must be applied." The methods are the ingredient method, the recipe method, the mixed method (YF at recipe level, RF at ingredient level), and the "Raw ingredient method: i.e. summing nutrient values of raw ingredients without applying any factors (not recommended except for raw dishes, e.g. fruit salad, sandwiches)." For high-YF foods such as boiled rice, it is better to add the ingredient plus its water in the recipe calculation. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Recipe checks: added water is often missing from cookbook ingredient lists, and so is added or absorbed fat (frying, butter). The same calculation system and the same set of YF/RF should be used for all cooked foods. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Regional naming: "Recipes may be named differently within countries even if they contain the same ingredients; or recipes may have the same name but contain different ingredients depending on the region. A solution to this would be to add the varying ingredients and/or region to the recipe name." — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Documentation: methods, sampling and sources should be documented at value level. If that is not possible, document at least the component level and the food level ("whether food was borrowed, is a recipe or was analysed"). Documentation in the reference DB "would allow revision of quality assessment if their criteria evolve over time." — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Missing values may be estimated from a similar food, calculated by recipe, or presumed zero when the food is known not to contain the nutrient (e.g. vitamin C in oils). — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Companion guidelines (all v1.0, 2012): Food Matching; Converting Units, Denominators and Expressions; Checking. — [INFOODS standards & guidelines page](https://www.fao.org/infoods/infoods/standards-guidelines/en/)

**How the Indian sources were built**
- INDB (Vijayakumar, Dubasi, Awasthi, Jaacks; *Current Developments in Nutrition* 8(7):103790, June 2024) uses this ingredient hierarchy: IFCT 2017, then IFCT 2004 (with 2017 winning on duplicates), then UK CoFID for missing nutrients or ingredients (144 ingredients), then USDA FDC (54 ingredients). — [Europe PMC full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11277795/fullTextXML)
- INDB recipe values are the sum of ingredient values "per 100 g of the recipe." No yield-factor (cooking weight change) correction was applied. The authors list "correction for loss or gain in weight while cooking, generally referred to as yield factor" as a next step. Retention factors were used only in a sensitivity analysis, and only 42.62% of ingredients matched one. No cooked dishes were lab-analysed ("cost-prohibitive"). Against UK FCT composite dishes, differences were "nonsystematic". The authors judged HealthifyMe and RecipeDB not open-access or methodologically documented. — [Europe PMC full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11277795/fullTextXML)
- Lab-analysed Indian cooked foods (Chiplonkar & Agte, *Asia Pac J Clin Nutr* 2007;16(2):227-239; Pune; 104 foods plus 92 meals, five replicates each, NIN methods), per 100 g:
  - chapati: water 34.7 g, 305 kcal, protein 8.0 g, fat 9.2 g, CHO 47.5 g
  - green gram preparation: water 83.0 g, 80 kcal
  - split redgram curry: water 84.9 g, 68 kcal
  — [Chiplonkar & Agte 2007 PDF](https://apjcn.qdu.edu.cn/16_2_22.pdf)

### Inferences
- **STEADY's example conflicts are mainly water and cooking-state conflicts, not composition disagreements.** Dividing the 2007 lab values by dry matter gives a fairly stable energy density for cooked cereal and legume dishes: chapati 305/0.653 ≈ 467, green gram 80/0.17 ≈ 471, redgram curry 68/0.151 ≈ 450 kcal per 100 g dry matter. Assuming a similar dry-matter energy density of roughly 400–470:
  - INDB roti at 202 kcal implies about 50–57% water. That fits a raw-ingredient sum that includes dough water and has no tawa evaporation correction.
  - INDB moong dal at 44 kcal implies about 89–91% water (a very thin dal).
  - The USDA figure of 145 implies about 64–69% water (a thick dal).
  - Rice at 97, 117 and 151 kcal implies roughly 76%, 71% and 63% water at about 410 kcal/100 g dry matter.
  These are my back-calculations, and the fat in each recipe shifts them. Check them against the water column each source actually reports.
- Because INDB uses the raw-ingredient method, which FAO/INFOODS explicitly does not recommend for cooked dishes, INDB cooked-dish energy is structurally biased low wherever cooking drives off water (rotis, parathas, dry sabzis). It is also arbitrary for liquid dishes, where the result depends on how much water the recipe added. INDB should be a recipe and ingredient-structure source, not a final per-100 g value source, until a yield correction is applied.
- **Proposed source hierarchy for STEADY (opinion, consistent with FAO guidance but stricter than it).** Within a matched food concept *and* the same preparation state:
  1. Analytical values for the cooked or as-consumed food (e.g. NIN or peer-reviewed lab data such as Chiplonkar & Agte; USDA Foundation for US commodities).
  2. Analytical values for the raw ingredient from the user's region (IFCT 2017 for India; USDA Foundation or SR Legacy for the US).
  3. Recipe-calculated values *with* yield (and ideally retention) factors (FNDDS-style, or INDB after STEADY applies YF).
  4. Analytical values borrowed from another region, after matching on species, part, state, water and fat.
  5. Recipe-calculated values without yield factors (raw INDB). Use these only after water normalisation.
  6. Branded label values (product-specific only).
  7. AI estimates.
  Energy is always recomputed in STEADY from macros using one declared factor set (see section 3), never copied.
- Treat "region" as a property of the *recipe variant*, not of the source. "Roti (India, home, no ghee)" and "Chapati (US FNDDS)" are different variants of one concept, which is what INFOODS suggests ("add the varying ingredients and/or region to the recipe name").

### Gaps
- I could not retrieve the text of the FAO/INFOODS *Guidelines for Food Matching* (the PDF text extraction failed) or the conversion guideline's exact formula pages. The water-adjustment formula used below is standard algebra, not a quoted INFOODS formula.
- FAO Ch.10 gives no explicit numeric hierarchy (country analytical > regional > borrowed > calculated). That ordering is common compiler practice but I found no single authoritative text stating it. The INFOODS e-learning "Compilation Toolbox" and Study Guide modules (Charrondière et al. 2011, Module 8 recipes, Module 10 documentation) were cited but not retrieved.
- I did not verify IFCT 2017's own carbohydrate definition or energy factors.

## 2. Data quality scoring systems: USDA DQES / confidence codes, EuroFIR quality index and value documentation, and how they drive selection

### Takeaway
Both USDA's Data Quality Evaluation System (DQES) and EuroFIR's quality index rate each *data source* on fixed categories (sampling plan, number of samples, sample handling, analytical method, analytical QC; EuroFIR adds food description and component identification). They roll these into a Quality Index and a categorical confidence code that travels with the value. The codes are used to decide which values enter the aggregated mean and to tell users how much to trust the result. They are explicitly categorical: do not average them. EuroFIR's controlled vocabularies (Method Indicator, Method Type, Acquisition Type, Value Type) are the standard way to tag *how* each value was obtained.

### Cited Findings
- USDA DQES (Holden, Bhagwat & Patterson, 2002, *J Food Compos Anal*) grew out of manual systems for iron, selenium and carotenoids. It keeps five categories (sampling plan, number of samples, sample handling, analytical method, analytical QC). The ratings combine into a Quality Index (QI) and a Confidence Code (CC) "disseminated with the nutrient data to indicate the level of confidence in the value." The aggregation algorithm was revised "to avoid the possibility that the aggregation of several mediocre data points would together, merit the highest CC." — [AGRIS record, Holden et al. 2002](https://agris.fao.org/search/en/records/65df66956eef00c2cea2a16e) (abstract-level)
- A 2009 validation (Bhagwat, Patterson, Holden, *JFCA*) found the most inter-evaluator variation in "number of samples" and "analytical quality control", and recommended evaluator training. Applied to USDA's flavonoid database, 64% of observations received A or B. — [AGRIS record](https://agris.fao.org/search/en/records/65df66956eef00c2cea2a16e); flavonoid figure from a search snippet of [this abstract record](https://data.zhenzhi.com/details/1/878446534). Not verified against the full text.
- FAO's older confidence-code scheme (adapted from Exler 1982) scores five criteria. The lowest score per criterion sets a limit, and the codes map to a (user "can have confidence in the mean value"), b (some confidence, questions raised) and c ("serious questions have been raised"). The codes "are categories and should not be manipulated arithmetically as if they were real numbers." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- EuroFIR's evaluation system has seven criteria: food description, component identification, sampling, number of analytical samples, sample handling, analytical method and analytical quality control. — [IMEKO TC23 2016 paper](https://imeko.org/publications/tc23-2016/IMEKO-TC23-2016-011.pdf) (search-summary level)
- EuroFIR's quality framework (Westenbrink et al.) combines recommendations on food description, component identification, value documentation, recipe calculation and quality evaluation. European compilers reached consensus and began implementing it. — [Quadram summary, "EuroFIR quality approach… where are we in 2014?"](https://quadram.ac.uk/publications/eurofir-quality-approach-for-managing-food-composition-data-where-are-we-in-2014/)
- EuroFIR's comparison with USDA describes the USDA QI as the sum of the five category scores. It calls the USDA system "designed for limited use, specific components and within a single country (USA)", while EuroFIR's aims to be more generic. — [EuroFIR report comparing USDA DQES to European systems (PDF)](https://www.eurofir.org/wp-admin/wp-content/uploads/2014/05/5.-Report-comparing-USDA-data-quality-assessment-systems-to-existing-European-systems-EuroFIR-Network-of-Excellence.pdf) (search-snippet level; PDF text not extractable here)
- EuroFIR's framework includes an SOP "Attribution of quality index to all original data", plus "EuroFIR Quality Index Guidelines" (PDF) and an SOP Technical Manual (URL dated 2019-02-13). — [EuroFIR Quality & Standards](https://www.eurofir.org/food-information/how-are-fcdbs-made/quality-and-standards/)
- Current EuroFIR thesaurus versions:

  | Thesaurus | Version | Date | Describes |
  |---|---|---|---|
  | Acquisition Type | 1.2 | 2017-05-25 | Origin of the data: host system, scientific literature, analytical results |
  | Method Type | 1.2 | 2017-05-25 | General indication of method type |
  | Method Indicator | 1.6 | 2022-05-24 | Hierarchical method: analysis, calculation, imputation |
  | Value Type | 1.4 | 2022-05-24 | The value, or a qualitative descriptor when no number can be given |
  | Matrix Unit | 1.5 | 2019-10-04 | The base the value is expressed against |

  They are accessible via the EuroFIR eThesaurus Manager. — [EuroFIR thesauri](https://www.eurofir.org/our-resources/eurofir-thesauri/)
- Method Indicator (v1.3) top-level terms:
  - MIR001 Analytical method
  - MIR002 Calculation method
  - MIR003 Method not known
  - MIR004 Difference
  - MIR005 Factored summation
  - MIR006 Simple summation
  - MIR007 Imputation
  - MIR008 Recipe calculation method
  - MIR009 Other
  - MIR010 Simple recipe calculation
  - MIR011 Recipe calculation with factors

  It also has specific terms such as MI0003 recipe-level, MI0004 ingredient-level and MI0006 mixed-level calculation; MI0131 carbohydrate, total, by difference; and MI0231 imputation of a component from other components in the same food. — [EuroFIR Method Indicator thesaurus v1.3](https://www.eurofir.org/eurofir-thesauri-version-1-3/wp-content/uploads/thesauri/MethodIndicator/version1-3/EuroFIR_Method_Indicator_Thesaurus_version_1-3.htm)
- Westenbrink et al. (*JFCA*, 12th IFDC 2017 special issue) evaluated harmonised EuroFIR documentation for macronutrient values in 26 European databases. The guidelines enable data exchange, but comparability of carbohydrate and dietary fibre remained a concern. — [Quadram summary](https://quadram.ac.uk/publications/12th-ifdc-2017-special-issue-evaluation-of-harmonized-eurofir-documentation-for-macronutrient-values-in-26-european-food-composition-databases/)
- FoodData Central's own documentation does not give a selection guide across data types. It says "Each of these data types was developed to meet specific needs." — [FDC FAQ](http://fdc.nal.usda.gov/faq/)

### Inferences
- For STEADY, a per-value **confidence code** (A/B/C/D), computed from a few categorical facts, is more practical than a full DQES/EuroFIR scoring of lab reports, because STEADY ingests *compiled* tables rather than lab reports. Suggested inputs:
  - method class, using EuroFIR MIR terms: analytical / recipe-with-factors / recipe-simple / borrowed / imputed / label / AI
  - identity-match quality (exact species+part+state vs approximate)
  - water known (yes/no)
  - passes internal checks (Atwater, proximate sum)
  - source tier (section 1 hierarchy)
- Adopt the DQES "weakest link" rule: one D input caps the code at C or D, whatever the other inputs are. Never average codes.
- Use the codes for two things only: (1) which candidate values are *eligible* to become the canonical value, and (2) what the UI shows ("verified", "estimated", "AI").
- Store the EuroFIR-style tags (`method_indicator`, `acquisition_type`, `value_type`, `matrix_unit`) as columns on every source value, so STEADY can re-rate values later if its criteria change. This is the INFOODS reason for documenting in the reference DB.

### Gaps
- I could not extract the exact USDA QI-to-CC thresholds (A/B/C/D cut-offs) or the EuroFIR per-category scoring scale and QI range. Both are in PDFs that could not be text-extracted here: the EuroFIR QI Guidelines and the EuroFIR/USDA comparison report.
- I could not retrieve the EuroFIR Method Type code list (single-letter codes) or the Acquisition Type code list. FDC's food_nutrient_derivation and source code tables (the FDC data dictionary returned HTTP 400) were also unavailable.

## 3. Harmonisation across databases: energy factors, carbohydrate definitions, water/dry-matter normalisation, as-consumed vs as-purchased, food linking

### Takeaway
Before two sources can be compared, three things must be aligned: (1) the **carbohydrate definition** (total by difference including fibre, available by difference, or available by direct analysis), (2) the **energy factor system** (general 4/9/4, specific Atwater, or 17/37/17/8 kJ), and (3) the **water basis and preparation state**. Carbohydrate definition causes larger energy differences than the choice of factors, and water content dwarfs both for cooked foods. The INFOODS answer is to recompute energy in your own DB from harmonised components, and to adjust or refuse to aggregate foods whose water contents differ.

### Cited Findings
- FAO Food and Nutrition Paper 77, *Food Energy – Methods of Analysis and Conversion Factors* (workshop Dec 2002, published 2003):
  - Direct analysis of available carbohydrate (summing individual carbohydrates) is preferred. Total carbohydrate by difference minus dietary fibre is "acceptable for purposes of energy evaluation of conventional foods", but not for novel foods, clinical formulations or reduced-energy claims.
  - Factors: 17 kJ/g (4 kcal/g) when carbohydrate is expressed as weight, 16 kJ/g (3.75 kcal/g) as monosaccharide equivalents, and 8 kJ/g (2 kcal/g) for fibre absent a method-specific factor.
  - "currently there is no way to label carbohydrate with a single value that describes the energy content accurately."
  — [FAO FNP 77, ch. 3](https://www.fao.org/3/y5022e/y5022e05.htm); [FAO FNP 77 abstract](https://fao.org/fileadmin/templates/food_composition/documents/book_abstracts/Food_energy.pdf)
- FNP 77 on Atwater factors:
  - The specific system "appears to be superior to the original Atwater general system" but "may not be vastly superior to the more extensive general factor system."
  - USDA uses specific factors where known, and most other databases use general factors.
  - Table 3.2: general-factor energy is about 7% higher than specific for whole-wheat flour, about 3% higher for whole cornmeal and about 2% higher for dry beans, and 1–3% lower for brown and white rice.
  - "As originally described by Atwater, carbohydrate is determined by difference, and thus includes fibre."
  - Joules are the recommended SI unit (1 kcal = 4.184 kJ).
  - The workshop recommended keeping metabolizable energy (ME) factors rather than moving to net metabolizable energy (NME).
  — [FAO FNP 77, ch. 2/3](https://www.fao.org/4/y5022e/y5022e04.htm)
- In FoodData Central, "Most energy values are calculated using the Atwater general factors of 4, 9, and 4" ("Metabolizable Energy-Atwater General Factors"). Values using specific factors from USDA Handbook 74 appear as "Metabolizable Energy-Atwater Specific Factors", and "whenever possible" both are provided. Data types differ in purpose, categorisation and serving context: Branded uses label servings, FNDDS uses survey portions. — [FDC FAQ](http://fdc.nal.usda.gov/faq/)
- FDC data types:

  | Data type | How values are produced | Update cadence |
  |---|---|---|
  | Foundation | Analytically derived values on individual samples of minimally processed foods, with sample metadata | April and October |
  | SR Legacy | Analyses, imputations and literature | Final release April 2018 |
  | FNDDS | Compiled from other FDC data types for WWEIA/NHANES | Every 2 years |
  | Branded | Manufacturer label data | Monthly |
  | Experimental | Research data, "may not be appropriate as a reference for the consumer" | — |

  — [FDC data documentation](http://fdc.nal.usda.gov/data-documentation/); [FDC FAQ](http://fdc.nal.usda.gov/faq/)
- Chevassus-Agnes et al. (2004), "Impact of different macronutrient definitions and energy conversion factors on energy supply estimations":
  - "The largest differences observed in per capita energy supply calculations are due to carbohydrate definitions."
  - General vs specific Atwater changed supply by about 50–320 kJ per capita per day.
  - Giving fibre 8 kJ/g raised supply by about 100–250 kJ per capita per day.
  - Protein definitions had a minor effect.
  - Overall differences reached about 8%.
  — [catalog record](https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi...........4ea1844aa1320a7865f0c10f085967d3) (abstract level)
- Water and denominators: values not "per 100 g edible portion on fresh weight basis (EP)" need extra data to convert. Per dry matter needs the water content, per fat needs the lipid content, and per volume needs density. This is from a Read-the-Docs rendering of the INFOODS conversion guideline; its provenance is unverified. — [nutrient.readthedocs.io](https://nutrient.readthedocs.io/en/latest/03_dir/$_03-detail-7-mathematics-1-intro-new.html). The official guideline (v1.0, 2012) is listed at [INFOODS standards](https://www.fao.org/infoods/infoods/standards-guidelines/en/).
- Borrowed values "should be adapted to the different water and/or fat contents in some cases," with adequate reference to the original source (FAO text via search snippet). — [FAO 2003 Ch.1](https://www.fao.org/4/y4705e/y4705e06.htm)
- External comparisons are valid only when foods have "the same scientific name, same part analysed, same processing state, similar water and fat values, same fortification; moreover, the nutrient definition, unit and denominator should be the same." — [FAO/INFOODS 2012 Checking Guidelines](https://www.fao.org/3/ap810e/ap810e.pdf)
- Recipe yield matters for as-consumed values. In South Asian dishes analysed in the UK, water loss during cooking reached 24% and puri fat uptake reached 18.4 g/100 g. Calculated values exceeded analysed values for most nutrients, with the smallest differences for protein, fat and carbohydrate (Chen, Gilbert & Khokhar, *Food Chemistry* 2009, 113(3):825-831). — [White Rose eprint](https://eprints.whiterose.ac.uk/id/eprint/5414/)
- FNDDS documentation has sections on "Recipe calculations" and "Retention codes and moisture adjustment" (2019-2020 and 2021-2023 editions). The FNDDS 5 documentation also has "moisture & fat adjustments" and "FNDDS-SR links" sections. USDA's glossary lists "normalizing nutrients to an average moisture or fat value, use of retention factors, and substitution of similar ingredients" as examples of calculated values. — [FNDDS 2021-2023 documentation (PDF)](https://ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2021_2023_FNDDS_Doc.pdf); [FNDDS 5 documentation (PDF)](https://www.ars.usda.gov/arsuserfiles/80400530/pdf/fndds/fndds5_doc.pdf); [USDA MAFCL glossary](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/glossary/) (table-of-contents and glossary level only)
- Across Greek, Belgian and US databases applied to the same recalls (2025 EuroFIR analysis), macronutrient data were "generally comparable" while vitamins A and C, calcium and iron diverged much more. — [EuroFIR, "Risks of Using the Wrong Food Composition Databases"](https://www.eurofir.org/risks-of-using-the-wrong-food-composition-databases-in-nutrition-research/) (search-summary level)

### Inferences
- **Harmonise before comparing, in this order (proposed pipeline):**
  1. Map each source value to a common component definition. Record `carb_definition` ∈ {total_by_diff_incl_fibre, available_by_diff, available_direct_weight, available_monosacch_equiv} and `fibre_method`.
  2. Convert to per 100 g edible portion, as consumed.
  3. Record water. If it is missing, impute it from proximates: 100 − (protein + fat + carb + fibre + ash), flagged as imputed.
  4. Compute dry-matter values: `nutrient_DM = nutrient / (1 − water/100)`.
  5. Compare candidates on the dry-matter basis.
  6. Rescale the chosen dry-matter composition to the target water content for the variant: `nutrient_target = nutrient_source × (100 − water_target) / (100 − water_source)`.
  7. Recompute energy from the harmonised macros with *one* STEADY factor set.
- **Factor set (opinion).** Use 4/9/4 kcal/g on protein, fat and *available* carbohydrate, plus 2 kcal/g fibre (17/37/17/8 kJ/g, the FAO FNP 77 ME system, which also matches EU and ANZ labelling). Store the source's own reported energy separately, and use the difference as a check, not as the value.
  - USDA total-carb-by-difference values include fibre, so subtract fibre before applying 4 kcal/g. Otherwise US-sourced rows are inflated by about 2 kcal per gram of fibre.
  - USDA "Atwater specific" values for whole grains will sit about 2–7% below general-factor values (FNP 77 Table 3.2). Expect this as a normal, explainable gap.
- **As-consumed vs as-purchased.** The canonical value should always be "edible portion, as consumed, in a stated preparation state with a stated water %." Raw-ingredient values (IFCT) belong to different variants ("moong dal, dry, raw"). They feed the recipe engine and are never shown as "moong dal" for a logged bowl.
- **Linking (food matching).** Each source row should map to (concept, preparation state, region-variant) using a small faceted descriptor (species/ingredient, part, process/cook method, added fat, water band) inspired by LanguaL/FoodEx2. Free-text name similarity is not enough, because "dal" in INDB and "mung beans, cooked" in USDA differ in water by about 20 percentage points.

### Gaps
- I did not retrieve LanguaL or FoodEx2 documentation, or a EuroFIR food-matching worked example. The faceted-linking recommendation rests on general knowledge of those systems, not on fetched sources.
- I could not open the FNDDS documentation text to quote the exact moisture- and fat-adjustment algorithm.
- IFCT 2017's carbohydrate expression (by difference vs available) and energy factors are not verified here. This needs checking before STEADY mixes IFCT and USDA carbohydrate values.

## 4. Outlier detection across sources

### Takeaway
Established practice combines four kinds of check:
- **Within-row consistency:** proximate sum, energy recomputed from macros, part ≤ total, kJ/kcal ratio.
- **Within-category range checks:** category mean ± k·SD, or curated acceptable ranges per food group.
- **Cross-source comparison:** only after identity and water matching.
- **Comparison with your own previous version.**

Outliers are *flagged and excluded from the aggregate*, never deleted. Review effort is prioritised by how much a food contributes to intake.

### Cited Findings
- Sum of proximates (water + protein + fat + available carbohydrate + fibre + alcohol + ash): "Preferable: 97–103 g (Greenfield and Southgate, 2003), acceptable: 95–105 g." If it falls outside, scrutinise the analytical values, the protein factor, the carbohydrate expression, units and completeness. Using available carbohydrate as monosaccharide equivalents can legitimately push the sum above 100. — [FAO/INFOODS 2012 Checking Guidelines](https://www.fao.org/3/ap810e/ap810e.pdf); [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- Statistical outliers (Youden & Steiner 1975 tests) "should not, however, be deleted from the database per se" but "marked for exclusion from the calculated mean." All values for aggregated foods are included in the mean "except for outliers." — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm); [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- "As unreasonably high and low values are not defined internationally, internal guidelines should be agreed on between compilers." The guidelines suggest:
  - compare with external foods matched on species, part, state, water/fat and definition
  - compare with your previous DB version
  - give more attention "to frequently consumed foods, or those with high nutrient values", e.g. a food contributing 20% of an RDI versus one contributing 0.001%
  - FAO/INFOODS planned per-food-group acceptable-range guidelines for raw, unfortified foods.
  — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Open Food Facts production rules (`ProductOpener::DataQualityFood`, current main branch, retrieved 2026-11-12):

  | Check | Threshold | Severity |
  |---|---|---|
  | Energy vs energy recomputed from nutrients | within 15% + 5 | warning ("may-not-match") |
  | Energy vs energy recomputed from nutrients | beyond 30% + 5 | error ("does-not-match") |
  | Applies only when energy is above | 55 kJ / 13 kcal | — |
  | kJ outside 3.7×kcal − 2 to 4.7×kcal + 2 | — | error |
  | Energy over 3911 kJ/100 g | — | error |
  | fat + carbohydrate + protein + salt | over 105 g | flagged |
  | Part greater than total (sugars+starch > carbs; saturated fat > fat; soluble+insoluble fibre > fibre) | — | error |
  | Category outlier: outside category mean ± 4·SD (code comment says 3·SD, "try 4") for energy, fat, saturated fat, carbs, sugars, fibre, protein, salt | — | warning |
  | 3 or more identical values / all values identical | — | warning / error |

  Severity tiers are `data_quality_errors_tags`, `data_quality_warnings_tags` and `data_quality_info_tags`. — [OFF DataQualityFood.pm](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/lib/ProductOpener/DataQualityFood.pm)
- One published automated approach ranks coefficients of variation within each food subgroup and nutrient, flagging the top two as "hits." An expert panel judged 1.4%–37.6% of hits to be true errors, depending on food group. Automated detection raised the likelihood of finding errors 38-fold compared with manual review. — [encyclopedia.pub entry (search snippet only; page returned 403)](https://encyclopedia.pub/entry/23733). The original paper citation was not retrieved.
- The fatty-acid sum should not exceed 95% of total fat, and total amino acids should not exceed 6.25 g per g of nitrogen. — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)

### Inferences
- **Cross-source rule for STEADY (opinion):** when ≥2 harmonised candidates exist for the same (concept, state, variant):
  1. Compute energy per 100 g dry matter and protein and fat per 100 g dry matter for each.
  2. Use the median and MAD (robust z = 0.6745·(x − median)/MAD) when there are ≥3 candidates. With 2 candidates, use a ratio test (e.g. flag if dry-matter energy differs by more than 15%, or protein/fat differ by more than 25% relative).
  3. If the candidates agree on a dry-matter basis but differ as-consumed, the conflict is water. Resolve it by picking the variant's water content (region default), not by picking a source.
  4. If they disagree on a dry-matter basis, the conflict is recipe (fat, ingredients) or an error. Route it to human review, or split into separate variants (e.g. "roti, with ghee").

  MAD/robust-z is my suggestion. I found no food-composition guideline that prescribes it; FAO cites Youden & Steiner and OFF uses mean ± 4·SD.
- Add an **energy-density sanity band per food group on a dry-matter basis**. Cooked cereal and legume dishes cluster at roughly 450–470 kcal per 100 g dry matter in the Indian lab data (section 1). This catches rows whose water is wrong even when the as-consumed kcal looks plausible.
- Prioritise review by **exposure**: (log frequency) × (kcal per typical portion) × |disagreement|. This applies the INFOODS "frequently consumed / high contributor" rule to STEADY's own logging telemetry.

### Gaps
- I did not find published, validated numeric thresholds for cross-database disagreement on a dry-matter basis. The 15% and 25% figures above are placeholders to tune against STEADY's eval set.
- The original paper behind the CV-ranking approach was not identified (the encyclopedia.pub page returned 403).
- The FAO/INFOODS "acceptable ranges among food groups" guidelines, if published, were not located.

## 5. Canonical data model patterns and how commercial nutrition apps curate

### Takeaway
The standard compiler pattern maps directly onto a Postgres design:
- an **archival** layer of immutable source values with provenance
- a **reference** layer where values are harmonised, compared, rated and *one* "standardized" value is selected with documented evidence
- a **user** layer that serves the selected value
- a changes log, with codes never reused

Commercial apps publicly describe only the outline. They license lab-analysed reference databases, keep user or label data separate and lower-ranked, review submissions by staff or RDs, pin curated "best match" entries above crowd entries, and dedupe branded items by barcode. None publicly documents a value-level conflict-resolution algorithm.

### Cited Findings
- Three-tier archival → reference → user design, with a "standardized nutrients" field holding the selected value. — [FAO/INFOODS 2012](https://www.fao.org/3/ap810e/ap810e.pdf)
- Keep a "changes" DB with reasons, never reuse food codes, and flag foods that cannot be unambiguously identified. — [FAO 2003 Ch.10](https://www.fao.org/4/y4705e/y4705e15.htm)
- USDA FNDDS links survey food codes to ingredient data from other FDC types (SR/Foundation) through recipes, with retention codes and moisture adjustment. Portion weights come from survey portions. It is updated every two years with WWEIA/NHANES. — [FDC data documentation](http://fdc.nal.usda.gov/data-documentation/); [FNDDS 2021-2023 documentation](https://ars.usda.gov/ARSUserFiles/80400530/pdf/fndds/2021_2023_FNDDS_Doc.pdf)
- A 2024 study found that energy estimated from a single FNDDS combination-food code was not equivalent to summing the components ("Selecting foods from FNDDS when calculating food intake: Does the reference matter?"). — [LSU repository](https://repository.lsu.edu/clinical_research_pubs/97) (search-summary level)
- **Cronometer** lists about 10 sources:
  - NCCDB (University of Minnesota)
  - its own Cronometer Food Composition Database (CFCD)
  - USDA SR28
  - CNF 2015, IFCDB, NEVO, CoFID, NUTTAB
  - Nutritionix
  - FDC UPC branded foods

  It states "Every item submitted to our database undergoes a verification process" and that it is "consistently removing duplicate foods and outdated entries." It claims data are "lab-analyzed… not crowd-sourced guesses." There is no public description of how it resolves conflicting values. — [Cronometer accurate databases page](https://cronometer.com/features/accurate-databases.html)
  - A Cronometer blog post states user submissions (CRDB) are "reviewed by hand by a member of our nutrition data team." It treats lab sources (NCCDB, USDA, CNF, NUTTAB, CoFID, NEVO, IFCDB) as the most detailed and label-based sources (CRDB, UPC, Nutritionix) as less detailed. — [Cronometer blog (via search summary)](https://cronometer.com/blog/technology-changes-responsibility-doesnt-why-cronometers-approach-to-ai-starts-with-people-not-technology/); the [support "Data Sources" article](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources) returned 403.
- **MacroFactor:** "The majority of our food database is licensed from high quality food databases and research institutions," plus verified user submissions, which usually appear within 24–48 h. Top search results are "curated common entries with detailed macro and micronutrient reporting." In v2.7.0, branded items are keyed by unique barcode to expand coverage "without introduction of duplicates." The standard database has about 1.36 M verified items. — [MacroFactor help: food search database](https://help.macrofactorapp.com/en/articles/46-food-search-database); [MacroFactor v2.7.0 release notes](https://macrofactorapp.com/version-2-7-0/) (search-summary level)
- **MyFitnessPal:**
  - "Best Match" entries, pinned to the top of search, are "created and verified by MyFitnessPal's team of registered dietitians."
  - The green checkmark marks foods MFP "has reviewed or added… and believes that the nutrition information is accurate." Unchecked entries are member submissions "not reviewed by MyFitnessPal."
  - These quotes come from secondhand copies of the official March 2025 blog post. — [copy of MFP blog post](https://beenbeans.blogspot.com/2025/03/understanding-myfitnesspals-food.html)
  - Long-time forum users say checkmarks can come from user upvotes, and report checked entries that are wrong. — [MFP community thread](https://community.myfitnesspal.com/en/discussion/comment/44334450)
  - The two accounts conflict. The official post was not retrieved directly.
- **Nutritionix** (owned by Syndigo): the database is "maintained and verified by an in-house team of Registered Dietitians." Common foods are based on USDA data and enhanced by its RDs. Syndigo reports 975k+ grocery items, 192k+ restaurant items and 38.5k+ generic items. All of this is self-reported, with no independent audit found. — [Syndigo wellness page](https://syndigo.com/wellness/)
- **HealthifyMe:** no public curation or conflict-resolution methodology found. INDB's authors describe it as not open-access or methodologically documented. Founders said in 2012 that no usable Indian food database existed. — [Europe PMC INDB full text](https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11277795/fullTextXML); [YourStory 2012](https://cwv.yourstory.com/2012/12/healthifyme-an-indian-nutrition-tracker-from-the-people-behind-the-rs100-a-day-experiment)
- **Open Food Facts:** crowd-entered label data with automated quality tags (errors, warnings, info) and category-statistics outlier warnings (see section 4). — [OFF DataQualityFood.pm](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/lib/ProductOpener/DataQualityFood.pm)
- NCC (University of Minnesota) advises database buyers to check completeness (missing values "abound for some nutrients in some databases"), reliance on chemical analysis, expert staff, QC procedures and regular updates. It publishes a comparison chart against USDA SR and FNDDS, which was not retrieved. — [NCC considerations page](https://www.ncc.umn.edu/products/considerations/)

### Inferences
**Proposed STEADY data model (opinion), mapping INFOODS tiers to Postgres:**

- `food_concept` (stable ID, never reused): "roti/chapati", "moong dal (cooked)", "rice, white, cooked". Holds the facet descriptors and synonyms in each language.
- `food_variant` (concept × preparation state × region/recipe archetype): e.g. `roti|IN|home|no-fat`, `roti|IN|with-ghee`, `chapati|US|FNDDS`, `moong-dal|IN|thin`, `moong-dal|IN|thick`. Stores `target_water_pct`, `edible_basis`, default portions in grams, `region_codes[]`.
- `source_value` (archival; append-only), one row per source × food × nutrient (or a JSONB nutrient vector). Columns:
  - `source_db`, `source_version`, `source_food_id`
  - `method_indicator` (EuroFIR MIR), `acquisition_type`, `value_type`
  - `carb_definition`, `energy_factor_system`, `reported_energy_kcal`
  - `water_pct` (with `water_imputed` bool), `fat_pct`, `n_samples`, `min`, `max` (where available)
  - `match_quality` to the variant (exact/approximate)
  - `check_flags[]` (Atwater, proximate sum, part ≤ total), `excluded_reason`
  - `imported_at`
- `harmonised_value` (reference; derived, reproducible) holds each candidate converted to STEADY's definitions, on both dry-matter and target-water bases, with recomputed energy.
- `canonical_value` (reference to user; versioned) holds one row per variant × nutrient set:
  - `selected_source_value_ids[]`, `selection_rule` (e.g. `tier1_single`, `median_of_tier2`, `dm_rescaled_to_variant_water`), `evidence_note`
  - `confidence_code` (A–D, categorical)
  - `version`, `valid_from`, `approved_by`, `approved_at`, `supersedes_id`
- `region_default` maps (concept, region/locale) → default variant. An India user typing "roti" gets `roti|IN|home`, a US user gets `chapati|US|FNDDS`. The others stay one tap away.
- `change_log` / audit records who changed what, why, and old → new values. Nothing is ever hard-deleted; values are excluded with a reason, following FAO's outlier rule.

**Selection algorithm per variant (opinion):**
1. Take eligible candidates: those with identity match ≥ "approximate" and no hard check failures.
2. Keep the highest available tier (section 1).
3. Within that tier: if there is one candidate, use it. If there are several, take the dry-matter median, excluding robust outliers.
4. Rescale to the variant's `target_water_pct`.
5. Recompute energy.
6. Assign a confidence code.
7. If lower tiers disagree with the winner beyond threshold on a dry-matter basis, open a review ticket instead of overriding automatically.

**Human review (opinion):** a nutritionist or reviewer role approves `canonical_value` changes for high-exposure foods (section 4 priority score). Auto-approve only when tier-1/2 candidates agree within threshold. Every approval records evidence, following FAO's "must record the evidence used to select the values."

**Product positioning:** public statements from Cronometer, MacroFactor and MFP suggest the competitive norm is "licensed reference data on top, curated common foods pinned first, user and label data separated and reviewed." STEADY's advantage could be documented, region-aware variants with visible provenance and confidence, which no competitor publicly documents.

### Gaps
- No commercial app publicly documents a value-level conflict-resolution rule, duplicate-merge algorithm or reviewer workflow. Cronometer's support page returned 403. MFP's official blog post and MacroFactor's help pages were seen only via copies or search summaries. HealthifyMe publishes nothing on methodology.
- I did not retrieve NCCDB documentation on how NCC selects or imputes values (it is known for having no missing values, but I could not verify that here).

## 6. How to evaluate whether chosen values are right

### Takeaway
The gold standard is chemical analysis of the food as consumed: duplicate portions or duplicate diets, or lab analysis of cooked dishes. Agreement is reported as mean bias, Bland–Altman limits of agreement and ICC or correlation. The literature shows food-table energy can match analysis well at group level, *especially when the cooked food's actual water content is used*. Individual dishes and individual-level agreement are much weaker, and calculated values tend to over-estimate.

### Cited Findings
- **India (Chiplonkar & Agte, APJCN 2007):** 104 cooked foods and 92 meals were analysed in the lab, and compared with values computed from Indian food tables using raw-ingredient data plus the *laboratory-measured moisture* of the cooked recipe. There was no significant difference for energy or protein in any food group (Wilcoxon p > 0.1). For energy, ICC = 0.98, bias = 1.8 kcal/100 g and random-error SD = 18.5 kcal. Fat differed significantly for most groups, and micronutrients were over-estimated by 30–55%. — [Chiplonkar & Agte 2007](https://apjcn.qdu.edu.cn/16_2_22.pdf)
- **South Asian dishes in the UK (Chen et al., 2009):** calculated values exceeded analysed values for most nutrients. The smallest differences were for protein, fat and carbohydrate, and fibre, sodium and vitamins were poorly estimated. — [White Rose eprint](https://eprints.whiterose.ac.uk/id/eprint/5414/)
- **Duplicate-diet validations of food tables:**
  - Korea (66 women): table-estimated/measured energy ratio above 98%, and tables judged adequate for energy and protein. — [Tohoku J Exp Med](https://www.jstage.jst.go.jp/article/tjem/200/1/200_1_7/_article/-char/en)
  - Netherlands (25 duplicate diets): calculated energy and carbohydrate were higher than analysed, with r = 0.57 for energy. — [WUR record](https://research.wur.nl/en/publications/evaluation-of-calculated-energy-and-macronutrient-contents-of-die)
  - Mali (women): adequate population-level agreement for energy and zinc, but not for carbohydrate, vitamin A or iron (Bland–Altman, Wilcoxon). — [Public Health Nutrition](https://cambridge.org/core/journals/public-health-nutrition/article/comparing-intake-estimations-based-on-food-composition-data-with-chemical-analysis-in-malian-women/2593353F7BFBB71491D6F19F6039C650)
  - UK 1972 large-scale catering: calculated energy and fat were "constantly higher" than analysed. — [Br J Nutr 1972 PDF](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/C0D21928074ECFEB04C78F755F033C5D/S0007114572001345a.pdf/evaluation_of_meals_cooked_by_largescale_methods_a_comparison_of_chemical_analysis_and_calculation_from_food_tables.pdf)
  (All at abstract or search-summary level.)
- Duplicate diets are treated as the reference method because they avoid food-composition-table limitations. — [Measurement Toolkit: duplicate diets](https://measurement-toolkit.org/diet/objective-methods/duplicate-diets)
- **Database-vs-database:** in EPIC (476,768 participants, 2020), intakes recalculated with the USDA database and with EPIC's harmonised database showed "small but significant differences" for energy and macronutrients, with weighted κ > 0.80 for energy. — [EPIC comparison, PMC7650652](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7650652/) (search-summary level)
- **Apps vs research databases:**
  - Griffiths et al. 2018 (*Public Health Nutrition*): 30 NDSR-coded recalls were entered into MyFitnessPal, Fitbit, Lose It!, MyPlate and Lifesum. Correlations with NDSR were 0.73–0.96 for energy and macros, with apps tending to read low. — [Cambridge](https://www.cambridge.org/core/journals/public-health-nutrition/article/assessment-of-the-accuracy-of-nutrient-calculations-of-five-popular-nutrition-tracking-applications/456D6CB0961D86CBEA2E868C52DF7ABF)
  - Evenson & Berens 2021: compared with ESHA, energy was significantly lower in MyFitnessPal, MyNetDiary and SparkPeople, but not in Cronometer. — [record](https://www.bohrium.com/paper-details/accuracy-of-nutrient-intake-values-from-four-popular-nutrition-tracking-apps/812324467769344000-48718) (search-summary level)
- Recipe-calculated values "should almost always be observed as approximations." — [PMC review (search summary)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5789265)

### Inferences
- **Build a held-out "analytical truth" set** of Indian cooked foods with measured water and energy: Chiplonkar & Agte's appendix (about 104 foods plus 92 meals), plus any NIN cooked-food analyses. Score STEADY's canonical values against it using:
  - mean bias and Bland–Altman limits per food group
  - ICC
  - % of foods within ±10% and ±20% for energy
  This complements the existing scripts/eval harness, which measures *matching* accuracy, not *value* accuracy.
- **Report value accuracy separately from water/state accuracy.** The 2007 data suggest most energy error disappears once water is right. So test (a) dry-matter energy vs lab and (b) STEADY's default `target_water_pct` vs the lab-measured water of typical home preparations.
- **Regression guard:** on every `canonical_value` version change, diff against the previous version (an INFOODS check). Block publication if any high-exposure food's energy moves by more than X% without an approved evidence note.
- **Longer term:** a small weighed-record or photo-plus-weight study with Indian users (prepared dish weighed, recipe recorded) would validate both portion and value defaults. Duplicate-diet chemistry is the gold standard but is costly.

### Gaps
- I did not retrieve full-text quantitative results for the Korean, Dutch, Malian, EPIC or Evenson studies (abstract level only), nor any recent (2023–2026) validation of Indian cooked-dish values or of INDB specifically against lab analysis. None was found in the searches run.
- I found no published accuracy evaluation of HealthifyMe's or other Indian apps' database values against chemical analysis.
