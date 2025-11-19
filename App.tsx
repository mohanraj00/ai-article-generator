
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { runGenerationWorkflow } from './services';
import { resizeImage } from './utils/imageUtils';
import type { ImageFile } from './types';
import { InputScreen } from './components/InputScreen';
import { OutputScreen } from './components/OutputScreen';
import { DocumentTextIcon } from './components/icons';

const App: React.FC = () => {
    // "mobileTab" is only used on small screens. On desktop, we show both side-by-side.
    const [mobileTab, setMobileTab] = useState<'input' | 'output'>('input');
    
    // Key to force re-render of InputScreen to clear uncontrolled file inputs on reset
    const [resetKey, setResetKey] = useState<number>(0);

    const [transcript, setTranscript] = useState<string>('');
    const [feedback, setFeedback] = useState<string>('');
    const [images, setImages] = useState<ImageFile[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const [generatedHtml, setGeneratedHtml] = useState<string>('');
    const [generatedTitle, setGeneratedTitle] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const imagesRef = useRef<ImageFile[]>([]);
    imagesRef.current = images;

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
        const imageProcessingPromises = files.map(file => 
            resizeImage(file, 1024, 1024).then(resized => ({
                id: crypto.randomUUID(),
                file,
                previewUrl: URL.createObjectURL(file),
                base64: resized.base64,
                mimeType: resized.mimeType,
            }))
        );

        const results = await Promise.allSettled(imageProcessingPromises);
        
        const newImages: ImageFile[] = [];
        const processingErrors: string[] = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                newImages.push(result.value);
            } else {
                const errorMessage = (result.reason instanceof Error) ? result.reason.message : String(result.reason);
                console.error(`Failed to process file ${files[index].name}:`, result.reason);
                processingErrors.push(errorMessage);
            }
        });

        if (newImages.length > 0) {
            setImages(prev => [...prev, ...newImages]);
        }

        if (processingErrors.length > 0) {
            setError(`Could not process ${processingErrors.length} image(s). ${processingErrors[0]}`);
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
                setError("Error reading transcript file.");
            };
            reader.readAsText(file);
        }
    };

    const removeImage = useCallback((id: string) => {
        setImages(prevImages => {
            const imageToRemove = prevImages.find(img => img.id === id);
            if (imageToRemove) URL.revokeObjectURL(imageToRemove.previewUrl);
            return prevImages.filter(img => img.id !== id);
        });
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!transcript.trim() || !ai) {
            setError("Please provide a transcript.");
            return;
        }
        
        setMobileTab('output'); // Switch tab on mobile
        setLoading(true);
        setError(null);
        if (!generatedHtml) {
             // Only clear if this is a fresh generation, not a regeneration which might want to preserve view until done
             setGeneratedHtml(''); 
        }
        setLoadingMessage('Starting...');

        try {
            const result = await runGenerationWorkflow(
                ai,
                transcript,
                images,
                (progress) => setLoadingMessage(progress.step),
                feedback
            );

            setGeneratedTitle(result.title);
            setGeneratedHtml(result.html);

        } catch (err: any) {
            console.error("Generation failed:", err);
            let displayError = err.message || "An unexpected error occurred.";
            if (displayError.includes("API_KEY")) displayError = "Invalid API Key.";
            setError(displayError);
        } finally {
            setLoading(false);
            setLoadingMessage('');
        }
    }, [transcript, images, ai, feedback, generatedHtml]);

    const handleReset = useCallback(() => {
        setImages(prev => {
            prev.forEach(i => URL.revokeObjectURL(i.previewUrl));
            return [];
        });
        setTranscript('');
        setFeedback('');
        setGeneratedHtml('');
        setGeneratedTitle('');
        setError(null);
        setLoading(false);
        setMobileTab('input');
        setResetKey(prev => prev + 1); // Force remount of InputScreen
    }, []);

    const isGenerateDisabled = !transcript.trim() || loading || !ai;

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 overflow-hidden">
            {/* Minimal Header */}
            <header className="h-14 border-b border-slate-200 dark:border-slate-800 flex items-center px-4 md:px-6 bg-white dark:bg-slate-950 flex-shrink-0 z-10">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
                        <DocumentTextIcon className="h-5 w-5" />
                    </div>
                    <h1 className="font-bold text-lg tracking-tight text-slate-900 dark:text-white">Post Perfect AI</h1>
                </div>
                <div className="ml-auto flex items-center space-x-2 text-xs font-medium">
                   { process.env.API_KEY ? (
                        <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
                            System Ready
                        </span>
                   ) : (
                        <span className="text-red-600 bg-red-50 px-2 py-1 rounded-full">API Key Missing</span>
                   )}
                </div>
            </header>

            {/* Workspace Area */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* Left Panel: Input (Desktop: w-1/3, Mobile: Full if active) */}
                <div className={`
                    flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 
                    md:w-1/3 lg:w-[400px] xl:w-[450px] md:flex
                    ${mobileTab === 'input' ? 'flex w-full absolute inset-0 z-20 md:static' : 'hidden'}
                `}>
                     <InputScreen
                        key={resetKey}
                        transcript={transcript}
                        setTranscript={setTranscript}
                        feedback={feedback}
                        setFeedback={setFeedback}
                        images={images}
                        onImageUpload={handleImageUpload}
                        onTranscriptUpload={handleTranscriptUpload}
                        onRemoveImage={removeImage}
                        onGenerate={handleGenerate}
                        loading={loading}
                        isGenerateDisabled={isGenerateDisabled}
                        onProcessImageFiles={processImageFiles}
                        hasGeneratedContent={!!generatedHtml}
                    />
                </div>

                {/* Right Panel: Output (Desktop: Flex-1, Mobile: Full if active) */}
                <div className={`
                    flex-1 flex-col bg-slate-50 dark:bg-black/20 relative
                    ${mobileTab === 'output' ? 'flex w-full absolute inset-0 z-20 md:static' : 'hidden md:flex'}
                `}>
                    <OutputScreen
                        loading={loading}
                        loadingMessage={loadingMessage}
                        error={error}
                        generatedHtml={generatedHtml}
                        generatedTitle={generatedTitle}
                        onReset={handleReset}
                    />
                </div>
            </div>

            {/* Mobile Navigation Tabs */}
            <div className="md:hidden h-14 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex text-xs font-medium z-30 flex-shrink-0">
                <button 
                    onClick={() => setMobileTab('input')}
                    className={`flex-1 flex items-center justify-center gap-2 ${mobileTab === 'input' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10' : 'text-slate-500'}`}
                >
                    Editor
                </button>
                <button 
                    onClick={() => setMobileTab('output')}
                    className={`flex-1 flex items-center justify-center gap-2 ${mobileTab === 'output' ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10' : 'text-slate-500'}`}
                >
                    Preview
                    {generatedHtml && <span className="block w-2 h-2 rounded-full bg-indigo-500"></span>}
                </button>
            </div>
        </div>
    );
};

export default App;
