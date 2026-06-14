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

// ── Crypto tab ────
let cryptoData = [];
let activeTab  = "forex";

async function fetchCrypto(){
    const grid = document.getElementById("ef-score-grid");
    const tbody = document.getElementById("ef-table-body");

    grid.innerHTML  = `<div style="color:var(--ef-sub);font-size:13px;">Loading crypto data…</div>`;
    tbody.innerHTML = `<tr><td colspan="10" class="ef-empty"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>`;

    try {
        const res  = await fetch(`${API_URL}/crypto/fundamentals`, {
            headers: { "Authorization": `Bearer ${localStorage.token}` }
        });
        cryptoData = await res.json();

        renderCryptoCards();
        renderCryptoTable();
        generateCryptoInsight();

    } catch(err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="10" class="ef-empty">
            <i class="fas fa-triangle-exclamation"></i> Failed to load crypto data.
        </td></tr>`;
    }
}


function renderCryptoCards(){
    const grid = document.getElementById("ef-score-grid");

    grid.innerHTML = cryptoData.map(coin => {
        const change = coin.change_24h || 0;
        const cls    = change > 0 ? "bull" : change < 0 ? "bear" : "neu";
        const color  = change > 0 ? "var(--ef-bull)" : change < 0 ? "var(--ef-bear)" : "var(--ef-neutral)";
        const sign   = change > 0 ? "+" : "";

        return `
            <div class="ef-score-card ef-score-card--${cls}">
                <div class="ef-score-card__header">
                    <span class="ef-score-card__flag">₿</span>
                    <span class="ef-score-card__code">${coin.code}</span>
                </div>
                <div class="ef-score-card__score" style="color:${color};">
                    ${sign}${change.toFixed(2)}%
                </div>
                <div class="ef-score-card__label">${coin.name}</div>
                <div class="ef-score-card__bias ef-score-card__bias--${cls}">
                    $${coin.price.toLocaleString()}
                </div>
            </div>
        `;
    }).join("");
}


function renderCryptoTable(){
    const tbody = document.getElementById("ef-table-body");

    tbody.innerHTML = cryptoData.map((coin, i) => {
        const change24  = coin.change_24h || 0;
        const change7d  = coin.change_7d  || 0;
        const cls24     = change24 > 0 ? "pill-up" : change24 < 0 ? "pill-down" : "pill-flat";
        const cls7d     = change7d > 0 ? "pill-up" : change7d < 0 ? "pill-down" : "pill-flat";
        const sign24    = change24 > 0 ? "+" : "";
        const sign7d    = change7d > 0 ? "+" : "";
        const bias      = change24 > 2 ? "Bullish" : change24 < -2 ? "Bearish" : "Neutral";
        const biasCls   = change24 > 2 ? "bull" : change24 < -2 ? "bear" : "neu";

        return `
            <tr>
                <td class="rank-num rank-${i+1}">${i+1}</td>
                <td>
                    <div class="country-cell">
                        <span class="flag-sm">₿</span>
                        <div>
                            <div class="cname">${coin.name}</div>
                            <div class="ccode">${coin.code}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="score-bar-wrap">
                        <div class="score-bar">
                            <div class="score-bar-fill fill-${biasCls}"
                                style="width:${Math.min(100, Math.abs(change24) * 10)}%">
                            </div>
                        </div>
                        <span class="score-num" style="color:${change24 > 0 ? 'var(--ef-bull)' : 'var(--ef-bear)'}">
                            ${sign24}${change24.toFixed(1)}%
                        </span>
                    </div>
                </td>
                <td>$${coin.price.toLocaleString()}</td>
                <td><span class="metric-pill ${cls24}">${sign24}${change24.toFixed(2)}%</span></td>
                <td><span class="metric-pill ${cls7d}">${sign7d}${change7d.toFixed(2)}%</span></td>
                <td>$${(coin.market_cap / 1e9).toFixed(1)}B</td>
                <td>$${(coin.volume_24h / 1e9).toFixed(1)}B</td>
                <td>${coin.ath_distance}%</td>
                <td>
                    <span class="metric-pill ${biasCls === 'bull' ? 'pill-up' : biasCls === 'bear' ? 'pill-down' : 'pill-flat'}">
                        ${bias}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}


async function generateCryptoInsight(){
    const insightEl = document.getElementById("ef-insight-text");
    insightEl.className = "ef-insight-text loading-pulse";
    insightEl.textContent = "Analysing crypto market conditions…";

    const summary = cryptoData.map(c =>
        `${c.code}: $${c.price.toLocaleString()}, 24h: ${c.change_24h?.toFixed(2)}%, 7d: ${c.change_7d?.toFixed(2)}%`
    ).join("; ");

    const prompt = `You are a senior crypto market analyst. Write a concise 3-sentence insight (80-120 words) based on this data:
${summary}

Cover:
1. Overall market sentiment (risk-on or risk-off)
2. Standout movers and what they signal
3. One actionable observation for traders

Professional tone. No bullet points. Plain paragraph only.`;

    try {
        const res  = await fetch(`${API_URL}/ai/insight`, {
            method: "POST",
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${localStorage.token}`
            },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        insightEl.textContent = data.text || "Insight unavailable.";
        insightEl.className   = "ef-insight-text";
    } catch {
        insightEl.textContent = "AI insight unavailable right now.";
        insightEl.className   = "ef-insight-text";
    }
}


function switchTab(tab){
    activeTab = tab;

    document.getElementById("forexTab").classList.toggle("active", tab === "forex");
    document.getElementById("cryptoTab").classList.toggle("active", tab === "crypto");

    if(tab === "forex"){
        fetchFundamentals();
    } else {
        fetchCrypto();
    }

      function switchTab(tab){
      activeTab = tab;

      document.getElementById("forexTab").classList.toggle("active", tab === "forex");
      document.getElementById("cryptoTab").classList.toggle("active", tab === "crypto");

      const thead = document.querySelector(".ef-table thead tr");

      if(tab === "forex"){
          thead.innerHTML = `
              <th>#</th>
              <th>Country / Currency</th>
              <th class="sortable" data-col="score">Overall Score ↕</th>
              <th class="sortable" data-col="rate">Rate ↕</th>
              <th class="sortable" data-col="cpi">CPI ↕</th>
              <th class="sortable" data-col="gdp">GDP ↕</th>
              <th class="sortable" data-col="employment">Employment ↕</th>
              <th class="sortable" data-col="pmi">PMI ↕</th>
              <th>Trend</th>
              <th>Bias</th>
          `;
          fetchFundamentals();
      } else {
          thead.innerHTML = `
              <th>#</th>
              <th>Asset</th>
              <th>Score (24h)</th>
              <th>Price</th>
              <th>24h Change</th>
              <th>7d Change</th>
              <th>Market Cap</th>
              <th>Volume 24h</th>
              <th>From ATH</th>
              <th>Bias</th>
          `;
          fetchCrypto();
      }
  }


}

// ── Initial load ────────────────────────────────────────
fetchFundamentals();
