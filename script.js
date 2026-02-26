/*
Short Answer Questions:
Q1: Why do we need async/await when using fetch()?


Q2: What does OpenTDB response_code mean?


Q3: What is stored under STORAGE_KEY and why JSON?


Q4: What happens from clicking Start Quiz to the first question?

*/

(function () {
    "use strict";

    // ------------------------------------------------------
    // Round configuration
    // ------------------------------------------------------
    var ROUND = { difficulty: "easy", amount: 10 };

    // Save best score in this browser (localStorage)
    var STORAGE_KEY = "lab6_trivia_best";

    // Open Trivia DB endpoints (no API key required)
    var API = {
        token: "https://opentdb.com/api_token.php?command=request",
        questionsUrl: function (amount, difficulty, category, token) {
        var p = new URLSearchParams();
        p.set("amount", String(amount));
        p.set("difficulty", difficulty);
        p.set("type", "multiple");
        if (category) { p.set("category", category); }
        if (token)    { p.set("token", token); }
        return "https://opentdb.com/api.php?" + p.toString();
        }
    };

    function $(id) { return document.getElementById(id); }

    // Screens
    var screenStart  = $("screenStart");
    var screenQuiz   = $("screenQuiz");
    var screenResult = $("screenResult");

    // Inputs
    var nameInput      = $("name");
    var emailInput     = $("email");
    var categorySelect = $("category");
    var modeSelect     = $("mode");

    // Errors
    var errName  = $("errName");
    var errEmail = $("errEmail");

    // Buttons
    var btnStart     = $("btnStart");
    var btnReset     = $("btnReset");
    var btnQuit      = $("btnQuit");
    var btnPlayAgain = $("btnPlayAgain");
    var btnHome      = $("btnHome");

    // Progress UI
    var progressBox = $("progressBox");

    // Quiz UI
    var quizTitle    = $("quizTitle");
    var scoreEl      = $("score");
    var qNumEl       = $("qNum");
    var qTotalEl     = $("qTotal");
    var questionText = $("questionText");
    var choicesBox   = $("choices");

    // Loading + errors
    var loadingBox  = $("loadingBox");
    var apiErrorBox = $("apiErrorBox");

    // Result UI
    var resultTitle = $("resultTitle");
    var resultText  = $("resultText");
    var reviewBox   = $("reviewBox");

    // Runtime state
    var state = {
        player: { name: "", email: "", category: "", mode: "easy" },
        token: null,
        questions: [],
        idx: 0,
        score: 0
    };

    // Screen helpers
    function show(el) { el.classList.remove("hidden"); }
    function hide(el) { el.classList.add("hidden"); }

    function showOnly(which) {
        hide(screenStart);
        hide(screenQuiz);
        hide(screenResult);
        show(which);
    }

    function setLoading(on) {
        if (on) { show(loadingBox); }
        else    { hide(loadingBox); }
    }

    function setApiError(msg) {
        if (!msg) {
        apiErrorBox.textContent = "";
        hide(apiErrorBox);
        return;
        }
        apiErrorBox.textContent = msg;
        show(apiErrorBox);
    }

    function decodeHTMLEntities(s) {
        var t = document.createElement("textarea");
        t.innerHTML = s;
        return t.value;
    }

    function shuffle(arr) {
        var a = arr.slice();
        var i, j, tmp;
        for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
        }
        return a;
    }

    // ======================================================
    // TODO #1 (Ch 9): Form validation
    // ======================================================
    function validateStartForm() {
        errName.textContent  = "";
        errEmail.textContent = "";

        var valid = true;

        // Validate name: 2–30 characters after trim()
        var name = nameInput.value.trim();
        if (name.length < 2 || name.length > 30) {
            errName.textContent = "Name must be between 2 and 30 characters.";
            valid = false;
        }

        // Validate email: must have an @ and a dot after the @
        var email = emailInput.value.trim();
        var atSignIndex = email.indexOf("@");
        var dotIndex = email.lastIndexOf(".");
        var hasDotAfterAt = atSignIndex < dotIndex;

        if (email === "") {
            errEmail.textContent = "Please enter a valid email (e.g. a@b.com).";
            valid = false;
        } else if (atSignIndex === -1) {
            errEmail.textContent = "Please enter a valid email (e.g. a@b.com).";
            valid = false;
        } else if (!hasDotAfterAt) {
            errEmail.textContent = "Please enter a valid email (e.g. a@b.com).";
            valid = false;
        }

        return valid;
}

    // ======================================================
    // TODO #2 (Ch 10): Load best score from localStorage
    // ======================================================
    function loadProgress() {
        try {
                var raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) { 
                    return { bestScore: 0, bestTotal: 0, attempts: 0 }; 
                }
                return JSON.parse(raw);
            } 
            
        catch (e) {
                return { bestScore: 0, bestTotal: 0, attempts: 0 };
            }
    }

    // ======================================================
    // TODO #3 (Ch 10): Save best score to localStorage
    // ======================================================
    function saveProgress(obj) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }

    // ======================================================
    // TODO #4 (Ch 10): Request a token from OpenTDB
    // ======================================================
    async function getToken() {
        var res = await fetch(API.token);
        if (!res.ok) { 
            throw new Error("Token request failed (HTTP " + res.status + ")"); 
        }

        var data = await res.json();
        if (!data.token) { 
            throw new Error("No token returned from OpenTDB."); 
        }
        return data.token;
    }

    // ======================================================
    // TODO #5 (Ch 10): Fetch questions for the round
    // ======================================================
    async function fetchQuestions(cfg) {
        var url = API.questionsUrl(cfg.amount, cfg.difficulty, state.player.category, state.token);
        var res = await fetch(url);
        if (!res.ok) { 
            throw new Error("Questions request failed (HTTP " + res.status + ")"); 
        }

        var data = await res.json();
        if (data.response_code === 5) {
            throw new Error("Rate limit hit — please wait a few seconds and try again.");
        }

        if (data.response_code !== 0) {
            throw new Error("OpenTDB error (code " + data.response_code + ").");
        }
        return data.results;
    }

    // Display best score summary on Start screen
    function renderBest() {
        var p = loadProgress();
        var bestScore = (p && typeof p.bestScore === "number") ? p.bestScore : 0;
        var bestTotal = (p && typeof p.bestTotal === "number") ? p.bestTotal : 0;
        var attempts  = (p && typeof p.attempts  === "number") ? p.attempts  : 0;

        if (bestTotal > 0) {
        progressBox.textContent = "Best score: " + bestScore + "/" + bestTotal + " • Attempts: " + attempts;
        } else {
        progressBox.textContent = "Best score: none yet • Attempts: " + attempts;
        }
    }

    // Copy inputs into state.player
    function startFromForm() {
        state.player.name     = nameInput.value.trim();
        state.player.email    = emailInput.value.trim();
        state.player.category = categorySelect.value;
        state.player.mode     = modeSelect.value;
    }

    function beginRound() {
        state.questions = [];
        state.idx   = 0;
        state.score = 0;

        scoreEl.textContent  = "0";
        qNumEl.textContent   = "1";
        qTotalEl.textContent = String(ROUND.amount);
        setApiError(null);
    }

    function renderQuestion() {
        var q = state.questions[state.idx];

        // Show current difficulty in the title (Task D)
        quizTitle.textContent = "Trivia Round (" + ROUND.difficulty + ")";

        qTotalEl.textContent = String(ROUND.amount);
        qNumEl.textContent   = String(state.idx + 1);

        questionText.textContent = q.question;
        choicesBox.innerHTML = "";

        var i;
        for (i = 0; i < q.choices.length; i++) {
        (function (choiceText) {
            var btn = document.createElement("button");
            btn.className   = "choiceBtn";
            btn.textContent = choiceText;
            btn.addEventListener("click", function () {
            handleAnswer(choiceText);
            });
            choicesBox.appendChild(btn);
        })(q.choices[i]);
        }
    }

    function handleAnswer(choiceText) {
        var q = state.questions[state.idx];

        // Task E: Save the user's choice on the question object
        q.userChoice = choiceText;

        if (choiceText === q.correct) {
            state.score = state.score + 1;
            scoreEl.textContent = String(state.score);
        }

        state.idx = state.idx + 1;

        if (state.idx >= ROUND.amount) {
            finishRound();
        } 
        else {
            renderQuestion();
        }
    }

    function finishRound() {
        showOnly(screenResult);

        resultTitle.textContent = "Result";
        resultText.textContent  = state.player.name + ", your score is " + state.score + "/" + ROUND.amount + ".";

        // Task E: Answer review string
        var lines = [];
        lines.push("Answer Review (Your answer vs Correct answer):");
        lines.push("");

        var i;
        for (i = 0; i < state.questions.length; i++) {
            var qq = state.questions[i];
            var yourAns = qq.userChoice || "(no answer)";
            var ok = (yourAns === qq.correct);

            lines.push((i + 1) + ") " + qq.question);
            lines.push("   Your answer: " + yourAns + "  " + (ok ? "✓" : "✗"));
            lines.push("   Correct: " + qq.correct);
            lines.push("");
        }

        // Show the review text on the page
        reviewBox.textContent = lines.join("\n");

        // Update best score in localStorage
        var p = loadProgress();
        var attempts = (p && typeof p.attempts  === "number") ? p.attempts  : 0;
        var bestScore = (p && typeof p.bestScore === "number") ? p.bestScore : 0;
        var bestTotal = (p && typeof p.bestTotal === "number") ? p.bestTotal : 0;

        attempts = attempts + 1;

        if (bestTotal === 0 || state.score > bestScore) {
            saveProgress({ bestScore: state.score, bestTotal: ROUND.amount, attempts: attempts });
        } 
        else {
            saveProgress({ bestScore: bestScore, bestTotal: bestTotal, attempts: attempts });
        }

        renderBest();
    }

    async function runRoundFlow() {
        if (!validateStartForm()) { return; }

        startFromForm();

        // Task D: Set ROUND.difficulty from the dropdown selection
        ROUND.difficulty = state.player.mode;

        beginRound();
        showOnly(screenQuiz);

        try {
        setLoading(true);

        if (!state.token) {
            state.token = await getToken();
        }

        var raw = await fetchQuestions(ROUND);

        // Normalize API data into internal format
        state.questions = [];
        var i;
        for (i = 0; i < raw.length; i++) {
            var item = raw[i];

            var correct = decodeHTMLEntities(item.correct_answer);

            var incorrect = [];
            var k;
            for (k = 0; k < item.incorrect_answers.length; k++) {
            incorrect.push(decodeHTMLEntities(item.incorrect_answers[k]));
            }

            var choices = shuffle([correct].concat(incorrect));

            state.questions.push({
            question: decodeHTMLEntities(item.question),
            correct:  correct,
            choices:  choices
            });
        }

        setLoading(false);
        renderQuestion();

        } catch (e) {
        setLoading(false);
        setApiError(e.message || "Network / API error.");
        }
    }

    // Event listeners
    btnStart.addEventListener("click", function () {
        runRoundFlow();
    });

    btnReset.addEventListener("click", function () {
        localStorage.removeItem(STORAGE_KEY);
        renderBest();
        alert("Best score reset.");
    });

    btnQuit.addEventListener("click", function () {
        showOnly(screenStart);
    });

    btnPlayAgain.addEventListener("click", function () {
        runRoundFlow();
    });

    btnHome.addEventListener("click", function () {
        showOnly(screenStart);
    });

    // Boot
    renderBest();
    showOnly(screenStart);

})();