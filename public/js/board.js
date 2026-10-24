// The dashboard next to the phones: Tasks, This week, Impact.
import { icon, KIND } from "./icons.js";
import { api, clockLabel, dateLabel, dueLabel, escapeHtml, nowClock, todayKey, toast, whenLabel } from "./util.js";

const byDue = (a, b) => `${a.dueDate ?? "9"}${a.dueTime ?? ""}`.localeCompare(`${b.dueDate ?? "9"}${b.dueTime ?? ""}`) || a.n - b.n;
const SOURCE_LABEL = { text: "Text", photo: "Photo", pdf: "PDF", voice: "Voice note" };

export class Board {
  constructor(root, { user }) {
    this.root = root;
    this.user = user;
    this.tab = "tasks";
    this.tasks = [];
    this.insights = null;
    this.views = {
      tasks: root.querySelector('[data-panel="tasks"]'),
      week: root.querySelector('[data-panel="week"]'),
      impact: root.querySelector('[data-panel="impact"]'),
    };
    root.querySelectorAll('[role="tab"]').forEach((tab) => tab.addEventListener("click", () => this.show(tab.dataset.tab)));
    root.querySelector("#export-ics").href = `/api/sim/calendar.ics?user=${encodeURIComponent(user)}`;
    root.addEventListener("click", (e) => this.onAction(e));
  }

  show(tab) {
    this.tab = tab;
    this.root.querySelectorAll('[role="tab"]').forEach((el) => el.setAttribute("aria-selected", String(el.dataset.tab === tab)));
    for (const [name, view] of Object.entries(this.views)) view.hidden = name !== tab;
  }

  async refresh() {
    [this.tasks, this.insights] = await Promise.all([api(`tasks?user=${this.user}`), api(`insights?user=${this.user}`)]);
    this.render();
    return this.tasks;
  }

  render() {
    const active = this.tasks.filter((t) => t.status === "active");
    this.root.querySelector("#count-tasks").textContent = active.length || "";
    this.renderTasks(active);
    this.renderWeek(active);
    this.renderImpact();
  }

  /* ---------- Tasks ---------- */

  renderTasks(active) {
    const today = todayKey();
    const missed = (t) => t.dueDate && !t.past && (t.dueDate < today || (t.dueDate === today && t.dueTime && t.dueTime < nowClock()));
    const groups = [
      ["Missed", active.filter(missed)],
      ["Today", active.filter((t) => t.dueDate === today && !missed(t) && !t.past)],
      ["Coming up", active.filter((t) => t.dueDate && t.dueDate > today)],
      ["Past date when forwarded", active.filter((t) => t.past)],
      ["No date", active.filter((t) => !t.dueDate)],
      ["Done", this.tasks.filter((t) => t.status === "done")],
    ];
    if (!this.tasks.length) {
      this.views.tasks.innerHTML = `
        <div class="empty">
          <div class="empty-art">${icon("forward", 26)}</div>
          <h3>Nothing here yet</h3>
          <p>Forward a sample to Priya's phone, or press <strong>Play guided demo</strong>. Tasks appear here the moment they're understood.</p>
        </div>`;
      return;
    }
    this.views.tasks.innerHTML = groups
      .filter(([, list]) => list.length)
      .map(
        ([label, list]) => `
        <section class="tgroup${label === "Done" ? " is-done" : ""}">
          <h4>${label}<span>${list.length}</span></h4>
          <ul>${list.sort(byDue).map((t) => taskRow(t, this.user)).join("")}</ul>
        </section>`,
      )
      .join("");
  }

  async onAction(e) {
    const button = e.target.closest("[data-act]");
    if (!button) return;
    const { act, n } = button.dataset;
    try {
      if (act === "done") await api(`tasks/${n}/done`, { method: "POST", body: { user: this.user } });
      if (act === "delete") await api(`tasks/${n}/delete`, { method: "POST", body: { user: this.user } });
      await this.refresh();
    } catch {
      toast("Couldn't update that task.");
    }
  }

  /* ---------- This week ---------- */

  renderWeek(active) {
    const days = Array.from({ length: 7 }, (_, i) => todayKey(i));
    const undated = active.filter((t) => !t.dueDate).length;
    const later = active.filter((t) => t.dueDate && t.dueDate > days[6]).length;
    this.views.week.innerHTML = `
      <div class="week">
        ${days
          .map((day, i) => {
            const list = active.filter((t) => t.dueDate === day).sort(byDue);
            const [weekday, ...rest] = dateLabel(day, { relative: false }).split(", ");
            return `
            <div class="wday${i === 0 ? " is-today" : ""}${list.length ? "" : " is-empty"}">
              <div class="wday-head"><span>${i === 0 ? "Today" : weekday}</span><strong>${rest.join(" ").split(" ")[0]}</strong></div>
              <div class="wday-items">
                ${list
                  .map(
                    (t) => `<div class="wchip k-${t.kind}" title="${escapeHtml(t.title)}">
                      <span class="wchip-icon">${icon(KIND[t.kind]?.icon ?? "listChecks", 13)}</span>
                      <span class="wchip-text">${t.dueTime ? `<b>${clockLabel(t.dueTime)}</b>` : ""}${escapeHtml(t.title)}</span>
                    </div>`,
                  )
                  .join("")}
              </div>
            </div>`;
          })
          .join("")}
      </div>
      <p class="week-foot">${[later && `${later} more after this week`, undated && `${undated} without a date`].filter(Boolean).join(" · ") || "Everything due in the next 7 days, at a glance."}</p>`;
  }

  /* ---------- Impact ---------- */

  renderImpact() {
    const s = this.insights;
    if (!s) return;
    const rate = s.done ? Math.round((s.doneOnTime / s.done) * 100) : null;
    const sources = ["text", "photo", "pdf", "voice"].map((k) => [SOURCE_LABEL[k], s.bySource[k] ?? 0]);
    const kinds = Object.entries(KIND).map(([k, v]) => [v.label, s.byKind[k] ?? 0, k]);
    const max = (rows) => Math.max(1, ...rows.map((r) => r[1]));
    const bars = (rows, cls) =>
      rows
        .map(
          ([label, value, kind]) => `
        <div class="bar-row">
          <span class="bar-label">${label}</span>
          <span class="bar-track"><span class="bar-fill ${cls}${kind ? ` k-${kind}` : ""}" style="width:${(value / max(rows)) * 100}%"></span></span>
          <span class="bar-value">${value}</span>
        </div>`,
        )
        .join("");

    this.views.impact.innerHTML = `
      <div class="impact">
        <div class="impact-hero">
          <div class="ih-num">${rate === null ? "—" : `${rate}<small>%</small>`}</div>
          <div class="ih-text">
            <strong>finished on time</strong>
            <span>${s.done ? `${s.doneOnTime} of ${s.done} completed tasks were done before their deadline.` : "Finish a task to see this. Reply 👍 to a reminder, or tick one off in Tasks."}</span>
          </div>
        </div>
        <div class="stats">
          ${stat("Tasks captured", s.captured, s.forwards ? `from ${s.forwards} forward${s.forwards === 1 ? "" : "s"}` : "none yet")}
          ${stat("Missed", s.missed, s.missed ? "past due, not done" : "nothing slipped through", s.missed ? "warn" : "good")}
          ${stat("Noise ignored", s.noise, "forwards that weren't tasks")}
          ${stat("Reminders sent", s.reminders, `to ${s.members.length} ${s.members.length === 1 ? "person" : "people"}`)}
        </div>
        <div class="impact-cols">
          <div><h4>What it read</h4>${bars(sources, "src")}</div>
          <div><h4>What it found</h4>${bars(kinds, "kind")}</div>
        </div>
        <p class="impact-note">${icon("shield", 15)} Counted live from this demo's data. On WhatsApp, the same numbers show a family's real before-and-after.</p>
      </div>`;
  }
}

function stat(label, value, sub, tone = "") {
  return `<div class="stat ${tone}"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="stat-sub">${sub}</span></div>`;
}

function taskRow(t, user) {
  const kind = KIND[t.kind] ?? KIND.todo;
  const due = dueLabel(t);
  const meta = [];
  meta.push(`<span>${icon("calendar", 13)}${due ?? "No date"}</span>`);
  if (t.status === "done") meta.push(`<span class="ok">${icon("check", 13)}Done${t.doneByName ? ` by ${escapeHtml(t.doneByName)}` : ""}</span>`);
  else if (t.past) meta.push(`<span class="warn">Date had passed</span>`);
  else if (t.remindedAt) meta.push(`<span class="ok">${icon("bell", 13)}Reminded</span>`);
  else if (t.remindAt) meta.push(`<span>${icon("bell", 13)}${whenLabel(t.remindAt)}</span>`);
  if (t.amount) meta.push(`<span class="amount">${escapeHtml(t.amount)}</span>`);

  const actions =
    t.status === "active"
      ? `<button class="tact" data-act="done" data-n="${t.n}" title="Mark done" aria-label="Mark #${t.n} done">${icon("check", 16)}</button>
         ${t.dueDate ? `<a class="tact" href="/api/sim/calendar.ics?user=${encodeURIComponent(user)}&n=${t.n}" title="Add to calendar" aria-label="Add #${t.n} to calendar">${icon("calendarPlus", 16)}</a>` : ""}
         <button class="tact" data-act="delete" data-n="${t.n}" title="Delete" aria-label="Delete #${t.n}">${icon("trash", 16)}</button>`
      : "";

  return `
    <li class="task k-${t.kind}${t.status === "done" ? " is-done" : ""}">
      <span class="task-kind" title="${kind.label}">${icon(kind.icon, 17)}</span>
      <div class="task-main">
        <div class="task-title"><span class="task-n">#${t.n}</span>${escapeHtml(t.title)}</div>
        ${t.details ? `<div class="task-details">${escapeHtml(t.details)}</div>` : ""}
        <div class="task-meta">${meta.join("")}</div>
        ${t.sourceQuote ? `<div class="task-quote">“${escapeHtml(t.sourceQuote)}”</div>` : ""}
        <div class="task-tags">
          <span>${SOURCE_LABEL[t.source] ?? "Text"}</span><span>${t.engine === "ai" ? "Read by AI" : "Offline parser"}</span>
          ${t.dateConfidence === "inferred" ? "<span>Date worked out</span>" : ""}
          <span class="who" title="Added by ${escapeHtml(t.createdByName)}">${escapeHtml(t.createdByName)}</span>
        </div>
      </div>
      <div class="task-actions">${actions}</div>
    </li>`;
}
