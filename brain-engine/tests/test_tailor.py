import os
import tempfile
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from models.profile import TailorResponse, CoverLetterResponse

client = TestClient(app)

@patch("api.v1.generate.tailor.tailor_resume")
@patch("api.v1.generate.generator.generate_cover_letter")
@patch("api.v1.generate.get_master_resume")
def test_generate_artifacts_endpoint(mock_get_resume, mock_gen_cl, mock_tailor_res):
    mock_get_resume.return_value = "Candidate Resume"
    mock_tailor_res.return_value = TailorResponse(tailored_resume_markdown="# Tailored Resume Content")
    mock_gen_cl.return_value = CoverLetterResponse(cover_letter_markdown="# Cover Letter Content")

    with tempfile.TemporaryDirectory() as tmp_dir:
        response = client.post(
            "/api/v1/generate-artifacts",
            json={
                "job_title": "React Engineer",
                "company_name": "Vercel",
                "job_description": "Build modern React frontends",
                "resume_content": "Candidate Resume",
                "output_dir": tmp_dir
            }
        )

        assert response.status_code == 200
        json_data = response.json()
        assert "resume_pdf_path" in json_data
        assert "cover_letter_pdf_path" in json_data
        assert json_data["tailored_resume_markdown"] == "# Tailored Resume Content"
        assert json_data["cover_letter_markdown"] == "# Cover Letter Content"

        # Verify compiler generated the physical PDF files in the temp folder
        assert os.path.exists(json_data["resume_pdf_path"])
        assert os.path.exists(json_data["cover_letter_pdf_path"])
