
import { GoogleGenAI } from '@google/genai';
import { refineTranscript, validateAndCorrectArticle } from './articleService';
import { generateArticleImages, planImagePlacements } from './imageService';
import { assembleArticleHtml, parseContentForAnalysis } from './htmlService';
import { convertImageToWebP } from '../utils/imageUtils';
import type { ImageFile } from '../types';

interface WorkflowProgress {
    step: string;
}

interface WorkflowResult {
    title: string;
    html: string;
}

/**
 * Orchestrates the complex multi-step process of generating an article from start to finish.
 */
export async function runGenerationWorkflow(
    ai: GoogleGenAI,
    transcript: string,
    userImages: ImageFile[],
    onProgress: (progress: WorkflowProgress) => void,
    feedback?: string
): Promise<WorkflowResult> {

    // Phase 1: Transcript Refinement
    onProgress({ step: 'Phase 1/4: Structuring article...' });
    const initialArticle = await refineTranscript(ai, transcript, feedback);

    // Phase 2: Verification and Correction
    onProgress({ step: 'Phase 2/4: Verifying content accuracy...' });
    const { title, content: markdownContent } = await validateAndCorrectArticle(ai, transcript, initialArticle);

    // Prepare Images (User Provided vs AI Generated)
    let imagesForArticle: {
        file: { name: string; type: string };
        base64: string;
        mimeType: string; // Internal use for API
    }[] = [];

    if (userImages.length > 0) {
        imagesForArticle = userImages.map(img => ({
            file: { name: img.file.name, type: img.mimeType },
            base64: img.base64,
            mimeType: img.mimeType
        }));
    } else {
        onProgress({ step: 'Phase 2.5/4: Generating article images...' });
        try {
            // Generate PNGs
            const generatedImagesData = await generateArticleImages(ai, markdownContent);
            
            // Optimize to WebP
            const optimizedImagesData = await Promise.all(
                generatedImagesData.map(async (img) => {
                    const { base64: webpBase64, mimeType: webpMimeType } = await convertImageToWebP(img.base64, img.mimeType);
                    const newFilename = img.filename.replace(/\.[^/.]+$/, ".webp");
                    return {
                        filename: newFilename,
                        base64: webpBase64,
                        mimeType: webpMimeType,
                    };
                })
            );
            
            imagesForArticle = optimizedImagesData.map(img => ({
                file: { name: img.filename, type: img.mimeType },
                base64: img.base64,
                mimeType: img.mimeType
            }));
        } catch (genErr) {
            console.error("Image generation failed, proceeding without images.", genErr);
        }
    }

    // Phase 3: Visual Analysis & Layout Planning
    if (imagesForArticle.length > 0) {
        onProgress({ step: 'Phase 3/4: Analyzing images and planning layout...' });
        
        // Parse content for the AI to understand the structure
        const { contentBlocks } = parseContentForAnalysis(markdownContent);

        const imagePayload = imagesForArticle.map(img => ({ 
            filename: img.file.name, 
            base64: img.base64, 
            mimeType: img.mimeType 
        }));
        
        const { strategy, newImages } = await planImagePlacements(
            ai,
            title,
            markdownContent,
            contentBlocks,
            imagePayload
        );

        // If AI generated a new specific header image during planning, add it
        if (newImages && newImages.length > 0) {
            imagesForArticle.push(...newImages.map(img => ({
                file: { name: img.filename, type: img.mimeType },
                base64: img.base64,
                mimeType: img.mimeType
            })));
        }

        // Phase 4: Assembly
        onProgress({ step: 'Phase 4/4: Generating final HTML article...' });
        const finalHtml = assembleArticleHtml(title, markdownContent, imagesForArticle, strategy);
        return { title, html: finalHtml };

    } else {
        // Text-only path
        onProgress({ step: 'Phase 4/4: Generating final HTML article...' });
        const finalHtml = assembleArticleHtml(title, markdownContent, [], { headerImageFilename: '', placements: [] });
        return { title, html: finalHtml };
    }
}
