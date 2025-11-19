
import { GoogleGenAI, Type } from '@google/genai';
import type { PlacementStrategy } from '../types';

/**
 * A deterministic fallback function to create a sensible layout when the AI fails.
 */
function getProgrammaticPlacement(
    images: { filename: string }[],
    contentBlocks: string[],
    headerImageFilenameOverride?: string
): PlacementStrategy {
    console.log("Executing programmatic image placement strategy.");
    if (images.length === 0) {
        return { headerImageFilename: '', placements: [] };
    }

    const headerImageFilename = headerImageFilenameOverride || images[0].filename;
    const bodyImages = images.filter(img => img.filename !== headerImageFilename);
    
    if (bodyImages.length === 0) {
        return { headerImageFilename, placements: [] };
    }

    const totalBlocks = contentBlocks.length;
    const maxIndex = totalBlocks > 0 ? totalBlocks - 1 : 0;
    
    // Divide the article into N+1 sections for N body images
    const step = totalBlocks / (bodyImages.length + 1);

    const placements = bodyImages.map((image, index) => {
        // Place image at the end of the (index + 1)-th section
        const idealIndex = Math.round((index + 1) * step) -1;
        return {
            imageFilename: image.filename,
            afterParagraphIndex: Math.max(0, Math.min(maxIndex, idealIndex))
        };
    });
    
    return { headerImageFilename, placements };
}

/**
 * Uses an AI to rewrite an image generation prompt that previously failed.
 * @param ai The GoogleGenAI instance.
 * @param originalPrompt The initial creative concept.
 * @param lastAttemptedPrompt The specific prompt that failed.
 * @param failureReason The reason the last attempt failed.
 * @returns A promise resolving to a new, improved prompt string.
 */
async function getImprovedPrompt(
    ai: GoogleGenAI,
    originalPrompt: string,
    lastAttemptedPrompt: string,
    failureReason: string
): Promise<string> {
    const prompt = `You are an AI prompt engineer for an image generation model. An image generated from a prompt has failed a quality check. Your task is to rewrite the prompt to address the specific failure.

Original creative concept:
"${originalPrompt}"

The last prompt that failed:
"${lastAttemptedPrompt}"

Reason for Failure:
"${failureReason}"

Instructions:
- Analyze why the last prompt failed based on the reason provided.
- Rewrite the prompt to be more specific and clear, directly addressing the failure.
- The new prompt must still adhere to the original creative concept.
- **Do not simply add negative constraints** (e.g., "no text"). Instead, rephrase the prompt to positively describe the desired outcome (e.g., "A clean, symbolic illustration focusing on the main subject.").
- Output ONLY the new, improved prompt as a single string. Do not include any other text, labels, or quotation marks.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
    });

    return response.text.trim();
}


/**
 * Generates a single image and verifies it for quality, retrying if necessary. On failure, it generates an improved prompt for the next attempt.
 * @param ai The GoogleGenAI instance.
 * @param originalPrompt The initial prompt for the image.
 * @param config Configuration for the image generation API call.
 * @param maxAttempts The maximum number of times to try generating a valid image.
 * @returns A promise that resolves to the base64 data and MIME type of a valid image.
 */
async function generateAndVerifyImage(
    ai: GoogleGenAI,
    originalPrompt: string,
    config: {
        numberOfImages: number;
        outputMimeType: string;
        aspectRatio: string;
    },
    maxAttempts: number = 3
): Promise<{ base64: string; mimeType: string }> {
    let attempts = 0;
    let currentPrompt = originalPrompt;

    while (attempts < maxAttempts) {
        attempts++;
        console.log(`Generating image, attempt ${attempts}/${maxAttempts}. Using prompt: "${currentPrompt}"`);

        try {
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: currentPrompt,
                config,
            });
    
            if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
                console.warn(`Image generation returned no images on attempt ${attempts}.`);
                if (attempts >= maxAttempts) {
                    throw new Error(`Failed to generate image after ${maxAttempts} attempts for prompt: ${originalPrompt}`);
                }
                const failureReason = 'The model failed to generate an image, possibly due to a policy violation or unclear instruction in the prompt.';
                currentPrompt = await getImprovedPrompt(ai, originalPrompt, currentPrompt, failureReason);
                continue;
            }
    
            const imageData = {
                base64: imageResponse.generatedImages[0].image.imageBytes,
                mimeType: config.outputMimeType || 'image/png'
            };
    
            // Verification step
            const verificationPrompt = `You are an AI image quality assurance agent. Analyze the provided image against the original prompt used to generate it. Your task is to check for two specific issues:
1.  **Garbled Text**: Does the image contain any crowded, nonsensical, or garbled text that is not a clear and intentional part of the design?
2.  **Prompt Relevance**: Does the image accurately and clearly reflect the main subject and intent of the original prompt?

Original Prompt: "${originalPrompt}"

Respond ONLY with a valid JSON object with two boolean keys: "hasGarbledText" and "isRelevant".`;
            
            const verificationResponse = await ai.models.generateContent({
                model: 'gemini-3-pro-preview', // A vision-capable model
                contents: {
                    parts: [
                        { text: verificationPrompt },
                        { inlineData: { data: imageData.base64, mimeType: imageData.mimeType } }
                    ]
                },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            hasGarbledText: { type: Type.BOOLEAN },
                            isRelevant: { type: Type.BOOLEAN }
                        },
                        required: ['hasGarbledText', 'isRelevant']
                    }
                }
            });
    
            const verificationResult = JSON.parse(verificationResponse.text.trim());
            const { hasGarbledText, isRelevant } = verificationResult;

            if (!hasGarbledText && isRelevant) {
                console.log(`Image verified successfully for prompt: "${currentPrompt}"`);
                return imageData; // Image is good, return it
            }

            if (attempts >= maxAttempts) {
                break; // Out of attempts
            }

            // Construct failure reason and generate a better prompt for the next try
            const failureReasons = [];
            if (hasGarbledText) {
                failureReasons.push('it contained garbled, nonsensical text');
            }
            if (!isRelevant) {
                failureReasons.push("it was not visually relevant to the prompt's subject matter");
            }
            const fullReason = failureReasons.join(' and ');
            
            console.warn(`Image verification failed for prompt: "${currentPrompt}" (attempt ${attempts}/${maxAttempts}). Reason: ${fullReason}. Generating a new prompt...`);
            currentPrompt = await getImprovedPrompt(ai, originalPrompt, currentPrompt, fullReason);
        
        } catch (error) {
            console.error(`An error occurred during image generation/verification on attempt ${attempts}:`, error);
            if (attempts >= maxAttempts) {
                throw error;
            }
            // If an API error occurs, assume it might be prompt-related and try to fix it.
            const failureReason = `The API returned an error: ${error instanceof Error ? error.message : String(error)}. The prompt may be unsafe or invalid.`;
            console.warn(`Generating a new prompt due to API error.`);
            currentPrompt = await getImprovedPrompt(ai, originalPrompt, currentPrompt, failureReason);
        }
    }

    throw new Error(`Failed to generate a valid image after ${maxAttempts} attempts for prompt: ${originalPrompt}`);
}

/**
 * Verifies if a given image is suitable as a "hero" or "header" image for an article.
 */
async function isHeaderImageSuitable(
    ai: GoogleGenAI,
    image: { base64: string; mimeType: string },
    articleTitle: string,
    articleContent: string
): Promise<boolean> {
    const prompt = `You are a visual design critic. Your task is to evaluate if the provided image is suitable as a main "hero" or "header" image for a technical article.

A good header image is:
- Visually appealing and high-quality.
- Representative of the article's main theme, not just a small detail.
- Generally abstract or illustrative, rather than a specific, in-the-weeds screenshot (unless that screenshot perfectly encapsulates the topic).
- Engaging and draws the reader in.

A poor header image is:
- A low-quality or blurry screenshot.
- Too specific, showing a tiny UI element or a single line of code that doesn't represent the whole article.
- Visually cluttered or confusing.

Article Title: "${articleTitle}"
Article Summary: "${articleContent.substring(0, 500)}..."

Based on these criteria, analyze the provided image. Is it a suitable header image?

Respond ONLY with a valid JSON object with a single boolean key: "isSuitable".`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { data: image.base64, mimeType: image.mimeType } }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        isSuitable: { type: Type.BOOLEAN }
                    },
                    required: ['isSuitable']
                }
            }
        });
    
        const result = JSON.parse(response.text.trim());
        console.log(`Header image suitability check result: ${result.isSuitable}`);
        return result.isSuitable;
    } catch (error) {
        console.error("Error during header image suitability check. Assuming it's suitable to avoid blocking.", error);
        return true; // Fail gracefully
    }
}

/**
 * Generates a single, high-quality header image based on the article's content.
 */
async function generateHeaderImage(
    ai: GoogleGenAI,
    articleTitle: string,
    articleContent: string
): Promise<{ filename: string; base64: string; mimeType: string }> {
    const ideaPrompt = `Based on the following article title and content, create a single, concise, and descriptive prompt for an AI image generation model. The goal is to create a high-quality header image that is visually compelling and represents the article's core theme.

Article Title: "${articleTitle}"
Article Content Summary:
---
${articleContent.substring(0, 1000)}...
---

CRITICAL INSTRUCTIONS:
- The prompt should describe a professional, modern, slightly abstract technical illustration.
- Output ONLY the prompt string. Do not include labels, quotes, or any other text.`;
    
    const ideaResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: ideaPrompt
    });
    const imagePrompt = ideaResponse.text.trim();

    console.log(`Generating new header image with prompt: "${imagePrompt}"`);
    const { base64, mimeType } = await generateAndVerifyImage(
        ai,
        imagePrompt,
        {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '16:9',
        }
    );

    return {
        filename: 'generated-header-image.png',
        base64,
        mimeType,
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

CRITICAL INSTRUCTIONS:
- The value for the 'prompt' key MUST be a simple, clean, plain-text string.
- DO NOT include any Markdown, code formatting (like backticks), or special control characters within the prompt strings. The prompts are for an image model and must be purely descriptive text.

Article Text:
---
${refinedTranscript}
---

Output your answer as a valid JSON object. The root object should have a key "ideas", which is an array of objects. Each object in the array should have a single key "prompt".

Example format:
{
  "ideas": [
    { "prompt": "A detailed illustration of a computer motherboard with glowing circuits." },
    { "prompt": "A programmer at a sunlit desk, focused on a screen displaying complex code." },
    { "prompt": "An abstract visualization of data flowing through a network." }
  ]
}`;

    const ideasResponse = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: ideasPrompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    ideas: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                prompt: { type: Type.STRING }
                            },
                            required: ["prompt"]
                        }
                    }
                },
                required: ["ideas"]
            }
        }
    });
    
    const { ideas } = JSON.parse(ideasResponse.text.trim());
    if (!ideas || !Array.isArray(ideas) || ideas.length === 0) {
        throw new Error("Could not generate image ideas from the transcript.");
    }
    const prompts = ideas.map((idea: { prompt: string }) => idea.prompt);

    // 2. Generate each image based on the prompts, with a verification loop.
    const generatedImages = await Promise.all(
        prompts.slice(0, numberOfImages).map(async (prompt: string, index: number) => {
            console.log(`Starting generation process for prompt: "${prompt}"`);
            
            const initialPrompt = `A professional, high-quality technical illustration for an article. Style: clean, modern, slightly abstract. Avoid crowded text; only use text for essential labels or titles if necessary. ${prompt}`;
            
            const config = {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: index === 0 ? '16:9' : '4:3', // Header image is landscape
            };

            const { base64, mimeType } = await generateAndVerifyImage(ai, initialPrompt, config);

            return {
                filename: `generated-image-${index + 1}.png`,
                base64,
                mimeType,
            };
        })
    );

    return generatedImages;
}

/**
 * Phase 3: Analyzes images and text to determine optimal layout using a single, comprehensive API call.
 * If the user-provided images are unsuitable for a header, it will generate a new one.
 */
export async function planImagePlacements(
    ai: GoogleGenAI, 
    articleTitle: string,
    articleContent: string,
    contentBlocks: string[], 
    images: { filename: string; base64: string; mimeType: string }[]
): Promise<{ 
    strategy: PlacementStrategy;
    newImages: { filename: string; base64: string; mimeType: string }[];
}> {
    if (images.length === 0) {
        throw new Error("No images provided for placement planning.");
    }

    const imageFilenames = images.map(img => img.filename).join(', ');
    const indexedContent = contentBlocks
        .map((block, index) => `[${index}]: ${block.substring(0, 300)}...`)
        .join('\n');

    const prompt = `You are an expert visual layout editor for a technical article. Your task is to analyze the provided article content blocks and a set of images to create an optimal layout that is visually appealing and easy to read.

CRITICAL INSTRUCTIONS:
1.  **Select a Header Image**: Choose the single best image that represents the overall topic to be the main header image.
2.  **Distribute Body Images Evenly**: Your primary goal is to place the remaining images throughout the article to break up long sections of text. A good layout has images spread out.
3.  **STRICT RULE**: You MUST NOT cluster images together or place them all at the beginning of the article. For example, do not place multiple images after the same paragraph index. Aim for one image every few paragraphs.

RULES FOR PLACEMENT:
- The \`headerImageFilename\` must be the filename of your chosen header image.
- All other images must be included in the \`placements\` array.
- The \`afterParagraphIndex\` for each placement must be a ZERO-BASED index corresponding to the content block the image should follow.
- Each \`afterParagraphIndex\` should be unique if possible.

OUTPUT FORMAT:
Your output MUST be a valid JSON object.
{
  "headerImageFilename": "string",
  "placements": [
    { "imageFilename": "string", "afterParagraphIndex": number }
  ]
}

The highest possible index for \`afterParagraphIndex\` is ${contentBlocks.length - 1}.

ARTICLE CONTENT BLOCKS (INDEXED):
---
${indexedContent}
---

AVAILABLE IMAGES:
---
${imageFilenames}
---

Now, analyze the article content and the following images, then provide the complete layout strategy in the specified JSON format, strictly following the distribution rules.`;

    const contentParts: any[] = [{ text: prompt }];
    images.forEach(image => {
        contentParts.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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

        let initialStrategy = JSON.parse(response.text.trim()) as PlacementStrategy;
        const newImages: { filename: string; base64: string; mimeType: string }[] = [];

        // --- New Suitability Check ---
        const chosenHeaderImage = images.find(img => img.filename === initialStrategy.headerImageFilename);
        let finalHeaderImageFilename = initialStrategy.headerImageFilename;

        if (chosenHeaderImage) {
            const suitable = await isHeaderImageSuitable(ai, chosenHeaderImage, articleTitle, articleContent);
            if (!suitable) {
                console.warn(`Chosen header image '${chosenHeaderImage.filename}' is unsuitable. Generating a replacement.`);
                try {
                    const newHeader = await generateHeaderImage(ai, articleTitle, articleContent);
                    newImages.push(newHeader);
                    finalHeaderImageFilename = newHeader.filename;
                } catch (genError) {
                    console.error("Failed to generate replacement header image. Proceeding with the original.", genError);
                }
            }
        }

        const allImages = [...images, ...newImages];
        
        // --- Validation and Cleanup Logic ---

        if (!allImages.some(img => img.filename === finalHeaderImageFilename)) {
            console.warn(`Could not validate header image. Applying programmatic placement.`);
            const strategy = getProgrammaticPlacement(images, contentBlocks);
            return { strategy, newImages: [] };
        }

        let bodyPlacements = initialStrategy.placements.filter(p => 
            p.imageFilename !== finalHeaderImageFilename &&
            allImages.some(img => img.filename === p.imageFilename)
        );

        const placedBodyImages = new Set(bodyPlacements.map(p => p.imageFilename));
        const maxIndex = contentBlocks.length > 0 ? contentBlocks.length - 1 : 0;
        allImages.forEach(img => {
            if (img.filename !== finalHeaderImageFilename && !placedBodyImages.has(img.filename)) {
                console.warn(`'${img.filename}' was not placed by AI. Adding to the end.`);
                bodyPlacements.push({ imageFilename: img.filename, afterParagraphIndex: maxIndex });
            }
        });

        const indices = bodyPlacements.map(p => p.afterParagraphIndex);
        const isClustered = () => {
            if (indices.length < 2 || contentBlocks.length < 5) return false;
            const maxIndex = indices.length > 0 ? Math.max(...indices) : 0;
            if (maxIndex < Math.floor(contentBlocks.length * 0.25)) {
                console.log("Clustering detected: all images in first 25%.");
                return true;
            }
            const uniqueIndices = new Set(indices);
            if (uniqueIndices.size <= Math.floor(indices.length / 2)) {
                 console.log("Clustering detected: too many images share an index.");
                return true;
            }
            return false;
        };

        if (isClustered()) {
            console.warn("AI returned a clustered layout. Overriding with programmatic placement.");
            const programmaticStrategy = getProgrammaticPlacement(allImages, contentBlocks, finalHeaderImageFilename);
            return { strategy: programmaticStrategy, newImages };
        }

        bodyPlacements.forEach(p => {
            if (p.afterParagraphIndex < 0 || p.afterParagraphIndex > maxIndex) {
                p.afterParagraphIndex = maxIndex;
            }
        });
        
        const finalStrategy: PlacementStrategy = {
            headerImageFilename: finalHeaderImageFilename,
            placements: bodyPlacements
        };
        
        return { strategy: finalStrategy, newImages };

    } catch (e) {
        console.error(`Failed to generate image placement strategy via API:`, e);
        const strategy = getProgrammaticPlacement(images, contentBlocks);
        return { strategy, newImages: [] };
    }
}
