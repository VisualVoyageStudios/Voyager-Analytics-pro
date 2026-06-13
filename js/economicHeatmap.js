// ── Global error tracker ─────────────────────────────────────────────
window.addEventListener("error", (e) => {
    console.error("Global error:", e.message, "at", e.filename, "line", e.lineno);
});

window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled promise rejection:", e.reason);
});

// ── Auth check ───────────────────────────────────────────────────────
const token = localStorage.getItem("token");

if(!token){
    window.location.href = "../login.html";
}

const COUNTRIES = [
    { code: "USD", name: "United States", flag: "🇺🇸" },
    { code: "EUR", name: "Euro Union",    flag: "🇪🇺" },
    { code: "GBP", name: "United Kingdom",flag: "🇬🇧" },
    { code: "JPY", name: "Japan",         flag: "🇯🇵" },
    { code: "AUD", name: "Australia",     flag: "🇦🇺" },
    { code: "CAD", name: "Canada",        flag: "🇨🇦" },
    { code: "NZD", name: "New Zealand",   flag: "🇳🇿" },
    { code: "CHF", name: "Switzerland",   flag: "🇨🇭" },
];

const PAIR_GROUPS = {
    major: ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"],
    minor: ["EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","EURAUD","GBPAUD"],
    metals: ["XAUUSD","XAGUSD","US30","NAS100","SPX500"]
};

const PAIR_CURRENCIES = {
    EURUSD: ["EUR","USD"], GBPUSD: ["GBP","USD"], USDJPY: ["USD","JPY"],
    USDCHF: ["USD","CHF"], AUDUSD: ["AUD","USD"], USDCAD: ["USD","CAD"],
    NZDUSD: ["NZD","USD"], EURGBP: ["EUR","GBP"], EURJPY: ["EUR","JPY"],
    GBPJPY: ["GBP","JPY"], AUDJPY: ["AUD","JPY"], CADJPY: ["CAD","JPY"],
    EURAUD: ["EUR","AUD"], GBPAUD: ["GBP","AUD"],
    XAUUSD: ["SAFE","USD"], XAGUSD: ["SAFE","USD"],
    US30:   ["USD","RISK"], NAS100: ["USD","RISK"], SPX500: ["USD","RISK"]
};

let allEvents       = [];
let countryScores   = {};
let activePairGroup = "major";
let activeFilters   = { impact: "all", country: "all", surprise: "all" };


// ── Single shared AI caller ──────────────────────────────────────────

async function callAI(prompt){
    const endpoint = `${API_URL}/ai/insight`;
    console.log("[callAI] POST →", endpoint);

    let res;
    try {
        res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ prompt })
        });
    } catch (networkErr) {
        console.error("[callAI] Network/fetch error:", networkErr);
        throw new Error("Network error: " + networkErr.message);
    }

    console.log("[callAI] HTTP status:", res.status, res.statusText);

    // Read body as text first so we can log it even if it's not JSON
    const rawBody = await res.text();
    console.log("[callAI] Raw response body:", rawBody.slice(0, 500));

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${rawBody.slice(0, 200)}`);
    }

    let data;
    try {
        data = JSON.parse(rawBody);
    } catch (parseErr) {
        console.error("[callAI] JSON parse failed:", parseErr);
        throw new Error("Response is not valid JSON: " + rawBody.slice(0, 200));
    }

    console.log("[callAI] Parsed keys:", Object.keys(data));

    // Support multiple possible response shapes from the backend
    // Check common field names: text, result, content, message, response, output
    const text =
        data.text      ??
        data.result    ??
        data.content   ??
        data.message   ??
        data.response  ??
        data.output    ??
        // Anthropic SDK passthrough shape: data.content[0].text
        data?.content?.[0]?.text ??
        null;

    if (text === null) {
        console.error("[callAI] Could not find text in response. Full data:", JSON.stringify(data));
        throw new Error("No text field found. Keys were: " + Object.keys(data).join(", "));
    }

    return text;
}


// ── Fetch economic data ──────────────────────────────────────────────

async function fetchEconomicData() {
    setTableLoading(true);

    const dateStr = new Date().toISOString().slice(0, 10);

    const prompt = `You are a financial data API. Return ONLY a JSON array — no markdown, no preamble, no backticks.

Generate 32 realistic high and medium-impact economic data releases for the 8 major currency countries (USD, EUR, GBP, JPY, AUD, CAD, NZD, CHF) covering the past 45 days from ${dateStr}.

Each item must have EXACTLY these fields:
- "event": string — short event name (e.g. "CPI y/y", "NFP", "GDP q/q", "Retail Sales m/m", "PMI Manufacturing", "Interest Rate Decision", "Trade Balance", "Unemployment Rate")
- "country": string — one of: USD, EUR, GBP, JPY, AUD, CAD, NZD, CHF
- "impact": string — "high" or "medium"
- "actual": number
- "forecast": number
- "unit": string — e.g. "%", "K", "B", "index"
- "date": string — ISO date YYYY-MM-DD, within past 45 days from ${dateStr}

Rules:
- Make the data internally consistent and realistic for ${dateStr}
- Vary the outcomes — roughly 45% positive surprises, 45% negative, 10% inline
- Include at least 4 high-impact USD events (NFP, CPI, etc.)
- Include at least 2 Interest Rate Decision events
- Spread dates realistically across the 45-day window
- Return ONLY the JSON array, nothing else`;

    try {
        const raw   = await callAI(prompt);
        const clean = raw.replace(/```json|```/g, "").trim();
        console.log("Parsed data preview:", clean.slice(0, 200));
        allEvents   = JSON.parse(clean);

        populateCountryFilter();
        computeCountryScores();
        renderCountryScores();
        renderTable();
        renderPairBias();
        generateAIInsight();
        updateRefreshTime();

    } catch (err) {
        console.error("Economic data fetch failed:", err);
        showTableError("Could not load economic data. Please refresh.");
    }
}


// ── Country scores ───────────────────────────────────────────────────

function computeCountryScores() {
    const sums   = {};
    const counts = {};

    COUNTRIES.forEach(c => { sums[c.code] = 0; counts[c.code] = 0; });

    allEvents.forEach(ev => {
        if (!sums.hasOwnProperty(ev.country)) return;
        const weight  = ev.impact === "high" ? 2 : 1;
        const base    = Math.abs(ev.forecast) || 1;
        const dev     = ((ev.actual - ev.forecast) / base) * 100;
        const clamped = Math.max(-10, Math.min(10, dev));
        sums[ev.country]   += clamped * weight;
        counts[ev.country] += weight;
    });

    COUNTRIES.forEach(c => {
        const w = counts[c.code] || 1;
        countryScores[c.code] = parseFloat((sums[c.code] / w).toFixed(2));
    });
}


// ── Helpers ──────────────────────────────────────────────────────────

function sentimentClass(score) {
    if (score >  0.5) return "bullish";
    if (score < -0.5) return "bearish";
    return "neutral";
}

function flagFor(code) {
    return COUNTRIES.find(c => c.code === code)?.flag || "🌐";
}

function isRecent(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
}

function formatChange(actual, forecast, unit) {
    const diff = actual - forecast;
    if (Math.abs(diff) < 0.001) return { text: "—", cls: "change-neutral" };
    const sign      = diff > 0 ? "+" : "";
    const formatted = Math.abs(diff) < 1
        ? `${sign}${diff.toFixed(2)}${unit}`
        : `${sign}${diff.toFixed(1)}${unit}`;
    return { text: formatted, cls: diff > 0 ? "change-positive" : "change-negative" };
}

function updateRefreshTime() {
    document.getElementById("lastRefreshed").textContent =
        `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function setTableLoading(on) {
    if (on) {
        document.getElementById("heatmapTableBody").innerHTML = `
            <tr><td colspan="7">
                <div class="table-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Fetching economic data…</p>
                </div>
            </td></tr>`;
    }
}

function showTableError(msg) {
    document.getElementById("heatmapTableBody").innerHTML = `
        <tr><td colspan="7">
            <div class="empty-state">
                <i class="fas fa-triangle-exclamation"></i>
                <p>${msg}</p>
            </div>
        </td></tr>`;
    document.getElementById("aiInsightText").innerHTML =
        `<span style="color:var(--danger);">AI insight unavailable — data load failed.</span>`;
}


// ── Populate country filter ──────────────────────────────────────────

function populateCountryFilter() {
    const sel = document.getElementById("countryFilter");
    sel.innerHTML = `<option value="all">All Countries</option>`;
    COUNTRIES.forEach(c => {
        sel.innerHTML += `<option value="${c.code}">${c.flag} ${c.code}</option>`;
    });
}


// ── Render country score cards ───────────────────────────────────────

function renderCountryScores() {
    const container = document.getElementById("countryScores");
    container.innerHTML = COUNTRIES.map(c => {
        const score = countryScores[c.code] ?? 0;
        const cls   = sentimentClass(score);
        const sign  = score > 0 ? "+" : "";
        return `
            <div class="score-card ${cls}">
                <span class="flag">${c.flag}</span>
                <div class="country-name">${c.code}</div>
                <div class="score-num">${sign}${score}</div>
                <div class="score-label">${cls}</div>
            </div>
        `;
    }).join("");

    container.querySelectorAll(".score-card").forEach((card, i) => {
        card.addEventListener("click", () => {
            const code = COUNTRIES[i].code;
            const sel  = document.getElementById("countryFilter");
            sel.value  = sel.value === code ? "all" : code;
            activeFilters.country = sel.value;
            renderTable();
        });
    });
}


// ── Render heatmap table ─────────────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById("heatmapTableBody");
    let events  = [...allEvents];

    if (activeFilters.impact !== "all") {
        events = events.filter(e =>
            activeFilters.impact === "high"
                ? e.impact === "high"
                : e.impact === "high" || e.impact === "medium"
        );
    }

    if (activeFilters.country !== "all") {
        events = events.filter(e => e.country === activeFilters.country);
    }

    if (activeFilters.surprise !== "all") {
        events = events.filter(e => {
            const diff = e.actual - e.forecast;
            return activeFilters.surprise === "positive" ? diff > 0 : diff < 0;
        });
    }

    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (events.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7">
            <div class="empty-state">
                <i class="fas fa-filter"></i>
                <p>No events match the selected filters.</p>
            </div></td></tr>`;
        return;
    }

    tbody.innerHTML = events.map(ev => {
        const diff   = ev.actual - ev.forecast;
        const change = formatChange(ev.actual, ev.forecast, ev.unit);
        const recent = isRecent(ev.date);
        const barW   = Math.min(40, Math.abs(diff / (Math.abs(ev.forecast) || 1)) * 400);
        const barClr = diff > 0 ? "#3b82f6" : diff < 0 ? "#ef4444" : "#94a3b8";

        return `
            <tr>
                <td><div class="event-name">${ev.event}</div></td>
                <td>
                    <div class="event-country">
                        <span>${flagFor(ev.country)}</span>
                        <span>${ev.country}</span>
                    </div>
                </td>
                <td>
                    <span class="impact-badge impact-${ev.impact}">
                        ${ev.impact === "high" ? "●" : "◐"} ${ev.impact.charAt(0).toUpperCase() + ev.impact.slice(1)}
                    </span>
                </td>
                <td class="num-cell val-actual">${ev.actual}${ev.unit}</td>
                <td class="num-cell val-forecast">${ev.forecast}${ev.unit}</td>
                <td class="num-cell change-cell ${change.cls}">
                    ${change.text}
                    <span class="change-bar" style="background:${barClr};width:${barW}px;"></span>
                </td>
                <td class="date-cell">
                    ${recent ? `<span class="date-recent">⚡ ${ev.date}</span>` : ev.date}
                </td>
            </tr>
        `;
    }).join("");
}


// ── Render pair bias ─────────────────────────────────────────────────

function renderPairBias(group = activePairGroup) {
    const pairs = PAIR_GROUPS[group];
    const grid  = document.getElementById("pairImpactGrid");

    grid.innerHTML = pairs.map(pair => {
        const [base, quote] = PAIR_CURRENCIES[pair] || [];
        let bias = 0;

        if (base === "SAFE") {
            bias = -(countryScores["USD"] ?? 0);
        } else if (quote === "RISK") {
            bias = countryScores["USD"] ?? 0;
        } else {
            bias = (countryScores[base] ?? 0) - (countryScores[quote] ?? 0);
        }

        const cls   = sentimentClass(bias);
        const sign  = bias > 0 ? "+" : "";
        const label = cls === "bullish" ? "Bullish" : cls === "bearish" ? "Bearish" : "Neutral";

        return `
            <div class="pair-card">
                <div>
                    <div class="pair-name">${pair}</div>
                    <div class="pair-bias ${cls}">${label}</div>
                </div>
                <div class="pair-score-pill ${cls}">${sign}${bias.toFixed(1)}</div>
            </div>
        `;
    }).join("");
}


// ── AI insight ───────────────────────────────────────────────────────

async function generateAIInsight() {
    const insightEl = document.getElementById("aiInsightText");
    insightEl.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Analysing latest economic releases…`;

    const topEvents = [...allEvents]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 14)
        .map(e => `${e.country} ${e.event}: actual=${e.actual}${e.unit} forecast=${e.forecast}${e.unit} (${e.actual >= e.forecast ? "beat" : "missed"})`)
        .join("; ");

    const scoresSummary = Object.entries(countryScores)
        .map(([k, v]) => `${k}:${v > 0 ? "+" : ""}${v}`)
        .join(", ");

    const prompt = `You are a senior FX macro analyst at a prop trading firm. Write a concise 3-sentence market insight (80-120 words) covering:
1. Which currencies are showing the strongest fundamental divergence based on recent data
2. Key risk events or data surprises driving sentiment
3. One actionable bias or pair to watch

Recent economic data: ${topEvents}
Country scores (higher = more bullish): ${scoresSummary}

Write in a professional but direct tone. No bullet points. No headers. Plain paragraph only.`;

    try {
        const text = await callAI(prompt);
        insightEl.innerHTML = text;
        insightEl.className = "";
    } catch (err) {
        console.error("AI insight failed:", err);
        insightEl.innerHTML = `<span style="color:var(--muted);">AI insight unavailable right now.</span>`;
    }
}


// ── Event listeners ──────────────────────────────────────────────────

document.getElementById("impactFilter").addEventListener("change", e => {
    activeFilters.impact = e.target.value;
    renderTable();
});

document.getElementById("countryFilter").addEventListener("change", e => {
    activeFilters.country = e.target.value;
    renderTable();
});

document.getElementById("surpriseFilter").addEventListener("change", e => {
    activeFilters.surprise = e.target.value;
    renderTable();
});

document.getElementById("refreshBtn").addEventListener("click", () => {
    fetchEconomicData();
});

document.querySelectorAll(".pair-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".pair-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        activePairGroup = chip.dataset.group;
        renderPairBias(activePairGroup);
    });
});


// ── Init ─────────────────────────────────────────────────────────────

window.onload = fetchEconomicData;
