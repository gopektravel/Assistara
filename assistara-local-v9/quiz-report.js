/* ----------------------------------------------------------------------------
   Assistara Remote Income Potential Quiz - reveal step and submission.

   RESULTS ARE EMAIL ONLY. The visitor completes the quiz, enters their email
   address (the only required field), and the full personalised report is
   delivered by email. Nothing about the match, the reasoning or the 30-day
   plan is rendered on the website - only a confirmation screen.

   The submission is fire-and-forget for the report: on success the page shows
   an honest confirmation only when the report was actually queued
   (emailQueued === true). If queueing fails it shows an error and never
   claims the email was sent.
---------------------------------------------------------------------------- */
(function () {
  "use strict";

  var API = "/api/quiz-funnel";

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function $(id) { return document.getElementById(id); }
  function track(name, extra) {
    if (window.__quizTrack) window.__quizTrack(name, extra);
  }
  function esc(v) {
    return window.__quizEsc ? window.__quizEsc(v) : String(v ?? "");
  }
  function focusHeading(el, preventScroll) {
    if (window.__quizFocus) window.__quizFocus(el, preventScroll);
  }

  var startedAt = 0;
  var lastToken = "";
  // The server's stored promotional decision, kept separate from report
  // delivery. Only ever used to render the preferences panel honestly.
  var marketingOptIn = null;

  // ------------------------------------------------------------ reveal
  function goReveal() {
    hide($("quizPlay"));
    hide($("quizConfirm"));
    var card = $("quizReveal");
    if (card) {
      card.classList.remove("q-anim-in");
      void card.offsetWidth;
      card.classList.add("q-anim-in");
    }
    show(card);
    focusHeading($("revealTitle"));
    try { $("quizReveal").scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { }
    startedAt = startedAt || Date.now();
  }
  window.__quizGoReveal = goReveal;

  function validateLead() {
    var email = $("leadEmail").value.trim();
    var emailErr = $("emailError");
    hide(emailErr);
    // Email is the only required field.
    if (!email) {
      emailErr.textContent = "Enter your email to receive your report.";
      show(emailErr);
      return false;
    }
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email)) {
      emailErr.textContent = "That email address does not look right.";
      show(emailErr);
      return false;
    }
    return true;
  }

  function submit() {
    var state = window.__quizState;
    var errBox = $("submitError");
    hide(errBox);

    var email = $("leadEmail").value.trim().toLowerCase();
    // Promotional consent is optional, unchecked by default, needs an address,
    // and is kept entirely separate from report delivery.
    var consent = $("marketingConsent").checked && !!email;

    if (!validateLead()) return;

    var btn = $("revealSubmit");
    btn.disabled = true;
    btn.innerHTML = 'Sending <span aria-hidden="true">→</span>';
    btn.classList.add("is-loading");
    startedAt = startedAt || Date.now();

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        clientKey: window.__quizClientKey(),
        answers: state.answers,
        email: email,
        marketingConsent: consent,
        honeypot: $("quizHoneypot").value,
        elapsedMs: Date.now() - startedAt,
        attribution: window.__quizAttribution(),
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.innerHTML = 'Send my report <span aria-hidden="true">→</span>';
        btn.classList.remove("is-loading");

        if (!res.data || res.data.ok !== true) {
          var msg = (res.data && res.data.error) || "Something went wrong. Please try again.";
          errBox.textContent = msg;
          show(errBox);
          return;
        }

        lastToken = res.data.token || "";
        try { sessionStorage.setItem("assistara_quiz_result", res.data.token); } catch (e) { }
        // The server's stored decision is the one that counts.
        if (typeof res.data.marketingConsent === "boolean") {
          marketingOptIn = res.data.marketingConsent;
        }

        hide($("quizReveal"));

        // The confirmation appears only when the report was actually queued.
        // If queueing failed we show an error and never claim it was sent.
        if (res.data.emailQueued === true) {
          showConfirm(true);
          track("lead_submitted");
          track("email_sent");
        } else {
          showConfirm(false);
          track("lead_submitted");
          track("email_failed");
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = 'Send my report <span aria-hidden="true">→</span>';
        btn.classList.remove("is-loading");
        errBox.textContent = "We could not reach the server. Check your connection and try again.";
        show(errBox);
      });
  }

  // The breadcrumb trail belongs to the quiz flow, not the confirmation:
  // on the confirmation it is redundant with the header's "Back to Academy".
  function setCrumbs(visible) {
    var crumbs = document.querySelector(".quiz-crumbs");
    if (!crumbs) return;
    if (visible) crumbs.removeAttribute("hidden");
    else crumbs.setAttribute("hidden", "");
  }

  function showConfirm(sent) {
    hide($("quizReveal"));
    setCrumbs(false);
    var card = $("quizConfirm");
    var successDiv = $("quizConfirmSuccess");
    var errorDiv = $("quizConfirmError");
    var heading = $("confirmHeading");
    var support = $("confirmSupport");
    var error = $("confirmError");
    var retry = $("confirmRetry");
    var errorHdr = $("confirmErrorHdr");
    var errorSupport = $("confirmErrorSupport");
    if (sent) {
      heading.textContent = "Your next chapter is in your inbox! \u{1F49B}";
      support.textContent = "You did it! Your personalized Remote Career Report is on its way.";
      show(successDiv);
      hide(errorDiv);
      if (retry) hide(retry);
    } else {
      errorHdr.textContent = "We could not send your report.";
      errorSupport.textContent = "Something went wrong on our end. Please try again.";
      show(errorDiv);
      hide(successDiv);
      if (retry) show(retry);
    }
    show(card);
    focusHeading(sent ? heading : errorHdr, true);
    try { $("quizConfirm").scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { }
  }

  // ------------------------------------------ email preferences panel
  // Promotional consent can be withdrawn from the same link the email uses for
  // "manage preferences" (?prefs=1). Withdrawing never touches the report and
  // never requires an account.
  function wirePrefs() {
    var panel = $("rPrefs");
    if (!panel) return;
    var text = $("rPrefsText");
    var btn = $("rPrefsWithdraw");
    if (!text || !btn) return;

    if (marketingOptIn === true) {
      text.innerHTML = "You are on the occasional remote-work tips and career opportunities list. Your report email is separate and always stays on.";
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = "Stop occasional career emails";
    } else {
      text.innerHTML = "You are not on the occasional career emails list. Your report is sent either way, and no promotional email is ever a condition of getting it.";
      btn.hidden = true;
    }
    show(panel);

    btn.onclick = function () {
      if (marketingOptIn !== true || !lastToken) return;
      btn.disabled = true;
      btn.innerHTML = "Stopping <span aria-hidden=\"true\">→</span>";
      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "consent", token: lastToken, marketingConsent: false }),
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.data && res.data.ok === true) {
            marketingOptIn = false;
            wirePrefs();
            track("consent_withdrawn");
            return;
          }
          btn.disabled = false;
          btn.innerHTML = "Stop occasional career emails";
          text.innerHTML = "We could not change that just now. Please try again, or use the unsubscribe link in any email.";
        })
        .catch(function () {
          btn.disabled = false;
          btn.innerHTML = "Stop occasional career emails";
          text.innerHTML = "We could not reach the server. Please try again, or use the unsubscribe link in any email.";
        });
    };
  }

  function prefsRequested() {
    try {
      var p = new URLSearchParams(location.search).get("prefs");
      return p === "1" || p === "true";
    } catch (e) {
      return false;
    }
  }

  // --------------------------------------------------------------- init
  var wired = false;
  var sharedOpened = false;

  function bridge() { return window.__quizState ? window : null; }

  function init() {
    if (!bridge()) return;
    if (wired) {
      openSharedResult();
      return;
    }
    wired = true;

    $("revealForm").addEventListener("submit", function (e) {
      e.preventDefault();
      submit();
    });

    // From the error state the visitor can go straight back to the form and
    // retry with the email they already typed.
    if ($("confirmRetry")) $("confirmRetry").addEventListener("click", function () {
      hide($("quizConfirm"));
      hide($("confirmError"));
      hide($("confirmRetry"));
      setCrumbs(true);
      goReveal();
    });

    $("retakeQuiz").addEventListener("click", function () {
      try { sessionStorage.removeItem("assistara_quiz_result"); } catch (e) { }
      window.__quizClearProgress();
      window.__quizState.answers = {};
      window.__quizState.index = 0;
      window.__quizState.done = false;
      marketingOptIn = null;
      lastToken = null;
      hide($("rPrefs"));
      hide($("quizConfirm"));
      setCrumbs(true);
      window.__quizState.startedAt = Date.now();
      show($("quizPlay"));
      if (typeof window.__quizRenderQuestion === "function") window.__quizRenderQuestion();
      try { window.scrollTo(0, 0); } catch (e) { }
    });

    openSharedResult();
  }

  // A stored result (?t=) no longer renders the report on the site: reports
  // are delivered by email only. Open the confirmation instead, and surface
  // the preferences panel when the email's manage-preferences link is used.
  function openSharedResult() {
    if (sharedOpened) return;
    var token = new URLSearchParams(location.search).get("t");
    if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return;
    sharedOpened = true;
    hide($("quizPlay"));
    hide($("quizReveal"));
    setCrumbs(false);
    var heading = $("confirmHeading");
    heading.textContent = "Your next chapter is in your inbox! \u{1F49B}";
    var support = $("confirmSupport");
    support.textContent = "You did it! Your personalized Remote Career Report is on its way.";
    show($("quizConfirmSuccess"));
    hide($("quizConfirmError"));
    if (prefsRequested()) {
      wirePrefs();
    } else {
      hide($("rPrefs"));
    }
    show($("quizConfirm"));
    focusHeading(heading, true);
    try { $("quizConfirm").scrollIntoView({ block: "start" }); } catch (e) { }
    track("results_viewed");
  }

  window.__quizInitReveal = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
