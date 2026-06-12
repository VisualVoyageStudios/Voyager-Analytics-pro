from pydantic import BaseModel


class TradeCreate(BaseModel):

    account_id:str

    symbol:str

    order_type:str

    lot_size:float

    open_price:float

    close_price:float

    profit:float