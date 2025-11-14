
import React from 'react';
import { AlertTriangleIcon } from './icons';

interface ErrorDisplayProps {
    error: string | null;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error }) => {
    if (!error) {
        return null;
    }

    return (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 text-red-700 dark:text-red-300 p-4 rounded-md" role="alert">
            <div className="flex">
                <AlertTriangleIcon className="h-6 w-6 text-red-500 dark:text-red-500 mr-3 flex-shrink-0" />
                <div>
                    <p className="font-semibold">An Error Occurred</p>
                    <p className="mt-1">{error}</p>
                </div>
            </div>
        </div>
    );
};