---
description: How to start and run the TCF Canada Speaking Tutor application
---

# Running the TCF Canada Speaking Tutor

## Prerequisites
1. Make sure Ollama is running with the Mistral model:
// turbo
```bash
ollama serve
```

2. The `mistral:7b` model should already be pulled. If not:
```bash
ollama pull mistral:7b
```

## Starting the Application
// turbo
1. Start the Node.js server:
```bash
cd /Users/hp/Projects/French\ Tutor && npm run dev
```

2. Open your browser to http://localhost:3000

## Usage
- **Task 1: Entretien dirigé** - 2 minute structured interview. No preparation. Answer examiner's personal questions.
- **Task 2: Exercice en interaction** - 5.5 minutes with 2 min prep. Role-play scenario where you ask questions.
- **Task 3: Expression d'un point de vue** - 4.5 minutes with 2 min prep. Present and defend your opinion.

## Features
- 🎤 **Speech Recognition** - Click the mic to speak in French (use Chrome for best support)
- 🔊 **Text-to-Speech** - Click "Listen" to hear examiner messages in French
- 💡 **Quick Feedback** - Click "Check my French" on your messages for grammar/vocabulary feedback
- 📊 **Evaluation** - Get detailed TCF-style evaluation with scores when you end the session
