const token =
localStorage.getItem(
    "token"
);

async function loadJournals(){

    const journals = await getJournals(token);
    const trades   = await getTrades(token);

    const container = document.getElementById("journalList");
    container.innerHTML = "";

    if(journals.length === 0){
        container.innerHTML = `
            <div style="text-align: center; color: var(--muted); padding: 60px 20px;">
                <i class="fas fa-book-open" style="font-size: 2rem; margin-bottom: 16px; display: block; opacity: 0.3;"></i>
                <p>No journal entries yet. Log your first trade above.</p>
            </div>
        `;
        return;
    }

    journals.forEach(entry => {

        const trade = trades.find(t => t.id === entry.trade_id);

        const profitColor = trade
            ? trade.profit >= 0
                ? "var(--success)"
                : "var(--danger)"
            : "var(--muted)";

        const tradeLabel = trade
            ? `${trade.symbol} · ${trade.order_type} · $${trade.profit}`
            : "Trade not found";

        const emotionColors = {
            "Confident":   { bg: "rgba(34,197,94,0.1)",   color: "#22c55e" },
            "Calm":        { bg: "rgba(59,130,246,0.1)",   color: "#3b82f6" },
            "Fearful":     { bg: "rgba(239,68,68,0.1)",    color: "#ef4444" },
            "Greedy":      { bg: "rgba(234,179,8,0.1)",    color: "#f0bf2d" },
            "Frustrated":  { bg: "rgba(249,115,22,0.1)",   color: "#f95e16" }
        };

        const emotionStyle = emotionColors[entry.emotion] || {
            bg: "rgba(148,163,184,0.1)",
            color: "var(--muted)"
        };

        const ratingColor = entry.rating >= 7
            ? "var(--success)"
            : entry.rating >= 4
                ? "#eab308"
                : "var(--danger)";

        const card = document.createElement("div");
        card.className = "metric-card";
        card.style.marginBottom = "16px";

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">

                <span style="
                    background: ${emotionStyle.bg};
                    color: ${emotionStyle.color};
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 600;
                ">${entry.emotion}</span>

                <span style="
                    font-size: 13px;
                    font-weight: 700;
                    color: ${ratingColor};
                ">
                    ${entry.rating}/10
                </span>

            </div>

            <div style="
                background: var(--sidebar);
                border-radius: 10px;
                padding: 12px 16px;
                margin-bottom: 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span style="font-size: 13px; color: var(--muted);">
                    <i class="fas fa-chart-line" style="margin-right: 6px;"></i>
                    ${tradeLabel}
                </span>
                <span style="font-weight: 700; color: ${profitColor}; font-size: 13px;">
                    ${trade ? (trade.profit >= 0 ? "WIN" : "LOSS") : ""}
                </span>
            </div>

            ${entry.lesson ? `
            <div style="margin-bottom: 10px;">
                <p style="font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Lesson</p>
                <p style="font-size: 14px; line-height: 1.6;">${entry.lesson}</p>
            </div>` : ""}

            ${entry.mistake ? `
            <div>
                <p style="font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Mistake</p>
                <p style="font-size: 14px; line-height: 1.6;">${entry.mistake}</p>
            </div>` : ""}
        `;

        container.appendChild(card);
    });
}

document
.getElementById(
    "journalForm"
)
.addEventListener(
    "submit",
    async(e)=>{e.preventDefault();
        
        await createJournal(
            token,
            {

                trade_id:
                document.getElementById(
                    "tradeId"
                ).value,

                emotion:
                document.getElementById(
                    "emotion"
                ).value,

                lesson:
                document.getElementById(
                    "lesson"
                ).value,

                mistake:
                document.getElementById(
                    "mistake"
                ).value,

                rating:
                document.getElementById(
                    "rating"
                ).value

            }
        );

        loadJournals();

        document
        .getElementById(
            "journalForm"
        )
        .reset();

    }
);



async function loadTradeOptions(){

    const trades =
    await getTrades(token);

    const select =
    document.getElementById(
        "tradeId"
    );

    trades.forEach(trade=>{

        const option =
        document.createElement(
            "option"
        );

        option.value =
        trade.id;

        option.textContent =

            `${trade.symbol}
             (${trade.order_type})
             Profit:
             ${trade.profit}`;

        select.appendChild(
            option
        );

    });

}

window.onload =
async()=>{

    await loadTradeOptions();

    await loadJournals();

};