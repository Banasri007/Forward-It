// Short replies people actually type on WhatsApp: "done", "ho gaya", "👍", "list"...

const COMMANDS = [
  ["list", /^(list|my list|tasks|todo|to do|today|kya hai|kya kya hai|list dikhao|लिस्ट|सूची)$/i],
  ["done", /^(done|did it|finished|completed|ho gaya|ho gya|hogaya|ho gayi|kar diya|✅|👍|☑️|✔️|हो गया|कर दिया)\s*#?(\d+)?$/iu],
  ["later", /^(later|snooze|remind later|baad mein|baad me|बाद में)\s*#?(\d+)?$/iu],
  ["undo", /^(undo|galti|galti se|oops)$/i],
  ["delete", /^(delete|remove|cancel|hatao|हटाओ)\s*#?(\d+)$/i],
  ["share", /^(?:share|share with|add family|family add)\s+(\+?\d[\d\s-]{6,16}\d)$/i],
  ["family", /^(family|my family|members|parivar|परिवार)$/i],
  ["leave", /^(leave|leave family|stop sharing)$/i],
  ["name", /^(?:my name is|name|naam|mera naam)\s+([\p{L}][\p{L} .'-]{0,29})$/iu],
  ["help", /^(help|hi|hii|hello|hey|start|menu|namaste|namaskar|नमस्ते|\?)$/i],
  ["lang", /^(?:lang(?:uage)?\s+)?(english|hindi|hinglish|हिंदी)$/i],
];

const LANG_CODES = { english: "en", hindi: "hi", "हिंदी": "hi", hinglish: "hinglish" };

/** Returns { name, n?, lang?, value? } or null when the text isn't a command. */
export function parseCommand(text) {
  const clean = text.trim().replace(/[.!]+$/, "");
  for (const [name, pattern] of COMMANDS) {
    const match = clean.match(pattern);
    if (!match) continue;
    if (name === "lang") return { name, lang: LANG_CODES[match[1].toLowerCase()] };
    if (name === "share" || name === "name") return { name, value: match[1].trim() };
    const n = match[2] ? Number(match[2]) : null;
    return { name, n };
  }
  return null;
}
