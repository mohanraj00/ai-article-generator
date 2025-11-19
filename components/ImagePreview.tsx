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
        <div className="flex space-x-3 overflow-x-auto pb-2 custom-scrollbar">
            {images.map((image) => (
                <div key={image.id} className="relative flex-shrink-0 w-24 h-24 group">
                    <img 
                        src={image.previewUrl} 
                        alt={image.file.name} 
                        className="h-full w-full object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" 
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 rounded-lg flex items-center justify-center">
                        <button
                            onClick={() => onRemove(image.id)}
                            className="text-white opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100 hover:text-red-400"
                            aria-label="Remove image"
                        >
                            <XCircleIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate px-1">{image.file.name}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};