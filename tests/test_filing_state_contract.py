from pathlib import Path
import pytest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "content" / "filing_order.js").read_text()


def restore_state(payload):
    """Small reference model for the JS migration contract."""
    history = [x for x in payload.get("history", []) if isinstance(x, dict) and {"questionId", "chosen", "correct", "ok"} <= x.keys()]
    current = payload.get("current")
    if not isinstance(current, dict) or not current.get("questionId"):
        return None, history
    answered = current.get("answered")
    matching = any(
        x["questionId"] == current["questionId"]
        and x["chosen"] == answered
        and x["correct"] == current["correct"]
        and x["ok"] == (answered == current["correct"])
        for x in history
    )
    if payload.get("schema") != 2 or (answered is not None and not matching):
        current = {**current, "answered": None}
    return current, history


def test_filing_state_is_versioned_and_scoped_to_its_own_keys():
    assert "tdt-skills-filing-v2" in SOURCE
    assert "tdt-skills-filing-v1" in SOURCE
    assert "schema:SCHEMA" in SOURCE
    assert "localStorage.getItem(key)" in SOURCE
    assert "for(const key of [KEY,LEGACY_KEY])" in SOURCE


def test_refresh_validation_covers_unanswered_answered_and_missing_fields():
    assert "validCurrent(h.current)" in SOURCE
    assert "q.answered===null" in SOURCE
    assert "q.questionId===questionId(q)" in SOURCE
    assert "current.answered=null" in SOURCE
    assert "history=validHistory(h.history)" in SOURCE
    assert "else current=null" in SOURCE
    assert "x.questionId===current.questionId" in SOURCE
    assert "x.chosen===current.answered" in SOURCE


def test_answer_feedback_and_correctness_are_rendered_from_validated_state():
    assert "f.hidden=current.answered===null" in SOURCE
    assert "ok?'Correct.':'Not quite.'" in SOURCE
    assert "current.rows[current.correct]" in SOURCE
    assert "current.rows[current.answered]" in SOURCE
    assert "history.push({questionId:current.questionId" in SOURCE
    assert "if(cls)b.classList.add(cls)" in SOURCE
    assert "classList.add(Number(b.dataset.choice)" not in SOURCE


@pytest.mark.parametrize(
    ("payload", "expected_answered", "expected_history"),
    [
        ({"schema": 2, "current": {"questionId": "q", "answered": None, "correct": 1}, "history": []}, None, 0),
        ({"schema": 2, "current": {"questionId": "q", "answered": 1, "correct": 1}, "history": [{"questionId": "q", "chosen": 1, "correct": 1, "ok": True}]}, 1, 1),
        ({"schema": 1, "current": {"questionId": "q", "answered": 1, "correct": 1}, "history": [{"questionId": "old", "chosen": 0, "correct": 0, "ok": True}]}, None, 1),
        ({"schema": 2, "current": {"answered": 1, "correct": 1}, "history": [{"questionId": "q", "chosen": 1, "correct": 1, "ok": True}]}, None, 1),
        ({"schema": 2, "current": {"questionId": "q", "answered": 0, "correct": 1}, "history": [{"questionId": "q", "chosen": 0, "correct": 1, "ok": False}]}, 0, 1),
    ],
)
def test_refresh_migration_matrix(payload, expected_answered, expected_history):
    current, history = restore_state(payload)
    assert (current or {}).get("answered") is expected_answered
    assert len(history) == expected_history
