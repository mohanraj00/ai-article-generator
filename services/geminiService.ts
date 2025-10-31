import { GoogleGenAI, Type } from '@google/genai';
import type { Placement, PlacementStrategy } from '../types';

/**
 * Phase 1: Refines a raw transcript into a structured article object using Gemini.
 */
export async function refineTranscript(ai: GoogleGenAI, transcript: string): Promise<{ title: string; content: string }> {
    const prompt = `Act as an expert technical writer and editor. Your task is to transform the following raw transcript into a polished, well-structured technical article.

Follow these instructions precisely:
1.  **Create a Title**: Generate a concise, informative, and engaging title for the article.
2.  **Filter "Chatter"**: Remove all conversational filler (e.g., "um," "uh," "like," "you know"), repeated words, and false starts.
3.  **Preserve Meaning**: Do NOT alter the core meaning or omit any technical details from the original transcript. The goal is to clarify, not to rewrite the substance.
4.  **Structure the Content**: Organize the article logically using Markdown subheadings (## for H2, ### for H3) to create clear sections and subsections.
5.  **Ensure Readability**: Correct spelling, grammar, and punctuation. Ensure the final text flows naturally and is easy to read.

OUTPUT FORMAT:
Your output MUST be a valid JSON object. Do not include any other text or markdown formatting. The structure should be:
{
  "title": "Your Generated Article Title",
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


/**
 * Generates contextually relevant images for an article if none are provided.
 */
export async function generateArticleImages(
    ai: GoogleGenAI,
    refinedTranscript: string,
    numberOfImages: number = 3 // 1 header, 2 body
): Promise<{ filename: string; base64: string; mimeType: string }[]> {
    // 1. First, generate ideas for images based on the transcript.
    const ideasPrompt = `Based on the following article text, suggest ${numberOfImages} distinct and visually compelling image concepts that would enhance the article. One should be a suitable header image (landscape orientation). For each concept, provide a concise, descriptive prompt suitable for an AI image generation model.

Article Text:
---
${refinedTranscript}
---

Output your answer as a valid JSON object with a single key "prompts" which is an array of strings. Example:
{
  "prompts": [
    "A detailed illustration of a computer motherboard with glowing circuits.",
    "A programmer at a sunlit desk, focused on a screen displaying complex code.",
    "An abstract visualization of data flowing through a network."
  ]
}`;

    const ideasResponse = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: ideasPrompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    prompts: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                },
                required: ["prompts"]
            }
        }
    });
    
    const { prompts } = JSON.parse(ideasResponse.text.trim());
    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
        throw new Error("Could not generate image ideas from the transcript.");
    }

    // 2. Generate each image based on the prompts.
    const generatedImages = await Promise.all(
        prompts.slice(0, numberOfImages).map(async (prompt: string, index: number) => {
            console.log(`Generating image for prompt: "${prompt}"`);
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: `A professional, high-quality technical illustration for an article. Style: clean, modern, slightly abstract. ${prompt}`,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: index === 0 ? '16:9' : '4:3', // Header image is landscape
                },
            });

            if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
                throw new Error(`Failed to generate image for prompt: ${prompt}`);
            }

            const base64 = imageResponse.generatedImages[0].image.imageBytes;
            return {
                filename: `generated-image-${index + 1}.jpg`,
                base64: base64,
                mimeType: 'image/jpeg'
            };
        })
    );

    return generatedImages;
}

/**
 * Phase 3: Analyzes images and text to determine optimal layout using a single, comprehensive API call.
 */
export async function planImagePlacements(
    ai: GoogleGenAI, 
    articleMarkdown: string, 
    images: { filename: string; base64: string; mimeType: string }[]
): Promise<PlacementStrategy> {
    if (images.length === 0) {
        throw new Error("No images provided for placement planning.");
    }

    // Get only the actual paragraphs for indexing, ignoring headers and empty lines.
    const paragraphs = articleMarkdown.split('\n').filter(p => {
        const trimmed = p.trim();
        return trimmed !== '' && !trimmed.startsWith('#');
    });
    const imageFilenames = images.map(img => img.filename).join(', ');

    const prompt = `You are an expert visual layout editor for a technical article. Your task is to analyze the provided article markdown and a set of images to create an optimal layout.

You must determine two things:
1.  Which single image is best suited to be the main "header image" for the article.
2.  For all other images, determine the most contextually relevant paragraph to place each image after.

OUTPUT FORMAT:
Your output MUST be a valid JSON object. Do not include any other text or markdown formatting. The structure should be:
{
  "headerImageFilename": "string",
  "placements": [
    {
      "imageFilename": "string",
      "afterParagraphIndex": number
    }
  ]
}
- "headerImageFilename": The filename of the image chosen for the header.
- "placements": An array of objects for all OTHER images.
  - "imageFilename": The filename of the image.
  - "afterParagraphIndex": The ZERO-BASED index of the CONTENT PARAGRAPH (ignoring headers) after which the image should be inserted. The highest possible index is ${paragraphs.length - 1}. Ensure the index is valid.

ARTICLE MARKDOWN:
---
${articleMarkdown}
---

AVAILABLE IMAGES:
---
${imageFilenames}
---

Now, analyze the article and the following images, then provide the complete layout strategy in the specified JSON format.`;

    const contentParts: any[] = [{ text: prompt }];
    images.forEach(image => {
        contentParts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Use a powerful model for complex multi-modal reasoning
            contents: { parts: contentParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        headerImageFilename: { type: Type.STRING, description: "Filename of the header image." },
                        placements: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    imageFilename: { type: Type.STRING },
                                    afterParagraphIndex: { type: Type.INTEGER }
                                },
                                required: ["imageFilename", "afterParagraphIndex"]
                            }
                        }
                    },
                    required: ["headerImageFilename", "placements"]
                }
            }
        });

        const result = JSON.parse(response.text.trim()) as PlacementStrategy;
        const maxIndex = paragraphs.length > 0 ? paragraphs.length - 1 : 0;
        
        // --- Validation and Cleanup Logic ---
        // Ensure the header image exists in the provided images
        if (!images.some(img => img.filename === result.headerImageFilename)) {
            console.warn(`Model returned a non-existent header image: '${result.headerImageFilename}'. Defaulting to the first image.`);
            result.headerImageFilename = images[0].filename;
        }

        // Filter out any placements for the header image itself or non-existent images
        result.placements = result.placements.filter(p => 
            p.imageFilename !== result.headerImageFilename &&
            images.some(img => img.filename === p.imageFilename)
        );

        // Validate and clamp placement indices to prevent out-of-bounds errors
        result.placements.forEach(p => {
            if (p.afterParagraphIndex < 0 || p.afterParagraphIndex > maxIndex) {
                console.warn(`Model returned out-of-bounds index ${p.afterParagraphIndex} for '${p.imageFilename}'. Clamping to ${maxIndex}.`);
                p.afterParagraphIndex = maxIndex;
            }
        });

        // Ensure all non-header images have a placement record
        const placedImages = new Set(result.placements.map(p => p.imageFilename));
        images.forEach(img => {
            if (img.filename !== result.headerImageFilename && !placedImages.has(img.filename)) {
                console.warn(`Model did not provide a placement for '${img.filename}'. Adding it after the first paragraph.`);
                result.placements.push({ imageFilename: img.filename, afterParagraphIndex: 0 });
            }
        });

        return result;

    } catch (e) {
        console.error(`Failed to generate image placement strategy via API:`, e);
        // Fallback strategy if the API call fails catastrophically
        console.log("Executing fallback image placement strategy.");
        return {
            headerImageFilename: images[0].filename,
            placements: images.slice(1).map((image, index) => ({
                imageFilename: image.filename,
                // Distribute remaining images somewhat evenly throughout the article
                afterParagraphIndex: Math.min(
                    paragraphs.length - 1, 
                    Math.floor((index + 1) * (paragraphs.length / (images.length || 1) ))
                )
            }))
        };
    }
}

const ARTICLE_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Article</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --text-color: #333;
            --bg-color: #fff;
            --link-color: #007bff;
            --border-color: #e0e0e0;
            --header-bg: #f8f9fa;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --text-color: #e0e0e0;
                --bg-color: #121212;
                --link-color: #66b2ff;
                --border-color: #444;
                --header-bg: #1e1e1e;
            }
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.7;
            margin: 0;
            padding: 0;
            color: var(--text-color);
            background-color: var(--bg-color);
            text-rendering: optimizeLegibility;
        }
        .container {
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        .article-header {
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
        }
        .header-image {
            width: 100%;
            max-height: 400px;
            object-fit: cover;
            border-radius: 8px;
            margin-bottom: 1.5rem;
        }
        h1, h2, h3 {
             line-height: 1.3;
             margin-top: 2.5rem;
             margin-bottom: 1rem;
             font-weight: 700;
        }
        h1 {
            font-size: 2.5rem;
            margin-top: 0;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.5rem;
        }
        h2 {
            font-size: 1.8rem;
        }
        h3 {
            font-size: 1.4rem;
        }
        p, ul, ol {
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
            color: var(--text-color);
        }
        .body-image {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 2.5rem auto;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        a {
            color: var(--link-color);
            text-decoration: none;
            font-weight: 500;
        }
        a:hover {
            text-decoration: underline;
        }
        @media (max-width: 600px) {
            h1 {
                font-size: 2rem;
            }
            .container {
                margin: 1rem auto;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <article>
            <!-- ARTICLE_CONTENT_HERE -->
        </article>
    </div>
</body>
</html>
`;

/**
 * Phase 4: Injects the generated article content into a professional HTML template.
 * This is a reliable, synchronous operation that avoids a fallible API call.
 */
export function generateHtmlArticle(articleContent: string): string {
    // Replace the placeholder in the template with the actual article content.
    return ARTICLE_TEMPLATE.replace('<!-- ARTICLE_CONTENT_HERE -->', articleContent);
}