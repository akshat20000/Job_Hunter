import time
from groq import Groq
from config import settings
from models.profile import CoverLetterResponse

class CoverLetterGenerator:
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)

    def generate_cover_letter(self, job_title: str, company_name: str, job_description: str, resume_content: str) -> CoverLetterResponse:
        """Generates a professional cover letter tailored to a company and job description using Groq."""
        max_retries = 5
        base_delay = 2.0

        system_prompt = (
            "You are an expert cover letter writing agent. "
            "Write a concise, professional cover letter matching the candidate's resume to the job description. "
            "Ensure you address the key requirements of the job. "
            "DO NOT invent details or metrics that do not exist in the candidate's profile. "
            "Format the output as clean markdown. "
            "Return ONLY the markdown text. Do not include chat intro or outro messages."
        )

        user_content = (
            f"Target Company: {company_name}\n"
            f"Job Title: {job_title}\n\n"
            f"Job Description:\n{job_description}\n\n"
            f"Candidate Resume:\n{resume_content}"
        )

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
                cover_letter_md = response.choices[0].message.content
                return CoverLetterResponse(cover_letter_markdown=cover_letter_md)
            except Exception as e:
                err_str = str(e).lower()
                is_rate_limit = "429" in err_str or "rate limit" in err_str or "rate_limit_exceeded" in err_str
                
                if attempt < max_retries - 1:
                    sleep_time = (base_delay * (2 ** attempt)) if is_rate_limit else base_delay
                    time.sleep(sleep_time)
                    continue
                raise e
