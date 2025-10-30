
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
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((image) => (
                <div key={image.id} className="relative group">
                    <img src={image.previewUrl} alt={image.file.name} className="h-24 w-full object-cover rounded-md shadow-md" />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center rounded-md">
                        <button
                            onClick={() => onRemove(image.id)}
                            className="absolute top-1 right-1 text-white bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                        >
                            <XCircleIcon className="h-6 w-6" />
                        </button>
                    </div>
                     <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1" title={image.file.name}>{image.file.name}</p>
                </div>
            ))}
        </div>
    );
};
