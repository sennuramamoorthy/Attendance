from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/attendance"

    supabase_url: str = "http://localhost:8000"
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = "super-secret-jwt-token-with-at-least-32-characters-long"

    cors_origins: list[str] = ["http://localhost:3000"]

    qr_token_ttl_seconds: int = 60
    geo_max_distance_meters: int = 15


settings = Settings()
