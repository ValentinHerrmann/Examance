"""Models package — import all for Alembic autogenerate discovery."""
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.key_envelope import KeyEnvelope
from app.models.mfa_credential import MfaBackupCode, MfaCredential
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher

__all__ = [
    "Teacher",
    "PasswordResetToken",
    "RefreshToken",
    "Exam",
    "Exercise",
    "ExerciseGroup",
    "ExerciseResource",
    "KeyEnvelope",
    "MfaCredential",
    "MfaBackupCode",
    "ExamExercise",
    "ExamMcGroup",
    "StudentIdentity",
    "ScanSubmission",
    "AuditLog",
]
