// ─── Auth ──────────────────────────────────────────────────
const userToken = localStorage.getItem('user_token');

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
    };
}

function logout() {
    localStorage.removeItem('user_token');
    window.location.href = '/login';
}

// ─── State ─────────────────────────────────────────────────
const state = {
    currentScreen: 'landing',
    currentTask: null,
    sessionId: null,
    topicInfo: null,

    // Timers
    prepTimer: null,
    prepTimeLeft: 0,
    examTimer: null,
    examTimeLeft: 0,
    examTotalTime: 0,

    // Speech
    recognition: null,
    isRecording: false,
    isSpeaking: false,
    speechSynthesis: window.speechSynthesis,
    frenchVoice: null,

    // Flags
    isWaitingForAI: false,
    autoSpeak: true,
    isExamPaused: false,
    timerStarted: false,
    deferTimerUntilOpening: false
};

// ─── Initialize ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Verify user is authenticated
    if (!userToken) {
        window.location.href = '/login';
        return;
    }

    try {
        const res = await fetch('/api/auth/verify', {
            headers: { 'Authorization': `Bearer ${userToken}` }
        });
        const data = await res.json();
        if (!data.valid || data.role !== 'user') {
            logout();
            return;
        }
    } catch {
        logout();
        return;
    }

    checkHealth();
    initSpeechRecognition();
    loadFrenchVoice();
    updateThemeIcon();

    // Periodically check health
    setInterval(checkHealth, 30000);
});

// ─── Health Check ──────────────────────────────────────────
async function checkHealth() {
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');

    try {
        const res = await fetch('/api/health');
        const data = await res.json();

        if (data.ollama === 'connected') {
            statusBar.className = 'status-bar connected';
            statusText.textContent = '';
        } else {
            statusBar.className = 'status-bar error';
            statusText.textContent = '';
        }
    } catch {
        statusBar.className = 'status-bar error';
        statusText.textContent = '';
    }
}

// ─── Speech Recognition Setup ──────────────────────────────
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported in this browser');
        document.getElementById('btn-mic').style.opacity = '0.5';
        document.getElementById('btn-mic').title = 'Speech Recognition not supported - use Chrome';
        return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.lang = 'fr-CA';          // Canadian French for TCF Canada
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.maxAlternatives = 3;     // More alternatives = better accuracy

    let finalTranscript = '';
    let silenceTimeout = null;
    let restartAttempts = 0;
    state.isFirstStart = true;
    const MAX_RESTART_ATTEMPTS = 5;

    state.recognition.onstart = () => {
        state.isRecording = true;
        document.getElementById('btn-mic').classList.add('recording');
        document.getElementById('speech-waves').classList.add('active');
        document.getElementById('speech-status-text').textContent = '🎙️ Listening... speak in French';

        // Only reset transcript on a fresh start (not on auto-restart)
        if (state.isFirstStart) {
            finalTranscript = '';
            state.isFirstStart = false;
        }
        restartAttempts = 0;
    };

    state.recognition.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                // Pick the highest-confidence alternative
                let bestTranscript = event.results[i][0].transcript;
                let bestConfidence = event.results[i][0].confidence;

                for (let alt = 1; alt < event.results[i].length; alt++) {
                    if (event.results[i][alt].confidence > bestConfidence) {
                        bestConfidence = event.results[i][alt].confidence;
                        bestTranscript = event.results[i][alt].transcript;
                    }
                }

                // Only accept results with reasonable confidence
                if (bestConfidence >= 0.4) {
                    finalTranscript += bestTranscript + ' ';

                    // Show confidence indicator to user
                    const pct = Math.round(bestConfidence * 100);
                    const icon = pct >= 80 ? '🟢' : pct >= 60 ? '🟡' : '🟠';
                    document.getElementById('speech-status-text').textContent =
                        `${icon} Confidence: ${pct}% — keep speaking`;
                } else {
                    // Low confidence — warn user
                    document.getElementById('speech-status-text').textContent =
                        '⚠️ Low confidence — speak louder and closer to the mic';
                }
            } else {
                // For interim results, pick the best alternative too
                let bestInterim = event.results[i][0].transcript;
                let bestConf = event.results[i][0].confidence || 0;
                for (let alt = 1; alt < event.results[i].length; alt++) {
                    if ((event.results[i][alt].confidence || 0) > bestConf) {
                        bestConf = event.results[i][alt].confidence || 0;
                        bestInterim = event.results[i][alt].transcript;
                    }
                }
                interimTranscript = bestInterim;
            }
        }

        const textInput = document.getElementById('text-input');
        textInput.value = finalTranscript + interimTranscript;
        autoResize(textInput);

        // Reset silence timeout
        clearTimeout(silenceTimeout);
        silenceTimeout = setTimeout(() => {
            document.getElementById('speech-status-text').textContent =
                '🔇 Silence detected... click mic to stop or keep speaking';
        }, 3000);
    };

    state.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);

        if (event.error === 'not-allowed') {
            document.getElementById('speech-status-text').textContent =
                '⚠️ Microphone access denied. Please allow microphone access.';
            stopRecording();
        } else if (event.error === 'no-speech') {
            // No speech detected — don't kill the session, just notify
            document.getElementById('speech-status-text').textContent =
                '🎙️ No speech detected — try speaking louder or closer to mic';
            // The onend handler will auto-restart
        } else if (event.error === 'network') {
            document.getElementById('speech-status-text').textContent =
                '⚠️ Network issue — check your internet connection';
            stopRecording();
        } else if (event.error !== 'aborted') {
            document.getElementById('speech-status-text').textContent =
                `⚠️ Error: ${event.error}. Try again.`;
            stopRecording();
        }
    };

    state.recognition.onend = () => {
        if (state.isRecording) {
            restartAttempts++;
            if (restartAttempts > MAX_RESTART_ATTEMPTS) {
                document.getElementById('speech-status-text').textContent =
                    '⚠️ Recognition keeps stopping. Click mic to restart.';
                stopRecording();
                return;
            }

            // Debounced restart to avoid rapid restart loops
            setTimeout(() => {
                if (state.isRecording) {
                    try {
                        state.recognition.start();
                    } catch (e) {
                        stopRecording();
                    }
                }
            }, 150);
        }
    };

    // Pre-warm the microphone with noise reduction settings
    prewarmMicrophone();
}

/**
 * Request microphone access with noise reduction settings.
 * This primes the browser to use echo cancellation, noise suppression,
 * and auto gain control — which significantly improves recognition accuracy.
 */
async function prewarmMicrophone() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: { ideal: 16000 }    // 16kHz is optimal for speech recognition
            }
        });
        // Keep the stream reference so the browser retains the settings
        state.micStream = stream;
        console.log('Microphone pre-warmed with noise reduction');
    } catch (err) {
        console.warn('Could not pre-warm microphone:', err.message);
        // Not fatal — recognition will still work, just without the optimization
    }
}

function stopRecording() {
    state.isRecording = false;
    document.getElementById('btn-mic').classList.remove('recording');
    document.getElementById('speech-waves').classList.remove('active');
    document.getElementById('speech-status-text').textContent = 'Click the mic to speak';
    try {
        state.recognition?.stop();
    } catch (e) { }
}

function toggleMic() {
    if (!state.recognition) {
        alert('Speech Recognition is not supported in your browser. Please use Google Chrome.');
        return;
    }

    if (state.isRecording) {
        stopRecording();
    } else {
        // Stop any TTS
        state.speechSynthesis.cancel();

        // Mark as a fresh start so transcript is cleared
        state.isFirstStart = true;

        try {
            state.recognition.start();
        } catch (e) {
            // Already started — stop and retry
            stopRecording();
            setTimeout(() => {
                state.isFirstStart = true;
                try { state.recognition.start(); } catch (e2) { }
            }, 200);
        }
    }
}

// ─── Text-to-Speech ────────────────────────────────────────
function loadFrenchVoice() {
    function findFrenchVoice() {
        const voices = state.speechSynthesis.getVoices();
        // Prefer French Canadian
        state.frenchVoice = voices.find(v => v.lang === 'fr-CA')
            || voices.find(v => v.lang.startsWith('fr-'))
            || voices.find(v => v.lang.includes('fr'))
            || null;

        if (state.frenchVoice) {
            console.log('French voice found:', state.frenchVoice.name, state.frenchVoice.lang);
        }
    }

    findFrenchVoice();
    state.speechSynthesis.onvoiceschanged = findFrenchVoice;
}

function speakFrench(text, button, onComplete) {
    if (state.isSpeaking) {
        state.speechSynthesis.cancel();
        state.isSpeaking = false;
        document.querySelectorAll('.btn-speak').forEach(b => b.classList.remove('speaking'));
        return;
    }

    state.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;
    utterance.pitch = 1;

    if (state.frenchVoice) {
        utterance.voice = state.frenchVoice;
    }

    utterance.onstart = () => {
        state.isSpeaking = true;
        if (button) button.classList.add('speaking');
    };

    utterance.onend = () => {
        state.isSpeaking = false;
        if (button) button.classList.remove('speaking');
        if (onComplete) onComplete();
    };

    utterance.onerror = () => {
        state.isSpeaking = false;
        if (button) button.classList.remove('speaking');
        if (onComplete) onComplete();
    };

    state.speechSynthesis.speak(utterance);
}

// ─── Screen Navigation ─────────────────────────────────────
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    state.currentScreen = screenId.replace('-screen', '');
}

function goBack() {
    clearInterval(state.prepTimer);
    clearInterval(state.examTimer);
    state.speechSynthesis.cancel();
    showScreen('landing-screen');
}

function goHome() {
    clearInterval(state.prepTimer);
    clearInterval(state.examTimer);
    state.speechSynthesis.cancel();
    state.sessionId = null;
    showScreen('landing-screen');
}

// ─── Task Selection ────────────────────────────────────────
async function selectTask(taskType) {
    state.currentTask = taskType;

    // Add loading state to the button
    const btn = document.getElementById(`btn-${taskType}`);
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';

    try {
        const res = await fetch('/api/session/start', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ taskType })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to start session');
        }

        const data = await res.json();
        state.sessionId = data.sessionId;
        state.topicInfo = data.topicInfo;
        state.examTotalTime = data.duration;
        state.examTimeLeft = data.duration;
        state.examinerOpening = data.examinerOpening;

        if (taskType === 'task1' || taskType === 'task4') {
            // Task 1 & 4: No prep, go directly to exam
            startExam(data.examinerOpening);
        } else if (taskType === 'task2') {
            // Task 2: 2 min prep, then 3:30 speaking
            startPrep(data);
        } else if (taskType === 'task3') {
            // Task 3: No prep (spontaneous speech), AI presents the topic aloud
            startExam(data.examinerOpening);
        }
    } catch (error) {
        alert(error.message);
    } finally {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    }
}

// ─── Preparation Phase ─────────────────────────────────────
function startPrep(data) {
    const taskNames = {
        task2: 'Tâche 2 : Exercice en interaction',
        task3: 'Tâche 3 : Argumentation'
    };

    document.getElementById('prep-task-name').textContent = taskNames[state.currentTask];

    if (data.topicInfo) {
        document.getElementById('prep-topic-title').textContent = data.topicInfo.title || 'Sujet';
        document.getElementById('prep-topic-description').textContent =
            data.topicInfo.description || data.topicInfo.prompt || '';

        // Autoplay the topic description if enabled
        if (state.autoSpeak) {
            setTimeout(() => listenToPrepTopic(), 500);
        }
    }

    document.getElementById('prep-notepad').value = '';
    state.prepTimeLeft = data.prepTime;

    showScreen('prep-screen');

    // Start countdown
    updatePrepTimer();
    const circumference = 2 * Math.PI * 90; // 565.48

    state.prepTimer = setInterval(() => {
        state.prepTimeLeft--;
        updatePrepTimer();

        // Update circle
        const progress = 1 - (state.prepTimeLeft / data.prepTime);
        document.getElementById('prep-timer-circle').style.strokeDashoffset =
            circumference * progress;

        if (state.prepTimeLeft <= 0) {
            clearInterval(state.prepTimer);
            skipPrep();
        }
    }, 1000);
}

function updatePrepTimer() {
    const minutes = Math.floor(state.prepTimeLeft / 60);
    const seconds = state.prepTimeLeft % 60;
    document.getElementById('prep-timer').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function listenToPrepTopic() {
    if (state.topicInfo) {
        const textToSpeak = state.topicInfo.description || state.topicInfo.prompt || '';
        speakFrench(textToSpeak, document.getElementById('btn-prep-listen'));
    }
}

function skipPrep() {
    clearInterval(state.prepTimer);
    state.speechSynthesis.cancel(); // Stop any reading of the prep topic

    // For Task 2, examiner opening was already received
    // For Task 3, we need to tell the AI to start
    const sessions = state.sessionId;

    if (state.currentTask === 'task2') {
        startExam(state.examinerOpening);
        addSystemMessage(`🎯 Objectif : Posez 8 à 12 questions à l'examinateur pour obtenir des informations. Utilisez le registre formel ("vous").`);
    } else if (state.currentTask === 'task3') {
        const topicPrompt = state.topicInfo?.prompt || state.topicInfo?.title || '';
        startExam(null);
        // Show the topic as a system message
        addSystemMessage(`📋 Sujet : ${topicPrompt}\n\nPrésentez votre point de vue (monologue de 2-3 minutes), puis l'examinateur vous posera des questions.`);
    }
}

// ─── Exam Phase ────────────────────────────────────────────
function startExam(examinerOpening) {
    const taskLabels = { task1: 'Tâche 1', task2: 'Tâche 2', task3: 'Tâche 3', task4: 'Libre' };
    const taskNames = {
        task1: 'Introduction personnelle',
        task2: 'Exercice en interaction',
        task3: 'Argumentation',
        task4: 'Discussion libre'
    };

    document.getElementById('exam-task-label').textContent = taskLabels[state.currentTask];
    document.getElementById('exam-task-name').textContent = taskNames[state.currentTask];
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('text-input').value = '';

    // Handle no-timer mode for free discussion
    const timerContainer = document.getElementById('exam-timer-container');
    const isNoTimer = state.examTotalTime === 0;

    if (isNoTimer) {
        // Hide timer ring and pause button, show infinity symbol
        document.getElementById('exam-timer').textContent = '∞';
        document.getElementById('exam-timer-ring').style.display = 'none';
        document.querySelector('.timer-ring').style.display = 'none';
        document.getElementById('btn-timer-toggle').style.display = 'none';
    } else {
        // Reset timer UI
        document.getElementById('exam-timer-ring').style.display = '';
        document.querySelector('.timer-ring').style.display = '';
        document.getElementById('btn-timer-toggle').style.display = '';
    }

    showScreen('exam-screen');

    if (examinerOpening) {
        addMessage('examiner', examinerOpening, true);
    }

    // Start exam timer only if there's a time limit
    state.isExamPaused = false;
    state.timerStarted = false;
    updateTimerToggleUI();

    if (isNoTimer) {
        // No timer needed
    } else {
        state.timerStarted = true;
        startExamTimer();
    }
}

function startExamTimer() {
    const timerEl = document.getElementById('exam-timer');
    const ringEl = document.getElementById('exam-timer-ring');
    const circumference = 2 * Math.PI * 18; // 113.1

    updateExamTimerDisplay();

    state.examTimer = setInterval(() => {
        // Skip tick when paused
        if (state.isExamPaused) return;

        state.examTimeLeft--;

        if (state.examTimeLeft <= 0) {
            clearInterval(state.examTimer);
            state.examTimeLeft = 0;
            addSystemMessage("⏰ Le temps est écoulé ! L'épreuve est terminée.");
            setTimeout(() => endExam(), 2000);
        }

        updateExamTimerDisplay();

        // Update ring
        const progress = 1 - (state.examTimeLeft / state.examTotalTime);
        ringEl.style.strokeDashoffset = circumference * progress;

        // Color changes
        const percentLeft = state.examTimeLeft / state.examTotalTime;
        ringEl.classList.remove('warning', 'danger');
        if (percentLeft < 0.15) {
            ringEl.classList.add('danger');
        } else if (percentLeft < 0.3) {
            ringEl.classList.add('warning');
        }
    }, 1000);
}

function toggleExamTimer() {
    state.isExamPaused = !state.isExamPaused;
    updateTimerToggleUI();
}

function updateTimerToggleUI() {
    const btn = document.getElementById('btn-timer-toggle');
    const pauseIcon = document.getElementById('timer-pause-icon');
    const playIcon = document.getElementById('timer-play-icon');
    const timerText = document.getElementById('exam-timer');

    if (state.isExamPaused) {
        btn.classList.add('paused');
        btn.title = 'Resume timer';
        pauseIcon.classList.add('hidden-icon');
        playIcon.classList.remove('hidden-icon');
        timerText.classList.add('paused');
    } else {
        btn.classList.remove('paused');
        btn.title = 'Pause timer';
        pauseIcon.classList.remove('hidden-icon');
        playIcon.classList.add('hidden-icon');
        timerText.classList.remove('paused');
    }
}

function updateExamTimerDisplay() {
    const minutes = Math.floor(state.examTimeLeft / 60);
    const seconds = state.examTimeLeft % 60;
    document.getElementById('exam-timer').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ─── Messages ──────────────────────────────────────────────
function addMessage(role, text, withTTS = false) {
    const container = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatar = role === 'examiner' ? '<i data-lucide="graduation-cap" style="width: 20px; height: 20px;"></i>' : '<i data-lucide="user" style="width: 20px; height: 20px;"></i>';

    // Safely encode the text for use in data attributes (avoids breaking on quotes, backticks, etc.)
    const safeText = text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let actionsHTML = '';
    if (role === 'examiner') {
        const speakBtnId = 'speak-' + Date.now();
        actionsHTML = `
      <div class="message-actions">
        <button class="btn-speak" id="${speakBtnId}" data-speak-text="${safeText}" onclick="speakFrench(this.dataset.speakText, this)">
          <i data-lucide="volume-2" style="width: 14px; height: 14px; margin-right: 4px;"></i> Listen
        </button>
      </div>
    `;
    } else {
        actionsHTML = `
      <div class="message-actions">
        <button class="msg-action-btn" data-feedback-text="${safeText}" onclick="getFeedback(this.dataset.feedbackText)">
          <i data-lucide="lightbulb" style="width: 14px; height: 14px; margin-right: 4px;"></i> Check my French
        </button>
      </div>
    `;
    }

    msgDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div>
      <div class="message-bubble">${escapeHtml(text)}</div>
      ${actionsHTML}
    </div>
  `;

    container.appendChild(msgDiv);
    if (window.lucide) lucide.createIcons();
    scrollToBottom();

    // Auto-speak examiner messages
    if (role === 'examiner' && withTTS && state.autoSpeak) {
        const btn = msgDiv.querySelector('.btn-speak');
        setTimeout(() => speakFrench(text, btn), 300);
    }
}

function addSystemMessage(text) {
    const container = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message examiner';
    msgDiv.innerHTML = `
    <div class="message-avatar"><i data-lucide="clipboard-list" style="width: 20px; height: 20px;"></i></div>
    <div>
      <div class="message-bubble" style="background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.2); white-space: pre-wrap;">${escapeHtml(text)}</div>
    </div>
  `;
    container.appendChild(msgDiv);
    if (window.lucide) lucide.createIcons();
    scrollToBottom();
}

function addTypingIndicator() {
    const container = document.getElementById('chat-messages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message examiner';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = `
    <div class="message-avatar"><i data-lucide="graduation-cap" style="width: 20px; height: 20px;"></i></div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
    container.appendChild(typingDiv);
    if (window.lucide) lucide.createIcons();
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    const chatArea = document.getElementById('chat-area');
    chatArea.scrollTop = chatArea.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Send Message ──────────────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('text-input');
    const message = input.value.trim();

    if (!message || state.isWaitingForAI || !state.sessionId) return;

    // Stop recording if active
    if (state.isRecording) {
        stopRecording();
        // Small delay to get final text
        await new Promise(r => setTimeout(r, 300));
        const finalText = input.value.trim();
        if (finalText && finalText !== message) {
            input.value = finalText;
            return sendMessage();
        }
    }

    // Stop TTS
    state.speechSynthesis.cancel();

    addMessage('user', message);
    input.value = '';
    autoResize(input);

    state.isWaitingForAI = true;
    addTypingIndicator();

    try {
        const res = await fetch('/api/session/message', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sessionId: state.sessionId, message })
        });

        const data = await res.json();
        removeTypingIndicator();

        if (data.response) {
            addMessage('examiner', data.response, true);
        } else if (data.error) {
            addSystemMessage(`⚠️ Error: ${data.error}`);
        }
    } catch (error) {
        removeTypingIndicator();
        addSystemMessage('⚠️ Connection error. Check that the server is running.');
    } finally {
        state.isWaitingForAI = false;
    }
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// ─── Quick Feedback ────────────────────────────────────────
async function getFeedback(text) {
    const panel = document.getElementById('feedback-panel');
    const content = document.getElementById('feedback-content');

    panel.classList.remove('hidden');
    content.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ text })
        });

        const feedback = await res.json();

        if (!feedback) {
            content.innerHTML = '<p>Unable to analyze. Try again.</p>';
            return;
        }

        let html = '';

        if (feedback.level) {
            html += `<div class="level-badge">Level: ${feedback.level}</div>`;
        }

        if (feedback.grammarErrors && feedback.grammarErrors.length > 0) {
            html += '<h4 style="margin: 8px 0 4px; font-size: 0.85rem; color: #ef4444; display: flex; align-items: center; gap: 4px;"><i data-lucide="alert-circle" style="width: 14px; height: 14px;"></i> Grammar Errors</h4>';
            feedback.grammarErrors.forEach(err => {
                html += `<div class="error-item">
          <strong>${escapeHtml(err.error)}</strong> → <span style="color: #059669;">${escapeHtml(err.correction)}</span>
          <br><small style="color: #64748b;">${escapeHtml(err.explanation || '')}</small>
        </div>`;
            });
        }

        if (feedback.vocabularySuggestions && feedback.vocabularySuggestions.length > 0) {
            html += '<h4 style="margin: 8px 0 4px; font-size: 0.85rem; color: #3b82f6; display: flex; align-items: center; gap: 4px;"><i data-lucide="lightbulb" style="width: 14px; height: 14px;"></i> Vocabulary</h4>';
            feedback.vocabularySuggestions.forEach(sug => {
                html += `<div class="suggestion-item">
          <strong>${escapeHtml(sug.original)}</strong> → <span style="color: #2563eb;">${escapeHtml(sug.better)}</span>
          <br><small style="color: #64748b;">${escapeHtml(sug.why || '')}</small>
        </div>`;
            });
        }

        if (feedback.correctedVersion) {
            html += `<div class="correction">
        <strong style="display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle" style="width: 16px; height: 16px;"></i> Corrected:</strong><br>${escapeHtml(feedback.correctedVersion)}
      </div>`;
        }

        if (feedback.quickTip) {
            html += `<div class="tip" style="margin-top: 12px; font-size: 0.9em; background: rgba(251, 191, 36, 0.1); padding: 10px; border-radius: 8px;">
        <strong style="display: flex; align-items: center; gap: 4px;"><i data-lucide="lightbulb" style="width: 16px; height: 16px;"></i> Tip:</strong> ${escapeHtml(feedback.quickTip)}
      </div>`;
        }

        if (!html) {
            html = '<div class="tip" style="display: flex; align-items: center; gap: 6px;"><i data-lucide="check-circle-2" style="width: 18px; height: 18px; color: #10b981;"></i> Your French looks good! Keep going!</div>';
        }

        content.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        content.innerHTML = '<p>Error getting feedback. Try again.</p>';
    }
}

function closeFeedback() {
    document.getElementById('feedback-panel').classList.add('hidden');
}

// ─── End Exam ──────────────────────────────────────────────
async function endExam() {
    clearInterval(state.examTimer);
    stopRecording();
    state.speechSynthesis.cancel();

    const taskNames = {
        task1: 'Tâche 1 : Introduction personnelle',
        task2: 'Tâche 2 : Exercice en interaction',
        task3: 'Tâche 3 : Argumentation',
        task4: 'Discussion libre'
    };

    document.getElementById('eval-task-info').textContent = taskNames[state.currentTask];
    document.getElementById('eval-loading').classList.remove('hidden');
    document.getElementById('eval-results').classList.add('hidden');
    document.getElementById('eval-content').textContent = '';

    showScreen('eval-screen');

    try {
        const res = await fetch('/api/session/end', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ sessionId: state.sessionId })
        });

        const data = await res.json();

        document.getElementById('eval-loading').classList.add('hidden');
        document.getElementById('eval-results').classList.remove('hidden');

        // Render the evaluation with basic markdown
        document.getElementById('eval-content').innerHTML = renderMarkdown(data.evaluation);
    } catch (error) {
        document.getElementById('eval-loading').classList.add('hidden');
        document.getElementById('eval-results').classList.remove('hidden');
        document.getElementById('eval-content').textContent =
            'Error getting evaluation. Please try again.';
    }
}

function retryTask() {
    if (state.currentTask) {
        selectTask(state.currentTask);
    }
}

// ─── Markdown-like Rendering ───────────────────────────────
function renderMarkdown(text) {
    if (!text) return '';

    return text
        // Headers
        .replace(/^### (.*$)/gm, '<h3 style="color: #2563eb; margin: 16px 0 8px; font-size: 1.05rem;">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 style="color: #6d28d9; margin: 20px 0 10px; font-size: 1.2rem;">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 style="color: #0f172a; margin: 24px 0 12px; font-size: 1.4rem;">$1</h1>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #3b82f6;">$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Lists
        .replace(/^- (.*$)/gm, '<li style="margin-left: 16px; margin-bottom: 4px;">$1</li>')
        .replace(/^\d+\. (.*$)/gm, '<li style="margin-left: 16px; margin-bottom: 4px;">$1</li>')
        // Line breaks
        .replace(/\n\n/g, '<br><br>')
        .replace(/\n/g, '<br>');
}

// ─── Utility ───────────────────────────────────────────────
// Auto-resize textarea on input
document.addEventListener('input', (e) => {
    if (e.target.id === 'text-input') {
        autoResize(e.target);
    }
});

// ─── Theme Toggle ──────────────────────────────────────────
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
}

function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = isDark ? 'inline' : 'none';
        moonIcon.style.display = isDark ? 'none' : 'inline';
    }
}
