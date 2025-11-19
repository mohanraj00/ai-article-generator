
import React, { useRef, useCallback, useState } from 'react';
import type { ImageFile } from '../types';
import { ImagePreview } from './ImagePreview';
import { Spinner } from './Spinner';
import { UploadIcon, DocumentArrowUpIcon } from './icons';

interface InputScreenProps {
    transcript: string;
    setTranscript: (value: string) => void;
    feedback: string;
    setFeedback: (value: string) => void;
    images: ImageFile[];
    onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onTranscriptUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveImage: (id: string) => void;
    onGenerate: () => void;
    loading: boolean;
    isGenerateDisabled: boolean;
    onProcessImageFiles: (files: File[]) => void;
    hasGeneratedContent: boolean;
}

export const InputScreen: React.FC<InputScreenProps> = ({
    transcript,
    setTranscript,
    feedback,
    setFeedback,
    images,
    onImageUpload,
    onTranscriptUpload,
    onRemoveImage,
    onGenerate,
    loading,
    isGenerateDisabled,
    onProcessImageFiles,
    hasGeneratedContent,
}) => {
    const [isDragging, setIsDragging] = useState(false);

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        if (loading) return;
        const items = event.clipboardData.items;
        const imageFiles: File[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) imageFiles.push(file);
            }
        }

        if (imageFiles.length > 0) {
            event.preventDefault();
            onProcessImageFiles(imageFiles);
        }
    }, [onProcessImageFiles, loading]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        
        if (loading) return;

        const files: File[] = Array.from(e.dataTransfer.files);
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        
        // If dropped files are images, process them
        if (imageFiles.length > 0) {
            onProcessImageFiles(imageFiles);
        }
    };
    
    return (
        <div 
            className="flex flex-col h-full overflow-hidden" 
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 relative">
                {/* Overlay Drop Indication */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-indigo-500/10 border-2 border-indigo-500 border-dashed m-4 rounded-xl flex items-center justify-center backdrop-blur-sm pointer-events-none">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg text-indigo-600 font-medium">
                            Drop images to attach
                        </div>
                    </div>
                )}

                {/* Transcript Input */}
                <div className="flex flex-col min-h-[200px]">
                    <div className="flex justify-between items-end mb-2">
                        <label htmlFor="transcript" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Transcript
                        </label>
                         <label className="cursor-pointer text-indigo-600 hover:text-indigo-500 text-xs font-medium flex items-center gap-1 transition-colors">
                            <DocumentArrowUpIcon className="h-4 w-4" />
                            <span>Import File</span>
                            <input type="file" className="sr-only" accept=".txt,.md,text/plain" onChange={onTranscriptUpload} disabled={loading} />
                        </label>
                    </div>
                    <textarea
                        id="transcript"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        placeholder="Paste your raw transcript here, or drop images anywhere to attach them..."
                        className="flex-1 w-full p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 dark:text-slate-300 text-base leading-relaxed transition"
                        disabled={loading}
                    />
                </div>

                {/* Attachments Area - Only show if images exist or if empty state hint is needed */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                         <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Attachments ({images.length})
                        </span>
                        <label className="cursor-pointer p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                             <UploadIcon className="h-5 w-5 text-slate-400 hover:text-indigo-600" />
                             <input type="file" className="sr-only" multiple accept="image/*" onChange={onImageUpload} disabled={loading} />
                        </label>
                    </div>
                    
                    {images.length > 0 ? (
                         <ImagePreview images={images} onRemove={onRemoveImage} />
                    ) : (
                        <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center transition-colors hover:border-indigo-300 dark:hover:border-indigo-700/50">
                            <p className="text-sm text-slate-500">No images attached</p>
                            <p className="text-xs text-slate-400 mt-1">Drag & drop or paste screenshots</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Action */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                {hasGeneratedContent && (
                    <div className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                         <div className="flex justify-between items-end mb-2">
                            <label htmlFor="feedback" className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                Refinement Instructions (Optional)
                            </label>
                        </div>
                        <textarea
                            id="feedback"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="What should be different this time? (e.g., 'Make the tone more professional', 'Expand on the second section')"
                            className="w-full p-3 text-sm bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700 dark:text-slate-300 resize-none h-20 transition placeholder:text-slate-400"
                            disabled={loading}
                        />
                    </div>
                )}

                <button
                    type="button"
                    onClick={onGenerate}
                    disabled={isGenerateDisabled}
                    className="w-full flex justify-center items-center py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/20 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed dark:ring-offset-slate-900 transition-all active:scale-[0.98]"
                >
                    {loading ? <Spinner /> : (hasGeneratedContent ? 'Regenerate Article' : 'Generate Article')}
                </button>
            </div>
        </div>
    );
};
