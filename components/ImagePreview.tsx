
import React from 'react';
import type { ImageFile } from '../types';
import { XCircleIcon } from './icons';

interface ImagePreviewProps {
    images: ImageFile[];
    onRemove: (id: string) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ images, onRemove }) => {
    if (images.length === 0) {
        return null;
    }

    return (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((image) => (
                <div key={image.id} className="relative group aspect-square">
                    <img src={image.previewUrl} alt={image.file.name} className="h-full w-full object-cover rounded-lg border border-slate-200 dark:border-slate-700" />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-colors duration-200 flex items-center justify-center rounded-lg">
                        <button
                            onClick={() => onRemove(image.id)}
                            className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 transform group-hover:scale-100 scale-90"
                            aria-label="Remove image"
                        >
                            <XCircleIcon className="h-8 w-8" />
                        </button>
                    </div>
                     <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1.5" title={image.file.name}>{image.file.name}</p>
                </div>
            ))}
        </div>
    );
};