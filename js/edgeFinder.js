const token = localStorage.token;

if(!token){
    window.location.href = "../login.html";
}
// Countries tracked — forex, commodities & indices coverage
const COUNTRIES = [
  { code: "USD", name: "United States", flag: "🇺🇸", markets: ["forex","indices","commodities"] },
  { code: "EUR", name: "Eurozone",      flag: "🇪🇺", markets: ["forex","indices"] },
  { code: "GBP", name: "United Kingdom",flag: "🇬🇧", markets: ["forex","indices"] },
  { code: "JPY", name: "Japan",         flag: "🇯🇵", markets: ["forex","indices"] },
  { code: "CHF", name: "Switzerland",   flag: "🇨🇭", markets: ["forex"] },
  { code: "CAD", name: "Canada",        flag: "🇨🇦", markets: ["forex","commodities"] },
  { code: "AUD", name: "Australia",     flag: "🇦🇺", markets: ["forex","commodities"] },
  { code: "NZD", name: "New Zealand",   flag: "🇳🇿", markets: ["forex"] },
  { code: "CNY", name: "China",         flag: "🇨🇳", markets: ["forex","indices","commodities"] },
  { code: "XAU", name: "Gold (Safe Haven)", flag: "🥇", markets: ["commodities"] },
];

// Forex pairs to evaluate
const PAIRS = [
  ["EUR","USD"],["GBP","USD"],["USD","JPY"],["USD","CHF"],
  ["AUD","USD"],["USD","CAD"],["NZD","USD"],["GBP","JPY"],
  ["EUR","GBP"],["EUR","JPY"],["AUD","JPY"],["EUR","CHF"],
];

// Commodity / index implications
const SPECIAL_ASSETS = [
  { label: "Gold (XAU/USD)",  base: "XAU", quote: "USD", market: "commodities" },
  { label: "Oil (CAD proxy)", base: "CAD", quote: "USD", market: "commodities" },
  { label: "S&P 500 (USD)",   base: "USD", quote: null,  market: "indices", note: "USD strength inversely impacts" },
  { label: "Nikkei (JPY)",    base: "JPY", quote: null,  market: "indices", note: "Weak JPY supports index" },
  { label: "FTSE (GBP)",      base: "GBP", quote: null,  market: "indices", note: "GBP fundamental impact" },
  { label: "DAX (EUR)",       base: "EUR", quote: null,  market: "indices", note: "EUR fundamental impact" },
];

let allData    = [];    // scored country objects
let sortCol    = "score";
let sortAsc    = false;
let marketFilter = "all";

// ── Fetch & score via Grok ──────────────────────────────
async function fetchFundamentals() {
    const btn = document.getElementById("ef-refresh-btn");
    btn.classList.add("loading");
    setInsight("Retrieving latest economic data…", true);

    try {
        // Step 1 — Get real data from World Bank
        const res  = await fetch(`${API_URL}/fundamentals`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const realData = await res.json();

        // Step 2 — Send real data to AI for scoring
        const prompt = `You are a senior macroeconomic analyst. Based on this REAL economic data, score each country and return ONLY a valid JSON array — no markdown, no explanation.

Real data: ${JSON.stringify(realData)}

For each country in the data, return:
[
  {
    "code": "USD",
    "interest_rate": { "value": 5.25, "score": 70, "trend": "hold", "note": "One line note" },
    "cpi": { "value": 3.1, "score": 40, "trend": "falling", "note": "One line note" },
    "gdp": { "value": 2.8, "score": 60, "trend": "rising", "note": "One line note" },
    "employment": { "value": 3.9, "score": 55, "trend": "stable", "note": "One line note" },
    "pmi": { "value": 52.1, "score": 50, "trend": "expanding", "note": "One line note" },
    "overall_score": 55,
    "summary": "One sentence macro summary."
  }
]

Trends must be one of: rising, falling, stable, expanding, contracting, hold, hiking, cutting.
overall_score is weighted: rate 25%, cpi 20%, gdp 20%, employment 20%, pmi 15%.
Respond with ONLY the JSON array.`;

        const aiRes  = await fetch(`${API_URL}/ai/insight`, {
            method: "POST",
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ prompt })
        });

        const aiJson = await aiRes.json();
        const raw    = aiJson.text || "";
        const clean  = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        // Step 3 — Merge with COUNTRIES metadata
        allData = COUNTRIES.map(c => {
            const d = parsed.find(p => p.code === c.code) || {};
            return { ...c, ...d };
        }).filter(c => c.overall_score !== undefined);

        renderScoreCards();
        renderTable();
        renderPairs();
        generateInsight();

        document.getElementById("ef-last-updated").textContent =
            "Updated " + new Date().toLocaleTimeString();

    } catch(err) {
        console.error(err);
        setInsight("⚠ Could not fetch data. Try again.", false);
        document.getElementById("ef-table-body").innerHTML =
            `<tr><td colspan="10" class="ef-empty">
                <i class="fas fa-triangle-exclamation"></i>
                Failed to load — click Refresh to retry.
            </td></tr>`;
    }

    btn.classList.remove("loading");
}

// ── AI narrative insight ────────────────────────────────
async function generateInsight() {
  if (!allData.length) return;
  setInsight("Generating fundamental insight…", true);

  const top    = [...allData].sort((a,b) => b.overall_score - a.overall_score);
  const strong = top.slice(0,3).map(c=>`${c.flag}${c.code}(${c.overall_score})`).join(", ");
  const weak   = top.slice(-3).map(c=>`${c.flag}${c.code}(${c.overall_score})`).join(", ");

  const summaries = allData.map(c => `${c.code}: ${c.summary || ""}`).join(" | ");

  const prompt = `You are a senior FX & macro strategist writing a daily brief for a prop trading desk.
Based on this data — strong currencies: ${strong}, weak currencies: ${weak}. Summaries: ${summaries}
Write 2-3 sharp, professional sentences on the current macro environment and top trading edges.
Focus on actionable insight. No fluff. Do NOT use asterisks or bullet points.`;

  try {
    const res = await fetch(`${API_URL}/ai/insight`, {
      method: "POST",
      headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
  });
  const json = await res.json();
  const text = json.text || "No insight available.";
  setInsight(text, false);
  } catch {
    setInsight("Insight generation unavailable.", false);
  }
}

function setInsight(text, loading) {
  const el = document.getElementById("ef-insight-text");
  el.textContent = text;
  el.className = "ef-insight-text" + (loading ? " loading-pulse" : "");
}

// ── Render score cards ──────────────────────────────────
function renderScoreCards() {
  const grid   = document.getElementById("ef-score-grid");
  const filter = document.getElementById("ef-market-filter").value;

  const visible = allData.filter(c =>
    filter === "all" || c.markets?.includes(filter)
  );

  grid.innerHTML = visible.map(c => {
    const score = c.overall_score ?? 0;
    const bias  = score >= 20 ? "bullish" : score <= -20 ? "bearish" : "neutral";
    const accent = bias === "bullish" ? "var(--ef-bull)" : bias === "bearish" ? "var(--ef-bear)" : "var(--ef-neutral)";
    return `
      <div class="ef-score-card" style="--card-accent:${accent}" onclick="highlightRow('${c.code}')">
        <div class="flag">${c.flag}</div>
        <div class="country-name">${c.code}</div>
        <div class="score-value">${score > 0 ? "+" : ""}${score}</div>
        <div class="score-label">Fundamental Score</div>
        <span class="bias-badge bias-${bias}">
          <i class="fas fa-${bias === "bullish" ? "arrow-trend-up" : bias === "bearish" ? "arrow-trend-down" : "minus"}"></i>
          ${bias.charAt(0).toUpperCase() + bias.slice(1)}
        </span>
      </div>`;
  }).join("");
}

// ── Render ranking table ────────────────────────────────
function renderTable() {
  const body   = document.getElementById("ef-table-body");
  const filter = document.getElementById("ef-market-filter").value;

  let rows = allData.filter(c =>
    filter === "all" || c.markets?.includes(filter)
  );

  // Sort
  rows.sort((a, b) => {
    const av = metricVal(a, sortCol);
    const bv = metricVal(b, sortCol);
    return sortAsc ? av - bv : bv - av;
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="10" class="ef-empty"><i class="fas fa-magnifying-glass"></i>No data matches the filter.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((c, i) => {
    const score = c.overall_score ?? 0;
    const bias  = score >= 20 ? "bullish" : score <= -20 ? "bearish" : "neutral";
    const barW  = Math.min(100, Math.abs(score));
    const barClass = bias === "bullish" ? "fill-bull" : bias === "bearish" ? "fill-bear" : "fill-neu";
    const rankClass = i === 0 ? "rank-1" : i === 1 ? "rank-2" : i === 2 ? "rank-3" : "";

    const trendIcon = (t) => {
      if (!t) return "–";
      const up  = ["rising","hiking","expanding"];
      const dn  = ["falling","cutting","contracting"];
      if (up.some(k => t.includes(k)))  return `<span class="metric-pill pill-up"><i class="fas fa-arrow-up trend-arrow"></i>${t}</span>`;
      if (dn.some(k => t.includes(k)))  return `<span class="metric-pill pill-down"><i class="fas fa-arrow-down trend-arrow"></i>${t}</span>`;
      return `<span class="metric-pill pill-flat"><i class="fas fa-minus trend-arrow"></i>${t}</span>`;
    };

    const cell = (key) => {
      const d = c[key];
      if (!d) return '<td title="">–</td>';
      return `<td title="${d.note || ""}">${d.value ?? "–"}</td>`;
    };

    const overallTrend = score >= 20 ? "rising" : score <= -20 ? "falling" : "stable";

    return `
      <tr id="ef-row-${c.code}" data-code="${c.code}">
        <td class="rank-num ${rankClass}">${i+1}</td>
        <td>
          <div class="country-cell">
            <span class="flag-sm">${c.flag}</span>
            <div>
              <div class="cname">${c.name}</div>
              <div class="ccode">${c.code}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="score-bar-wrap">
            <div class="score-bar">
              <div class="score-bar-fill ${barClass}" style="width:${barW}%"></div>
            </div>
            <span class="score-num" style="color:${bias==="bullish"?"var(--ef-bull)":bias==="bearish"?"var(--ef-bear)":"var(--ef-neutral)"}">${score>0?"+":""}${score}</span>
          </div>
        </td>
        ${cell("interest_rate")}
        ${cell("cpi")}
        ${cell("gdp")}
        ${cell("employment")}
        ${cell("pmi")}
        <td>${trendIcon(overallTrend)}</td>
        <td><span class="bias-badge bias-${bias}">${bias.charAt(0).toUpperCase()+bias.slice(1)}</span></td>
      </tr>`;
  }).join("");

  // Sortable headers click
  document.querySelectorAll(".ef-table th.sortable").forEach(th => {
    th.onclick = () => {
      const col = th.dataset.col;
      if (sortCol === col) { sortAsc = !sortAsc; }
      else { sortCol = col; sortAsc = false; }
      renderTable();
    };
  });
}

function metricVal(c, col) {
  if (col === "score") return c.overall_score ?? -999;
  return c[col]?.score ?? -999;
}

// ── Render pair implications ────────────────────────────
function renderPairs() {
  const grid   = document.getElementById("ef-pairs-grid");
  const filter = document.getElementById("ef-market-filter").value;
  const scoreOf = (code) => allData.find(c => c.code === code)?.overall_score ?? 0;

  let output = "";

  // Forex pairs
  if (filter === "all" || filter === "forex") {
    PAIRS.forEach(([base, quote]) => {
      const diff  = scoreOf(base) - scoreOf(quote);
      const bias  = diff >= 15 ? "bullish" : diff <= -15 ? "bearish" : "neutral";
      const dir   = diff >= 15 ? `Favour ${base}` : diff <= -15 ? `Favour ${quote}` : "No clear edge";
      const icon  = bias === "bullish" ? "fa-arrow-trend-up" : bias === "bearish" ? "fa-arrow-trend-down" : "fa-minus";
      const col   = bias === "bullish" ? "var(--ef-bull)" : bias === "bearish" ? "var(--ef-bear)" : "var(--ef-neutral)";
      output += `
        <div class="ef-pair-row">
          <div>
            <div class="pair-symbol">${base}/${quote}</div>
            <div class="pair-diff">Score diff: ${diff > 0 ? "+" : ""}${diff}</div>
          </div>
          <span class="bias-badge bias-${bias}" style="gap:6px">
            <i class="fas ${icon}"></i>${dir}
          </span>
        </div>`;
    });
  }

  // Commodities & indices
  if (filter === "all" || filter === "commodities" || filter === "indices") {
    SPECIAL_ASSETS
      .filter(a => filter === "all" || a.market === filter)
      .forEach(a => {
        const score = scoreOf(a.base);
        const bias  = score >= 20 ? "bullish" : score <= -20 ? "bearish" : "neutral";
        const icon  = bias === "bullish" ? "fa-arrow-trend-up" : bias === "bearish" ? "fa-arrow-trend-down" : "fa-minus";
        const dir   = a.note || (bias === "bullish" ? `${a.base} bullish` : bias === "bearish" ? `${a.base} bearish` : "No clear edge");
        output += `
          <div class="ef-pair-row">
            <div>
              <div class="pair-symbol">${a.label}</div>
              <div class="pair-diff">Base score: ${score > 0 ? "+" : ""}${score}</div>
            </div>
            <span class="bias-badge bias-${bias}">
              <i class="fas ${icon}"></i> ${dir}
            </span>
          </div>`;
      });
  }

  grid.innerHTML = output || `<div class="ef-empty" style="grid-column:1/-1"><i class="fas fa-filter"></i>No pairs match this filter.</div>`;
}

// ── Highlight table row ─────────────────────────────────
function highlightRow(code) {
  document.querySelectorAll(".ef-table tbody tr").forEach(r => r.style.background = "");
  const row = document.getElementById(`ef-row-${code}`);
  if (row) {
    row.style.background = "#1e2a3a";
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ── Event listeners ─────────────────────────────────────
document.getElementById("ef-refresh-btn").addEventListener("click", fetchFundamentals);

document.getElementById("ef-market-filter").addEventListener("change", e => {
  marketFilter = e.target.value;
  renderScoreCards();
  renderTable();
  renderPairs();
});

document.getElementById("ef-sort-by").addEventListener("change", e => {
  sortCol = e.target.value;
  renderTable();
});

// ── Initial load ────────────────────────────────────────
fetchFundamentals();
