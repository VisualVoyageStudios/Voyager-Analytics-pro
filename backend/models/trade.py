from sqlalchemy import Column
from sqlalchemy import String
from sqlalchemy import Float
from sqlalchemy import DateTime

from datetime import datetime

from models.user import Base


class Trade(Base):

    __tablename__ = "trades"

    id = Column(
        String,
        primary_key=True
    )

    account_id = Column(
        String,
        nullable=False
    )

    symbol = Column(
        String,
        nullable=False
    )

    order_type = Column(
        String,
        nullable=False
    )

    lot_size = Column(
        Float,
        nullable=False
    )

    open_price = Column(
        Float,
        nullable=False
    )

    close_price = Column(
        Float,
        nullable=False
    )

    profit = Column(
        Float,
        nullable=False
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    ticket = Column(
        String,
        unique=True,
        nullable=True
    )