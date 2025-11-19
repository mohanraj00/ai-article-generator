import React, { useState } from 'react';
import { Spinner } from './Spinner';
import { ErrorDisplay } from './ErrorDisplay';
import { ClipboardIcon, DownloadIcon, ExpandIcon, XMarkIcon, DocumentTextIcon, ArrowUturnLeftIcon } from './icons';

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
            // Could add a toast here
        }).catch(err => console.error(err));
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

    // Empty State
    if (!loading && !error && !generatedHtml) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-600">
                <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                    <DocumentTextIcon className="h-10 w-10" />
                </div>
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">Ready to Write</h3>
                <p className="max-w-xs mx-auto text-sm">Enter your transcript and title on the left, then hit Generate to see the magic happen here.</p>
            </div>
        );
    }

    // Loading State
    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
                    <div className="text-indigo-600 mb-4"><Spinner /></div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">Generating Article</h3>
                    <p className="text-slate-500 text-sm animate-pulse">{loadingMessage}</p>
                </div>
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div className="flex-1 p-8 flex flex-col items-center justify-center">
                <div className="w-full max-w-md">
                    <ErrorDisplay error={error} />
                    <button onClick={onReset} className="mt-4 w-full py-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Toolbar */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                     <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2 hidden sm:block">Result</span>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                        <button 
                            onClick={() => setActiveTab('preview')} 
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'preview' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Preview
                        </button>
                        <button 
                            onClick={() => setActiveTab('html')} 
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'html' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Code
                        </button>
                    </div>
                </div>
                
                <div className="flex items-center gap-1">
                    <button onClick={onReset} className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Clear Results">
                        <ArrowUturnLeftIcon className="h-4 w-4" />
                    </button>
                    <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>
                    <button onClick={() => setIsPreviewFullScreen(true)} className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition" title="Full Screen">
                        <ExpandIcon className="h-4 w-4" />
                    </button>
                    <button onClick={copyToClipboard} className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition" title="Copy Code">
                        <ClipboardIcon className="h-4 w-4" />
                    </button>
                    <button onClick={downloadHtml} className="p-2 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition" title="Download HTML">
                        <DownloadIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-black/40 relative">
                {activeTab === 'preview' ? (
                    <iframe
                        srcDoc={generatedHtml}
                        title="Article Preview"
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-scripts"
                    />
                ) : (
                    <textarea
                        readOnly
                        value={generatedHtml}
                        className="w-full h-full p-6 font-mono text-xs bg-slate-900 text-slate-300 border-0 focus:ring-0 resize-none"
                    />
                )}
            </div>

            {/* Full Screen Modal */}
            {isPreviewFullScreen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8">
                    <div className="relative w-full h-full max-w-6xl bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
                        <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center">
                            <span className="text-sm font-medium opacity-80">Full Screen Preview</span>
                            <button onClick={() => setIsPreviewFullScreen(false)} className="p-1 hover:bg-white/20 rounded-full transition">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <iframe
                            srcDoc={generatedHtml}
                            title="Article Preview (Full Screen)"
                            className="flex-1 w-full border-0"
                            sandbox="allow-scripts"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};