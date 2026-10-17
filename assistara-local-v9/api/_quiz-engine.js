"use strict";

// ----------------------------------------------------------------------------
// Assistara Remote Income Potential Quiz — scoring + report engine.
//
// Single source of truth. Consumed by:
//   * api/quiz-funnel.js   (server-side, authoritative scoring)
//   * api/quiz-engine.test.js (Node tests)
//
// The browser NEVER scores. It posts answers here, so the match, the readiness
// stage, the income model and the report are computed exactly once, from the
// same code, for every visitor. That is what makes the result reproducible and
// the stored score/report versions meaningful.
//
// Design rules (product spec §7, §8, §9, §10):
//   * Deterministic: integer weights, fixed tie-break order, no randomness.
//   * Explainable: every match returns the answers that produced it.
//   * No psychometric validity is claimed and no compatibility percentage is
//     ever produced — scores are internal ordering only and are never shown.
//   * Career matching is fully separate from readiness and from purchase
//     intent: the income goal (q2) and the timeline (q10) never touch scores.
//   * Every hypothetical hourly rate is labelled an example unless verified.
// ----------------------------------------------------------------------------

const SCORING_VERSION = "quiz-scoring-v1";
const REPORT_VERSION = "quiz-report-v1";

// Canonical career order doubles as the deterministic tie-break: when two
// careers tie on score, the earlier one in this list becomes the primary.
const CAREER_ORDER = [
  "organizer",
  "creative",
  "connector",
  "detective",
  "growth",
  "systems",
  "builder",
];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
// type: "single" (one of options), "multi" (any of options, exclusivity rules),
//       "income" (amount), "hours" (one of ranges)
const QUESTIONS = [
  {
    id: "q1",
    type: "single",
    purpose: "Lifestyle motivation",
    kicker: "QUESTION 1 OF 10",
    title: "If you could earn money from anywhere, what would change in your life first?",
    options: [
      { key: "a", label: "Stop worrying so much about everyday expenses", icon: "money" },
      { key: "b", label: "Spend more quality time with my family", icon: "heart" },
      { key: "c", label: "Have the freedom to travel or work from anywhere", icon: "plane" },
      { key: "d", label: "Build a career with more opportunities", icon: "rocket" },
      { key: "e", label: "Earn extra money without leaving my current job", icon: "sprout" },
    ],
  },
  {
    id: "q2",
    type: "income",
    purpose: "Income goal",
    kicker: "QUESTION 2 OF 10",
    title: "What's your monthly freedom number?",
    support:
      "Imagine earning money remotely. How much would you love to make each month?",
    min: 5000,
    max: 100000,
    step: 5000,
    defaultAmount: 25000,
  },
  {
    id: "q3",
    type: "hours",
    purpose: "Availability",
    kicker: "QUESTION 3 OF 10",
    title: "How much time could you realistically dedicate to remote work each week?",
    options: [
      { key: "a", label: "Less than 5 hours", hours: 4, openEnded: true },
      { key: "b", label: "5–10 hours", hours: 8 },
      { key: "c", label: "11–20 hours", hours: 15 },
      { key: "d", label: "21–30 hours", hours: 25 },
      { key: "e", label: "31–40 hours", hours: 35 },
      { key: "f", label: "More than 40 hours", hours: 40, openEnded: true },
    ],
  },
  {
    id: "q4",
    type: "single",
    purpose: "Primary career preference signal",
    kicker: "QUESTION 4 OF 10",
    title: "A business owner offers you your first paid mission. Which sounds the most exciting?",
    options: [
      { key: "a", label: "Organize their schedule, inbox, and daily operations", career: "organizer", icon: "calendar" },
      { key: "b", label: "Create content that makes people stop scrolling", career: "creative", icon: "sparkle" },
      { key: "c", label: "Help customers and make them feel understood", career: "connector", icon: "chat" },
      { key: "d", label: "Research information and uncover useful insights", career: "detective", icon: "search" },
      { key: "e", label: "Find potential customers and help grow sales", career: "growth", icon: "chart" },
      { key: "f", label: "Improve their workflows using technology and AI", career: "systems", icon: "gear" },
      { key: "g", label: "Help manage an online store and its orders", career: "builder", icon: "bag" },
    ],
  },
  {
    id: "q5",
    type: "single",
    purpose: "Secondary career-matching signal",
    kicker: "QUESTION 5 OF 10",
    title: "What's your secret superpower, even if you've never worked online?",
    options: [
      { key: "a", label: "I can turn chaos into an organized plan", career: "organizer" },
      { key: "b", label: "I naturally come up with creative ideas", career: "creative" },
      { key: "c", label: "I'm good at listening and communicating", career: "connector" },
      { key: "d", label: "I notice details other people miss", career: "detective" },
      { key: "e", label: "I'm persuasive and enjoy helping people make decisions", career: "growth" },
      { key: "f", label: "I love figuring out how tools and technology work", career: "systems" },
      { key: "g", label: "I understand products, shopping, and what customers want", career: "builder" },
    ],
  },
  {
    id: "q6",
    type: "multi",
    purpose: "Supporting evidence for career matching",
    kicker: "QUESTION 6 OF 10",
    title: "Which of these tools or activities are you already comfortable with?",
    support: "Choose as many as apply. Pick the last one on its own if none apply yet.",
    options: [
      { key: "t1", label: "Google Docs, Gmail, Calendar, or similar tools" },
      { key: "t2", label: "Canva, design, or content creation" },
      { key: "t3", label: "Facebook, Instagram, TikTok, or community management" },
      { key: "t4", label: "Excel, Google Sheets, or data organization" },
      { key: "t5", label: "Customer communication or sales tools" },
      { key: "t6", label: "AI tools, automation, or troubleshooting" },
      { key: "t7", label: "Online shopping platforms or e-commerce tools" },
      { key: "tnone", label: "None yet, but I'm willing to learn", exclusive: true },
    ],
  },
  {
    id: "q7",
    type: "single",
    purpose: "Experience and preparation (readiness input)",
    kicker: "QUESTION 7 OF 10",
    title: "How far along are you in your remote career journey?",
    support: "There is no wrong answer here. Everyone on this list is a valid place to start.",
    options: [
      { key: "a", label: "I'm starting completely from scratch", step: 1 },
      { key: "b", label: "I've watched tutorials or learned on my own", step: 2 },
      { key: "c", label: "I've completed a course or earned a certificate", step: 3 },
      { key: "d", label: "I've practiced real tasks or created portfolio examples", step: 4 },
      { key: "e", label: "I've already done paid work for clients", step: 5 },
    ],
  },
  {
    id: "q8",
    type: "single",
    purpose: "Biggest obstacle (roadmap input)",
    kicker: "QUESTION 8 OF 10",
    title: "What's the biggest thing standing between you and your first remote client?",
    options: [
      { key: "a", label: "I have no idea where to begin", obstacle: "begin" },
      { key: "b", label: "I don't think I have the right skills yet", obstacle: "skills" },
      { key: "c", label: "I don't have formal training or a certificate", obstacle: "certificate" },
      { key: "d", label: "I don't have experience or a portfolio", obstacle: "portfolio" },
      { key: "e", label: "I don't know how to find clients", obstacle: "clients" },
      { key: "f", label: "My equipment or internet connection is a challenge", obstacle: "equipment" },
      { key: "g", label: "I struggle to find enough time", obstacle: "time" },
    ],
  },
  {
    id: "q9",
    type: "single",
    purpose: "Lifestyle fit",
    kicker: "QUESTION 9 OF 10",
    title: "If you could design your perfect workday, what would it look like?",
    options: [
      { key: "a", label: "A few focused hours with plenty of personal time", workday: "flexible" },
      { key: "b", label: "Flexible hours around my family", workday: "family" },
      { key: "c", label: "Working from different places while traveling", workday: "travel" },
      { key: "d", label: "A stable full-time remote schedule", workday: "stable" },
      { key: "e", label: "Evenings or weekends alongside my current responsibilities", workday: "parttime" },
    ],
  },
  {
    id: "q10",
    type: "single",
    purpose: "Readiness segment / Academy invitation tone",
    kicker: "QUESTION 10 OF 10",
    title: "If you had a clear step-by-step plan, when would you want to start?",
    options: [
      { key: "a", label: "Right now, I'm ready", timeline: "now" },
      { key: "b", label: "Within the next month", timeline: "month" },
      { key: "c", label: "Within the next three months", timeline: "quarter" },
      { key: "d", label: "Within the next six months", timeline: "half" },
      { key: "e", label: "I'm just exploring for now", timeline: "exploring" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seven career outcomes
// ---------------------------------------------------------------------------

const CAREERS = {
  organizer: {
    id: "organizer",
    title: "The Master Organizer",
    category: "Administrative VA / Executive Assistant",
    tagline: "You are the person who makes other people's week make sense.",
    description:
      "You think in systems, sequences and clean handoffs. Where other people see a messy inbox and a double-booked calendar, you see a queue that just needs sorting. Clients feel the difference within days: fewer dropped balls, fewer repeat questions, and a week that finally runs to plan.",
    strengths: [
      "Turning an overloaded schedule into a plan that holds",
      "Keeping a shared inbox clear and genuinely answered",
      "Writing things down so nothing depends on memory",
      "Staying calm when priorities change twice before lunch",
    ],
    tasks: [
      "Inbox organization",
      "Calendar management",
      "Scheduling",
      "Document preparation",
      "Task tracking",
      "Administrative coordination",
    ],
    tools: ["Google Workspace", "Calendly or similar scheduling tools", "Notion or Trello", "Google Docs and Sheets"],
    portfolioProject:
      "Take a messy sample inbox and calendar for a fictional founder and deliver a one-page operating brief: triaged inbox categories, a defended weekly calendar, and a short recurring-routine checklist.",
    nextSteps: [
      "Rebuild one real week of your own schedule using a single tool and a written routine",
      "Document the routine so someone else could follow it without asking you",
      "Offer the same setup to one small business owner as a fixed-scope sample project",
    ],
    challenges: [
      "Doing everything manually instead of building templates you can reuse",
      "Being available every hour because the work feels urgent",
      "Underselling the coordination skill that actually saves a client hours",
    ],
    specializations: [
      "Executive assistant to a founder or consultant",
      "Operations and SOP documentation",
      "Inbox and calendar systems for coaches and agencies",
    ],
  },
  creative: {
    id: "creative",
    title: "The Creative Spark",
    category: "Social Media VA / Content Assistant",
    tagline: "You notice what stops the scroll before anyone says it out loud.",
    description:
      "You already think in hooks, colours and captions. Businesses are endlessly short of people who can turn an idea into something worth posting, so this path rewards the instinct you have been using for free on your own accounts.",
    strengths: [
      "Seeing the angle before the post is written",
      "Making visual work that looks considered, not generic",
      "Keeping a calendar of ideas instead of scrambling on posting day",
      "Writing short copy that sounds like a person",
    ],
    tasks: [
      "Social media content",
      "Canva graphics",
      "Content calendars",
      "Scheduling posts",
      "Basic copywriting",
      "Content organization",
    ],
    tools: ["Canva", "Meta Business Suite or Buffer", "CapCut", "Google Sheets for content calendars"],
    portfolioProject:
      "Build a two-week content pack for one fictional brand: 10 graphics, 10 captions and a posting calendar, all in a shared folder with a short rationale for the theme.",
    nextSteps: [
      "Pick one niche and publish a two-week sample pack you would be proud to send",
      "Turn your best work into a simple portfolio page with the brief attached",
      "Pitch a fixed-scope monthly content bundle rather than open-ended posting",
    ],
    challenges: [
      "Waiting for inspiration instead of working from a repeatable system",
      "Doing unlimited revisions because scope was never written down",
      "Chasing trends instead of building something a client can measure",
    ],
    specializations: [
      "Short-form video editing",
      "Email and newsletter content",
      "Brand systems and template libraries",
    ],
  },
  connector: {
    id: "connector",
    title: "The People Connector",
    category: "Customer Support / Community Assistant",
    tagline: "You make people feel heard before you solve their problem.",
    description:
      "Support work looks simple until you try it: it requires patience, clear writing and the judgement to know when a message needs a human. Your instinct to listen first is the part most people have to be trained into.",
    strengths: [
      "Answering the actual question behind the question",
      "Staying warm when the customer is not",
      "Writing replies that do not need a second reply",
      "Noticing the pattern behind a week of similar complaints",
    ],
    tasks: [
      "Customer messages",
      "Email support",
      "Community moderation",
      "Appointment coordination",
      "Customer follow-ups",
      "Support documentation",
    ],
    tools: ["Help desk tools such as Zendesk or Freshdesk", "Shared inbox tools", "Google Docs for macros", "Your existing messaging apps"],
    portfolioProject:
      "Write a mini support kit for a fictional store: 15 saved replies for the most common questions, a one-page escalation rule, and a short customer welcome message.",
    nextSteps: [
      "Turn 10 of your own past replies into reusable templates",
      "Volunteer to run the inbox or group for one small community to build proof",
      "Offer a fixed weekly support block so the client knows exactly what they get",
    ],
    challenges: [
      "Absorbing the emotional weight of every difficult message",
      "Replying in the moment instead of using a template",
      "Being reachable around the clock because the channel never closes",
    ],
    specializations: [
      "Community management for creators",
      "Retention and win-back outreach",
      "Support operations and knowledge-base writing",
    ],
  },
  detective: {
    id: "detective",
    title: "The Digital Detective",
    category: "Research VA / Data Assistant",
    tagline: "You would rather find the answer than guess it.",
    description:
      "You are the person who checks the source. Businesses pay for clean, verified information far more than they admit, because every decision built on bad data costs them twice.",
    strengths: [
      "Finding the detail everyone else skipped",
      "Keeping a spreadsheet accurate and actually usable",
      "Turning a vague question into a structured search",
      "Citing where the information came from",
    ],
    tasks: [
      "Online research",
      "Data organization",
      "Spreadsheet maintenance",
      "Competitor research",
      "Lead research",
      "Information verification",
    ],
    tools: ["Google Sheets or Excel", "Google Advanced Search operators", "Airtable", "Simple data-cleaning routines"],
    portfolioProject:
      "Research 30 real companies in one niche and deliver a verified spreadsheet with source links, a short findings summary and three patterns worth acting on.",
    nextSteps: [
      "Do one research task end to end and write down the method you used",
      "Publish a cleaned, sourced sample dataset as your proof of work",
      "Package research as a recurring weekly deliverable rather than a one-off",
    ],
    challenges: [
      "Over-researching until the deadline has passed",
      "Delivering data without the interpretation that makes it valuable",
      "Charging by the hour for work that should be a fixed package",
    ],
    specializations: [
      "B2B lead research and list building",
      "Competitor and pricing intelligence",
      "Data cleanup and spreadsheet modelling",
    ],
  },
  growth: {
    id: "growth",
    title: "The Growth Driver",
    category: "Sales VA / Lead Generation Assistant",
    tagline: "You get a visible result, and that is what keeps you going.",
    description:
      "This is the most measurable path in the list. You are not responsible for writing posts; you are responsible for keeping the pipeline honest, so a business knows who to talk to today.",
    strengths: [
      "Following up when other people would let it slide",
      "Keeping a list clean and up to date",
      "Opening conversations without sounding automated",
      "Reading a pipeline and saying what is stuck",
    ],
    tasks: [
      "Prospect research",
      "CRM updates",
      "Outreach support",
      "Appointment setting",
      "Sales follow-ups",
      "Pipeline organization",
    ],
    tools: ["HubSpot or Pipedrive", "Google Sheets", "Email sequencing tools", "LinkedIn Sales Navigator"],
    portfolioProject:
      "Build a clean 50-row prospect list for one fictional offer with source links, a short qualifying rule and three sample outreach messages you would actually send.",
    nextSteps: [
      "Learn one CRM well enough to set it up for someone else from scratch",
      "Do a fixed-scope list-building project before promising any meeting numbers",
      "Write a follow-up sequence you can hand over as a documented process",
    ],
    challenges: [
      "Being measured on outcomes you do not fully control",
      "Sending volume instead of relevance",
      "Not writing down the process that makes you consistent",
    ],
    specializations: [
      "Outbound prospecting and list building",
      "CRM administration and reporting",
      "Sales operations and pipeline hygiene",
    ],
  },
  systems: {
    id: "systems",
    title: "The Systems Wizard",
    category: "Automation VA / Technical Support Assistant",
    tagline: "You are happiest when the repetitive part disappears.",
    description:
      "Clients describe this work as magic: a manual process becomes a button. There is a real boundary here, though, and it matters. Beginner-friendly work is setup, configuration and documentation. Complex custom automation is a separate skill that needs more training first.",
    strengths: [
      "Figuring out how a tool actually behaves",
      "Connecting apps so data stops being re-typed",
      "Writing the steps down so the fix survives you",
      "Testing instead of assuming",
    ],
    tasks: [
      "Digital tool setup",
      "AI-assisted workflows",
      "Simple automation",
      "Troubleshooting",
      "Workflow documentation",
      "Process improvements",
    ],
    beginnerVsAdvanced: {
      beginner: [
        "Connecting two apps with a ready-made integration",
        "Setting up forms, folders, tags and triggers that ship with the tool",
        "Writing clear step-by-step documentation for an existing process",
        "Testing a workflow and recording what breaks",
      ],
      advanced: [
        "Custom code steps and API calls",
        "Error handling, retries and logging",
        "Multi-system architectures and data mapping",
        "Building internal tools from scratch",
      ],
      note:
        "Beginner tasks are genuinely valuable and can be paid work on their own. The advanced column is what additional training is for, and it is not assumed here.",
    },
    tools: ["Zapier or Make", "Notion", "Google Workspace admin basics", "ChatGPT-style AI tools for drafting"],
    portfolioProject:
      "Take one repetitive task, automate it with a no-code tool, and document it: before and after, the trigger, the steps, and a two-minute Loom-style written walkthrough.",
    nextSteps: [
      "Automate three repetitive tasks in your own life and document each one",
      "Build a documented sample workflow you can hand to a client unchanged",
      "Offer setup and documentation first; quote custom builds only once trained",
    ],
    challenges: [
      "Promising custom automation before you can reliably build it",
      "Fixing things privately instead of documenting the fix",
      "Undercharging because the client does not see how much time you saved",
    ],
    specializations: [
      "No-code automation builds",
      "AI workflow and prompt systems",
      "Technical support and tool administration",
    ],
  },
  builder: {
    id: "builder",
    title: "The Business Builder",
    category: "E-commerce VA / Online Store Assistant",
    tagline: "You like work where you can see the order move.",
    description:
      "Online stores run on a hundred small upkeep tasks: listings, stock, orders and questions. You get variety, visible progress, and skills that transfer to almost any product business.",
    strengths: [
      "Noticing when something is out of stock before it sells out",
      "Writing product details people actually read",
      "Keeping a catalogue consistent across pages",
      "Handling customer questions without losing the sale",
    ],
    tasks: [
      "Product listings",
      "Order tracking",
      "Inventory updates",
      "Customer questions",
      "Store maintenance",
      "Product catalog management",
    ],
    tools: ["Shopify or WooCommerce", "Canva for product images", "Google Sheets for inventory", "The store's own order dashboard"],
    portfolioProject:
      "Rebuild 15 product listings for a fictional store: optimised titles, descriptions, tags and a tidy inventory sheet with a low-stock rule.",
    nextSteps: [
      "List 10 products properly on a sample store and document your checklist",
      "Write the operating routine for orders, stock and questions in one page",
      "Offer a fixed catalogue-update package instead of hourly work",
    ],
    challenges: [
      "Doing updates reactively instead of on a schedule",
      "Describing features when buyers want benefits",
      "Handling returns and complaints without a written policy",
    ],
    specializations: [
      "Marketplace operations (Shopee, Lazada, Amazon)",
      "Catalogue and inventory management",
      "Store conversion and product-page optimisation",
    ],
  },
};

// ---------------------------------------------------------------------------
// Income model
// ---------------------------------------------------------------------------

// NOTE ON RATES: no verified Philippine VA market survey was available when
// this shipped, so every rate below is presented to visitors strictly as an
// EXAMPLE, never as "typical", "average" or "realistic". Replace EXAMPLE_RATES
// with sourced figures (and flip `labelledAsTypical` to true) only once the data
// has been verified and cited.
const INCOME_MODEL = {
  currency: "PHP",
  symbol: "₱",
  exampleRates: [
    { rate: 150, label: "Starter example" },
    { rate: 250, label: "Building example" },
    { rate: 400, label: "Growing example" },
    { rate: 600, label: "Specialised example" },
  ],
  labelledAsTypical: false,
  // Monthly gross = paid hours per week × 52 / 12 × hourly rate.
  weeksPerYear: 52,
  monthsPerYear: 12,
  modellingNotes: [
    "These are illustrative calculations, not earnings predictions.",
    "Actual paid hours are often lower than the hours you have available.",
    "Rates vary with experience, specialization, clients and market conditions.",
    "Gross figures exclude taxes, platform fees and work expenses.",
    "Nothing here is guaranteed, and completing Assistara Academy does not guarantee employment.",
  ],
  // Open-ended ranges are modelled at an explicit, documented value rather
  // than pretending the visitor supplied an exact number.
  openEndedModelling: {
    a: { label: "Less than 5 hours", modelledAt: 4 },
    f: { label: "More than 40 hours", modelledAt: 40 },
  },
};

const READINESS_STAGES = [
  { id: 1, key: "exploring", title: "Exploring" },
  { id: 2, key: "building-skills", title: "Building Skills" },
  { id: 3, key: "practicing-portfolio", title: "Practicing and Building a Portfolio" },
  { id: 4, key: "preparing-clients", title: "Preparing for Clients" },
  { id: 5, key: "working-with-clients", title: "Already Working With Clients" },
];

// Supporting evidence from q6. Integer weights keep the ordering deterministic.
const TOOL_WEIGHTS = {
  t1: { organizer: 2, detective: 1 },
  t2: { creative: 3 },
  t3: { creative: 1, connector: 2 },
  t4: { detective: 2, organizer: 1 },
  t5: { connector: 2, growth: 3 },
  t6: { systems: 3 },
  t7: { builder: 3 },
  tnone: {},
};

// Weight ordering is part of the contract and is asserted by tests:
//   PRIMARY_WEIGHT (q4) > SECONDARY_WEIGHT (q5) > any single tool contribution (q6)
// so question 4 is always the strongest individual signal and no single tool
// selection can outrank question 5 on a different career.
const PRIMARY_WEIGHT = 6; // q4
const SECONDARY_WEIGHT = 4; // q5
const TOOL_WEIGHT = 1; // multiplier applied to TOOL_WEIGHTS values
const MAX_TOOL_CONTRIBUTION = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function question(id) {
  return QUESTIONS.find((q) => q.id === id) || null;
}

function optionOf(q, key) {
  if (!q || !q.options) return null;
  return q.options.find((o) => o.key === String(key || "")) || null;
}

function zeroScores() {
  const out = {};
  for (const id of CAREER_ORDER) out[id] = 0;
  return out;
}

function sortedCareers(scores) {
  // Deterministic: highest score first, canonical order breaks ties.
  return CAREER_ORDER.slice().sort((a, b) => {
    const d = (scores[b] || 0) - (scores[a] || 0);
    if (d !== 0) return d;
    return CAREER_ORDER.indexOf(a) - CAREER_ORDER.indexOf(b);
  });
}

// ---------------------------------------------------------------------------
// Validation (server-side input validation lives here)
// ---------------------------------------------------------------------------

function normaliseSingle(q, raw) {
  const key = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!optionOf(q, key)) return { ok: false, error: `Invalid answer for ${q.id}` };
  return { ok: true, value: key };
}

function normaliseMulti(q, raw) {
  if (!Array.isArray(raw)) return { ok: false, error: `Invalid answer for ${q.id}` };
  const allowed = q.options.map((o) => o.key);
  const seen = new Set();
  for (const item of raw) {
    const key = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (!allowed.includes(key)) return { ok: false, error: `Invalid choice for ${q.id}` };
    seen.add(key);
  }
  const exclusive = q.options.filter((o) => o.exclusive).map((o) => o.key);
  const chosenExclusive = exclusive.filter((k) => seen.has(k));
  if (chosenExclusive.length > 1) return { ok: false, error: `Conflicting choices for ${q.id}` };
  if (chosenExclusive.length === 1 && seen.size > 1) {
    return { ok: false, error: `"${q.id}" choice is mutually exclusive` };
  }
  // Preserve canonical order so the stored answer is stable.
  const value = allowed.filter((k) => seen.has(k));
  if (value.length === 0) return { ok: false, error: `Missing answer for ${q.id}` };
  return { ok: true, value };
}

function normaliseIncome(q, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid income goal" };
  const clamped = Math.min(q.max, Math.max(q.min, n));
  const snapped = Math.round(clamped / q.step) * q.step;
  return { ok: true, value: Math.min(q.max, Math.max(q.min, snapped)) };
}

/**
 * Validate + normalise a full answer payload. Returns either
 * { ok:false, error } or { ok:true, answers } where `answers` is the
 * canonical, ordered, clamped representation that is stored and scored.
 */
function normaliseAnswers(raw) {
  if (!isObject(raw)) return { ok: false, error: "Answers must be an object" };
  const answers = {};
  for (const q of QUESTIONS) {
    const incoming = raw[q.id];
    let res;
    if (q.type === "single" || q.type === "hours") res = normaliseSingle(q, incoming);
    else if (q.type === "multi") res = normaliseMulti(q, incoming);
    else if (q.type === "income") res = normaliseIncome(q, incoming);
    else res = { ok: false, error: `Unknown question type for ${q.id}` };
    if (!res.ok) return res;
    answers[q.id] = res.value;
  }
  return { ok: true, answers };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function evidenceFor(career, entries) {
  return entries
    .filter((e) => e.career === career)
    .map(({ label, weight, question: qid }) => ({ question: qid, label, weight }));
}

function scoreAnswers(answers) {
  const scores = zeroScores();
  const evidence = CAREER_ORDER.map(() => []);

  const push = (career, weight, qid, label) => {
    if (!career || !(career in scores)) return;
    scores[career] += weight;
    evidence[CAREER_ORDER.indexOf(career)].push({ question: qid, weight, label, career });
  };

  // q4 — primary signal.
  const q4 = question("q4");
  const a4 = optionOf(q4, answers.q4);
  if (a4) push(a4.career, PRIMARY_WEIGHT, "q4", a4.label);

  // q5 — secondary signal.
  const q5 = question("q5");
  const a5 = optionOf(q5, answers.q5);
  if (a5) push(a5.career, SECONDARY_WEIGHT, "q5", a5.label);

  // q6 — supporting evidence.
  const chosenTools = Array.isArray(answers.q6) ? answers.q6 : [];
  const q6 = question("q6");
  for (const toolKey of chosenTools) {
    const opt = optionOf(q6, toolKey);
    if (!opt) continue;
    const weights = TOOL_WEIGHTS[toolKey] || {};
    for (const [career, w] of Object.entries(weights)) {
      push(career, w * TOOL_WEIGHT, "q6", opt.label);
    }
  }

  const order = sortedCareers(scores);
  const primary = order[0] || null;
  let secondary = order.find((id) => id !== primary && (scores[id] || 0) > 0) || null;

  // If only one career earned anything, offer the nearest canonical alternative
  // as a genuine secondary worth exploring — never as a fabricated percentage.
  if (!secondary && order.length > 1) secondary = order[1];

  const primaryEvidence = primary ? evidenceFor(primary, evidence[CAREER_ORDER.indexOf(primary)]) : [];
  const secondaryEvidence = secondary
    ? evidenceFor(secondary, evidence[CAREER_ORDER.indexOf(secondary)])
    : [];

  return {
    scoringVersion: SCORING_VERSION,
    scores,
    order,
    primary,
    secondary,
    primaryEvidence,
    secondaryEvidence,
  };
}

// ---------------------------------------------------------------------------
// Readiness (deliberately separate from career matching)
// ---------------------------------------------------------------------------

function readinessFor(answers) {
  const q7 = question("q7");
  const opt7 = optionOf(q7, answers.q7);
  const step = opt7 ? Number(opt7.step) || 1 : 1;
  const tools = Array.isArray(answers.q6) ? answers.q6 : [];
  const toolCount = tools.filter((t) => t !== "tnone").length;
  const noneSelected = tools.includes("tnone");

  let stage = step;
  // Transferable digital skills can move a beginner along one stage. Owning a
  // certificate never does this on its own: a certificate is not the same as
  // being ready for a client.
  if (stage <= 2 && toolCount >= 5) stage += 1;
  if (stage < 1) stage = 1;
  if (stage > 5) stage = 5;

  const meta = READINESS_STAGES.find((s) => s.id === stage) || READINESS_STAGES[0];
  return {
    stage,
    key: meta.key,
    title: meta.title,
    toolCount,
    noneSelected,
    experienceStep: step,
  };
}

// ---------------------------------------------------------------------------
// Acquisition lead priority
// ---------------------------------------------------------------------------
// An OPERATIONAL ranking for follow-up ordering, not a validated predictor of
// anything. Every point traces to something the person said out loud, and the
// breakdown is returned alongside the total so an admin can see exactly why a
// lead sits where it does.
//
// Deliberate exclusions:
//   - The income goal contributes NOTHING. Wanting a large income is not
//     evidence of intent to buy training, and scoring it would manufacture
//     false priority out of ambition.
//   - Career match contributes NOTHING. Which VA path suits someone says
//     nothing about how ready they are to enrol.
const LEAD_PRIORITY = {
  max: 100,
  // Surfaces that already know the person applied may add this on top of the
  // stored score. It is exported so the read-side value cannot silently drift
  // from the scoring rules; a test asserts the two agree.
  applicationBonus: 30,
  timeline: { now: 40, month: 30, quarter: 15, half: 8, exploring: 0 },
  experience: { 1: 0, 2: 7, 3: 14, 4: 22, 5: 30 },
  capacity: { 20: 15, 10: 10, 5: 5, 0: 0 },
  bands: [
    { key: "hot", label: "Ready to start", min: 70 },
    { key: "warm", label: "Strong prospect", min: 45 },
    { key: "developing", label: "Worth nurturing", min: 20 },
    { key: "cool", label: "Early stage", min: 0 },
  ],
};

function leadPriorityBand(score) {
  const n = Number(score) || 0;
  return LEAD_PRIORITY.bands.find((b) => n >= b.min) || LEAD_PRIORITY.bands[LEAD_PRIORITY.bands.length - 1];
}

function leadPriority(answers, opts) {
  const a = answers || {};
  const reasons = [];
  let score = 0;

  // 1. Self-declared intent to start. The single strongest signal.
  const t = optionOf(question("q10"), a.q10);
  if (t && t.timeline) {
    const pts = LEAD_PRIORITY.timeline[t.timeline] || 0;
    score += pts;
    if (pts > 0) {
      reasons.push({
        label: t.timeline === "now"
          ? "Said they want to start right now"
          : t.timeline === "month"
            ? "Said they want to start within 30 days"
            : t.timeline === "quarter"
              ? "Said they want to start within three months"
              : "Said they want to start within six months",
        points: pts,
      });
    }
  }

  // 2. Relevant skills or previous experience, self-declared on q7.
  const readiness = readinessFor(a);
  const expPts = LEAD_PRIORITY.experience[readiness.stage] || 0;
  score += expPts;
  if (expPts > 0) {
    reasons.push({
      label: readiness.stage >= 5
        ? "Has already done paid client work"
        : readiness.stage >= 4
          ? "Has portfolio work or practiced real tasks"
          : readiness.stage >= 3
            ? "Has completed a course or holds a certificate"
            : "Has taught themselves relevant skills",
      points: expPts,
    });
  }

  // 3. Practical capacity to act on it. Someone with hours free can move.
  // Walked highest-first so the largest satisfied tier wins; ascending would
  // stop at the first threshold and quietly under-score everyone above it.
  const hours = hoursForAnswer(a).hours;
  let capPts = LEAD_PRIORITY.capacity[0];
  for (const threshold of [20, 10, 5]) {
    if (hours >= threshold) { capPts = LEAD_PRIORITY.capacity[threshold]; break; }
  }
  score += capPts;
  if (capPts > 0) {
    reasons.push({
      label: `Has about ${hours} hours a week to put into this`,
      points: capPts,
    });
  }

  // 4. Already submitted an Academy application. Genuine behavioural
  // evidence, so it counts, but only when it actually happened.
  if (opts && opts.applied === true) {
    score += LEAD_PRIORITY.applicationBonus;
    reasons.push({ label: "Has already submitted an Academy application", points: LEAD_PRIORITY.applicationBonus });
  }

  score = Math.max(0, Math.min(LEAD_PRIORITY.max, score));
  const band = leadPriorityBand(score);
  return { score, band: band.key, bandLabel: band.label, reasons, applied: !!(opts && opts.applied) };
}

// ---------------------------------------------------------------------------
// Income scenarios
// ---------------------------------------------------------------------------

function hoursForAnswer(answers) {
  const q3 = question("q3");
  const opt = optionOf(q3, answers.q3);
  if (!opt) return { hours: 0, option: null, openEnded: false, modelledAt: 0 };
  return {
    hours: Number(opt.hours) || 0,
    option: opt.key,
    label: opt.label,
    openEnded: !!opt.openEnded,
    modelledAt: opt.openEnded ? Number(INCOME_MODEL.openEndedModelling[opt.key]?.modelledAt) || 0 : null,
  };
}

function incomeScenarios(answers) {
  const q2 = question("q2");
  const goalRes = normaliseIncome(q2, answers.q2);
  const goal = goalRes.ok ? goalRes.value : q2.defaultAmount;
  const hoursInfo = hoursForAnswer(answers);
  const paid = hoursInfo.hours;
  const perYear = (INCOME_MODEL.weeksPerYear / INCOME_MODEL.monthsPerYear); // 52/12

  const scenarios = INCOME_MODEL.exampleRates.map((r) => ({
    rate: r.rate,
    label: r.label,
    monthly: Math.round(paid * perYear * r.rate),
    isExample: !INCOME_MODEL.labelledAsTypical,
  }));

  const requiredRate = paid > 0 ? Math.ceil(goal / (paid * perYear)) : null;
  const hoursNeeded = INCOME_MODEL.exampleRates.map((r) => ({
    rate: r.rate,
    label: r.label,
    hours: paid > 0 || r.rate > 0 ? Math.ceil(goal / (perYear * r.rate)) : null,
  }));

  return {
    currency: INCOME_MODEL.currency,
    symbol: INCOME_MODEL.symbol,
    goal,
    weeklyHours: paid,
    weeklyHoursLabel: hoursInfo.label,
    weeklyHoursOpenEnded: hoursInfo.openEnded,
    weeklyHoursModelledAt: hoursInfo.modelledAt,
    weeksPerYear: INCOME_MODEL.weeksPerYear,
    monthsPerYear: INCOME_MODEL.monthsPerYear,
    formula: "monthly gross = paid hours per week × 52 ÷ 12 × hourly rate",
    scenarios,
    requiredRate,
    hoursNeeded,
    labelledAsTypical: INCOME_MODEL.labelledAsTypical,
    modellingNotes: INCOME_MODEL.modellingNotes,
  };
}

function peso(n) {
  const v = Math.round(Number(n) || 0);
  return INCOME_MODEL.symbol + v.toLocaleString("en-US");
}

module.exports = {
  SCORING_VERSION,
  REPORT_VERSION,
  CAREER_ORDER,
  QUESTIONS,
  CAREERS,
  INCOME_MODEL,
  READINESS_STAGES,
  TOOL_WEIGHTS,
  PRIMARY_WEIGHT,
  SECONDARY_WEIGHT,
  MAX_TOOL_CONTRIBUTION,
  question,
  optionOf,
  normaliseAnswers,
  scoreAnswers,
  readinessFor,
  leadPriority,
  leadPriorityBand,
  LEAD_PRIORITY,
  hoursForAnswer,
  incomeScenarios,
  sortedCareers,
  peso,
  isObject,
};
