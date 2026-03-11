import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Groq } from 'groq-sdk';

const MODE_PROMPTS = {
  study: `You are an expert educational content summarizer. Your task is to create study-friendly summaries that help students learn and memorize key information.

Format your summary as follows:

## 📚 Core Concepts
- List the main concepts and ideas in bullet points
- Keep explanations clear and concise

## 📖 Key Terminologies
- Define important terms and vocabulary
- Use simple language for complex concepts

## 🔢 Formulas & Theories (if applicable)
- List any formulas, equations, or theories
- Explain them in simple terms

## 💡 Key Takeaways
- What are the most important points to remember?
- Focus on exam-worthy information

## ❓ Review Questions (Q&A Flashcards)
Create 3-5 questions with answers for self-testing:
- Q1: [Question]
  A1: [Answer]

Keep the summary educational and easy to memorize. Use emojis for visual appeal.`,

  report: `You are a professional business report analyst. Your task is to create structured summaries that highlight key findings, metrics, and recommendations.

Format your summary as follows:

## 📋 Executive Summary
- Brief overview of the report's purpose and main findings (2-3 sentences)

## 🎯 Objectives
- What were the goals of this report?
- What questions was it trying to answer?

## 📊 Methodology
- How was the research conducted?
- What data sources were used?

## 🔑 Key Findings
- List the main discoveries and results
- Include specific numbers, percentages, and metrics when available

## 📈 Important Metrics
Highlight key statistics:
- **Metric 1**: Value
- **Metric 2**: Value

## ✅ Recommendations
- What actions are suggested based on the findings?
- Any next steps proposed?

## 🎯 Conclusion
- Final summary statement

Use professional language. Emphasize data and metrics with bold formatting.`,

  general: `You are an expert document analyst. Your task is to create comprehensive summaries using the 5W1H framework (Who, What, Where, When, Why, How).

Format your summary as follows:

## 📄 Executive Overview
- A concise summary of what this document is about (2-3 sentences)

## 🔍 5W1H Analysis

### Who
- Who are the main people, organizations, or stakeholders involved?

### What
- What is the main topic, event, or subject matter?

### Where
- Where does this take place or apply?

### When
- When did/will this happen? What is the timeline?

### Why
- Why is this important? What are the reasons or motivations?

### How
- How is this being done? What are the methods or processes?

## 📌 Key Points
- Bullet list of the most important information
- Easy to scan and understand

## ✅ Action Items (if applicable)
If this is a meeting document or contains tasks:
- [ ] Task 1 - Assigned to: [Person] - Due: [Date]
- [ ] Task 2 - Assigned to: [Person] - Due: [Date]

## 📝 Conclusion
- Final thoughts and summary

Keep the summary clear, organized, and easy to navigate.`,
};

const LENGTH_CONFIG = {
  short: {
    maxWords: 150,
    instruction: 'Keep the summary very concise. Focus only on the absolute most important points. Use short bullet points.',
  },
  medium: {
    maxWords: 300,
    instruction: 'Create a balanced summary with enough detail to be useful but still concise. Cover main points thoroughly.',
  },
  detailed: {
    maxWords: 500,
    instruction: 'Create a comprehensive summary with full details. Include all important information, examples, and nuances.',
  },
};

// POST - Generate AI summary for a document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const mode = (body.mode || 'general') as keyof typeof MODE_PROMPTS;
    const length = (body.length || 'medium') as keyof typeof LENGTH_CONFIG;

    // Get the document
    const document = await db.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (!document.content) {
      return NextResponse.json(
        { error: 'Document has no content to summarize' },
        { status: 400 }
      );
    }

    // Update status to processing
    await db.document.update({
      where: { id },
      data: { status: 'processing' },
    });

    try {
      // Initialize Groq SDK
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      // Truncate content if too long (to avoid token limits)
      const maxLength = 6000;
      const contentToSummarize =
        document.content.length > maxLength
          ? document.content.substring(0, maxLength) +
          '\n\n[Content truncated due to length...]'
          : document.content;

      const lengthConfig = LENGTH_CONFIG[length];
      const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.general;

      // Create the summary using LLM
      const completion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `${modePrompt}

${lengthConfig.instruction}

Target length: approximately ${lengthConfig.maxWords} words.

Respond in Thai language unless the document is in English, then respond in English.`,
          },
          {
            role: 'user',
            content: `Please summarize the following document:

---
Document: ${document.filename}
Type: ${document.fileType.toUpperCase()}
---

${contentToSummarize}`,
          },
        ],
      });

      const summary = completion.choices[0]?.message?.content;

      if (!summary) {
        throw new Error('Failed to generate summary');
      }

      // Update document with summary
      const updatedDocument = await db.document.update({
        where: { id },
        data: {
          summary,
          summaryMode: mode,
          summaryLength: length,
          status: 'summarized',
        },
      });

      return NextResponse.json(updatedDocument);
    } catch (aiError) {
      // Update status to error
      await db.document.update({
        where: { id },
        data: { status: 'error' },
      });
      throw aiError;
    }
  } catch (error) {
    console.error('Summarization error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate summary',
      },
      { status: 500 }
    );
  }
}
