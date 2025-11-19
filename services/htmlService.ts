
import type { PlacementStrategy } from '../types';

declare const marked: { parse: (markdown: string) => string };

const ARTICLE_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><!-- ARTICLE_TITLE_HERE --></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #ffffff;
            --text-color: #1f2937; /* slate-800 */
            --heading-color: #111827; /* slate-900 */
            --subtle-text-color: #6b7280; /* slate-500 */
            --link-color: #2563eb; /* blue-600 */
            --link-hover-color: #1d4ed8; /* blue-700 */
            --border-color: #e5e7eb; /* slate-200 */
            --code-bg-color: #f3f4f6; /* slate-100 */
            --code-text-color: #111827;
            --shadow-color: rgba(0, 0, 0, 0.05);
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #111827; /* slate-900 */
                --text-color: #cbd5e1; /* slate-300 */
                --heading-color: #f1f5f9; /* slate-100 */
                --subtle-text-color: #94a3b8; /* slate-400 */
                --link-color: #60a5fa; /* blue-400 */
                --link-hover-color: #93c5fd; /* blue-300 */
                --border-color: #334155; /* slate-700 */
                --code-bg-color: #1e293b; /* slate-800 */
                --code-text-color: #e2e8f0; /* slate-200 */
                --shadow-color: rgba(0, 0, 0, 0.2);
            }
        }
        html {
            scroll-behavior: smooth;
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.75;
            font-size: 16px;
            margin: 0;
            padding: 0;
            color: var(--text-color);
            background-color: var(--bg-color);
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-feature-settings: 'liga' on, 'calt' on;
            transition: background-color 0.3s ease, color 0.3s ease;
        }
        .container {
            max-width: 75ch; /* Optimal reading width */
            margin: 4rem auto;
            padding: 0 1.5rem;
        }
        .header-image {
            width: 100%;
            max-height: 450px;
            object-fit: cover;
            border-radius: 12px;
            margin-bottom: 3rem;
            display: block;
        }
        h1, h2, h3, h4, h5, h6 {
            font-family: 'Inter', sans-serif;
            font-weight: 700;
            line-height: 1.25;
            color: var(--heading-color);
            margin-top: 3rem;
            margin-bottom: 1.25rem;
        }
        h1 {
            font-size: clamp(2.5rem, 5vw, 3.5rem);
            margin-top: 0;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1rem;
        }
        h2 {
            font-size: clamp(1.8rem, 4vw, 2.5rem);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.75rem;
        }
        h3 {
            font-size: clamp(1.5rem, 3vw, 2rem);
        }
        p, ul, ol {
            margin-bottom: 1.75rem;
            font-size: 1.125rem; /* 18px */
            color: var(--text-color);
        }
        ul, ol {
            padding-left: 1.5rem;
        }
        li {
            margin-bottom: 0.75rem;
        }
        .body-image {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 3.5rem auto;
            border-radius: 12px;
            box-shadow: 0 8px 24px var(--shadow-color);
        }
        a {
            color: var(--link-color);
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s ease;
        }
        a:hover {
            color: var(--link-hover-color);
            text-decoration: underline;
        }
        blockquote {
            margin: 2.5rem 0;
            padding-left: 1.5rem;
            border-left: 4px solid var(--link-color);
            font-style: italic;
            color: var(--subtle-text-color);
        }
        pre {
            background-color: var(--code-bg-color);
            color: var(--code-text-color);
            padding: 1.5rem;
            border-radius: 8px;
            overflow-x: auto;
            margin: 2.5rem 0;
            font-size: 0.95rem;
        }
        code {
            font-family: 'SF Mono', 'Fira Code', 'Menlo', 'Monaco', monospace;
            background-color: var(--code-bg-color);
            padding: 0.2em 0.4em;
            border-radius: 4px;
            font-size: 0.9em;
        }
        pre code {
            background-color: transparent;
            padding: 0;
            border-radius: 0;
            font-size: inherit;
        }
        hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 4rem auto;
        }
        @media (max-width: 600px) {
            .container {
                margin: 2rem auto;
                padding: 0 1rem;
            }
            p, ul, ol {
                font-size: 1rem; /* 16px */
            }
            h1 {
                font-size: 2.25rem;
            }
            h2 {
                font-size: 1.75rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <article>
            <!-- ARTICLE_CONTENT_HERE -->
        </article>
    </div>
</body>
</html>
`;

/**
 * Parses markdown and parses the resulting HTML to identify content blocks for the AI.
 * @param markdownContent The raw markdown.
 * @returns An object containing the base HTML and an array of text blocks.
 */
export function parseContentForAnalysis(markdownContent: string): { baseHtml: string, contentBlocks: string[] } {
    const baseHtml = marked.parse(markdownContent);
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${baseHtml}</div>`, 'text/html');
    const contentWrapper = doc.body.firstChild as HTMLElement;

    const contentBlocks: string[] = [];
    if (contentWrapper) {
        const insertionPoints = Array.from(contentWrapper.querySelectorAll('p, h2, h3, h4, ul, ol, blockquote, pre'));
        insertionPoints.forEach(el => contentBlocks.push(el.textContent || ''));
    }
    return { baseHtml, contentBlocks };
}

/**
 * Injects images into the HTML structure based on the placement strategy.
 */
export function assembleArticleHtml(
    title: string,
    markdownContent: string,
    images: { file: { name: string; type: string }; base64: string }[],
    strategy: PlacementStrategy
): string {
    const baseHtml = marked.parse(markdownContent);
    
    // If no images to place (or no strategy), just return simple HTML
    if (images.length === 0) {
        const articleContent = `<h1>${title}</h1>\n${baseHtml}`;
        return generateHtmlArticle(title, articleContent);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${baseHtml}</div>`, 'text/html');
    const contentWrapper = doc.body.firstChild as HTMLElement;

    if (contentWrapper) {
        const insertionPoints = Array.from(contentWrapper.querySelectorAll('p, h2, h3, h4, ul, ol, blockquote, pre'));
        const placementsByIndex = new Map<number, typeof images>();
        const successfullyPlacedBodyImages = new Set<string>();

        // Map images to their insertion indices
        strategy.placements.forEach(p => {
            const imageFile = images.find(img => img.file.name === p.imageFilename);
            if (imageFile) {
                if (!placementsByIndex.has(p.afterParagraphIndex)) {
                    placementsByIndex.set(p.afterParagraphIndex, []);
                }
                placementsByIndex.get(p.afterParagraphIndex)?.push(imageFile);
            }
        });

        // Inject Body Images
        placementsByIndex.forEach((imagesToPlace, insertionIndex) => {
            if (insertionIndex >= 0 && insertionIndex < insertionPoints.length) {
                const anchorElement = insertionPoints[insertionIndex];
                imagesToPlace.reverse().forEach(img => {
                    const imgElement = doc.createElement('img');
                    imgElement.src = `data:${img.file.type};base64,${img.base64}`;
                    imgElement.alt = img.file.name;
                    imgElement.className = 'body-image';
                    anchorElement.after(imgElement);
                    successfullyPlacedBodyImages.add(img.file.name);
                });
            }
        });

        // Fallback for unplaced body images (append to end)
        strategy.placements.forEach(placement => {
            if (!successfullyPlacedBodyImages.has(placement.imageFilename)) {
                const imageFile = images.find(img => img.file.name === placement.imageFilename);
                if (imageFile) {
                    const imgElement = doc.createElement('img');
                    imgElement.src = `data:${imageFile.file.type};base64,${imageFile.base64}`;
                    imgElement.alt = imageFile.file.name;
                    imgElement.className = 'body-image';
                    contentWrapper.appendChild(imgElement);
                }
            }
        });

        // Inject Header Image
        const headerImage = images.find(img => img.file.name === strategy.headerImageFilename);
        if (headerImage) {
            const headerImgElement = doc.createElement('img');
            headerImgElement.src = `data:${headerImage.file.type};base64,${headerImage.base64}`;
            headerImgElement.alt = headerImage.file.name;
            headerImgElement.className = 'header-image';
            contentWrapper.prepend(headerImgElement);
        }

        const articleContent = `<h1>${title}</h1>\n${contentWrapper.innerHTML}`;
        return generateHtmlArticle(title, articleContent);
    }

    // Fallback if DOM parsing fails completely
    return generateHtmlArticle(title, `<h1>${title}</h1>\n${baseHtml}`);
}

/**
 * Phase 4: Injects the generated article title and content into a professional HTML template.
 * This is a reliable, synchronous operation that avoids a fallible API call.
 */
export function generateHtmlArticle(title: string, articleContent: string): string {
    // Replace placeholders in the template with the actual title and article content.
    return ARTICLE_TEMPLATE
        .replace('<!-- ARTICLE_TITLE_HERE -->', title)
        .replace('<!-- ARTICLE_CONTENT_HERE -->', articleContent);
}
