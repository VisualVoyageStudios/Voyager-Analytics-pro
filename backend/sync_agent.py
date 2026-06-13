import requests
import MetaTrader5 as mt5
from datetime import datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://voyageranalytics.netlify.app",
                   "https://visualvoyagestudios.github.io",
                   "http://127.0.0.1:5500",
                   "http://localhost:5500"],
    allow_methods=["*"],
    allow_headers=["*"]
)

API_URL = "https://voyager-analytics-pro.onrender.com"


@app.get("/status")
def status():
    return {"status": "running"}


@app.post("/sync")
def sync(payload: dict):
    token = payload.get("token")

    if not token:
        return {"status": "error", "message": "No token provided"}

    # Connect to MT5
    if not mt5.initialize():
        return {
            "status": "error",
            "message": "MetaTrader 5 is not open. Please open MT5 on your computer and try again."
        }

    from_date = datetime.now() - timedelta(days=3652)
    deals = mt5.history_deals_get(from_date, datetime.now())

    if deals is None:
        mt5.shutdown()
        return {"status": "error", "message": "No trade history found in MT5."}

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

    if not trades:
        return {"status": "success", "imported": 0}

    # Push to live backend
    res = requests.post(
        f"{API_URL}/trades/import",
        json=trades,
        headers={"Authorization": f"Bearer {token}"}
    )

    print(f"Status: {res.status_code}")
    print(f"Raw Response: {res.text}")

    try:
        return res.json()
    except ValueError:
        return {
            "status": "error",
            "message": f"Backend returned non-JSON (status {res.status_code})",
            "raw": res.text
        }


if __name__ == "__main__":
    print("Voyager Sync Agent running...")
    print("You can now use the Sync button on the Voyager Analytics website.")
    uvicorn.run(app, host="127.0.0.1", port=5001)
