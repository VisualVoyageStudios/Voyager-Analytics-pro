from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):

    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True)
    password_hash = Column(String)
    is_premium = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)