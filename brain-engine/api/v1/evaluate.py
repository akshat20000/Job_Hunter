import os
from fastapi import APIRouter, HTTPException, status
from models.evaluation import EvaluationRequest, EvaluationResult
from brain.ranking.evaluator import Evaluator
from config import settings

router = APIRouter()
evaluator = Evaluator()

def get_master_resume() -> str:
    """Reads the master resume file. Throws 400 if missing or empty."""
    resume_path = settings.resolved_master_resume_path
    if not os.path.exists(resume_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Master resume not found at '{resume_path}'. Please create this file first."
        )
    with open(resume_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Master resume is empty. Please populate brain-engine/resumes/master.md first."
        )
    return content

@router.post("/evaluate", response_model=EvaluationResult)
async def evaluate(request: EvaluationRequest):
    resume_content = request.resume_content.strip() if request.resume_content else ""
    if not resume_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate resume content is required. Please upload your resume first."
        )

    try:
        result = evaluator.evaluate_fit(
            job_title=request.job_title,
            job_description=request.job_description,
            resume_content=resume_content
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to evaluate job fit: {str(e)}"
        )
