// Server-only exam grading bank. Do not include in static builds or API responses.
// The correct-answer field exists ONLY in this server module; the academy-exam
// API strips it from every response before the browser ever sees a question.
module.exports = Object.freeze([
  {
    "exam_key": "phase_1",
    "exam_version": "phase_1-v1",
    "title": "Phase 1 Exam - Freelancing Foundations",
    "passing_score": 80,
    "instructions": "This exam covers the whole of Phase 1: freelancing and virtual assistance, the core VA skills, admin and executive support, customer support and business operations, and market research. Answer all ten questions in one sitting. You need 8 correct answers (80%) to pass and unlock Phase 2. Each question has exactly one defensible answer drawn from the Phase 1 lessons. If you do not pass, your highest score is kept and you can retake the exam.",
    "review_topics": [
      {
        "label": "Module 1 - Freelancing & Virtual Assistance Basics",
        "classes": [
          "p1m1c1",
          "p1m1c2",
          "p1m1c3",
          "p1m1c4"
        ]
      },
      {
        "label": "Module 2 - Core VA Skills",
        "classes": [
          "p1m2c1",
          "p1m2c2",
          "p1m2c3",
          "p1m2c4"
        ]
      },
      {
        "label": "Module 3 - Admin & Executive Support",
        "classes": [
          "p1m3c1",
          "p1m3c2",
          "p1m3c3",
          "p1m3c4"
        ]
      },
      {
        "label": "Module 4 - Customer Support & Business Operations",
        "classes": [
          "p1m4c1",
          "p1m4c2",
          "p1m4c3"
        ]
      },
      {
        "label": "Module 5 - Market Research & Data Organization",
        "classes": [
          "p1m5c1",
          "p1m5c2",
          "p1m5c3"
        ]
      },
      {
        "label": "Module 6 - Project & Business Management",
        "classes": [
          "p1m6c1",
          "p1m6c2",
          "p1m6c3",
          "p1m6c4"
        ]
      }
    ],
    "questions": [
      {
        "id": "phase_1.q01",
        "prompt": "A client needs their calendar, inbox, data entry and research handled from home. Which description matches how Phase 1 defines virtual assistance?",
        "options": [
          {
            "id": "phase_1.q01.o01",
            "text": "Providing support to businesses and entrepreneurs remotely"
          },
          {
            "id": "phase_1.q01.o02",
            "text": "Managing a physical office and its on-site staff on the employer's behalf"
          },
          {
            "id": "phase_1.q01.o03",
            "text": "Selling products on the client's behalf and taking a percentage of each sale"
          },
          {
            "id": "phase_1.q01.o04",
            "text": "Advising the client on which staff to hire and how to restructure the business"
          }
        ],
        "correct_option_id": "phase_1.q01.o01"
      },
      {
        "id": "phase_1.q02",
        "prompt": "A VA offers \"data entry\" as a service. What does the client-value test in VA Niches & Specializations tell them to clarify before selling it?",
        "options": [
          {
            "id": "phase_1.q02.o01",
            "text": "Which data-entry software has the cheapest annual licence"
          },
          {
            "id": "phase_1.q02.o02",
            "text": "Exactly how many minutes each row of data takes to enter"
          },
          {
            "id": "phase_1.q02.o03",
            "text": "Whether the client prefers email or Slack for status updates"
          },
          {
            "id": "phase_1.q02.o04",
            "text": "Which problem the task solves for the client and how it moves the business forward"
          }
        ],
        "correct_option_id": "phase_1.q02.o04"
      },
      {
        "id": "phase_1.q03",
        "prompt": "A client message is unclear and you do not have the answer. Which sequence matches the professional problem-solving loop in Employee vs. Freelancer Mindset?",
        "options": [
          {
            "id": "phase_1.q03.o01",
            "text": "Search Google first, wait for the deadline to pass, then escalate the task to a manager"
          },
          {
            "id": "phase_1.q03.o02",
            "text": "Ask the client to carry out the task themselves, then document what you observed"
          },
          {
            "id": "phase_1.q03.o03",
            "text": "Diagnose what is missing, search existing sources for the answer, ask with context or options, then ask what the client needs next"
          },
          {
            "id": "phase_1.q03.o04",
            "text": "Reply straight away with your best guess, then search for the real answer afterwards"
          }
        ],
        "correct_option_id": "phase_1.q03.o03"
      },
      {
        "id": "phase_1.q04",
        "prompt": "You are going to miss a deadline you already promised. What does Remote Work Expectations & Client Communication tell you to do?",
        "options": [
          {
            "id": "phase_1.q04.o01",
            "text": "Mention it only if the client asks, so you do not appear unreliable"
          },
          {
            "id": "phase_1.q04.o02",
            "text": "Tell the client early, own it honestly, and bring options with a recommended next step"
          },
          {
            "id": "phase_1.q04.o03",
            "text": "Say nothing and keep working, then explain the delay once the deadline has passed"
          },
          {
            "id": "phase_1.q04.o04",
            "text": "Hand the work to a different freelancer without telling the client"
          }
        ],
        "correct_option_id": "phase_1.q04.o02"
      },
      {
        "id": "phase_1.q05",
        "prompt": "Your afternoon is a chain of email, research, Slack and report work. What does Time Management & Productivity identify as the problem, and what is the fix?",
        "options": [
          {
            "id": "phase_1.q05.o01",
            "text": "Shallow switching creates distracted work; protect focus by working in sprints on one priority at a time"
          },
          {
            "id": "phase_1.q05.o02",
            "text": "The week is under-planned; block more calendar time for client work"
          },
          {
            "id": "phase_1.q05.o03",
            "text": "Slack is being neglected; answer every Slack message before starting anything else"
          },
          {
            "id": "phase_1.q05.o04",
            "text": "There are not enough breaks in the day; schedule more and longer breaks"
          }
        ],
        "correct_option_id": "phase_1.q05.o01"
      },
      {
        "id": "phase_1.q06",
        "prompt": "Which reply to \"Could you confirm the deadline?\" matches the polite but confident tone the lesson asks for?",
        "options": [
          {
            "id": "phase_1.q06.o01",
            "text": "Sorry to bother you again, but I was just wondering if maybe you could confirm the deadline?"
          },
          {
            "id": "phase_1.q06.o02",
            "text": "Hi, quick one, apologies for the message, deadline please whenever you get a chance, thanks so much!"
          },
          {
            "id": "phase_1.q06.o03",
            "text": "Following up on my previous email. Please confirm the deadline at your earliest convenience."
          },
          {
            "id": "phase_1.q06.o04",
            "text": "Could you confirm the deadline for this task? I'll plan the work around that date."
          }
        ],
        "correct_option_id": "phase_1.q06.o04"
      },
      {
        "id": "phase_1.q07",
        "prompt": "Client A is due in 45 minutes and you already promised the work. Client B says it is urgent but names no deadline. What does Managing Multiple Clients & Workload tell you to do?",
        "options": [
          {
            "id": "phase_1.q07.o01",
            "text": "Do whichever of the two you can finish fastest, and send both back"
          },
          {
            "id": "phase_1.q07.o02",
            "text": "Tell both clients you are unavailable today and ask them to retry tomorrow"
          },
          {
            "id": "phase_1.q07.o03",
            "text": "Protect A, ask B what deadline they are actually working toward, then schedule the rest against your capacity"
          },
          {
            "id": "phase_1.q07.o04",
            "text": "Do B first, because a message that says urgent always outranks a stated deadline"
          }
        ],
        "correct_option_id": "phase_1.q07.o03"
      },
      {
        "id": "phase_1.q08",
        "prompt": "You are choosing a file system for a client. Which set is the PARA method described in File Management?",
        "options": [
          {
            "id": "phase_1.q08.o01",
            "text": "Projects, Attachments, Resources, Active"
          },
          {
            "id": "phase_1.q08.o02",
            "text": "Projects, Areas, Resources, Archive"
          },
          {
            "id": "phase_1.q08.o03",
            "text": "Priority, Active, Recent, Archived"
          },
          {
            "id": "phase_1.q08.o04",
            "text": "Personal, Admin, Records, Archive"
          }
        ],
        "correct_option_id": "phase_1.q08.o02"
      },
      {
        "id": "phase_1.q09",
        "prompt": "An angry customer received the wrong item and needs it by Friday. Which action follows the C.A.R.E. framework in Customer Service?",
        "options": [
          {
            "id": "phase_1.q09.o01",
            "text": "Confirm the real concern, acknowledge the emotion, then give a solution or next step"
          },
          {
            "id": "phase_1.q09.o02",
            "text": "Offer a refund in the first reply, then delete the thread once it is resolved"
          },
          {
            "id": "phase_1.q09.o03",
            "text": "Thank the customer for their patience, then qualify them as a sales lead"
          },
          {
            "id": "phase_1.q09.o04",
            "text": "Escalate the complaint to a manager, then archive the conversation"
          }
        ],
        "correct_option_id": "phase_1.q09.o01"
      },
      {
        "id": "phase_1.q10",
        "prompt": "You have finished collecting market research for a client. What does Organizing Your Findings tell you to do with it?",
        "options": [
          {
            "id": "phase_1.q10.o01",
            "text": "Rewrite every finding in the client's brand voice before recording it"
          },
          {
            "id": "phase_1.q10.o02",
            "text": "Post the findings publicly to test which ones the audience reacts to"
          },
          {
            "id": "phase_1.q10.o03",
            "text": "Keep only the findings a competitor also appears in, and drop the rest"
          },
          {
            "id": "phase_1.q10.o04",
            "text": "Sort it into the six report sections so the client can scan it and act on it"
          }
        ],
        "correct_option_id": "phase_1.q10.o04"
      }
    ]
  },
  {
    "exam_key": "phase_2",
    "exam_version": "phase_2-v1",
    "title": "Phase 2 Exam - Creative & Digital Marketing Skills",
    "passing_score": 80,
    "instructions": "This exam covers the whole of Phase 2: building your VA brand, visual branding for clients, social media marketing, content planning, graphics, video, Meta ads, influencer collaboration, funnels and email marketing. Answer all ten questions in one sitting. You need 8 correct answers (80%) to pass and unlock Phase 3. Each question has exactly one defensible answer drawn from the Phase 2 lessons. If you do not pass, your highest score is kept and you can retake the exam.",
    "review_topics": [
      {
        "label": "Module 1 - Build Your VA Brand",
        "classes": [
          "p2m1c1",
          "p2m1c2",
          "p2m1c3",
          "p2m1c4"
        ]
      },
      {
        "label": "Module 2 - Virtual Branding for Clients",
        "classes": [
          "p2m2c1",
          "p2m2c2",
          "p2m2c3"
        ]
      },
      {
        "label": "Module 3 - Social Media Management",
        "classes": [
          "p2m3c1",
          "p2m3c2",
          "p2m3c3",
          "p2m3c4"
        ]
      },
      {
        "label": "Module 4 - AI Content Planning & Strategy",
        "classes": [
          "p2m4c1",
          "p2m4c2",
          "p2m4c3",
          "p2m4c4"
        ]
      },
      {
        "label": "Modules 5-6 - Visuals, Graphics & Video",
        "classes": [
          "p2m5c1",
          "p2m5c2",
          "p2m6c1",
          "p2m6c2"
        ]
      },
      {
        "label": "Module 7 - Facebook Ads",
        "classes": [
          "p2m7c1",
          "p2m7c2",
          "p2m7c3",
          "p2m7c4",
          "p2m7c5"
        ]
      },
      {
        "label": "Modules 8-9 - Influencer Sourcing & Funnels",
        "classes": [
          "p2m8c1",
          "p2m8c2",
          "p2m9c1",
          "p2m9c2",
          "p2m9c3",
          "p2m9c4"
        ]
      },
      {
        "label": "Module 10 - Email Marketing & Domain",
        "classes": [
          "p2m10c1",
          "p2m10c2"
        ]
      }
    ],
    "questions": [
      {
        "id": "phase_2.q01",
        "prompt": "A client's brand feels like a collection of colours the designer happens to like. What does Build a Brand Strategy for Clients say has to come first?",
        "options": [
          {
            "id": "phase_2.q01.o01",
            "text": "A written strategy stating what the client is trying to achieve, before any colour, font or logo"
          },
          {
            "id": "phase_2.q01.o02",
            "text": "A mood board of competitor designs, so the client can pick a direction"
          },
          {
            "id": "phase_2.q01.o03",
            "text": "A shortlist of three logo structures to choose from"
          },
          {
            "id": "phase_2.q01.o04",
            "text": "A Canva brand kit, so every design stays consistent from the start"
          }
        ],
        "correct_option_id": "phase_2.q01.o01"
      },
      {
        "id": "phase_2.q02",
        "prompt": "You are asked to build a logo for a client whose full brand name is long. Which logo structure does Create a Logo describe as the strong fit in that case?",
        "options": [
          {
            "id": "phase_2.q02.o01",
            "text": "A text-based logo, because the name is the mark and reads clearly at any size"
          },
          {
            "id": "phase_2.q02.o02",
            "text": "An icon with the name beside it, so the mark can work on its own"
          },
          {
            "id": "phase_2.q02.o03",
            "text": "A wordmark in a script font, because it looks more premium than a monogram"
          },
          {
            "id": "phase_2.q02.o04",
            "text": "An initials or monogram, because it stays compact when the full name is long"
          }
        ],
        "correct_option_id": "phase_2.q02.o04"
      },
      {
        "id": "phase_2.q03",
        "prompt": "A U.S. client asks you to create their Facebook page from your home country. What does Set Up a Facebook Page say is the secure approach?",
        "options": [
          {
            "id": "phase_2.q03.o01",
            "text": "Create the page from your location and share your login details with the client"
          },
          {
            "id": "phase_2.q03.o02",
            "text": "Use a business portfolio first, then transfer the page to the client's account"
          },
          {
            "id": "phase_2.q03.o03",
            "text": "Ask the client to create the page themselves from their own location, then request admin access to manage it"
          },
          {
            "id": "phase_2.q03.o04",
            "text": "Create the page yourself and complete verification later if Meta asks for it"
          }
        ],
        "correct_option_id": "phase_2.q03.o03"
      },
      {
        "id": "phase_2.q04",
        "prompt": "A post has been seen by 5,000 individual people, and 200 of them reacted, commented, shared or clicked. What does Social Media Analytics & Measurement call that 200?",
        "options": [
          {
            "id": "phase_2.q04.o01",
            "text": "Link clicks, because every interaction is a click on the post"
          },
          {
            "id": "phase_2.q04.o02",
            "text": "Engagement, because it counts total interactions such as likes, comments, shares and clicks"
          },
          {
            "id": "phase_2.q04.o03",
            "text": "Impressions, because it counts every view including repeats"
          },
          {
            "id": "phase_2.q04.o04",
            "text": "Reach, because it counts the people who interacted with the post"
          }
        ],
        "correct_option_id": "phase_2.q04.o02"
      },
      {
        "id": "phase_2.q05",
        "prompt": "A client does not use any project-management platform. Content Planning with Google Sheets describes Sheets as the practical choice here. Why?",
        "options": [
          {
            "id": "phase_2.q05.o01",
            "text": "It is free, and it still gives the client one place to organize and track content from idea to published post"
          },
          {
            "id": "phase_2.q05.o02",
            "text": "It automates the whole content pipeline, so posts publish without a VA"
          },
          {
            "id": "phase_2.q05.o03",
            "text": "It replaces the need for a content strategy, because the sheet holds the strategy"
          },
          {
            "id": "phase_2.q05.o04",
            "text": "It is the only tool that can hold brand assets alongside the content plan"
          }
        ],
        "correct_option_id": "phase_2.q05.o01"
      },
      {
        "id": "phase_2.q06",
        "prompt": "A client's ad account is billed by threshold, and today the client asks why their card has not been charged despite active ads. Which explanation matches Facebook Ad Payment Structure?",
        "options": [
          {
            "id": "phase_2.q06.o01",
            "text": "Threshold billing charges on a fixed calendar date, so the charge is still a week away"
          },
          {
            "id": "phase_2.q06.o02",
            "text": "Monthly billing only charges once the monthly budget is fully spent"
          },
          {
            "id": "phase_2.q06.o03",
            "text": "The card is only charged after the campaign's end date has passed"
          },
          {
            "id": "phase_2.q06.o04",
            "text": "Threshold billing charges when the account's ad spend reaches a threshold Meta sets, so the charge has simply not triggered yet"
          }
        ],
        "correct_option_id": "phase_2.q06.o04"
      },
      {
        "id": "phase_2.q07",
        "prompt": "A client wants a system that takes someone from \"just looking\" to \"I'm buying\". Which set is the funnel, in the order Landing Pages & Lead Magnets gives?",
        "options": [
          {
            "id": "phase_2.q07.o01",
            "text": "Reach, engage, follow, convert, retain"
          },
          {
            "id": "phase_2.q07.o02",
            "text": "Attract, sell, deliver, support, re-engage"
          },
          {
            "id": "phase_2.q07.o03",
            "text": "Attract, capture, nurture, convert, delight"
          },
          {
            "id": "phase_2.q07.o04",
            "text": "Awareness, interest, consideration, purchase, loyalty"
          }
        ],
        "correct_option_id": "phase_2.q07.o03"
      },
      {
        "id": "phase_2.q08",
        "prompt": "A lead signs up through a Systeme.io opt-in page. What does Create Your First Email Marketing Campaign say happens next?",
        "options": [
          {
            "id": "phase_2.q08.o01",
            "text": "The lead is sent to the client's sales team to be contacted directly"
          },
          {
            "id": "phase_2.q08.o02",
            "text": "The contact is captured in the dashboard and automatically subscribed to the pre-set email campaign, then emails go out on the schedule you set"
          },
          {
            "id": "phase_2.q08.o03",
            "text": "The lead is added to a general newsletter list until you manually move them to a campaign"
          },
          {
            "id": "phase_2.q08.o04",
            "text": "The lead receives a single confirmation email and nothing further until you reply"
          }
        ],
        "correct_option_id": "phase_2.q08.o02"
      },
      {
        "id": "phase_2.q09",
        "prompt": "A VA wants to record a short video introduction to use when applying for VA work. What does Create Your VA Video Introduction say the video shows that a resume cannot?",
        "options": [
          {
            "id": "phase_2.q09.o01",
            "text": "Personality, professionalism and communication skills demonstrated rather than claimed"
          },
          {
            "id": "phase_2.q09.o02",
            "text": "Your full employment history, references and years of experience in one place"
          },
          {
            "id": "phase_2.q09.o03",
            "text": "A live demonstration of every tool you can use, performed on camera"
          },
          {
            "id": "phase_2.q09.o04",
            "text": "Your hourly rate, availability and contract terms in your own words"
          }
        ],
        "correct_option_id": "phase_2.q09.o01"
      },
      {
        "id": "phase_2.q10",
        "prompt": "A client's generic Gmail address is landing in junk folders and clients seem unsure whether their emails are really from the business. Which pair of outcomes does Buy Your Own Domain attribute to a custom domain email?",
        "options": [
          {
            "id": "phase_2.q10.o01",
            "text": "It reduces the cost of the client's email marketing platform"
          },
          {
            "id": "phase_2.q10.o02",
            "text": "It removes the need for a landing page and a thank-you page"
          },
          {
            "id": "phase_2.q10.o03",
            "text": "It guarantees the client's messages are opened by every recipient"
          },
          {
            "id": "phase_2.q10.o04",
            "text": "It builds trust and improves email deliverability"
          }
        ],
        "correct_option_id": "phase_2.q10.o04"
      }
    ]
  },
  {
    "exam_key": "phase_3",
    "exam_version": "phase_3-v1",
    "title": "Phase 3 Exam - AI & Digital Systems",
    "passing_score": 80,
    "instructions": "This exam covers the whole of Phase 3: AI fundamentals, prompt engineering, custom GPTs, automation, AI content workflows, SEO, and podcast support. Answer all ten questions in one sitting. You need 8 correct answers (80%) to pass and unlock Phase 4. Each question has exactly one defensible answer drawn from the Phase 3 lessons. If you do not pass, your highest score is kept and you can retake the exam.",
    "review_topics": [
      {
        "label": "Module 1 - AI Foundations & Your AI Workspace",
        "classes": [
          "p3m1c1",
          "p3m1c2",
          "p3m1c3",
          "p3m1c4",
          "p3m1c5"
        ]
      },
      {
        "label": "Module 2 - AI-Powered Content & Automation Workflows",
        "classes": [
          "p3m2c1",
          "p3m2c2",
          "p3m2c3",
          "p3m2c4",
          "p3m2c5",
          "p3m2c6"
        ]
      },
      {
        "label": "Module 3 - SEO & Search",
        "classes": [
          "p3m3c1",
          "p3m3c2",
          "p3m3c3"
        ]
      },
      {
        "label": "Module 4 - Podcast Support Services",
        "classes": [
          "p3m4c1",
          "p3m4c2",
          "p3m4c3",
          "p3m4c4"
        ]
      }
    ],
    "questions": [
      {
        "id": "phase_3.q01",
        "prompt": "What does How to Not Be Replaced by AI say keeps a Virtual Assistant valuable as AI tools become accessible to everyone?",
        "options": [
          {
            "id": "phase_3.q01.o01",
            "text": "Guiding the tools and connecting the dots for the client, rather than only executing tasks"
          },
          {
            "id": "phase_3.q01.o02",
            "text": "Refusing to use AI so the client trusts your work is human-made"
          },
          {
            "id": "phase_3.q01.o03",
            "text": "Learning to use a larger number of AI tools than other VAs"
          },
          {
            "id": "phase_3.q01.o04",
            "text": "Delivering tasks faster by automating them without client involvement"
          }
        ],
        "correct_option_id": "phase_3.q01.o01"
      },
      {
        "id": "phase_3.q02",
        "prompt": "The four prompt ingredients in Prompt Engineering Basics add up to one formula. Which description matches the goal the lesson gives for prompt engineering?",
        "options": [
          {
            "id": "phase_3.q02.o01",
            "text": "Making the language model sound more intelligent than a human writer"
          },
          {
            "id": "phase_3.q02.o02",
            "text": "Writing the longest possible prompt so no context is ever missing"
          },
          {
            "id": "phase_3.q02.o03",
            "text": "Replacing the need to review the model's output before sending it"
          },
          {
            "id": "phase_3.q02.o04",
            "text": "Getting the right answer in the right shape without twenty wasted attempts"
          }
        ],
        "correct_option_id": "phase_3.q02.o04"
      },
      {
        "id": "phase_3.q03",
        "prompt": "A VA retypes the same client facts into every ChatGPT prompt for one client. What does Customize Your ChatGPT tell them to do instead?",
        "options": [
          {
            "id": "phase_3.q03.o01",
            "text": "Create one Custom GPT per client with the facts saved as a saved prompt"
          },
          {
            "id": "phase_3.q03.o02",
            "text": "Ask the client to approve a prompt template with their facts in it"
          },
          {
            "id": "phase_3.q03.o03",
            "text": "Write those facts once in the 1,500-character Custom Instructions box so they apply to everything afterwards"
          },
          {
            "id": "phase_3.q03.o04",
            "text": "Store the facts in a separate document and paste a shorter reminder into each prompt"
          }
        ],
        "correct_option_id": "phase_3.q03.o03"
      },
      {
        "id": "phase_3.q04",
        "prompt": "What is the key distinction Create GPTs makes between a Custom GPT and a saved prompt?",
        "options": [
          {
            "id": "phase_3.q04.o01",
            "text": "A Custom GPT is a folder of saved prompts ordered by task"
          },
          {
            "id": "phase_3.q04.o02",
            "text": "A Custom GPT is a personalized version of ChatGPT built to act and respond a certain way, not just a saved prompt"
          },
          {
            "id": "phase_3.q04.o03",
            "text": "A Custom GPT is a longer saved prompt that is easier to reuse"
          },
          {
            "id": "phase_3.q04.o04",
            "text": "A Custom GPT is a prompt that forbids the model from inventing facts"
          }
        ],
        "correct_option_id": "phase_3.q04.o02"
      },
      {
        "id": "phase_3.q05",
        "prompt": "Which definition of automation does Introduction to Automation Tools give?",
        "options": [
          {
            "id": "phase_3.q05.o01",
            "text": "Using tools to automatically move information or trigger actions between apps, so repetitive tasks are not done manually"
          },
          {
            "id": "phase_3.q05.o02",
            "text": "Using one tool to do a single task faster than before"
          },
          {
            "id": "phase_3.q05.o03",
            "text": "Recording macros inside a spreadsheet to speed up data entry"
          },
          {
            "id": "phase_3.q05.o04",
            "text": "Scheduling posts in advance inside a single social platform"
          }
        ],
        "correct_option_id": "phase_3.q05.o01"
      },
      {
        "id": "phase_3.q06",
        "prompt": "The GPT Tutor prompt in Create a GPT Tutor forces a structure instead of a chatty answer. Which purpose does the lesson give for that structure?",
        "options": [
          {
            "id": "phase_3.q06.o01",
            "text": "The structure makes the tutor refuse questions outside the lesson subject"
          },
          {
            "id": "phase_3.q06.o02",
            "text": "The structure limits each answer to a fixed number of words"
          },
          {
            "id": "phase_3.q06.o03",
            "text": "The structure stops the tutor from doing homework for the learner"
          },
          {
            "id": "phase_3.q06.o04",
            "text": "The structure runs the learner through a roadmap, a lesson, a project and a question instead of an answer that goes nowhere"
          }
        ],
        "correct_option_id": "phase_3.q06.o04"
      },
      {
        "id": "phase_3.q07",
        "prompt": "A VA pastes a YouTube transcript into the blog-post workflow in Write Blog Posts & TikTok Scripts with AI. What does the lesson say to do before asking for the blog post?",
        "options": [
          {
            "id": "phase_3.q07.o01",
            "text": "Send the transcript together with the brand voice so the model can start immediately"
          },
          {
            "id": "phase_3.q07.o02",
            "text": "Chop the transcript into paragraphs and send one paragraph at a time"
          },
          {
            "id": "phase_3.q07.o03",
            "text": "Ask the model to analyze the transcript first and confirm when it is done, so it reads the whole text before writing"
          },
          {
            "id": "phase_3.q07.o04",
            "text": "Ask the model to write the post in one go so the transcript is not read twice"
          }
        ],
        "correct_option_id": "phase_3.q07.o03"
      },
      {
        "id": "phase_3.q08",
        "prompt": "How does What is SEO? define search engine optimization?",
        "options": [
          {
            "id": "phase_3.q08.o01",
            "text": "Making an entire website archive no longer appear in search results"
          },
          {
            "id": "phase_3.q08.o02",
            "text": "Improving a piece of content so it shows up higher in search engine results"
          },
          {
            "id": "phase_3.q08.o03",
            "text": "Creating new content that earns the most traffic in the shortest time"
          },
          {
            "id": "phase_3.q08.o04",
            "text": "Buying rankings by spending more on a search engine's ad platform"
          }
        ],
        "correct_option_id": "phase_3.q08.o02"
      },
      {
        "id": "phase_3.q09",
        "prompt": "A beginner client asks for podcast support. Which framing does Your Role as a Podcast VA use to describe the work a Podcast VA should take on?",
        "options": [
          {
            "id": "phase_3.q09.o01",
            "text": "The host is the voice; the VA runs the system that keeps the show planned, published and promoted on time"
          },
          {
            "id": "phase_3.q09.o02",
            "text": "The VA should aim to be the show's co-host on most episodes"
          },
          {
            "id": "phase_3.q09.o03",
            "text": "The VA must be a technical expert who can set up the entire recording studio"
          },
          {
            "id": "phase_3.q09.o04",
            "text": "The VA's main job is to be available on microphone whenever the host needs a voice"
          }
        ],
        "correct_option_id": "phase_3.q09.o01"
      },
      {
        "id": "phase_3.q10",
        "prompt": "Which task matches the lesson's plain description of Basic podcast editing in Audio & Video Editing Tools?",
        "options": [
          {
            "id": "phase_3.q10.o01",
            "text": "Rewriting the host's answers so the episode sounds more polished"
          },
          {
            "id": "phase_3.q10.o02",
            "text": "Choosing which guest questions should be removed from the recording"
          },
          {
            "id": "phase_3.q10.o03",
            "text": "Writing show notes and scheduling the episode before it is recorded"
          },
          {
            "id": "phase_3.q10.o04",
            "text": "Cutting out awkward pauses, removing background noise, adding an intro and outro, and exporting the final file"
          }
        ],
        "correct_option_id": "phase_3.q10.o04"
      }
    ]
  },
  {
    "exam_key": "phase_4",
    "exam_version": "phase_4-v1",
    "title": "Phase 4 Exam - Landing Your First Client",
    "passing_score": 80,
    "instructions": "This exam covers the whole of Phase 4: choosing a niche, creating an offer, inbound and outbound client-getting, personal branding, portfolio and profile optimisation, pricing, lead magnets, list building, cold outreach, Upwork, and discovery calls. Answer all ten questions in one sitting. You need 8 correct answers (80%) to pass and unlock the final Academy assessment. Each question has exactly one defensible answer drawn from the Phase 4 lessons. If you do not pass, your highest score is kept and you can retake the exam.",
    "review_topics": [
      {
        "label": "Module 1 - Choose Your Niche & Offer",
        "classes": [
          "p4m1c1",
          "p4m1c2",
          "p4m1c3",
          "p4m1c4"
        ]
      },
      {
        "label": "Module 2 - Portfolio & Profile Optimization",
        "classes": [
          "p4m2c1",
          "p4m2c2",
          "p4m2c3",
          "p4m2c4"
        ]
      },
      {
        "label": "Module 3 - Lead Generation & Outreach",
        "classes": [
          "p4m3c1",
          "p4m3c2",
          "p4m3c3",
          "p4m3c4",
          "p4m3c5"
        ]
      },
      {
        "label": "Module 4 - Winning Your First Client",
        "classes": [
          "p4m4c1",
          "p4m4c2",
          "p4m4c3",
          "p4m4c4",
          "p4m4c5"
        ]
      }
    ],
    "questions": [
      {
        "id": "phase_4.q01",
        "prompt": "What does Choose Your Niche give as the prework question to answer in writing before choosing a niche?",
        "options": [
          {
            "id": "phase_4.q01.o01",
            "text": "What is your income goal?"
          },
          {
            "id": "phase_4.q01.o02",
            "text": "What services do you enjoy the most?"
          },
          {
            "id": "phase_4.q01.o03",
            "text": "Which industry has the most job postings?"
          },
          {
            "id": "phase_4.q01.o04",
            "text": "What software are you fastest at?"
          }
        ],
        "correct_option_id": "phase_4.q01.o01"
      },
      {
        "id": "phase_4.q02",
        "prompt": "Which framing does Create Your Offer use for what an offer is?",
        "options": [
          {
            "id": "phase_4.q02.o01",
            "text": "The hourly rate you charge for your service"
          },
          {
            "id": "phase_4.q02.o02",
            "text": "The list of tools you will use while working"
          },
          {
            "id": "phase_4.q02.o03",
            "text": "The number of clients you want to serve"
          },
          {
            "id": "phase_4.q02.o04",
            "text": "The whole package you give in exchange for time, money or attention - not just the service"
          }
        ],
        "correct_option_id": "phase_4.q02.o04"
      },
      {
        "id": "phase_4.q03",
        "prompt": "A VA decides every client-request for a coffee shop is outbound. Which definition of outbound does Inbound vs. Outbound Client Getting give?",
        "options": [
          {
            "id": "phase_4.q03.o01",
            "text": "You are partnered with another VA who shares leads with you"
          },
          {
            "id": "phase_4.q03.o02",
            "text": "The client found you through a referral from an existing customer"
          },
          {
            "id": "phase_4.q03.o03",
            "text": "You are the one making the first move - sending DMs, emails, cover letters or proposals"
          },
          {
            "id": "phase_4.q03.o04",
            "text": "The client comes to you because your content attracted them"
          }
        ],
        "correct_option_id": "phase_4.q03.o03"
      },
      {
        "id": "phase_4.q04",
        "prompt": "A beginner has never done paid client work. How does Create a Strong Portfolio answer the concern that they have nothing to show?",
        "options": [
          {
            "id": "phase_4.q04.o01",
            "text": "A portfolio only matters once you have a personal brand following"
          },
          {
            "id": "phase_4.q04.o02",
            "text": "The bar is being clear, professional and easy to understand - proof you know what you are doing, not polish"
          },
          {
            "id": "phase_4.q04.o03",
            "text": "You need three paid testimonials before you can publish a portfolio"
          },
          {
            "id": "phase_4.q04.o04",
            "text": "You should wait until you have your first client before creating a portfolio"
          }
        ],
        "correct_option_id": "phase_4.q04.o02"
      },
      {
        "id": "phase_4.q05",
        "prompt": "For which pair of reasons does Price Your Services say beginners undercharge?",
        "options": [
          {
            "id": "phase_4.q05.o01",
            "text": "Scarcity mindset and not being used to setting their own prices"
          },
          {
            "id": "phase_4.q05.o02",
            "text": "Market competition and the client's small budget"
          },
          {
            "id": "phase_4.q05.o03",
            "text": "Low demand for VA services and seasonal work"
          },
          {
            "id": "phase_4.q05.o04",
            "text": "Their country's rates and the platform's fee structure"
          }
        ],
        "correct_option_id": "phase_4.q05.o01"
      },
      {
        "id": "phase_4.q06",
        "prompt": "A VA's content gets attention but the attention evaporates when people close the app. Which next step does Create Your Lead Magnet describe?",
        "options": [
          {
            "id": "phase_4.q06.o01",
            "text": "Post more frequently so the same people see the content again"
          },
          {
            "id": "phase_4.q06.o02",
            "text": "Move to a different platform where attention lasts longer"
          },
          {
            "id": "phase_4.q06.o03",
            "text": "Collaborate with another VA to share each other's followers"
          },
          {
            "id": "phase_4.q06.o04",
            "text": "Capture that attention with a lead magnet, so interested people leave their details instead of disappearing"
          }
        ],
        "correct_option_id": "phase_4.q06.o04"
      },
      {
        "id": "phase_4.q07",
        "prompt": "Cold outreach keeps failing for a client. What does Cold Email & DM Strategies identify as the usual reason?",
        "options": [
          {
            "id": "phase_4.q07.o01",
            "text": "The outreach happened on the wrong day of the week"
          },
          {
            "id": "phase_4.q07.o02",
            "text": "The list was not big enough to see results"
          },
          {
            "id": "phase_4.q07.o03",
            "text": "The message was too long, too self-focused, or too easy to ignore"
          },
          {
            "id": "phase_4.q07.o04",
            "text": "The message did not include a discount code"
          }
        ],
        "correct_option_id": "phase_4.q07.o03"
      },
      {
        "id": "phase_4.q08",
        "prompt": "A client sends an interview request out of nowhere. Which framing does Prepare Before the Call give for the difference between an interview and a discovery call?",
        "options": [
          {
            "id": "phase_4.q08.o01",
            "text": "An interview is conducted by the client's team, while a discovery call is conducted by the founder"
          },
          {
            "id": "phase_4.q08.o02",
            "text": "An interview is a more formal evaluation of your skills and experience, while a discovery call explores whether you are a good fit together"
          },
          {
            "id": "phase_4.q08.o03",
            "text": "An interview is for paid clients, while a discovery call is for unpaid trial work"
          },
          {
            "id": "phase_4.q08.o04",
            "text": "An interview is always on camera, while a discovery call is always by phone"
          }
        ],
        "correct_option_id": "phase_4.q08.o02"
      },
      {
        "id": "phase_4.q09",
        "prompt": "What does Create a Discovery Call Script say the goal of the script is?",
        "options": [
          {
            "id": "phase_4.q09.o01",
            "text": "One simple script you can tweak for any client, built once and adjusted per client"
          },
          {
            "id": "phase_4.q09.o02",
            "text": "A complete telemarketing call flow with a branch for every answer"
          },
          {
            "id": "phase_4.q09.o03",
            "text": "A word-for-word transcript to read out loud on the call"
          },
          {
            "id": "phase_4.q09.o04",
            "text": "A script that lists every service you offer in the first minute"
          }
        ],
        "correct_option_id": "phase_4.q09.o01"
      },
      {
        "id": "phase_4.q10",
        "prompt": "What does Build Unshakeable Confidence give as the real obstacle for beginner freelancers?",
        "options": [
          {
            "id": "phase_4.q10.o01",
            "text": "Lack of training in the tools the market expects"
          },
          {
            "id": "phase_4.q10.o02",
            "text": "Not knowing how to write a strong proposal"
          },
          {
            "id": "phase_4.q10.o03",
            "text": "Not having enough case studies to show results"
          },
          {
            "id": "phase_4.q10.o04",
            "text": "Confidence, not skill - a freelancer can have a niche, offer and script and still send nothing"
          }
        ],
        "correct_option_id": "phase_4.q10.o04"
      }
    ]
  },
  {
    "exam_key": "final",
    "exam_version": "final-v1",
    "title": "Final Academy Assessment",
    "passing_score": 80,
    "instructions": "The final assessment samples the whole Academy: professional foundations, client-facing brand and marketing work, AI-powered systems, and winning your first client. Answer all fifteen questions in one sitting. You need 12 correct answers (80%) to pass. Passing this assessment - together with completing every class and passing every phase exam - is part of graduation eligibility. Each question has exactly one defensible answer. If you do not pass, your highest score is kept and you can retake the assessment.",
    "review_topics": [
      {
        "label": "Phase 1 - Freelancing Foundations",
        "classes": [
          "p1m1c1",
          "p1m1c2",
          "p1m2c3",
          "p1m3c1",
          "p1m3c3",
          "p1m3c4",
          "p1m4c1"
        ]
      },
      {
        "label": "Phase 2 - Creative & Digital Marketing Skills",
        "classes": [
          "p2m1c1",
          "p2m3c4",
          "p2m7c5",
          "p2m9c1",
          "p2m10c2"
        ]
      },
      {
        "label": "Phase 3 - AI & Digital Systems",
        "classes": [
          "p3m1c3",
          "p3m2c1",
          "p3m2c4",
          "p3m3c1",
          "p3m4c2"
        ]
      },
      {
        "label": "Phase 4 - Landing Your First Client",
        "classes": [
          "p4m1c4",
          "p4m2c4",
          "p4m3c2",
          "p4m4c1"
        ]
      }
    ],
    "questions": [
      {
        "id": "final.q01",
        "prompt": "A new client sends a long, unclear request. A beginner's first instinct is to reply immediately. Which habit from Employee vs. Freelancer Mindset does the professional use first?",
        "options": [
          {
            "id": "final.q01.o01",
            "text": "Pause and diagnose what is missing or unclear before replying"
          },
          {
            "id": "final.q01.o02",
            "text": "Answer with the work they can already complete"
          },
          {
            "id": "final.q01.o03",
            "text": "Reply immediately to show they are responsive"
          },
          {
            "id": "final.q01.o04",
            "text": "Ask the client to split the request into smaller tasks"
          }
        ],
        "correct_option_id": "final.q01.o01"
      },
      {
        "id": "final.q02",
        "prompt": "A client's inbox has a designer waiting on a final image, a vendor invoice needing approval, and a newsletter digest that may matter later. Which action-based organisation matches Email Management?",
        "options": [
          {
            "id": "final.q02.o01",
            "text": "Needs Approval for the designer, To Reply for the invoice, Archive for the digest"
          },
          {
            "id": "final.q02.o02",
            "text": "To Reply for all three, because they all arrived today"
          },
          {
            "id": "final.q02.o03",
            "text": "Archive the digest, delete the invoice, mark the designer as Waiting"
          },
          {
            "id": "final.q02.o04",
            "text": "Waiting for the designer, Needs Approval for the invoice, Reference for the digest"
          }
        ],
        "correct_option_id": "final.q02.o04"
      },
      {
        "id": "final.q03",
        "prompt": "A client asks you to protect their focus time while still checking their calendar. Which set of Calendar Management habits matches the lesson?",
        "options": [
          {
            "id": "final.q03.o01",
            "text": "Move any conflict into the protected block to keep the calendar tidy"
          },
          {
            "id": "final.q03.o02",
            "text": "Remove buffers so every minute of the day can be booked"
          },
          {
            "id": "final.q03.o03",
            "text": "Use the least access you need, keep protected blocks protected, and add buffers around meetings"
          },
          {
            "id": "final.q03.o04",
            "text": "Share full login details so nothing is ever blocked by permissions"
          }
        ],
        "correct_option_id": "final.q03.o03"
      },
      {
        "id": "final.q04",
        "prompt": "A client marks everything urgent and changes direction every day. Which workload habit from Managing Multiple Clients & Workload protects you?",
        "options": [
          {
            "id": "final.q04.o01",
            "text": "Confirm every deadline by checking the time it was sent"
          },
          {
            "id": "final.q04.o02",
            "text": "Clarify the real deadline before reordering; keep commitments in a project tool outside your head"
          },
          {
            "id": "final.q04.o03",
            "text": "Do the newest request first, because recency is urgency"
          },
          {
            "id": "final.q04.o04",
            "text": "Delay all non-urgent tasks until the client stops changing direction"
          }
        ],
        "correct_option_id": "final.q04.o02"
      },
      {
        "id": "final.q05",
        "prompt": "A client wants to use Meta Business Suite but you were added to the page without admin rights. What does Meta Business Suite Navigation require first?",
        "options": [
          {
            "id": "final.q05.o01",
            "text": "Being an admin or creator of the page before the dashboard will open at all"
          },
          {
            "id": "final.q05.o02",
            "text": "Logging in through your own personal Facebook account"
          },
          {
            "id": "final.q05.o03",
            "text": "Creating a new page and moving the posts across"
          },
          {
            "id": "final.q05.o04",
            "text": "Installing the Meta Business Suite mobile app first"
          }
        ],
        "correct_option_id": "final.q05.o01"
      },
      {
        "id": "final.q06",
        "prompt": "After an ad campaign, a client asks what \"reach\" means. Which explanation matches Read Meta Ads Results and Social Media Analytics & Measurement?",
        "options": [
          {
            "id": "final.q06.o01",
            "text": "The number of times the ad was displayed on screen, including repeats"
          },
          {
            "id": "final.q06.o02",
            "text": "The number of clicks the ad received from users"
          },
          {
            "id": "final.q06.o03",
            "text": "The number of messages the ad generated for the business"
          },
          {
            "id": "final.q06.o04",
            "text": "The number of times individual users saw the ad or post, each user counted once"
          }
        ],
        "correct_option_id": "final.q06.o04"
      },
      {
        "id": "final.q07",
        "prompt": "A client's landing page works, but nothing happens after someone enters an email. Which piece of the funnel from Landing Pages & Lead Magnets is missing?",
        "options": [
          {
            "id": "final.q07.o01",
            "text": "A second landing page for the same offer"
          },
          {
            "id": "final.q07.o02",
            "text": "A social media post advertising the landing page"
          },
          {
            "id": "final.q07.o03",
            "text": "A capture step that stores the email and a nurture step that moves the lead toward buying"
          },
          {
            "id": "final.q07.o04",
            "text": "More colours and animations to make the page feel exciting"
          }
        ],
        "correct_option_id": "final.q07.o03"
      },
      {
        "id": "final.q08",
        "prompt": "Which tool fits a VA building a reusable email campaign where one opt-in subscription starts a sequence of emails?",
        "options": [
          {
            "id": "final.q08.o01",
            "text": "Google Sheets, where the emails can be tracked against a status column"
          },
          {
            "id": "final.q08.o02",
            "text": "Systeme.io, where a new contact in the funnel is automatically subscribed to the pre-set campaign"
          },
          {
            "id": "final.q08.o03",
            "text": "Canva, where the campaign designs can be copied from a template"
          },
          {
            "id": "final.q08.o04",
            "text": "ClickUp, where the email tasks can be scheduled as a sequence of tasks"
          }
        ],
        "correct_option_id": "final.q08.o02"
      },
      {
        "id": "final.q09",
        "prompt": "A VA writes the same client context into every AI prompt. Which fix does Customize Your ChatGPT recommend?",
        "options": [
          {
            "id": "final.q09.o01",
            "text": "Write the standing facts once in the Custom Instructions box so they apply to every later prompt"
          },
          {
            "id": "final.q09.o02",
            "text": "Keep a private document open and paste it in when the model gets confused"
          },
          {
            "id": "final.q09.o03",
            "text": "Create a new saved prompt with the facts for every task type"
          },
          {
            "id": "final.q09.o04",
            "text": "Ask the client to write a summary of their business to paste in"
          }
        ],
        "correct_option_id": "final.q09.o01"
      },
      {
        "id": "final.q10",
        "prompt": "Which definition of automation from Introduction to Automation Tools applies when a new form submission should trigger a contact update elsewhere?",
        "options": [
          {
            "id": "final.q10.o01",
            "text": "Using one app to complete the task faster than doing it by hand"
          },
          {
            "id": "final.q10.o02",
            "text": "Recording a macro so you can replay the same steps in one app"
          },
          {
            "id": "final.q10.o03",
            "text": "Scheduling a repeatable report to be sent on a fixed date"
          },
          {
            "id": "final.q10.o04",
            "text": "Automatically moving information or triggering actions between apps without you in the middle"
          }
        ],
        "correct_option_id": "final.q10.o04"
      },
      {
        "id": "final.q11",
        "prompt": "A VA needs twenty social graphics that share one design but different text. Which workflow does Bulk Create with Canva + ChatGPT describe?",
        "options": [
          {
            "id": "final.q11.o01",
            "text": "Generate twenty one-off prompts in ChatGPT and screenshot each result"
          },
          {
            "id": "final.q11.o02",
            "text": "Create a twenty-page Canva design and slide pages between clients"
          },
          {
            "id": "final.q11.o03",
            "text": "Give Canva a spreadsheet, and it fills the design template once per row to produce each graphic"
          },
          {
            "id": "final.q11.o04",
            "text": "Design the first graphic, then duplicate and edit it twenty times by hand"
          }
        ],
        "correct_option_id": "final.q11.o03"
      },
      {
        "id": "final.q12",
        "prompt": "Which distinction from What is SEO? gives the correct scope of search engine optimization?",
        "options": [
          {
            "id": "final.q12.o01",
            "text": "Removing a website's old pages from search results"
          },
          {
            "id": "final.q12.o02",
            "text": "Improving a piece of content so it ranks higher in search results"
          },
          {
            "id": "final.q12.o03",
            "text": "Creating new content that earns the most traffic in the least time"
          },
          {
            "id": "final.q12.o04",
            "text": "Buying rankings by spending on a search engine's ad platform"
          }
        ],
        "correct_option_id": "final.q12.o02"
      },
      {
        "id": "final.q13",
        "prompt": "A client is paying attention, but they ask who you are, who you serve, and what you charge before they will reply. Which profile element from Optimize Freelancer Profiles is doing that work for you?",
        "options": [
          {
            "id": "final.q13.o01",
            "text": "The profile headline, description and skills that answer those same questions before the client asks"
          },
          {
            "id": "final.q13.o02",
            "text": "The number of completed jobs shown on your profile"
          },
          {
            "id": "final.q13.o03",
            "text": "The reviews left by your previous clients"
          },
          {
            "id": "final.q13.o04",
            "text": "The portfolio link in your profile banner"
          }
        ],
        "correct_option_id": "final.q13.o01"
      },
      {
        "id": "final.q14",
        "prompt": "Which move from Prepare Before the Call matches a discovery call where the client and the VA are exploring fit together?",
        "options": [
          {
            "id": "final.q14.o01",
            "text": "Treat it as a formal interview where you answer the client's questions one by one"
          },
          {
            "id": "final.q14.o02",
            "text": "Treat it as a sales pitch where you present your entire portfolio"
          },
          {
            "id": "final.q14.o03",
            "text": "Treat it as a screening call where you decide whether to take the client"
          },
          {
            "id": "final.q14.o04",
            "text": "Treat it as collaborative - \"Let us see if we are a match\" - and prepare questions for both sides"
          }
        ],
        "correct_option_id": "final.q14.o04"
      },
      {
        "id": "final.q15",
        "prompt": "A beginner VA is about to decline client discovery calls because they are afraid of being judged. Which practice from Build Unshakeable Confidence supports them?",
        "options": [
          {
            "id": "final.q15.o01",
            "text": "Confidence comes from never making a mistake in front of a client"
          },
          {
            "id": "final.q15.o02",
            "text": "Confidence comes from having a bigger portfolio before the first call"
          },
          {
            "id": "final.q15.o03",
            "text": "Confidence is a byproduct of action - take the call while still unsure and build the habit"
          },
          {
            "id": "final.q15.o04",
            "text": "Confidence comes from skill, so postpone calls until every skill is mastered"
          }
        ],
        "correct_option_id": "final.q15.o03"
      }
    ]
  }
]);
