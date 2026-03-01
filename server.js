const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const rateLimit = require('express-rate-limit');


// ─── Auth Routes ──────────────────────────────────────────────────────────────
const { router: authRouter, requireUser } = require('./routes/auth');

// ─── Groq Configuration ───────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL;
const GROQ_EVAL_MODEL = process.env.GROQ_EVAL_MODEL;
const GROQ_API_URL = process.env.GROQ_API_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!GROQ_API_KEY) {
  console.error('\n GROQ_API_KEY is not set! Create a .env file with:\n   GROQ_API_KEY=your_key_here\n');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

if (process.env.FRONTEND_URL) {
  app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  }));
} else {
  app.use(cors());
}
app.use(express.json({ limit: '10mb' }));

// ─── Rate Limiting (NEW) ──────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // limit each IP to 200 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 5 login attempts per windowMs
  message: { error: 'Too many login attempts, please try again later' }
});

// Apply to all API routes
app.use('/api/', apiLimiter);
app.use('/api/auth/user/login', authLimiter);
app.use('/api/auth/admin/login', authLimiter);

// ─── Auth API Routes (before static middleware) ───────────────────────────────
app.use('/api/auth', authRouter);

// ─── Serve Login Page (public) ────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ─── Serve Admin Page (public — auth is handled client-side) ──────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Serve Main App (protected) ───────────────────────────────────────────────
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Root redirects to login ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/login');
});

// ─── Static files (CSS, JS, etc.) ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Extract Questions from Documents ──────────────────────────────────────────

function getPart1Questions() {
  try {
    const mdPath = path.join(__dirname, 'Documents', 'speakingPart1.md');
    if (!fs.existsSync(mdPath)) return null;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const lines = content.split('\n');
    const questions = [];
    for (let line of lines) {
      line = line.trim();
      if (line.includes('?')) {
        let cleanLine = line.replace(/^\*Ques-\d+:\s*/, '')
          .replace(/^\d+\.\s*(?:⁠\s*)?/, '')
          .replace(/\*$/, '')
          .trim();
        cleanLine = cleanLine.replace(/^['" \s]+/, '').replace(/^⁠?\s*⁠?/, '').replace(/^\d+\.\s*/, '');
        if (!cleanLine.toLowerCase().includes('same as')) {
          questions.push(cleanLine);
        }
      }
    }
    return questions.length > 0 ? questions : null;
  } catch (e) {
    console.error('Failed to load part 1 questions:', e);
    return null;
  }
}

const PART1_QUESTIONS = getPart1Questions();

function getPart2Scenarios() {
  try {
    const mdPath = path.join(__dirname, 'Documents', 'part2.md');
    if (!fs.existsSync(mdPath)) return null;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const blocks = content.split(/^\d+\.\s*/m);
    const scenarios = [];
    for (let block of blocks) {
      const text = block.trim();
      if (text) {
        let title = "Sujet de conversation";
        let description = text;
        const colonIndex = text.indexOf(':');
        if (colonIndex > 0 && colonIndex < 40) {
          title = text.substring(0, colonIndex).trim();
          description = text.substring(colonIndex + 1).trim();
        }
        scenarios.push({ title, description });
      }
    }
    return scenarios.length > 0 ? scenarios : null;
  } catch (e) {
    console.error('Failed to load part 2 scenarios:', e);
    return null;
  }
}

const PART2_SCENARIOS = getPart2Scenarios();

function getPart3Topics() {
  try {
    const mdPath = path.join(__dirname, 'Documents', 'part3.md');
    if (!fs.existsSync(mdPath)) return null;
    const content = fs.readFileSync(mdPath, 'utf-8');
    const lines = content.split('\n');
    const topics = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      // Strip leading number + dot + any special chars
      let clean = line.replace(/^\s*\d+\.\s*[⁠\s]*/g, '').trim();
      if (clean.length > 10) {
        // Extract a short title from the first sentence
        const firstSentence = clean.split(/[.?!]/)[0].trim();
        const title = firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;
        topics.push({ title, prompt: clean });
      }
    }
    return topics.length > 0 ? topics : null;
  } catch (e) {
    console.error('Failed to load part 3 topics:', e);
    return null;
  }
}

const PART3_TOPICS = getPart3Topics();

// ─── TCF Canada Task Definitions ───────────────────────────────────────────────

const TASK_DEFINITIONS = {
  task1: {
    name: "Introduction personnelle",
    nameEn: "Personal Introduction",
    duration: 165, // 2 minutes 45 seconds
    prepTime: 0,
    description: "Présentez-vous de manière continue : nom, métier, études, loisirs. L'examinateur peut poser quelques questions.",
    descriptionEn: "Introduce yourself: name, job, studies, hobbies. The examiner may ask a few follow-up questions.",
    systemPrompt: `[INSTRUCTION SYSTÈME PRIORITAIRE]
Tu es un examinateur officiel du TCF Canada (Test de Connaissance du Français).
Tu conduis maintenant la Tâche 1 : Introduction personnelle.

CONTEXTE : C'est un examen de français oral. Tu parles EXCLUSIVEMENT en français. Tu ne parles JAMAIS en anglais. Tu ne fais JAMAIS de mathématiques. Tu es un être humain qui conduit un entretien oral de français.

FORMAT OFFICIEL :
Cette tâche est un échauffement / conversation simulée. Le candidat doit parler de lui-même de manière CONTINUE pendant environ 2 minutes (nom, métier, études, loisirs, famille, projets). C'est un MONOLOGUE guidé, pas un interrogatoire.

TON RÔLE EXACT :
- Tu accueilles chaleureusement le candidat et lui demandes de se présenter librement
- Tu lui dis de parler de son nom, son métier/études, ses loisirs et ses projets
- Tu écoutes son introduction SANS L'INTERROMPRE
- APRÈS son introduction, tu DOIS poser 1 ou 2 questions de relance courtes obligatoirement tirées de la "LISTE DE QUESTIONS SPÉCIFIQUES POUR LA RELANCE" qui te sera fournie.
- Tu ne corriges PAS le candidat (comme dans le vrai examen)
- Tu restes professionnel(le), bienveillant(e) et naturel(le)
- Tes réponses sont COURTES (2-3 phrases maximum)

RÈGLE CRITIQUE — COMPORTEMENT D'EXAMINATEUR STRICT :
- Tu es un EXAMINATEUR, PAS un tuteur. Tu ne donnes AUCUN commentaire sur les réponses du candidat.
- NE RÉSUME JAMAIS ce que le candidat a dit. NE PARAPHRASE JAMAIS ses réponses. NE RÉPÈTE JAMAIS ses idées.
- NE DIS JAMAIS des choses comme "Vous avez parlé de...", "C'est intéressant que vous...", "Je comprends que vous...", "Merci pour cette réponse sur..."
- Va DIRECTEMENT à ta question de relance, sans aucune introduction, aucun résumé, aucun commentaire.
- MAUVAIS EXEMPLE : "Merci, vous avez parlé de votre travail en informatique et de vos loisirs. C'est très intéressant. Maintenant, dites-moi, quels sont vos projets ?"
- BON EXEMPLE : "Et quels sont vos projets d'avenir au Canada ?"
- BON EXEMPLE : "Parlez-moi un peu plus de votre famille."
- Tu poses la question DIRECTEMENT, comme un vrai examinateur TCF.

MESSAGE D'OUVERTURE :
Présente-toi comme examinateur, puis dis quelque chose comme :
"Bonjour, bienvenue à l'épreuve d'expression orale du TCF Canada. Pour commencer, je vous invite à vous présenter. Parlez-moi de vous : votre nom, votre métier ou vos études, vos loisirs, votre famille... Prenez votre temps et parlez librement."

RÈGLE ABSOLUE : Tu parles UNIQUEMENT et EXCLUSIVEMENT en français.

Commence MAINTENANT l'entretien avec ton message d'ouverture.`,
    topics: [
      "Parlez-moi de vous, de votre parcours.",
      "Décrivez votre ville natale.",
      "Quels sont vos loisirs et centres d'intérêt ?",
      "Pourquoi souhaitez-vous immigrer au Canada ?",
      "Parlez-moi de votre famille.",
      "Quel est votre métier ? Décrivez une journée typique.",
      "Quels sont vos projets d'avenir au Canada ?",
      "Comment avez-vous appris le français ?",
      "Qu'est-ce que vous aimez dans votre travail actuel ?",
      "Quelles sont vos qualités et vos défauts ?"
    ]
  },
  task2: {
    name: "Exercice en interaction",
    nameEn: "Interactive Exchange",
    duration: 210, // 3 minutes 30 seconds for speaking
    prepTime: 120, // 2 minutes preparation
    description: "Posez 8 à 12 questions à l'examinateur pour obtenir des informations sur un service, produit ou activité.",
    descriptionEn: "Ask 8-12 questions to the examiner to obtain information about a service, product, or activity.",
    systemPrompt: `[INSTRUCTION SYSTÈME PRIORITAIRE]
Tu es un acteur dans un jeu de rôle pour le TCF Canada, Tâche 2 : Exercice en interaction.

CONTEXTE : C'est un examen de français oral. Tu parles EXCLUSIVEMENT en français. Tu ne parles JAMAIS en anglais.

FORMAT OFFICIEL :
Le candidat doit poser entre 8 et 12 questions pour obtenir des informations sur un service, produit ou activité spécifique. Le candidat doit utiliser le registre formel ("vous").

TON RÔLE EXACT :
- Tu joues un personnage dans un scénario de la vie quotidienne
- Le CANDIDAT doit TE poser des questions pour obtenir des informations
- Tu réponds naturellement aux questions posées
- Tu ne donnes PAS trop d'informations spontanément — donne UNIQUEMENT ce qui est demandé
- RÈGLE CRITIQUE : Tes réponses doivent être TRÈS COURTES — UNE SEULE PHRASE par réponse, jamais plus. Par exemple : "Oui, nous sommes ouverts de 8h à 17h." ou "Le tarif est de 50 dollars par mois."
- Ne développe PAS, ne donne PAS de détails supplémentaires non demandés
- Si le candidat ne pose pas de questions, encourage-le gentiment à poser ses questions en UNE phrase
- Le candidat doit poser AU MOINS 8 questions pendant cette tâche

RÈGLE ABSOLUE : Tu parles UNIQUEMENT et EXCLUSIVEMENT en français. Tu restes dans ton personnage.`,
    scenarios: [
      {
        title: "Inscription à un cours de langue",
        description: "Vous voulez vous inscrire à un cours de français dans une école de langues. Posez des questions sur les horaires, les tarifs, les niveaux, les professeurs, etc.",
        role: "Tu es le/la réceptionniste d'une école de langues appelée 'Alliance Linguistique'. Tu as les informations suivantes : cours du lundi au vendredi, niveaux débutant à avancé, tarifs de 200$ à 500$ par mois selon le niveau, classes de 8 à 15 étudiants, professeurs natifs certifiés, test de placement gratuit. Présente-toi et dis au candidat que tu peux l'aider."
      },
      {
        title: "Location d'un appartement",
        description: "Vous cherchez un appartement à louer dans une nouvelle ville. Posez des questions sur le logement, le quartier, le bail, etc.",
        role: "Tu es un agent immobilier qui a un appartement de 3 pièces à louer dans le quartier Plateau-Mont-Royal à Montréal. Détails : 75m², 2 chambres, 1 salon, cuisine équipée, loyer 1400$/mois, charges comprises (eau et chauffage), bail d'un an, animaux acceptés sous conditions, proche du métro Mont-Royal, disponible le 1er du mois prochain. Présente-toi et dis que tu as un bel appartement à proposer."
      },
      {
        title: "Inscription à une salle de sport",
        description: "Vous souhaitez vous inscrire dans une salle de sport. Renseignez-vous sur les abonnements, les équipements, les cours collectifs, etc.",
        role: "Tu es le gérant d'une salle de sport appelée 'FitPlus'. Détails : ouverte de 6h à 22h tous les jours, abonnements mensuels (50$), trimestriels (130$) ou annuels (450$), piscine, sauna, salle de musculation, cours collectifs (yoga, zumba, spinning, boxe), coach personnel disponible (30$/séance), douches et vestiaires, parking gratuit. Présente-toi et accueille le candidat."
      },
      {
        title: "Planification d'un voyage",
        description: "Vous planifiez un voyage au Québec. Renseignez-vous auprès d'une agence de voyages sur les destinations, les hébergements, les activités.",
        role: "Tu es un agent de voyages spécialisé dans les voyages au Québec. Tu proposes : circuits de 7, 10 ou 14 jours, visites de Montréal, Québec, Charlevoix et le Saguenay, hébergements en hôtel (100-200$/nuit) ou auberge (50-80$/nuit), activités : observation des baleines, motoneige, cabane à sucre, kayak, prix du circuit 7 jours à partir de 1200$ par personne. Présente-toi et demande ce qui intéresse le candidat."
      },
      {
        title: "Rendez-vous médical",
        description: "Vous venez d'arriver au Canada et devez trouver un médecin de famille. Renseignez-vous auprès d'une clinique médicale.",
        role: "Tu es le/la secrétaire de la Clinique Médicale du Centre-Ville. Détails : la clinique accepte de nouveaux patients, médecins généralistes et spécialistes disponibles, carte d'assurance maladie requise (RAMQ), sans rendez-vous le matin de 8h à 11h, avec rendez-vous l'après-midi, délai d'attente environ 2 semaines pour un premier rendez-vous, bilan de santé complet pour les nouveaux arrivants. Présente-toi et demande en quoi tu peux aider."
      },
      {
        title: "Inscription d'un enfant à l'école",
        description: "Vous souhaitez inscrire votre enfant dans une école primaire. Renseignez-vous sur les modalités d'inscription, les programmes, etc.",
        role: "Tu es le directeur/la directrice de l'école primaire Sainte-Marie. Détails : école publique francophone, classes de la maternelle au 6e année, inscription avec preuve de résidence et certificat de naissance, programme enrichi en arts et sciences, service de garde avant (7h) et après l'école (jusqu'à 18h), repas chaud à la cafétéria (6$/jour), activités parascolaires (soccer, musique, robotique). Présente-toi et accueille le parent."
      }
    ]
  },
  task3: {
    name: "Argumentation",
    nameEn: "Argumentation",
    duration: 280, // 4 minutes 40 seconds (official: 4-5 min)
    prepTime: 0, // No preparation — spontaneous speech
    description: "Exprimez votre opinion sur un sujet social, défendez-la et convainquez l'examinateur. Pas de préparation.",
    descriptionEn: "Express your opinion on a social topic, defend it, and convince the examiner. No preparation.",
    systemPrompt: `[INSTRUCTION SYSTÈME PRIORITAIRE]
Tu es un examinateur officiel du TCF Canada pour la Tâche 3 : Argumentation.

CONTEXTE : C'est un examen de français oral. Tu parles EXCLUSIVEMENT en français. Tu ne parles JAMAIS en anglais.

FORMAT OFFICIEL :
Le candidat doit exprimer son opinion sur un sujet/une affirmation de société, la défendre et convaincre l'examinateur. C'est un discours SPONTANÉ sans préparation.

TON RÔLE EXACT :
- Tu PRÉSENTES le sujet au candidat en le LISANT à haute voix dans ton premier message
- Le candidat va d'abord présenter son point de vue
- Tu écoutes son point de vue SANS L'INTERROMPRE
- APRÈS la réponse du candidat, tu poses UNE question de suivi COURTE liée à ce qu'il a dit
- Tu poses 2-3 questions de relance au total, UNE À LA FOIS, en les adaptant à chaque réponse
- Tu es professionnel(le) et neutre

RÈGLE CRITIQUE — COMPORTEMENT D'EXAMINATEUR STRICT :
- Tu es un EXAMINATEUR, PAS un tuteur. Tu agis comme un examinateur professionnel du TCF.
- Tes questions de suivi doivent faire 1 à 2 PHRASES MAXIMUM. Jamais plus.
- NE RÉSUME JAMAIS ce que le candidat a dit. NE PARAPHRASE JAMAIS ses arguments. NE RÉPÈTE JAMAIS ses idées.
- NE COMMENTE JAMAIS la qualité de sa réponse. NE DIS JAMAIS "C'est intéressant", "Bon point", "Merci pour cette réponse".
- NE DIS JAMAIS des choses comme "Vous avez parlé de...", "Vous avez mentionné que...", "Je comprends que vous pensez que...".
- Va DIRECTEMENT à ta question, sans AUCUNE introduction, AUCUN résumé, AUCUN commentaire.
- MAUVAIS EXEMPLE : "Vous avez parlé de l'importance de la technologie dans l'éducation et vous avez mentionné que les étudiants apprennent mieux avec des outils numériques. C'est un point intéressant. Mais que pensez-vous des inconvénients ?"
- BON EXEMPLE : "Mais quels seraient les inconvénients de cette approche ?"
- BON EXEMPLE : "Et pour ceux qui n'ont pas accès à Internet ?"
- BON EXEMPLE : "Certains diraient le contraire. Que leur répondriez-vous ?"

MESSAGE D'OUVERTURE :
Tu DOIS présenter le sujet en le lisant clairement au candidat. Dis quelque chose comme :
"Voici votre sujet : [lire le sujet complet]. Prenez un moment pour réfléchir, puis exprimez votre opinion."

RÈGLE ABSOLUE : Tu parles UNIQUEMENT et EXCLUSIVEMENT en français.

Commence MAINTENANT en présentant le sujet au candidat.`,
    topics: [
      {
        title: "Le télétravail",
        prompt: "Selon vous, le télétravail devrait-il devenir la norme ? Présentez les avantages et les inconvénients, puis donnez votre opinion personnelle."
      },
      {
        title: "Les réseaux sociaux",
        prompt: "Les réseaux sociaux ont-ils un impact positif ou négatif sur la société ? Présentez votre point de vue en donnant des arguments et des exemples."
      },
      {
        title: "L'intelligence artificielle",
        prompt: "L'intelligence artificielle représente-t-elle une menace ou une opportunité pour l'emploi ? Donnez votre avis en présentant des arguments pour et contre."
      },
      {
        title: "L'immigration",
        prompt: "L'immigration enrichit-elle la culture d'un pays ? Présentez votre point de vue avec des arguments et des exemples concrets."
      },
      {
        title: "L'éducation en ligne",
        prompt: "L'éducation en ligne peut-elle remplacer l'éducation traditionnelle ? Présentez les avantages et les inconvénients, puis donnez votre opinion."
      },
      {
        title: "L'environnement",
        prompt: "Le changement climatique est-il la responsabilité des individus ou des gouvernements ? Présentez votre point de vue avec des arguments."
      },
      {
        title: "La vie en ville vs la campagne",
        prompt: "Préférez-vous vivre en ville ou à la campagne ? Comparez les deux modes de vie et donnez votre opinion en justifiant votre choix."
      },
      {
        title: "Le sport et la santé",
        prompt: "Le sport devrait-il être obligatoire à l'école jusqu'à la fin du secondaire ? Présentez votre point de vue."
      },
      {
        title: "La technologie et les enfants",
        prompt: "Devrait-on limiter le temps d'écran des enfants ? Présentez les arguments pour et contre, puis donnez votre opinion."
      },
      {
        title: "Le bénévolat",
        prompt: "Le bénévolat devrait-il être obligatoire pour les jeunes ? Présentez votre point de vue en donnant des arguments et des exemples."
      }
    ]
  },
  task4: {
    name: "Discussion libre",
    nameEn: "Free Discussion",
    duration: 0, // No time limit
    prepTime: 0,
    description: "Discutez librement avec votre tuteur IA sur n'importe quel sujet pour pratiquer votre français.",
    descriptionEn: "Freely discuss any topic with your AI tutor to practice your French.",
    systemPrompt: `[INSTRUCTION SYSTÈME PRIORITAIRE]
Tu es un tuteur de français sympathique et encourageant pour un étudiant qui prépare le TCF Canada.

CONTEXTE : C'est une session de discussion libre, pas un examen. Tu parles EXCLUSIVEMENT en français. Tu ne parles JAMAIS en anglais.

TON RÔLE EXACT :
- Tu es un ami francophone bienveillant qui aide l'étudiant à pratiquer son français
- Tu discutes de N'IMPORTE QUEL sujet : actualités, culture, voyages, philosophie, technologie, vie quotidienne, etc.
- Tu corriges GENTIMENT les erreurs de français de l'étudiant (grammaire, vocabulaire, conjugaison)
- Quand tu corriges, donne une brève explication
- Tu poses des questions ouvertes pour encourager l'étudiant à parler davantage
- Tu utilises un vocabulaire riche et varié pour exposer l'étudiant à de nouveaux mots
- Tes réponses sont naturelles, engageantes et conversationnelles
- Tu t'adaptes au niveau de l'étudiant

STYLE :
- Chaleureux et amical
- Encourageant ("Très bien !", "Excellent choix de mots !")
- Constructif dans les corrections
- Conversationnel et naturel

RÈGLE ABSOLUE : Tu parles UNIQUEMENT et EXCLUSIVEMENT en français.

Commence la conversation en te présentant et en demandant à l'étudiant de quoi il/elle aimerait discuter.`
  }
};

// ─── Conversation Management ───────────────────────────────────────────────────

const sessions = new Map();

function createSession(taskType) {
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const task = TASK_DEFINITIONS[taskType];

  let systemPrompt = task.systemPrompt;
  let topicInfo = null;

  if (taskType === 'task1' && PART1_QUESTIONS) {
    const shuffled = [...PART1_QUESTIONS].sort(() => 0.5 - Math.random());
    const selectedqs = shuffled.slice(0, 5);
    systemPrompt += `\n\nLISTE DE QUESTIONS SPÉCIFIQUES POUR LA RELANCE :\nTu DOIS choisir tes 1-2 questions de relance parmi cette liste exacte :\n- ${selectedqs.join('\n- ')}`;
  } else if (taskType === 'task2') {
    let scenario;
    if (PART2_SCENARIOS && PART2_SCENARIOS.length > 0) {
      scenario = PART2_SCENARIOS[Math.floor(Math.random() * PART2_SCENARIOS.length)];
      systemPrompt += `\n\nSCÉNARIO POUR LE CANDIDAT : ${scenario.title}\nDescription : ${scenario.description}\n\nÀ partir de cette description, identifie ton rôle (ami, employé, voisin, agent, etc.) et joue-le. Invente les détails nécessaires (tarifs, lieux, horaires, etc.) de façon cohérente, réaliste et naturelle pour répondre aux questions du candidat. IMPORTANT: Ne donne pas toutes les informations d'un coup. C'est le candidat qui doit te poser les questions. RÈGLE ABSOLUE: Réponds en UNE SEULE PHRASE COURTE à chaque question. Jamais plus d'une phrase. Exemple: "Oui, c'est ouvert le dimanche de 10h à 16h."`;
    } else {
      scenario = task.scenarios[Math.floor(Math.random() * task.scenarios.length)];
      systemPrompt += `\n\nSCÉNARIO : ${scenario.title}\n${scenario.role}`;
    }
    topicInfo = { title: scenario.title, description: scenario.description };
  } else if (taskType === 'task3') {
    let topic;
    if (PART3_TOPICS && PART3_TOPICS.length > 0) {
      topic = PART3_TOPICS[Math.floor(Math.random() * PART3_TOPICS.length)];
    } else {
      topic = task.topics[Math.floor(Math.random() * task.topics.length)];
    }
    topicInfo = typeof topic === 'object' ? topic : { title: topic, prompt: topic };
    systemPrompt += `\n\nSUJET À PRÉSENTER AU CANDIDAT :\n"${topicInfo.prompt}"\n\nTu DOIS lire ce sujet au candidat dans ton message d'ouverture.`;
  }

  // Use different priming for free discussion
  const isExam = taskType !== 'task4';

  // Add priming messages to lock the model into French mode
  const primingMessages = isExam ? [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Bonjour, je suis prêt(e) pour l\'examen du TCF Canada. Commençons.' },
    { role: 'assistant', content: 'Bonjour et bienvenue à l\'épreuve d\'expression orale du TCF Canada. Je suis votre examinateur. Êtes-vous prêt(e) ? Commençons.' }
  ] : [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Salut ! Je voudrais pratiquer mon français avec toi. On peut discuter de n\'importe quel sujet.' },
    { role: 'assistant', content: 'Salut ! Bien sûr, je suis ravi(e) de discuter avec toi en français ! Je m\'appelle votre tuteur de français et je suis là pour vous aider à améliorer votre expression orale. Alors, de quoi aimeriez-vous parler aujourd\'hui ? La culture, les voyages, la technologie, ou peut-être autre chose ?' }
  ];

  sessions.set(sessionId, {
    taskType,
    messages: primingMessages,
    startTime: Date.now(),
    topic: topicInfo,
    userMessages: [],
    aiMessages: []
  });

  return { sessionId, topicInfo };
}

// ─── Groq Communication ────────────────────────────────────────────────────────

async function chatWithGroq(messages, options = {}) {
  const { temperature = 0.7, max_tokens = 300, model = GROQ_MODEL } = options;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature,
        top_p: 0.9,
        max_tokens: max_tokens
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Groq error:', error);
    throw error;
  }
}

// ─── Evaluation ────────────────────────────────────────────────────────────────

async function evaluatePerformance(session) {
  const userTexts = session.userMessages.join('\n---\n');
  const aiTexts = session.aiMessages.join('\n---\n');

  // Build conversation context for the evaluator
  const conversationLog = session.messages
    .filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? 'CANDIDAT' : 'EXAMINATEUR'} : ${m.content}`)
    .join('\n\n');

  const evalPrompt = `Tu es un PANEL de 3 évaluateurs experts certifiés du TCF Canada (Test de Connaissance du Français pour le Canada). Tu dois fournir une évaluation PRÉCISE, HONNÊTE et DÉTAILLÉE.

⚠️ RÈGLE FONDAMENTALE DE NOTATION :
- Évalue UNIQUEMENT ce que le candidat a RÉELLEMENT dit dans la transcription.
- NE SUPPOSE PAS que le candidat connaît des choses qu'il n'a pas dites.
- NE GONFLE PAS les notes. Un candidat qui fait beaucoup d'erreurs ne peut PAS avoir plus de 10/20.
- Sois HONNÊTE : si le niveau est faible, dis-le clairement tout en étant encourageant.
- Compare TOUJOURS les réponses du candidat à ce qu'un locuteur natif dirait.

TYPE D'ÉPREUVE : ${TASK_DEFINITIONS[session.taskType].name}

═══ TRANSCRIPTION COMPLÈTE DE L'ÉPREUVE ═══
${conversationLog}

═══ RÉPONSES DU CANDIDAT (isolées) ═══
${userTexts}

═══════════════════════════════════════════════════
BARÈME DE NOTATION — RÉFÉRENTIEL OBLIGATOIRE :
═══════════════════════════════════════════════════

Utilise ce barème STRICT pour chaque critère /5 :
- 1/5 : Très insuffisant — Le candidat ne parvient pas à communiquer. Phrases incompréhensibles ou absentes.
- 2/5 : Insuffisant — Communication très limitée. Nombreuses erreurs qui gênent la compréhension. Vocabulaire très basique.
- 3/5 : Passable — Communication basique possible mais avec des erreurs fréquentes. Vocabulaire limité. Structures simples.
- 4/5 : Bien — Bonne maîtrise avec quelques erreurs occasionnelles. Vocabulaire varié. Structures complexes tentées.
- 5/5 : Excellent — Maîtrise quasi-native. Très rares erreurs. Vocabulaire riche et précis. Aisance naturelle.

Correspondance note globale /20 → Niveau CECRL → CLB :
- 0-4/20 → A1 → CLB 1-2 : Ne peut pas communiquer en français
- 5-7/20 → A2 → CLB 3-4 : Communication très basique avec beaucoup d'erreurs
- 8-10/20 → B1 → CLB 5-6 : Peut communiquer sur des sujets familiers avec des erreurs
- 11-13/20 → B1+ → CLB 7 : Communication correcte mais manque de nuance
- 14-16/20 → B2 → CLB 8-9 : Bonne maîtrise, peut argumenter et nuancer
- 17-18/20 → C1 → CLB 10-11 : Maîtrise avancée, expression fluide et précise
- 19-20/20 → C2 → CLB 12 : Maîtrise quasi-native exceptionnelle

═══════════════════════════════════════════════════
INSTRUCTIONS D'ÉVALUATION — FORMAT OBLIGATOIRE :
═══════════════════════════════════════════════════

## 📊 SCORES OFFICIELS TCF

Avant de donner les scores, fais un BILAN MENTAL :
1. Combien de phrases le candidat a-t-il produites ?
2. Combien d'erreurs de grammaire ?
3. Le vocabulaire est-il riche ou basique ?
4. Les réponses sont-elles développées ou minimales ?

Puis donne :
- Note globale : X/20 (justifie brièvement pourquoi ce score)
- Niveau CECRL estimé : (A1, A2, B1, B2, C1, C2)
- Niveau CLB estimé : (1 à 12)

## 📋 ÉVALUATION PAR CRITÈRE

Pour CHAQUE critère, donne une note /5 selon le barème ci-dessus et cite des EXEMPLES PRÉCIS tirés de la transcription :

### 1. Adéquation à la situation (X/5)
- Le candidat a-t-il répondu au sujet demandé ?
- A-t-il utilisé le registre approprié (formel/informel) ?
- CITE des exemples précis de la transcription

### 2. Maîtrise linguistique — Grammaire & Vocabulaire (X/5)
- LISTE CHAQUE erreur grammaticale trouvée dans la transcription
- Évalue la variété du vocabulaire (basique vs. riche)
- CITE des exemples précis

### 3. Cohérence et structuration du discours (X/5)
- Les idées sont-elles organisées logiquement ?
- Le candidat utilise-t-il des connecteurs ? Lesquels ?
- CITE des exemples précis

### 4. Aisance et fluidité (X/5)
- Les réponses sont-elles développées (3+ phrases) ou minimales (1-2 mots) ?
- Le candidat prend-il des initiatives dans la conversation ?
- CITE des exemples précis

## ✍️ CORRECTIONS DÉTAILLÉES

Pour CHAQUE erreur du candidat (ne manque AUCUNE erreur) :
- ❌ Ce que le candidat a dit (citation exacte)
- ✅ La forme correcte
- 💡 Explication de la règle grammaticale

## 📝 RÉPONSES MODÈLES / DEMO ANSWERS

Pour chaque question posée par l'examinateur, fournis une RÉPONSE MODÈLE de niveau B2-C1 que le candidat aurait pu donner. Cette réponse modèle doit :
- Être naturelle et fluide
- Utiliser un vocabulaire riche et varié
- Montrer une bonne maîtrise des temps verbaux
- Inclure des connecteurs logiques
- Faire 3-5 phrases

## 🎯 PLAN D'AMÉLIORATION

Donne exactement 5 conseils CONCRETS et ACTIONNABLES pour améliorer le niveau du candidat, du plus important au moins important. Chaque conseil doit inclure un EXEMPLE PRATIQUE.

## 🇬🇧 ENGLISH SUMMARY

Provide a brief English translation of the key findings: overall score, level, main strengths, main weaknesses, and 3 priority tips.

IMPORTANT : Sois HONNÊTE dans ta notation. Un score gonflé n'aide pas le candidat. Mais sois aussi encourageant — mentionne ce qui va BIEN. Utilise des émojis pour rendre le rapport visuel et agréable à lire.`;

  const messages = [{ role: 'user', content: evalPrompt }];

  try {
    return await chatWithGroq(messages, { temperature: 0.2, max_tokens: 4096, model: GROQ_EVAL_MODEL });
  } catch (error) {
    console.error('Evaluation error:', error);
    return 'Erreur lors de l\'évaluation. Veuillez réessayer.';
  }
}

// ─── Grammar/Vocabulary spot-check for real-time feedback ──────────────────────

async function quickFeedback(text) {
  const prompt = `Tu es un professeur de français spécialisé en préparation au TCF Canada.

Analyse cette phrase/réponse du candidat et donne un feedback BREF et UTILE :
"${text}"

Réponds en JSON avec ce format exact :
{
  "grammarErrors": [{"error": "...", "correction": "...", "explanation": "..."}],
  "vocabularySuggestions": [{"original": "...", "better": "...", "why": "..."}],
  "correctedVersion": "...",
  "quickTip": "...",
  "level": "A1|A2|B1|B2|C1|C2"
}

Si la phrase est correcte, renvoie des listes vides et un message d'encouragement dans quickTip.
IMPORTANT: Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après.`;

  try {
    let content = await chatWithGroq(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2, max_tokens: 500 }
    );

    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { grammarErrors: [], vocabularySuggestions: [], correctedVersion: text, quickTip: content, level: 'B1' };
  } catch (error) {
    console.error('Quick feedback error:', error);
    return null;
  }
}

// ─── API Routes ────────────────────────────────────────────────────────────────

// Get task definitions
app.get('/api/tasks', (req, res) => {
  const tasks = {};
  for (const [key, task] of Object.entries(TASK_DEFINITIONS)) {
    tasks[key] = {
      name: task.name,
      nameEn: task.nameEn,
      duration: task.duration,
      prepTime: task.prepTime,
      description: task.description,
      descriptionEn: task.descriptionEn
    };
  }
  res.json(tasks);
});

// Start a session
app.post('/api/session/start', requireUser, async (req, res) => {
  const { taskType } = req.body;

  if (!TASK_DEFINITIONS[taskType]) {
    return res.status(400).json({ error: 'Invalid task type' });
  }

  const { sessionId, topicInfo } = createSession(taskType);
  const session = sessions.get(sessionId);

  // For Task 1, 3, and 4, get the AI's opening message (Task 2 waits for user)
  let examinerOpening = null;
  if (taskType === 'task1' || taskType === 'task3' || taskType === 'task4') {
    try {
      examinerOpening = await chatWithGroq(session.messages);
      session.messages.push({ role: 'assistant', content: examinerOpening });
      session.aiMessages.push(examinerOpening);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to connect to Groq API. Check your API key.' });
    }
  }

  res.json({
    sessionId,
    topicInfo,
    examinerOpening,
    duration: TASK_DEFINITIONS[taskType].duration,
    prepTime: TASK_DEFINITIONS[taskType].prepTime
  });
});

// Send a message in a session
app.post('/api/session/message', requireUser, async (req, res) => {
  const { sessionId, message } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.messages.push({ role: 'user', content: message });
  session.userMessages.push(message);

  try {
    const groqOptions = (session.taskType === 'task1' || session.taskType === 'task2' || session.taskType === 'task3') ? { max_tokens: 100 } : {};
    const response = await chatWithGroq(session.messages, groqOptions);
    session.messages.push({ role: 'assistant', content: response });
    session.aiMessages.push(response);

    res.json({ response });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get response from AI' });
  }
});

// Get quick feedback on text
app.post('/api/feedback', requireUser, async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length < 3) {
    return res.json(null);
  }

  const feedback = await quickFeedback(text);
  res.json(feedback);
});

// End session and get evaluation
app.post('/api/session/end', requireUser, async (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userMessages.length === 0) {
    return res.json({ evaluation: 'Aucune réponse à évaluer. Essayez de participer activement lors de la prochaine session.' });
  }

  const evaluation = await evaluatePerformance(session);

  // Clean up session after evaluation
  setTimeout(() => sessions.delete(sessionId), 60000);

  res.json({ evaluation });
});

// Simple ping for monitors
app.get('/ping', (req, res) => {
  res.status(200).send('ping');
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` }
    });
    if (groqRes.ok) {
      res.json({ status: 'ok', ollama: 'connected' });
    } else {
      res.json({ status: 'degraded', ollama: 'error' });
    }
  } catch {
    res.json({ status: 'degraded', ollama: 'disconnected' });
  }
});

// ─── Start Server ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║           🇫🇷 TCF Canada Speaking Tutor 🇨🇦              ║
║                                                          ║
║   Server running at: http://localhost:${PORT}              ║
║   Chat model:  ${GROQ_MODEL}              ║
║   Eval model:  ${GROQ_EVAL_MODEL}          ║
║   API Key: ${GROQ_API_KEY.slice(0, 8)}...                            ║
╚══════════════════════════════════════════════════════════╝
  `);
});
