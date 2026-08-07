<script lang="ts">
  import './OnboardingEmptyState.css';
</script>

<div class="onboarding-empty-state-onboarding-card">
  <div class="onboarding-empty-state-onboarding-icon">🎓</div>
  <h3>Welcome to Examance!</h3>
  <p>You don't have any exams in your workspace yet. Follow these quick steps to get started:</p>

  <div class="onboarding-empty-state-onboarding-steps">
    <div class="onboarding-empty-state-step-item">
      <span class="onboarding-empty-state-step-num">1</span>
      <div class="onboarding-empty-state-step-text">
        <strong>Create an Exam</strong>
        <p>Configure LaTeX template, total points, and grade thresholds.</p>
      </div>
    </div>

    <div class="onboarding-empty-state-step-item">
      <span class="onboarding-empty-state-step-num">2</span>
      <div class="onboarding-empty-state-step-text">
        <strong>Link Exercises</strong>
        <p>Add questions from your Exercise Library or create new ones.</p>
      </div>
    </div>

    <div class="onboarding-empty-state-step-item">
      <span class="onboarding-empty-state-step-num">3</span>
      <div class="onboarding-empty-state-step-text">
        <strong>Scan & Grade</strong>
        <p>Upload student PDFs, anonymously score, and review analytics.</p>
      </div>
    </div>
  </div>

  <div class="onboarding-empty-state-onboarding-actions">
    <a href="/exam/new" class="onboarding-empty-state-create-btn">+ Create First Exam</a>
    <label for="importFile" class="onboarding-empty-state-import-btn">Or Import .bgproj Archive</label>
  </div>
</div>
