import os
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from brain.resume.tailor import ResumeTailor
from brain.coverletter.generator import CoverLetterGenerator
from brain.pdf.compiler import PDFCompiler
from api.v1.evaluate import get_master_resume

router = APIRouter()

class GenerateArtifactsRequest(BaseModel):
    job_title: str
    company_name: str
    job_description: str
    resume_content: Optional[str] = None
    output_dir: Optional[str] = None

class GenerateArtifactsResponse(BaseModel):
    resume_pdf_path: str
    cover_letter_pdf_path: str
    tailored_resume_markdown: str
    cover_letter_markdown: str

tailor = ResumeTailor()
generator = CoverLetterGenerator()

@router.post("/generate-artifacts", response_model=GenerateArtifactsResponse)
async def generate_artifacts(request: GenerateArtifactsRequest):
    resume_content = request.resume_content.strip() if request.resume_content else ""
    if not resume_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate resume content is required to generate artifacts. Please upload your resume first."
        )

    output_dir = request.output_dir
    if not output_dir:
        # Default fallback to folder at brain-engine workspace level
        output_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "storage"
        )

    os.makedirs(output_dir, exist_ok=True)

    try:
        # 1. Tailor the resume
        tailored_res = tailor.tailor_resume(
            job_title=request.job_title,
            job_description=request.job_description,
            resume_content=resume_content
        )

        # 2. Generate cover letter from the tailored resume content
        cover_letter_res = generator.generate_cover_letter(
            job_title=request.job_title,
            company_name=request.company_name,
            job_description=request.job_description,
            resume_content=tailored_res.tailored_resume_markdown
        )

        # 3. Formulate slugs and random tokens for filenames
        job_slug = "".join([c if c.isalnum() else "_" for c in request.job_title.lower()])[:20]
        comp_slug = "".join([c if c.isalnum() else "_" for c in request.company_name.lower()])[:20]
        uid = str(uuid.uuid4())[:8]

        resume_pdf_name = f"resume_{comp_slug}_{job_slug}_{uid}.pdf"
        cl_pdf_name = f"cover_letter_{comp_slug}_{job_slug}_{uid}.pdf"

        resume_pdf_path = os.path.join(output_dir, resume_pdf_name)
        cl_pdf_path = os.path.join(output_dir, cl_pdf_name)

        # 4. Compile PDFs
        compiler_resume = PDFCompiler()
        compiler_resume.compile_markdown_to_pdf(tailored_res.tailored_resume_markdown, resume_pdf_path)

        compiler_cl = PDFCompiler()
        compiler_cl.compile_markdown_to_pdf(cover_letter_res.cover_letter_markdown, cl_pdf_path)

        return GenerateArtifactsResponse(
            resume_pdf_path=os.path.abspath(resume_pdf_path),
            cover_letter_pdf_path=os.path.abspath(cl_pdf_path),
            tailored_resume_markdown=tailored_res.tailored_resume_markdown,
            cover_letter_markdown=cover_letter_res.cover_letter_markdown
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate tailored application PDFs: {str(e)}"
        )
