import time
from groq import Groq
from config import settings
from models.profile import TailorResponse

class ResumeTailor:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)

    def tailor_resume(self, job_title: str, job_description: str, resume_content: str) -> TailorResponse:
        """Tailors a candidate's master resume to a job description using Groq."""
        max_retries = 5
        base_delay = 2.0

        system_prompt = (
            "You are an expert resume optimization agent. "
            "Tailor the candidate's master resume to fit the job description. "
            "Follow these absolute guidelines:\n"
            "1. Focus on highlighting matching experiences, tools, and skills.\n"
            "2. DO NOT invent, fabricate, or falsify any details, jobs, technologies, dates, or degrees.\n"
            "3. Structure the output as clean, compile-ready markdown.\n"
            "4. Return ONLY the markdown. Do not include chat intro or outro messages (e.g. 'Here is your tailored resume')."
        )

        user_content = f"Job Title: {job_title}\n\nJob Description:\n{job_description}\n\nMaster Resume:\n{resume_content}"

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
                    temperature=0.3,
                )
                tailored_md = response.choices[0].message.content
                return TailorResponse(tailored_resume_markdown=tailored_md)
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = "429" in err_str or "rate limit" in err_str or "rate_limit_exceeded" in err_str
                
                if attempt < max_retries - 1:
                    sleep_time = (base_delay * (2 ** attempt)) if is_rate_limit else base_delay
                    time.sleep(sleep_time)
                    continue
                raise e
