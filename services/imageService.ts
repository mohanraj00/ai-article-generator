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
        model: 'gemini-2.5-pro',
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

    // 2. Generate each image based on the prompts.
    const generatedImages = await Promise.all(
        prompts.slice(0, numberOfImages).map(async (prompt: string, index: number) => {
            console.log(`Generating image for prompt: "${prompt}"`);
            const imageResponse = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: `A professional, high-quality technical illustration for an article. Style: clean, modern, slightly abstract. Avoid crowded text; only use text for essential labels or titles if necessary. ${prompt}`,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: index === 0 ? '16:9' : '4:3', // Header image is landscape
                },
            });

            if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0) {
                throw new Error(`Failed to generate image for prompt: ${prompt}`);
            }

            const base64 = imageResponse.generatedImages[0].image.imageBytes;
            return {
                filename: `generated-image-${index + 1}.png`,
                base64: base64,
                mimeType: 'image/png'
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
    contentBlocks: string[], 
    images: { filename: string; base64: string; mimeType: string }[]
): Promise<PlacementStrategy> {
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
            model: 'gemini-2.5-pro',
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

        let result = JSON.parse(response.text.trim()) as PlacementStrategy;
        
        // --- Validation and Cleanup Logic ---

        // 1. Validate header image
        if (!images.some(img => img.filename === result.headerImageFilename)) {
            console.warn(`Model returned a non-existent header image. Applying programmatic placement.`);
            return getProgrammaticPlacement(images, contentBlocks);
        }
        
        // 2. Filter placements to only include valid, non-header images
        const bodyPlacements = result.placements.filter(p => 
            p.imageFilename !== result.headerImageFilename &&
            images.some(img => img.filename === p.imageFilename)
        );

        // 3. Sanity check for clustering
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
            return getProgrammaticPlacement(images, contentBlocks, result.headerImageFilename);
        }

        // 4. Final validation pass on the AI's (good) response
        const maxIndex = contentBlocks.length > 0 ? contentBlocks.length - 1 : 0;
        
        bodyPlacements.forEach(p => {
            if (p.afterParagraphIndex < 0 || p.afterParagraphIndex > maxIndex) {
                 console.warn(`Model returned out-of-bounds index ${p.afterParagraphIndex} for '${p.imageFilename}'. Clamping to ${maxIndex}.`);
                p.afterParagraphIndex = maxIndex;
            }
        });

        const placedImages = new Set(bodyPlacements.map(p => p.imageFilename));
        images.forEach(img => {
            if (img.filename !== result.headerImageFilename && !placedImages.has(img.filename)) {
                console.warn(`Model did not provide a placement for '${img.filename}'. Adding it to the end.`);
                bodyPlacements.push({ imageFilename: img.filename, afterParagraphIndex: maxIndex });
            }
        });
        
        return {
            headerImageFilename: result.headerImageFilename,
            placements: bodyPlacements
        };

    } catch (e) {
        console.error(`Failed to generate image placement strategy via API:`, e);
        return getProgrammaticPlacement(images, contentBlocks);
    }
}