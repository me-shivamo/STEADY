We are using the react nativ + expo to create this mobile app 
we are going to write the code in typescript 

so whenever we are using an API we are store that somewher on the server insted off storing it on the code and here we are using this in the superbase. 



# What "reverse engineering the app binary" means

When you build a React Native app and submit it to the App Store or Play Store, it gets compiled into a binary file — a .ipa (iOS) or .apk/.aab (Android). This file is what gets installed on people's phones.

The problem: this binary is downloadable by anyone. Someone can:

Download the .ipa or .apk from the store (or intercept it)
Run tools like strings, jadx, apktool, or Frida on it
These tools extract all hardcoded text from the binary — URLs, variable names, string constants
If your code contains const OPENAI_KEY = "sk-abc123...", that string exists verbatim inside the binary
It looks like this in practice:


`attacker runs this on your .apk`
strings your-app.apk | grep "sk-"
`# output:`
`# sk-proj-abc123yoursecretkey...`
That's it. 30 seconds to steal your API key. Then they can make unlimited OpenAI/Anthropic calls charged to your account.

# What is Expo and why are we using it?
Think of React Native as a framework that lets you write UI code in JavaScript/TypeScript that compiles down to real native iOS and Android views — not a web browser embedded in an app, actual native components. It's like writing Java/Kotlin for Android or Swift for iOS, but in one language that targets both.

Expo is a toolchain built on top of React Native that removes enormous amounts of setup pain. Without Expo, you'd need Xcode installed (Mac only), Android Studio, simulators configured, native build chains working. With Expo's managed workflow, you can write code and preview it on your physical phone immediately via the Expo Go app — no native tooling required until you're ready to publish.

The command we're about to run — npx create-expo-app — is the equivalent of mvn archetype:generate in Java or django-admin startproject in Python. It scaffolds the project structure, configures TypeScript, and gives us a working "Hello World" app we can open on a phone in about 2 minutes.

Why --template blank-typescript? Expo has several starter templates. The default now includes a file-based router we don't want. blank-typescript gives us a clean slate with TypeScript configured — no opinions about routing or structure, we'll add our own.







# Task to perform 

1. Make the card componenet looks better and editable 
2. Make a page where user can edit the card 
3. Make the home page cal ring small concise 
4. Make the chatgpt calorie extraction code and LLM more robust
5. Add the Image data extraction feature as well 
6. Make the Chat with AI - a. concise b. Stored in the data c. Agentic like silicon backed with data and information 
7. AI is giving me different answers all the time, so this is flucluating
8. The meal card is not getting update after editing. 



DatePickerSheet.tsx ← new

WeekStrip: always-visible 7-day row centred on selectedDate, future days muted
MonthGrid: full calendar with < Month Year > nav and flexWrap day grid
MonthPills: horizontal Jan–Dec shortcut row
Expand/collapse via Animated.Value → maxHeight interpolation (0 → 420), useNativeDriver: false because maxHeight is a layout property, not a transform
HomeScreen.tsx