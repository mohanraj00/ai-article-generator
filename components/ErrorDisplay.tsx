
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
        <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-md" role="alert">
            <div className="flex">
                <AlertTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-300 mr-3 flex-shrink-0" />
                <div>
                    <p className="font-bold">An Error Occurred</p>
                    <p>{error}</p>
                </div>
            </div>
        </div>
    );
};
