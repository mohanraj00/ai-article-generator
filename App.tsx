import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { refineTranscript, validateAndCorrectArticle, planImagePlacements, generateHtmlArticle, generateArticleImages } from './services/geminiService';
import type { ImageFile, PlacementStrategy } from './types';
import { InputScreen } from './components/InputScreen';
import { OutputScreen } from './components/OutputScreen';

declare const marked: { parse: (markdown: string) => string };

/**
 * Resizes an image file to fit within a max width and height, preserving aspect ratio.
 * This function is memory-intensive for very large files as it reads the whole file into memory.
 * The 1024x1024 cap helps mitigate this.
 * @returns A Promise that resolves with the base64-encoded string of the resized image.
 */
const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (readerEvent) => {
            if (!readerEvent.target?.result) {
                return reject(new Error("File could not be read."));
            }

            const img = new Image();
            img.src = readerEvent.target.result as string;
            img.onload = () => {
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get data URL and extract base64 part. Use quality 0.9 for JPEGs.
                const dataUrl = canvas.toDataURL(file.type, 0.9);
                resolve(dataUrl.split(',')[1]);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};


const Header: React.FC = () => (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 md:px-8 py-3">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">
                Post Perfect AI
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                Effortlessly transform raw transcripts and images into polished, ready-to-publish articles.
            </p>
        </div>
    </header>
);

const App: React.FC = () => {
    const [view, setView] = useState<'input' | 'output'>('input');
    const [transcript, setTranscript] = useState<string>('');
    const [images, setImages] = useState<ImageFile[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [generatedHtml, setGeneratedHtml] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const imagesRef = useRef<ImageFile[]>([]); // Ref to hold the latest images for unmount cleanup
    imagesRef.current = images;

    // Effect for cleaning up Object URLs on component unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            imagesRef.current.forEach(image => URL.revokeObjectURL(image.previewUrl));
        };
    }, []);

    const ai = useMemo(() => {
        if (!process.env.API_KEY) {
            setError("API_KEY environment variable not set.");
            return null;
        }
        return new GoogleGenAI({ apiKey: process.env.API_KEY });
    }, []);

    const processImageFiles = useCallback(async (files: File[]) => {
        try {
            const newImages = await Promise.all(files.map(async (file) => {
                // Resize image to max 1024x1024 for memory efficiency
                const resizedBase64 = await resizeImage(file, 1024, 1024);
                return {
                    id: crypto.randomUUID(), // Generate a stable unique ID
                    file,
                    previewUrl: URL.createObjectURL(file), // Use original file for preview
                    base64: resizedBase64,
                };
            }));
            setImages(prev => [...prev, ...newImages]);
        } catch (err) {
            console.error("Error processing files:", err);
            setError("There was an error processing the images.");
        }
    }, []);


    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            processImageFiles(Array.from(event.target.files));
        }
    };

    const handleTranscriptUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                setTranscript(text);
            };
            reader.onerror = (err) => {
                console.error("Error reading transcript file:", err);
                setError("There was an error reading the transcript file.");
            };
            reader.readAsText(file);
        }
    };

    const removeImage = useCallback((id: string) => {
        setImages(prevImages => {
            const imageToRemove = prevImages.find(img => img.id === id);
            if (imageToRemove) {
                URL.revokeObjectURL(imageToRemove.previewUrl);
            }
            return prevImages.filter(img => img.id !== id);
        });
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!transcript.trim() || !ai) {
            setError("Please provide a transcript to generate an article.");
            return;
        }
        
        setView('output');
        setLoading(true);
        setError(null);
        setGeneratedHtml('');

        try {
            // Phase 1: Transcript Refinement
            setLoadingMessage('Phase 1/4: Structuring article...');
            const initialArticle = await refineTranscript(ai, transcript);

            // Phase 2: Verification and Correction
            setLoadingMessage('Phase 2/4: Verifying content accuracy...');
            const { title, content: markdownContent } = await validateAndCorrectArticle(ai, transcript, initialArticle);
            
            // This will hold either user-provided images or generated ones.
            let imagesForArticle: {
                file: { name: string; type: string };
                base64: string;
            }[] = [];

            if (images.length > 0) {
                imagesForArticle = images.map(img => ({
                    file: { name: img.file.name, type: img.file.type },
                    base64: img.base64,
                }));
            } else {
                setLoadingMessage('Phase 2.5/4: Generating article images...');
                try {
                    const generatedImagesData = await generateArticleImages(ai, markdownContent);
                    imagesForArticle = generatedImagesData.map(img => ({
                        file: { name: img.filename, type: img.mimeType },
                        base64: img.base64
                    }));
                } catch (genErr) {
                    console.error("Image generation failed, proceeding without images.", genErr);
                    // Don't block article generation if image generation fails, just proceed text-only.
                }
            }
            
            let articleBodyHtml: string;

            if (imagesForArticle.length > 0) {
                // Phase 3: Visual Analysis
                setLoadingMessage('Phase 3/4: Analyzing images and planning layout...');
                const imagePayload = imagesForArticle.map(img => ({ 
                    filename: img.file.name, 
                    base64: img.base64, 
                    mimeType: img.file.type 
                }));
                
                const placementStrategy: PlacementStrategy = await planImagePlacements(
                    ai, 
                    markdownContent, 
                    imagePayload
                );

                // Convert base markdown to HTML
                const baseHtml = marked.parse(markdownContent);

                // Use DOMParser to inject images into the HTML structure
                const parser = new DOMParser();
                const doc = parser.parseFromString(`<div>${baseHtml}</div>`, 'text/html');
                const contentWrapper = doc.body.firstChild as HTMLElement;

                if (contentWrapper) {
                    const paragraphs = Array.from(contentWrapper.querySelectorAll('p'));
                    const placementsByPara = new Map<number, typeof imagesForArticle>();
                    
                    placementStrategy.placements.forEach(p => {
                        const imageFile = imagesForArticle.find(img => img.file.name === p.imageFilename);
                        if (imageFile) {
                            if (!placementsByPara.has(p.afterParagraphIndex)) {
                                placementsByPara.set(p.afterParagraphIndex, []);
                            }
                            placementsByPara.get(p.afterParagraphIndex)?.push(imageFile);
                        }
                    });

                    placementsByPara.forEach((imagesToPlace, paraIndex) => {
                        if (paraIndex >= 0 && paraIndex < paragraphs.length) {
                            const p = paragraphs[paraIndex];
                            imagesToPlace.reverse().forEach(img => {
                                const imgElement = doc.createElement('img');
                                imgElement.src = `data:${img.file.type};base64,${img.base64}`;
                                imgElement.alt = img.file.name;
                                imgElement.className = 'body-image';
                                p.after(imgElement);
                            });
                        }
                    });

                    const placedImageFilenames = new Set([
                        placementStrategy.headerImageFilename, 
                        ...placementStrategy.placements.map(p => p.imageFilename)
                    ]);
                    
                    imagesForArticle.forEach(imageFile => {
                        if (!placedImageFilenames.has(imageFile.file.name)) {
                             console.warn(`Image '${imageFile.file.name}' was not placed, appending to the end.`);
                             const imgElement = doc.createElement('img');
                             imgElement.src = `data:${imageFile.file.type};base64,${imageFile.base64}`;
                             imgElement.alt = imageFile.file.name;
                             imgElement.className = 'body-image';
                             contentWrapper.appendChild(imgElement);
                        }
                    });
                    
                    const headerImage = imagesForArticle.find(img => img.file.name === placementStrategy.headerImageFilename);
                    if (headerImage) {
                        const headerImgElement = doc.createElement('img');
                        headerImgElement.src = `data:${headerImage.file.type};base64,${headerImage.base64}`;
                        headerImgElement.alt = headerImage.file.name;
                        headerImgElement.className = 'header-image';
                        contentWrapper.prepend(headerImgElement);
                    }
                    
                    articleBodyHtml = contentWrapper.innerHTML;
                } else {
                    articleBodyHtml = baseHtml; // Fallback
                }
            } else {
                setLoadingMessage('Phase 3/4: Skipping image analysis...');
                articleBodyHtml = marked.parse(markdownContent);
            }

            const articleContent = `<h1>${title}</h1>\n${articleBodyHtml}`;

            // Phase 4: HTML Generation
            setLoadingMessage('Phase 4/4: Generating final HTML article...');
            const finalHtml = generateHtmlArticle(articleContent);
            setGeneratedHtml(finalHtml);

        } catch (err: any) {
            console.error("Generation failed:", err);
    
            let displayError = "An unexpected error occurred. Please check the console for more details.";
            const errorMessage = err.message ? err.message.toLowerCase() : '';
        
            if (errorMessage.includes("api key not valid")) {
                displayError = "The provided API Key is not valid. Please check your environment variables and ensure it is correct.";
            } else if (errorMessage.includes("token count exceeds") || errorMessage.includes("400 bad request")) {
                displayError = "The provided transcript and/or images are too large for the model to process. Please try reducing the length of the transcript or the number/size of images.";
            } else if (errorMessage.includes("quota")) {
                displayError = "You have exceeded your API quota. Please check your Google AI Studio account and billing settings.";
            } else if (err.toString().toLowerCase().includes('failed to fetch')) {
                displayError = "A network error occurred. Please check your internet connection and try again.";
            } else if (err.message) {
                // Fallback to the specific error message if it exists
                displayError = err.message;
            }
            
            setError(displayError);
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    }, [transcript, images, ai]);

    const handleReset = useCallback(() => {
        // No confirmation prompt, just reset the state.
        setImages(prevImages => {
            // Revoke all existing object URLs before clearing state to prevent memory leaks
            prevImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
            return []; // Return empty array to clear images
        });
        
        setTranscript('');
        setGeneratedHtml('');
        setError(null);
        setLoading(false);
        setLoadingMessage('');
        setView('input');
    }, []);

    const isGenerateDisabled = !transcript.trim() || loading || !ai;

    return (
        <div className="min-h-screen text-slate-800 dark:text-slate-200">
            <Header />
            <main className="container mx-auto p-4 md:p-8">
                {view === 'input' && (
                    <InputScreen
                        transcript={transcript}
                        setTranscript={setTranscript}
                        images={images}
                        onImageUpload={handleImageUpload}
                        onTranscriptUpload={handleTranscriptUpload}
                        onRemoveImage={removeImage}
                        onGenerate={handleGenerate}
                        loading={loading}
                        isGenerateDisabled={isGenerateDisabled}
                        onProcessImageFiles={processImageFiles}
                    />
                )}
                {view === 'output' && (
                    <OutputScreen
                        loading={loading}
                        loadingMessage={loadingMessage}
                        error={error}
                        generatedHtml={generatedHtml}
                        onReset={handleReset}
                    />
                )}
            </main>
        </div>
    );
};

export default App;