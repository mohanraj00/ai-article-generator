
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { refineTranscript, planImagePlacements, generateHtmlArticle } from './services/geminiService';
import type { ImageFile, PlacementStrategy } from './types';
import { ImagePreview } from './components/ImagePreview';
import { Spinner } from './components/Spinner';
import { UploadIcon, ClipboardIcon, DownloadIcon, AlertTriangleIcon, DocumentArrowUpIcon, RefreshIcon } from './components/icons';

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
    <header className="bg-white dark:bg-gray-800 shadow-md">
        <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white">
                AI Article Architect
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">
                Transform transcripts and screenshots into polished technical articles.
            </p>
        </div>
    </header>
);

const App: React.FC = () => {
    const [transcript, setTranscript] = useState<string>('');
    const [images, setImages] = useState<ImageFile[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [generatedHtml, setGeneratedHtml] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'html' | 'preview'>('preview');

    const formRef = useRef<HTMLFormElement>(null);
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

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        if (loading) return;
        const items = event.clipboardData.items;
        const imageFiles: File[] = [];

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFiles.push(file);
                }
            }
        }

        if (imageFiles.length > 0) {
            event.preventDefault();
            processImageFiles(imageFiles);
        }
    }, [processImageFiles, loading]);

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
        setLoading(true);
        setError(null);
        setGeneratedHtml('');

        try {
            // Phase 1: Transcript Refinement
            setLoadingMessage('Phase 1/3: Refining transcript...');
            const refined = await refineTranscript(ai, transcript);

            let articleContent: string;

            if (images.length > 0) {
                // Phase 2: Visual Analysis
                setLoadingMessage('Phase 2/3: Analyzing images and planning layout...');
                const imagePayload = images.map(img => ({ filename: img.file.name, base64: img.base64, mimeType: img.file.type }));
                
                const placementStrategy: PlacementStrategy = await planImagePlacements(
                    ai, 
                    refined, 
                    imagePayload
                );

                // Assemble content before final generation
                setLoadingMessage('Assembling article content...');
                const paragraphs = refined.split('\n').filter(p => p.trim() !== '');
                let contentParts: string[] = [];

                const headerImage = images.find(img => img.file.name === placementStrategy.headerImageFilename);
                if (headerImage) {
                    contentParts.push(`<img src="data:${headerImage.file.type};base64,${headerImage.base64}" alt="${headerImage.file.name}" class="header-image">`);
                }

                const placementsByPara = new Map<number, ImageFile[]>();
                placementStrategy.placements.forEach(p => {
                    const imageFile = images.find(img => img.file.name === p.imageFilename);
                    if (imageFile) {
                        if (!placementsByPara.has(p.afterParagraphIndex)) {
                            placementsByPara.set(p.afterParagraphIndex, []);
                        }
                        placementsByPara.get(p.afterParagraphIndex)?.push(imageFile);
                    }
                });

                const placedImageFilenames = new Set<string>();
                paragraphs.forEach((p, index) => {
                    contentParts.push(`<p>${p}</p>`);
                    if (placementsByPara.has(index)) {
                        placementsByPara.get(index)?.forEach(img => {
                            contentParts.push(`<img src="data:${img.file.type};base64,${img.base64}" alt="${img.file.name}" class="body-image">`);
                            placedImageFilenames.add(img.file.name);
                        });
                    }
                });
                
                // Fallback for any images that were in the strategy but not placed
                placementStrategy.placements.forEach(p => {
                    if (!placedImageFilenames.has(p.imageFilename)) {
                        const imageFile = images.find(img => img.file.name === p.imageFilename);
                        if (imageFile) {
                            console.warn(`Image '${p.imageFilename}' was not placed during paragraph iteration, appending to the end.`);
                            contentParts.push(`<img src="data:${imageFile.file.type};base64,${imageFile.base64}" alt="${imageFile.file.name}" class="body-image">`);
                        }
                    }
                });
                
                articleContent = contentParts.join('\n');
            } else {
                setLoadingMessage('Phase 2/3: Skipping image analysis...');
                articleContent = refined.split('\n').filter(p => p.trim() !== '').map(p => `<p>${p}</p>`).join('\n');
            }

            // Phase 3: HTML Generation
            setLoadingMessage('Phase 3/3: Generating final HTML article...');
            const finalHtml = generateHtmlArticle(articleContent);
            setGeneratedHtml(finalHtml);

        } catch (err: any) {
            console.error(err);
            const errorMessage = err.message || 'Unknown error';
            let displayError = `An error occurred: ${errorMessage}`;

            // Provide a more user-friendly message for token limit errors
            if (errorMessage.includes("token count exceeds")) {
                displayError = "The provided transcript and/or images are too large to process. Please try reducing the length of the transcript or the number/size of images.";
            }
            
            setError(displayError);
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    }, [transcript, images, ai]);

    const handleReset = useCallback(() => {
        if (window.confirm('Are you sure you want to reset everything? This action cannot be undone.')) {
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
            setActiveTab('preview');
            
            // Reset the form, which clears file inputs and other fields
            if (formRef.current) {
                formRef.current.reset();
            }
        }
    }, []);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedHtml).then(() => {
            alert("HTML copied to clipboard!");
        }).catch(err => {
            console.error("Failed to copy:", err);
            alert("Failed to copy HTML.");
        });
    };

    const downloadHtml = () => {
        const blob = new Blob([generatedHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'article.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const isGenerateDisabled = !transcript.trim() || loading || !ai;

    return (
        <div className="min-h-screen text-gray-800 dark:text-gray-200" onPaste={handlePaste}>
            <Header />
            <main className="container mx-auto p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Input Section */}
                    <form ref={formRef}>
                        <div className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                            <div>
                                <label htmlFor="transcript" className="block text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">1. Paste or Upload Transcript</label>
                                <div className="relative">
                                    <textarea
                                        id="transcript"
                                        value={transcript}
                                        onChange={(e) => setTranscript(e.target.value)}
                                        placeholder="Paste your raw audio transcript here, or use the icon to upload a file..."
                                        className="w-full h-48 p-3 pr-12 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white transition"
                                        disabled={loading}
                                    />
                                    <label htmlFor="transcript-upload" className="absolute top-3 right-3 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors" title="Upload transcript file">
                                        <DocumentArrowUpIcon className="h-6 w-6" />
                                        <input id="transcript-upload" name="transcript-upload" type="file" className="sr-only" accept=".txt,.md,text/plain" onChange={handleTranscriptUpload} disabled={loading} />
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">2. Upload Screenshots (Optional)</label>
                                <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
                                    <div className="space-y-1 text-center">
                                        <UploadIcon className="mx-auto h-12 w-12 text-gray-400" />
                                        <div className="flex text-sm text-gray-600 dark:text-gray-400">
                                            <label htmlFor="file-upload" className="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 dark:ring-offset-gray-800">
                                                <span>Upload files</span>
                                                <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*" onChange={handleImageUpload} disabled={loading} />
                                            </label>
                                            <p className="pl-1">, paste, or drag and drop</p>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG, GIF up to 10MB</p>
                                    </div>
                                </div>
                                <ImagePreview images={images} onRemove={removeImage} />
                            </div>
                            
                            <div className="flex items-center space-x-2 pt-2">
                                <button
                                    type="button"
                                    onClick={handleGenerate}
                                    disabled={isGenerateDisabled}
                                    className="flex-grow w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed dark:ring-offset-gray-900 transition"
                                >
                                    {loading ? <Spinner /> : 'Generate Article'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    disabled={loading}
                                    title="Reset form"
                                    className="p-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                >
                                    <RefreshIcon className="h-6 w-6" />
                                </button>
                            </div>
                        </div>
                    </form>

                    {/* Output Section */}
                    <div className="space-y-4 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">3. Get Your Article</h2>
                        {error && (
                            <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md" role="alert">
                                <div className="flex">
                                    <AlertTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-300 mr-3" />
                                    <div>
                                        <p className="font-bold">Error</p>
                                        <p>{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {loading && (
                             <div className="flex items-center justify-center p-4 bg-blue-50 dark:bg-gray-700 rounded-md">
                                <Spinner />
                                <span className="ml-3 text-blue-800 dark:text-blue-200">{loadingMessage}</span>
                            </div>
                        )}
                        {generatedHtml && !loading && (
                            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 flex items-center justify-between p-2">
                                    <div className="flex space-x-1">
                                        <button onClick={() => setActiveTab('preview')} className={`px-3 py-1 text-sm rounded-md ${activeTab === 'preview' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>Preview</button>
                                        <button onClick={() => setActiveTab('html')} className={`px-3 py-1 text-sm rounded-md ${activeTab === 'html' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>HTML</button>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={copyToClipboard} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"><ClipboardIcon className="h-5 w-5" /></button>
                                        <button onClick={downloadHtml} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"><DownloadIcon className="h-5 w-5" /></button>
                                    </div>
                                </div>
                                
                                {activeTab === 'preview' && (
                                    <div className="p-2 bg-white dark:bg-gray-800">
                                      <iframe
                                        srcDoc={generatedHtml}
                                        title="Article Preview"
                                        className="w-full h-96 border-0"
                                        sandbox="allow-scripts"
                                      />
                                    </div>
                                )}
                                {activeTab === 'html' && (
                                    <textarea
                                        readOnly
                                        value={generatedHtml}
                                        className="w-full h-96 p-2 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-0 focus:ring-0"
                                    />
                                )}
                            </div>
                        )}
                         {!loading && !generatedHtml && (
                             <div className="flex flex-col items-center justify-center h-96 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                 <p className="text-lg">Your generated article will appear here.</p>
                                 <p>Fill in the details on the left and click "Generate Article" to begin.</p>
                             </div>
                         )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;
