"""Models package — import all for Alembic autogenerate discovery."""
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.models.exercise_contribution import ExerciseContribution, ExerciseContributionResource
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.exercise_score import ExerciseScore
from app.models.key_envelope import KeyEnvelope
from app.models.logo import ExamLogo, TeacherLogo
from app.models.mfa_credential import MfaBackupCode, MfaCredential
from app.models.omr_training_sample import OmrTrainingSample
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.registration_request import RegistrationRequest
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.models.webauthn_credential import WebAuthnCredential

__all__ = [
    "Teacher",
    "PasswordResetToken",
    "RegistrationRequest",
    "AccountDeletionRequest",
    "AllowedEmailDomain",
    "RefreshToken",
    "Exam",
    "Exercise",
    "ExerciseGroup",
    "ExerciseContribution",
    "ExerciseContributionResource",
    "ExerciseResource",
    "ExerciseScore",
    "KeyEnvelope",
    "TeacherLogo",
    "ExamLogo",
    "MfaCredential",
    "MfaBackupCode",
    "ExamExercise",
    "ExamMcGroup",
    "StudentIdentity",
    "ScanSubmission",
    "AuditLog",
    "WebAuthnCredential",
    "OmrTrainingSample",
]
