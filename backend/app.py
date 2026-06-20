import os
import uuid
import httpx
import json
import hashlib
import time
import calendar
import traceback

from models.goal import Goal
from schemas.goal import GoalCreate
from uuid import uuid4
from datetime import datetime, timedelta
from typing import List

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import engine, get_db
from models.user import Base, User
from models.account import Account
from models.journal import Journal
from models.trade import Trade

from schemas.user import UserRegister, UserLogin
from schemas.trade import TradeCreate
from schemas.account import AccountCreate
from schemas.journal import JournalCreate

from dependencies import get_current_user
from security import hash_password, verify_password
from auth_token import create_access_token

# MT5 is Windows-only
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False

Base.metadata.create_all(bind=engine)

# Auto-migration
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE"))
        conn.commit()
    except Exception:
        pass

app = FastAPI()

CORS_ORIGINS = [
    "https://voyageranalytics.netlify.app",
    "https://visualvoyagestudios.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# ── AI Cache ──────────────────────────────────────────────────────────

ai_cache = {}
AI_CACHE_TTL = 3600

def get_cache_key(prompt: str) -> str:
    return hashlib.md5(prompt.encode()).hexdigest()

def get_cached_response(prompt: str):
    key  = get_cache_key(prompt)
    item = ai_cache.get(key)
    if item and (time.time() - item["timestamp"]) < AI_CACHE_TTL:
        print(f"Cache hit: {key[:8]}")
        return item["text"]
    return None

def set_cached_response(prompt: str, text: str):
    key = get_cache_key(prompt)
    ai_cache[key] = {"text": text, "timestamp": time.time()}
    print(f"Cached: {key[:8]}")

# ── TradeImport schema ────────────────────────────────────────────────

class TradeImport(BaseModel):
    ticket: str
    symbol: str
    order_type: str
    lot_size: float
    open_price: float
    close_price: float
    profit: float
    time: int

# ─────────────────────────────────────────
#  ROOT
# ─────────────────────────────────────────

@app.get("/")
def home():
    return {"message": "Voyager Analytics API Running"}

# ─────────────────────────────────────────
#  AUTH
# ─────────────────────────────────────────

@app.post("/register")
def register_user(user: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already exists")
    new_user = User(
        id=str(uuid4()),
        email=user.email,
        password_hash=hash_password(user.password)
    )
    db.add(new_user)
    db.commit()
    return {"message": "User registered successfully"}


@app.post("/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"user_id": db_user.id, "email": db_user.email})
    return {"token": token, "email": db_user.email}


@app.get("/auth/me")
def get_me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    return {"email": user.email, "is_premium": user.is_premium}


@app.post("/auth/change-password")
def change_password(payload: dict, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == current_user["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload["new_password"])
    db.commit()
    return {"message": "Password updated"}


@app.delete("/auth/delete-account")
def delete_account_user(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = current_user["user_id"]
    db.query(Journal).filter(Journal.user_id == user_id).delete(synchronize_session=False)
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == user_id).all()]
    db.query(Trade).filter(Trade.account_id.in_(account_ids)).delete(synchronize_session=False)
    db.query(Account).filter(Account.user_id == user_id).delete(synchronize_session=False)
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)
    db.commit()
    return {"message": "Account deleted"}

# ─────────────────────────────────────────
#  ACCOUNTS
# ─────────────────────────────────────────

@app.post("/accounts")
def create_account(account: AccountCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    new_account = Account(
        id=str(uuid4()),
        user_id=current_user["user_id"],
        broker=account.broker,
        account_number=account.account_number,
        server=account.server,
        investor_password=account.investor_password
    )
    db.add(new_account)
    db.commit()
    db.refresh(new_account)
    return {"message": "Account created"}


@app.get("/accounts")
def get_accounts(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Account).filter(Account.user_id == current_user["user_id"]).all()


@app.delete("/accounts/{account_id}")
def delete_account(account_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.user_id == current_user["user_id"]
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    db.delete(account)
    db.commit()
    return {"message": "Account deleted"}

# ─────────────────────────────────────────
#  TRADES
# ─────────────────────────────────────────

@app.post("/trades")
def create_trade(trade: TradeCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    trade_account = db.query(Account).filter(Account.id == trade.account_id).first()
    if not trade_account:
        raise HTTPException(status_code=404, detail="Account not found")
    new_trade = Trade(
        id=str(uuid4()),
        account_id=trade.account_id,
        symbol=trade.symbol,
        order_type=trade.order_type,
        lot_size=trade.lot_size,
        open_price=trade.open_price,
        close_price=trade.close_price,
        profit=trade.profit
    )
    db.add(new_trade)
    db.commit()
    return {"message": "Trade created"}


@app.get("/trades")
def get_trades(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    return db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()


@app.delete("/trades/{trade_id}")
def delete_trade(trade_id: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    db.delete(trade)
    db.commit()
    return {"message": "Trade deleted"}


@app.post("/trades/import")
def import_trades(trades: List[TradeImport], current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    user_accounts = db.query(Account).filter(Account.user_id == current_user["user_id"]).all()
    if not user_accounts:
        raise HTTPException(status_code=404, detail="No account linked")
    account_id = user_accounts[0].id
    imported = 0
    for t in trades:
        existing = db.query(Trade).filter(Trade.ticket == t.ticket).first()
        if existing:
            continue
        trade = Trade(
            id=str(uuid.uuid4()),
            account_id=account_id,
            symbol=t.symbol,
            order_type=t.order_type,
            lot_size=t.lot_size,
            open_price=t.open_price,
            close_price=t.close_price,
            profit=t.profit,
            ticket=t.ticket,
            created_at=datetime.fromtimestamp(t.time)
        )
        db.add(trade)
        imported += 1
    db.commit()
    return {"status": "success", "imported": imported}

# ─────────────────────────────────────────
#  DATA
# ─────────────────────────────────────────

@app.delete("/data/clear")
def clear_data(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    db.query(Trade).filter(Trade.account_id.in_(account_ids)).delete(synchronize_session=False)
    db.query(Journal).filter(Journal.user_id == current_user["user_id"]).delete(synchronize_session=False)
    db.commit()
    return {"message": "All data cleared"}

# ─────────────────────────────────────────
#  JOURNALS
# ─────────────────────────────────────────

@app.post("/journals")
def create_journal(journal: JournalCreate, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    new_journal = Journal(
        id=str(uuid.uuid4()),
        user_id=current_user["user_id"],
        trade_id=journal.trade_id,
        emotion=journal.emotion,
        lesson=journal.lesson,
        mistake=journal.mistake,
        rating=journal.rating
    )
    db.add(new_journal)
    db.commit()
    return {"message": "Journal saved"}


@app.get("/journals")
def get_journals(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Journal).filter(Journal.user_id == current_user["user_id"]).all()

# ─────────────────────────────────────────
#  ANALYTICS
# ─────────────────────────────────────────

@app.get("/analytics")
def get_analytics(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()

    if not trades:
        return {
            "total_profit": 0, "win_rate": 0, "best_trade": 0,
            "worst_trade": 0, "trade_count": 0, "profit_factor": 0,
            "average_win": 0, "average_loss": 0, "expectancy": 0,
            "largest_win": 0, "largest_loss": 0, "average_trade": 0, "max_drawdown": 0
        }

    profits      = [t.profit for t in trades]
    wins         = [p for p in profits if p > 0]
    losses       = [p for p in profits if p < 0]
    gross_profit = sum(wins)
    gross_loss   = abs(sum(losses))
    win_rate     = round((len(wins) / len(profits)) * 100, 2) if profits else 0
    loss_rate    = 100 - win_rate
    average_win  = round(sum(wins) / len(wins), 2) if wins else 0
    average_loss = round(sum(losses) / len(losses), 2) if losses else 0
    profit_factor = round(gross_profit / gross_loss, 2) if gross_loss > 0 else 0
    expectancy   = round(((win_rate / 100) * average_win) + ((loss_rate / 100) * average_loss), 2)

    equity = peak = max_drawdown = 0
    for p in profits:
        equity += p
        if equity > peak:
            peak = equity
        drawdown = peak - equity
        if drawdown > max_drawdown:
            max_drawdown = drawdown

    return {
        "trade_count":   len(profits),
        "total_profit":  round(sum(profits), 2),
        "win_rate":      win_rate,
        "best_trade":    max(profits),
        "worst_trade":   min(profits),
        "profit_factor": profit_factor,
        "average_win":   average_win,
        "average_loss":  average_loss,
        "expectancy":    expectancy,
        "largest_win":   max(profits),
        "largest_loss":  min(profits),
        "average_trade": round(sum(profits) / len(profits), 2),
        "max_drawdown":  round(max_drawdown, 2)
    }


@app.get("/analytics/heatmap")
def get_heatmap(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids  = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades       = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()
    daily_results = {}

    for trade in trades:
        day = trade.created_at.date().isoformat()
        if day not in daily_results:
            daily_results[day] = {"profit": 0, "trades": 0}
        daily_results[day]["profit"] += trade.profit
        daily_results[day]["trades"] += 1

    return sorted(
        [{"date": day, "profit": round(v["profit"], 2), "trades": v["trades"]}
         for day, v in daily_results.items()],
        key=lambda x: x["date"]
    )


@app.get("/analytics/day/{date}")
def get_day_details(date: str, current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades      = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()
    return [
        {"symbol": t.symbol, "profit": t.profit, "ticket": t.ticket}
        for t in trades if t.created_at.date().isoformat() == date
    ]


@app.get("/analytics/monthly")
def get_monthly_performance(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids  = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades       = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()
    monthly_data = {}

    for trade in trades:
        month = trade.created_at.strftime("%Y-%m")
        if month not in monthly_data:
            monthly_data[month] = {"profit": 0, "trades": 0, "wins": 0}
        monthly_data[month]["profit"] += trade.profit
        monthly_data[month]["trades"] += 1
        if trade.profit > 0:
            monthly_data[month]["wins"] += 1

    return [
        {
            "month":    month,
            "profit":   round(data["profit"], 2),
            "trades":   data["trades"],
            "win_rate": round((data["wins"] / data["trades"]) * 100, 1)
        }
        for month, data in monthly_data.items()
    ]


@app.get("/analytics/sessions")
async def get_session_analysis(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades      = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()

    sessions = {
        "Asian":    {"start": 0,  "end": 9,  "trades": 0, "wins": 0, "profit": 0.0},
        "London":   {"start": 7,  "end": 16, "trades": 0, "wins": 0, "profit": 0.0},
        "New York": {"start": 12, "end": 21, "trades": 0, "wins": 0, "profit": 0.0},
        "Pacific":  {"start": 21, "end": 24, "trades": 0, "wins": 0, "profit": 0.0},
    }

    for trade in trades:
        hour = trade.created_at.hour
        for name, s in sessions.items():
            if s["start"] <= hour < s["end"]:
                s["trades"] += 1
                s["profit"] += trade.profit
                if trade.profit > 0:
                    s["wins"] += 1

    return [
        {
            "session":  name,
            "trades":   s["trades"],
            "wins":     s["wins"],
            "losses":   s["trades"] - s["wins"],
            "profit":   round(s["profit"], 2),
            "win_rate": round((s["wins"] / s["trades"]) * 100, 1) if s["trades"] > 0 else 0,
            "hours":    f"{s['start']:02d}:00 - {s['end']:02d}:00 UTC"
        }
        for name, s in sessions.items()
    ]


@app.get("/analytics/streaks")
async def get_streaks(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades      = db.query(Trade).filter(Trade.account_id.in_(account_ids)).order_by(Trade.created_at.asc()).all()

    if not trades:
        return {
            "current_streak": 0, "current_streak_type": "none",
            "best_win_streak": 0, "worst_loss_streak": 0,
            "longest_win_streak": 0, "longest_loss_streak": 0,
            "streak_history": []
        }

    streak_history = []
    current_streak = 1
    current_type   = "win" if trades[0].profit > 0 else "loss"

    for i in range(1, len(trades)):
        trade_type = "win" if trades[i].profit > 0 else "loss"
        if trade_type == current_type:
            current_streak += 1
        else:
            streak_history.append({
                "type": current_type, "length": current_streak,
                "date": trades[i - 1].created_at.date().isoformat()
            })
            current_streak = 1
            current_type   = trade_type

    streak_history.append({
        "type": current_type, "length": current_streak,
        "date": trades[-1].created_at.date().isoformat()
    })

    win_streaks  = [s["length"] for s in streak_history if s["type"] == "win"]
    loss_streaks = [s["length"] for s in streak_history if s["type"] == "loss"]
    last         = streak_history[-1]

    return {
        "current_streak":      last["length"],
        "current_streak_type": last["type"],
        "best_win_streak":     max(win_streaks)  if win_streaks  else 0,
        "worst_loss_streak":   max(loss_streaks) if loss_streaks else 0,
        "longest_win_streak":  max(win_streaks)  if win_streaks  else 0,
        "longest_loss_streak": max(loss_streaks) if loss_streaks else 0,
        "streak_history":      streak_history[-20:]
    }

# ─────────────────────────────────────────
#  MT5
# ─────────────────────────────────────────

def _mt5_unavailable():
    return {"status": "error", "message": "MT5 is not available on this server."}


@app.get("/mt5/account")
def get_mt5_account():
    if not MT5_AVAILABLE:
        return _mt5_unavailable()
    try:
        if not mt5.initialize():
            return {"status": "error", "message": "MT5 not connected"}
        account = mt5.account_info()
        if account is None:
            mt5.shutdown()
            return {"status": "error", "message": "No account logged in"}
        data = {
            "login": account.login, "server": account.server,
            "balance": account.balance, "equity": account.equity,
            "profit": account.profit, "margin": account.margin,
            "margin_free": account.margin_free, "currency": account.currency
        }
        mt5.shutdown()
        return data
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/mt5/sync")
def sync_mt5_trades(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    if not MT5_AVAILABLE:
        return _mt5_unavailable()
    if not mt5.initialize():
        return {"status": "error", "message": "MT5 not connected"}

    from_date = datetime.now() - timedelta(days=3652)
    deals     = mt5.history_deals_get(from_date, datetime.now())

    if deals is None:
        mt5.shutdown()
        return {"status": "error", "message": "No history found"}

    user_accounts = db.query(Account).filter(Account.user_id == current_user["user_id"]).all()
    if not user_accounts:
        mt5.shutdown()
        return {"status": "error", "message": "No Voyager account linked"}

    account_id = user_accounts[0].id
    imported   = 0

    for deal in deals:
        if deal.entry != mt5.DEAL_ENTRY_OUT:
            continue
        existing = db.query(Trade).filter(Trade.ticket == str(deal.ticket)).first()
        if existing:
            continue
        trade = Trade(
            id=str(uuid.uuid4()), account_id=account_id,
            symbol=deal.symbol, order_type=str(deal.type),
            lot_size=deal.volume, open_price=deal.price,
            close_price=deal.price, profit=deal.profit,
            ticket=str(deal.ticket),
            created_at=datetime.fromtimestamp(deal.time)
        )
        db.add(trade)
        imported += 1

    db.commit()
    mt5.shutdown()
    return {"status": "success", "imported": imported}

# ─────────────────────────────────────────
#  FUNDAMENTALS
# ─────────────────────────────────────────

@app.get("/fundamentals")
async def get_fundamentals(current_user=Depends(get_current_user)):
    country_map = {
        "US": "USD", "XC": "EUR", "GB": "GBP",
        "JP": "JPY", "AU": "AUD", "CA": "CAD",
        "NZ": "NZD", "CH": "CHF", "SA": "ZAR"
    }

    country_codes = ";".join(country_map.keys())
    indicators    = {
        "gdp_growth":   "NY.GDP.MKTP.KD.ZG",
        "inflation":    "FP.CPI.TOTL.ZG",
        "unemployment": "SL.UEM.TOTL.ZS"
    }
    results = {code: {"code": code} for code in country_map.values()}

    async with httpx.AsyncClient() as client:
        for metric, indicator in indicators.items():
            try:
                res  = await client.get(
                    f"https://api.worldbank.org/v2/country/{country_codes}/indicator/{indicator}",
                    params={"format": "json", "mrv": 1, "per_page": 20},
                    timeout=30.0
                )
                data = res.json()
                if isinstance(data, list) and len(data) > 1 and data[1]:
                    for entry in data[1]:
                        country_id = entry["country"]["id"]
                        currency   = country_map.get(country_id)
                        value      = entry["value"]
                        if currency and value is not None:
                            results[currency][metric] = round(value, 2)
            except Exception as e:
                print(f"World Bank fetch failed for {metric}: {str(e)}")

    return list(results.values())


@app.get("/crypto/fundamentals")
async def get_crypto_fundamentals(current_user=Depends(get_current_user)):
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": "bitcoin,ethereum,solana,ripple",
                    "vs_currencies": "usd",
                    "include_24hr_change": "true",
                    "include_market_cap": "true",
                    "include_24hr_vol": "true"
                },
                headers={"accept": "application/json"},
                timeout=30.0
            )
            data = res.json()

            if "status" in data:
                raise HTTPException(status_code=429, detail="Rate limited — try again in a minute")

            NAME_MAP = {
                "bitcoin":  ("BTC", "Bitcoin"),
                "ethereum": ("ETH", "Ethereum"),
                "solana":   ("SOL", "Solana"),
                "ripple":   ("XRP", "Ripple")
            }

            return [
                {
                    "code":       NAME_MAP[coin][0],
                    "name":       NAME_MAP[coin][1],
                    "price":      round(values.get("usd", 0), 2),
                    "change_24h": round(values.get("usd_24h_change", 0), 2),
                    "change_7d":  0,
                    "market_cap": round(values.get("usd_market_cap", 0), 0),
                    "volume_24h": round(values.get("usd_24h_vol", 0), 0),
                    "ath_distance": 0
                }
                for coin, values in data.items()
                if coin in NAME_MAP
            ]
        except HTTPException:
            raise
        except Exception as e:
            print(f"Crypto fetch error: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/currency/strength")
async def get_currency_strength(current_user=Depends(get_current_user)):
    currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "ZAR"]

    async with httpx.AsyncClient() as client:
        try:
            res = await client.get("https://open.er-api.com/v6/latest/USD", timeout=10.0)

            if not res.text.strip():
                raise HTTPException(status_code=500, detail="Empty response")

            data  = res.json()
            rates = data.get("rates", {})
            rates["USD"] = 1.0

            scores = {c: 0.0 for c in currencies}

            for base in currencies:
                base_rate = rates.get(base)
                if not base_rate:
                    continue
                for target in currencies:
                    if base == target:
                        continue
                    target_rate = rates.get(target)
                    if not target_rate:
                        continue
                    cross = target_rate / base_rate
                    if cross > 1:
                        scores[base] += 1
                    else:
                        scores[base] -= 1

            max_score = max(abs(v) for v in scores.values()) or 1

            return [
                {
                    "code":  code,
                    "score": round((scores[code] / max_score) * 100, 1),
                    "raw":   scores[code],
                    "trend": "bullish" if scores[code] > 2 else "bearish" if scores[code] < -2 else "neutral"
                }
                for code in currencies
            ]
        except HTTPException:
            raise
        except Exception as e:
            print(f"Currency strength error: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# ─────────────────────────────────────────
#  AI ENDPOINTS
# ─────────────────────────────────────────

@app.post("/ai/insight")
async def ai_insight(payload: dict, current_user=Depends(get_current_user)):
    prompt = payload.get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="No prompt provided")

    cached = get_cached_response(prompt)
    if cached:
        return {"text": cached, "cached": True}

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "max_tokens": 8000,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=30.0
            )

        data = res.json()

        if "choices" not in data:
            print(f"Groq response: {data}")
            raise HTTPException(
                status_code=500,
                detail=f"Groq error: {data.get('error', {}).get('message', str(data))}"
            )

        text = data["choices"][0]["message"]["content"]
        set_cached_response(prompt, text)
        return {"text": text, "cached": False}

    except HTTPException:
        raise
    except Exception as e:
        print(f"AI insight error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ai/trade-insights")
async def ai_trade_insights(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    account_ids = [a.id for a in db.query(Account).filter(Account.user_id == current_user["user_id"]).all()]
    trades      = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()

    if not trades:
        raise HTTPException(status_code=404, detail="No trades found")

    symbol_stats = {}
    day_stats    = {}

    for trade in trades:
        if trade.symbol not in symbol_stats:
            symbol_stats[trade.symbol] = {"trades": 0, "wins": 0, "profit": 0.0}
        symbol_stats[trade.symbol]["trades"] += 1
        symbol_stats[trade.symbol]["profit"] += trade.profit
        if trade.profit > 0:
            symbol_stats[trade.symbol]["wins"] += 1

        day = trade.created_at.strftime("%A")
        if day not in day_stats:
            day_stats[day] = {"trades": 0, "wins": 0, "profit": 0.0}
        day_stats[day]["trades"] += 1
        day_stats[day]["profit"] += trade.profit
        if trade.profit > 0:
            day_stats[day]["wins"] += 1

    total_trades = len(trades)
    total_profit = round(sum(t.profit for t in trades), 2)
    win_rate     = round(len([t for t in trades if t.profit > 0]) / total_trades * 100, 1)

    symbol_summary = "; ".join([
        f"{s}: {v['trades']} trades, {round(v['wins']/v['trades']*100,1)}% WR, ${round(v['profit'],2)} PL"
        for s, v in sorted(symbol_stats.items(), key=lambda x: x[1]['profit'], reverse=True)[:8]
    ])

    day_summary = "; ".join([
        f"{d}: {v['trades']} trades, {round(v['wins']/v['trades']*100,1)}% WR, ${round(v['profit'],2)}"
        for d, v in day_stats.items()
    ])

    prompt = (
        "You are an expert trading coach. Give specific actionable insights based on this data. "
        f"Total trades: {total_trades}, Total profit: ${total_profit}, Win rate: {win_rate}%. "
        f"By symbol: {symbol_summary}. By day: {day_summary}. "
        "Return exactly 6 insights as a JSON array with no markdown, no preamble: "
        '[{"title": "Short title", "detail": "2-3 sentences with specific numbers", '
        '"type": "strength or weakness or opportunity or warning"}]. '
        "Return ONLY the JSON array."
    )

    cached = get_cached_response(prompt)
    if cached:
        clean    = cached.replace("```json", "").replace("```", "").strip()
        insights = json.loads(clean)
        return {"insights": insights, "summary": {
            "total_trades": total_trades,
            "total_profit": total_profit,
            "win_rate":     win_rate
        }, "cached": True}

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.3-70b-versatile",
                    "max_tokens": 5500,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=30.0
            )

        data = res.json()

        if "choices" not in data:
            raise HTTPException(status_code=500, detail=f"Groq error: {data}")

        text     = data["choices"][0]["message"]["content"]
        clean    = text.replace("```json", "").replace("```", "").strip()
        insights = json.loads(clean)

        set_cached_response(prompt, text)

        return {"insights": insights, "summary": {
            "total_trades": total_trades,
            "total_profit": total_profit,
            "win_rate":     win_rate
        }, "cached": False}

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Could not parse AI response: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Trade insights error: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")

# ── Economic calendar cache ──────────────────────────────────────────

economic_calendar_cache = {"data": None, "timestamp": 0}
ECONOMIC_CACHE_TTL = 1800  # 30 minutes


@app.get("/economic/calendar")
async def get_economic_calendar(current_user=Depends(get_current_user)):

    if economic_calendar_cache["data"] and (time.time() - economic_calendar_cache["timestamp"]) < ECONOMIC_CACHE_TTL:
        print("Economic calendar cache hit")
        return economic_calendar_cache["data"]

    urls = [
        "https://nfs.faireconomy.media/ff_calendar_lastweek.json",
        "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
        "https://nfs.faireconomy.media/ff_calendar_nextweek.json"
    ]

    majors      = {"USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "ZAR"}
    all_events  = []

    async with httpx.AsyncClient() as client:
        for url in urls:
            try:
                res = await client.get(
                    url,
                    timeout=15.0,
                    headers={"User-Agent": "Mozilla/5.0 (Voyager Analytics)"}
                )
                data = res.json()
                if isinstance(data, list):
                    all_events.extend(data)
            except Exception as e:
                print(f"Calendar fetch failed for {url}: {str(e)}")

    cleaned = []
    seen    = set()

    for e in all_events:
        country = e.get("country", "")
        impact  = e.get("impact", "")

        if country not in majors:
            continue
        if impact not in ("High", "Medium"):
            continue

        key = (e.get("title", ""), country, e.get("date", ""))
        if key in seen:
            continue
        seen.add(key)

        cleaned.append({
            "event":    e.get("title", ""),
            "country":  country,
            "impact":   impact.lower(),
            "actual":   e.get("actual", "") or "",
            "forecast": e.get("forecast", "") or "",
            "previous": e.get("previous", "") or "",
            "date":     e.get("date", "")
        })

    cleaned.sort(key=lambda x: x["date"])

    economic_calendar_cache["data"]      = cleaned
    economic_calendar_cache["timestamp"] = time.time()

    return cleaned

# ─────────────────────────────────────────
#  GOALS
# ─────────────────────────────────────────

@app.post("/goals")
def set_goal(
    goal: GoalCreate,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    month = datetime.utcnow().strftime("%Y-%m")

    existing = db.query(Goal).filter(
        Goal.user_id == current_user["user_id"],
        Goal.month == month
    ).first()

    if existing:
        existing.target_profit = goal.target_profit
        existing.target_trades = goal.target_trades
        db.commit()
        return {"message": "Goal updated"}

    new_goal = Goal(
        id=str(uuid.uuid4()),
        user_id=current_user["user_id"],
        month=month,
        target_profit=goal.target_profit,
        target_trades=goal.target_trades
    )
    db.add(new_goal)
    db.commit()
    return {"message": "Goal set"}


@app.get("/goals/current")
def get_current_goal(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now   = datetime.utcnow()
    month = now.strftime("%Y-%m")

    goal = db.query(Goal).filter(
        Goal.user_id == current_user["user_id"],
        Goal.month == month
    ).first()

    account_ids = [
        a.id for a in
        db.query(Account).filter(Account.user_id == current_user["user_id"]).all()
    ]
    trades = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()

    month_trades  = [t for t in trades if t.created_at.strftime("%Y-%m") == month]
    actual_profit = round(sum(t.profit for t in month_trades), 2)
    actual_trades = len(month_trades)
    wins          = len([t for t in month_trades if t.profit > 0])
    actual_win_rate = round((wins / actual_trades) * 100, 1) if actual_trades > 0 else 0

    days_in_month = calendar.monthrange(now.year, now.month)[1]
    day_of_month  = now.day
    days_remaining = days_in_month - day_of_month

    if not goal:
        return {
            "has_goal":        False,
            "month":           month,
            "actual_profit":   actual_profit,
            "actual_trades":   actual_trades,
            "actual_win_rate": actual_win_rate,
            "days_remaining":  days_remaining
        }

    progress_pct = round((actual_profit / goal.target_profit) * 100, 1) if goal.target_profit > 0 else 0
    trades_progress_pct = (
        round((actual_trades / goal.target_trades) * 100, 1)
        if goal.target_trades else None
    )

    expected_pace = (day_of_month / days_in_month) * 100

    return {
        "has_goal":            True,
        "month":               month,
        "target_profit":       goal.target_profit,
        "target_trades":       goal.target_trades,
        "actual_profit":       actual_profit,
        "actual_trades":       actual_trades,
        "actual_win_rate":     actual_win_rate,
        "progress_pct":        progress_pct,
        "trades_progress_pct": trades_progress_pct,
        "days_remaining":      days_remaining,
        "on_track":            progress_pct >= expected_pace
    }


@app.get("/goals/history")
def get_goal_history(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goals = db.query(Goal).filter(
        Goal.user_id == current_user["user_id"]
    ).order_by(Goal.month.desc()).all()

    account_ids = [
        a.id for a in
        db.query(Account).filter(Account.user_id == current_user["user_id"]).all()
    ]
    trades = db.query(Trade).filter(Trade.account_id.in_(account_ids)).all()

    results = []
    for g in goals:
        month_trades  = [t for t in trades if t.created_at.strftime("%Y-%m") == g.month]
        actual_profit = round(sum(t.profit for t in month_trades), 2)

        results.append({
            "month":         g.month,
            "target_profit": g.target_profit,
            "actual_profit": actual_profit,
            "achieved":      actual_profit >= g.target_profit,
            "progress_pct":  round((actual_profit / g.target_profit) * 100, 1) if g.target_profit > 0 else 0
        })

    return results

#__--
#Correlation cache
#_____
correlation_cache    = {"data": None, "timestamp": 0}
CORRELATION_CACHE_TTL = 21600  # 6 hours — daily data doesn't need refreshing often

def pearson_correlation(x, y):
    n = len(x)
    if n == 0:
        return 0
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov    = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    std_x  = (sum((xi - mean_x) ** 2 for xi in x)) ** 0.5
    std_y  = (sum((yi - mean_y) ** 2 for yi in y)) ** 0.5
    if std_x == 0 or std_y == 0:
        return 0
    return cov / (std_x * std_y)

@app.get("/correlation/matrix")
async def get_correlation_matrix(current_user=Depends(get_current_user)):

    print("=== Correlation matrix endpoint hit ===", flush=True)

    if correlation_cache["data"] and (time.time() - correlation_cache["timestamp"]) < CORRELATION_CACHE_TTL:
        print("Correlation cache hit", flush=True)
        return correlation_cache["data"]

    pairs  = ["eurusd","gbpusd","usdjpy","usdchf","audusd","usdcad","nzdusd","eurgbp","eurjpy","gbpjpy"]
    closes = {}

    try:
        async with httpx.AsyncClient() as client:
            for pair in pairs:
                try:
                    res = await client.get(
                        f"https://stooq.com/q/d/l/?s={pair}&i=d",
                        timeout=15.0,
                        headers={"User-Agent": "Mozilla/5.0"}
                    )
                    print(f"Stooq {pair} status: {res.status_code}", flush=True)
                    print(f"Stooq {pair} body preview: {res.text[:200]}", flush=True)
    
                    lines = res.text.strip().split("\n")
                    rows  = lines[1:]
                    series = []
    
                    for row in rows[-31:]:
                        parts = row.split(",")
                        if len(parts) >= 5:
                            try:
                                series.append(float(parts[4]))
                            except ValueError:
                                continue
    
                    if len(series) >= 10:
                        closes[pair.upper()] = series
                    else:
                        print(f"Not enough data points for {pair}: got {len(series)}", flush=True)
    
                except Exception as e:
                    print(f"Stooq fetch failed for {pair}: {type(e).__name__}: {str(e)}", flush=True)
    
        print(f"Total pairs with data: {len(closes)}", flush=True)
    
        returns = {}
        for pair, series in closes.items():
            rets = []
            for i in range(1, len(series)):
                if series[i - 1] != 0:
                    rets.append((series[i] - series[i - 1]) / series[i - 1])
            returns[pair] = rets
    
        valid_pairs = [p for p in returns if len(returns[p]) >= 10]
    
        if not valid_pairs:
            print("No valid pairs after processing", flush=True)
            raise HTTPException(status_code=500, detail="Could not fetch historical price data")
    
        min_len = min(len(returns[p]) for p in valid_pairs)
    
        matrix = []
        for p1 in valid_pairs:
            row = []
            r1  = returns[p1][-min_len:]
            for p2 in valid_pairs:
                r2   = returns[p2][-min_len:]
                corr = pearson_correlation(r1, r2)
                row.append(round(corr, 2))
            matrix.append(row)
    
        result = {"pairs": valid_pairs, "matrix": matrix}
    
        correlation_cache["data"]      = result
        correlation_cache["timestamp"] = time.time()
    
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"FULL TRACEBACK: {traceback.format_exc()}", flush=True)
        raise HTTPException(status_code=500,detail=f"{type(e).__name__}: {str(e)}")
