const token = localStorage.getItem("token");

if(!token){
    window.location.href = "../login.html";
}

// Show user email in topbar
try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    document.getElementById("userEmail").textContent = payload.email || "";
} catch(e) {}


async function loadDashboard(){

    const analytics = await getAnalytics(token);
    const accounts  = await getAccounts(token);
    const trades    = await getTrades(token);

    document.getElementById("dashboardProfit").textContent   = `$${analytics.total_profit}`;
    document.getElementById("dashboardWinRate").textContent  = `${analytics.win_rate}%`;
    document.getElementById("dashboardAccounts").textContent = accounts.length;
    document.getElementById("dashboardTrades").textContent   = analytics.trade_count;

    buildEquityCurve(trades);

    const table = document.getElementById("recentTradesTable");
    table.innerHTML = "";

    if(trades.length === 0){
        table.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--muted); padding: 40px 20px;">
                    <i class="fas fa-chart-line" style="font-size: 2rem; margin-bottom: 12px; display: block; opacity: 0.3;"></i>
                    <p>No trades yet — sync your MT5 account in Settings.</p>
                </td>
            </tr>
        `;
    } else {
        trades.slice(-5).reverse().forEach(trade => {

            const row = document.createElement("tr");

            const profitClass = trade.profit >= 0
                ? "profit-positive"
                : "profit-negative";

            row.innerHTML = `
                <td>${trade.symbol}</td>
                <td>${trade.order_type}</td>
                <td class="${profitClass}">
                    ${trade.profit >= 0 ? "+" : ""}$${trade.profit}
                </td>
            `;

            table.appendChild(row);
        });
    }
}


function buildEquityCurve(trades){

    let equity = 0;
    const labels = [];
    const data   = [];

    trades.forEach((trade, index) => {
        equity += trade.profit;
        labels.push(`Trade ${index + 1}`);
        data.push(equity);
    });

    const ctx = document.getElementById("equityChart");

    if(window.equityChart &&
        typeof window.equityChart.destroy === "function"){
        window.equityChart.destroy();
    }

    window.equityChart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Equity",
                data,
                borderColor: "#00d4ff",
                backgroundColor: "rgba(0, 212, 255, 0.05)",
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: "#94a3b8", maxTicksLimit: 8 },
                    grid:  { color: "rgba(255,255,255,0.05)" }
                },
                y: {
                    ticks: { color: "#94a3b8" },
                    grid:  { color: "rgba(255,255,255,0.05)" }
                }
            }
        }
    });
}


// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "../login.html";
});


window.onload = loadDashboard;