"use strict";

// ----------------------------------------------------------------------------
// Assistara Remote Income Potential Quiz — personalised report engine.
//
// Consumed by api/quiz-funnel.js (server). Produces a STRUCTURED report, not a
// string, so the same content drives both the on-page result and the results
// email without two divergent copies of the copy.
//
// Versioned content blocks: REPORT_VERSION changes whenever block content or
// structure changes, and both versions are stored with every saved result.
//
// Product rules enforced here:
//   * Every one of the ten answers influences at least one block.
//   * Certification is never sold as mandatory and never implies employment.
//   * Someone who already holds a certificate is pushed toward portfolio,
//     specialization, positioning and outreach, not toward another certificate.
//   * Experience (q7) is reported as what the person has already done, with an
//     honest paragraph for every step from 1 to 5. Starting from zero is
//     written about neutrally, never as a gap, and no step is a requirement.
//   * Interests (q9) shape emphasis only. They are never reported as
//     qualifications or preparation, and the Academy's Certificate of
//     Completion only ever appears as a future option, never as something the
//     visitor holds because they took a quiz.
//   * A 30-day plan is a plan, never a promise of employment.
//   * Lifestyle copy never promises unlimited flexibility for every VA role.
// ----------------------------------------------------------------------------

const {
  REPORT_VERSION,
  CAREERS,
  QUESTIONS,
  scoreAnswers,
  readinessFor,
  interestsFor,
  incomeScenarios,
  hoursForAnswer,
  peso,
} = require("./_quiz-engine");

const SITE = "https://www.getassistara.com";

function firstNameOf(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.split(" ").slice(0, 4).join(" ");
}
function name(raw) {
  const s = firstNameOf(raw);
  if (!s) return "there";
  return s.split(" ")[0];
}

function optionLabel(questionId, key) {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const o = q && q.options ? q.options.find((x) => x.key === String(key || "")) : null;
  return o ? o.label : "";
}

// ---------------------------------------------------------------------------
// A. Personal introduction (q1 motivation drives the opening)
// ---------------------------------------------------------------------------

const MOTIVATION = {
  a: {
    hook: "you want everyday money pressure to stop being the thing that runs your week",
    value: "Steady, repeatable income is the honest first goal here, and remote work is one of the more realistic routes to building it on your own schedule.",
  },
  b: {
    hook: "you want more of your time back for the people who matter most to you",
    value: "That is a very common reason people move into remote work. The practical version of it is work that pays predictably and does not consume every evening.",
  },
  c: {
    hook: "you want the freedom to work from wherever you happen to be",
    value: "Remote roles can genuinely offer location flexibility. It varies by employer and client, so the goal is to build skills that are in demand before chasing the lifestyle.",
  },
  d: {
    hook: "you want a career with somewhere to go",
    value: "Remote work rewards people who keep adding skills. The path below is a starting point, and each specialization on it opens a higher-value lane.",
  },
  e: {
    hook: "you want extra income without giving up the job you already have",
    value: "Starting alongside your current work is a sensible, low-risk way in. Part-time remote work is a real category, not a compromise.",
  },
};

function buildIntro(answers, firstName, scoring, readiness) {
  const m = MOTIVATION[answers.q1] || MOTIVATION.a;
  const first = name(firstName);
  const subject = firstName ? firstName : "You";
  const paras = [];
  if (firstName) {
    paras.push(`Hi ${first}.`);
  }
  paras.push(
    `You told us that ${m.hook}. That answer shapes everything below, so read this as advice built around that goal rather than a generic list.`,
  );
  paras.push(m.value);
  paras.push(
    `Based on all ten answers, the path that fits you best right now is **${CAREERS[scoring.primary].title}**, the ${CAREERS[scoring.primary].category}. You are currently at the **${readiness.title}** stage, and that is a perfectly normal place to be.`,
  );
  return {
    heading: firstName
      ? `${first}, here is your remote career profile`
      : "Your remote career profile",
    paragraphs: paras,
    motivation: answers.q1,
    subject,
  };
}

// ---------------------------------------------------------------------------
// B / C. Career matches with an explanation of WHY
// ---------------------------------------------------------------------------

function whyMatches(scoring, careerId) {
  const ev = careerId === scoring.primary ? scoring.primaryEvidence : scoring.secondaryEvidence;
  const lines = [];
  if (!ev.length) {
    lines.push(
      "This did not score against your strongest answers, so treat it as a related path worth a look rather than your main fit.",
    );
    return lines;
  }
  const grouped = {};
  for (const e of ev) {
    grouped[e.question] = grouped[e.question] || { q: e.question, labels: [] };
    grouped[e.question].labels.push(e.label);
  }
  const order = ["q4", "q5", "q6"];
  for (const qid of order) {
    const g = grouped[qid];
    if (!g) continue;
    const label = g.labels[0];
    if (qid === "q4") {
      lines.push(`The mission you said sounded most exciting was "${label}". That is exactly the daily work this path is made of.`);
    } else if (qid === "q5") {
      lines.push(`Your superpower, "${label}", is the strength this path leans on hardest.`);
    } else {
      const tools = g.labels.slice(0, 3).join("; ");
      lines.push(`The tools you already know (${tools}) are the ones this path uses every day, so you are not starting from zero.`);
    }
  }
  return lines;
}

function buildCareerBlock(scoring, careerId, which) {
  const c = CAREERS[careerId];
  return {
    which,
    id: c.id,
    title: c.title,
    category: c.category,
    tagline: c.tagline,
    description: c.description,
    strengths: c.strengths,
    tasks: c.tasks,
    tools: c.tools,
    challenges: c.challenges,
    specializations: c.specializations,
    why: which === "primary" ? whyMatches(scoring, careerId) : whyMatches(scoring, careerId),
    note:
      which === "secondary"
        ? "Your scores are used only to order these recommendations. No compatibility percentage is shown, because none would be meaningful."
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// D. Income goal analysis (transparent, illustrative only)
// ---------------------------------------------------------------------------

function buildIncome(answers) {
  const inc = incomeScenarios(answers);
  const narrative = [];
  narrative.push(
    `You are aiming for **${peso(inc.goal)} a month** and you have told us you can put in about **${inc.weeklyHours} hours a week**${inc.weeklyHoursOpenEnded ? ` (modelled at ${inc.weeklyHours} hours, because you picked "${inc.weeklyHoursLabel}")` : ""}.`,
  );
  narrative.push(
    `Using your hours and an example rate of ${peso(400)}/hour, the illustrative monthly gross is **${peso(inc.scenarios.find((s) => s.rate === 400)?.monthly || 0)}**.`,
  );
  if (inc.requiredRate) {
    narrative.push(
      `To reach ${peso(inc.goal)} a month on ${inc.weeklyHours} paid hours a week, you would need roughly **${peso(inc.requiredRate)} per paid hour**.`,
    );
  }
  narrative.push(
    `Work out the paid hours first, then the rate. Availability is not the same as billable hours, so treat the hours column as a ceiling and the rate column as the thing to grow.`,
  );
  return { ...inc, narrative };
}

// ---------------------------------------------------------------------------
// E. Existing strengths (q6)
// ---------------------------------------------------------------------------

function listPhrase(items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

// E1. Existing experience (q7). One readable paragraph for every step from 1
// to 5, reported as what the person has already done rather than as a
// requirement. Step 1 is a normal place to start and is written about
// neutrally, never as a gap; no step is a qualification and nothing here is
// a certificate.
function buildExperience(answers) {
  const readiness = readinessFor(answers);
  const step = readiness.experienceStep;
  const paras = [];
  if (step <= 1) {
    paras.push(
      "You told us you are starting completely from scratch. That is a normal place to start, not a penalty: nobody begins with clients, and everything on your plan below is small enough to finish in the next month.",
    );
  } else if (step === 2) {
    paras.push(
      "You have already taught yourself relevant skills, which is experience in the only form a client cares about: you learned it by doing the thing rather than by being told about it.",
    );
  } else if (step === 3) {
    paras.push(
      "You have applied skills from work, school, or life experience to a real project. That transferable experience is the raw material of a service: the work now is naming what you did and letting someone else open it.",
    );
  } else if (step === 4) {
    paras.push(
      "You have practiced real tasks and built portfolio examples, which puts you ahead of most people at this stage. Clients can open that and read it, so your job is to keep it current and specific rather than to start again.",
    );
  } else {
    paras.push(
      "You have already done paid work for clients. That is the strongest thing you told us: the plan below is about packaging what you already deliver, pricing it clearly and repeating it with the next client.",
    );
  }
  return { step, paragraphs: paras };
}

function buildStrengths(answers) {
  const q6 = QUESTIONS.find((q) => q.id === "q6");
  const chosen = Array.isArray(answers.q6) ? answers.q6 : [];
  const selected = (q6.options || [])
    .filter((o) => chosen.includes(o.key))
    .map((o) => o.label);
  const none = chosen.includes("tnone");
  const experience = buildExperience(answers);
  // One quiet interests sentence: q9 is fit input, so it is mentioned as a
  // steer, never as evidence, a requirement or a qualification.
  const interests = interestsFor(answers);
  const paras = [];
  if (none) {
    paras.push(
      "You said you have not picked up these tools yet, and that you are willing to learn. That is a normal starting point, not a gap. Every tool below is learnable in weeks, not years.",
    );
    paras.push(
      "Your advantage is that you get to build good habits first instead of unlearning bad ones. Start with one tool, use it on a real task, and only then add the next.",
    );
  } else {
    paras.push(`You already work with ${selected.join(", ").replace(/, ([^,]*)$/, " and $1")}.`);
    paras.push(
      "This is transferable experience. You are not learning to use a computer for the first time; you are learning to sell a specific version of what you already do.",
    );
    if (selected.length >= 4) {
      paras.push(
        "That is a wide base for someone who has not been paid for it yet. The gap is not skill, it is packaging: turning what you know into one clear, sellable service.",
      );
    }
  }
  // Experience travels with the same block: both are "what you already bring",
  // and neither is allowed to read as a requirement.
  paras.push.apply(paras, experience.paragraphs);
  if (!interests.noneSelected && interests.labels.length) {
    paras.push(
      `You also said the work you would most enjoy includes ${listPhrase(interests.labels)}, so the recommendation below leans that way.`,
    );
  }
  return { selected, none, experience, interests, paragraphs: paras };
}

// ---------------------------------------------------------------------------
// F. Career readiness (encouraging, accurate, actionable)
// ---------------------------------------------------------------------------

const READINESS_COPY = {
  1: {
    missing: ["A first tool you know properly", "One sample project you can show"],
    body: "You are at the very start, and the honest advantage of starting here is that nothing you build in the next month is wasted. Pick one career lane, pick one tool, and make one small thing with it.",
  },
  2: {
    missing: ["A documented sample project", "A clear description of the one service you offer"],
    body: "You already know your way around the tools, which puts you ahead of most people at this stage. What is missing is proof: one project, written up, that a stranger could look at and understand what you do.",
  },
  3: {
    missing: ["A portfolio others can open", "A single specialised offer instead of general help"],
    body: "Training gives you vocabulary and method. It does not, on its own, demonstrate that you can do the work for a paying client. That is what the portfolio is for, and it is the next real step rather than more study.",
  },
  4: {
    missing: ["Live client feedback", "A repeatable way to find the next client"],
    body: "You have the material and the practice. What separates this stage from paid work is putting it in front of real people: a small number of well-scoped offers, not a perfect portfolio.",
  },
  5: {
    missing: ["Standardised deliverables", "A route to your next client that does not depend on referrals"],
    body: "You are already doing the work. The upgrade here is packaging: fixed scopes, documented processes and a specialization that makes you easier to recommend and easier to price.",
  },
};

function buildReadiness(answers) {
  const r = readinessFor(answers);
  const copy = READINESS_COPY[r.stage] || READINESS_COPY[1];
  const paras = [copy.body];
  if (r.experienceStep === 3) {
    paras.push(
      "One important note: applying skills to a real project shows you can do the work. It does not, by itself, show a stranger that you can run a client engagement, so the next move is to make that project visible rather than to collect more theory.",
    );
  } else if (r.experienceStep === 5) {
    paras.push(
      "Because you have already been paid for this, more general training is unlikely to be your highest-value move. Specialization, packaging and outbound are where the next gain is.",
    );
  }
  if (r.noneSelected) {
    paras.push(
      "You told us you are starting with no tools yet. Transferable skills still count, but practical tool training is the fastest way for you to become useful to a client.",
    );
  }
  return { ...r, paragraphs: paras, missing: copy.missing };
}

// ---------------------------------------------------------------------------
// G. Biggest obstacle (q8) — practical, specific advice
// ---------------------------------------------------------------------------

const OBSTACLES = {
  begin: {
    title: "Not knowing where to start",
    advice: [
      "Start smaller than feels impressive. Choose one of the seven paths above and one tool it uses.",
      "Spend this week doing one real task with it, end to end, and writing down what you did.",
      "Write three sentences about what you did and who it would help. That sentence is the beginning of your positioning.",
      "Only after that should you look at courses, communities or outreach.",
    ],
  },
  skills: {
    title: "Not feeling skilled enough yet",
    advice: [
      "Skills are judged by what you can show, not by what you can list. Build one small finished thing this week.",
      "Take a real task, do it for a fictional or friendly business, and document it.",
      "Pick the single skill that appears most often in the job posts you want and go one level deeper on just that.",
      "Confidence usually follows the portfolio, not the other way round.",
    ],
  },
  certificate: {
    title: "No formal training or certificate",
    advice: [
      "A certificate can shorten the path by giving you method and vocabulary. It cannot guarantee employment, and it is not an accredited credential unless the provider says so clearly.",
      "Training is one input among several. Clients are buying proof that you can do the task, so a portfolio does at least as much work as a credential.",
      "If you train, choose the narrowest thing that gets you to a visible output quickly.",
      "If you cannot train yet, build the sample project anyway. Both routes lead to the same place: evidence.",
    ],
  },
  portfolio: {
    title: "No experience or portfolio yet",
    advice: [
      "Experience is easier to manufacture than you think. A well-written sample for a real-looking business is genuinely useful evidence.",
      "Do three projects for yourself, a friend or a local business and write each one up as a short case note.",
      "Show the brief, what you did, and what changed. That is what a portfolio is.",
      "Then offer the same thing as a small fixed-scope project so the first paid job is not a leap.",
    ],
  },
  clients: {
    title: "Not knowing how to find clients",
    advice: [
      "Write down exactly who you help and what you do for them in one sentence. Outreach without that is just noise.",
      "Start with people who already know you: former colleagues, local businesses, communities you are in.",
      "Send a small number of specific messages rather than a large number of generic ones.",
      "Keep a simple tracker of who you contacted and when to follow up. Persistence, not volume, wins the first client.",
    ],
  },
  equipment: {
    title: "Equipment or internet being a challenge",
    advice: [
      "Most entry-level remote work runs on a browser. Check what you have before assuming you need to buy anything.",
      "Find two reliable alternatives: a nearby coworking space, a library, or a relative's connection for heavy days.",
      "Do the work that needs bandwidth in blocks, and keep a low-bandwidth version of your routine for bad days.",
      "Be upfront with clients about your working hours. Reliability matters more than a perfect setup.",
    ],
  },
  time: {
    title: "Struggling to find enough time",
    advice: [
      "Decide a fixed weekly number of hours you will actually protect, even if it is five.",
      "Put those hours in your calendar as appointments, and work in one block rather than waiting for a free evening.",
      "Use short sessions for skill building and longer sessions for portfolio work, so nothing needs a two-hour gap.",
      "Say the number out loud to whoever shares your time, so the plan survives contact with real life.",
    ],
  },
};

function buildObstacle(answers) {
  const q8 = QUESTIONS.find((q) => q.id === "q8");
  const o = q8.options.find((x) => x.key === answers.q8) || q8.options[0];
  const copy = OBSTACLES[o.obstacle] || OBSTACLES.begin;
  return { key: o.obstacle, label: o.label, ...copy };
}

// ---------------------------------------------------------------------------
// H. Personalised 30-day roadmap (4 weeks)
// ---------------------------------------------------------------------------

function trackFor(readiness) {
  if (readiness.stage >= 5) return "experienced";
  if (readiness.stage === 4) return "portfolio";
  if (readiness.stage === 3) return "certified";
  return "beginner";
}

function hoursLabel(answers) {
  const q3 = QUESTIONS.find((q) => q.id === "q3");
  const o = q3.options.find((x) => x.key === answers.q3) || q3.options[0];
  if (["a", "b"].includes(o.key)) return "light";
  if (["c", "d"].includes(o.key)) return "steady";
  return "full";
}

function buildRoadmap(answers, scoring, readiness, obstacle) {
  const track = trackFor(readiness);
  const load = hoursLabel(answers);
  const career = CAREERS[scoring.primary];
  const secondary = CAREERS[scoring.secondary];

  const loadNote =
    load === "light"
      ? "Scaled for a light week. Everything below assumes a few focused hours, not a full-time push."
      : load === "steady"
        ? "Scaled for a steady part-time week. Keep one block for portfolio work rather than spreading it thin."
        : "Scaled for a substantial weekly commitment. The risk at this volume is doing everything at once. Keep the order.";

  const plans = {
    beginner: [
      {
        week: "Week 1",
        title: "Foundations",
        focus: `Learn the two tools ${career.title} uses most`,
        tasks: [
          `Set up accounts for ${career.tools[0]} and ${career.tools[1]}`,
          "Do one small real task with each, end to end",
          "Write down the steps you took in your own words",
        ],
      },
      {
        week: "Week 2",
        title: "Guided practice",
        focus: "Repeat the task until it is boring",
        tasks: [
          `Redo your week 1 task and time yourself`,
          `Read three job posts for ${career.category} and list every task they mention`,
          "Mark the ones you have now done at least once",
        ],
      },
      {
        week: "Week 3",
        title: "Sample project",
        focus: "Build one finished thing you can show",
        tasks: [
          career.portfolioProject,
          "Write a short brief: the problem, what you did, what changed",
          "Ask one person for honest feedback and act on it",
        ],
      },
      {
        week: "Week 4",
        title: "Introductory outreach",
        focus: "Put it in front of real people",
        tasks: [
          `Write one sentence describing the single service you offer`,
          "Message five people or businesses who already know you",
          `Offer a small fixed-scope project, not open-ended help`,
        ],
      },
    ],
    certified: [
      {
        week: "Week 1",
        title: "Portfolio proof",
        focus: "Turn what you already learned into evidence",
        tasks: [
          `List every task from your training you can actually perform`,
          `Write up two of them as short case notes with the steps you used`,
          "Publish them somewhere a stranger can open without an account",
        ],
      },
      {
        week: "Week 2",
        title: "Specialization",
        focus: "Choose the narrow lane you want to be hired for",
        tasks: [
          `Compare ${career.category} with ${secondary.category} and pick one`,
          "List the three skills that appear most in the roles you want",
          "Go one level deeper on the top one",
        ],
      },
      {
        week: "Week 3",
        title: "Positioning",
        focus: "Say clearly what you do and who it is for",
        tasks: [
          "Write your one-sentence offer and a three-line version of it",
          `Name two industries where ${career.category} work is easy for you to understand`,
          "Build one complete sample project for a business in one of them",
        ],
      },
      {
        week: "Week 4",
        title: "Outreach",
        focus: "Start the conversations that create work",
        tasks: [
          "Contact eight people with a specific, relevant message",
          `Offer a fixed-scope starter project with a clear deliverable`,
          "Track every reply in a simple sheet and follow up once",
        ],
      },
    ],
    portfolio: [
      {
        week: "Week 1",
        title: "Package the offer",
        focus: "Turn your practice into something sellable",
        tasks: [
          `Define two fixed-scope services based on ${career.tasks[0]} and ${career.tasks[1]}`,
          "Write what is included, what is not, and the turnaround",
          "Price them as a project, not as a vague hourly guess",
        ],
      },
      {
        week: "Week 2",
        title: "Sharpen the specialization",
        focus: "Become the obvious choice for one kind of client",
        tasks: [
          `Review ${career.specializations.join(", ")} and choose one`,
          `Find three businesses already in that niche and note what they struggle with`,
          "Rewrite your one-sentence offer for that niche only",
        ],
      },
      {
        week: "Week 3",
        title: "Systems and delivery",
        focus: "Make your work repeatable and defensible",
        tasks: [
          "Document your delivery process as a checklist you could hand over",
          `Add a reusable template for ${career.tasks[2]}`,
          "Define your working hours and response-time promise",
        ],
      },
      {
        week: "Week 4",
        title: "Client acquisition",
        focus: "Build a route to the next client",
        tasks: [
          "Send ten specific messages to people who match your niche",
          "Ask past clients or colleagues for one introduction each",
          `Follow up once, then propose a fixed-scope project`,
        ],
      },
    ],
    experienced: [
      {
        week: "Week 1",
        title: "Improve the service",
        focus: "Raise the value of what you already deliver",
        tasks: [
          "Write down your current deliverables and how long each takes",
          `Add one upsell based on ${career.specializations[0]}`,
          "Cut anything you do that the client does not value",
        ],
      },
      {
        week: "Week 2",
        title: "Systems",
        focus: "Make delivery independent of memory",
        tasks: [
          "Document your process so a second person could run it",
          "Automate one recurring manual step",
          `Write templates for the work you repeat every week`,
        ],
      },
      {
        week: "Week 3",
        title: "Specialization",
        focus: "Move from general help to a named category",
        tasks: [
          "Pick the niche where your existing results are strongest",
          `Rewrite your offer so it names that niche explicitly`,
          "Collect three proof points or outcomes you can quote",
        ],
      },
      {
        week: "Week 4",
        title: "Client acquisition",
        focus: "Stop depending on referrals alone",
        tasks: [
          "Rebuild your portfolio with outcomes, not task lists",
          "Reach out to ten targeted prospects in your niche",
          "Set a weekly outreach block so acquisition never stops",
        ],
      },
    ],
  };

  const weeks = (plans[track] || plans.beginner).map((w) => ({ ...w }));

  // The chosen obstacle gets folded into the week where it matters most.
  if (obstacle && obstacle.key) {
    const target = weeks[1];
    target.tasks = target.tasks.concat([`This week also: ${obstacle.advice[1] || obstacle.advice[0]}`]);
  }

  // q9 no longer asks about certificates, so there is no held state to read.
  // The Academy certificate appears only as an option and is worded the same
  // way for everyone: always optional, never a requirement.
  const certificateNote =
    "Optional, never required: if structured training would help, Assistara Academy awards a Certificate of Completion once a student finishes every class and passes all four phase exams plus the final Academy exam.";

  return {
    heading: "Your 30-day roadmap",
    track,
    load,
    note: loadNote,
    promise: "This is a 30-day plan for building evidence and starting outreach. It is not a promise of employment.",
    certificateNote,
    certificateHeld: false,
    weeks,
  };
}

// ---------------------------------------------------------------------------
// I. Portfolio project
// ---------------------------------------------------------------------------

function buildPortfolio(scoring, readiness) {
  const c = CAREERS[scoring.primary];
  return {
    heading: "A portfolio project you could start this week",
    title: `${c.title}: one project, one page of writing`,
    project: c.portfolioProject,
    why:
      readiness.stage <= 2
        ? "Do it even if nobody asked you to. At your stage the finished artifact matters more than who it was for."
        : "Treat this as a spec sheet, not a school exercise: brief, method, result. That is the format clients actually read.",
    nextSteps: c.nextSteps,
  };
}

// ---------------------------------------------------------------------------
// J. Lifestyle fit (q3 availability + q1 motivation) — no promise of
// unlimited flexibility.
//
// The dedicated "perfect workday" question was folded into the interests
// step to keep the quiz at ten questions, so the shape of the week is modelled
// from two answers the visitor already gave (how many hours they actually
// have, and what they want remote work to change) instead of being read off a
// single one. Every variant keeps an honest caveat.
// ---------------------------------------------------------------------------

const WORKDAY = {
  flexible: {
    title: "A few focused hours with plenty of personal time",
    body: "Short, focused engagements and project-based work fit this best. Rates per hour tend to be higher when the hours are fewer, so the trade is usually depth rather than volume.",
    caveat: "Not every remote role works this way. Many client roles still expect core hours or a set shift.",
  },
  family: {
    title: "Flexible hours around your family",
    body: "Async work and clients in a different timezone often give you the most control over your own calendar. It is one of the most common reasons people move into remote work.",
    caveat: "Flexibility is usually negotiated, not automatic. Expect some fixed meetings and response windows.",
  },
  travel: {
    title: "Working from different places while travelling",
    body: "Reliable, repeatable deliverables are what make this possible: work that can be completed from anywhere with a stable connection.",
    caveat: "Timezone overlap and connection quality are real constraints. Verify both before committing to a client.",
  },
  stable: {
    title: "A stable full-time remote schedule",
    body: "This is the most straightforward route: consistent hours, one employer or long-term client, and predictable pay.",
    caveat: "It is also the route with the least day-to-day flexibility, which is exactly what some people want.",
  },
  parttime: {
    title: "A steady part-time week around what you already do",
    body: "Part-time and project-based remote work is a real category. Small businesses and solo founders routinely need a focused block of hours each week rather than a full-time hire.",
    caveat: "Pay is usually hourly or per project, and hours may be limited while you build proof and reputation.",
  },
};

function lifestyleKeyFor(answers) {
  const load = hoursLabel(answers);
  const motivation = answers && answers.q1;
  if (load === "light") return motivation === "b" ? "family" : "flexible";
  if (motivation === "c") return "travel";
  return load === "steady" ? "parttime" : "stable";
}

function buildLifestyle(answers) {
  const key = lifestyleKeyFor(answers);
  const copy = WORKDAY[key] || WORKDAY.flexible;
  const hours = hoursForAnswer(answers);
  const intro = `You told us you can put in about ${hours.hours} hours a week${hours.openEnded ? ` (modelled at ${hours.hours}, because you picked "${hours.label}")` : ""}, so this is the week shape that fits those hours.`;
  return {
    key,
    label: hours.label,
    hours: hours.hours,
    title: copy.title,
    body: `${intro} ${copy.body}`,
    caveat: copy.caveat,
  };
}

// ---------------------------------------------------------------------------
// K. Recommended next step — Academy relevance by readiness + timeline
// ---------------------------------------------------------------------------

function buildNextStep(readiness, answers, scoring) {
  const q10 = QUESTIONS.find((q) => q.id === "q10");
  const t = q10.options.find((x) => x.key === answers.q10) || q10.options[0];
  const c = CAREERS[scoring.primary];
  const academy = `${SITE}/academy`;
  const apply = `${SITE}/academy/apply`;

  // Every timeline answer lands in the copy, so the invitation is genuinely
  // tailored to when they said they would start rather than being one string.
  const when = {
    now: "You said you are ready to start now.",
    month: "You said you would like to start within the next month.",
    quarter: "You said you would like to start within the next three months.",
    half: "You said you would like to start within the next six months.",
    exploring: "You said you are still exploring.",
  }[t.timeline] || "";

  // Exploring visitors get an invitation, not pressure.
  if (t.timeline === "exploring") {
    return {
      tone: "gentle",
      heading: "No pressure, just explore",
      body: `${when}, and that is a completely fine place to be. Take the roadmap above and work through week one. If you decide you want structured training afterwards, Assistara Academy is there, and you can look at it without applying.`,
      timeline: t.timeline,
      cta: { label: "See what Assistara Academy covers", href: academy },
    };
  }

  if (readiness.stage >= 4) {
    return {
      tone: "advanced",
      heading: "You are past the beginner stage",
      body: `${when} You already have material to show and possibly paid work behind you. What would help most is specialization, a repeatable offer and a route to your next client, and that is where focused training and community help rather than starting again from the basics. If you want to go deeper on ${c.category} specifically, take a look at Assistara Academy.`,
      timeline: t.timeline,
      cta: { label: "Explore Assistara Academy", href: academy },
    };
  }

  if (readiness.experienceStep === 3) {
    return {
      tone: "portfolio",
      heading: "You have done real work. Now make it visible",
      body: `${when} You have already applied your skills to a real project, so the fundamentals are not the gap. Your highest-value move is proof: the portfolio, the specialization and the first outreach. Assistara Academy is built around getting that proof done with feedback, which is a different thing from starting over.`,
      timeline: t.timeline,
      cta: { label: "See how Assistara Academy works", href: academy },
    };
  }

  return {
    tone: "beginner",
    heading: "Start with one clear path",
    body: `${when} You are at the beginning, which is exactly who Assistara Academy is built for: practical training, a portfolio you can actually show, and a route to your first client rather than another folder of notes. Your plan above is a good first month on your own. Training shortens it.`,
    timeline: t.timeline,
    cta: { label: "Apply for an Assistara Academy spot", href: apply },
  };
}

// ---------------------------------------------------------------------------
// L. Shareable summary (privacy-safe by construction)
// ---------------------------------------------------------------------------

function buildShare(scoring, referral) {
  const c = CAREERS[scoring.primary];
  // The quiz lives inside the Academy, so every share link lands on the
  // Academy-branded route rather than a bare /quiz.
  const url = referral
    ? `${SITE}/academy/quiz?ref=${encodeURIComponent(referral)}`
    : `${SITE}/academy/quiz`;
  return {
    heading: "Share your result",
    line: `I'm "${c.title}" (${c.category}).`,
    description: c.tagline,
    url,
    // Never include name, email, income goal or any individual answer.
    includes: ["Career archetype", "Career category", "One-line description", "Quiz link"],
    excludes: ["Name", "Email address", "Income goal", "Individual answers"],
  };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

function buildReport(input) {
  const { answers, firstName = "", referral = "" } = input || {};
  const scoring = scoreAnswers(answers || {});
  const readiness = readinessFor(answers || {});
  const obstacle = buildObstacle(answers || {});
  const primary = buildCareerBlock(scoring, scoring.primary, "primary");
  const secondary = buildCareerBlock(scoring, scoring.secondary, "secondary");

  return {
    reportVersion: REPORT_VERSION,
    scoringVersion: scoring.scoringVersion,
    intro: buildIntro(answers, firstName, scoring, readiness),
    primary,
    secondary,
    income: buildIncome(answers),
    strengths: buildStrengths(answers),
    readiness: buildReadiness(answers),
    obstacle,
    roadmap: buildRoadmap(answers, scoring, readiness, obstacle),
    portfolio: buildPortfolio(scoring, readiness),
    lifestyle: buildLifestyle(answers),
    nextStep: buildNextStep(readiness, answers, scoring),
    share: buildShare(scoring, referral),
    // Carried everywhere the report goes: on-page, email and admin.
    disclaimers: [
      "Income figures are illustrative calculations based on your answers and example hourly rates. They are not earnings predictions or guarantees.",
      "Rates vary by experience, specialization, client and market conditions. Gross figures exclude taxes, platform fees and expenses.",
      "Completing Assistara Academy does not guarantee employment.",
      "This is a careers assessment, not a psychometric test, and no compatibility percentage is calculated or shown.",
    ],
    _scoring: scoring,
    _readiness: readiness,
  };
}

module.exports = {
  buildReport,
  OBSTACLES,
  WORKDAY,
  READINESS_COPY,
  trackFor,
  hoursLabel,
  lifestyleKeyFor,
  whyMatches,
};
