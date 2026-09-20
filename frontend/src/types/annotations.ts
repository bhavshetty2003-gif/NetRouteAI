export type ShapeType =
  | 'rect'
  | 'rounded-rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text';

export type DrawingTool = 'select' | ShapeType;

export interface AnnotationItem {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  endX?: number; // For line, arrow
  endY?: number; // For line, arrow
  fillColor: string;
  borderColor: string;
  borderWidth: number; // 1 to 10 px
  opacity: number; // 0.05 to 1.0
  rotation?: number; // degrees
  isLocked: boolean;
  groupId?: string | null;
  layerOrder: number;

  // Text specific properties
  text?: string;
  fontSize?: number;
  fontFamily?: 'sans' | 'mono' | 'serif';
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface DrawingPaletteSettings {
  activeTool: DrawingTool;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  opacity: number;
  fontSize: number;
  fontFamily: 'sans' | 'mono' | 'serif';
  textColor: string;
  textBgColor: string;
}

export const DEFAULT_PALETTE_COLORS = [
  '#06B6D4', // Cyan
  '#0284C7', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B', // Slate
  '#0F172A', // Dark Slate
  '#1E293B', // Border Slate
  '#38BDF8', // Light Blue
  'transparent', // Transparent
];

export const DEFAULT_DRAWING_SETTINGS: DrawingPaletteSettings = {
  activeTool: 'select',
  fillColor: '#0E7490',
  borderColor: '#06B6D4',
  borderWidth: 2,
  opacity: 0.25,
  fontSize: 14,
  fontFamily: 'sans',
  textColor: '#FFFFFF',
  textBgColor: 'transparent',
};

