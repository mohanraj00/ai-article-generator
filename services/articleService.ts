
import { GoogleGenAI, Type } from '@google/genai';

/**
 * Phase 1: Refines a raw transcript into a structured article object using Gemini.
 */
export async function refineTranscript(ai: GoogleGenAI, transcript: string, suggestedTitle?: string): Promise<{ title: string; content: string }> {
    const titleInstruction = suggestedTitle
        ? `1.  **Refine the Title**: A title has been suggested. Use it as a strong basis. Your tasks are to:
        - Refine it for clarity, conciseness, and impact.
        - Correct any spelling or grammatical errors.
        - If the suggestion is good, use a polished version of it.
        - If the suggestion is completely irrelevant to the transcript content, you MUST ignore it and generate a new, more appropriate title from scratch.`
        : `1.  **Create a Title**: Generate a concise, informative, and engaging title for the article.`;
    
    const prompt = `Act as an expert technical writer and editor. Your task is to transform the following raw transcript into a polished, well-structured technical article.
${suggestedTitle ? `\nSUGGESTED TITLE:\n---\n${suggestedTitle}\n---\n` : ''}
Follow these instructions precisely:
${titleInstruction}
2.  **Filter "Chatter"**: Remove all conversational filler (e.g., "um," "uh," "like," "you know"), repeated words, and false starts.
3.  **Preserve Meaning**: Do NOT alter the core meaning or omit any technical details from the original transcript. The goal is to clarify, not to rewrite the substance.
4.  **Structure the Content**: Organize the article logically using Markdown subheadings (## for H2, ### for H3) to create clear sections and subsections.
5.  **Ensure Readability**: Correct spelling, grammar, and punctuation. Ensure the final text flows naturally and is easy to read.

OUTPUT FORMAT:
Your output MUST be a valid JSON object. Do not include any other text or markdown formatting. The structure should be:
{
  "title": "Your Generated or Refined Article Title",
  "content": "The full article content, formatted in Markdown with subheadings..."
}

RAW TRANSCRIPT:
---
${transcript}
---`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING }
                },
                required: ["title", "content"]
            }
        }
    });
    
    const result = JSON.parse(response.text.trim());
    return {
        title: result.title || "Untitled Article",
        content: result.content || ""
    };
}

/**
 * Phase 2: Verifies and corrects the generated article against the original transcript.
 */
export async function validateAndCorrectArticle(
    ai: GoogleGenAI,
    originalTranscript: string,
    generatedArticle: { title: string; content: string }
): Promise<{ title: string; content: string }> {
    const prompt = `You are a meticulous fact-checker and editor. Your task is to verify a generated technical article against its original source transcript.

You must identify and correct any of the following issues in the "Generated Article":
1.  **Inaccuracies**: Any statement that contradicts the "Original Transcript".
2.  **Hallucinations**: Any technical detail or information added to the article that is NOT present in the original transcript.
3.  **Omissions**: Any critical technical detail or step from the transcript that was left out of the article.

INSTRUCTIONS:
- Read the "Original Transcript" carefully to understand the source of truth.
- Compare the "Generated Article" against the transcript, line by line if necessary.
- Correct any errors you find directly.
- Ensure the final, corrected article remains well-structured and retains its title and Markdown formatting.
- If no errors are found, return the original generated article unchanged.

OUTPUT FORMAT:
Your output MUST be a valid JSON object, identical in structure to the input.
{
  "title": "Corrected or Original Article Title",
  "content": "The full, corrected article content in Markdown..."
}

ORIGINAL TRANSCRIPT:
---
${originalTranscript}
---

GENERATED ARTICLE TO VERIFY:
---
Title: ${generatedArticle.title}

Content:
${generatedArticle.content}
---
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING }
                },
                required: ["title", "content"]
            }
        }
    });

    const result = JSON.parse(response.text.trim());
    return {
        title: result.title || generatedArticle.title, // Fallback to original title
        content: result.content || generatedArticle.content // Fallback to original content
    };
}
