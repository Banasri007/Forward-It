// Sample forwards for the demo. Dates are relative to today, so they never go stale.

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function nextWeekday(day, minDays) {
  const d = daysFromNow(minDays);
  while (d.getDay() !== day) d.setDate(d.getDate() + 1);
  return d;
}
const longDate = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
const dayDate = (d) => d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
const numericDate = (d) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

export const SAMPLES = [
  {
    id: "circular",
    icon: "fileText",
    label: "School circular",
    text: () =>
      `*Sunrise Public School* 📢\nDear Parents,\n` +
      `1. Term-2 fee of ₹2,400 must be paid by ${longDate(daysFromNow(6))}. Late fee ₹100 per day after that.\n` +
      `2. Parent-Teacher Meeting on ${dayDate(nextWeekday(6, 2))}, 10 AM to 12 PM. Please bring the student's diary.\n` +
      `3. Students must wear a white shirt tomorrow for the Annual Day rehearsal.\n` +
      `Regards,\nClass Teacher, 5-B`,
  },
  {
    id: "photo",
    icon: "image",
    label: "Photo of a notice",
    file: "samples/school-notice.jpg",
    needs: "ai",
  },
  {
    id: "voice",
    icon: "mic",
    label: "Voice note",
    file: "samples/voice-note.wav",
    seconds: 9,
    needs: "voice",
  },
  {
    id: "pdf",
    icon: "fileText",
    label: "Society notice PDF",
    file: "samples/society-notice.pdf",
  },
  {
    id: "hinglish",
    icon: "message",
    label: "Hinglish group chat",
    text: () => "Sabhi parents dhyan de: kal sabko ek white chart paper aur glue stick lana hai. Aur Friday tak project file jama karni hai 🙏",
  },
  {
    id: "bill",
    icon: "wallet",
    label: "Electricity bill SMS",
    text: () =>
      `Dear Consumer, your electricity bill of Rs. 1,385.00 for CA No. 10234567 is due on ${numericDate(daysFromNow(3))}. ` +
      `Pay via app to avoid late payment surcharge. -CityPower`,
  },
  {
    id: "doctor",
    icon: "calendarClock",
    label: "Doctor appointment",
    text: () =>
      `Your appointment with Dr. Mehta (Dental) is confirmed for ${dayDate(daysFromNow(4))} at 11:30 AM. Please arrive 15 min early. - SmileCare Clinic`,
  },
  {
    id: "noise",
    icon: "sparkles",
    label: "Good-morning forward",
    text: () => "🌞 Good morning! Have a blessed day. Forward to 10 people for good luck 🌸🙏",
  },
];

export const sampleById = (id) => SAMPLES.find((s) => s.id === id);
