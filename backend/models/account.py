from sqlalchemy import Column
from sqlalchemy import String
from sqlalchemy import DateTime

from datetime import datetime

from models.user import Base

class Account(Base):

    __tablename__ = "accounts"

    id = Column(
        String,
        primary_key=True
    )

    user_id = Column(
        String,
        nullable=False
    )

    broker = Column(
        String,
        nullable=False
    )

    account_number = Column(
        String,
        nullable=False
    )

    server = Column(
        String,
        nullable=False
    )

    investor_password = Column(
        String,
        nullable=False
    )

    status = Column(
        String,
        default="connected"
    )

    last_sync = Column(
        DateTime,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )