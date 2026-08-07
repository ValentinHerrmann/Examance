<div class="onboarding-card">
  <div class="onboarding-icon">🎓</div>
  <h3>Welcome to Examance!</h3>
  <p>You don't have any exams in your workspace yet. Follow these quick steps to get started:</p>

  <div class="onboarding-steps">
    <div class="step-item">
      <span class="step-num">1</span>
      <div class="step-text">
        <strong>Create an Exam</strong>
        <p>Configure LaTeX template, total points, and grade thresholds.</p>
      </div>
    </div>

    <div class="step-item">
      <span class="step-num">2</span>
      <div class="step-text">
        <strong>Link Exercises</strong>
        <p>Add questions from your Exercise Library or create new ones.</p>
      </div>
    </div>

    <div class="step-item">
      <span class="step-num">3</span>
      <div class="step-text">
        <strong>Scan & Grade</strong>
        <p>Upload student PDFs, anonymously score, and review analytics.</p>
      </div>
    </div>
  </div>

  <div class="onboarding-actions">
    <a href="/exam/new" class="create-btn">+ Create First Exam</a>
    <label for="importFile" class="import-btn">Or Import .bgproj Archive</label>
  </div>
</div>

<style>
  .onboarding-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 2.5rem 2rem;
    text-align: center;
    max-width: 680px;
    margin: 2rem auto;
  }

  .onboarding-icon {
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  .onboarding-card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #38bdf8;
  }

  .onboarding-card p {
    color: #cbd5e1;
    font-size: 0.95rem;
    margin-bottom: 2rem;
  }

  .onboarding-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
    text-align: left;
  }

  .step-item {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .step-num {
    width: 28px;
    height: 28px;
    background: #0284c7;
    color: white;
    font-weight: 700;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
  }

  .step-text strong {
    color: #f8fafc;
    font-size: 0.9rem;
    display: block;
    margin-bottom: 0.25rem;
  }

  .step-text p {
    margin: 0;
    font-size: 0.8rem;
    color: #94a3b8;
    line-height: 1.35;
  }

  .onboarding-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .create-btn {
    padding: 0.625rem 1.25rem;
    background: #0284c7;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }

  .create-btn:hover {
    background: #0369a1;
  }

  .import-btn {
    padding: 0.625rem 1.25rem;
    background: #334155;
    color: white;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .import-btn:hover {
    background: #475569;
  }
</style>
