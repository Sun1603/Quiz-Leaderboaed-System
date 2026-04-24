/* ============================================
   Quiz Leaderboard — Client Application
   ============================================ */

// DOM Elements
const inputSection = document.getElementById('inputSection');
const progressSection = document.getElementById('progressSection');
const logSection = document.getElementById('logSection');
const leaderboardSection = document.getElementById('leaderboardSection');
const resultSection = document.getElementById('resultSection');
const statusBadge = document.getElementById('statusBadge');
const regNoInput = document.getElementById('regNo');
const startBtn = document.getElementById('startBtn');
const pollGrid = document.getElementById('pollGrid');
const pollCounter = document.getElementById('pollCounter');
const progressBar = document.getElementById('progressBar');
const logContainer = document.getElementById('logContainer');
const leaderboardBody = document.getElementById('leaderboardBody');

// Avatar colors for participants
const avatarColors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
    '#10b981', '#3b82f6', '#14b8a6', '#f97316', '#a855f7',
    '#06b6d4', '#84cc16', '#e11d48', '#7c3aed', '#0ea5e9'
];

let eventSource = null;

// Initialize poll grid
function initPollGrid() {
    pollGrid.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const indicator = document.createElement('div');
        indicator.className = 'poll-indicator';
        indicator.id = `poll-${i}`;
        indicator.textContent = i;
        pollGrid.appendChild(indicator);
    }
}

// Add log entry
function addLog(type, text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const time = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const badgeClass = type === 'error' ? 'error' :
                       type === 'warning' ? 'warning' :
                       type === 'success' ? 'success' : 'info';

    entry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-badge ${badgeClass}">${type}</span>
        <span class="log-text">${text}</span>
    `;

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Update status badge
function setStatus(text, active = false) {
    const dot = statusBadge.querySelector('.badge-dot');
    statusBadge.childNodes[statusBadge.childNodes.length - 1].textContent = ` ${text}`;
    if (active) {
        dot.classList.add('active');
    } else {
        dot.classList.remove('active');
    }
}

// Get initials from name
function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Animate counter
function animateValue(elementId, start, end, duration = 600) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const range = end - start;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
        const current = Math.round(start + range * eased);
        el.textContent = current.toLocaleString();
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// Build leaderboard table
function buildLeaderboard(leaderboard) {
    leaderboardBody.innerHTML = '';
    leaderboard.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.style.animationDelay = `${index * 0.08}s`;

        const rank = index + 1;
        const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
        const color = avatarColors[index % avatarColors.length];
        const initials = getInitials(entry.participant);

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${rank}</span></td>
            <td>
                <div class="participant-name">
                    <div class="participant-avatar" style="background: ${color}">${initials}</div>
                    ${entry.participant}
                </div>
            </td>
            <td>${entry.totalScore.toLocaleString()}</td>
        `;

        leaderboardBody.appendChild(row);
    });
}

// Show result
function showResult(result) {
    const resultCard = document.getElementById('resultCard');
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    const resultDetails = document.getElementById('resultDetails');

    const isCorrect = result.isCorrect;

    resultCard.className = `card result-card ${isCorrect ? 'success' : 'error'}`;
    resultIcon.textContent = isCorrect ? '✓' : '✗';
    resultTitle.textContent = isCorrect ? 'Submission Successful!' : 'Submission Failed';
    resultMessage.textContent = result.message || (isCorrect ? 'Your leaderboard is correct!' : 'The scores do not match.');

    resultDetails.innerHTML = `
        <div class="result-detail-item">
            <div class="label">Submitted Total</div>
            <div class="value ${isCorrect ? 'match' : 'mismatch'}">${result.submittedTotal ?? '—'}</div>
        </div>
        <div class="result-detail-item">
            <div class="label">Expected Total</div>
            <div class="value match">1000</div>
        </div>
        <div class="result-detail-item">
            <div class="label">Idempotent</div>
            <div class="value ${result.isIdempotent ? 'match' : 'mismatch'}">${result.isIdempotent ? 'Yes' : 'No'}</div>
        </div>
    `;

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Main: Start quiz polling
async function startQuiz() {
    const regNo = regNoInput.value.trim();
    if (!regNo) {
        regNoInput.focus();
        regNoInput.style.borderColor = 'var(--error)';
        setTimeout(() => { regNoInput.style.borderColor = ''; }, 2000);
        return;
    }

    // Disable button
    startBtn.disabled = true;
    startBtn.innerHTML = `
        <svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>
        Processing...
    `;

    // Show sections
    initPollGrid();
    progressSection.classList.remove('hidden');
    logSection.classList.remove('hidden');
    leaderboardSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    logContainer.innerHTML = '';

    setStatus('Polling...', true);
    addLog('info', `Starting quiz for <strong>${regNo}</strong>`);

    let totalRawEvents = 0;

    // Connect to SSE stream
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/stream');

    eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);

        switch (data.type) {
            case 'poll_start': {
                const indicator = document.getElementById(`poll-${data.poll}`);
                if (indicator) indicator.className = 'poll-indicator active';
                addLog('info', `Polling <strong>#${data.poll}</strong>...`);
                break;
            }

            case 'poll_complete': {
                const indicator = document.getElementById(`poll-${data.poll}`);
                if (indicator) indicator.className = 'poll-indicator done';
                const completed = data.poll + 1;
                pollCounter.textContent = `${completed} / 10`;
                progressBar.style.width = `${completed * 10}%`;
                totalRawEvents += data.eventCount;
                animateValue('totalEventsValue', 0, totalRawEvents);
                addLog('success', `Poll <strong>#${data.poll}</strong> returned <strong>${data.eventCount}</strong> events (Set: ${data.setId || 'N/A'})`);
                break;
            }

            case 'poll_error': {
                const indicator = document.getElementById(`poll-${data.poll}`);
                if (indicator) indicator.className = 'poll-indicator error';
                addLog('error', `Poll <strong>#${data.poll}</strong> failed: ${data.error}`);
                break;
            }

            case 'waiting': {
                addLog('info', `Waiting <strong>5s</strong> before poll <strong>#${data.nextPoll}</strong>...`);
                break;
            }

            case 'dedup_complete': {
                animateValue('totalEventsValue', 0, data.totalRaw);
                animateValue('uniqueEventsValue', 0, data.unique);
                animateValue('duplicatesValue', 0, data.duplicates);
                addLog('warning', `Deduplication: <strong>${data.duplicates}</strong> duplicates removed out of <strong>${data.totalRaw}</strong> total events`);
                break;
            }

            case 'leaderboard_ready': {
                animateValue('totalScoreValue', 0, data.totalScore);
                buildLeaderboard(data.leaderboard);
                leaderboardSection.classList.remove('hidden');
                addLog('success', `Leaderboard ready: <strong>${data.leaderboard.length}</strong> participants, total score: <strong>${data.totalScore}</strong>`);
                break;
            }

            case 'submitting': {
                setStatus('Submitting...', true);
                addLog('info', 'Submitting leaderboard to validator...');
                break;
            }

            case 'submit_result': {
                setStatus(data.result.isCorrect ? 'Correct ✓' : 'Incorrect ✗', false);
                addLog(
                    data.result.isCorrect ? 'success' : 'error',
                    `<strong>${data.result.message || 'Submission complete'}</strong> — Submitted: ${data.result.submittedTotal}, Expected: ${data.result.expectedTotal}`
                );
                showResult(data.result);
                startBtn.disabled = false;
                startBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Start Polling
                `;
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                break;
            }

            case 'error': {
                setStatus('Error', false);
                addLog('error', data.message);
                startBtn.disabled = false;
                startBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Start Polling
                `;
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                break;
            }
        }
    };

    // Trigger the backend process
    try {
        const response = await fetch(`/api/run?regNo=${encodeURIComponent(regNo)}`);
        const result = await response.json();

        if (result.error) {
            addLog('error', result.error);
            setStatus('Error', false);
        }
    } catch (err) {
        addLog('error', `Network error: ${err.message}`);
        setStatus('Error', false);
    }
}

// Reset app
function resetApp() {
    inputSection.scrollIntoView({ behavior: 'smooth' });
    progressSection.classList.add('hidden');
    logSection.classList.add('hidden');
    leaderboardSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    setStatus('Ready', false);
    startBtn.disabled = false;
    startBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Start Polling
    `;
    document.getElementById('totalEventsValue').textContent = '0';
    document.getElementById('uniqueEventsValue').textContent = '0';
    document.getElementById('duplicatesValue').textContent = '0';
    document.getElementById('totalScoreValue').textContent = '—';
}

// Enter key support
regNoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startQuiz();
});
