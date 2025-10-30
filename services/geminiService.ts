
import { GoogleGenAI, Type } from '@google/genai';
import type { Placement, PlacementStrategy } from '../types';

/**
 * Phase 1: Refines a raw transcript using Gemini.
 */
export async function refineTranscript(ai: GoogleGenAI, transcript: string): Promise<string> {
    const prompt = `Act as an expert transcriptionist and copy editor. Read the following transcript. Correct all spelling mistakes, grammatical errors, and punctuation issues. You must not change the original meaning, rephrase sentences (unless grammatically incoherent), or add any new content. The goal is a clean, professional, and readable version of the original text. The output should be only the refined text.

Transcript:
---
${transcript}
---`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
    });
    
    return response.text.trim();
}

/**
 * Phase 2: Analyzes images and text to determine optimal layout using a single, comprehensive API call.
 * This is more token-efficient than analyzing images individually.
 */
export async function planImagePlacements(
    ai: GoogleGenAI, 
    refinedTranscript: string, 
    images: { filename: string; base64: string; mimeType: string }[]
): Promise<PlacementStrategy> {
    if (images.length === 0) {
        throw new Error("No images provided for placement planning.");
    }

    const paragraphs = refinedTranscript.split('\n').filter(p => p.trim() !== '');
    const imageFilenames = images.map(img => img.filename).join(', ');

    const prompt = `You are an expert visual layout editor for a technical article. Your task is to analyze the provided article transcript and a set of images to create an optimal layout.

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
  - "afterParagraphIndex": The ZERO-BASED index of the paragraph in the provided text AFTER which the image should be inserted. The highest possible index is ${paragraphs.length - 1}. Ensure the index is valid.

ARTICLE TRANSCRIPT:
---
${refinedTranscript}
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
                    paragraphs.length -1, 
                    Math.floor((index + 1) * (paragraphs.length / images.length))
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
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
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
        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
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
            margin: 2rem auto;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        a {
            color: var(--link-color);
            text-decoration: none;
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
 * Phase 3: Injects the generated article content into a professional HTML template.
 * This is a reliable, synchronous operation that avoids a fallible API call.
 */
export function generateHtmlArticle(articleContent: string): string {
    // Replace the placeholder in the template with the actual article content.
    return ARTICLE_TEMPLATE.replace('<!-- ARTICLE_CONTENT_HERE -->', articleContent);
}
