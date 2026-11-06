
/* ========================================
   KATAKANA QUIZ
   ======================================== */

/* CONFIGURATION */

const supabaseClient = window.katakanaSupabaseClient;

const TABLE_NAME = "katakana_daily_history";
const OWNER_EMAIL = "loidtourne@gmail.com";

const DAILY_QUESTION_LIMIT = 10;
const MAX_ATTEMPTS = 3;
const QUALIFYING_ACCURACY = 70;


/* KATAKANA CHARACTERS */

const katakana = [
  // Basic Katakana
  ["ア", "a"], ["イ", "i"], ["ウ", "u"], ["エ", "e"], ["オ", "o"],
  ["カ", "ka"], ["キ", "ki"], ["ク", "ku"], ["ケ", "ke"], ["コ", "ko"],
  ["サ", "sa"], ["シ", "shi"], ["ス", "su"], ["セ", "se"], ["ソ", "so"],
  ["タ", "ta"], ["チ", "chi"], ["ツ", "tsu"], ["テ", "te"], ["ト", "to"],
  ["ナ", "na"], ["ニ", "ni"], ["ヌ", "nu"], ["ネ", "ne"], ["ノ", "no"],
  ["ハ", "ha"], ["ヒ", "hi"], ["フ", "fu"], ["ヘ", "he"], ["ホ", "ho"],
  ["マ", "ma"], ["ミ", "mi"], ["ム", "mu"], ["メ", "me"], ["モ", "mo"],
  ["ヤ", "ya"], ["ユ", "yu"], ["ヨ", "yo"],
  ["ラ", "ra"], ["リ", "ri"], ["ル", "ru"], ["レ", "re"], ["ロ", "ro"],
  ["ワ", "wa"], ["ヲ", "wo"], ["ン", "n"],

  // Dakuten
  ["ガ", "ga"], ["ギ", "gi"], ["グ", "gu"], ["ゲ", "ge"], ["ゴ", "go"],
  ["ザ", "za"], ["ジ", "ji"], ["ズ", "zu"], ["ゼ", "ze"], ["ゾ", "zo"],
  ["ダ", "da"], ["ヂ", "di"], ["ヅ", "du"], ["デ", "de"], ["ド", "do"],
  ["バ", "ba"], ["ビ", "bi"], ["ブ", "bu"], ["ベ", "be"], ["ボ", "bo"],

  // Handakuten
  ["パ", "pa"], ["ピ", "pi"], ["プ", "pu"], ["ペ", "pe"], ["ポ", "po"]
];


/* DOM ELEMENTS */

const characterElement = document.getElementById("katakanaCharacter");
const feedbackElement = document.getElementById("feedback");
const answersElement = document.getElementById("answers");
const answerButtons = document.querySelectorAll(".answer");
const nextButton = document.getElementById("nextButton");
const attemptsElement = document.getElementById("attempts");

const accuracyElement = document.getElementById("accuracy");
const currentComboElement = document.getElementById("currentCombo");
const bestComboElement = document.getElementById("bestCombo");

const resetButton = document.getElementById("resetButton");

const authButton = document.getElementById("authButton");
const loginPanel = document.getElementById("loginPanel");
const loginEmail = document.getElementById("loginEmail");
const loginSubmit = document.getElementById("loginSubmit");
const loginMessage = document.getElementById("loginMessage");
const accountStatus = document.getElementById("accountStatus");


/* QUIZ STATE */

let currentQuestion = null;
let previousCharacter = null;

let attemptsRemaining = MAX_ATTEMPTS;
let questionCompleted = false;

let sessionCorrect = 0;
let sessionTotal = 0;

let dailyCorrectCount = 0;
let dailyTotalQuestions = 0;

let currentUser = null;

let saveQueue = Promise.resolve();


/* DATE HELPERS */

function getLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPreviousDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);

  date.setDate(date.getDate() - 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


/* SESSION STATISTICS */

function updateStats() {
  const accuracy = sessionTotal > 0
    ? Math.round((sessionCorrect / sessionTotal) * 100)
    : 0;

  return accuracy;
}


/* DAILY ACCURACY */

function updateDailyAccuracy() {
  if (!accuracyElement) return;

  const accuracy = dailyTotalQuestions > 0
    ? (dailyCorrectCount / dailyTotalQuestions) * 100
    : 0;

  accuracyElement.textContent = `${Math.round(accuracy)}%`;
}


/* STREAK CALCULATIONS */

function updateCombos(history) {
  const qualifyingDates = new Set(
    history
      .filter(record => record.qualifies)
      .map(record => record.study_date)
  );

  const today = getLocalDate();

  let currentStreak = 0;

  // An unfinished day does not break the current streak.
  let checkDate = dailyTotalQuestions >= DAILY_QUESTION_LIMIT
    ? today
    : getPreviousDate(today);

  while (qualifyingDates.has(checkDate)) {
    currentStreak++;
    checkDate = getPreviousDate(checkDate);
  }

  // Calculate the best historical streak.
  const sortedDates = [...qualifyingDates].sort();

  let bestStreak = 0;
  let runningStreak = 0;
  let previousDate = null;

  for (const date of sortedDates) {
    if (
      previousDate &&
      getPreviousDate(date) === previousDate
    ) {
      runningStreak++;
    } else {
      runningStreak = 1;
    }

    bestStreak = Math.max(bestStreak, runningStreak);
    previousDate = date;
  }

  if (currentComboElement) {
    currentComboElement.textContent = `🔥 ${currentStreak}`;
  }

  if (bestComboElement) {
    bestComboElement.textContent = `🔥 ${bestStreak}`;
  }
}


/* DAILY LIMIT */

function showDailyLimit() {
  answerButtons.forEach(button => {
    button.disabled = true;
  });

  if (answersElement) {
    answersElement.classList.add("daily-limit");
  }

  if (feedbackElement) {
    feedbackElement.textContent =
      "Daily limit reached. Come back tomorrow!";
  }

  if (attemptsElement) {
    attemptsElement.textContent = "You've completed today's quiz.";
  }

  if (nextButton) {
    nextButton.hidden = true;
  }
}


function applyDailyLimit() {
  if (dailyTotalQuestions >= DAILY_QUESTION_LIMIT) {
    showDailyLimit();
    return true;
  }

  if (answersElement) {
    answersElement.classList.remove("daily-limit");
  }

  return false;
}


/* LOAD DAILY HISTORY */

async function loadDailyHistory(startQuestionAfterLoad = true) {
  if (!currentUser || !supabaseClient) {
    dailyCorrectCount = 0;
    dailyTotalQuestions = 0;

    updateDailyAccuracy();
    updateCombos([]);

    if (startQuestionAfterLoad) {
      startQuestion();
    }

    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("study_date, correct_count, total_questions, qualifies, accuracy")
    .eq("user_id", currentUser.id)
    .order("study_date", { ascending: false });

  if (error) {
    console.error("Error loading Katakana history:", error);
    return;
  }

  const history = data || [];
  const today = getLocalDate();

  const todayRecord = history.find(
    record => record.study_date === today
  );

  dailyCorrectCount = todayRecord?.correct_count || 0;
  dailyTotalQuestions = todayRecord?.total_questions || 0;

  updateDailyAccuracy();
  updateCombos(history);

  const limitReached = applyDailyLimit();

  if (startQuestionAfterLoad && !limitReached) {
    startQuestion();
  }
}


/* SAVE DAILY RESULT */

async function saveDailyResult() {
  if (!currentUser || !supabaseClient) return;

  const qualifies =
    dailyTotalQuestions >= DAILY_QUESTION_LIMIT &&
    (dailyCorrectCount / dailyTotalQuestions) * 100 >= QUALIFYING_ACCURACY;

  const record = {
    user_id: currentUser.id,
    study_date: getLocalDate(),
    correct_count: dailyCorrectCount,
    total_questions: dailyTotalQuestions,
    qualifies
  };

  // Queue saves so multiple updates cannot overwrite one another.
  saveQueue = saveQueue.then(async () => {
    const { error } = await supabaseClient
      .from(TABLE_NAME)
      .upsert(record, {
        onConflict: "user_id,study_date"
      });

    if (error) {
      console.error("Error saving Katakana history:", error);
      return;
    }

    await loadDailyHistory(false);
  });

  await saveQueue;
}


/* ANSWER OPTIONS */

function shuffleArray(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}


function getUniqueAnswerOptions(correctAnswer) {
  const otherAnswers = [
    ...new Set(
      katakana
        .map(item => item[1])
        .filter(answer => answer !== correctAnswer)
    )
  ];

  const distractors = shuffleArray(otherAnswers).slice(0, 3);

  return shuffleArray([
    correctAnswer,
    ...distractors
  ]);
}


/* START QUESTION */

function startQuestion() {
  if (dailyTotalQuestions >= DAILY_QUESTION_LIMIT) {
    showDailyLimit();
    return;
  }

  questionCompleted = false;
  attemptsRemaining = MAX_ATTEMPTS;

  if (answersElement) {
    answersElement.classList.remove("daily-limit");
  }

  let selectedCharacter;

  do {
    selectedCharacter =
      katakana[Math.floor(Math.random() * katakana.length)];
  } while (
    katakana.length > 1 &&
    selectedCharacter[0] === previousCharacter
  );

  currentQuestion = {
    character: selectedCharacter[0],
    answer: selectedCharacter[1]
  };

  previousCharacter = selectedCharacter[0];

  if (characterElement) {
    characterElement.textContent = currentQuestion.character;
  }

  if (feedbackElement) {
    feedbackElement.textContent = "Select the matching romaji.";
  }

  if (attemptsElement) {
    attemptsElement.textContent = "You have 3 attempts.";
  }

  if (nextButton) {
    nextButton.hidden = true;
  }

  const options = getUniqueAnswerOptions(currentQuestion.answer);

  answerButtons.forEach((button, index) => {
    button.textContent = options[index];
    button.dataset.answer = options[index];

    button.disabled = false;
    button.classList.remove("right", "wrong");
  });
}


/* COMPLETE QUESTION */

async function completeQuestion(wasCorrect) {
  if (questionCompleted) return;

  questionCompleted = true;

  sessionTotal++;
  dailyTotalQuestions++;

  if (wasCorrect) {
    sessionCorrect++;
    dailyCorrectCount++;
  }

  answerButtons.forEach(button => {
    button.disabled = true;

    if (button.dataset.answer === currentQuestion.answer) {
      button.classList.add("right");
    }
  });

  updateStats();
  updateDailyAccuracy();

  if (attemptsElement) {
    attemptsElement.textContent = "Ready for the next character?";
  }

  if (feedbackElement && !wasCorrect) {
    feedbackElement.textContent =
      `The correct answer is ${currentQuestion.answer}.`;
  }

  if (nextButton) {
    nextButton.hidden = true;
  }

  if (currentUser) {
    await saveDailyResult();
  }

  if (dailyTotalQuestions >= DAILY_QUESTION_LIMIT) {
    showDailyLimit();
    return;
  }

  if (nextButton) {
    nextButton.hidden = false;
  }
}


/* HANDLE ANSWERS */

async function chooseAnswer(button) {
  if (
    questionCompleted ||
    button.disabled ||
    dailyTotalQuestions >= DAILY_QUESTION_LIMIT
  ) {
    return;
  }

  const selectedAnswer = button.dataset.answer;

  if (selectedAnswer === currentQuestion.answer) {
    button.classList.add("right");

    if (feedbackElement) {
      feedbackElement.textContent = "Correct! Well done.";
    }

    await completeQuestion(true);
    return;
  }

  button.classList.add("wrong");
  button.disabled = true;

  attemptsRemaining--;

  if (attemptsRemaining > 0) {
    if (feedbackElement) {
      feedbackElement.textContent =
        "Not quite. Try another answer.";
    }

    if (attemptsElement) {
      attemptsElement.textContent =
        `You have ${attemptsRemaining} attempts left.`;
    }

    return;
  }

  if (feedbackElement) {
    feedbackElement.textContent =
      `The correct answer is ${currentQuestion.answer}.`;
  }

  await completeQuestion(false);
}


/* NEXT QUESTION */

function nextQuestion() {
  if (!questionCompleted) return;

  if (dailyTotalQuestions >= DAILY_QUESTION_LIMIT) {
    showDailyLimit();
    return;
  }

  startQuestion();
}


/* RESET SESSION SCORE */

function resetSessionScore() {
  sessionCorrect = 0;
  sessionTotal = 0;

  updateStats();
}


/* AUTHENTICATION UI */

function updateAuthUI() {
  if (currentUser) {
    if (authButton) {
      authButton.textContent = "Sign out";
    }

    if (accountStatus) {
      accountStatus.textContent = "Signed in as owner";
    }

    if (loginPanel) {
      loginPanel.hidden = true;
    }

    return;
  }

  if (authButton) {
    authButton.textContent = "Sign in";
  }

  if (accountStatus) {
    accountStatus.textContent = "Study mode";
  }
}


/* AUTHENTICATION */

async function initializeAuth() {
  if (!supabaseClient) {
    console.error("Katakana Supabase client was not found.");

    updateAuthUI();
    await loadDailyHistory();

    return;
  }

  const {
    data: { session },
    error
  } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
  }

  currentUser =
    session?.user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
      ? session.user
      : null;

  updateAuthUI();

  if (currentUser) {
    await loadDailyHistory();
  } else {
    await loadDailyHistory();
  }

  // Listen for future authentication changes.
  supabaseClient.auth.onAuthStateChange((event, session) => {
    const user = session?.user;

    currentUser =
      user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()
        ? user
        : null;

    updateAuthUI();

    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      loadDailyHistory();
    }
  });
}


/* SIGN IN / SIGN OUT */

async function handleAuthButton() {
  if (!supabaseClient) return;

  if (currentUser) {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error("Sign-out error:", error);
    }

    return;
  }

  if (loginPanel) {
    loginPanel.hidden = !loginPanel.hidden;
  }

  if (loginMessage) {
    loginMessage.textContent = "";
  }
}


async function handleLogin(event) {
  event.preventDefault();

  if (!supabaseClient) return;

  const email = loginEmail?.value.trim();

  if (!email) {
    if (loginMessage) {
      loginMessage.textContent = "Please enter your email address.";
    }

    return;
  }

  if (email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    if (loginMessage) {
      loginMessage.textContent = "This account is not authorized.";
    }

    return;
  }

  if (loginMessage) {
    loginMessage.textContent = "Sending sign-in link...";
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.href.split("#")[0]
    }
  });

  if (error) {
    console.error("Login error:", error);

    if (loginMessage) {
      loginMessage.textContent = error.message;
    }

    return;
  }

  if (loginMessage) {
    loginMessage.textContent =
      "Check your email for your sign-in link.";
  }
}


/* EVENT LISTENERS */

answerButtons.forEach(button => {
  button.addEventListener("click", () => {
    chooseAnswer(button);
  });
});

if (nextButton) {
  nextButton.addEventListener("click", nextQuestion);
}

if (resetButton) {
  resetButton.addEventListener("click", resetSessionScore);
}

if (authButton) {
  authButton.addEventListener("click", handleAuthButton);
}

if (loginPanel) {
  loginPanel.addEventListener("submit", handleLogin);
}


/* INITIALIZE QUIZ */

async function initializeQuiz() {
  updateStats();
  updateDailyAccuracy();
  updateCombos([]);

  await initializeAuth();

  // Start a question only if history loading did not already
  // start one and the daily limit has not been reached.
  if (
    !currentQuestion &&
    dailyTotalQuestions < DAILY_QUESTION_LIMIT
  ) {
    startQuestion();
  }
}

initializeQuiz();
