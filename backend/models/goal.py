from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime

from models.user import Base


class Goal(Base):

    __tablename__ = "goals"

    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    month = Column(String, nullable=False)  # format: YYYY-MM
    target_profit = Column(Float, nullable=False)
    target_trades = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)