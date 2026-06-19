from pydantic import BaseModel
from typing import Optional


class GoalCreate(BaseModel):

    target_profit: float
    target_trades: Optional[int] = None