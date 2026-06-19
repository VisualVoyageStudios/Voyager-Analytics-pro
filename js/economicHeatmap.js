window.addEventListener("error", (e) => {
    console.error("Global error:", e.message, "at", e.filename, "line", e.lineno);
});

const token = localStorage.token;
if(!token){ window.location.href = "../login.html"; }

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
    major:  ["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"],
    minor:  ["EURGBP","EURJPY","GBPJPY","AUDJPY","CADJPY","EURAUD","GBPAUD"],
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


// ── Value parsing ────────────────────────────────────────────────────

function parseValue(str){
    if(!str || String(str).trim() === "") return { value: null, unit: "", raw: "—" };
    const s     = String(str).trim();
    const match = s.match(/^(-?[\d,.]+)\s*([%KMBkmb]?)$/);
    if(!match) return { value: null, unit: "", raw: s };
    const num  = parseFloat(match[1].replace(/,/g, ""));
    const unit = match[2] || "";
    return { value: num, unit, raw: s };
}


// ── AI caller (for the insight strip only) ──────────────────────────

async function callAI(prompt){
    const res  = await fetch(`${API_URL}/ai/insight`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    if(!data.text) throw new Error("No text in response");
    return data.text;
}


// ── Fetch REAL economic calendar ─────────────────────────────────────

async function fetchEconomicData() {
    setTableLoading(true);

    try {
        const res = await fetch(`${API_URL}/economic/calendar`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        allEvents = await res.json();

        if(!Array.isArray(allEvents)) throw new Error("Invalid calendar data");

        populateCountryFilter();
        computeCountryScores();
        renderCountryScores();
        renderTable();
        renderPairBias();
        generateAIInsight();
        updateRefreshTime();

    } catch (err) {
        console.error("Economic data fetch failed:", err);
        showTableError("Could not load economic calendar. Please refresh.");
    }
}


// ── Country scores (only from RELEASED events) ───────────────────────

function computeCountryScores() {
    const sums   = {};
    const counts = {};

    COUNTRIES.forEach(c => { sums[c.code] = 0; counts[c.code] = 0; });

    allEvents.forEach(ev => {
        if (!sums.hasOwnProperty(ev.country)) return;

        const actual   = parseValue(ev.actual);
        const forecast = parseValue(ev.forecast);

        // Skip events that haven't released yet (no actual)
        if (actual.value === null || forecast.value === null) return;

        const weight  = ev.impact === "high" ? 2 : 1;
        const base    = Math.abs(forecast.value) || 1;
        const dev     = ((actual.value - forecast.value) / base) * 100;
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
    return diff >= 0 && diff <= 7;
}

function isUpcoming(dateStr) {
    return new Date(dateStr).getTime() > Date.now();
}

function updateRefreshTime() {
    const el = document.getElementById("lastRefreshed");
    if(el) el.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function setTableLoading(on) {
    if (on) {
        document.getElementById("heatmapTableBody").innerHTML = `
            <tr><td colspan="7">
                <div class="table-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Fetching real economic calendar…</p>
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
    const insightEl = document.getElementById("aiInsightText");
    if(insightEl) insightEl.innerHTML = `<span style="color:var(--danger);">AI insight unavailable — data load failed.</span>`;
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


// ── Render heatmap table (real data, past + upcoming) ────────────────

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
            const actual   = parseValue(e.actual);
            const forecast = parseValue(e.forecast);
            if (actual.value === null || forecast.value === null) return false;
            const diff = actual.value - forecast.value;
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
        const actual    = parseValue(ev.actual);
        const forecast  = parseValue(ev.forecast);
        const released  = actual.value !== null;
        const upcoming  = isUpcoming(ev.date);
        const recent    = isRecent(ev.date);

        let changeHtml = `<span class="change-neutral">—</span>`;

        if (released && forecast.value !== null) {
            const diff    = actual.value - forecast.value;
            const cls     = diff > 0 ? "change-positive" : diff < 0 ? "change-negative" : "change-neutral";
            const sign    = diff > 0 ? "+" : "";
            const barW    = Math.min(40, Math.abs(diff / (Math.abs(forecast.value) || 1)) * 400);
            const barClr  = diff > 0 ? "#3b82f6" : diff < 0 ? "#ef4444" : "#94a3b8";
            changeHtml = `
                <span class="${cls}">${sign}${diff.toFixed(2)}${actual.unit}</span>
                <span class="change-bar" style="background:${barClr};width:${barW}px;"></span>
            `;
        } else if (upcoming) {
            changeHtml = `<span style="color:#f0bf2d; font-size:11px; font-weight:700;">UPCOMING</span>`;
        }

        const dateDisplay = new Date(ev.date).toLocaleDateString("en-GB", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });

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
                <td class="num-cell val-actual">${released ? actual.raw : "—"}</td>
                <td class="num-cell val-forecast">${forecast.raw || "—"}</td>
                <td class="num-cell change-cell">${changeHtml}</td>
                <td class="date-cell">
                    ${recent ? `<span class="date-recent">⚡ ${dateDisplay}</span>` : dateDisplay}
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


// ── AI insight (based on REAL data) ──────────────────────────────────

async function generateAIInsight() {
    const insightEl = document.getElementById("aiInsightText");
    insightEl.innerHTML = `<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Analysing the latest economic calendar…`;

    const released = allEvents.filter(e => parseValue(e.actual).value !== null);
    const upcoming = allEvents.filter(e => isUpcoming(e.date));

    const releasedSummary = released.slice(-10).map(e => {
        const a = parseValue(e.actual), f = parseValue(e.forecast);
        return `${e.country} ${e.event}: actual=${a.raw} forecast=${f.raw}`;
    }).join("; ");

    const upcomingSummary = upcoming.slice(0, 8).map(e =>
        `${e.country} ${e.event} (${e.impact}) on ${new Date(e.date).toLocaleDateString()}`
    ).join("; ");

    const scoresSummary = Object.entries(countryScores)
        .map(([k, v]) => `${k}:${v > 0 ? "+" : ""}${v}`)
        .join(", ");

    const prompt = `You are a senior FX macro analyst. Based on REAL economic calendar data below, write a concise 3-sentence market insight (80-120 words):
1. What recent real data releases tell us about currency strength
2. Key upcoming high-impact events traders should watch this week
3. One actionable bias or pair to watch

Recently released: ${releasedSummary || "limited recent data"}
Upcoming this week: ${upcomingSummary || "no major events scheduled"}
Country scores (higher = more bullish): ${scoresSummary}

Professional, direct tone. No bullet points, no headers, plain paragraph only.`;

    try {
        const text = await callAI(prompt);
        insightEl.innerHTML  = text;
        insightEl.className  = "";
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

document.getElementById("refreshBtn").addEventListener("click", fetchEconomicData);

document.querySelectorAll(".pair-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".pair-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        activePairGroup = chip.dataset.group;
        renderPairBias(activePairGroup);
    });
});


window.onload = fetchEconomicData;
