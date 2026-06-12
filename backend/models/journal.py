from sqlalchemy import Column
from sqlalchemy import String
from sqlalchemy import Text

from models.user import Base

class Journal(Base):

    __tablename__ = "journals"

    id = Column(
        String,
        primary_key=True
    )

    user_id = Column(
        String
    )

    trade_id = Column(
        String
    )

    emotion = Column(
        String
    )

    lesson = Column(
        Text
    )

    mistake = Column(
        Text
    )

    rating = Column(
        String
    )

    def __init__(self, id, user_id, trade_id, emotion, lesson, mistake, rating):
        self.id = id
        self.user_id = user_id
        self.trade_id = trade_id
        self.emotion = emotion
        self.lesson = lesson
        self.mistake = mistake
        self.rating = rating
    