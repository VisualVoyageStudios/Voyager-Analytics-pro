const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "../login.html";
}
let currentDate = new Date();

async function loadAnalytics() {

    const data = await getAnalytics(token);

    document.getElementById("totalProfit").textContent =
        `$${data.total_profit}`;

    document.getElementById("winRate").textContent =
        `${data.win_rate}%`;

    document.getElementById("bestTrade").textContent =
        `$${data.best_trade}`;

    document.getElementById("worstTrade").textContent =
        `$${data.worst_trade}`;

    // bottom row
    document.getElementById(
    "profitFactor"
    ).textContent =
        data.profit_factor;

    document.getElementById(
        "averageWin"
    ).textContent =
        `$${data.average_win}`;

    document.getElementById(
        "averageLoss"
    ).textContent =
        `$${data.average_loss}`;

    document.getElementById(
        "expectancy"
    ).textContent =
        `$${data.expectancy}`;

    // lower row
    document.getElementById(
    "averageTrade"
    ).textContent =
        `$${data.average_trade}`;

    document.getElementById(
        "maxDrawdown"
    ).textContent =
        `$${data.max_drawdown}`;

}


//  calendar heatmap data for the logged-in user(broker account)
async function loadHeatmap(){

    const token =
    localStorage.getItem(
        "token"
    );

    const data =
    await getHeatmap(
        token
    );

    const container =
    document.getElementById(
        "heatmap"
    );

    const year =
    currentDate.getFullYear();

    const month =
    currentDate.getMonth();

    const monthData =
    data.filter(d => {

        const tradeDate =
        new Date(d.date);

        return (
            tradeDate.getFullYear() === year &&
            tradeDate.getMonth() === month
        );

    });

    const totalProfit =
    Number(
    monthData.reduce(
        (sum, day) =>
        sum + day.profit,
        0
    ));

    const totalTrades =
    Number(
    monthData.reduce(
        (sum, day) =>
        sum + (day.trades || 0),
        0
    ));

    const tradingDays =
    monthData.length;

    const winningDays =
    monthData.filter(
        d => d.profit > 0
    ).length;

    const winRate =
    tradingDays > 0
    ? (
        winningDays /
        tradingDays
    ) * 100
    : 0;
  
    const daysInMonth =
    new Date(
        year,
        month + 1,
        0
    ).getDate();

    // monthly summary
    document.getElementById(
        "monthProfit"
    ).textContent =
    `Net Profit: $${totalProfit.toFixed(2)}`;

    document.getElementById(
        "monthTrades"
    ).textContent =
    `Trades: ${totalTrades}`;

    document.getElementById(
        "monthDays"
    ).textContent =
    `Trading Days: ${tradingDays}`;

    document.getElementById(
        "monthWinRate"
    ).textContent =
    `Win Rate: ${winRate.toFixed(1)}%`;


    container.innerHTML = "";

    for(
        let day = 1;
        day <= daysInMonth;
        day++
    ){

        const cell =
        document.createElement(
            "div"
        );

        cell.className =
        "calendar-day";

        cell.textContent =
        day;

        const currentDateString =
        `${year}-${String(
            month + 1
        ).padStart(2,"0")}-${String(
            day
        ).padStart(2,"0")}`;

        const tradeDay =
        data.find(
            d =>
            d.date === currentDateString
        );

        // Color coding based on profit
        if(tradeDay){

            if(tradeDay.profit > 100){

                cell.style.background =
                "#006400";

            }
            else if(
                tradeDay.profit > 0
            ){

                cell.style.background =
                "#32CD32";

            }
            else if(
                tradeDay.profit < -100
            ){

                cell.style.background =
                "#8B0000";

            }
            else if(
                tradeDay.profit < 0
            ){

                cell.style.background =
                "#FF6347";

            }
            else{

                cell.style.background =
                "#444";

            }

            // cell text
            cell.title =
            `${tradeDay.date}

            Profit: ${tradeDay.profit}

            Trades: ${tradeDay.trades}`;

        }
        else{

            cell.style.background =
            "#222";

            //cell text
            cell.title =
            `${currentDateString}
                No trades`;

        }

        container.appendChild(
            cell
        );


           //daily summary(click calendar day)
        cell.addEventListener("click", async () => {

            const trades = await getDayTrades(token, currentDateString);

            document.getElementById("modalDate").textContent = currentDateString;

            const modalTrades = document.getElementById("modalTrades");

            if(trades.length === 0){
                modalTrades.innerHTML = `
                    <div class="day-modal-empty">
                        <i class="fas fa-calendar-xmark" style="font-size: 1.5rem; margin-bottom: 10px; display: block; opacity: 0.3;"></i>
                        No trades on this day.
                    </div>
                `;
            } else {
                modalTrades.innerHTML = trades.map(t => `
                    <div class="day-modal-trade">
                        <span style="font-weight: 600;">${t.symbol}</span>
                        <span style="color: ${t.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">
                            ${t.profit >= 0 ? '+' : ''}$${t.profit}
                        </span>
                    </div>
                `).join("");
            }

            document.getElementById("dayModal").classList.add("open");

            document.getElementById("closeModal").onclick = () => {
                document.getElementById("dayModal").classList.remove("open");
            };

        });
    }

// Set month title(e.g. "September 2024")
document.getElementById("monthTitle").textContent =
    
    currentDate.toLocaleString(
        "default",
        {
            month:"long",
            year:"numeric"
        }
    );

}

// Month navigation
document.getElementById("prevMonth")
    .addEventListener(
        "click",
        () => {
            currentDate = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() - 1,
                1
            );

            loadHeatmap();

        }
    );

document.getElementById("nextMonth")
    .addEventListener(
        "click",
        () => {

            currentDate = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() + 1,
                1
            );

            loadHeatmap();

        }
    );


// monthly Review table
async function loadMonthlyTable(){
    
    const token =
    localStorage.getItem(
        "token"
    );

    const data =
    await getMonthlyPerformance(
        token
    );

    const tbody =
    document.querySelector(
        "#monthlyTable tbody"
    );

    tbody.innerHTML = "";

    data.forEach(month => {

        const row =
        document.createElement(
            "tr"
        );

        row.innerHTML = `

            <td>${month.month}</td>

            <td>${month.profit}</td>

            <td>${month.trades}</td>

            <td>${month.win_rate}%</td>

        `;

        tbody.appendChild(
            row
        );

    });
}







    
// Render on Window Load
window.onload = function() {
    loadAnalytics();
    loadHeatmap();
    loadMonthlyTable();
};