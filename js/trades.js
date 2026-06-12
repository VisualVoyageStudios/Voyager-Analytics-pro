const token = localStorage.getItem("token");

if(!token){
    window.location.href = "../login.html";
}

let allTrades = [];

function formatDate(dateString){
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function renderTrades(trades){
    const table = document.getElementById("tradesTable");
    table.innerHTML = "";

    if(trades.length === 0){
        table.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--muted); padding: 40px;">
                    No trades found.
                </td>
            </tr>
        `;
        return;
    }

    trades.forEach(trade => {
        const row = document.createElement("tr");

        const profitClass = trade.profit >= 0 ? "profit" : "loss";

        row.innerHTML = `
            <td>${trade.symbol}</td>
            <td>${trade.order_type}</td>
            <td>${trade.lot_size}</td>
            <td class="${profitClass}">$${trade.profit}</td>
            <td>${formatDate(trade.created_at)}</td>
            <td>
                <button class="delete-btn" data-id="${trade.id}">
                    Delete
                </button>
            </td>
        `;

        table.appendChild(row);

        row.querySelector(".delete-btn")
            .addEventListener("click", async () => {
                if(!confirm("Delete this trade?")) return;
                await deleteTrade(trade.id, token);
                allTrades = allTrades.filter(t => t.id !== trade.id);
                applyFilters();
            });
    });
}

function applyFilters(){
    const search    = document.getElementById("searchTrade").value.toLowerCase();
    const direction = document.getElementById("directionFilter").value;
    const result    = document.getElementById("resultFilter").value;

    const filtered = allTrades.filter(trade => {

        const matchSymbol    = trade.symbol.toLowerCase().includes(search);
        const matchDirection = direction === "" || trade.order_type === direction;
        const matchResult    = result === ""
            || (result === "profit" && trade.profit >= 0)
            || (result === "loss"   && trade.profit < 0);

        return matchSymbol && matchDirection && matchResult;
    });

    renderTrades(filtered);
}

async function loadTrades(){
    allTrades = await getTrades(token);
    renderTrades(allTrades);
}

// Filter listeners
document.getElementById("searchTrade")
    .addEventListener("input", applyFilters);

document.getElementById("directionFilter")
    .addEventListener("change", applyFilters);

document.getElementById("resultFilter")
    .addEventListener("change", applyFilters);

// Export to CSV
document.getElementById("exportBtn")
    .addEventListener("click", async () => {

        if(!allTrades || allTrades.length === 0){
            alert("No trades to export.");
            return;
        }

        const headers = ["Symbol","Type","Lot Size","Open Price","Close Price","Profit","Date"];

        const rows = allTrades.map(trade => [
            trade.symbol,
            trade.order_type,
            trade.lot_size,
            trade.open_price,
            trade.close_price,
            trade.profit,
            formatDate(trade.created_at)
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");

        a.href     = url;
        a.download = `voyager-trades-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();

        URL.revokeObjectURL(url);
    });

loadTrades();