from fastapi import APIRouter

from app.providers import list_provider_info
from app.schemas.provider import ProviderInfo

router = APIRouter()


@router.get("", response_model=list[ProviderInfo])
async def list_providers() -> list[ProviderInfo]:
    return await list_provider_info()
