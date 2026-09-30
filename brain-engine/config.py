import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "qwen/qwen3.8-27b"
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    SEMANTIC_PREFILTER_THRESHOLD: float = 0.30

    MASTER_RESUME_PATH: str = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "resumes",
        "master.md"
    )
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instantiate settings
settings = Settings()
