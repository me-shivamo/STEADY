import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cafe_csvlib as csvlib
out = sys.argv[1]
BEV_URL = "https://www.cafecoffeeday.com/sites/all/themes/ccd/assets/images/nutri-info/desk/BEVERAGE%20nutritional%20info.jpg"
FOOD_URL = "https://www.cafecoffeeday.com/sites/all/themes/ccd/assets/images/nutri-info/desk/FOOD%20nutritional%20info.jpg"
BEV_TITLE = "Cafe Coffee Day - Quality Assurance: Nutritional Information & Allergen Chart: Beverage (3.0 & OMG Menu), linked from cafecoffeeday.com/cafe-menu/nutritional-info"
FOOD_TITLE = "Cafe Coffee Day - Quality: CCD Menu 3.0 - Nutritional Value & Allergen Chart (Food), linked from cafecoffeeday.com/cafe-menu/nutritional-info"
BEV_VER = "Doc CCD/QA/F&B/NV/01, dated 28-04-2022"
FOOD_VER = "Doc QA/F&B/CCD Menu 3.0/Food Allergen & NV, dated 29-04-2022"
# (sl, published name, item, variant, section, ml, kcal)
bev = [
(1,"Soy Cappuccino (Regular)","Soy Cappuccino","Regular","Hot Coffee Classics",230,"80.20"),
(2,"Soy Cappuccino King","Soy Cappuccino","King","Hot Coffee Classics",330,"115.07"),
(3,"Cappuccino Regular","Cappuccino","Regular","Hot Coffee Classics",250,"128.90"),
(4,"Cappuccino King","Cappuccino","King","Hot Coffee Classics",350,"180.46"),
(5,"Inverted Cappuccino","Inverted Cappuccino","","Hot Coffee Classics",210,"193.39"),
(6,"Café Latte","Café Latte","","Hot Coffee Classics",250,"131.90"),
(7,"Café Latte King","Café Latte","King","Hot Coffee Classics",350,"184.66"),
(8,"Café Mocha","Café Mocha","","Hot Coffee Classics",210,"129.05"),
(9,"Lemon Green Coffee Hot","Lemon Green Coffee","Hot","Hot Coffee Classics",210,"85.27"),
(10,"Hot Velvet Coffee","Hot Velvet Coffee","","Hot Coffee Classics",210,"246.77"),
(11,"Flat White","Flat White","","Hot Coffee Classics",250,"125.08"),
(12,"Café Americano Regular","Café Americano","Regular","Hot Coffee Classics",180,"7.27"),
(13,"Café Americano Strong","Café Americano","Strong","Hot Coffee Classics",180,"17.06"),
(14,"Filter Coffee","Filter Coffee","","Hot Coffee Classics",230,"133.24"),
(15,"Honey Cinnamon Coffee","Honey Cinnamon Coffee","","Hot Coffee Classics",180,"55.30"),
(16,"Espresso","Espresso","","Hot Coffee Classics",30,"5.81"),
(17,"Vanilla Latte Regular","Vanilla Latte","Regular","Flavoured Brews",250,"227.50"),
(18,"Vanilla Latte King","Vanilla Latte","King","Flavoured Brews",350,"318.50"),
(19,"Vanilla Cappuccino Regular","Vanilla Cappuccino","Regular","Flavoured Brews",250,"231.35"),
(20,"Vanilla Cappuccino King","Vanilla Cappuccino","King","Flavoured Brews",350,"323.89"),
(21,"Tangerine White Chocolate Cappuccino Regular","Tangerine White Chocolate Cappuccino","Regular","Flavoured Brews",250,"255.58"),
(22,"Tangerine White Chocolate Cappuccino King","Tangerine White Chocolate Cappuccino","King","Flavoured Brews",350,"357.81"),
(23,"Turmeric Ginger Cappuccino Regular","Turmeric Ginger Cappuccino","Regular","Flavoured Brews",250,"179.73"),
(24,"Turmeric Ginger Cappuccino King","Turmeric Ginger Cappuccino","King","Flavoured Brews",350,"251.62"),
(25,"Tangerine White Chocolate Iced Coffee","Tangerine White Chocolate Iced Coffee","","Cold Coffees",350,"292.85"),
(26,"Cold Café Mocha","Cold Café Mocha","","Cold Coffees",350,"250.50"),
(27,"Signature Cold Coffee","Signature Cold Coffee","","Cold Coffees",300,"227.52"),
(28,"Cold Velvet Coffee","Cold Velvet Coffee","","Cold Coffees",350,"312.06"),
(29,"Tropical Ice Berg","Tropical Ice Berg","","Cold Coffees",350,"322.67"),
(30,"Vegan Shake","Vegan Shake","","Cold Coffees",350,"268.00"),
(31,"Lemon Green Coffee (Cold)","Lemon Green Coffee","Cold","Cold Coffees",350,"57.96"),
(32,"Classic Lemonade","Classic Lemonade","","Cold Coffees",350,"145.78"),
(33,"Devil's Own","Devil's Own","","Indulgent Frappes",350,"382.66"),
(34,"Dark Frappe","Dark Frappe","","Indulgent Frappes",350,"344.16"),
(35,"Alphonso Mango Frappe","Alphonso Mango Frappe","","Indulgent Frappes",350,"427.56"),
(36,"Tangerine White Chocolate Frappe","Tangerine White Chocolate Frappe","","Indulgent Frappes",350,"391.86"),
(37,"Crunchy Frappe","Crunchy Frappe","","Indulgent Frappes",350,"541.59"),
(38,"Café Frappe","Café Frappe","","Indulgent Frappes",350,"335.48"),
(39,"Gourmet Belgian Cold Chocolate","Gourmet Belgian Cold Chocolate","","Chocolate Bliss",350,"345.84"),
(40,"Gourmet Belgian Hot Chocolate","Gourmet Belgian Hot Chocolate","","Chocolate Bliss",180,"173.97"),
(41,"Iced Chai Latte","Iced Chai Latte","","Tea",350,"218.05"),
(42,"Hot Chai Latte","Hot Chai Latte","","Tea",250,"227.93"),
(43,"Home Style Ginger Tea","Home Style Ginger Tea","","Tea",200,"167.52"),
(44,"Home Style Cardmon Tea","Home Style Cardamom Tea","","Tea",200,"120.96"),
(45,"Green Tea","Green Tea","","Tea",230,"1.97"),
(46,"Assam Tea","Assam Tea","","Tea",230,"3.31"),
(47,"Darjeeling Tea","Darjeeling Tea","","Tea",230,"3.31"),
(48,"Watermelon Mojito","Watermelon Mojito","","New Beverage Products",350,"190.4"),
(49,"Watermelon Granita","Watermelon Granita","","New Beverage Products",350,"161"),
(50,"Peach Iced Tea","Peach Iced Tea","","New Beverage Products",350,"166.95"),
(51,"Lemon Iced Tea","Lemon Iced Tea","","New Beverage Products",350,"182"),
(52,"Iced Cappuccino","Iced Cappuccino","","New Beverage Products",350,"153.21"),
(53,"Iced Latte","Iced Latte","","New Beverage Products",350,"158.48"),
(54,"Iced Mocha","Iced Mocha","","New Beverage Products",350,"178.6"),
(55,"Iced Filter Coffee","Iced Filter Coffee","","New Beverage Products",350,"154.19"),
(56,"Iced Americano","Iced Americano","","New Beverage Products",350,"61.23"),
(57,"Iced Cappuccino Sugar Free*","Iced Cappuccino","Sugar Free","New Beverage Products",350,"94.22"),
(58,"Iced Latte Sugar Free*","Iced Latte","Sugar Free","New Beverage Products",350,"106.32"),
(59,"Iced Filter Coffee Sugar Free*","Iced Filter Coffee","Sugar Free","New Beverage Products",350,"101.1"),
(60,"Iced Americano Sugar Free*","Iced Americano","Sugar Free","New Beverage Products",350,"5.8"),
(61,"Iced Cappuccino No Sugar","Iced Cappuccino","No Sugar","New Beverage Products","350.00","94.49"),
(62,"Iced Latte No Sugar","Iced Latte","No Sugar","New Beverage Products","350.00","106.63"),
(63,"Iced Filter Coffee No Sugar","Iced Filter Coffee","No Sugar","New Beverage Products","350.00","101.39"),
(64,"Iced Americano No Sugar","Iced Americano","No Sugar","New Beverage Products","350.00","5.81"),
]
# (sl, published name, item, variant, g, kcal, veg, serving_desc)
food = [
(1,"CHEESE CHILLI TOAST","Cheese Chilli Toast","",50,"113.00","veg",""),
(2,"CLASSIC GARLIC BREAD","Classic Garlic Bread","",80,"298.22","veg",""),
(3,"SMOKED CHICKEN GARLIC BREAD","Smoked Chicken Garlic Bread","",100,"330.01","non-veg",""),
(4,"SPINACH N CORN GARLIC BREAD","Spinach n Corn Garlic Bread","",100,"277.91","veg",""),
(5,"CHEESE TOMATO CROISSANT SLIDER ( 2 Peices )","Cheese Tomato Croissant Slider","2 pieces",130,"426.40","veg","2 pieces"),
(6,"GRILLED SAUSAGE CROISSANT SLIDER (2 Peices )","Grilled Sausage Croissant Slider","2 pieces",160,"528.00","non-veg","2 pieces"),
(7,"CHUTNEY CHEESE BUN","Chutney Cheese Bun","",110,"334.40","veg",""),
(8,"PLAIN CROISSANT (2 Pieces)","Plain Croissant","2 pieces",60,"259.56","veg","2 pieces"),
(9,"CHOCOLATE CROSSANT (2 Pieces)","Chocolate Croissant","2 pieces",80,"598.91","veg","2 pieces"),
(10,"LEMON POPPY SEED CAKE","Lemon Poppy Seed Cake","",100,"356.70","non-veg",""),
(11,"CHOCOLATE MUFFIN","Chocolate Muffin","",100,"404.21","veg",""),
(12,"PANEER TIKKA CHIPOTLE BREAD S/W","Paneer Tikka Chipotle Bread Sandwich","",165,"376.18","veg",""),
(13,"SPINACH N CORN CHEESE CHIPOTLE BREAD S/W","Spinach n Corn Cheese Chipotle Bread Sandwich","",150,"351.43","veg",""),
(14,"SMOKED CHICKEN CHIPOTLE BREAD S/W","Smoked Chicken Chipotle Bread Sandwich","",165,"329.67","non-veg",""),
(15,"TANDOORI CHICKEN CHIPOTLE BREAD S/W","Tandoori Chicken Chipotle Bread Sandwich","",190,"414.20","non-veg",""),
(16,"TANDOORI PANEER BUN","Tandoori Paneer Bun","",160,"446.88","veg",""),
(17,"TANDOORI CHICKEN BUN","Tandoori Chicken Bun","",190,"472.34","non-veg",""),
(18,"SIGNATURE CHOCO FANTASY","Signature Choco Fantasy","",120,"450.27","veg",""),
(19,"CLASSI NEWYORK CHEESE CAKE","Classic New York Cheese Cake","",180,"562.43","non-veg",""),
(20,"STRAWBERRYLICIOUS CHEESE CAKE","Strawberrylicious Cheese Cake","",200,"571.05","non-veg",""),
(21,"HAZELNUT BROWNIE","Hazelnut Brownie","",95,"321.19","veg",""),
(22,"RED VELVET HEAVEN","Red Velvet Heaven","",120,"329.06","veg",""),
(23,"CRUCNH CAKE ( Full Cake 695g)","Crunch Cake","per 100 g",100,"258.77","veg","per 100g; full cake 695 g"),
(24,"RED VELVET  CAKE (Full Cake 740g)","Red Velvet Cake","per 100 g",100,"274.22","veg","per 100g; full cake 740 g"),
(25,"DUTCH TRUFFLE (Full Cake 730g)","Dutch Truffle Cake","per 100 g",100,"366.25","veg","per 100g; full cake 730 g"),
(26,"CHOCOLATE NIRVANA SUNDAE","Chocolate Nirvana Sundae","",250,"638.50","veg",""),
(27,"GOOEY FUDGY BROWNIE SUNDAE","Gooey Fudgy Brownie Sundae","",250,"727.25","veg",""),
(28,"MERRYBERRY SUNDAE","Merryberry Sundae","",195,"471.32","veg",""),
(29,"CARAMEL ME SUNDAE","Caramel Me Sundae","",195,"525.53","veg",""),
(30,"CLASSIC HOT FUDGE SUNDAE","Classic Hot Fudge Sundae","",180,"499.14","veg",""),
(31,"WHAT A  FUDGE SUNDAE","What A Fudge Sundae","",180,"367.20","veg",""),
(32,"SIZZLE MY BROWNIE SUNDAE","Sizzle My Brownie Sundae","",180,"493.74","veg",""),
(33,"VANILLA ICECREAM SCOOPS (170ml)","Vanilla Ice Cream Scoops","170 ml",85,"200.18","veg","170 ml (85 g)"),
(34,"CHOCOLATE ICECREAM SCOOPS (170ml)","Chocolate Ice Cream Scoops","170 ml",85,"215.05","veg","170 ml (85 g)"),
]
rows = []
for sl, pub, item, var, sec, ml, kcal in bev:
    note = f"Published name: {pub}."
    if "Sugar Free" in pub:
        note += " Chart footnote: 'Sugar Free* Not Recommended For Phenylketonurics, For Children Suffering From Seizure Disorders, Pregnant & Lactating Mothers' (sweetener variant; distinct from 'No Sugar' rows)."
    note += " Only Energy (kcal) published; chart says 'Values mentioned are approx value'. Milk type not stated; Soy Cappuccino is the only explicit non-dairy option."
    rows.append(dict(brand="Cafe Coffee Day", country="IN", item=item, variant_or_size=var, serving_desc=f"{ml} ml as served", serving_ml=ml, kcal=kcal, veg_nonveg="veg", source_url=BEV_URL, source_title=BEV_TITLE, source_date_or_version=BEV_VER, page_or_section=f"{sec}, Sl no. {sl}", notes=note))
for sl, pub, item, var, g, kcal, veg, sd in food:
    note = f"Published name: {pub}. Only Energy (kcal) published."
    if sd.startswith("per 100g"):
        note += " Value is per 100 g of the whole celebration cake, not per slice."
    rows.append(dict(brand="Cafe Coffee Day", country="IN", item=item, variant_or_size=var, serving_desc=sd or f"{g} g serve", serving_g=g, kcal=kcal, veg_nonveg=veg, source_url=FOOD_URL, source_title=FOOD_TITLE, source_date_or_version=FOOD_VER, page_or_section=f"Food chart, Sl no. {sl}", notes=note))
csvlib.write(out, rows)
