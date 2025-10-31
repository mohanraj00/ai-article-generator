import React, { useRef, useCallback } from 'react';
import type { ImageFile } from '../types';
import { ImagePreview } from './ImagePreview';
import { Spinner } from './Spinner';
import { UploadIcon, DocumentArrowUpIcon } from './icons';

interface InputScreenProps {
    transcript: string;
    setTranscript: (value: string) => void;
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
        <div className="max-w-3xl mx-auto" onPaste={handlePaste}>
            <form ref={formRef}>
                <div className="space-y-8 bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-md">
                    <div>
                        <label htmlFor="transcript" className="block text-lg font-semibold mb-2 text-slate-700 dark:text-slate-300">1. Paste or Upload Transcript</label>
                        <div className="relative">
                            <textarea
                                id="transcript"
                                value={transcript}
                                onChange={(e) => setTranscript(e.target.value)}
                                placeholder="Paste your raw audio transcript here, or use the icon to upload a file..."
                                className="w-full h-48 p-3 pr-12 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white transition"
                                disabled={loading}
                            />
                            <label htmlFor="transcript-upload" className="absolute top-3 right-3 text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer transition-colors" title="Upload transcript file">
                                <DocumentArrowUpIcon className="h-6 w-6" />
                                <input id="transcript-upload" name="transcript-upload" type="file" className="sr-only" accept=".txt,.md,text/plain" onChange={onTranscriptUpload} disabled={loading} />
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-lg font-semibold mb-2 text-slate-700 dark:text-slate-300">2. Upload Screenshots (Optional)</label>
                        <div className="mt-2 flex justify-center px-6 pt-5 pb-6 bg-slate-50 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600 rounded-lg">
                            <div className="space-y-1 text-center">
                                <UploadIcon className="mx-auto h-12 w-12 text-slate-400" />
                                <div className="flex text-sm text-slate-600 dark:text-slate-400">
                                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 dark:ring-offset-slate-800">
                                        <span>Upload files</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*" onChange={onImageUpload} disabled={loading} />
                                    </label>
                                    <p className="pl-1">, paste, or drag and drop</p>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, GIF up to 10MB</p>
                            </div>
                        </div>
                        <ImagePreview images={images} onRemove={onRemoveImage} />
                    </div>
                    
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={onGenerate}
                            disabled={isGenerateDisabled}
                            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed dark:ring-offset-slate-900 transition-transform active:scale-[0.98]"
                        >
                            {loading ? <Spinner /> : 'Generate Article'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
