
/* =====================================
   KATAKANA CHARACTERS
===================================== */

const katakana = [
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
  ["ガ", "ga"], ["ギ", "gi"], ["グ", "gu"], ["ゲ", "ge"], ["ゴ", "go"],
  ["ザ", "za"], ["ジ", "ji"], ["ズ", "zu"], ["ゼ", "ze"], ["ゾ", "zo"],
  ["ダ", "da"], ["ヂ", "ji"], ["ヅ", "zu"], ["デ", "de"], ["ド", "do"],
  ["バ", "ba"], ["ビ", "bi"], ["ブ", "bu"], ["ベ", "be"], ["ボ", "bo"],
  ["パ", "pa"], ["ピ", "pi"], ["プ", "pu"], ["ペ", "pe"], ["ポ", "po"]
];


/* =====================================
   SUPABASE CONFIGURATION
===================================== */

const supabaseClient = window.katakanaSupabaseClient;

const OWNER_EMAIL = "loidtourne@gmail.com";
const HISTORY_TABLE = "katakana_daily_history";

let currentUser = null;

let dailyCorrectCount = 0;
let dailyTotalQuestions = 0;


/* =====================================
   GAME STATE
===================================== */

let currentQuestion = null;
let previousCharacter = null;

let wrongAttempts = 0;

let correctCount = 0;
let questionCount = 0;

let questionFinished = false;


/* =====================================
   HTML ELEMENTS
===================================== */

const characterElement =
  document.getElementById("katakanaCharacter");

const feedbackElement =
  document.getElementById("feedback");

const answerButtons = [
  ...document.querySelectorAll(".answer")
];

const nextButton =
  document.getElementById("nextButton");

const attemptsElement =
  document.getElementById("attempts");

const accuracyElement =
  document.getElementById("accuracy");

const currentComboElement =
  document.getElementById("currentCombo");

const bestComboElement =
  document.getElementById("bestCombo");

const authButton =
  document.getElementById("authButton");

const loginPanel =
  document.getElementById("loginPanel");

const loginEmail =
  document.getElementById("loginEmail");

const loginSubmit =
  document.getElementById("loginSubmit");

const loginMessage =
  document.getElementById("loginMessage");

const accountStatus =
  document.getElementById("accountStatus");


/* =====================================
   DATE HELPERS
===================================== */

function getLocalStudyDate() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function getDateOffset(dateString, offset) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day + offset)
  );

  return date.toISOString().slice(0, 10);
}


/* =====================================
   SESSION ACCURACY
===================================== */

function updateStats() {
  const accuracy = questionCount === 0
    ? 0
    : Math.round(
        (correctCount / questionCount) * 100
      );

  accuracyElement.textContent = `${accuracy}%`;
}


/* =====================================
   STREAK CALCULATIONS
===================================== */

function updateCombos(history) {
  const historyByDate = new Map(
    history.map(row => [
      row.study_date,
      row
    ])
  );

  const today = getLocalStudyDate();

  const todayRecord =
    historyByDate.get(today);

  let currentDate;

  /*
    If today's 10 questions are complete,
    today's result determines the streak.

    Otherwise, calculate the current streak
    starting from yesterday.
  */

  if (
    todayRecord &&
    todayRecord.total_questions >= 10
  ) {
    currentDate = todayRecord.qualifies
      ? today
      : null;
  } else {
    currentDate = getDateOffset(today, -1);
  }

  let currentCombo = 0;

  while (currentDate) {
    const record =
      historyByDate.get(currentDate);

    if (!record || !record.qualifies) {
      break;
    }

    currentCombo++;

    currentDate = getDateOffset(
      currentDate,
      -1
    );
  }


  /* Calculate best historical combo */

  const sortedDates = [
    ...historyByDate.keys()
  ].sort();

  let bestCombo = 0;
  let runningCombo = 0;
  let previousDate = null;

  sortedDates.forEach(date => {
    const record =
      historyByDate.get(date);

    if (!record.qualifies) {
      runningCombo = 0;
      previousDate = date;
      return;
    }

    if (
      previousDate &&
      date !== getDateOffset(previousDate, 1)
    ) {
      runningCombo = 0;
    }

    runningCombo++;

    bestCombo = Math.max(
      bestCombo,
      runningCombo
    );

    previousDate = date;
  });


  /* Update display */

  currentComboElement.textContent =
    `🔥 ${currentCombo}`;

  bestComboElement.textContent =
    `🔥 ${bestCombo}`;
}


/* =====================================
   DAILY QUESTION LIMIT
===================================== */

function applyDailyLimit() {
  const answersElement =
    document.getElementById("answers");

  if (dailyTotalQuestions >= 10) {
    answerButtons.forEach(button => {
      button.disabled = true;
    });

    answersElement.classList.add(
      "daily-limit"
    );

    feedbackElement.textContent =
      "Daily limit reached. Come back tomorrow!";

    feedbackElement.className = "feedback";

    attemptsElement.textContent =
      "You've completed 10 questions today.";

    nextButton.hidden = true;

    return true;
  }

  answersElement.classList.remove(
    "daily-limit"
  );

  return false;
}


/* =====================================
   LOAD DAILY HISTORY
===================================== */


async function loadDailyHistory() {
  if (!supabaseClient || !currentUser) {
    updateCombos([]);
    return;
  }

  try {
    const { data, error } =
      await supabaseClient
        .from(HISTORY_TABLE)
        .select(`
          study_date,
          correct_count,
          total_questions,
          qualifies,
          accuracy
        `)
        .eq("user_id", currentUser.id)
        .order("study_date", {
          ascending: true
        });

    if (error) throw error;

    const history = data || [];

    const today = getLocalStudyDate();

    const todayRecord = history.find(
      row => row.study_date === today
    );

    dailyCorrectCount =
      todayRecord?.correct_count ?? 0;

    dailyTotalQuestions =
      todayRecord?.total_questions ?? 0;

    // Load today's saved accuracy from Supabase.
    const dailyAccuracy =
      Number(todayRecord?.accuracy) || 0;

    accuracyElement.textContent =
      `${Math.round(dailyAccuracy)}%`;

    updateCombos(history);

    applyDailyLimit();

    console.log(
      "Katakana daily history loaded:",
      {
        dailyCorrectCount,
        dailyTotalQuestions,
        dailyAccuracy,
        history
      }
    );

  } catch (error) {
    console.error(
      "Error loading Katakana daily history:",
      error
    );
  }
}

/* =====================================
   SAVE DAILY HISTORY
===================================== */

async function saveDailyResult() {
  if (!supabaseClient || !currentUser) {
    return;
  }

  const qualifies =
    dailyTotalQuestions >= 10 &&
    (
      dailyCorrectCount /
      dailyTotalQuestions
    ) >= 0.70;

  const dailyResult = {
    user_id: currentUser.id,
    study_date: getLocalStudyDate(),
    correct_count: dailyCorrectCount,
    total_questions: dailyTotalQuestions,
    qualifies: qualifies
  };

  try {
    const { error } =
      await supabaseClient
        .from(HISTORY_TABLE)
        .upsert(dailyResult, {
          onConflict: "user_id,study_date"
        });

    if (error) throw error;

    console.log(
      "Katakana daily result saved:",
      dailyResult
    );

    await loadDailyHistory();

  } catch (error) {
    console.error(
      "Error saving Katakana daily result:",
      error
    );
  }
}


/* =====================================
   GENERATE ANSWER OPTIONS
===================================== */

function getUniqueAnswerOptions(correctAnswer) {
  const otherAnswers = [
    ...new Set(
      katakana
        .map(item => item[1])
        .filter(answer => answer !== correctAnswer)
    )
  ];

  const shuffled = otherAnswers.sort(
    () => Math.random() - 0.5
  );

  return [
    correctAnswer,
    ...shuffled.slice(0, 3)
  ].sort(() => Math.random() - 0.5);
}


/* =====================================
   START QUESTION
===================================== */

function startQuestion() {
  if (applyDailyLimit()) {
    return;
  }

  let nextCharacter;

  do {
    nextCharacter = katakana[
      Math.floor(
        Math.random() * katakana.length
      )
    ];

  } while (
    katakana.length > 1 &&
    nextCharacter[0] === previousCharacter
  );

  currentQuestion = nextCharacter;

  previousCharacter = currentQuestion[0];

  wrongAttempts = 0;
  questionFinished = false;

  characterElement.textContent =
    currentQuestion[0];

  feedbackElement.textContent =
    "Choose the matching sound.";

  feedbackElement.className = "feedback";

  attemptsElement.textContent =
    "You have 3 attempts.";

  nextButton.hidden = true;

  const options = getUniqueAnswerOptions(
    currentQuestion[1]
  );

  answerButtons.forEach((button, index) => {
    button.textContent = options[index];

    button.disabled = false;

    button.classList.remove(
      "right",
      "wrong"
    );
  });
}


/* =====================================
   COMPLETE QUESTION
===================================== */

function finishQuestion(wasCorrect) {
  if (questionFinished) {
    return;
  }

  questionFinished = true;

  questionCount++;

  if (wasCorrect) {
    correctCount++;
    dailyCorrectCount++;
  }

  dailyTotalQuestions++;

  updateStats();


  /* Highlight correct answer */

  answerButtons.forEach(button => {
    button.disabled = true;

    if (
      button.textContent === currentQuestion[1]
    ) {
      button.classList.add("right");
    }
  });


  /* Feedback */

  if (wasCorrect) {
    feedbackElement.textContent = "Correct!";

    feedbackElement.className =
      "feedback success";

  } else {
    feedbackElement.textContent =
      `The correct answer is ${currentQuestion[1]}.`;

    feedbackElement.className =
      "feedback error";
  }

  attemptsElement.textContent =
    `${wrongAttempts} incorrect ${
      wrongAttempts === 1
        ? "attempt"
        : "attempts"
    }.`;

  nextButton.hidden =
    dailyTotalQuestions >= 10;


  /* Save daily progress */

  saveDailyResult();


  /* Enforce daily limit */

  if (dailyTotalQuestions >= 10) {
    applyDailyLimit();
  }
}


/* =====================================
   ANSWER HANDLING
===================================== */

function handleAnswer(button) {
  if (
    questionFinished ||
    button.disabled
  ) {
    return;
  }

  const selectedAnswer =
    button.textContent;

  if (
    selectedAnswer === currentQuestion[1]
  ) {
    button.classList.add("right");

    finishQuestion(true);

    return;
  }


  /* Incorrect answer */

  wrongAttempts++;

  button.classList.add("wrong");
  button.disabled = true;

  const attemptsLeft =
    3 - wrongAttempts;

  if (attemptsLeft > 0) {
    feedbackElement.textContent =
      `Not quite. ${attemptsLeft} ${
        attemptsLeft === 1
          ? "attempt"
          : "attempts"
      } left.`;

    feedbackElement.className =
      "feedback error";

    attemptsElement.textContent =
      `You have ${attemptsLeft} ${
        attemptsLeft === 1
          ? "attempt"
          : "attempts"
      } remaining.`;

  } else {
    finishQuestion(false);
  }
}


/* =====================================
   AUTHENTICATION UI
===================================== */

function updateAuthUI() {
  const isOwner = Boolean(
    currentUser &&
    currentUser.email &&
    currentUser.email.toLowerCase() ===
      OWNER_EMAIL.toLowerCase()
  );

  authButton.textContent =
    isOwner ? "Sign out" : "Sign in";

  accountStatus.textContent =
    isOwner
      ? `Signed in as ${currentUser.email}`
      : "Study mode";

  if (!isOwner) {
    loginPanel.hidden = true;
  }
}


/* =====================================
   INITIALIZE AUTHENTICATION
===================================== */

async function initializeAuth() {
  if (!supabaseClient) {
    accountStatus.textContent = "Study mode";
    return;
  }

  try {
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) throw error;

    currentUser =
      data.session?.user ?? null;

    if (
      currentUser &&
      currentUser.email?.toLowerCase() !==
        OWNER_EMAIL.toLowerCase()
    ) {
      await supabaseClient.auth.signOut();

      currentUser = null;
    }

    updateAuthUI();

    if (currentUser) {
      await loadDailyHistory();

      // Refresh the question in case the
      // daily limit has already been reached.
      startQuestion();
    }

  } catch (error) {
    console.error(
      "Authentication initialization error:",
      error
    );

    accountStatus.textContent = "Study mode";
  }
}


/* =====================================
   SIGN IN / SIGN OUT BUTTON
===================================== */

authButton.addEventListener(
  "click",
  async () => {

    if (currentUser) {
      const { error } =
        await supabaseClient.auth.signOut();

      if (error) {
        console.error(
          "Sign-out error:",
          error
        );

        return;
      }

      currentUser = null;

      dailyCorrectCount = 0;
      dailyTotalQuestions = 0;

      updateAuthUI();
      updateCombos([]);

      startQuestion();

      return;
    }

    loginPanel.hidden = !loginPanel.hidden;

    loginMessage.textContent = "";

    if (!loginPanel.hidden) {
      loginEmail.focus();
    }
  }
);


/* =====================================
   EMAIL SIGN IN
===================================== */

loginPanel.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const email =
      loginEmail.value.trim().toLowerCase();

    if (
      email !== OWNER_EMAIL.toLowerCase()
    ) {
      loginMessage.textContent =
        "This account is not authorized.";

      return;
    }

    loginSubmit.disabled = true;

    loginMessage.textContent =
      "Sending sign-in link...";

    try {
      const redirectUrl =
        window.location.href
          .split("?")[0]
          .split("#")[0];

      const { error } =
        await supabaseClient.auth.signInWithOtp({
          email: email,

          options: {
            shouldCreateUser: false,
            emailRedirectTo: redirectUrl
          }
        });

      if (error) throw error;

      loginMessage.textContent =
        "Check your email for the sign-in link.";

    } catch (error) {
      console.error(
        "Sign-in error:",
        error
      );

      loginMessage.textContent =
        error.message ||
        "Unable to send sign-in link.";

    } finally {
      loginSubmit.disabled = false;
    }
  }
);


/* =====================================
   AUTH STATE CHANGES
===================================== */

supabaseClient.auth.onAuthStateChange(
  async (_event, session) => {

    const nextUser =
      session?.user ?? null;

    if (
      nextUser &&
      nextUser.email?.toLowerCase() !==
        OWNER_EMAIL.toLowerCase()
    ) {
      await supabaseClient.auth.signOut();

      currentUser = null;

      updateAuthUI();

      return;
    }

    const signedInNow =
      !currentUser && Boolean(nextUser);

    currentUser = nextUser;

    updateAuthUI();

    if (signedInNow && currentUser) {
      await loadDailyHistory();

      startQuestion();
    }
  }
);


/* =====================================
   BUTTON EVENTS
===================================== */

answerButtons.forEach(button => {
  button.addEventListener(
    "click",
    () => handleAnswer(button)
  );
});


nextButton.addEventListener(
  "click",
  startQuestion
);


document
  .getElementById("resetButton")
  .addEventListener("click", () => {

    // This resets session accuracy only.
    // It does not erase daily Supabase history.

    correctCount = 0;
    questionCount = 0;

    updateStats();

    startQuestion();
  });


/* =====================================
   START QUIZ
===================================== */

async function initializeQuiz() {
  updateStats();

  updateCombos([]);

  startQuestion();

  await initializeAuth();
}

initializeQuiz();
