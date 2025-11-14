
import React, { useRef, useCallback } from 'react';
import type { ImageFile } from '../types';
import { ImagePreview } from './ImagePreview';
import { Spinner } from './Spinner';
import { UploadIcon, DocumentArrowUpIcon } from './icons';

interface InputScreenProps {
    transcript: string;
    setTranscript: (value: string) => void;
    suggestedTitle: string;
    setSuggestedTitle: (value: string) => void;
    images: ImageFile[];
    onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onTranscriptUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveImage: (id: string) => void;
    onGenerate: () => void;
    loading: boolean;
    isGenerateDisabled: boolean;
    onProcessImageFiles: (files: File[]) => void;
}

export const InputScreen: React.FC<InputScreenProps> = ({
    transcript,
    setTranscript,
    suggestedTitle,
    setSuggestedTitle,
    images,
    onImageUpload,
    onTranscriptUpload,
    onRemoveImage,
    onGenerate,
    loading,
    isGenerateDisabled,
    onProcessImageFiles,
}) => {
    const formRef = useRef<HTMLFormElement>(null);

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        if (loading) return;
        const items = event.clipboardData.items;
        const imageFiles: File[] = [];

        for (let i = 0; i in items; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFiles.push(file);
                }
            }
        }

        if (imageFiles.length > 0) {
            event.preventDefault();
            onProcessImageFiles(imageFiles);
        }
    }, [onProcessImageFiles, loading]);
    
    return (
        <div className="max-w-4xl mx-auto" onPaste={handlePaste}>
            <form ref={formRef}>
                <div className="space-y-10 bg-white dark:bg-slate-900 p-8 md:p-10 rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-200/80 dark:border-slate-800/50">
                    <div>
                        <label htmlFor="transcript" className="block text-base font-medium mb-2 text-slate-700 dark:text-slate-300">1. Paste or Upload Transcript</label>
                        <div className="relative">
                            <textarea
                                id="transcript"
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                placeholder="Paste your raw audio transcript here, or use the icon to upload a file..."
                                className="w-full h-48 p-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:placeholder-slate-400 dark:text-white transition"
                                disabled={loading}
                            />
                            <label htmlFor="transcript-upload" className="absolute top-3 right-3 text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-pointer transition-colors" title="Upload transcript file">
                                <DocumentArrowUpIcon className="h-6 w-6" />
                                <input id="transcript-upload" name="transcript-upload" type="file" className="sr-only" accept=".txt,.md,text/plain" onChange={onTranscriptUpload} disabled={loading} />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="suggested-title" className="block text-base font-medium mb-2 text-slate-700 dark:text-slate-300">
                            2. Suggest a Title (Optional)
                        </label>
                        <input
                            type="text"
                            id="suggested-title"
                            value={suggestedTitle}
                            onChange={(e) => setSuggestedTitle(e.target.value)}
                            placeholder="e.g., How to Build a React App in 5 Minutes"
                            className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:placeholder-slate-400 dark:text-white transition"
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <label className="block text-base font-medium mb-2 text-slate-700 dark:text-slate-300">3. Upload Screenshots (Optional)</label>
                        <div className="mt-2 flex justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 px-6 py-10 hover:border-indigo-500 dark:hover:border-indigo-600 transition-colors">
                            <div className="space-y-1 text-center">
                                <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                                <div className="flex text-sm text-slate-600 dark:text-slate-400">
                                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 dark:ring-offset-slate-900">
                                        <span>Upload files</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*" onChange={onImageUpload} disabled={loading} />
                                    </label>
                                    <p className="pl-1">, paste, or drag and drop</p>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-500">PNG, JPG, GIF up to 10MB</p>
                            </div>
                        </div>
                        <ImagePreview images={images} onRemove={onRemoveImage} />
                    </div>
                    
                    <div className="pt-4">
                        <button
                            type="button"
                            onClick={onGenerate}
                            disabled={isGenerateDisabled}
                            className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-slate-400 disabled:cursor-not-allowed dark:ring-offset-slate-900 transition-all duration-200 active:scale-[0.98] active:bg-indigo-800"
                        >
                            {loading ? <Spinner /> : 'Generate Article'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};