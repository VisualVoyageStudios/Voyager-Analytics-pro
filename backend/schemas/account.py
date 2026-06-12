from pydantic import BaseModel
from typing import Optional

class AccountCreate(BaseModel):
    account_name: str
    broker: str
    server: Optional[str] = ""
    account_number: Optional[str] = ""
    investor_password: Optional[str] = ""