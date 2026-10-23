const PAGE = 60;
const AMMONITE = `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#ammonite"/></svg>`;
const state = { q: "", regions: new Set(), formations: new Set(), groups: new Set(), newOnly: false, showUnknown: false, shown: PAGE };
let articles = [];
let lastVisit = null;

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDay(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function isNew(a) {
  return lastVisit && a.first_seen > lastVisit;
}

function matches(a, skip) {
  if (!state.showUnknown && a.age !== "cretaceous") return false;
  if (state.newOnly && !isNew(a)) return false;
  if (state.q && !(a.title + " " + a.summary + " " + a.source).toLowerCase().includes(state.q)) return false;
  for (const key of ["regions", "formations", "groups"]) {
    if (key === skip) continue;
    for (const t of state[key]) if (!a[key].includes(t)) return false;
  }
  return true;
}

function renderChips(key) {
  // Counts reflect the other active filters so chips show what's actually reachable.
  const counts = {};
  for (const a of articles) if (matches(a, key)) for (const t of a[key]) counts[t] = (counts[t] || 0) + 1;
  for (const t of state[key]) counts[t] = counts[t] || 0;
  const tags = Object.keys(counts).sort((x, y) => counts[y] - counts[x] || x.localeCompare(y));
  $(key).innerHTML = tags.length
    ? tags.map((t) => `<button type="button" class="chip" data-key="${key}" data-tag="${esc(t)}" aria-pressed="${state[key].has(t)}">${esc(t)}<span class="n">${counts[t]}</span></button>`).join("")
    : `<span class="meta">None yet</span>`;
}

function renderList() {
  const hits = articles.filter((a) => matches(a));
  const page = hits.slice(0, state.shown);
  $("count").textContent = `${hits.length} ${hits.length === 1 ? "story" : "stories"}`;
  let html = "";
  let day = "";
  for (const a of page) {
    const d = fmtDay(a.published);
    if (d !== day) { html += `<li class="day">${d}</li>`; day = d; }
    const tags = [
      ...(a.age === "cretaceous" ? [] : [`<span class="unk">Age unconfirmed</span>`]),
      ...a.regions.map((t) => `<span class="tag">${esc(t)}</span>`),
      ...a.formations.map((t) => `<span class="tag fm">${esc(t)}</span>`),
      ...a.groups.map((t) => `<span class="tag grp">${esc(t)}</span>`),
    ].join("");
    const href = esc(a.url || a.link);
    const thumb = a.thumb
      ? `<img src="${esc(a.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : AMMONITE;
    html += `<li class="item panel">
      <a class="thumb" href="${href}" target="_blank" rel="noopener" tabindex="-1" aria-hidden="true">${thumb}</a>
      <div class="body">
        <h3>${isNew(a) ? '<span class="new">NEW</span>' : ""}<a href="${href}" target="_blank" rel="noopener">${esc(a.title)}</a></h3>
        <div class="src">${esc(a.source)}</div>
        ${a.summary ? `<p class="sum">${esc(a.summary.length > 240 ? a.summary.slice(0, 240) + "…" : a.summary)}</p>` : ""}
        ${tags ? `<div class="tags">${tags}</div>` : ""}
      </div>
    </li>`;
  }
  $("list").innerHTML = html || `<li class="empty">No stories match these filters.</li>`;
  // Publisher images load from their own sites; if one is blocked or gone, show the ammonite instead.
  $("list").querySelectorAll(".thumb img").forEach((img) =>
    img.addEventListener("error", () => { img.outerHTML = AMMONITE; }, { once: true }));
  $("more").hidden = hits.length <= state.shown;
}

function render() {
  ["regions", "formations", "groups"].forEach(renderChips);
  renderList();
}

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const set = state[chip.dataset.key];
  set.has(chip.dataset.tag) ? set.delete(chip.dataset.tag) : set.add(chip.dataset.tag);
  state.shown = PAGE;
  render();
});
$("q").addEventListener("input", (e) => { state.q = e.target.value.trim().toLowerCase(); state.shown = PAGE; render(); });
$("newOnly").addEventListener("change", (e) => { state.newOnly = e.target.checked; state.shown = PAGE; render(); });
$("showUnknown").addEventListener("change", (e) => {
  state.showUnknown = e.target.checked;
  store.set("showUnknown", e.target.checked ? "1" : "");
  state.shown = PAGE;
  render();
});
$("more").addEventListener("click", () => { state.shown += PAGE; renderList(); });
$("clear").addEventListener("click", () => {
  Object.assign(state, { q: "", newOnly: false, showUnknown: false, shown: PAGE });
  store.set("showUnknown", "");
  $("showUnknown").checked = false;
  ["regions", "formations", "groups"].forEach((k) => state[k].clear());
  $("q").value = "";
  $("newOnly").checked = false;
  render();
});

async function load() {
  try {
    const res = await fetch(`data/articles.json?t=${Date.now()}`);
    const data = await res.json();
    articles = data.articles;
    lastVisit = store.get("lastVisit");
    state.showUnknown = store.get("showUnknown") === "1";
    $("showUnknown").checked = state.showUnknown;
    store.set("lastVisit", data.updated);
    const updated = new Date(data.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    const fresh = articles.filter(isNew).length;
    const dated = articles.filter((a) => a.age === "cretaceous").length;
    $("updated").textContent = `${dated} seaway-era stories (+${articles.length - dated} unconfirmed) · updated ${updated}` + (fresh ? ` · ${fresh} new since your last visit` : "");
    render();
  } catch (err) {
    $("updated").textContent = "Couldn't load the news feed. Run scripts/fetch_news.py to build it.";
  }
}
load();

// Inline the drawing sprite so every <use href="#id"> in the page can reference it.
fetch("decor.svg")
  .then((r) => r.text())
  .then((svg) => {
    const holder = document.createElement("div");
    holder.hidden = true;
    holder.innerHTML = svg;
    document.body.prepend(holder);
  })
  .catch(() => {});
