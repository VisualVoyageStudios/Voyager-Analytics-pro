from pydantic import BaseModel

class JournalCreate(BaseModel):

    trade_id: str

    emotion: str

    lesson: str

    mistake: str

    rating: str