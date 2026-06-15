const token = localStorage.token;

if(!token){
    window.location.href = "../login.html";
}

const FLAGS = {
    USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
    AUD: "🇦🇺", CAD: "🇨🇦", NZD: "🇳🇿", CHF: "🇨🇭",
    ZAR: "RSA"
};

const PAIRS = [
    "EURUSD","GBPUSD","USDJPY","USDCHF",
    "AUDUSD","USDCAD","NZDUSD","GBPJPY",
    "EURJPY","EURGBP","AUDJPY","CADJPY",
    "USDZAR"
];

let strengthData = [];

async function loadStrength(){
    const grid  = document.getElementById("strengthGrid");
    const table = document.getElementById("strengthTable");

    grid.innerHTML = `
        <div style="color:var(--muted); font-size:13px; padding:40px; text-align:center; grid-column:1/-1;">
            <i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>
            Loading currency data…
        </div>
    `;

    try {
        const res  = await fetch(`${API_URL}/currency/strength`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        strengthData = await res.json();

        if(!Array.isArray(strengthData)){
            throw new Error("Invalid response");
        }

        strengthData.sort((a, b) => b.score - a.score);

        renderGauges();
        renderTable();
        renderPairMatrix();

        document.getElementById("lastUpdated").textContent =
            `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    } catch(err) {
        console.error(err);
        grid.innerHTML = `
            <div style="color:var(--muted); text-align:center; padding:40px; grid-column:1/-1;">
                <i class="fas fa-triangle-exclamation" style="font-size:2rem; opacity:0.3; display:block; margin-bottom:12px;"></i>
                Could not load currency data. Please refresh.
            </div>
        `;
    }
}


function renderGauges(){
    const grid = document.getElementById("strengthGrid");

    grid.innerHTML = strengthData.map(c => {
        const color   = c.score > 10 ? "#3b82f6" : c.score < -10 ? "#ef4444" : "#94a3b8";
        const width   = Math.abs(c.score);
        const sign    = c.score > 0 ? "+" : "";
        const label   = c.trend === "bullish" ? "Strong" : c.trend === "bearish" ? "Weak" : "Neutral";

        return `
            <div style="
                background: var(--card);
                border: 1px solid var(--border);
                border-radius: 14px;
                padding: 20px;
            ">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:24px;">${FLAGS[c.code] || "🌐"}</span>
                        <div>
                            <div style="font-weight:700; font-size:16px;">${c.code}</div>
                            <div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;">${label}</div>
                        </div>
                    </div>
                    <div style="font-size:1.4rem; font-weight:800; color:${color};">
                        ${sign}${c.score}
                    </div>
                </div>

                <!-- Bar -->
                <div style="
                    background: rgba(255,255,255,0.05);
                    border-radius: 4px;
                    height: 6px;
                    overflow: hidden;
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        ${c.score >= 0 ? 'left: 50%' : `left: ${50 - width/2}%`};
                        width: ${width/2}%;
                        height: 100%;
                        background: ${color};
                        border-radius: 4px;
                        transition: width 0.5s ease;
                    "></div>
                    <!-- Center line -->
                    <div style="
                        position: absolute;
                        left: 50%;
                        top: 0;
                        width: 1px;
                        height: 100%;
                        background: rgba(255,255,255,0.2);
                    "></div>
                </div>

                <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:11px; color:var(--muted);">
                    <span>Weak</span>
                    <span>Strong</span>
                </div>
            </div>
        `;
    }).join("");
}


function renderTable(){
    const tbody = document.getElementById("strengthTable");

    tbody.innerHTML = strengthData.map((c, i) => {
        const color = c.score > 10 ? "#3b82f6" : c.score < -10 ? "#ef4444" : "#94a3b8";
        const sign  = c.score > 0 ? "+" : "";
        const width = Math.abs(c.score);
        const label = c.trend === "bullish" ? "Bullish" : c.trend === "bearish" ? "Bearish" : "Neutral";
        const rank  = i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;

        return `
            <tr>
                <td style="font-weight:700; font-size:16px;">${medal}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:20px;">${FLAGS[c.code]}</span>
                        <span style="font-weight:600;">${c.code}</span>
                    </div>
                </td>
                <td style="font-weight:700; color:${color};">${sign}${c.score}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="
                            width: 80px;
                            height: 6px;
                            background: rgba(255,255,255,0.05);
                            border-radius: 4px;
                            overflow: hidden;
                        ">
                            <div style="
                                width: ${width}%;
                                height: 100%;
                                background: ${color};
                                border-radius: 4px;
                            "></div>
                        </div>
                        <span style="font-size:12px; color:var(--muted);">${width}%</span>
                    </div>
                </td>
                <td>
                    <span style="
                        background: ${c.score > 10 ? 'rgba(59,130,246,0.12)' : c.score < -10 ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.1)'};
                        color: ${color};
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                    ">${label}</span>
                </td>
            </tr>
        `;
    }).join("");
}


function renderPairMatrix(){
    const matrix = document.getElementById("pairMatrix");
    const scores = {};
    strengthData.forEach(c => scores[c.code] = c.score);

    matrix.innerHTML = PAIRS.map(pair => {
        const base  = pair.slice(0, 3);
        const quote = pair.slice(3);
        const diff  = (scores[base] || 0) - (scores[quote] || 0);
        const color = diff > 5 ? "#3b82f6" : diff < -5 ? "#ef4444" : "#94a3b8";
        const bias  = diff > 5 ? "Bullish" : diff < -5 ? "Bearish" : "Neutral";
        const sign  = diff > 0 ? "+" : "";

        return `
            <div style="
                background: var(--card);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 14px 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <div style="font-weight:800; font-size:14px; letter-spacing:0.5px;">${pair}</div>
                    <div style="font-size:12px; color:${color}; font-weight:600; margin-top:2px;">${bias}</div>
                </div>
                <div style="
                    background: ${diff > 5 ? 'rgba(59,130,246,0.12)' : diff < -5 ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.1)'};
                    color: ${color};
                    padding: 6px 10px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 700;
                ">${sign}${diff.toFixed(1)}</div>
            </div>
        `;
    }).join("");
}


document.getElementById("refreshBtn").addEventListener("click", loadStrength);

window.onload = loadStrength;
