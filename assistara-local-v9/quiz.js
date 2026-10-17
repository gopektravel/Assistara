/* ----------------------------------------------------------------------------
   Assistara Remote Income Potential Quiz — client.

   This file NEVER scores anything. It collects answers, hands them to
   /api/quiz-funnel, and paints the report the server returns. Keeping scoring
   off the browser is what makes a stored result reproducible and what stops a
   visitor from editing a score into existence.

   /api/quiz-funnel is a stable public path that Vercel rewrites onto the
   consolidated masterclass-identity function (tagged ?quiz=1). That keeps the
   whole Academy inside the Vercel Hobby plan's 12-function limit without this
   browser ever needing to know which function serves the quiz.

   It also never requires an email: the result is fetched with the answers
   alone, and the lead form is an optional extra that appears afterwards.
   ---------------------------------------------------------------------------- */
(function () {
  "use strict";

  var API = "/api/quiz-funnel";
  var CLIENT_KEY_LS = "assistara_quiz_client";
  var PROGRESS_SS = "assistara_quiz_progress";
  var RESULT_SS = "assistara_quiz_result";
  var TOTAL = 10;
  // Kept in step with PLAUSIBLE_MIN_MS in api/quiz-funnel.js.
  var PLAUSIBLE_MIN_MS = 8000;

  var state = {
    meta: null,
    index: 0,          // 0-based question index
    answers: {},
    clientKey: "",
    startedAt: 0,
    submitting: false,
    done: false,
  };

  var $ = function (id) { return document.getElementById(id); };

  // ---------------------------------------------------------------- utils

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // The server writes **bold** markers; turn them into real markup after
  // escaping, so a name can never inject HTML but the emphasis survives.
  function rich(v) {
    return esc(v).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }

  function peso(n) {
    return "\u20b1" + Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function focusHeading(el, preventScroll) {
    if (!el) return;
    // Defer so the section is visible before focus lands on it.
    requestAnimationFrame(function () {
      try { el.focus({ preventScroll: !!preventScroll }); }
      catch (e) { el.focus(); }
    });
  }

  function reducedMotion() {
    return !!(window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // Question transitions: the card animates out, the next question renders,
  // then the card animates in. Purely presentational — navigation state has
  // already changed before this runs, and reduced motion skips it entirely.
  var navToken = 0;

  function transitionTo(next) {
    var card = $("quizCard");
    var my = ++navToken;
    if (!card || reducedMotion()) { next(); return; }
    card.classList.remove("q-anim-in");
    card.classList.add("q-anim-out");
    window.setTimeout(function () {
      if (my !== navToken) return; // a newer navigation superseded this one
      card.classList.remove("q-anim-out");
      next();
      card.classList.add("q-anim-in");
    }, 150);
  }

  // Varied, grown-up microcopy under the progress bar. Display-only: it never
  // touches scoring, answers or tracking. Index-aligned with the 10 questions.
  var Q_MICRO = [
    "First one. Two seconds.",
    "This one shapes your income model.",
    "There is no wrong answer here.",
    "Halfway is closer than it feels.",
    "Good. The interesting half starts now.",
    "Your answers are starting to pattern-match.",
    "A few people change their answer here. That is fine.",
    "Second to last. You are nearly there.",
    "Tick only what you already hold.",
    "Done. Building your result now.",
  ];

  function clientKey() {
    if (state.clientKey) return state.clientKey;
    var k = "";
    try { k = localStorage.getItem(CLIENT_KEY_LS) || ""; } catch (e) { k = ""; }
    if (!/^qz_[0-9a-f]{32}$/.test(k)) {
      var bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      k = "qz_" + Array.prototype.map.call(bytes, function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
      try { localStorage.setItem(CLIENT_KEY_LS, k); } catch (e) { /* private mode */ }
    }
    state.clientKey = k;
    return k;
  }

  // Attribution is resolved once by the existing Assistara module (app.js),
  // exactly as it is for an Academy application. Anything it has not resolved
  // is simply omitted rather than invented here.
  function attribution() {
    var a = window.AssistaraAttribution || {};
    var out = {};
    try {
      var saved = typeof a.get === "function" ? a.get() : null;
      if (saved) {
        if (saved.token) out.token = saved.token;
        if (saved.visit_id) out.visitId = saved.visit_id;
      }
      if (typeof a.visitorId === "function" && a.visitorId()) out.visitorId = a.visitorId();
      else if (localStorage.getItem("assistara_visitor_id")) out.visitorId = localStorage.getItem("assistara_visitor_id");
    } catch (e) { /* storage blocked: attribution degrades to UTM/referrer only */ }

    var p = new URLSearchParams(location.search);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      var v = p.get(k);
      if (v) out[k] = v.slice(0, 256);
    });
    out.landing_path = location.pathname + location.search;
    if (document.referrer) out.referrer = document.referrer.slice(0, 1024);
    return out;
  }

  function eventKey() {
    // Stable within a page life so a re-render cannot double count, but new
    // for every real visit.
    if (!state._evKey) {
      state._evKey = Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    return state._evKey;
  }

  // Fire-and-forget: analytics must never block or break the quiz.
  function track(name, extra) {
    try {
      var payload = Object.assign({
        action: "event",
        event: name,
        clientKey: clientKey(),
        eventKey: eventKey(),
        attribution: attribution(),
      }, extra || {});
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API, new Blob([body], { type: "application/json" }));
        return;
      }
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true })
        .catch(function () {});
    } catch (e) { /* analytics is never allowed to throw into the UI */ }
  }

  function saveProgress() {
    try {
      sessionStorage.setItem(PROGRESS_SS, JSON.stringify({
        index: state.index,
        answers: state.answers,
        at: Date.now(),
      }));
    } catch (e) { /* private mode: refresh simply restarts */ }
  }

  function clearProgress() {
    try { sessionStorage.removeItem(PROGRESS_SS); } catch (e) {}
  }

  // ---------------------------------------------------------------- meta

  function questionAt(i) {
    return state.meta && state.meta.questions ? state.meta.questions[i] : null;
  }

  function loadMeta() {
    return fetch(API + "?action=meta", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok || !Array.isArray(d.questions) || d.questions.length !== TOTAL) {
          throw new Error("The quiz could not be loaded.");
        }
        state.meta = d;
        return d;
      });
  }

  // ------------------------------------------------------- option marking

  function optionMark(q) {
    // Radio for a single choice, checkbox for multi-select. Both are real
    // inputs so keyboard and screen-reader behaviour is native.
    return q.type === "multi" ? "checkbox" : "radio";
  }

  function isAnswered(q) {
    var v = state.answers[q.id];
    if (q.type === "multi") return Array.isArray(v) && v.length > 0;
    if (q.type === "income") return Number.isFinite(Number(v));
    return typeof v === "string" && v.length > 0;
  }

  // ------------------------------------------------------ question render

  function renderQuestion() {
    var q = questionAt(state.index);
    if (!q) return;

    var n = state.index + 1;
    $("qKicker").textContent = "QUESTION " + n + " OF " + TOTAL;
    $("qTitle").textContent = q.title || "";

    if (q.support) {
      $("qSupport").textContent = q.support;
      show($("qSupport"));
    } else {
      hide($("qSupport"));
    }

    // progress
    $("progressLabel").textContent = "Question " + n + " of " + TOTAL;
    var pct = Math.round((n / TOTAL) * 100);
    $("progressPct").textContent = pct + "%";
    $("progressFill").style.width = pct + "%";
    $("progressBar").setAttribute("aria-valuenow", String(n));
    $("progressBar").setAttribute("aria-valuetext", "Question " + n + " of " + TOTAL);

    var micro = $("qMicro");
    if (micro) micro.textContent = Q_MICRO[state.index] || "";

    var box = $("qOptions");
    box.innerHTML = "";
    box.className = "quiz-options";

    if (q.type === "income") {
      hide(box);
      hide($("qIncome")) === false;
      show($("qIncome"));
      renderIncome(q);
    } else {
      hide($("qIncome"));
      show(box);
      renderOptions(q, box);
    }

    hide($("qError"));

    // Back is always available except on the first question.
    $("qBack").hidden = state.index === 0;
    $("qNext").disabled = !isAnswered(q);
    $("qNext").innerHTML = state.index === TOTAL - 1
      ? 'Finish <span aria-hidden="true">→</span>'
      : 'Next <span aria-hidden="true">&rarr;</span>';

    focusHeading($("qTitle"));
  }

  function renderOptions(q, box) {
    var chosen = state.answers[q.id];
    var multi = q.type === "multi";
    if (multi) box.classList.add("is-multi");

    // Two columns once there are enough options and there is room for them.
    if ((q.options || []).length >= 6 && q.id !== "q6") box.classList.add("cols-2");

    (q.options || []).forEach(function (o) {
      var id = "opt_" + q.id + "_" + o.key;
      var lab = document.createElement("label");
      lab.className = "quiz-option";
      lab.setAttribute("for", id);

      var input = document.createElement("input");
      input.type = optionMark(q);
      input.name = "q_" + q.id;
      input.id = id;
      input.value = o.key;
      input.className = "sr-only";

      var checked = multi
        ? Array.isArray(chosen) && chosen.indexOf(o.key) !== -1
        : chosen === o.key;
      if (checked) input.checked = true;

      input.addEventListener("change", function () {
        onChoose(q, o.key, input.checked, input);
      });

      var mark = document.createElement("span");
      mark.className = "qo-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "\u2713";

      var text = document.createElement("span");
      text.className = "qo-text";
      text.textContent = o.label;

      lab.appendChild(input);
      lab.appendChild(mark);
      lab.appendChild(text);
      box.appendChild(lab);
    });
  }

  function onChoose(q, key, checked, input) {
    if (q.type === "multi") {
      var cur = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
      if (checked) {
        if (cur.indexOf(key) === -1) cur.push(key);
      } else {
        cur = cur.filter(function (k) { return k !== key; });
      }

      // An "exclusive" option ("none yet", "no formal qualifications") is
      // mutually exclusive with every other choice on the same question.
      // Clearing it here is a UI nicety; the server refuses the combination
      // regardless.
      var exclusive = (q.options || []).filter(function (o) { return o.exclusive; })
        .map(function (o) { return o.key; });
      if (exclusive.indexOf(key) !== -1 && checked) {
        cur = [key];
        Array.prototype.forEach.call(
          document.querySelectorAll('input[name="q_' + q.id + '"]'),
          function (el) { if (el.value !== key) el.checked = false; }
        );
      } else if (exclusive.indexOf(key) === -1 && checked) {
        cur = cur.filter(function (k) { return exclusive.indexOf(k) === -1; });
        Array.prototype.forEach.call(
          document.querySelectorAll('input[name="q_' + q.id + '"]'),
          function (el) { if (exclusive.indexOf(el.value) !== -1) el.checked = false; }
        );
      }

      state.answers[q.id] = cur;
    } else {
      state.answers[q.id] = key;
    }

    hide($("qError"));
    $("qNext").disabled = !isAnswered(q);
    saveProgress();
    queueProgress();
  }

  // ----------------------------------------------------------- income q2

  var incomeDebounce = null;

  function renderIncome(q) {
    var slider = $("incomeSlider");
    var number = $("incomeNumber");
    var min = Number(q.min) || 5000;
    var max = Number(q.max) || 100000;
    var step = Number(q.step) || 5000;

    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    number.min = String(min);
    number.max = String(max);
    number.step = String(step);

    $("incomeSymbol").textContent = (state.meta.incomeModel && state.meta.incomeModel.symbol) || "\u20b1";
    $("incomeMin").textContent = peso(min);
    $("incomeMax").textContent = peso(max);

    var value = Number(state.answers.q2);
    if (!Number.isFinite(value)) value = Number(q.defaultAmount) || min;
    slider.value = String(value);
    number.value = String(value);
    paintIncome(value);
    $("qNext").disabled = !Number.isFinite(value);
  }

  function paintIncome(value) {
    $("incomeAmount").textContent = Math.round(value).toLocaleString("en-US");
  }

  function setIncome(rawValue, source) {
    var q = questionAt(state.index);
    if (!q || q.type !== "income") return;
    var min = Number(q.min), max = Number(q.max), step = Number(q.step);
    var n = Number(rawValue);

    if (!Number.isFinite(n) || String(rawValue).trim() === "") {
      // Leave the previous value in place and let the user retype; never store
      // NaN and never silently invent a goal.
      hide($("incomeError"));
      $("qNext").disabled = Object.keys(state.answers).indexOf("q2") === -1;
      return;
    }

    n = Math.min(max, Math.max(min, n));
    n = Math.round(n / step) * step;
    n = Math.min(max, Math.max(min, n));

    state.answers.q2 = n;
    paintIncome(n);
    hide($("incomeError"));
    $("qNext").disabled = false;

    if (source !== "slider") $("incomeSlider").value = String(n);
    if (source !== "number") $("incomeNumber").value = String(n);

    saveProgress();
    // Typing fires on every keystroke; debounce the server write.
    queueProgress();
  }

  // ------------------------------------------------------------ progress

  var progressTimer = null;

  function queueProgress() {
    if (progressTimer) clearTimeout(progressTimer);
    progressTimer = setTimeout(flushProgress, 900);
  }

  function flushProgress() {
    progressTimer = null;
    if (state.done) return;
    var q = questionAt(state.index);
    try {
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "progress",
          clientKey: clientKey(),
          answers: state.answers,
          currentQuestion: state.index + 1,
          elapsedMs: Date.now() - state.startedAt,
          honeypot: "",
          attribution: attribution(),
        }),
        keepalive: true,
      }).catch(function () { /* resume-after-refresh is a nicety, not a requirement */ });
    } catch (e) { }
    void q;
  }

  // ------------------------------------------------------------ navigation

  function goNext() {
    var q = questionAt(state.index);
    if (!q) return;
    if (!isAnswered(q)) {
      var err = $("qError");
      err.textContent = q.type === "multi"
        ? "Choose at least one option to continue."
        : "Choose an option to continue.";
      show(err);
      return;
    }

    track("question_completed", { questionNumber: state.index + 1 });
    saveProgress();

    if (state.index >= TOTAL - 1) {
      goReveal();
      return;
    }
    state.index += 1;
    saveProgress();
    transitionTo(function () {
      renderQuestion();
      renderOptionsA11y();
    });
  }

  function goBack() {
    if (state.index === 0) return;
    state.index -= 1;
    saveProgress();
    transitionTo(function () {
      renderQuestion();
      renderOptionsA11y();
    });
  }

  // Announce the current question to a screen reader once it has changed,
  // without stealing focus mid-answer.
  function renderOptionsA11y() {
    var box = $("qOptions");
    if (!box || box.hidden) return;
    var first = box.querySelector("input");
    if (first) first.setAttribute("aria-describedby", "progressLabel");
  }

  // Reveal step is owned by quiz-lead.js logic below (part 2 of this file).
  function goReveal() {
    if (typeof window.__quizGoReveal === "function") window.__quizGoReveal();
  }

  // ------------------------------------------------------------ keyboard

  function onKeydown(e) {
    if ($("quizPlay").hidden) return;
    var target = e.target;
    if (!target) return;

    // Enter or Space on the primary button is native; only hijack when focus
    // is inside the option group.
    var inOptions = target.closest && target.closest("#qOptions");

    if (inOptions && (e.key === "ArrowDown" || e.key === "ArrowRight")) {
      e.preventDefault();
      moveFocus(1);
    } else if (inOptions && (e.key === "ArrowUp" || e.key === "ArrowLeft")) {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Enter" && !inOptions) {
      // Enter anywhere except inside a text field advances.
      if (target.tagName === "INPUT" && (target.type === "text" || target.type === "email" || target.type === "number")) return;
      e.preventDefault();
      goNext();
    }
  }

  function moveFocus(delta) {
    var inputs = Array.prototype.slice.call(
      document.querySelectorAll('#qOptions input[type="radio"], #qOptions input[type="checkbox"]')
    );
    if (!inputs.length) return;
    var current = inputs.indexOf(document.activeElement);
    var next = current === -1 ? 0 : (current + delta + inputs.length) % inputs.length;
    var el = inputs[next];
    el.focus();
    // In a radio group browsers already select on arrow; ensure multi-select
    // focus does not silently toggle.
    if (!el.checked && el.type === "radio") {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ------------------------------------------------------------- startup

  function restore() {
    // Resume where a refresh left the visitor, but never older than the window
    // the server publishes: stale half-answers are more confusing than a fresh
    // start. The fallback is only used if the meta route never loaded.
    var ttl = (state.meta && Number(state.meta.sessionTtlMs)) || 3600000;
    try {
      var raw = sessionStorage.getItem(PROGRESS_SS);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && Date.now() - Number(saved.at || 0) < ttl && saved.answers) {
          state.answers = saved.answers;
          state.index = Math.min(TOTAL - 1, Math.max(0, Number(saved.index) || 0));
          return true;
        }
        clearProgress();
      }
    } catch (e) { }
    return false;
  }

  // There is no landing screen and no start button: question 1 paints as soon
  // as the questions have loaded. The banner on /academy is the only click
  // between the hero and this screen.
  function startQuiz() {
    track("started");
    show($("quizPlay"));
    state.startedAt = Date.now();
    renderQuestion();
    saveProgress();
    queueProgress();
  }

  function boot() {
    $("qNext").addEventListener("click", goNext);
    $("qBack").addEventListener("click", goBack);
    document.addEventListener("keydown", onKeydown);

    $("incomeSlider").addEventListener("input", function () { setIncome(this.value, "slider"); });
    $("incomeNumber").addEventListener("input", function () { setIncome(this.value, "number"); });
    $("incomeNumber").addEventListener("blur", function () {
      // Snap on blur so a typed 27,000 becomes a value the model can use.
      if (this.value !== "") setIncome(this.value, "number");
    });

    window.addEventListener("beforeunload", function () {
      if (state.done) return;
      track("abandoned", { questionNumber: state.index + 1 });
      flushProgress();
    });

    // Expose what part 2 needs.
    window.__quizState = state;
    window.__quizTrack = track;
    window.__quizAttribution = attribution;
    window.__quizClientKey = clientKey;
    window.__quizEsc = esc;
    window.__quizRich = rich;
    window.__quizPeso = peso;
    window.__quizShow = show;
    window.__quizHide = hide;
    window.__quizFocus = focusHeading;
    window.__quizClearProgress = clearProgress;
    window.__quizRenderQuestion = renderQuestion;
    window.__quizPLAUSIBLE_MIN_MS = PLAUSIBLE_MIN_MS;

    loadMeta().then(function () {
      if (restore()) {
        // A refresh mid-quiz returns the visitor to the question they were on
        // rather than silently restarting them.
        show($("quizPlay"));
        state.startedAt = Date.now();
        renderQuestion();
      } else {
        // Otherwise the quiz starts itself. There is no start screen to click
        // through before question 1.
        startQuiz();
      }
      if (typeof window.__quizInitReveal === "function") window.__quizInitReveal();
    }).catch(function (err) {
      var card = $("quizCard");
      if (card) {
        card.innerHTML = '<p class="quiz-kicker">SORRY</p>' +
          '<h2 class="quiz-title">The quiz could not be loaded.</h2>' +
          '<p class="quiz-support">Please refresh the page, or try again in a moment.</p>' +
          '<div class="quiz-nav"><button class="btn btn-dark quiz-next" type="button" ' +
          'onclick="location.reload()">Reload the page</button></div>';
      }
      if (window.console) console.error("quiz meta", err);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
