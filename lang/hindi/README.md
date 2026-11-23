<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/logo-framed-dark.png" />
    <img src=".github/readme/logo-framed-light.png" alt="AppBlips — टेक्स्ट से ऐप और वेबसाइट जेनरेटर" width="440" />
  </picture>
</p>

<p align="center">
  <strong>सरल अंग्रेजी प्रॉम्प्ट्स को सेकंडों में काम करने वाले ऐप्स, गेम्स और वेबसाइटों में बदलें।</strong>
</p>

<p align="center">
  <a href="https://apps.microsoft.com/detail/9nk9ss4v2n1k?hl=en-US&amp;gl=US"><img alt="Windows के लिए डाउनलोड करें" src=".github/readme/download-windows.svg" width="200" height="61"></a>
  <a href="https://github.com/TechMitten/app-blips/releases/latest"><img alt="Ubuntu के लिए डाउनलोड करें" src=".github/readme/download-ubuntu.svg" width="200" height="61"></a>
  <a href="https://web.appblips.com/"><img alt="अपने ब्राउज़र में आज़माएँ" src=".github/readme/browser-demo.svg" width="200" height="61"></a>
</p>

<p align="center">
  <a href="https://snapcraft.io/appblips"><img alt="Snap Store से प्राप्त करें" src=".github/readme/snap-store.svg" height="61"></a>
  <a href="https://pinokio.co/apps/github-com-techmitten-app-blips-pinokio"><img alt="Pinokio पर डाउनलोड करें" src=".github/readme/pinokio.png" height="61"></a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="लाइसेंस: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <a href="https://github.com/techmitten/app-blips/stargazers"><img alt="GitHub स्टार्स" src="https://img.shields.io/github/stars/techmitten/app-blips?style=flat&color=yellow"></a>
  <a href="https://discord.gg/a7QfqbvaF9"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white"></a>
  <a href="https://web.appblips.com/"><img alt="लाइव डेमो आज़माएँ" src="https://img.shields.io/badge/Try-Live_Demo-4F46E5?style=flat"></a>
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white">
</p>



https://github.com/user-attachments/assets/ac21e84c-909e-4c8c-8392-f875a53c0dce


---

**AppBlips** किसी को भी प्राकृतिक-भाषा (natural-language) के विवरणों से कार्यात्मक ऐप्स, वेबसाइट और 3D गेम्स बनाने की सुविधा देता है—इसके लिए कोडिंग की आवश्यकता नहीं है, और जब आप चाहें तो आपको पूरा कोड एक्सेस भी मिलता है।

इसे अपनी खुद की API कुंजी (Anthropic, OpenAI, Gemini, xAI, DeepSeek, या OpenRouter) के साथ स्थानीय रूप से चलाएँ। इसमें कोई वेंडर लॉक-इन नहीं है: जेनरेट किया गया कोड हमेशा आपका अपना रहता है।

## लाइव डेमो

**[web.appblips.com](https://web.appblips.com/)** पर अपने ब्राउज़र में AppBlips को आज़माएँ।

पूर्ण अनुभव (डिस्क पर फ़ोल्डर के रूप में सहेजे गए प्रोजेक्ट्स, और एक एन्क्रिप्टेड OS-कीचेन की-स्टोर) के लिए, ऊपर दिया गया डेस्कटॉप ऐप डाउनलोड करें या `npm start` अथवा Docker के साथ अपनी खुद की कॉपी चलाएँ।

## मुख्य विशेषताएँ

### निर्माण और संपादन (Creation & Editing)
- **तत्काल लाइव पूर्वावलोकन (Instant Live Preview)** — डेस्कटॉप/मोबाइल टॉगल और ज़ूम नियंत्रणों के साथ एक सैंडबॉक्स व्यू में अपने प्रोजेक्ट को रेंडर होते हुए देखें।
- **विज़ुअल क्लिक-टू-एडिट (Visual Click-to-Edit)** — टेक्स्ट संपादित करने, इमेज बदलने, लिंक अपडेट करने या कॉन्टेक्स्ट मेनू से लक्षित AI सुधार ट्रिगर करने के लिए सीधे Website Studio में एलिमेंट्स चुनें।
- **बिल्ट-इन कोड एडिटर** — सिंटैक्स हाइलाइटिंग और लोकल ऑटोकम्प्लीट के साथ सीधे कोड का निरीक्षण और संपादन करें। मैन्युअल संपादन नए संस्करणों के रूप में सहेजे जाते हैं, और सिंटैक्स त्रुटियों को ओवरराइट किए बिना रिपोर्ट किया जाता है।
- **प्रोजेक्ट इमेज गैलरी ("My Images")** — अपनी खुद की एसेट्स अपलोड करें या Pixabay के माध्यम से मुफ्त स्टॉक फ़ोटो प्राप्त करें, और फिर अपने प्रॉम्प्ट्स में उनका संदर्भ दें (जैसे, *"हीरो सेक्शन में team-photo का उपयोग करें"*)।
- **स्थानीय वॉइस इनपुट (Local Voice Input)** — एक बंडल किए गए Whisper मॉडल का उपयोग करके प्रॉम्प्ट बोलकर लिखें जो पूरी तरह से आपके डिवाइस पर चलता है—कोई भी ऑडियो आपकी मशीन से बाहर नहीं जाता है।
- **स्वचालित वर्जनिंग (Automatic Versioning)** — प्रत्येक जेनरेशन और मैन्युअल संपादन को एक स्नैपशॉट के रूप में सहेजा जाता है जिसे आप किसी भी समय पूर्ववत (undo) या पुनर्स्थापित (restore) कर सकते हैं।
- **टोकन अनुमान (Token Estimate)** — बिल्ड पैन का हेडर प्रत्येक चैट द्वारा उपयोग किए गए टोकन का लाइव अनुमान लगाता है, और होवर करने पर इनपुट, कैश्ड इनपुट और आउटपुट दिखाता है। यह केवल एक अनुमान है; आपके AI प्रदाता का उपयोग पृष्ठ दिखाता है कि आप वास्तव में कितना भुगतान करते हैं।

### AI और एकीकरण (AI & Integrations)
- **अपनी खुद की कुंजी लाएँ (Bring Your Own Key)** — कॉन्फ़िगर करने योग्य मॉडल रीज़निंग स्तरों के साथ Anthropic, OpenAI, Gemini, xAI, DeepSeek, या OpenRouter से एक API कुंजी कनेक्ट करें।
- **एक्सटेंशन (Extensions)** — Web3Forms (संपर्क फ़ॉर्म), Umami/Plausible (एनालिटिक्स), tawk.to (लाइव चैट), Square (भुगतान), Pollinations (AI मीडिया और चैट), Pixabay (स्टॉक फ़ोटो), और Tailwind CSS को आसानी से एकीकृत करें।
- **बिल्ट-इन SEO** — एक्सपोर्ट या पब्लिश करने पर स्वचालित रूप से SEO मेटाडेटा, एक `sitemap.xml`, और एक `robots.txt` जेनरेट करने के लिए **Settings → Tools** में कुछ त्वरित प्रश्नों के उत्तर दें।

### इम्पोर्ट, एक्सपोर्ट और पब्लिशिंग
- **लचीला एक्सपोर्ट (Flexible Export)** — किसी भी प्रोजेक्ट को एक स्व-निहित (self-contained) HTML फ़ाइल के रूप में डाउनलोड करें, या App Studio प्रोजेक्ट्स को एक पूर्ण React + Vite कोडबेस के रूप में एक्सपोर्ट करें।
- **प्रोजेक्ट इम्पोर्ट** — मौजूदा सिंगल-फ़ाइल HTML पेज, HTML/CSS/JS साइट का `.zip` आर्काइव, या React + Vite प्रोजेक्ट इम्पोर्ट करें।
- **वन-क्लिक वेब पब्लिशिंग** — वैकल्पिक पासवर्ड सुरक्षा, कस्टम फ़ेविकॉन और PWA इंस्टॉल प्रॉम्प्ट्स के साथ सीधे एक मुफ्त `*.surge.sh` HTTPS डोमेन पर डिप्लॉय करें।
- **कम्युनिटी एक्सप्लोर** — ऐप के अंदर समुदाय द्वारा बनाई गई वेबसाइटों और गेम्स को ब्राउज़ करें और अपनी खुद की रचनाएँ सबमिट करें।

---

## त्वरित शुरुआत (Quick Start)

### 1. डेस्कटॉप ऐप (Windows, Linux, macOS)
- **Windows:** **[Microsoft Store](https://apps.microsoft.com/detail/9nk9ss4v2n1k)** से इंस्टॉल करें (इसमें स्वचालित अपडेट शामिल हैं)। प्रत्येक [GitHub रिलीज़](https://github.com/TechMitten/app-blips/releases/latest) में `AppBlips-Windows-Installer.exe` भी होता है, जो Microsoft का छोटा Store इंस्टॉलर है और वही Store संस्करण इंस्टॉल करता है।
- **Linux:** **[GitHub Releases](https://github.com/TechMitten/app-blips/releases/latest)** से `.AppImage` या `.deb` पैकेज डाउनलोड करें।
- **macOS:** अपनी खुद की API कुंजी के साथ लोकल ब्राउज़र संस्करण चलाने के लिए **[Pinokio](https://pinokio.co/apps/github-com-techmitten-app-blips-pinokio)** के माध्यम से इंस्टॉल करें, या नीचे दिए गए Docker / सोर्स का उपयोग करें।

> **पहली बार चलाने पर:** अपने प्रोजेक्ट्स के लिए एक फ़ोल्डर चुनें, फिर एक API कुंजी दर्ज करें (जो आपके OS कीचेन के माध्यम से एन्क्रिप्ट की जाती है)।

### 2. Docker (सभी प्लेटफ़ॉर्म)
[Docker Compose v2](https://docs.docker.com/get-docker/) इंस्टॉल होने पर, यह कमांड चलाएँ:

```bash
docker compose up -d

```

[http://localhost:3000](http://localhost:3000) खोलें। रोकने के लिए `docker compose down` चलाएँ, या अपडेट करने के लिए `git pull && docker compose up -d --build` चलाएँ।

### 3. सोर्स से चलाएँ (Run from Source)

इसके लिए [Node.js](https://nodejs.org/) 22.12 LTS या नए संस्करण की आवश्यकता है।

```bash
git clone [https://github.com/techmitten/app-blips.git](https://github.com/techmitten/app-blips.git)
cd app-blips
npm install
npm start

```

[http://localhost:3000](http://localhost:3000) खोलें।

* **डेस्कटॉप डेवलपमेंट:** डेवलपमेंट के लिए `npm run desktop` चलाएँ, या `dist-desktop/` में इंस्टॉलर बनाने के लिए `npm run desktop:dist` चलाएँ।
* **कॉन्फ़िगरेशन:** सर्वर या प्रदाता सेटिंग्स को कस्टमाइज़ करने के लिए `.env.example` को `.env` में कॉपी करें।

---

## आर्किटेक्चर और डेवलपर नोट्स

```text
src/
  App.jsx            # वर्कस्पेस स्टेट, अनडू/रीडू हिस्ट्री और कंपोज़िशन रूट
  previewBridge.js   # सैंडबॉक्स किए गए iframe के साथ संवाद करने के लिए जेनरेट किए गए ऐप्स में इंजेक्ट की गई स्क्रिप्ट
  lib/               # मुख्य लॉजिक: LLM अनुरोध, सटीक कोड संपादन, प्रॉम्प्ट्स और हेल्पर्स
  hooks/             # प्रोजेक्ट स्टेट, पूर्वावलोकन व्यूपोर्ट, इमेज गैलरी और थीम्स के लिए React हुक्स
  components/        # UI कंपोनेंट्स: Header, BuildPanel, PreviewPane और मोडल
electron/            # डेस्कटॉप ऐप: मुख्य प्रोसेस, प्रीलोड, डिस्क स्टोरेज और इन-प्रोसेस API रूट्स
server.js            # वेब सर्वर (npm start / Docker): dist/ और /api/* एंडपॉइंट्स सर्व करता है
testing/             # बैकएंड रूट्स और पूर्वावलोकन लॉजिक के लिए स्टैंडअलोन Node टेस्ट स्क्रिप्ट्स
scripts/             # बिल्ड स्क्रिप्ट्स, जिसमें Whisper मॉडल फ़ेच करना शामिल है

```

## AppBlips का समर्थन करें

यदि AppBlips आपके लिए उपयोगी है, तो Product Hunt पर एक अपवोट या GitHub पर एक स्टार अन्य लोगों को इसे खोजने में मदद करता है, और Ko-fi पर एक टिप डेवलपमेंट को जारी रखने में मदद करती है।

## लाइसेंस

[MIT License](https://www.google.com/search?q=LICENSE) के तहत लाइसेंस प्राप्त। थर्ड-पार्टी ओपन-सोर्स लाइसेंस ऐप में **Settings → About → Licenses** के अंतर्गत उपलब्ध हैं।

