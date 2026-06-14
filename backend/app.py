import os
import uuid
import httpx
from uuid import uuid4
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, get_db
from models.user import Base, User
from models.account import Account
from models.journal import Journal
from models.trade import Trade

from schemas.user import UserRegister, UserLogin
from schemas.trade import TradeCreate
from schemas.user import UserLogin, UserRegister
from schemas.account import AccountCreate
from schemas.journal import JournalCreate

from dependencies import get_current_user
from security import hash_password
from security import verify_password
from auth_token import create_access_token

# mt5 wont work on linux
try:
    import MetaTrader5 as mt5 
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False

Base.metadata.create_all(bind=engine)

# Auto-migration: add is_premium column if it doesn't exist
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN is_premium BOOLEAN DEFAULT FALSE"))
        conn.commit()
    except Exception:
        pass  # Column already exists, safe to ignore

app = FastAPI()

# CORS origin from .env(no uvicorn reload needed)
CORS_ORIGINS = [
    "https://voyageranalytics.netlify.app",
    "https://visualvoyagestudios.github.io",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins= CORS_ORIGINS,

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"]
)

#---
#ROOTS
#---
@app.get("/")
def home():

    return {
        "message":
        "Voyager Analytics API Running"
    }

## Registration endpoint
@app.post("/register")
def register_user(
    user: UserRegister,
    db: Session = Depends(get_db)
):

    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:

        raise HTTPException(
            status_code=400,
            detail="Email already exists"
        )

    new_user = User(

        id=str(uuid4()),

        email=user.email,

        password_hash=hash_password(
            user.password
        )

    )

    db.add(new_user)

    db.commit()

    return {
        "message":
        "User registered successfully"
    }


## Login endpoint
@app.post("/login")
def login_user(
    user: UserLogin,
    db: Session = Depends(get_db)
):

    db_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if not db_user:

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    valid_password = verify_password(
        user.password,
        db_user.password_hash
    )

    if not valid_password:

        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    token = create_access_token({

        "user_id": db_user.id,

        "email": db_user.email

    })

    return {

        "token": token,

        "email": db_user.email

    }


## Create account endpoint
@app.post("/accounts")
def create_account(

    account: AccountCreate,

    current_user = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

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

    return {
        "message": "Account created"
    }

    ## Get accounts endpoint
@app.get("/accounts")
def get_accounts(

    current_user = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    accounts = db.query(
        Account
    ).filter(

        Account.user_id ==
        current_user["user_id"]

    ).all()

    return accounts

    ## Delete account endpoint
@app.delete("/accounts/{account_id}")
def delete_account(

    account_id: str,

    current_user = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    account = db.query(
        Account
    ).filter(

        Account.id == account_id,

        Account.user_id ==
        current_user["user_id"]

    ).first()

    if not account:

        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    db.delete(account)

    db.commit()

    return {
        "message":
        "Account deleted"
    }


## Create trade endpoint
@app.post("/trades")
def create_trade(

    trade: TradeCreate,

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    trade_account = db.query(
        Account
    ).filter(

        Account.id ==
        trade.account_id

    ).first()

    if not trade_account:

        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    new_trade = Trade(

        id=str(uuid4()),

        account_id=
        trade.account_id,

        symbol=
        trade.symbol,

        order_type=
        trade.order_type,

        lot_size=
        trade.lot_size,

        open_price=
        trade.open_price,

        close_price=
        trade.close_price,

        profit=
        trade.profit

    )

    db.add(new_trade)

    db.commit()

    return {
        "message":
        "Trade created"
    }

    ## get trades endpoints
@app.get("/trades")
def get_trades(

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    user_accounts = db.query(
        Account
    ).filter(

        Account.user_id ==
        current_user["user_id"]

    ).all()

    account_ids = [

        account.id

        for account
        in user_accounts

    ]

    trades = db.query(
        Trade
    ).filter(

        Trade.account_id.in_(
            account_ids
        )

    ).all()

    for trade in trades:
        print(trade.symbol)

    return trades

    ## delete trades(old)
@app.delete("/trades/{trade_id}")
def delete_trade(

    trade_id:str,

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    trade = db.query(
        Trade
    ).filter(

        Trade.id ==
        trade_id

    ).first()

    if not trade:

        raise HTTPException(
            status_code=404,
            detail="Trade not found"
        )

    db.delete(trade)

    db.commit()

    return {
        "message":
        "Trade deleted"
    }


## analytics endpoint
@app.get("/analytics")
def get_analytics(

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    user_accounts = db.query(
        Account
    ).filter(

        Account.user_id ==
        current_user["user_id"]

    ).all()

    account_ids = [
        account.id
        for account
        in user_accounts
    ]

    trades = db.query(
        Trade
    ).filter(
        Trade.account_id.in_(
            account_ids
        )
    ).all()

    if not trades:

        return {

            "total_profit":0,

            "win_rate":0,

            "best_trade":0,

            "worst_trade":0,

            "trade_count":0

        }

    ## calculations
    profits = [trade.profit for trade in trades]

    wins = [p for p in profits if p > 0]
    losses = [p for p in profits if p < 0]

    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))

    profit_factor = (
        round(gross_profit / gross_loss, 2)
        if gross_loss > 0
        else 0
    )

    average_win = (
        round(sum(wins) / len(wins), 2)
        if wins
        else 0
    )

    average_loss = (
        round(sum(losses) / len(losses), 2)
        if losses
        else 0
    )

    win_rate = (
        round((len(wins) / len(profits)) * 100, 2)
        if profits
        else 0
    )

    loss_rate = 100 - win_rate

    expectancy = round(
        (
            (win_rate / 100) * average_win
        )
        +
        (
            (loss_rate / 100) * average_loss
        ),
        2
    )

    largest_win = max(profits) if profits else 0
    largest_loss = min(profits) if profits else 0


    equity = 0
    peak = 0
    max_drawdown = 0

    for profit in profits:

        equity += profit

        if equity > peak:
            peak = equity

        drawdown = peak - equity

        if drawdown > max_drawdown:
            max_drawdown = drawdown

    average_trade = (
    round(sum(profits) / len(profits), 2)
    if profits
    else 0
    )

    return {
        "trade_count": len(profits),
        "total_profit": round(sum(profits), 2),
        "win_rate": win_rate,
        "best_trade": largest_win,
        "worst_trade": largest_loss,

        "profit_factor": profit_factor,
        "average_win": average_win,
        "average_loss": average_loss,
        "expectancy": expectancy,
        "largest_win": largest_win,
        "largest_loss": largest_loss,

        "average_trade": average_trade,
        "max_drawdown": round(max_drawdown, 2),
    }


## create journal endpoint
@app.post("/journals")
def create_journal(

    journal: JournalCreate,

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )

):

    new_journal = Journal(

        id=str(uuid.uuid4()),

        user_id=
        current_user["user_id"],

        trade_id=
        journal.trade_id,

        emotion=
        journal.emotion,

        lesson=
        journal.lesson,

        mistake=
        journal.mistake,

        rating=
        journal.rating

    )
    db.add(new_journal)

    db.commit()

    return {
        "message":"Journal saved"
    }


    ## get journal endpoint
@app.get("/journals")
def get_journals(

    current_user=Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    )
):

    journals = db.query(
        Journal
    ).filter(

        Journal.user_id ==
        current_user["user_id"]

    ).all()

    return journals

## MT5 connector
def _mt5_unavailable():
    return {
        "status": "error",
        "message": "MT5 is not available/ installed"
    }


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
            "login": account.login,
            "server": account.server,
            "balance": account.balance,
            "equity": account.equity,
            "profit": account.profit,
            "margin": account.margin,
            "margin_free": account.margin_free,
            "currency": account.currency
        }
        mt5.shutdown()
        return data
    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    data = {
        "login": account.login,
        "server": account.server,
        "balance": account.balance,
        "equity": account.equity,
        "profit": account.profit,
        "margin": account.margin,
        "margin_free": account.margin_free,
        "currency": account.currency
    }

    mt5.shutdown()
    return data

    ## mt5 account history

@app.get("/mt5/history")
def get_mt5_history():
    try:
        import MetaTrader5 as mt5
        MT5_AVAILABLE = True
    except ImportError:
        mt5 = None
        MT5_AVAILABLE = False

    if not MT5_AVAILABLE:
        return{
            _mt5_unavailable()
        }

def get_mt5_history():

    if not mt5.initialize():

        return {
            "status": "error",
            "message": "MT5 not connected"
        }

    from_date = datetime.now() - timedelta(days=30)
    to_date = datetime.now()

    deals = mt5.history_deals_get(
        from_date,
        to_date
    )

    if deals is None:

        mt5.shutdown()

        return {
            "status": "error",
            "message": "No trade history found"
        }

    results = []

    for deal in deals:

        results.append({

            "ticket": deal.ticket,
            "symbol": deal.symbol,
            "volume": deal.volume,
            "profit": deal.profit,
            "time": deal.time,
            "type": deal.type

        })

    mt5.shutdown()

    return results

    ## mt5 open positions(render trade history)
@app.post("/mt5/sync")
def sync_mt5_trades(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        import MetaTrader5 as mt5
        MT5_AVAILABLE = True
    except ImportError:
        mt5 = None
        MT5_AVAILABLE = False

    if not MT5_AVAILABLE:
        return{
            _mt5_unavailable()
        }


    if not mt5.initialize():

        return {
            "status": "error",
            "message": "MT5 not connected"
        }

    from_date = datetime.now() - timedelta(days=3652) ##{10 yrs look back}
    to_date = datetime.now()

    deals = mt5.history_deals_get(
        from_date,
        to_date
    )

    if deals is None:

        mt5.shutdown()

        return {
            "status": "error",
            "message": "No history found"
        }

    imported = 0

    account = Account

    user_accounts = db.query(
        Account
    ).filter(
        Account.user_id ==
        current_user["user_id"]
    ).all()

    if not user_accounts:

        mt5.shutdown()

        return {
            "status": "error",
            "message": "No Voyager account linked"
        }

    account_id = user_accounts[0].id
    imported = 0

    for deal in deals:

        if deal.entry !=mt5.DEAL_ENTRY_OUT:
            continue

        existing = db.query(
            Trade
        ).filter(
            Trade.ticket ==
            str(deal.ticket)
        ).first()

        if existing:
            continue

        trade_time = datetime.fromtimestamp(
            deal.time
        )

        trade = Trade(

            id=str(uuid.uuid4()),

            account_id=account_id,

            symbol=deal.symbol,

            order_type=str(deal.type),

            lot_size=deal.volume,

            open_price=deal.price,

            close_price=deal.price,

            profit=deal.profit,

            ticket=str(deal.ticket),
            
            created_at=trade_time

        )

        db.add(trade)

        imported += 1

    db.commit()

    mt5.shutdown()

    return {
        "status": "success",
        "imported": imported
    }

## Calendar Heatmap
@app.get("/analytics/heatmap")
def get_heatmap(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):

    accounts = (
        db.query(Account)
        .filter(
            Account.user_id ==
            current_user["user_id"]
        )
        .all()
    )

    account_ids = [
        account.id
        for account in accounts
    ]

    trades = (
        db.query(Trade)
        .filter(
            Trade.account_id.in_(account_ids)
        )
        .all()
    )

    daily_results = {}


    for trade in trades:
        
        print(
            trade.symbol,
            trade.profit,
            trade.created_at.date()
        )

        day = (
            trade.created_at
            .date()
            .isoformat()
        )

        if day not in daily_results:
            daily_results[day] = {
                "profit": 0,
                "trades": 0
            }

        daily_results[day]["profit"] += trade.profit
        daily_results[day]["trades"] += 1

    return sorted(
        [
            {
                "date": day,
                "profit": round(values["profit"], 2),
                "trades": values["trades"]
            }
            
            for day, values in daily_results.items()
        ],
        key=lambda x: x["date"]
    )


## monthly summary(above calendar)
@app.get(
    "/analytics/day/{date}"
)
def get_day_details(
    date: str,
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    )
):
    account_ids = [
        account.id
        for account in
        db.query(Account)
        .filter(
            Account.user_id ==
            current_user["user_id"]
        )
        .all()
    ]

    trades = (
        db.query(Trade)
        .filter(
            Trade.account_id.in_(
                account_ids
            )
        )
        .all()
    )

    result = []

    for trade in trades:

        if (
            trade.created_at
            .date()
            .isoformat()
            == date
        ):

            result.append({

                "symbol":
                trade.symbol,

                "profit":
                trade.profit,

                "ticket":
                trade.ticket

            })

    return result

## monthly review
@app.get("/analytics/monthly")
def get_monthly_performance(
    current_user=Depends(
        get_current_user
    ),
    db: Session = Depends(get_db)
):
    monthly_data = {}

    account_ids = [
        account.id
        for account in
        db.query(Account)
        .filter(
            Account.user_id ==
            current_user["user_id"]
        )
        .all()
    ]

    trades = (db.query(Trade).filter(
        Trade.account_id.in_(
            account_ids)
            )
            .all()
    )


    for trade in trades:

        month = (
            trade.created_at
            .strftime("%Y-%m")
        )

        if month not in monthly_data:

            monthly_data[month] = {
                "profit": 0,
                "trades": 0,
                "wins": 0
            }

        monthly_data[month]["profit"] += trade.profit

        monthly_data[month]["trades"] += 1

        if trade.profit > 0:

            monthly_data[month]["wins"] += 1
        
    return [
    {
        "month": month,

        "profit": round(
            data["profit"],
            2
        ),

        "trades":
        data["trades"],

        "win_rate":
        round(

            (
                data["wins"] /
                data["trades"]
            ) * 100,

            1

        )

    }

    for month, data
    in monthly_data.items()
]


# ─────────────────────────────────────────
#  TRADE IMPORT (from local MT5 sync script)
# ─────────────────────────────────────────
from typing import List
from pydantic import BaseModel

class TradeImport(BaseModel):
    ticket: str
    symbol: str
    order_type: str
    lot_size: float
    open_price: float
    close_price: float
    profit: float
    time: int

@app.post("/trades/import")
def import_trades(
    trades: List[TradeImport],
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_accounts = db.query(Account).filter(
        Account.user_id == current_user["user_id"]
    ).all()

    if not user_accounts:
        raise HTTPException(status_code=404, detail="No account linked")

    account_id = user_accounts[0].id
    imported = 0

    for t in trades:
        existing = db.query(Trade).filter(
            Trade.ticket == t.ticket
        ).first()

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

#------
# change password and delete update
#------
# Change password
@app.post("/auth/change-password")
def change_password(
    payload: dict,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == current_user["user_id"]
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(payload["new_password"])
    db.commit()

    return {"message": "Password updated"}


# Clear all trade data
@app.delete("/data/clear")
def clear_data(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    account_ids = [
        a.id for a in
        db.query(Account).filter(
            Account.user_id == current_user["user_id"]
        ).all()
    ]

    db.query(Trade).filter(
        Trade.account_id.in_(account_ids)
    ).delete(synchronize_session=False)

    db.query(Journal).filter(
        Journal.user_id == current_user["user_id"]
    ).delete(synchronize_session=False)

    db.commit()

    return {"message": "All data cleared"}

## Premium check
@app.get("/auth/me")
def get_me(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == current_user["user_id"]
    ).first()

    return {
        "email": user.email,
        "is_premium": user.is_premium
    }

## AI INSIGHTS
@app.post("/ai/insight")
async def ai_insight(
    payload: dict,
    current_user=Depends(get_current_user)
):
    prompt = payload.get("prompt", "")

    if not prompt:
        raise HTTPException(status_code=400, detail="No prompt provided")

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama3-8b-8192",
                    "max_tokens": 8000,
                    "messages": [{"role": "user", "content": prompt}]
                },
                timeout=30.0
            )
        print(f"Groq status: {res.status_code}")
        print(f"Groq response: {res.text[:500]}")
        data = res.json()
        text = data["choices"][0]["message"]["content"]
        return {"text": text}
    except Exception as e:
        print(f"AI insight error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

##-- deleteaccount info
@app.delete("/auth/delete-account")
def delete_account(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user["user_id"]

    # Delete all journals
    db.query(Journal).filter(
        Journal.user_id == user_id
    ).delete(synchronize_session=False)

    # Delete all trades via accounts
    account_ids = [
        a.id for a in
        db.query(Account).filter(
            Account.user_id == user_id
        ).all()
    ]

    db.query(Trade).filter(
        Trade.account_id.in_(account_ids)
    ).delete(synchronize_session=False)

    # Delete accounts
    db.query(Account).filter(
        Account.user_id == user_id
    ).delete(synchronize_session=False)

    # Delete user
    db.query(User).filter(
        User.id == user_id
    ).delete(synchronize_session=False)

    db.commit()

    return {"message": "Account deleted"}

##world bank api
@app.get("/fundamentals")
async def get_fundamentals(current_user=Depends(get_current_user)):

    country_map = {
        "US": "USD", "XC": "EUR", "GB": "GBP",
        "JP": "JPY", "AU": "AUD", "CA": "CAD",
        "NZ": "NZD", "CH": "CHF", "CN": "CNY"
    }

    country_codes = ";".join(country_map.keys())

    indicators = {
        "gdp_growth":   "NY.GDP.MKTP.KD.ZG",
        "inflation":    "FP.CPI.TOTL.ZG",
        "unemployment": "SL.UEM.TOTL.ZS"
    }

    results = {code: {"code": code} for code in country_map.values()}

    async with httpx.AsyncClient() as client:
        for metric, indicator in indicators.items():
            try:
                res = await client.get(
                    f"https://api.worldbank.org/v2/country/{country_codes}/indicator/{indicator}",
                    params={
                        "format": "json",
                        "mrv": 1,
                        "per_page": 20
                    },
                    timeout=15.0
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
