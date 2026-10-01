from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from models.evaluation import EvaluationResult


client = TestClient(app)

@patch("api.v1.evaluate.evaluator.evaluate_fit")
@patch("api.v1.evaluate.get_master_resume")
def test_evaluate_endpoint(mock_get_resume, mock_evaluate_fit):
    # Mock master resume load
    mock_get_resume.return_value = "Candidate: Senior engineer with Python expertise."
    
    # Mock evaluator return value
    mock_evaluate_fit.return_value = EvaluationResult(
        score=85.0,
        explanation="Candidate's backend experience matches.",
        key_matches=["Python", "Backend"],
        missing_keywords=[]
    )

    response = client.post(
        "/api/v1/evaluate",
        json={
            "job_title": "Python Dev",
            "job_description": "Requires Python expertise",
            "resume_content": "Candidate: Senior engineer with Python expertise."
        }
    )

    assert response.status_code == 200
    json_data = response.json()
    assert json_data["score"] == 85.0
    assert json_data["explanation"] == "Candidate's backend experience matches."
    assert "Python" in json_data["key_matches"]
