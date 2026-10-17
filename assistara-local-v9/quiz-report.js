/* ----------------------------------------------------------------------------
   Assistara Remote Income Potential Quiz — reveal step, submission and the
   report renderer.

   Every block painted here comes from the report the SERVER built. Nothing is
   scored, matched or calculated in the browser, so the on-page result and the
   emailed result are the same document.

   The result never depends on an email: the submit call carries the answers
   whether or not a name or address was given, and the report is rendered from
   that response even if the email queue fails.
   ---------------------------------------------------------------------------- */
(function () {
  "use strict";

  var API = "/api/quiz-funnel";

  function bridge() { return window.__quizState ? window : null; }
  function esc(v) { return window.__quizEsc(v); }
  function rich(v) { return window.__quizRich(v); }
  function peso(v) { return window.__quizPeso(v); }
  function show(el) { window.__quizShow(el); }
  function hide(el) { window.__quizHide(el); }
  function $(id) { return document.getElementById(id); }
  function track(name, extra) { window.__quizTrack(name, extra); }

  var startedAt = 0;
  var lastReport = null;
  var lastToken = "";
  // Whether this visitor opted into promotional email, as the SERVER recorded
  // it. It is only ever read to render the preferences panel honestly; it is
  // never used to decide whether a report is shown.
  var marketingOptIn = null;

  // ------------------------------------------------------------ list helper

  function list(items, cls) {
    if (!items || !items.length) return "";
    return '<ul class="' + (cls || "") + '">' +
      items.map(function (i) { return "<li>" + rich(i) + "</li>"; }).join("") +
      "</ul>";
  }

  function paras(items) {
    if (!items || !items.length) return "";
    return items.map(function (p) { return "<p>" + rich(p) + "</p>"; }).join("");
  }

  function block(kicker, heading, bodyHtml, extraClass) {
    return '<article class="rblock ' + (extraClass || "") + '">' +
      (kicker ? '<p class="rblock-kicker">' + esc(kicker) + "</p>" : "") +
      "<h3>" + rich(heading) + "</h3>" +
      bodyHtml +
      "</article>";
  }

  // ------------------------------------------------------------- reveal

  function goReveal() {
    hide($("quizPlay"));
    var card = $("quizReveal");
    if (card) {
      // Restart the enter animation even if this step was shown before.
      card.classList.remove("q-anim-in");
      void card.offsetWidth;
      card.classList.add("q-anim-in");
    }
    show(card);
    window.__quizFocus($("revealTitle"));
    try { $("quizReveal").scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { }
    startedAt = startedAt || Date.now();
  }
  window.__quizGoReveal = goReveal;

  function validateLead() {
    var name = $("firstName").value.trim();
    var email = $("leadEmail").value.trim();
    var nameErr = $("nameError");
    var emailErr = $("emailError");
    var ok = true;

    hide(nameErr);
    hide(emailErr);

    // A name is optional; if one is given it must be plausible text.
    if (name && !/^[A-Za-zÀ-ɏ' -]{1,80}$/.test(name)) {
      nameErr.textContent = "Please use letters only.";
      show(nameErr);
      ok = false;
    }

    // Emailing the report is the default path, so the primary button asks for
    // an address. The result is never withheld for declining: the opt-out
    // button next to it shows the report with no email at all.
    if (!email) {
      emailErr.textContent = "Add an email to have your report sent, or choose \"View my results without email\".";
      show(emailErr);
      return false;
    }
    if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email)) {
      emailErr.textContent = "That email address does not look right.";
      show(emailErr);
      ok = false;
    }
    return ok;
  }

  function submit(skipLead) {
    var state = window.__quizState;
    var errBox = $("submitError");
    hide(errBox);

    var firstName = skipLead ? "" : $("firstName").value.trim();
    var email = skipLead ? "" : $("leadEmail").value.trim().toLowerCase();
    // Marketing consent is the unchecked opt-in and is only meaningful
    // alongside an address. It is deliberately NOT required for anything: the
    // report is returned either way, whether it was emailed or not.
    var consent = !skipLead && $("marketingConsent").checked && !!email;

    if (!skipLead && !validateLead()) return;

    var btn = $("revealSubmit");
    btn.disabled = true;
    btn.textContent = "Building your result…";

    startedAt = startedAt || Date.now();

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        clientKey: window.__quizClientKey(),
        answers: state.answers,
        firstName: firstName,
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
        btn.innerHTML = 'Email me my report <span aria-hidden="true">→</span>';

        if (!res.data || res.data.ok !== true || !res.data.report) {
          var msg = (res.data && res.data.error) || "Something went wrong. Please try again.";
          errBox.textContent = msg;
          show(errBox);
          return;
        }

        // The result is on screen from here on. Everything below is a nicety.
        if (res.data.token) {
          lastToken = res.data.token;
          try { sessionStorage.setItem("assistara_quiz_result", res.data.token); } catch (e) { }
        }

        hide($("quizReveal"));
        // The server's stored decision is the one that counts, so the page
        // reports it back rather than trusting what the checkbox said. A
        // replayed submit omits the field, and missing must never be read as
        // a decline: the state already on screen is the truth until the
        // server says otherwise.
        if (typeof res.data.marketingConsent === "boolean") {
          marketingOptIn = res.data.marketingConsent;
        }
        render(res.data.report, { emailQueued: !!res.data.emailQueued, stored: res.data.stored !== false });

        track("lead_submitted");
        track("results_viewed");

        // An email failure is reported honestly, without hiding the result.
        if (email && res.data.emailQueued === false) {
          showEmailNotice();
        } else if (email && res.data.emailQueued) {
          track("email_sent");
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = 'Email me my report <span aria-hidden="true">→</span>';
        errBox.textContent = "We could not reach the server. Check your connection and try again.";
        show(errBox);
      });
  }

  // Shown when the on-page result is fine but the email could not be queued.
  // The report is never withheld because of this.
  function showEmailNotice() {
    var body = $("reportBody");
    if (!body) return;
    var note = document.createElement("div");
    note.className = "rblock";
    note.setAttribute("role", "status");
    note.innerHTML = '<p class="rblock-kicker">YOUR RESULT IS SAFE</p>' +
      "<h3>Your report is above and it stays here.</h3>" +
      "<p>We could not queue the email copy just now, so please save or share this page. " +
      "Your result has not been affected in any way.</p>";
    body.insertBefore(note, body.firstChild);
    track("email_failed");
  }

  // ---------------------------------------------------------- report render

  function render(r, opts) {
    lastReport = r;
    var body = $("reportBody");
    opts = opts || {};

    // From here the quiz is over: a refresh must not report an abandonment.
    window.__quizState.done = true;
    window.__quizClearProgress();

    window.__quizFocus($("rHeading"));
    $("rHeading").textContent = r.intro.heading || "Here is your remote career profile";

    $("rPrimaryTag").textContent = "Primary match: " + r.primary.title;
    $("rSecondaryTag").textContent = "Also worth exploring: " + r.secondary.title;
    $("rReadinessTag").textContent = "Stage: " + r.readiness.title;

    // The matched career named large in the hero so the result reads as the
    // reward it is. Same server values as the tag above; nothing new invented.
    var careerWrap = $("rCareerWrap");
    if (careerWrap && r.primary) {
      $("rCareerName").textContent = r.primary.title || "";
      $("rCareerCat").textContent = r.primary.category || "";
      careerWrap.hidden = false;
    }

    var html = "";

    // A. Personal introduction --------------------------------------------
    html += block("", r.intro.heading, paras(r.intro.paragraphs));

    // B. Primary career match, with the answers that produced it ----------
    html += block("YOUR PRIMARY MATCH", r.primary.title + " · " + r.primary.category,
      '<p class="rquote">' + rich(r.primary.tagline) + "</p>" +
      paras([r.primary.description]) +
      (r.primary.why && r.primary.why.length
        ? '<p class="rblock-kicker" style="margin-top:20px">WHY THIS MATCHES YOU</p>' + list(r.primary.why, "rlist-dash")
        : "") +
      '<p class="rblock-kicker" style="margin-top:20px">WHAT THIS WORK ACTUALLY INVOLVES</p>' +
      list(r.primary.tasks) +
      '<div class="rcard-grid">' +
        '<div class="rcard"><small>Tools you would use</small><b style="font-size:14px">' + esc(r.primary.tools.join(", ")) + "</b></div>" +
        '<div class="rcard"><small>Where it can lead</small><b style="font-size:14px">' + esc(r.primary.specializations.join(", ")) + "</b></div>" +
      "</div>" +
      '<p class="rblock-kicker" style="margin-top:20px">HONEST CHALLENGES</p>' + list(r.primary.challenges, "rlist-dash"));

    // C. Secondary career match -------------------------------------------
    html += block("ALSO WORTH EXPLORING", r.secondary.title + " · " + r.secondary.category,
      '<p class="rquote">' + rich(r.secondary.tagline) + "</p>" +
      paras([r.secondary.description]) +
      (r.secondary.why && r.secondary.why.length ? list(r.secondary.why, "rlist-dash") : "") +
      (r.secondary.note ? '<p class="rnote">' + rich(r.secondary.note) + "</p>" : ""));

    // D. Income goal analysis ---------------------------------------------
    html += incomeBlock(r.income);

    // E. Existing strengths ------------------------------------------------
    html += block("WHAT YOU ALREADY BRING", "Your existing strengths",
      paras(r.strengths.paragraphs) +
      (r.strengths.selected && r.strengths.selected.length
        ? '<p class="rblock-kicker" style="margin-top:16px">YOU ALREADY USE</p>' + list(r.strengths.selected)
        : "") +
      (r.strengths.qualifications && r.strengths.qualifications.labels && r.strengths.qualifications.labels.length
        ? '<p class="rblock-kicker" style="margin-top:16px">YOU ALREADY HOLD</p>' + list(r.strengths.qualifications.labels)
        : ""));

    // F. Career readiness --------------------------------------------------
    html += block("YOUR STARTING POINT", "Career readiness: " + r.readiness.title,
      '<div class="rscale" aria-hidden="true">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<div class="' + (n <= r.readiness.stage ? "on" : "") + '"></div>'; }).join("") +
        "</div>" +
        '<div class="rscale-legend"><span>Exploring</span><span>Working with clients</span></div>' +
        paras(r.readiness.paragraphs) +
        (r.readiness.missing && r.readiness.missing.length
          ? '<p class="rblock-kicker" style="margin-top:18px">WHAT WOULD MOVE YOU FORWARD</p>' + list(r.readiness.missing)
          : ""));

    // G. Biggest obstacle --------------------------------------------------
    html += block("YOUR BIGGEST OBSTACLE", r.obstacle.title,
      '<p>' + rich("You said: " + r.obstacle.label) + "</p>" +
      list(r.obstacle.advice, "rlist-dash"));

    // H. 30-day roadmap ----------------------------------------------------
    html += block("YOUR PLAN", r.roadmap.heading,
      "<p>" + rich(r.roadmap.note) + "</p>" +
      r.roadmap.weeks.map(function (w) {
        return '<div class="rweek">' +
          '<div class="rweek-head"><small>' + esc(w.week) + "</small><b>" + rich(w.title) + "</b></div>" +
          '<p class="rweek-focus">' + rich(w.focus) + "</p>" +
          list(w.tasks) +
          "</div>";
      }).join("") +
      (r.roadmap.certificateNote ? '<p class="rnote">' + rich(r.roadmap.certificateNote) + "</p>" : "") +
      '<p class="rnote">' + rich(r.roadmap.promise) + "</p>");

    // I. Portfolio project -------------------------------------------------
    html += block("SOMETHING TO BUILD THIS WEEK", r.portfolio.title,
      '<p class="rquote">' + rich(r.portfolio.project) + "</p>" +
      "<p>" + rich(r.portfolio.why) + "</p>" +
      (r.portfolio.nextSteps && r.portfolio.nextSteps.length
        ? '<p class="rblock-kicker" style="margin-top:18px">THEN</p>' + list(r.portfolio.nextSteps, "rlist-dash")
        : ""));

    // J. Lifestyle fit -----------------------------------------------------
    html += block("LIFESTYLE FIT", r.lifestyle.title,
      "<p>" + rich(r.lifestyle.body) + "</p>" +
      '<p class="rnote">' + rich(r.lifestyle.caveat) + "</p>");

    // K. Recommended next step ---------------------------------------------
    html += block("YOUR NEXT STEP", r.nextStep.heading,
      "<p>" + rich(r.nextStep.body) + "</p>" +
      '<a class="rbtn" href="' + esc(r.nextStep.cta.href) + '" data-quiz-cta>' + esc(r.nextStep.cta.label) + " →</a>",
      "is-next");

    // L. Shareable summary -------------------------------------------------
    html += shareBlock(r.share);

    body.innerHTML = html;

    // Disclaimers always travel with the report.
    $("rDisclaimers").innerHTML =
      "<h4>About the numbers on this page</h4><ul>" +
      (r.disclaimers || []).map(function (d) { return "<li>" + rich(d) + "</li>"; }).join("") +
      "</ul>";

    wireShare(r.share);
    wireCta();
    wirePrefs();
    revealOnScroll(body);

    hide($("quizLanding"));
    hide($("quizPlay"));
    hide($("quizReveal"));
    show($("quizResult"));
    try { $("quizResult").scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { }
    window.__quizFocus($("rHeading"));

    if (opts.stored === false) {
      // Honest note when storage was unavailable and the report was computed
      // live rather than saved: the share link will not resolve.
      var warn = document.createElement("div");
      warn.className = "rblock";
      warn.setAttribute("role", "status");
      warn.innerHTML = "<p>We could not save this result just now, so please screenshot or share it. " +
        "It is still fully yours to use.</p>";
      body.insertBefore(warn, body.firstChild);
    }
  }

  function incomeBlock(inc) {
    var example = null;
    for (var i = 0; i < inc.scenarios.length; i++) {
      if (inc.scenarios[i].rate === 400) example = inc.scenarios[i];
    }
    if (!example) example = inc.scenarios[Math.min(2, inc.scenarios.length - 1)];

    return block("THE INCOME MATHS", "What your hours could look like",
      paras(inc.narrative) +
      '<div class="rformula">' + esc(inc.formula) + "</div>" +
      '<div class="rcard-grid cols-3" style="margin-top:18px">' +
        inc.scenarios.map(function (s) {
          return '<div class="rcard"><small>' + esc(s.label) + " · " + peso(s.rate) + "/hr</small>" +
            "<b>" + peso(s.monthly) + "</b>" +
            "<span>per month, illustrative</span></div>";
        }).join("") +
      "</div>" +
      (inc.requiredRate
        ? '<div class="rcard" style="margin-top:12px"><small>TO REACH YOUR GOAL OF ' + peso(inc.goal) + "</small>" +
          "<b>about " + peso(inc.requiredRate) + " per paid hour</b>" +
          "<span>at " + inc.weeklyHours + " paid hours a week</span></div>"
        : "") +
      '<div class="rcard-grid" style="margin-top:12px">' +
        inc.hoursNeeded.map(function (h) {
          return '<div class="rcard"><small>AT ' + peso(h.rate) + "/HR</small><b>" + h.hours + " hrs/week</b>" +
            "<span>to reach " + peso(inc.goal) + "</span></div>";
        }).join("") +
      "</div>" +
      (inc.weeklyHoursOpenEnded
        ? '<p class="rnote">You picked "' + esc(inc.weeklyHoursLabel) + '", so we modelled this at ' +
          inc.weeklyHoursModelledAt + " hours a week. That figure is an assumption, not something you told us.</p>"
        : "") +
      '<p class="rnote">' + (inc.modellingNotes || []).map(function (n) { return rich(n); }).join(" ") + "</p>",
      "is-highlight");
  }

  function shareBlock(s) {
    return block("", s.heading,
      '<div class="rshare">' +
        '<p class="rshare-line">' + rich(s.line) + "</p>" +
        "<p>" + rich(s.description) + "</p>" +
        '<p class="rshare-url">' + esc(s.url) + "</p>" +
        '<div class="rshare-actions">' +
          '<button type="button" data-share="copy">Copy link</button>' +
          '<button type="button" data-share="native" hidden>Share…</button>' +
        "</div>" +
        '<p class="rnote">Your share card shows your career match and a link. It never includes your name, ' +
        "email, income goal or any individual answer.</p>" +
      "</div>");
  }

  function wireShare(s) {
    var box = $("reportBody");
    if (!box) return;
    var copyBtn = box.querySelector('[data-share="copy"]');
    var nativeBtn = box.querySelector('[data-share="native"]');

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = s.line + " " + s.url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = "Copied ✓";
            setTimeout(function () { copyBtn.textContent = "Copy link"; }, 2200);
          });
        } else {
          window.prompt("Copy your result link:", s.url);
        }
        track("shared", { via: "copy" });
      });
    }

    // Only offer the system share sheet where the browser actually has one.
    if (nativeBtn && navigator.share) {
      nativeBtn.hidden = false;
      nativeBtn.addEventListener("click", function () {
        navigator.share({ title: "My Assistara career match", text: s.line, url: s.url })
          .then(function () { track("shared", { via: "native" }); })
          .catch(function () { /* dismissed: not an error */ });
      });
    }
  }

  // Track Academy CTA clicks from inside the report, then let the link work.
  function wireCta() {
    var links = document.querySelectorAll("[data-quiz-cta]");
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("click", function () {
        track("academy_cta_clicked", { tone: lastReport && lastReport.nextStep ? lastReport.nextStep.tone : "" });
      });
    });
  }

  // ------------------------------------------------ email preferences panel
  // The promotional opt-in can be withdrawn from the same private link the
  // report lives on (that is what an email footer's "manage preferences"
  // points at). Two honest states: opted in, or not. Withdrawing never
  // touches the report and never requires an email or an account.
  function wirePrefs() {
    var panel = $("rPrefs");
    if (!panel) return;
    var text = $("rPrefsText");
    var btn = $("rPrefsWithdraw");
    if (!text || !btn) return;

    if (marketingOptIn === true) {
      text.innerHTML = "You asked for <b>occasional remote-work opportunities, free training resources and career advice</b>. " +
        "Your report email is separate and always stays on.";
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = "Stop occasional career emails";
    } else {
      text.innerHTML = "You are <b>not</b> on the occasional career emails list. Your report is saved here either way, " +
        "and no promotional email is ever a condition of getting it.";
      btn.hidden = true;
    }
    show(panel);

    // A link with &prefs=1 should land the visitor on this panel, not leave it
    // scrolling past it.
    var prefs = new URLSearchParams(location.search).get("prefs");
    if (prefs === "1" || prefs === "true") {
      try { panel.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { }
    }

    btn.onclick = function () {
      if (marketingOptIn !== true || !lastToken) return;
      btn.disabled = true;
      btn.textContent = "Stopping…";
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
          btn.textContent = "Stop occasional career emails";
          text.innerHTML = "We could not change that just now. Please try again, or use the unsubscribe link in any email.";
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "Stop occasional career emails";
          text.innerHTML = "We could not reach the server. Please try again, or use the unsubscribe link in any email.";
        });
    };
  }

  // Report blocks fade up as they enter the viewport. The reveal-up class is
  // only ever added here, so with JS off or broken the report simply renders
  // visible; if anything about the observer fails we reveal everything.
  function revealOnScroll(root) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll(".rblock"));
    if (!nodes.length) return;
    var reduced = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver !== "function") {
      nodes.forEach(function (n) { n.classList.add("reveal-up", "is-visible"); });
      return;
    }
    try {
      nodes.forEach(function (n) { n.classList.add("reveal-up"); });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0, rootMargin: "0px 0px -40px 0px" });
      nodes.forEach(function (n) { io.observe(n); });
    } catch (e) {
      nodes.forEach(function (n) { n.classList.add("is-visible"); });
    }
  }

  // ------------------------------------------------- stored result (?t=)

  // A result link is private, so it must never be indexed even though the quiz
  // landing page itself is a public lead magnet.
  function noindex() {
    try {
      var m = document.querySelector('meta[name="robots"]');
      if (!m) {
        m = document.createElement("meta");
        m.name = "robots";
        document.head.appendChild(m);
      }
      m.setAttribute("content", "noindex, nofollow");
    } catch (e) { }
  }

  function loadStoredResult(token) {
    noindex();
    hide($("quizLanding"));
    var body = $("quizResult");
    show(body);
    $("reportBody").innerHTML =
      '<div class="quiz-loading"><div class="quiz-spinner" aria-hidden="true"></div>' +
      "<p>Loading your saved result…</p></div>";

    fetch(API + "?action=result&t=" + encodeURIComponent(token), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true || !d.report) throw new Error("not found");
        lastToken = token;
        // The stored decision travels with the result so an emailed
        // "manage preferences" link shows the truth rather than a guess.
        marketingOptIn = d.marketingConsent === true;
        render(d.report, {});
        track("results_viewed");
      })
      .catch(function () {
        $("reportBody").innerHTML =
          '<article class="rblock"><p class="rblock-kicker">LINK EXPIRED</p>' +
          "<h3>We could not open that result link.</h3>" +
          "<p>Result links expire after a week for privacy, or the link may be incomplete. " +
          "The good news: the quiz takes about three minutes and your answers will give you a fresh result.</p>" +
          '<a class="rbtn" href="/academy/quiz">Take the quiz again →</a></article>';
        $("rHeading").textContent = "Result link expired";
        $("rPrimaryTag").textContent = "";
        $("rSecondaryTag").textContent = "";
        $("rReadinessTag").textContent = "";
        $("rDisclaimers").innerHTML = "";
      });
  }

  // --------------------------------------------------------------- init

  // init() is reached from two directions: this file's own bootstrap, and
  // quiz.js once the meta has loaded. Both really do run. Wiring the controls
  // twice would put two submit handlers on the form, so a single click would
  // queue two reports and write two lead rows, and the second response (a
  // replay) would then overwrite the consent state the first one returned.
  // Everything below therefore happens exactly once.
  var wired = false;
  var sharedOpened = false;

  function init() {
    if (!bridge()) return;

    if (wired) {
      openSharedResult();
      return;
    }
    wired = true;

    $("revealForm").addEventListener("submit", function (e) {
      e.preventDefault();
      submit(false);
    });
    $("revealSkip").addEventListener("click", function () { submit(true); });

    $("retakeQuiz").addEventListener("click", function () {
      try { sessionStorage.removeItem("assistara_quiz_result"); } catch (e) { }
      window.__quizClearProgress();
      window.__quizState.answers = {};
      window.__quizState.index = 0;
      window.__quizState.done = false;
      // A new attempt starts with no consent state of its own. The earlier
      // decision stays recorded on the server; this only stops the panel from
      // showing the old answer before the new submit has answered the question.
      marketingOptIn = null;
      lastToken = null;
      hide($("rPrefs"));
      hide($("quizResult"));
      show($("quizLanding"));
      try { window.scrollTo(0, 0); } catch (e) { }
    });

    openSharedResult();
  }

  // A shared or bookmarked link opens the saved report directly. Only ever
  // attempted once, so a second init cannot fetch it twice or paint over the
  // report the visitor is already looking at.
  function openSharedResult() {
    if (sharedOpened) return;
    var token = new URLSearchParams(location.search).get("t");
    if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return;
    sharedOpened = true;
    loadStoredResult(token);
  }

  window.__quizInitReveal = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
