
"use client";
import { createClient } from "@/app/lib/supabase-auth";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Topic = {
  name: string;
  score: number;
};

type Question = {
  topic: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  source?: string;
};

const initialTopics: Topic[] = [
  { name: "DBMS Normalization", score: 35 },
  { name: "Operating Systems", score: 58 },
  { name: "Computer Networks", score: 76 },
  { name: "SQL Queries", score: 90 },
];

const demoQuestions: Question[] = [
  {
    topic: "DBMS Normalization",
    question: "Which normal form removes partial functional dependencies?",
    options: ["1NF", "2NF", "3NF", "BCNF"],
    answer: 1,
    explanation:
      "Second Normal Form removes partial dependencies on a candidate key.",
    source: "Built-in demo question",
  },
  {
    topic: "Operating Systems",
    question: "Which scheduling algorithm can cause starvation?",
    options: ["FCFS", "Round Robin", "Priority Scheduling", "FIFO"],
    answer: 2,
    explanation:
      "Low-priority processes may wait indefinitely when higher-priority processes keep arriving.",
    source: "Built-in demo question",
  },
  {
    topic: "Computer Networks",
    question: "Which protocol provides reliable, connection-oriented delivery?",
    options: ["IP", "UDP", "TCP", "ARP"],
    answer: 2,
    explanation:
      "TCP provides reliable and ordered delivery using acknowledgements and retransmissions.",
    source: "Built-in demo question",
  },
  {
    topic: "SQL Queries",
    question: "Which SQL clause filters grouped results?",
    options: ["WHERE", "ORDER BY", "HAVING", "SELECT"],
    answer: 2,
    explanation: "HAVING filters groups created by GROUP BY.",
    source: "Built-in demo question",
  },
];


function detectTopics(text: string): string[] {
  const normalized = text
    .replace(/\r/g, "\n")
    .replace(/Page\s+\d+/gi, "\n")
    .replace(/[•●▪]/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /\b\d+(?:\.\d+){0,4}\.?\s+[A-Z][A-Za-z&(),/-]*(?:\s+[A-Za-z&(),/-]+){0,7}/g,
    /\b(?:Introduction|Overview|Definition|Properties|Applications|Examples|Conclusion|Decidability|Regular Expressions|Finite Automata|Context Free Grammars|Turing Machines|Normalization|Operating Systems|Computer Networks)\b/gi,
  ];

  const found: string[] = [];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const topic = match[0]
        .replace(/^\d+(?:\.\d+){0,4}\.?\s*/, "")
        .trim()
        .replace(/[.,;:]+$/, "");

      if (
        topic.length >= 4 &&
        topic.length <= 90 &&
        !found.some(
          (existing) => existing.toLowerCase() === topic.toLowerCase()
        )
      ) {
        found.push(topic);
      }
    }
  }

  return found.slice(0, 40);
}

export default function Home() {
  const supabase = createClient();
  const router = useRouter();

useEffect(() => {
  let mounted = true;

  async function checkAuth() {
    const { data, error } = await supabase.auth.getUser();

    if (mounted && (error || !data.user)) {
      router.replace("/login");
    }
  }

  checkAuth();

  return () => {
    mounted = false;
  };
}, [router]);
  const [active, setActive] = useState("Overview");
  const [topics, setTopics] = useState(initialTopics);

  const [materialName, setMaterialName] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [detectedTopics, setDetectedTopics] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [quizSource, setQuizSource] = useState("");

  const [questions, setQuestions] = useState<Question[]>(demoQuestions);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [studyHours, setStudyHours] = useState(2);
  const [examDays, setExamDays] = useState(7);

  const question = questions[questionIndex];
  const correctCount = answers.reduce(
    (total, answer, index) =>
      total + (answer === questions[index]?.answer ? 1 : 0),
    0
  );

  const average = Math.round(
    topics.reduce((sum, topic) => sum + topic.score, 0) /
      Math.max(topics.length, 1)
  );

  const weakCount = topics.filter((topic) => topic.score < 50).length;

  
async function generateAiQuiz() {
  if (!extractedText) {
    setAiError("Please upload a study document first.");
    return;
  }

  setIsGenerating(true);
  setAiError("");

  try {
    const response = await fetch("/api/generate-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: extractedText,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to generate quiz.");
    }

    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error("No questions were generated.");
    }

    setQuestions(data.questions);
    setQuestionIndex(0);
    setSelected(null);
    setAnswers([]);
    setSubmitted(false);
    setCompleted(false);
    setQuizSource(materialName);
    setActive("Diagnostic Quiz");
  } catch (error) {
    setAiError(
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again."
    );
  } finally {
    setIsGenerating(false);
  }
}

  async function handleMaterialUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMaterialName(file.name);
    setExtractedText("");
    setDetectedTopics([]);
    setUploadError("");
    setIsExtracting(true);

    try {
      let text = "";

      if (file.name.toLowerCase().endsWith(".txt")) {
        text = await file.text();
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import(
          "pdfjs-dist/legacy/build/pdf.mjs"
        );

        pdfjs.GlobalWorkerOptions.workerSrc =
          "/pdf.worker.min.mjs";

        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
        }).promise;

        const pages: string[] = [];

        for (
          let pageNumber = 1;
          pageNumber <= pdf.numPages;
          pageNumber++
        ) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();

          const pageText = content.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");

          pages.push(`Page ${pageNumber}\n${pageText}`);
        }

        text = pages.join("\n\n");
      } else {
        throw new Error("Please select a PDF or TXT file.");
      }

      if (!text.trim()) {
        throw new Error(
          "No text was found. This PDF may be scanned or image-only."
        );
      }

      setExtractedText(text);
      setDetectedTopics(detectTopics(text));
    } catch (error) {
      console.error("Document extraction failed:", error);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Unable to read this document."
      );
    } finally {
      setIsExtracting(false);
    }
  }

  function startQuiz() {
    setQuestions(demoQuestions);
    setQuestionIndex(0);
    setSelected(null);
    setAnswers([]);
    setSubmitted(false);
    setCompleted(false);
    setActive("Diagnostic Quiz");
  }

  function checkAnswer() {
    if (selected === null) return;

    const updated = [...answers];
    updated[questionIndex] = selected;
    setAnswers(updated);
    setSubmitted(true);
  }

  
function nextQuestion() {
  if (questionIndex < questions.length - 1) {
    setQuestionIndex(questionIndex + 1);
    setSelected(null);
    setSubmitted(false);
    return;
  }

  
const topicNames = Array.from(
  new Set(questions.map((question) => question.topic))
);

const updatedTopics = topicNames.map((topicName) => {
  const topicQuestions = questions
    .map((question, index) => ({ question, index }))
    .filter((item) => item.question.topic === topicName);

  const answeredQuestions = topicQuestions.filter(
    (item) => answers[item.index] !== undefined
  );

  const correctAnswers = answeredQuestions.filter(
    (item) => answers[item.index] === item.question.answer
  ).length;

  const score =
    answeredQuestions.length > 0
      ? Math.round((correctAnswers / answeredQuestions.length) * 100)
      : 0;

  return {
    name: topicName,
    score,
  };
});

  setTopics(updatedTopics);
  

void (async () => {
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError || !authData.user) {
    console.error("Cannot save quiz: user is not signed in.");
    return;
  }

  const { error } = await supabase.from("quiz_attempts").insert({
    user_id: authData.user.id,
    score: questions.filter(
      (question, index) => answers[index] === question.answer
    ).length,
    total_questions: questions.length,
    answers: answers.map((answer, index) => ({
      question: questions[index]?.question,
      selectedAnswer: answer,
      correctAnswer: questions[index]?.answer,
      topic: questions[index]?.topic,
    })),
  });

  if (error) {
    console.error("Could not save quiz result:", error.message);
  } else {
    console.log("Quiz result saved successfully");
  }
})();


  setCompleted(true);
}


  const navItems = [
    { name: "Overview", icon: "⌂" },
    { name: "My Materials", icon: "▤" },
    { name: "Diagnostic Quiz", icon: "✓" },
    { name: "Gap Report", icon: "◈" },
    { name: "Revision Plan", icon: "▦" },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 md:flex">
      <aside className="w-full shrink-0 border-r border-slate-200 bg-white p-5 md:min-h-screen md:w-64">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white">
            G
          </div>
          <div>
            <h1 className="text-lg font-bold">GapFinder AI</h1>
            <p className="text-xs text-slate-500">
              Study smarter, not longer
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Workspace
        </p>

        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => setActive(item.name)}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${
                active === item.name
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span>{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="mt-8 hidden rounded-2xl bg-indigo-50 p-4 md:block">
          <div className="mb-2 text-2xl">✦</div>
          <p className="font-semibold text-indigo-950">
            Small steps add up
          </p>
          <p className="mt-1 text-sm text-indigo-800">
            Find a gap. Fix a gap. Grow your confidence.
          </p>
        </div>

        <p className="mt-8 text-xs text-slate-400">
          LEARNING WORKSPACE
        </p>
      </aside>

      <section className="min-w-0 flex-1 p-5 md:p-9">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-slate-500">
              Your learning workspace
            </p>
            <h2 className="text-2xl font-bold md:text-3xl">
              {active === "Overview"
                ? "Discover what you don't know."
                : active}
            </h2>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-sm font-semibold">Demo Student</p>
            <p className="text-xs text-slate-500">Exam preparation</p>
          </div>
        </header>

        {active === "Overview" && (
          <>
            <div className="mb-7 rounded-3xl bg-gradient-to-r from-indigo-700 to-violet-600 p-6 text-white md:p-8">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs">
                PERSONAL STUDY INTELLIGENCE
              </span>
              <h3 className="mt-5 text-2xl font-bold md:text-3xl">
                Discover your knowledge gaps.
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">
                Upload study material, review your learning topics,
                assess your knowledge, and prioritize revision.
              </p>
              <button
                onClick={startQuiz}
                className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700"
              >
                Start diagnostic quiz →
              </button>
              <button
                onClick={() => setActive("My Materials")}
                className="ml-3 mt-3 rounded-xl border border-white/50 px-5 py-3 text-sm font-semibold text-white"
              >
                Upload material
              </button>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Topics tracked", value: topics.length },
                { label: "Average mastery", value: `${average}%` },
                { label: "Topics to improve", value: weakCount },
                { label: "Questions answered", value: answers.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="font-bold">Topic mastery</h3>
                <p className="mb-6 mt-1 text-sm text-slate-500">
                  Illustrative starting scores
                </p>
                <div className="space-y-6">
                  {topics.map((topic) => (
                    <div key={topic.name}>
                      <div className="mb-2 flex justify-between text-sm">
                        <span>{topic.name}</span>
                        <span className="font-semibold">
                          {topic.score}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${
                            topic.score < 50
                              ? "bg-rose-500"
                              : topic.score < 75
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${topic.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="font-bold">Recommended next steps</h3>
                <div className="mt-5 space-y-4 text-sm">
                  <p>1. Upload your own study material.</p>
                  <p>2. Review detected topics and identify gaps.</p>
                  <p>3. Complete practice questions and revise weak areas.</p>
                </div>
                <button
                  onClick={() => setActive("Revision Plan")}
                  className="mt-6 w-full rounded-xl border border-slate-200 py-3 font-semibold hover:bg-slate-50"
                >
                  Open revision plan →
                </button>
              </div>
            </div>
          </>
        )}

        {active === "My Materials" && (
          <div className="max-w-4xl space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold">
                Upload your study material
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Select a text-based PDF or TXT file. Its text will be
                extracted in your browser.
              </p>

              <label className="mt-5 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-8 text-center">
                <span className="text-3xl">↑</span>
                <span className="mt-3 font-semibold">Choose a file</span>
                <span className="mt-1 text-xs text-slate-500">
                  PDF or TXT
                </span>
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="mt-4 max-w-full text-sm"
                  onChange={handleMaterialUpload}
                />
              </label>

              {isExtracting && (
                <p className="mt-4 text-sm text-indigo-600">
                  Extracting document text...
                </p>
              )}

              {uploadError && (
                <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
                  {uploadError}
                </p>
              )}

              {extractedText && !isExtracting && (
                <div className="mt-5 rounded-2xl bg-emerald-50 p-4">
                  <p className="font-semibold text-slate-800">
                    {materialName}
                  </p>
                  <p className="mt-2 text-sm text-emerald-700">
                    Text extracted successfully!
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Characters extracted: {extractedText.length}
                  </p>

                  <details className="mt-4">
                    <summary className="cursor-pointer font-semibold text-indigo-700">
                      View extracted text
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-white p-3 text-xs leading-5">
                      {extractedText.slice(0, 20000)}
                    </pre>
                  </details>

                  <div className="mt-5">
                    <h3 className="font-bold text-slate-800">
                      Detected topics
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Automatically detected from heading-like lines.
                      Please review for accuracy.
                    </p>

                    {detectedTopics.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {detectedTopics.map((topic, index) => (
                          <li
                            key={`${topic}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
                          >
                            {topic}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        No clear headings detected. The document text
                        was extracted, but headings may need manual review.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
<button
  onClick={generateAiQuiz}
  disabled={isGenerating}
  className="mt-6 w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
>
  {isGenerating
    ? "Generating questions with Gemini..."
    : "Generate AI Diagnostic Quiz →"}
</button>

{aiError && (
  <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
    {aiError}
  </p>
)}


            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Processing status</h3>
              <p className="mt-2 text-sm text-slate-600">
                PDF/TXT text extraction is implemented. Uploaded files
                and extracted content are currently held in browser
                memory and are not saved permanently.
              </p>
            </div>
          </div>
        )}

        {active === "Diagnostic Quiz" && (
          <div className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
            {!completed ? (
              <>
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    DIAGNOSTIC ASSESSMENT
                  </span>
                  <span className="text-sm text-slate-500">
                    Question {questionIndex + 1} of {questions.length}
                  </span>
                </div>

                <p className="mt-6 text-sm font-semibold text-indigo-600">
                  {question.topic}
                </p>
                <h3 className="mt-3 text-xl font-bold leading-8">
                  {question.question}
                </h3>

                <div className="mt-6 space-y-3">
                  {question.options.map((option, index) => (
                    <button
                      key={option}
                      disabled={submitted}
                      onClick={() => setSelected(index)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm ${
                        submitted && index === question.answer
                          ? "border-emerald-400 bg-emerald-50"
                          : submitted && index === selected
                            ? "border-rose-300 bg-rose-50"
                            : selected === index
                              ? "border-indigo-500 bg-indigo-50"
                              : "border-slate-200 hover:border-indigo-300"
                      }`}
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold">
                        {String.fromCharCode(65 + index)}
                      </span>
                      {option}
                    </button>
                  ))}
                </div>

                {submitted && (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6">
                    <p className="font-semibold">
                      {selected === question.answer
                        ? "Correct!"
                        : "Review this concept"}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {question.explanation}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Source: {question.source ?? "Demo"}
                    </p>
                  </div>
                )}

                <div className="mt-7 flex justify-end">
                  {!submitted ? (
                    <button
                      onClick={checkAnswer}
                      disabled={selected === null}
                      className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Check answer →
                    </button>
                  ) : (
                    <button
                      onClick={nextQuestion}
                      className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white"
                    >
                      {questionIndex === questions.length - 1
                        ? "Generate gap report →"
                        : "Next question →"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="text-3xl text-emerald-600">✓</div>
                <h3 className="mt-5 text-2xl font-bold">
                  Assessment complete!
                </h3>
                <p className="mt-2 text-slate-500">
                  You answered {correctCount} out of {questions.length} correctly.
                </p>
                <button
                  onClick={() => setActive("Gap Report")}
                  className="mt-6 rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white"
                >
                  View gap report
                </button>
              </div>
            )}
          </div>
        )}

        {active === "Gap Report" && (
          <div className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-bold">Knowledge gap report</h3>
            <p className="mt-2 text-sm text-slate-500">
               Topic scores are calculated from your answers to the diagnostic quiz
               generated from your uploaded study material. Review weak topics first
  a            and use the revision plan to guide your next study session.
            </p>

            <div className="mt-6 space-y-5">
              {topics.map((topic) => {
                const status =
                  topic.score < 50
                    ? "Weak"
                    : topic.score < 75
                      ? "Developing"
                      : "Strong";

                return (
                  <div
                    key={topic.name}
                    className="rounded-xl border border-slate-100 p-4"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <h4 className="font-semibold">{topic.name}</h4>
                      <span className="text-sm font-semibold">
                        {status} · {topic.score}%
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {topic.score < 50
                        ? "High priority: review the fundamentals and practice more questions."
                        : topic.score < 75
                          ? "Medium priority: revisit key concepts and improve consistency."
                          : "Maintain this topic with periodic revision."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {active === "Revision Plan" && (
          <div className="max-w-4xl space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold">
                Personalize your revision plan
              </h3>

              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Study hours per day: {studyHours}
                  <input
                    type="range"
                    min="1"
                    max="8"
                    value={studyHours}
                    onChange={(event) =>
                      setStudyHours(Number(event.target.value))
                    }
                    className="mt-4 block w-full accent-indigo-600"
                  />
                </label>

                <label className="text-sm font-medium">
                  Days until exam: {examDays}
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={examDays}
                    onChange={(event) =>
                      setExamDays(Number(event.target.value))
                    }
                    className="mt-4 block w-full accent-indigo-600"
                  />
                </label>
              </div>

              <div className="mt-5 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900">
                Available study time:{" "}
                <strong>{studyHours * examDays} hours</strong>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Prioritized revision schedule</h3>
              <div className="mt-5 space-y-4">
                {[...topics]
                  .sort((a, b) => a.score - b.score)
                  .map((topic, index) => (
                    <div
                      key={topic.name}
                      className="flex gap-4 rounded-xl border border-slate-100 p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-600">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-semibold">{topic.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          Mastery: {topic.score}% ·{" "}
                          {index === 0
                            ? "Highest priority"
                            : "Revision and practice"}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        <footer className="mt-10 border-t border-slate-200 py-5 text-xs text-slate-400">
          GapFinder AI · Prototype · AI retrieval, generated questions,
          authentication, and persistent storage are not yet connected.
        </footer>
      </section>
    </main>
  );
}
