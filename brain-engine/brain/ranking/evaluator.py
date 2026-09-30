import json
import time
from groq import Groq
from config import settings
from models.evaluation import EvaluationResult
from brain.embedding.embedder import Embedder

class Evaluator:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.embedder = Embedder()

    def evaluate_fit(self, job_title: str, job_description: str, resume_content: str) -> EvaluationResult:
        """Evaluates how well a candidate's resume matches a job description.

        Runs a cheap local MiniLM cosine-similarity pass first. Jobs that are
        obviously unrelated to the resume are rejected here without spending a
        Groq call. Anything that clears the bar goes on to the full LLM grading
        for a real score and explanation.
        """
        similarity = self.embedder.cosine_similarity(
            self.embedder.embed_text(f"{job_title}\n{job_description}"),
            self.embedder.embed_text(resume_content),
        )

        if similarity < settings.SEMANTIC_PREFILTER_THRESHOLD:
            return EvaluationResult(
                score=0.0,
                explanation=(
                    f"Rejected by semantic pre-filter (cosine similarity {similarity:.2f} "
                    f"is below threshold {settings.SEMANTIC_PREFILTER_THRESHOLD}). "
                    "Job description appears unrelated to the resume; skipped LLM grading."
                ),
                key_matches=[],
                missing_keywords=[],
            )
        max_retries = 5
        base_delay = 2.0

        system_prompt = (
            "You are an expert tech recruiter and talent assessor. "
            "Analyze the candidate's resume and the job description to grade fit. "
            "You must return a JSON object with the following schema:\n"
            "{\n"
            '  "score": 85.0,\n'
            '  "explanation": "Detailed explanation of why...",\n'
            '  "key_matches": ["skill 1", "experience 2"],\n'
            '  "missing_keywords": ["keyword 1", "certification 2"]\n'
            "}\n"
            "The score must be a number between 0 and 100. Return ONLY the valid JSON object."
        )

        user_content = f"Job Title: {job_title}\n\nJob Description:\n{job_description}\n\nCandidate Resume:\n{resume_content}"

        model = settings.GROQ_MODEL
        if "llama" in model.lower():
            model = "qwen/qwen3.8-27b"

        for attempt in range(max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                raw_content = response.choices[0].message.content
                data = json.loads(raw_content)
                
                return EvaluationResult(
                    score=float(data.get("score", 0.0)),
                    explanation=data.get("explanation", ""),
                    key_matches=data.get("key_matches", []),
                    missing_keywords=data.get("missing_keywords", [])
                )
            except Exception as e:
                # Retry on rate limits or API transient failures
                err_str = str(e).lower()
                is_rate_limit = "429" in err_str or "rate limit" in err_str or "rate_limit_exceeded" in err_str
                
                if attempt < max_retries - 1:
                    sleep_time = (base_delay * (2 ** attempt)) if is_rate_limit else base_delay
                    time.sleep(sleep_time)
                    continue
                
                # If we exhausted retries, raise the error or return a fallback fail score
                raise e
