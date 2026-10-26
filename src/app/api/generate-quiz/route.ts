
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is missing. Check your .env.local file." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const text = body.text;

    if (typeof text !== "string" || text.trim().length < 100) {
      return NextResponse.json(
        { error: "Please upload a readable PDF or text file first." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
You are GapFinder AI, an educational assessment assistant.

Create 5 multiple-choice questions using ONLY the study material below.
Do not use outside knowledge.
Each question must have exactly 4 options and one correct answer.

Return JSON only in this format:
{
  "questions": [
    {
      "topic": "Topic name",
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": 0,
      "explanation": "Explain using the material",
      "sourcePage": "1",
      "sourceQuote": "Short exact quote from the material"
    }
  ]
}

Rules:
- answer must be 0, 1, 2, or 3.
- Use an exact short quote from the supplied material.
- Use the page number only if it is identifiable from a Page N marker.
- If the page is unknown, use "Not identified".
- Do not invent supporting quotes.


SOURCE CITATION RULES:
- Use only information supported by the supplied study material.
- sourceQuote must be an exact, short quote copied from the supplied text.
- sourcePage must use an explicitly identified page number; otherwise use null.
- Never invent page numbers or quotations.
- The explanation must be supported by the sourceQuote.
- Return valid JSON only.


STUDY MATERIAL:
${text.slice(0, 25000)}
`;

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 5000,
      },
    });

    const output = result.text;

    if (!output) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed = JSON.parse(output);

    if (
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0
    ) {
      throw new Error("No quiz questions were generated.");
    }

    const questions = parsed.questions
      .filter(
        (q: {
          topic?: unknown;
          question?: unknown;
          options?: unknown;
          answer?: unknown;
          explanation?: unknown;
          sourcePage?: unknown;
          sourceQuote?: unknown;
        }) =>
          typeof q.topic === "string" &&
          typeof q.question === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          q.options.every(
            (option: unknown) => typeof option === "string"
          ) &&
          Number.isInteger(q.answer) &&
          Number(q.answer) >= 0 &&
          Number(q.answer) <= 3 &&
          typeof q.explanation === "string" &&
          typeof q.sourcePage === "string" &&
          typeof q.sourceQuote === "string"
      )
      .map(
  (q: {
    topic: string;
    question: string;
    options: string[];
    answer: number;
    explanation: string;
    sourcePage: string;
    sourceQuote: string;
  }) => {
    const quote = q.sourceQuote.trim();
    const normalizedText = text.replace(/\s+/g, " ").toLowerCase();
    const normalizedQuote = quote.replace(/\s+/g, " ").toLowerCase();
    const quoteVerified =
      normalizedQuote.length > 0 &&
      normalizedText.includes(normalizedQuote);

    return {
      ...q,
      sourceQuote: quoteVerified ? quote : "",
      sourcePage: quoteVerified ? q.sourcePage : "Not verified",
      source: quoteVerified
        ? `Uploaded material · Page ${q.sourcePage}`
        : "Source quote could not be verified",
    };
  }
);
    if (questions.length === 0) {
      throw new Error("Gemini did not return valid quiz questions.");
    }

    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Quiz generation error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate quiz questions.",
      },
      { status: 500 }
    );
  }
}
