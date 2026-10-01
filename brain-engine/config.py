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

    @property
    def resolved_master_resume_path(self) -> str:
        candidates = [
            self.MASTER_RESUME_PATH,
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "brain-engine", "resumes", "master.md"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "resumes", "master.md"),
            "/usr/src/app/brain-engine/resumes/master.md",
            "/usr/src/app/resumes/master.md",
        ]
        for c in candidates:
            if os.path.exists(c):
                return c
        return self.MASTER_RESUME_PATH

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instantiate settings
settings = Settings()
