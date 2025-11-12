import React, { useState } from 'react';
import { Spinner } from './Spinner';
import { ErrorDisplay } from './ErrorDisplay';
import { ArrowUturnLeftIcon, ClipboardIcon, DownloadIcon, ExpandIcon, XMarkIcon, DocumentTextIcon } from './icons';

interface OutputScreenProps {
    loading: boolean;
    loadingMessage: string;
    error: string | null;
    generatedHtml: string;
    generatedTitle: string;
    onReset: () => void;
}

export const OutputScreen: React.FC<OutputScreenProps> = ({
    loading,
    loadingMessage,
    error,
    generatedHtml,
    generatedTitle,
    onReset,
}) => {
    const [activeTab, setActiveTab] = useState<'html' | 'preview'>('preview');
    const [isPreviewFullScreen, setIsPreviewFullScreen] = useState<boolean>(false);

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
        const safeFilename = generatedTitle.replace(/[^a-z0-9-]/gi, ' ').trim().replace(/\s+/g, '-').toLowerCase();
        a.download = `${safeFilename || 'article'}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center h-96">
                    <Spinner />
                    <span className="mt-4 text-lg text-blue-700 dark:text-blue-300">{loadingMessage}</span>
                    <p className="mt-2 text-slate-500 dark:text-slate-400">Gemini is working its magic, please wait...</p>
                </div>
            );
        }

        if (error) {
            return <ErrorDisplay error={error} />;
        }

        if (generatedHtml) {
            return (
                <div className="border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between p-2">
                        <div className="flex bg-slate-200 dark:bg-slate-600 rounded-full p-0.5">
                            <button onClick={() => setActiveTab('preview')} className={`px-3 py-1 text-sm rounded-full ${activeTab === 'preview' ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-white' : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500/50'}`}>Preview</button>
                            <button onClick={() => setActiveTab('html')} className={`px-3 py-1 text-sm rounded-full ${activeTab === 'html' ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-white' : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500/50'}`}>HTML</button>
                        </div>
                        <div className="flex space-x-1">
                            <button onClick={() => setIsPreviewFullScreen(true)} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" title="Full screen preview"><ExpandIcon className="h-5 w-5" /></button>
                            <button onClick={copyToClipboard} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" title="Copy HTML"><ClipboardIcon className="h-5 w-5" /></button>
                            <button onClick={downloadHtml} className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500" title="Download HTML"><DownloadIcon className="h-5 w-5" /></button>
                        </div>
                    </div>
                    
                    {activeTab === 'preview' && (
                        <div className="p-2 bg-white dark:bg-slate-800">
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
                            className="w-full h-96 p-2 font-mono text-sm bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-0 focus:ring-0"
                        />
                    )}
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center justify-center h-96 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <DocumentTextIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
                <p className="text-lg font-medium">Something went wrong.</p>
                <p>We couldn't generate your article. Please try again.</p>
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="space-y-6 bg-white dark:bg-slate-800 p-6 md:p-8 rounded-xl shadow-md">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300">Your Generated Article</h2>
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={loading}
                        className="flex items-center py-2 px-4 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        <ArrowUturnLeftIcon className="h-5 w-5 mr-2" />
                        Start New Article
                    </button>
                </div>
                {renderContent()}
            </div>
            
            {isPreviewFullScreen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsPreviewFullScreen(false)}>
                    <div className="relative w-[95vw] h-[95vh] bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <iframe
                            srcDoc={generatedHtml}
                            title="Article Preview (Full Screen)"
                            className="w-full h-full border-0"
                            sandbox="allow-scripts"
                        />
                        <button 
                            onClick={() => setIsPreviewFullScreen(false)} 
                            className="absolute top-2 right-2 p-2 bg-slate-800/50 text-white rounded-full hover:bg-slate-800/80 transition"
                            aria-label="Close full screen preview"
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};