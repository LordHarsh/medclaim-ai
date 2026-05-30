"""
LLM Provider Configuration.

Supports switching between Anthropic (Claude) and Google (Gemini).
Use LLM_PROVIDER_OVERRIDE env var to force all tasks to one provider.
"""

import os
from functools import lru_cache
from typing import Literal

from dotenv import load_dotenv

load_dotenv()

# Model IDs can be overridden from env without code changes.
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-3.1-pro-preview")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-3.0-flash")

# Task-to-provider mapping
LLM_CONFIG = {
    "vision": {
        "provider": "gemini",
        "model": VISION_MODEL,
    },
    "text_classification": {
        "provider": "anthropic",
        "model": CLAUDE_MODEL,
    },
    "message_generation": {
        "provider": "anthropic",
        "model": CLAUDE_MODEL,
    },
}

# Override ALL tasks to use a single provider
LLM_PROVIDER_OVERRIDE = os.getenv("LLM_PROVIDER_OVERRIDE")  # "anthropic" or "gemini"

OVERRIDE_MODELS = {
    "anthropic": CLAUDE_MODEL,
    "gemini": GEMINI_FAST_MODEL,
}


def get_llm_config(task: Literal["vision", "text_classification", "message_generation"]) -> dict:
    """Get provider/model config for a given task."""
    if LLM_PROVIDER_OVERRIDE and LLM_PROVIDER_OVERRIDE in OVERRIDE_MODELS:
        return {
            "provider": LLM_PROVIDER_OVERRIDE,
            "model": OVERRIDE_MODELS[LLM_PROVIDER_OVERRIDE],
        }
    return LLM_CONFIG[task]


@lru_cache(maxsize=4)
def get_llm(task: Literal["vision", "text_classification", "message_generation"]):
    """
    Get a LangChain chat model instance for the given task.
    Cached per task to reuse connections.
    """
    config = get_llm_config(task)
    provider = config["provider"]
    model = config["model"]

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model,
            api_key=os.getenv("ANTHROPIC_API_KEY"),
            timeout=30.0,
            max_retries=1,
        )
    elif provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=os.getenv("GEMINI_API_KEY"),
            timeout=30,
            max_retries=1,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


# AWS / DB config
DATABASE_URL = os.getenv("DATABASE_URL")
AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "medclaim-docs-prod")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")

# LangSmith
LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", "true").lower() == "true"
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "MedClaim.AI")
LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY")
LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT")

# Logfire
LOGFIRE_TOKEN = os.getenv("LOGFIRE_WRITE_TOKEN") or os.getenv("LOGFIRE_TOKEN")
LOGFIRE_SERVICE_NAME = os.getenv("LOGFIRE_SERVICE_NAME", "medclaim-worker")
LOGFIRE_ENVIRONMENT = os.getenv("LOGFIRE_ENV", os.getenv("ENV", "production"))
LOGFIRE_SERVICE_VERSION = os.getenv("GIT_SHA", "local")
