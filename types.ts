
export interface ImageFile {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
}

export interface Placement {
  imageFilename: string;
  afterParagraphIndex: number;
}

export interface PlacementStrategy {
  headerImageFilename: string;
  placements: Placement[];
}
