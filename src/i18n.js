// Every message the bot sends, in English, Hinglish (Hindi in Latin letters)
// and Hindi. WhatsApp formatting: *bold*, _italic_.

const plural = (n, one, many) => (n === 1 ? one : many);

const STRINGS = {
  en: {
    welcome: () =>
      "👋 Hi! I'm *Forward-It*.\n" +
      "Forward me any message, notice photo or PDF (school circulars, bills, appointments) and I'll remind you before it's due.\n\n" +
      "*LIST* see everything · *DONE* mark finished · *LATER* snooze · *UNDO* remove the last one\n" +
      "*SHARE +91…* share your list with family · voice notes work too 🎤\n" +
      "Language: send *HINDI*, *HINGLISH* or *ENGLISH*",
    savedHeader: ({ n }) => `✅ Got it! I'll remember ${n} ${plural(n, "thing", "things")}:`,
    reminderLine: ({ when }) => `⏰ Reminder: ${when}`,
    noDate: () => "📅 No date found",
    pastDate: () => "⚠️ This date has already passed",
    savedFooter: () => "Reply *UNDO* to remove · *LIST* to see all",
    duplicate: ({ titles }) => `ℹ️ Already on your list: ${titles}`,
    askDate: ({ title }) => `When is *${title}* due? Reply like _Friday_, _tomorrow 6pm_ or _skip_.`,
    dateSet: ({ when }) => `👍 Saved. ⏰ Reminder: ${when}`,
    dateSetPast: () => "👍 Saved, but that date has already passed, so no reminder.",
    skipped: () => "👍 Saved without a date. It'll stay on your *LIST*.",
    nothingFound: ({ reason }) =>
      `🙂 I didn't find anything to do here${reason ? ` (looks like ${reason})` : ""}.\n` +
      "Forward me a notice, bill or message with a task and I'll keep track.",
    mediaNeedsAi: () => "📷 I can't read photos in offline mode. Please paste the text instead (or add an AI key to the server).",
    pdfNoText: () => "📄 This PDF is a scanned picture, so there's no text I can read. Please paste the text, or send a photo of it.",
    aiBusy: () => "⏳ I couldn't read that right now (the AI service is busy). Please send it again in a minute, or paste the text.",
    photoSkipped: () => "_(I couldn't read one of the attachments, so I used the rest of the message.)_",
    voiceUnsupported: () => "🎤 I can't listen to voice notes without an AI key on the server. Please type it in one line.",
    heard: ({ text }) => `🎤 _I heard:_ “${text}”`,
    error: () => "😕 Something went wrong reading that. Please try again, or paste the text.",
    addedByOther: ({ name, items }) => `📥 *${name}* added to your family list:\n${items}`,
    doneByOther: ({ name, title }) => `✅ *${name}* ticked off: ${title}`,
    shareAdded: ({ name }) =>
      `👨‍👩‍👧 *${name}* is now on your family list. You'll both get reminders, and when one of you finishes a task, the other is told.`,
    shareInvite: ({ name }) =>
      `👋 *${name}* added you to their Forward-It family list. You'll get reminders for shared tasks too.\nReply *LIST* to see them, or *LEAVE* to stop.`,
    shareSandboxNote: () => "_(On the test number, they first need to send the sandbox join code to this number, or they won't get messages.)_",
    shareSelf: () => "That's your own number 🙂 Send *SHARE* followed by your family member's number.",
    familyList: ({ names }) => `👨‍👩‍👧 *Your family list:* ${names}`,
    familyAlone: () => "👤 It's just you for now. Send *SHARE +91XXXXXXXXXX* to add a family member.",
    left: () => "👋 You've left the family list. New tasks you forward will be just yours.",
    notInFamily: () => "You're not sharing your list with anyone right now.",
    nameSet: ({ name }) => `👍 Nice to meet you, ${name}! Your family will see this name.`,
    someone: () => "A family member",
    reminder: ({ title, due }) =>
      `⏰ *Reminder:* ${title}${due ? `\n📅 ${due}` : ""}\n\nReply *DONE* when finished · *LATER* to snooze 1 hour`,
    digestHeader: ({ n }) => `☀️ Good morning! *Today: ${n} ${plural(n, "thing", "things")}*`,
    overdueHeader: () => "*Missed:*",
    done: ({ title }) => `🎉 Done: ${title}. Nice work!`,
    alreadyDone: ({ title }) => `✔️ ${title} is already done.`,
    whichOne: () => "Which one? Reply like *DONE 2*. Send *LIST* to see the numbers.",
    notFound: ({ n }) => `I couldn't find #${n}. Send *LIST* to see the numbers.`,
    snoozed: ({ when }) => `😴 OK, I'll remind you again ${when}.`,
    deleted: ({ title }) => `🗑️ Removed: ${title}`,
    undone: ({ n }) => `↩️ Removed ${n} ${plural(n, "item", "items")} from your last message.`,
    nothingToUndo: () => "Nothing to undo.",
    listHeader: () => "📋 *Your list*",
    listEmpty: () => "📋 Your list is empty 🎈\nForward me anything with a task in it.",
    sectionOverdue: () => "*Missed*",
    sectionToday: () => "*Today*",
    sectionUpcoming: () => "*Coming up*",
    sectionNoDate: () => "*No date*",
    listFooter: ({ n }) => `Reply *DONE ${n}* to tick off #${n}`,
    langSet: () => "👍 I'll reply in English.",
  },

  hinglish: {
    welcome: () =>
      "👋 Namaste! Main *Forward-It* hoon.\n" +
      "Koi bhi message, notice ki photo ya PDF forward karo (school circular, bill, appointment) aur main time se pehle yaad dila doongi.\n\n" +
      "*LIST* sab dekho · *DONE* ho gaya · *LATER* baad mein · *UNDO* last wala hatao\n" +
      "*SHARE +91…* family ke saath list share karo · voice note bhi chalega 🎤\n" +
      "Bhasha: *HINDI*, *HINGLISH* ya *ENGLISH* bhejo",
    savedHeader: ({ n }) => `✅ Ho gaya! ${n} ${plural(n, "kaam", "kaam")} yaad rakh liye:`,
    reminderLine: ({ when }) => `⏰ Reminder: ${when}`,
    noDate: () => "📅 Date nahi mili",
    pastDate: () => "⚠️ Yeh date nikal chuki hai",
    savedFooter: () => "Hatana ho to *UNDO* · sab dekhne ke liye *LIST*",
    duplicate: ({ titles }) => `ℹ️ Yeh pehle se list mein hai: ${titles}`,
    askDate: ({ title }) => `*${title}* kab tak karna hai? Reply karo jaise _Friday_, _kal 6 baje_ ya _skip_.`,
    dateSet: ({ when }) => `👍 Save ho gaya. ⏰ Reminder: ${when}`,
    dateSetPast: () => "👍 Save ho gaya, par yeh date nikal chuki hai, isliye reminder nahi.",
    skipped: () => "👍 Bina date ke save kar liya. *LIST* mein dikhega.",
    nothingFound: ({ reason }) =>
      `🙂 Ismein koi kaam nahi mila${reason ? ` (lagta hai ${reason})` : ""}.\n` +
      "Koi notice, bill ya kaam wala message forward karo.",
    mediaNeedsAi: () => "📷 Offline mode mein photo nahi padh sakti. Text paste kar do.",
    pdfNoText: () => "📄 Yeh PDF scan ki hui photo hai, ismein padhne layak text nahi hai. Text paste karo ya photo bhejo.",
    aiBusy: () => "⏳ Abhi padh nahi payi (AI service busy hai). Ek minute baad dobara bhejo, ya text paste karo.",
    photoSkipped: () => "_(Ek attachment padh nahi payi, baaki message se kaam chalaya.)_",
    voiceUnsupported: () => "🎤 Server par AI key ke bina voice note nahi sun sakti. Ek line mein likh do.",
    heard: ({ text }) => `🎤 _Maine suna:_ “${text}”`,
    error: () => "😕 Kuch gadbad ho gayi. Dobara bhejo, ya text paste karo.",
    addedByOther: ({ name, items }) => `📥 *${name}* ne family list mein joda:\n${items}`,
    doneByOther: ({ name, title }) => `✅ *${name}* ne kar diya: ${title}`,
    shareAdded: ({ name }) =>
      `👨‍👩‍👧 *${name}* ab aapki family list mein hain. Dono ko reminder milega, aur jab koi ek kaam kar dega, doosre ko pata chal jayega.`,
    shareInvite: ({ name }) =>
      `👋 *${name}* ne aapko apni Forward-It family list mein joda hai. Shared kaamon ke reminder aapko bhi milenge.\n*LIST* bhejo dekhne ke liye, ya *LEAVE* bhejo band karne ke liye.`,
    shareSandboxNote: () => "_(Test number par unhe pehle is number par sandbox ka join code bhejna hoga, warna message nahi milenge.)_",
    shareSelf: () => "Yeh to aapka hi number hai 🙂 *SHARE* ke baad family member ka number bhejo.",
    familyList: ({ names }) => `👨‍👩‍👧 *Aapki family list:* ${names}`,
    familyAlone: () => "👤 Abhi sirf aap ho. Family member jodne ke liye *SHARE +91XXXXXXXXXX* bhejo.",
    left: () => "👋 Aap family list se nikal gaye. Ab naye kaam sirf aapke honge.",
    notInFamily: () => "Abhi aap kisi ke saath list share nahi kar rahe.",
    nameSet: ({ name }) => `👍 Milkar achha laga, ${name}! Family ko yahi naam dikhega.`,
    someone: () => "Family member",
    reminder: ({ title, due }) =>
      `⏰ *Yaad hai?* ${title}${due ? `\n📅 ${due}` : ""}\n\nHo jaaye to *DONE* bhejo · *LATER* = 1 ghante baad`,
    digestHeader: ({ n }) => `☀️ Good morning! *Aaj ke ${n} kaam*`,
    overdueHeader: () => "*Chhoot gaye:*",
    done: ({ title }) => `🎉 Shabaash! Ho gaya: ${title}`,
    alreadyDone: ({ title }) => `✔️ ${title} pehle hi ho chuka hai.`,
    whichOne: () => "Kaun sa? Reply karo jaise *DONE 2*. Number dekhne ke liye *LIST*.",
    notFound: ({ n }) => `#${n} nahi mila. Number dekhne ke liye *LIST* bhejo.`,
    snoozed: ({ when }) => `😴 Theek hai, agla reminder: ${when}`,
    deleted: ({ title }) => `🗑️ Hata diya: ${title}`,
    undone: ({ n }) => `↩️ Pichhle message ke ${n} item hata diye.`,
    nothingToUndo: () => "Hatane ke liye kuch nahi hai.",
    listHeader: () => "📋 *Aapki list*",
    listEmpty: () => "📋 List khaali hai 🎈\nKoi bhi kaam wala message forward karo.",
    sectionOverdue: () => "*Chhoot gaye*",
    sectionToday: () => "*Aaj*",
    sectionUpcoming: () => "*Aage*",
    sectionNoDate: () => "*Bina date*",
    listFooter: ({ n }) => `#${n} ho gaya? Reply *DONE ${n}*`,
    langSet: () => "👍 Ab se Hinglish mein baat karenge.",
  },

  hi: {
    welcome: () =>
      "👋 नमस्ते! मैं *Forward-It* हूँ।\n" +
      "कोई भी मैसेज, नोटिस की फोटो या PDF फॉरवर्ड करें (स्कूल सर्कुलर, बिल, अपॉइंटमेंट) और मैं समय से पहले याद दिलाऊँगी।\n\n" +
      "*LIST* सब देखें · *DONE* हो गया · *LATER* बाद में · *UNDO* आखिरी वाला हटाएँ\n" +
      "*SHARE +91…* परिवार के साथ लिस्ट साझा करें · वॉइस नोट भी चलेगा 🎤\n" +
      "भाषा: *HINDI*, *HINGLISH* या *ENGLISH* भेजें",
    savedHeader: ({ n }) => `✅ हो गया! ${n} काम याद रख लिए:`,
    reminderLine: ({ when }) => `⏰ रिमाइंडर: ${when}`,
    noDate: () => "📅 तारीख नहीं मिली",
    pastDate: () => "⚠️ यह तारीख निकल चुकी है",
    savedFooter: () => "हटाने के लिए *UNDO* · सब देखने के लिए *LIST*",
    duplicate: ({ titles }) => `ℹ️ यह पहले से लिस्ट में है: ${titles}`,
    askDate: ({ title }) => `*${title}* कब तक करना है? जवाब दें जैसे _शुक्रवार_, _कल 6 बजे_ या _skip_।`,
    dateSet: ({ when }) => `👍 सेव हो गया। ⏰ रिमाइंडर: ${when}`,
    dateSetPast: () => "👍 सेव हो गया, पर यह तारीख निकल चुकी है, इसलिए रिमाइंडर नहीं।",
    skipped: () => "👍 बिना तारीख के सेव कर लिया। *LIST* में दिखेगा।",
    nothingFound: ({ reason }) =>
      `🙂 इसमें कोई काम नहीं मिला${reason ? ` (लगता है ${reason})` : ""}।\n` +
      "कोई नोटिस, बिल या काम वाला मैसेज फॉरवर्ड करें।",
    mediaNeedsAi: () => "📷 ऑफलाइन मोड में फोटो नहीं पढ़ सकती। कृपया टेक्स्ट पेस्ट करें।",
    pdfNoText: () => "📄 यह PDF स्कैन की हुई तस्वीर है, इसमें पढ़ने लायक टेक्स्ट नहीं है। टेक्स्ट पेस्ट करें या फोटो भेजें।",
    aiBusy: () => "⏳ अभी पढ़ नहीं पाई (AI सेवा व्यस्त है)। एक मिनट बाद दोबारा भेजें, या टेक्स्ट पेस्ट करें।",
    photoSkipped: () => "_(एक अटैचमेंट नहीं पढ़ पाई, बाकी मैसेज से काम चलाया।)_",
    voiceUnsupported: () => "🎤 सर्वर पर AI key के बिना वॉइस नोट नहीं सुन सकती। कृपया एक लाइन में लिखें।",
    heard: ({ text }) => `🎤 _मैंने सुना:_ “${text}”`,
    error: () => "😕 कुछ गड़बड़ हो गई। दोबारा भेजें, या टेक्स्ट पेस्ट करें।",
    addedByOther: ({ name, items }) => `📥 *${name}* ने परिवार की लिस्ट में जोड़ा:\n${items}`,
    doneByOther: ({ name, title }) => `✅ *${name}* ने पूरा किया: ${title}`,
    shareAdded: ({ name }) =>
      `👨‍👩‍👧 *${name}* अब आपकी परिवार लिस्ट में हैं। दोनों को रिमाइंडर मिलेंगे, और जब कोई एक काम पूरा करेगा, दूसरे को पता चल जाएगा।`,
    shareInvite: ({ name }) =>
      `👋 *${name}* ने आपको अपनी Forward-It परिवार लिस्ट में जोड़ा है। साझा कामों के रिमाइंडर आपको भी मिलेंगे।\nदेखने के लिए *LIST* भेजें, या बंद करने के लिए *LEAVE*।`,
    shareSandboxNote: () => "_(टेस्ट नंबर पर उन्हें पहले इस नंबर पर सैंडबॉक्स का join कोड भेजना होगा, वरना मैसेज नहीं मिलेंगे।)_",
    shareSelf: () => "यह तो आपका ही नंबर है 🙂 *SHARE* के बाद परिवार के सदस्य का नंबर भेजें।",
    familyList: ({ names }) => `👨‍👩‍👧 *आपकी परिवार लिस्ट:* ${names}`,
    familyAlone: () => "👤 अभी सिर्फ़ आप हैं। परिवार के सदस्य को जोड़ने के लिए *SHARE +91XXXXXXXXXX* भेजें।",
    left: () => "👋 आप परिवार लिस्ट से निकल गए। अब नए काम सिर्फ़ आपके होंगे।",
    notInFamily: () => "अभी आप किसी के साथ लिस्ट साझा नहीं कर रहे।",
    nameSet: ({ name }) => `👍 मिलकर अच्छा लगा, ${name}! परिवार को यही नाम दिखेगा।`,
    someone: () => "परिवार का सदस्य",
    reminder: ({ title, due }) =>
      `⏰ *याद है?* ${title}${due ? `\n📅 ${due}` : ""}\n\nहो जाए तो *DONE* भेजें · *LATER* = 1 घंटे बाद`,
    digestHeader: ({ n }) => `☀️ सुप्रभात! *आज के ${n} काम*`,
    overdueHeader: () => "*छूट गए:*",
    done: ({ title }) => `🎉 शाबाश! हो गया: ${title}`,
    alreadyDone: ({ title }) => `✔️ ${title} पहले ही हो चुका है।`,
    whichOne: () => "कौन सा? जवाब दें जैसे *DONE 2*। नंबर देखने के लिए *LIST*।",
    notFound: ({ n }) => `#${n} नहीं मिला। नंबर देखने के लिए *LIST* भेजें।`,
    snoozed: ({ when }) => `😴 ठीक है, अगला रिमाइंडर: ${when}`,
    deleted: ({ title }) => `🗑️ हटा दिया: ${title}`,
    undone: ({ n }) => `↩️ पिछले मैसेज के ${n} आइटम हटा दिए।`,
    nothingToUndo: () => "हटाने के लिए कुछ नहीं है।",
    listHeader: () => "📋 *आपकी लिस्ट*",
    listEmpty: () => "📋 लिस्ट खाली है 🎈\nकोई भी काम वाला मैसेज फॉरवर्ड करें।",
    sectionOverdue: () => "*छूट गए*",
    sectionToday: () => "*आज*",
    sectionUpcoming: () => "*आगे*",
    sectionNoDate: () => "*बिना तारीख*",
    listFooter: ({ n }) => `#${n} हो गया? जवाब दें *DONE ${n}*`,
    langSet: () => "👍 अब से हिंदी में जवाब दूँगी।",
  },
};

export const LANGS = Object.keys(STRINGS);

export function t(lang, key, vars = {}) {
  const table = STRINGS[lang] ?? STRINGS.en;
  return (table[key] ?? STRINGS.en[key])(vars);
}
