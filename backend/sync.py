import MetaTrader5 as mt5
import requests
from datetime import datetime, timedelta

# ── Config ──────────────────────────────
API_URL  = "https://voyager-analytics1.onrender.com"
EMAIL    = "villainworldwide23@gmail.com"      # your Voyager login
PASSWORD = "voyager11"         # your Voyager password
# ────────────────────────────────────────

def login():
    res = requests.post(f"{API_URL}/login", json={
        "email": EMAIL,
        "password": PASSWORD
    })
    
    print("Status:", res.status_code)
    print("Response:", res.text)
    data = res.json()
    if "token" not in data:
        print("Login failed:", data)
        quit()
    print("Logged in successfully")
    return data["token"]


def fetch_mt5_trades():
    if not mt5.initialize():
        print("MT5 failed to initialize. Make sure MT5 is open.")
        quit()

    from_date = datetime.now() - timedelta(days=3652)
    deals = mt5.history_deals_get(from_date, datetime.now())

    if deals is None:
        print("No trade history found")
        mt5.shutdown()
        return []

    trades = []
    for deal in deals:
        if deal.entry != mt5.DEAL_ENTRY_OUT:
            continue

        trades.append({
            "ticket":     str(deal.ticket),
            "symbol":     deal.symbol,
            "order_type": str(deal.type),
            "lot_size":   deal.volume,
            "open_price": deal.price,
            "close_price":deal.price,
            "profit":     deal.profit,
            "time":       deal.time
        })

    mt5.shutdown()
    print(f"Found {len(trades)} closed trades in MT5")
    return trades


def push_trades(token, trades):
    if not trades:
        print("No trades to push")
        return

    res = requests.post(
        f"{API_URL}/trades/import",
        json=trades,
        headers={"Authorization": f"Bearer {token}"}
    )

    print(f"Status: {res.status_code}")
    print(f"Response: {res.text}")

    data = res.json()
    print(f"Sync complete — {data.get('imported', 0)} new trades imported")

if __name__ == "__main__":
    token  = login()
    trades = fetch_mt5_trades()
    push_trades(token, trades)