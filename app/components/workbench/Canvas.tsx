import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { HexColorPicker } from 'react-colorful';
import html2canvas from 'html2canvas';
import { useStore } from '@nanostores/react';
import { chatId } from '~/lib/persistence/useChatHistory';
import { 
  saveCanvasToSupabase, 
  loadCanvasFromSupabase, 
  type CanvasData 
} from '~/lib/persistence/canvasSync';
import { useAuth } from '~/lib/hooks/useAuth';
import { createScopedLogger } from '~/utils/logger';

interface CanvasObject {
  id: string;
  type: 'note' | 'shape' | 'text' | 'image' | 'drawing' | 'frame';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  content?: string;
  color?: string;
  shape?: 'rectangle' | 'circle' | 'triangle';
  imageUrl?: string;
  zIndex: number;
  points?: { x: number; y: number }[];
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  fontSize?: number;
  penStyle?: {
    key: string;
    label: string;
    strokeWidth: number;
    dash: string;
    opacity: number;
    icon: JSX.Element;
  };
  framePreset?: string;
  label?: string;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  isList?: boolean;
}

interface CanvasState {
  objects: CanvasObject[];
  selectedObjects: Set<string>;
  viewport: {
    x: number;
    y: number;
    scale: number;
  };
  isDragging: boolean;
  isSelecting: boolean;
  selectionBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

const SHAPES = ['rectangle', 'circle', 'triangle'] as const;

const MIN_SIZE = 40;
const RESIZE_HANDLES = [
  { key: 'nw', cursor: 'nwse-resize' },
  { key: 'n', cursor: 'ns-resize' },
  { key: 'ne', cursor: 'nesw-resize' },
  { key: 'e', cursor: 'ew-resize' },
  { key: 'se', cursor: 'nwse-resize' },
  { key: 's', cursor: 'ns-resize' },
  { key: 'sw', cursor: 'nesw-resize' },
  { key: 'w', cursor: 'ew-resize' },
];

function getHandleStyle(key: string, w: number, h: number) {
  const s = 6; // offset for handle
  switch (key) {
    case 'nw': return { left: -s, top: -s };
    case 'n': return { left: w / 2 - s, top: -s };
    case 'ne': return { right: -s, top: -s };
    case 'e': return { right: -s, top: h / 2 - s };
    case 'se': return { right: -s, bottom: -s };
    case 's': return { left: w / 2 - s, bottom: -s };
    case 'sw': return { left: -s, bottom: -s };
    case 'w': return { left: -s, top: h / 2 - s };
    default: return {};
  }
}

function getSmoothPath(points: { x: number; y: number }[], scale: number, offsetX: number, offsetY: number) {
  if (points.length < 2) return '';
  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = (p.x - offsetX) * scale;
    const y = (p.y - offsetY) * scale;
    if (i === 0) {
      d = `M${x},${y}`;
    } else {
      // Catmull-Rom to Bezier conversion
      const p0 = points[i - 2] || points[0];
      const p1 = points[i - 1];
      const p2 = points[i];
      const p3 = points[i + 1] || p2;
      const c1x = (p1.x - offsetX) * scale + (p2.x - p0.x) * scale / 6;
      const c1y = (p1.y - offsetY) * scale + (p2.y - p0.y) * scale / 6;
      const c2x = (p2.x - offsetX) * scale - (p3.x - p1.x) * scale / 6;
      const c2y = (p2.y - offsetY) * scale - (p3.y - p1.y) * scale / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${x},${y}`;
    }
  }
  return d;
}

// 1. Interpolate points for even spacing
function interpolatePoints(points: { x: number; y: number }[], spacing = 2) {
  if (points.length < 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > spacing) {
      const steps = Math.floor(dist / spacing);
      for (let j = 1; j <= steps; j++) {
        result.push({
          x: prev.x + (dx * j) / (steps + 1),
          y: prev.y + (dy * j) / (steps + 1),
        });
      }
    }
    result.push(curr);
  }
  return result;
}

// 2. Chaikin's smoothing algorithm
function chaikinSmooth(points: { x: number; y: number }[], iterations = 2) {
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    if (pts.length < 3) return pts;
    const newPts = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      newPts.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      newPts.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    newPts.push(pts[pts.length - 1]);
    pts = newPts;
  }
  return pts;
}

// 3. In getSmoothPathCanvas, interpolate and smooth points
function getSmoothPathCanvas(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  const interpolated = interpolatePoints(points, 2);
  const smoothed = chaikinSmooth(interpolated, 2);
  let d = '';
  for (let i = 0; i < smoothed.length; i++) {
    const p = smoothed[i];
    if (i === 0) {
      d = `M${p.x},${p.y}`;
    } else {
      d += ` L${p.x},${p.y}`;
    }
  }
  return d;
}

const logger = createScopedLogger('Canvas');

export const Canvas = memo(() => {
  // Pen types and penStyle state must be at the top
  const PEN_TYPES = [
    { key: 'thin', label: 'Thin', strokeWidth: 2, dash: '', opacity: 1, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { key: 'medium', label: 'Medium', strokeWidth: 4, dash: '', opacity: 1, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg> },
    { key: 'thick', label: 'Thick', strokeWidth: 8, dash: '', opacity: 1, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="8" strokeLinecap="round" /></svg> },
    { key: 'dashed', label: 'Dashed', strokeWidth: 4, dash: '6,4', opacity: 1, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="4" strokeDasharray="6,4" strokeLinecap="round" /></svg> },
    { key: 'marker', label: 'Marker', strokeWidth: 8, dash: '', opacity: 0.5, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.5" /></svg> },
    { key: 'highlighter', label: 'Highlighter', strokeWidth: 12, dash: '', opacity: 0.3, icon: <svg width="20" height="20"><line x1="3" y1="10" x2="17" y2="10" stroke="yellow" strokeWidth="12" strokeLinecap="round" opacity="0.3" /></svg> },
  ];
  const [penStyle, setPenStyle] = useState(PEN_TYPES[0]);

  // Get current chat ID and auth user
  const currentChatId = useStore(chatId);
  const { user, isAuthenticated } = useAuth();

  const canvasRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<CanvasState>({
    objects: [],
    selectedObjects: new Set(),
    viewport: { x: 0, y: 0, scale: 1 },
    isDragging: false,
    isSelecting: false,
    selectionBox: null,
  });

  // Track if canvas has been loaded
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Undo/Redo functionality
  const [history, setHistory] = useState<CanvasState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<'select' | 'note' | 'shape' | 'text' | 'pen' | 'frame' | 'eraser'>('select');
  // 1. Set the initial default color to #00FFFF
  const [selectedColor, setSelectedColor] = useState('#014D4E');
  const [selectedShape, setSelectedShape] = useState<typeof SHAPES[number]>('rectangle');
  const [showGrid, setShowGrid] = useState(true);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add showTick state for save animation
  const [showTick, setShowTick] = useState(false);

  // --- Editing state for text/note ---
  const [resizeState, setResizeState] = useState<{
    objectId: string;
    handle: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
    originalPoints?: { x: number; y: number }[];
    originalX?: number;
    originalY?: number;
  } | null>(null);

  // Add image upload state and handler at the top of the component
  const imageInputRef = useRef<HTMLInputElement>(null);
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setState(prev => ({
        ...prev,
        objects: [
          ...prev.objects,
          {
            id: generateId(),
            type: 'image',
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            rotation: 0,
            imageUrl,
            color: selectedColor,
            zIndex: prev.objects.length,
          },
        ],
        selectedObjects: new Set(),
      }));
      setTool('select');
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be uploaded again
    e.target.value = '';
  };

  // Generate unique ID
  const generateId = () => `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Save to history for undo/redo
  const saveToHistory = useCallback((newState: CanvasState) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);
      // Limit history to last 50 states
      if (newHistory.length > 50) {
        newHistory.shift();
        return newHistory;
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setState(previousState);
      setHistoryIndex(prev => prev - 1);
    }
  }, [history, historyIndex]);

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setState(nextState);
      setHistoryIndex(prev => prev + 1);
    }
  }, [history, historyIndex]);

  // Add new object
  const addObject = useCallback((type: 'note' | 'shape' | 'text' | 'drawing', x: number, y: number) => {
    console.log('addObject called with:', { type, x, y });
    const newObject: CanvasObject = {
      id: generateId(),
      type,
      x: x,
      y: y,
      width: type === 'note' ? 200 : type === 'text' ? 150 : 100,
      height: type === 'note' ? 150 : type === 'text' ? 100 : 100,
      rotation: 0,
      content: type === 'note' ? 'Double click to edit' : type === 'text' ? 'Text' : '',
      color: selectedColor,
      shape: type === 'shape' ? selectedShape : undefined,
      zIndex: state.objects.length,
      points: type === 'drawing' ? [{ x: 0, y: 0 }] : undefined,
    };

    console.log('Created object:', newObject);
    setState(prev => {
      // Save to history
      saveToHistory(prev);
      const newState = {
        ...prev,
        objects: [...prev.objects, newObject],
        selectedObjects: new Set([newObject.id]),
      };
      console.log('New state objects count:', newState.objects.length);
      return newState;
    });
    setTool('select');
  }, [selectedColor, selectedShape, state.objects.length, saveToHistory]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Canvas clicked!', { tool, clientX: e.clientX, clientY: e.clientY });
    
    if (tool === 'select') {
      setState(prev => ({ ...prev, selectedObjects: new Set() }));
      return;
    }
    
    // Prevent adding a frame by clicking the canvas
    if (tool === 'frame') {
      return;
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    
    if (tool === 'pen') {
      console.log('Creating drawing object at:', { x, y });
      const newObject: CanvasObject = {
        id: generateId(),
        type: 'drawing',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        color: selectedColor,
        zIndex: state.objects.length,
        points: [{ x, y }],
        penStyle: penStyle, // Use the default pen style
      };
      setState(prev => ({
        ...prev,
        objects: [...prev.objects, newObject],
        selectedObjects: new Set([newObject.id]),
      }));
      setDrawingId(newObject.id);
    } else {
      console.log('Creating object at:', { x, y, tool });
      addObject(tool as 'note' | 'shape' | 'text', x, y);
    }
  }, [tool, addObject, state.viewport, selectedColor, state.objects.length, penStyle]);

  // Handle object selection
  const handleObjectClick = useCallback((e: React.MouseEvent, objectId: string) => {
    e.stopPropagation();

    if (tool === 'select') {
      setState(prev => {
        const newSelected = new Set(prev.selectedObjects);
        let newObjects = prev.objects;
        let maxZ = Math.max(0, ...prev.objects.map(o => o.zIndex || 0));
        if (e.shiftKey) {
          if (newSelected.has(objectId)) {
            newSelected.delete(objectId);
          } else {
            newSelected.add(objectId);
            // Bump zIndex for multi-select
            newObjects = prev.objects.map(obj =>
              newSelected.has(obj.id)
                ? { ...obj, zIndex: maxZ + 1 }
                : obj
            );
          }
        } else {
          newSelected.clear();
          newSelected.add(objectId);
          // Bump zIndex for single select
          newObjects = prev.objects.map(obj =>
            obj.id === objectId
              ? { ...obj, zIndex: maxZ + 1 }
              : obj
          );
        }
        return { ...prev, selectedObjects: newSelected, objects: newObjects };
      });
    }
  }, [tool]);

  // Handle object drag
  const handleObjectDrag = useCallback((objectId: string, _: any, info: PanInfo) => {
    setState(prev => {
      // If multiple objects are selected, move all of them
      const selectedObjects = Array.from(prev.selectedObjects);
      const isMultiSelect = selectedObjects.length > 1 && selectedObjects.includes(objectId);
      
      if (isMultiSelect) {
        // Calculate the delta to apply to all selected objects
        const dx = info.delta.x / prev.viewport.scale;
        const dy = info.delta.y / prev.viewport.scale;
        
        return {
          ...prev,
          objects: prev.objects.map(obj => {
            // If this object is selected, move it by the EXACT same delta (no type-specific adjustments)
            if (selectedObjects.includes(obj.id)) {
              if (obj.type === 'drawing') {
                // For drawings, update the points directly (don't move x,y separately)
                return {
                  ...obj,
                  points: (obj.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })),
                };
              }
              // For multi-select, ALL objects move with the same delta (no reduced sensitivity)
              return {
                ...obj,
                x: obj.x + dx,
                y: obj.y + dy,
              };
            }
            return obj;
          }),
        };
      }
      
      // Single object drag (original behavior)
      return {
        ...prev,
        objects: prev.objects.map(obj => {
          if (obj.id === objectId) {
            if (obj.type === 'drawing') {
              // For drawings, update the points directly (don't move x,y separately)
              const dx = info.delta.x / prev.viewport.scale;
              const dy = info.delta.y / prev.viewport.scale;
              return {
                ...obj,
                points: (obj.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })),
              };
            }
            // For note and text, reduce movement sensitivity
            if (obj.type === 'note' || obj.type === 'text') {
              const dx = (info.delta.x / prev.viewport.scale) * 0.5;
              const dy = (info.delta.y / prev.viewport.scale) * 0.5;
              return {
                ...obj,
                x: obj.x + dx,
                y: obj.y + dy,
              };
            }
            // Default move for other elements
            return {
              ...obj,
              x: obj.x + info.delta.x / prev.viewport.scale,
              y: obj.y + info.delta.y / prev.viewport.scale,
            };
          }
          return obj;
        }),
      };
    });
  }, []);

  // Handle canvas pan
  const handleCanvasPan = useCallback((_: any, info: PanInfo) => {
    setState(prev => ({
      ...prev,
      viewport: {
        ...prev.viewport,
        x: prev.viewport.x + info.delta.x,
        y: prev.viewport.y + info.delta.y,
      },
    }));
  }, []);

  // Handle mouse move for drawing
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tool === 'pen' && state.selectedObjects.size === 1) {
      const selectedId = Array.from(state.selectedObjects)[0];
      const selectedObject = state.objects.find(obj => obj.id === selectedId);
      
      if (selectedObject?.type === 'drawing') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
          const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
          
          setState(prev => ({
            ...prev,
            objects: prev.objects.map(obj =>
              obj.id === selectedId && obj.type === 'drawing'
                ? { ...obj, points: [...(obj.points || []), { x, y }] }
                : obj
            ),
          }));
        }
      }
    }
  }, [tool, state.selectedObjects, state.objects, state.viewport]);

  // Handle mouse up to finish drawing
  const handleMouseUp = useCallback(() => {
    if (tool === 'pen') {
      setState(prev => ({ ...prev, selectedObjects: new Set() }));
    }
  }, [tool]);

  // Handle zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Trackpad pinch-to-zoom (ctrlKey true): zoom
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, state.viewport.scale * delta));
      setState(prev => ({
        ...prev,
        viewport: { ...prev.viewport, scale: newScale },
      }));
      return;
    }
    // Trackpad two-finger pan (ctrlKey false): pan
    if (e.deltaX !== 0 || e.deltaY !== 0) {
      setState(prev => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          x: prev.viewport.x - e.deltaX,
          y: prev.viewport.y - e.deltaY,
        },
      }));
      return;
    }
    // Mouse wheel zoom (no ctrlKey, only deltaY)
    if (e.deltaY !== 0) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(3, state.viewport.scale * delta));
      setState(prev => ({
        ...prev,
        viewport: { ...prev.viewport, scale: newScale },
      }));
    }
  }, [state.viewport.scale]);

  // --- Panning logic ---
  // Mouse down on canvas (empty space)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool === 'select') {
      // Only pan if not clicking on an object
      if (e.target === canvasRef.current) {
        setIsPanning(true);
        setLastPanPosition({ x: e.clientX, y: e.clientY });
      }
    }
  }, [tool]);

  // Mouse move for panning
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning && lastPanPosition) {
      const dx = e.clientX - lastPanPosition.x;
      const dy = e.clientY - lastPanPosition.y;
      setState(prev => ({
        ...prev,
        viewport: {
          ...prev.viewport,
          x: prev.viewport.x + dx,
          y: prev.viewport.y + dy,
        },
      }));
      setLastPanPosition({ x: e.clientX, y: e.clientY });
    }
    // Existing pen drawing logic
    if (tool === 'pen' && state.selectedObjects.size === 1) {
      const selectedId = Array.from(state.selectedObjects)[0];
      const selectedObject = state.objects.find(obj => obj.id === selectedId);
      if (selectedObject?.type === 'drawing') {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
          const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
          setState(prev => ({
            ...prev,
            objects: prev.objects.map(obj =>
              obj.id === selectedId && obj.type === 'drawing'
                ? { ...obj, points: [...(obj.points || []), { x, y }] }
                : obj
            ),
          }));
        }
      }
    }
  }, [isPanning, lastPanPosition, tool, state.selectedObjects, state.objects, state.viewport]);

  // Mouse up: stop panning
  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPanPosition(null);
    if (tool === 'pen') {
      setState(prev => ({ ...prev, selectedObjects: new Set() }));
    }
  }, [tool]);

  // Pen tool: start drawing
  const handlePenMouseDown = useCallback((e: React.MouseEvent) => {
    if (tool !== 'pen') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    const newObject: CanvasObject = {
      id: generateId(),
      type: 'drawing',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      rotation: 0,
      color: selectedColor,
      zIndex: state.objects.length,
      points: [{ x, y }],
      penStyle,
    };
    setState(prev => ({
      ...prev,
      objects: [...prev.objects, newObject],
      // Do NOT set selectedObjects to the new pen drawing while drawing
      // selectedObjects: new Set([newObject.id]),
    }));
    setDrawingId(newObject.id);
    setIsDrawing(true);
  }, [tool, state.viewport, selectedColor, state.objects.length, penStyle]);

  // Pen tool: add points while drawing
  const handlePenMouseMove = useCallback((e: React.MouseEvent) => {
    if (tool !== 'pen' || !drawingId || !isDrawing) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    setState(prev => {
      return {
        ...prev,
        objects: prev.objects.map(obj => {
          if (obj.id === drawingId && obj.type === 'drawing') {
            const newPoints = [...(obj.points || []), { x, y }];
            // Calculate bounding box
            const xs = newPoints.map(p => p.x);
            const ys = newPoints.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            return {
              ...obj,
              points: newPoints,
              x: minX,
              y: minY,
              width: Math.max(1, maxX - minX),
              height: Math.max(1, maxY - minY),
            };
          }
          return obj;
        }),
      };
    });
  }, [tool, drawingId, isDrawing, state.viewport]);

  // Pen tool: finish drawing
  const handlePenMouseUp = useCallback(() => {
    if (tool === 'pen') {
      setDrawingId(null);
      setIsDrawing(false);
      // Do NOT setTool('select') here; keep pen active
    }
  }, [tool]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if not focused in input/textarea/contenteditable
      const active = document.activeElement;
      const isEditable =
        active &&
        ((active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') ||
          (active as HTMLElement).isContentEditable);
      
      if (isEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        setState(prev => {
          if (prev.selectedObjects.size > 0) {
            saveToHistory(prev);
            return {
              ...prev,
              objects: prev.objects.filter(obj => !prev.selectedObjects.has(obj.id)),
              selectedObjects: new Set(),
            };
          }
          return prev;
        });
      } else if (e.key === 'Escape') {
        setState(prev => ({ ...prev, selectedObjects: new Set() }));
      } else if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (e.key === 'z' && e.shiftKey || e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveToHistory]);

  // Auto-save canvas state changes to Supabase
  const saveCanvasData = useCallback(async () => {
    if (!currentChatId || !isAuthenticated || !canvasLoaded) {
      return;
    }

    try {
      const canvasData: CanvasData = {
        objects: state.objects,
        viewport: state.viewport
      };

      const result = await saveCanvasToSupabase(currentChatId, canvasData);
      if (!result.success) {
        logger.warn('Failed to save canvas:', result.error);
        // Don't show error toast for auto-save failures to avoid spam
      } else {
        logger.debug('Canvas auto-saved successfully');
      }
    } catch (error) {
      logger.error('Error auto-saving canvas:', error);
    }
  }, [currentChatId, isAuthenticated, state.objects, state.viewport, canvasLoaded]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!canvasLoaded) return;

    const timer = setTimeout(() => {
      saveCanvasData();
    }, 1000); // Save after 1 second of inactivity

    return () => clearTimeout(timer);
  }, [state.objects, state.viewport, saveCanvasData, canvasLoaded]);

  // Load canvas data when chat changes
  useEffect(() => {
    const loadCanvasData = async () => {
      if (!currentChatId || !isAuthenticated) {
        // Clear canvas if no chat or not authenticated
        setState(prev => ({
          ...prev,
          objects: [],
          viewport: { x: 0, y: 0, scale: 1 }
        }));
        setCanvasLoaded(true);
        return;
      }

      try {
        logger.info('Loading canvas for chat:', currentChatId);
        const result = await loadCanvasFromSupabase(currentChatId);
        
        if (result.success && result.data) {
          // Restore pen styles for drawing objects since they were cleaned for storage
          const restoredObjects = result.data.objects.map(obj => {
            if (obj.type === 'drawing' && obj.penStyle) {
              // Find the matching pen type to restore the icon
              const penType = PEN_TYPES.find(pt => pt.key === obj.penStyle?.key);
              if (penType) {
                obj.penStyle = penType;
              }
            }
            return obj;
          });

          setState(prev => ({
            ...prev,
            objects: restoredObjects,
            viewport: result.data!.viewport,
            selectedObjects: new Set()
          }));
          
          logger.info('Canvas loaded successfully:', { 
            chatId: currentChatId, 
            objectCount: restoredObjects.length 
          });
        } else {
          // Failed to load or no data - start with empty canvas
          setState(prev => ({
            ...prev,
            objects: [],
            viewport: { x: 0, y: 0, scale: 1 }
          }));
          
          if (result.error && !result.error.includes('No canvas data found')) {
            logger.warn('Failed to load canvas:', result.error);
          }
        }
      } catch (error) {
        logger.error('Error loading canvas:', error);
        // Start with empty canvas on error
        setState(prev => ({
          ...prev,
          objects: [],
          viewport: { x: 0, y: 0, scale: 1 }
        }));
      } finally {
        setCanvasLoaded(true);
      }
    };

    setCanvasLoaded(false);
    loadCanvasData();
  }, [currentChatId, isAuthenticated]);

  // Confirmation dialog state
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Clear all function with confirmation
  const clearAll = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  // Actual clear function after confirmation
  const confirmClearAll = useCallback(() => {
    saveToHistory(state);
    setState(prev => ({ ...prev, objects: [], selectedObjects: new Set<string>() }));
    setShowClearConfirm(false);
  }, [state, saveToHistory]);

  // Manual save function for export/save button
  const manualSave = useCallback(async () => {
    if (!currentChatId || !isAuthenticated) {
      toast.error('No active chat to save canvas to');
      return;
    }

    setIsSaving(true);
    try {
      const canvasData: CanvasData = {
        objects: state.objects,
        viewport: state.viewport
      };

      const result = await saveCanvasToSupabase(currentChatId, canvasData);
      if (result.success) {
        setShowTick(true);
        setTimeout(() => setShowTick(false), 2000); // Show tick for 2 seconds
      } else {
        toast.error(`Failed to save canvas: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error manually saving canvas:', error);
      toast.error('Failed to save canvas');
    } finally {
      setIsSaving(false);
    }
  }, [currentChatId, isAuthenticated, state.objects, state.viewport]);

  // Resize mouse down
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    objectId: string,
    handle: string,
    object: CanvasObject
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeState({
      objectId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: object.width,
      startHeight: object.height,
      startLeft: object.x,
      startTop: object.y,
      // For pen drawings, store original points and bounding box
      originalPoints: object.type === 'drawing' ? [...(object.points || [])] : undefined,
      originalX: object.type === 'drawing' ? object.x : undefined,
      originalY: object.type === 'drawing' ? object.y : undefined,
    });
  };

  // Resize mouse move
  useEffect(() => {
    if (!resizeState) return;
    const onMouseMove = (e: MouseEvent) => {
      setState(prev => {
        const objects = prev.objects.map(obj => {
          if (obj.id !== resizeState.objectId) return obj;
          let dx = (e.clientX - resizeState.startX) / prev.viewport.scale;
          let dy = (e.clientY - resizeState.startY) / prev.viewport.scale;
          let newWidth = resizeState.startWidth;
          let newHeight = resizeState.startHeight;
          let newX = resizeState.startLeft;
          let newY = resizeState.startTop;
          switch (resizeState.handle) {
            case 'nw':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight - dy);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              newY = resizeState.startTop + (resizeState.startHeight - newHeight);
              break;
            case 'n':
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight - dy);
              newY = resizeState.startTop + (resizeState.startHeight - newHeight);
              break;
            case 'ne':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth + dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight - dy);
              newY = resizeState.startTop + (resizeState.startHeight - newHeight);
              break;
            case 'e':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth + dx);
              break;
            case 'se':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth + dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight + dy);
              break;
            case 's':
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight + dy);
              break;
            case 'sw':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight + dy);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              break;
            case 'w':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              break;
            case 'nw':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight - dy);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              newY = resizeState.startTop + (resizeState.startHeight - newHeight);
              break;
            case 'ne':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth + dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight - dy);
              newY = resizeState.startTop + (resizeState.startHeight - newHeight);
              break;
            case 'se':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth + dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight + dy);
              break;
            case 'sw':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newHeight = Math.max(MIN_SIZE, resizeState.startHeight + dy);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              break;
            case 'w':
              newWidth = Math.max(MIN_SIZE, resizeState.startWidth - dx);
              newX = resizeState.startLeft + (resizeState.startWidth - newWidth);
              break;
          }
          // If pen drawing, scale all points
          if (
            obj.type === 'drawing' &&
            resizeState.originalPoints &&
            resizeState.originalX !== undefined &&
            resizeState.originalY !== undefined
          ) {
            const scaleX = newWidth / resizeState.startWidth;
            const scaleY = newHeight / resizeState.startHeight;
            const scaledPoints = resizeState.originalPoints.map(p => ({
              x: newX + (p.x - resizeState.originalX!) * scaleX,
              y: newY + (p.y - resizeState.originalY!) * scaleY,
            }));
            return {
              ...obj,
              points: scaledPoints,
              x: newX,
              y: newY,
              width: newWidth,
              height: newHeight,
            };
          }
          // Default (non-pen) resize
          return {
            ...obj,
            width: newWidth,
            height: newHeight,
            x: newX,
            y: newY,
          };
        });
        return { ...prev, objects };
      });
    };
    const onMouseUp = () => setResizeState(null);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizeState]);

  // 1. Use pointer events for pen drawing
  // 2. Render all pen strokes in a single, full-canvas SVG layer
  // 3. All points are in canvas coordinates
  // 4. Apply viewport offset to the SVG group
  // 5. Use smoothing for the path
  // 6. Remove per-stroke SVG containers for pen drawings

  // At the top of the component:
  const [isPointerDown, setIsPointerDown] = useState(false);
  // 1. Use a ref for in-progress pen points
  const penPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [currentStroke, setCurrentStroke] = useState<{ points: { x: number; y: number }[]; penStyle: any; color: string } | null>(null);
  const [rafId, setRafId] = useState<number | null>(null);

  // Pointer event handlers for pen
  const handlePointerDown = (e: React.PointerEvent) => {
    if (tool !== 'pen') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    setIsPointerDown(true);
    penPointsRef.current = [{ x, y }];
    setCurrentStroke({ points: [{ x, y }], penStyle, color: selectedColor });
  };

  const updateCurrentStroke = useCallback(() => {
    setCurrentStroke(stroke => stroke ? { ...stroke, points: [...penPointsRef.current] } : null);
  }, []);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPointerDown || tool !== 'pen') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    penPointsRef.current.push({ x, y });
    if (!rafId) {
      setRafId(requestAnimationFrame(() => {
        updateCurrentStroke();
        setRafId(null);
      }));
    }
  };

  const handlePointerUp = () => {
    if (tool === 'pen' && currentStroke && penPointsRef.current.length > 1) {
      setState(prev => ({
        ...prev,
        objects: [
          ...prev.objects,
          {
            id: generateId(),
            type: 'drawing',
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            color: currentStroke.color,
            zIndex: prev.objects.length,
            points: [...penPointsRef.current],
            penStyle: currentStroke.penStyle,
          },
        ],
      }));
    }
    setIsPointerDown(false);
    setCurrentStroke(null);
    penPointsRef.current = [];
    if (rafId) {
      cancelAnimationFrame(rafId);
      setRafId(null);
    }
  };

  // Helper for smoothing (Catmull-Rom to Bezier)
  function getSmoothPathCanvas(points: { x: number; y: number }[]) {
    if (points.length < 2) return '';
    let d = '';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === 0) {
        d = `M${p.x},${p.y}`;
      } else {
        const p0 = points[i - 2] || points[0];
        const p1 = points[i - 1];
        const p2 = points[i];
        const p3 = points[i + 1] || p2;
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
      }
    }
    return d;
  }

  // Add state for editing text box height, ref, and position
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextBoxHeight, setEditingTextBoxHeight] = useState<number>(0);
  const [editingTextBoxRect, setEditingTextBoxRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const editingTextBoxRef = useRef<HTMLDivElement>(null);

  // Find the editing text object (move this up before any usage)
  const editingTextObject = editingTextId ? state.objects.find(obj => obj.id === editingTextId) : null;
  // Calculate toolbar position in canvas coordinates
  let toolbarStyle: React.CSSProperties = { display: 'none' };
  if (editingTextObject && editingTextBoxRect) {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const leftToolbarWidth = 72;
    const topToolbarHeight = 72;
    const rightToolbarWidth = 72;
    const bottomToolbarHeight = 72;
    const toolbarMargin = 32;
    if (canvasRect) {
      const toolbarMinWidth = 260;
      const toolbarHeight = 56;
      let left = editingTextBoxRect.x - canvasRect.x + editingTextBoxRect.width / 2;
      let top = editingTextBoxRect.y - canvasRect.y - 100;
      // Always use toolbarMinWidth for clamping to avoid double movement
      let toolbarWidth = toolbarMinWidth;
      let toolbarLeft = left - toolbarWidth / 2;
      // Clamp so the toolbar never overlaps left or right toolbars
      toolbarLeft = Math.max(toolbarLeft, leftToolbarWidth + toolbarMargin);
      toolbarLeft = Math.min(toolbarLeft, canvasRect.width - rightToolbarWidth - toolbarWidth - toolbarMargin);
      if (top < topToolbarHeight + toolbarMargin) {
        top = editingTextBoxRect.y - canvasRect.y + editingTextBoxRect.height + 12;
        if (top + toolbarHeight > canvasRect.height - bottomToolbarHeight - toolbarMargin) {
          top = canvasRect.height - bottomToolbarHeight - toolbarHeight - toolbarMargin;
        }
      }
      toolbarStyle = {
        position: 'absolute',
        left: toolbarLeft,
        top,
        zIndex: 9999,
        minWidth: toolbarMinWidth,
        pointerEvents: 'auto',
      };
    }
  }

  // Effect to update height and position when editing text changes
  useEffect(() => {
    if (editingTextId && editingTextBoxRef.current) {
      setEditingTextBoxHeight(editingTextBoxRef.current.offsetHeight);
      const rect = editingTextBoxRef.current.getBoundingClientRect();
      setEditingTextBoxRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setEditingTextBoxRect(null);
    }
  }, [
    editingTextId,
    state.objects,
    state.objects.find(obj => obj.id === editingTextId)?.fontSize,
    state.viewport.x,
    state.viewport.y,
    state.viewport.scale
  ]);

  // Render object
  const renderObject = ({ object }: { object: CanvasObject }) => {
    const isEraserActive = tool === 'eraser';
    const isSelected = state.selectedObjects.has(object.id);
    
    const objectStyle = {
      position: 'absolute' as const,
      left: object.x * state.viewport.scale + state.viewport.x,
      top: object.y * state.viewport.scale + state.viewport.y,
      width: object.width * state.viewport.scale,
      height: object.height * state.viewport.scale,
      transform: `rotate(${object.rotation}deg)`,
      zIndex: object.zIndex,
    };

    const baseClasses = classNames(
      'absolute cursor-move select-none',
      isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
    );

    // At the top of renderObject:
    const isPenActive = tool === 'pen';

    switch (object.type) {
      case 'note':
        const isEditing = editingId === object.id;
        return (
          <motion.div
            key={object.id}
            className={classNames(
              baseClasses,
              isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
            )}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive && !isEditing}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive && !isEditing ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            <div
              className="w-full h-full p-3 rounded-lg shadow-lg resize"
              style={{ backgroundColor: object.color || '#00FFFF' }}
            >
              {isEditing ? (
                <textarea
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-white placeholder-white/70"
                  value={object.content || ''}
                  placeholder="Type your note..."
                  onChange={e => {
                    const newValue = e.target.value;
                    setState(prev => ({
                      ...prev,
                      objects: prev.objects.map(obj =>
                        obj.id === object.id ? { ...obj, content: newValue } : obj
                      ),
                    }));
                  }}
                  onFocus={() => setEditingId(object.id)}
                  onBlur={() => setEditingId(null)}
                  onClick={e => e.stopPropagation()}
                  rows={3}
                />
              ) : (
                <div
                  className="w-full h-full bg-transparent border-none outline-none resize-none text-white placeholder-white/70 cursor-text"
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflow: 'auto',
                    height: '100%',
                    maxHeight: '100%',
                  }}
                  onClick={() => setEditingId(object.id)}
                >
                  {object.content || <span className="opacity-50">Type your note...</span>}
                </div>
              )}
            </div>
            {isSelected && tool === 'select' && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      case 'shape':
        return (
          <motion.div
            key={object.id}
            className={baseClasses}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            <div
              className="w-full h-full shadow-lg"
              style={{
                backgroundColor: object.color,
                borderRadius: object.shape === 'circle' ? '50%' : object.shape === 'triangle' ? '0' : '8px',
                clipPath: object.shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
              }}
            />
            {isSelected && tool === 'select' && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      case 'text':
        const isEditingText = editingTextId === object.id;
        return (
          <motion.div
            key={object.id}
            className={classNames(
              baseClasses,
              isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
            )}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive && !isEditingText}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive && !isEditingText ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            <div className="w-full h-full p-2 relative" ref={isEditingText ? editingTextBoxRef : undefined}>
              {/* Render as list if isList is true */}
              {object.isList ? (
                <ul
                  style={{
                    width: '100%',
                    height: '100%',
                    fontWeight: object.fontWeight || 'normal',
                    fontStyle: object.fontStyle || 'normal',
                    textDecoration: object.textDecoration || 'none',
                    fontSize: object.fontSize || 16,
                    color: object.textColor || 'var(--canvas-textbox-color)',
                    textAlign: object.textAlign || 'left',
                    paddingLeft: 20,
                  }}
                  className="bg-transparent border-none outline-none text-lg font-medium list-disc"
                  onClick={() => setEditingTextId(object.id)}
                >
                  {(object.content || '').split('\n').map((line, idx) => (
                    <li key={idx} style={{ minHeight: 20 }}>
                      {line || <span style={{ opacity: 0.5 }}>[Empty]</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <textarea
                  style={{
                    width: '100%',
                    height: '100%',
                    fontWeight: object.fontWeight || 'normal',
                    fontStyle: object.fontStyle || 'normal',
                    textDecoration: object.textDecoration || 'none',
                    fontSize: object.fontSize || 16,
                    color: object.textColor || 'var(--canvas-textbox-color)',
                    textAlign: object.textAlign || 'left',
                    resize: 'none',
                    background: 'transparent',
                  }}
                  className="bg-transparent border-none outline-none text-lg font-medium"
                  value={object.content || ''}
                  placeholder="Type your text..."
                  onChange={e => {
                    const newValue = e.target.value;
                    setState(prev => ({
                      ...prev,
                      objects: prev.objects.map(obj =>
                        obj.id === object.id ? { ...obj, content: newValue } : obj
                      ),
                    }));
                  }}
                  onFocus={() => {
                    setEditingTextId(object.id);
                    setState(prev => {
                      const maxZ = Math.max(0, ...prev.objects.map(o => o.zIndex || 0));
                      return {
                        ...prev,
                        objects: prev.objects.map(obj =>
                          obj.id === object.id ? { ...obj, zIndex: maxZ + 1 } : obj
                        ),
                      };
                    });
                  }}
                  onBlur={() => setEditingTextId(null)}
                  rows={2}
                />
              )}
            </div>
            {isSelected && tool === 'select' && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      case 'drawing':
        // Offset points by (-object.x, -object.y) so they fit in the SVG
        const isDrawingThis = drawingId === object.id;
        // const smoothPath = getSmoothPath(object.points || [], state.viewport.scale, object.x, object.y);
        return (
          <motion.div
            key={object.id}
            className={classNames(baseClasses, isSelected && !isDrawingThis ? 'ring-2 ring-blue-500 ring-offset-2' : '')}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            {/* Do NOT render the SVG path here; it's rendered in the main SVG layer */}
            {isSelected && tool === 'select' && !isDrawingThis && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      case 'image':
        return (
          <motion.div
            key={object.id}
            className={baseClasses}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            <img
              src={object.imageUrl}
              alt="Canvas Upload"
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }}
              draggable={false}
            />
            {isSelected && tool === 'select' && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      case 'frame':
        const preset = FRAME_PRESETS.find(p => p.key === object.framePreset);
        // Clone the SVG and force width/height to 100%
        let frameSVG = null;
        if (preset?.svg) {
          frameSVG = React.cloneElement(preset.svg, { width: '100%', height: '100%', style: { display: 'block' } });
        }
        const isEditingLabel = editingFrameLabelId === object.id;
        return (
          <motion.div
            key={object.id}
            className={classNames(
              baseClasses,
              isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
            )}
            style={{ ...objectStyle, cursor: 'inherit' }}
            drag={!isEraserActive && !isPenActive}
            dragMomentum={false}
            onDrag={!isEraserActive && !isPenActive ? ((_, info) => handleObjectDrag(object.id, _, info)) : undefined}
            onClick={!isEraserActive && !isPenActive ? (e => handleObjectClick(e, object.id)) : undefined}
          >
            {/* Frame label above top-left corner, editable if selected */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: -42,
              fontSize: 18,
              color: '#888',
              background: 'none',
              fontWeight: 500,
              pointerEvents: 'auto',
              userSelect: 'auto',
              minWidth: 60,
            }}>
              {isSelected ? (
                isEditingLabel ? (
                  <input
                    type="text"
                    value={object.label}
                    style={{
                      fontSize: 18,
                      color: '#888',
                      fontWeight: 400,
                      background: '#f7f7f7',
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      padding: '2px 6px',
                      minWidth: 60,
                    }}
                    autoFocus
                    onChange={e => {
                      const newValue = e.target.value;
                      setState(prev => ({
                        ...prev,
                        objects: prev.objects.map(obj =>
                          obj.id === object.id ? { ...obj, label: newValue } : obj
                        ),
                      }));
                    }}
                    onBlur={() => setEditingFrameLabelId(null)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setEditingFrameLabelId(null);
                    }}
                  />
                ) : (
                  <span
                    style={{ cursor: 'pointer', color: '#888' }}
                    onClick={e => {
                      e.stopPropagation();
                      setEditingFrameLabelId(object.id);
                    }}
                  >{object.label}</span>
                )
              ) : (
                <span style={{ color: '#888' }}>{object.label}</span>
              )}
            </div>
            {/* Render SVG directly, always fill frame */}
            {frameSVG}
            {isSelected && tool === 'select' && (
              <>
                {RESIZE_HANDLES.map(h => (
                  <div
                    key={h.key}
                    style={{
                      position: 'absolute',
                      ...getHandleStyle(h.key, object.width * state.viewport.scale, object.height * state.viewport.scale),
                      cursor: h.cursor,
                      zIndex: 10,
                    }}
                    onMouseDown={e => handleResizeMouseDown(e, object.id, h.key, object)}
                  >
                    <div style={{
                      width: 12,
                      height: 12,
                      background: '#fff',
                      border: '2px solid #2563eb',
                      borderRadius: 3,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }} />
                  </div>
                ))}
              </>
            )}
          </motion.div>
        );

      default:
        return null;
    }
  };

  // 3. Memoize the SVG path for each pen stroke
  const getMemoizedSmoothPath = (points: { x: number; y: number }[]) =>
    useMemo(() => getSmoothPathCanvas(points), [points]);

  // Modern color picker state
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const COLOR_SWATCHES = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  const colorButtonRef = useRef<HTMLButtonElement>(null);

  // Export handler (cleaned up)
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    if (!canvasRef.current || isExporting) return;
    setIsExporting(true);
    // Determine background color based on current theme
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const backgroundColor = isDarkMode ? '#1a1a1a' : '#ffffff';
    // Temporarily hide grid for export
    const originalShowGrid = showGrid;
    setShowGrid(false);
    // Wait for the next animation frame to ensure grid is hidden
    await new Promise(requestAnimationFrame);
    const canvas = await html2canvas(canvasRef.current, {
      backgroundColor: backgroundColor,
      useCORS: true,
      scale: 2,
    });
    setShowGrid(originalShowGrid);
    setIsExporting(false);
    const link = document.createElement('a');
    link.download = 'canvas-export.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Replace individual subtoolbar states with a single activeSubToolbar state
  const [activeSubToolbar, setActiveSubToolbar] = useState<'pen' | 'shape' | 'frame' | 'color' | null>(null);

  // Helper function to close all subtoolbars
  const closeAllSubToolbars = () => {
    setActiveSubToolbar(null);
  };

  // Helper function to open a specific subtoolbar (closing others)
  const openSubToolbar = (toolbar: 'pen' | 'shape' | 'frame' | 'color') => {
    setActiveSubToolbar(activeSubToolbar === toolbar ? null : toolbar);
  };

  // Close subtoolbars when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!activeSubToolbar || !event.target) return;
      
      const target = event.target as Element;
      const isToolbarClick = target.closest('[data-subtoolbar]');
      const isColorPickerClick = target.closest('[data-color-picker]');
      const isSubToolbarContent = target.closest('[data-subtoolbar-content]');
      
      // Don't close if clicking on toolbar buttons or subtoolbar content
      if (isToolbarClick || isColorPickerClick || isSubToolbarContent) {
        return;
      }
      
      closeAllSubToolbars();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeSubToolbar]);

  // Frame presets
  const FRAME_PRESETS = [
    {
      key: 'iphone',
      label: 'iOS',
      width: 117,
      height: 253,
      aspect: 117 / 253,
      svg: (
        <svg width="100%" height="100%" viewBox="0 0 117 253" fill="none" preserveAspectRatio="none">
          <g filter="url(#frameShadow)">
            <rect x="0" y="0" width="117" height="253" rx="16" fill="#fff" stroke="#888" strokeWidth="4" />
          </g>
          <rect x="38" y="6" width="41" height="8" rx="4" fill="#222" /> {/* Notch */}
          <defs>
            <filter id="frameShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.10" />
            </filter>
          </defs>
        </svg>
      ),
      preview: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="4" width="24" height="24" rx="6" fill="#fff" stroke="#bbb" strokeWidth="2" />
          <rect x="12" y="6" width="8" height="3" rx="1.5" fill="#bbb" />
        </svg>
      ),
    },
    {
      key: 'samsung',
      label: 'Android',
      width: 117,
      height: 253,
      aspect: 117 / 253,
      svg: (
        <svg width="100%" height="100%" viewBox="0 0 117 253" fill="none" preserveAspectRatio="none">
          <g filter="url(#frameShadow)">
            <rect x="0" y="0" width="117" height="253" rx="16" fill="#fff" stroke="#888" strokeWidth="4" />
          </g>
          <circle cx="58.5" cy="10" r="3" fill="#222" /> {/* Punchhole */}
          <defs>
            <filter id="frameShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.10" />
            </filter>
          </defs>
        </svg>
      ),
      preview: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="4" width="24" height="24" rx="6" fill="#fff" stroke="#bbb" strokeWidth="2" />
          <circle cx="16" cy="8" r="2" fill="#bbb" />
        </svg>
      ),
    },
    {
      key: 'ipad',
      label: 'Tablet',
      width: 180,
      height: 240,
      aspect: 180 / 240,
      svg: (
        <svg width="100%" height="100%" viewBox="0 0 180 240" fill="none" preserveAspectRatio="none">
          <g filter="url(#frameShadow)">
            <rect x="0" y="0" width="180" height="240" rx="12" fill="#fff" stroke="#888" strokeWidth="4" />
          </g>
          <defs>
            <filter id="frameShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.10" />
            </filter>
          </defs>
        </svg>
      ),
      preview: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="5" y="7" width="22" height="18" rx="4" fill="#fff" stroke="#bbb" strokeWidth="2" />
        </svg>
      ),
    },
    {
      key: 'macbook',
      label: 'Laptop',
      width: 320,
      height: 200,
      aspect: 320 / 200,
      svg: (
        <svg width="100%" height="100%" viewBox="0 0 320 200" fill="none" preserveAspectRatio="none">
          <g filter="url(#frameShadow)">
            <rect x="0" y="0" width="320" height="200" rx="10" fill="#fff" stroke="#888" strokeWidth="4" />
          </g>
          <rect x="150" y="6" width="20" height="6" rx="3" fill="#222" /> {/* Camera notch */}
          <defs>
            <filter id="frameShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.10" />
            </filter>
          </defs>
        </svg>
      ),
      preview: (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="6" y="10" width="20" height="10" rx="3" fill="#fff" stroke="#bbb" strokeWidth="2" />
          <rect x="10" y="8" width="12" height="2" rx="1" fill="#bbb" />
        </svg>
      ),
    },
    { key: 'a4', label: 'A4', width: 148, height: 210, aspect: 148 / 210, svg: <svg width="100%" height="100%" viewBox="0 0 148 210" preserveAspectRatio="none"><rect x="0" y="0" width="148" height="210" rx="8" fill="#fff" /></svg>, preview: (<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="7" y="4" width="18" height="24" rx="2" fill="#fff" stroke="#bbb" strokeWidth="1.5" /></svg>) },
    { key: 'letter', label: 'Letter', width: 216, height: 279, aspect: 216 / 279, svg: <svg width="100%" height="100%" viewBox="0 0 216 279" preserveAspectRatio="none"><rect x="0" y="0" width="216" height="279" rx="8" fill="#fff" /></svg>, preview: (<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="6" y="3" width="20" height="26" rx="2" fill="#fff" stroke="#bbb" strokeWidth="1.5" /></svg>) },
    { key: '16-9', label: '16:9', width: 160, height: 90, aspect: 16 / 9, svg: <svg width="100%" height="100%" viewBox="0 0 160 90" preserveAspectRatio="none"><rect x="0" y="0" width="160" height="90" rx="8" fill="#fff" /></svg>, preview: (<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="5" y="10" width="22" height="12" rx="2" fill="#fff" stroke="#bbb" strokeWidth="1.5" /></svg>) },
    { key: '4-3', label: '4:3', width: 160, height: 120, aspect: 4 / 3, svg: <svg width="100%" height="100%" viewBox="0 0 160 120" preserveAspectRatio="none"><rect x="0" y="0" width="160" height="120" rx="8" fill="#fff" /></svg>, preview: (<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="6" y="8" width="20" height="16" rx="2" fill="#fff" stroke="#bbb" strokeWidth="1.5" /></svg>) },
    { key: '1-1', label: '1:1', width: 120, height: 120, aspect: 1, svg: <svg width="100%" height="100%" viewBox="0 0 120 120" preserveAspectRatio="none"><rect x="0" y="0" width="120" height="120" rx="8" fill="#fff" /></svg>, preview: (<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="8" y="8" width="16" height="16" rx="2" fill="#fff" stroke="#bbb" strokeWidth="1.5" /></svg>) },
  ];

  // Frame label editing state
  const [editingFrameLabelId, setEditingFrameLabelId] = useState<string | null>(null);

  // Eraser functionality
  const eraserRadius = 12;
  const isErasing = useRef(false);

  const handleEraserPointerDown = (e: React.PointerEvent) => {
    isErasing.current = true;
    eraseAtPointer(e);
  };
  const handleEraserPointerMove = (e: React.PointerEvent) => {
    if (!isErasing.current) return;
    eraseAtPointer(e);
  };
  const handleEraserPointerUp = () => {
    isErasing.current = false;
  };
  function eraseAtPointer(e: React.PointerEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - state.viewport.x) / state.viewport.scale;
    const y = (e.clientY - rect.top - state.viewport.y) / state.viewport.scale;
    setState(prev => ({
      ...prev,
      objects: prev.objects.filter(obj => {
        if (obj.type !== 'drawing' || !obj.points) return true;
        // If any point is within eraserRadius, erase this drawing
        return !obj.points.some((p: { x: number; y: number }) => ((p.x - x) ** 2 + (p.y - y) ** 2) < eraserRadius * eraserRadius);
      }),
    }));
  }

  // Detect dark mode for grid color (SSR-safe)
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    setIsDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);
  const gridLineColor = 'var(--canvas-grid-color)';
  const gridBackgroundImage = showGrid
    ? `linear-gradient(${gridLineColor} 1px, transparent 1px), linear-gradient(90deg, ${gridLineColor} 1px, transparent 1px)`
    : 'none';

  // In the main toolbar, add the Frame icon and toggle logic
  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Left Vertical Toolbar - Combined */}
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-[200] drop-shadow-lg">
        <div className="flex flex-col items-center gap-4 relative">
          {/* Main Tools Container */}
          <div className="flex flex-col items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-xl p-4 relative">
            {/* Select tool */}
            <button
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors',
                tool === 'select' ? 'active' : undefined,
                tool === 'select' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => setTool('select')}
              title="Select"
            >
              <div className="i-ph:cursor text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Pen tool */}
            <button
              data-subtoolbar
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors relative',
                tool === 'pen' ? 'active' : undefined,
                tool === 'pen' ? 'bg-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => {
                if (tool === 'pen') {
                  openSubToolbar('pen');
                } else {
                  setTool('pen');
                  openSubToolbar('pen');
                }
              }}
              title="Pen"
            >
              <div className="i-ph:pen-nib text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Note tool */}
            <button
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors',
                tool === 'note' ? 'active' : undefined,
                tool === 'note' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => setTool('note')}
              title="Note"
            >
              <div className="i-ph:note text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Shape tool */}
            <button
              data-subtoolbar
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors relative',
                tool === 'shape' ? 'active' : undefined,
                tool === 'shape' ? 'bg-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => {
                if (tool === 'shape') {
                  openSubToolbar('shape');
                } else {
                  setTool('shape');
                  openSubToolbar('shape');
                }
              }}
              title="Shape"
            >
              <div className="i-ph:square text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Text tool */}
            <button
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors',
                tool === 'text' ? 'active' : undefined,
                tool === 'text' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => setTool('text')}
              title="Text"
            >
              <div className="i-ph:text-t text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Upload Image button */}
            <button
              className="toolbar-btn p-3 rounded-md transition-colors hover:bg-gray-200 dark:hover:bg-gray-600"
              title="Upload Image"
              onClick={() => imageInputRef.current?.click()}
            >
              <div className="i-ph:image text-xl" style={{ color: 'inherit' }} />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
            </button>
            {/* Frame tool */}
            <button
              data-subtoolbar
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors relative',
                tool === 'frame' ? 'active' : undefined,
                tool === 'frame' ? 'bg-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => {
                if (tool === 'frame') {
                  openSubToolbar('frame');
                } else {
                  setTool('frame');
                  openSubToolbar('frame');
                }
              }}
              title="Frame"
            >
              <div className="i-ph:frame-corners text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Eraser tool */}
            <button
              className={classNames(
                'toolbar-btn p-3 rounded-md transition-colors',
                tool === 'eraser' ? 'active' : undefined,
                tool === 'eraser' ? 'bg-blue-100' : 'hover:bg-gray-200 dark:hover:bg-gray-600'
              )}
              onClick={() => setTool('eraser')}
              title="Eraser"
            >
              <div className="i-ph:eraser text-xl" style={{ color: 'inherit' }} />
            </button>
            {/* Color picker */}
            <div className="relative">
              <button
                ref={colorButtonRef}
                data-color-picker
                className="w-8 h-8 rounded-full border-2 border-gray-300 flex items-center justify-center shadow-sm hover:shadow-md transition-all mt-2"
                style={{ background: (() => {
                  if (state.selectedObjects.size === 1) {
                    const selectedId = Array.from(state.selectedObjects)[0];
                    const selectedObj = state.objects.find(obj => obj.id === selectedId);
                    return selectedObj?.color || selectedColor;
                  }
                  return selectedColor;
                })() }}
                title="Pick a color"
                onClick={() => openSubToolbar('color')}
              >
                <span className="sr-only">Pick a color</span>
              </button>
              {activeSubToolbar === 'color' && (
                <div
                  data-color-picker
                  data-subtoolbar-content
                  className="subtoolbar-panel absolute left-full ml-2 p-3 z-50 min-w-[200px] bg-gray-100 dark:bg-gray-700 rounded-xl shadow-lg"
                  style={{ minWidth: 200, marginLeft: 30, marginTop: -190 }}
                  onMouseLeave={() => closeAllSubToolbars()}
                >
                  <HexColorPicker
                    color={(() => {
                      if (state.selectedObjects.size === 1) {
                        const selectedId = Array.from(state.selectedObjects)[0];
                        const selectedObj = state.objects.find(obj => obj.id === selectedId);
                        return selectedObj?.color || selectedColor;
                      }
                      return selectedColor;
                    })()}
                    onChange={newColor => {
                      // Always update the selected color for the current tool
                      setSelectedColor(newColor);
                      
                      // If an object is selected, update its color
                      if (state.selectedObjects.size === 1) {
                        const selectedId = Array.from(state.selectedObjects)[0];
                        setState(prev => ({
                          ...prev,
                          objects: prev.objects.map(obj => {
                            if (obj.id === selectedId) {
                              if (obj.type === 'text') {
                                return { ...obj, textColor: newColor };
                              }
                              return { ...obj, color: newColor };
                            }
                            return obj;
                          }),
                        }));
                      }
                    }}
                    style={{ width: 180, height: 180 }}
                  />
                </div>
              )}
            </div>

            {/* Subtoolbars positioned relative to the toolbar container */}
            {activeSubToolbar === 'shape' && tool === 'shape' && (
              <div
                data-subtoolbar
                data-subtoolbar-content
                className="absolute bg-gray-100 dark:bg-gray-700 rounded-xl p-3 shadow-lg z-[60]"
                style={{
                  left: 'calc(100% + 12px)',
                  top: '20%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 60,
                }}
              >
                <span className="text-xs text-gray-500 mb-1">Shape</span>
                <button
                  className={classNames('toolbar-btn p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-600', selectedShape === 'rectangle' ? 'active bg-blue-100' : '')}
                  onClick={() => { setSelectedShape('rectangle'); setTool('shape'); }}
                  title="Rectangle"
                >
                  <svg width="24" height="24" viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
                <button
                  className={classNames('toolbar-btn p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-600', selectedShape === 'circle' ? 'active bg-blue-100' : '')}
                  onClick={() => { setSelectedShape('circle'); setTool('shape'); }}
                  title="Circle"
                >
                  <svg width="24" height="24" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
                <button
                  className={classNames('toolbar-btn p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-600', selectedShape === 'triangle' ? 'active bg-blue-100' : '')}
                  onClick={() => { setSelectedShape('triangle'); setTool('shape'); }}
                  title="Triangle"
                >
                  <svg width="24" height="24" viewBox="0 0 20 20"><polygon points="10,4 17,16 3,16" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
              </div>
            )}
            {activeSubToolbar === 'pen' && tool === 'pen' && (
              <div
                data-subtoolbar
                data-subtoolbar-content
                className="absolute bg-gray-100 dark:bg-gray-700 rounded-xl p-3 shadow-lg z-[60]"
                style={{
                  left: 'calc(100% + 12px)',
                  top: '15%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 60,
                }}
              >
                <span className="text-xs text-gray-500 mb-1">Pen</span>
                {PEN_TYPES.map(pt => (
                  <button
                    key={pt.key}
                    className={classNames('toolbar-btn p-3 rounded hover:bg-gray-200 dark:hover:bg-gray-600', penStyle.key === pt.key ? 'active bg-blue-100' : '')}
                    title={pt.label}
                    onClick={() => setPenStyle(pt)}
                  >
                    {pt.icon}
                  </button>
                ))}
              </div>
            )}
            {activeSubToolbar === 'frame' && tool === 'frame' && (
              <div
                data-subtoolbar
                data-subtoolbar-content
                className="absolute bg-gray-100 dark:bg-gray-700 rounded-xl p-3 py-4 shadow-lg z-[60]"
                style={{
                  left: 'calc(100% + 12px)',
                  top: '30%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  minWidth: 220,
                  minHeight: 120,
                }}
              >
                <span className="text-xs text-gray-500 mb-1 col-span-3 text-center">Frames</span>
                {FRAME_PRESETS.map(preset => (
                  <button
                    key={preset.key}
                    className="toolbar-btn p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex flex-col items-center justify-center w-full h-full"
                    title={preset.label}
                    onClick={() => {
                      // Center the frame in the visible area
                      const frameWidth = Math.round(preset.width * 0.6);
                      const frameHeight = Math.round(preset.height * 0.6);
                      const centerX = ((canvasRef.current?.clientWidth || 800) / state.viewport.scale) / 2 - frameWidth / 2 - state.viewport.x / state.viewport.scale;
                      const centerY = ((canvasRef.current?.clientHeight || 600) / state.viewport.scale) / 2 - frameHeight / 2 - state.viewport.y / state.viewport.scale;
                      // Determine label prefix based on preset
                      const mobileTabletLaptop = ['iphone', 'samsung', 'ipad', 'macbook'];
                      const paperAspect = ['a4', 'letter', '16-9', '4-3', '1-1'];
                      let labelPrefix = 'Frame';
                      if (mobileTabletLaptop.includes(preset.key)) labelPrefix = 'Screen';
                      // Count existing frames of this group
                      const existingCount = state.objects.filter(obj => obj.type === 'frame' && ((labelPrefix === 'Screen' && mobileTabletLaptop.includes(obj.framePreset || '')) || (labelPrefix === 'Frame' && paperAspect.includes(obj.framePreset || '')))).length;
                      const label = `${labelPrefix} ${existingCount + 1}`;
                      saveToHistory(state);
                      setState(prev => ({
                        ...prev,
                        objects: [
                          ...prev.objects,
                          {
                            id: generateId(),
                            type: 'frame',
                            x: centerX,
                            y: centerY,
                            width: frameWidth,
                            height: frameHeight,
                            rotation: 0,
                            color: '#fff',
                            zIndex: Math.max(0, ...prev.objects.map(obj => obj.zIndex || 0)) + 1,
                            framePreset: preset.key,
                            label,
                          },
                        ],
                      }));
                      setTool('select');
                      closeAllSubToolbars();
                    }}
                  >
                    <div className="flex items-center justify-center w-full" style={{ width: 24, height: 24 }}>{preset.preview}</div>
                    <span className="block text-xs mt-1 text-gray-600 dark:text-gray-400 text-center w-full">{preset.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions Container */}
          <div className="flex flex-col items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-xl p-4">
            {/* Clear All button only */} 
            <button
              className="toolbar-btn p-3 rounded-md hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
              title="Clear All"
              onClick={clearAll}
            >
              <div className="i-ph:trash text-xl text-red-500" style={{ color: 'inherit' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Top Right Toolbar - Save & Export */}
      <div className="absolute top-4 right-4 z-[300] drop-shadow-lg">
        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-xl p-4">
          {/* Save button */}
          <button
            className="toolbar-btn p-3 rounded-md hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
            title="Save Canvas"
            onClick={manualSave}
            disabled={!currentChatId || !isAuthenticated || isSaving}
          >
            {isSaving ? (
              <div className="i-svg-spinners:90-ring-with-bg text-xl text-green-500 animate-spin" style={{ color: 'inherit' }} />
            ) : showTick ? (
              <motion.div
                key="tick"
                initial={{ scale: 0, rotate: -30, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, rotate: 30, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="i-ph:check text-xl text-green-500"
                style={{ color: 'inherit' }}
              />
            ) : (
            <div className="i-ph:floppy-disk text-xl text-green-500" style={{ color: 'inherit' }} />
            )}
          </button>
          {/* Export button */}
          <button
            className="toolbar-btn p-3 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            title="Export Canvas"
            onClick={handleExport}
            disabled={isExporting}
          >
            <div className="i-ph:download text-xl text-blue-500" style={{ color: 'inherit' }} />
          </button>
        </div>
      </div>

      {/* Bottom Right Toolbar - Zoom & Grid */}
      <div className="absolute bottom-4 right-4 z-[300] drop-shadow-lg">
        <div className="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 rounded-xl p-4">
          {/* Grid toggle */}
          <button
            className={classNames(
              'toolbar-btn p-3 rounded-md transition-colors',
              showGrid ? 'active' : undefined,
              showGrid ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            onClick={() => setShowGrid(!showGrid)}
            title="Toggle Grid"
          >
            <div className="i-ph:grid-four text-xl" style={{ color: 'inherit' }} />
          </button>
          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              className="toolbar-btn p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setState(prev => ({
                ...prev,
                viewport: { ...prev.viewport, scale: Math.max(0.1, prev.viewport.scale * 0.9) }
              }))}
              title="Zoom Out"
            >
              <div className="i-ph:minus text-xl" style={{ color: 'inherit' }} />
            </button>
            <span className="px-3 text-sm text-gray-600 dark:text-gray-300 font-medium">
              {Math.round(state.viewport.scale * 100)}%
            </span>
            <button
              className="toolbar-btn p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setState(prev => ({
                ...prev,
                viewport: { ...prev.viewport, scale: Math.min(3, prev.viewport.scale * 1.1) }
              }))}
              title="Zoom In"
            >
              <div className="i-ph:plus text-xl" style={{ color: 'inherit' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative">
        <div
          ref={canvasRef}
          className="w-full h-full relative cursor-crosshair"
          style={{
            backgroundImage: gridBackgroundImage,
            backgroundSize: `${70 * state.viewport.scale}px ${70 * state.viewport.scale}px`,
            backgroundPosition: `${state.viewport.x}px ${state.viewport.y}px`,
            cursor:
              tool === 'eraser'
                ? `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg filter='url(%23a)'%3E%3Crect x='6' y='14' width='20' height='10' rx='4' transform='rotate(-30 6 14)' fill='%23fff' stroke='%23666' stroke-width='1.5'/%3E%3Cpath d='M16 7.5L25.66 13.5L16 19.5L6.34 13.5L16 7.5Z' fill='%23bbb' fill-opacity='0.85'/%3E%3C/g%3E%3Cdefs%3E%3Cfilter id='a' x='0' y='0' width='32' height='32' filterUnits='userSpaceOnUse'%3E%3CfeDropShadow dx='0' dy='2' stdDeviation='1.5' flood-color='%23000' flood-opacity='0.15'/%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E") 16 16, pointer`
                : tool === 'pen'
                ? `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 24L24 8L28 12L12 28L8 28L8 24Z' fill='%23333' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='26' cy='10' r='2' fill='%23bbb'/%3E%3C/svg%3E") 4 28, pointer`
                : tool === 'select' && isPanning
                ? 'grabbing'
                : tool === 'select'
                ? 'grab'
                : 'crosshair',
          }}
          onPointerDown={tool === 'eraser' ? handleEraserPointerDown : tool === 'pen' ? handlePenMouseDown : handleCanvasMouseDown}
          onPointerMove={tool === 'eraser' ? handleEraserPointerMove : tool === 'pen' ? handlePenMouseMove : handleCanvasMouseMove}
          onPointerUp={tool === 'eraser' ? handleEraserPointerUp : tool === 'pen' ? handlePenMouseUp : handleCanvasMouseUp}
          onWheel={handleWheel}
          onClick={handleCanvasClick}
        >
          {/* Render all pen strokes in a single SVG layer */}
          <svg
            width="100%"
            height="100%"
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 2 }}
          >
            <g transform={`translate(${state.viewport.x},${state.viewport.y}) scale(${state.viewport.scale})`}>
              {state.objects.filter(obj => obj.type === 'drawing').map(obj => (
                <path
                  key={obj.id}
                  d={getSmoothPathCanvas(obj.points || [])}
                  fill="none"
                  stroke={obj.color || '#000'}
                  strokeWidth={obj.penStyle?.strokeWidth || 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={obj.penStyle?.dash}
                  opacity={obj.penStyle?.opacity}
                />
              ))}
              {/* Current stroke in progress */}
              {currentStroke && currentStroke.points.length > 1 && (
                <path
                  d={getSmoothPathCanvas(currentStroke.points)}
                  fill="none"
                  stroke={currentStroke.color}
                  strokeWidth={currentStroke.penStyle?.strokeWidth || 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={currentStroke.penStyle?.dash}
                  opacity={currentStroke.penStyle?.opacity}
                />
              )}
            </g>
          </svg>
          {/* Canvas objects */}
          {state.objects.map((obj) => renderObject({ object: obj }))}

          {/* Formatting toolbar rendered at top level, above all objects */}
          {editingTextId && editingTextObject && editingTextBoxRect && (
            <div
              className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-xl p-3 shadow-lg border border-gray-200 dark:border-gray-700"
              style={toolbarStyle}
            >
              {/* Bold */}
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.fontWeight === 'bold' ? 'active bg-blue-100' : ''
                )}
                title="Bold"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id
                      ? { ...obj, fontWeight: obj.fontWeight === 'bold' ? 'normal' : 'bold' }
                      : obj
                  ),
                }))}
              >
                <span style={{ fontWeight: 'bold' }}>B</span>
              </button>
              {/* Italic */}
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.fontStyle === 'italic' ? 'active bg-blue-100' : ''
                )}
                title="Italic"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id
                      ? { ...obj, fontStyle: obj.fontStyle === 'italic' ? 'normal' : 'italic' }
                      : obj
                  ),
                }))}
              >
                <span style={{ fontStyle: 'italic' }}>I</span>
              </button>
              {/* Underline */}
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.textDecoration === 'underline' ? 'active bg-blue-100' : ''
                )}
                title="Underline"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id
                      ? { ...obj, textDecoration: obj.textDecoration === 'underline' ? 'none' : 'underline' }
                      : obj
                  ),
                }))}
              >
                <span style={{ textDecoration: 'underline' }}>U</span>
              </button>
              {/* Font size with + and - buttons */}
              <div className="flex items-center gap-1">
                <button
                  className="toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Decrease font size"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    const newSize = Math.max(8, (editingTextObject.fontSize || 16) - 2);
                    setState(prev => ({
                      ...prev,
                      objects: prev.objects.map(obj =>
                        obj.id === editingTextObject.id ? { ...obj, fontSize: newSize } : obj
                      ),
                    }));
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 'bold' }}>-</span>
                </button>
                <input
                  type="number"
                  min={8}
                  max={72}
                  value={editingTextObject.fontSize || 16}
                  onChange={e => {
                    const newSize = Math.max(8, Math.min(72, parseInt(e.target.value, 10) || 16));
                    setState(prev => ({
                      ...prev,
                      objects: prev.objects.map(obj =>
                        obj.id === editingTextObject.id ? { ...obj, fontSize: newSize } : obj
                      ),
                    }));
                  }}
                  className="toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center border border-gray-300 dark:border-gray-600 text-sm bg-transparent text-center no-spinner"
                  style={{ width: 48 }}
                  title="Font size"
                  onMouseDown={e => e.preventDefault()}
                />
                <button
                  className="toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Increase font size"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    const newSize = Math.min(72, (editingTextObject.fontSize || 16) + 2);
                    setState(prev => ({
                      ...prev,
                      objects: prev.objects.map(obj =>
                        obj.id === editingTextObject.id ? { ...obj, fontSize: newSize } : obj
                      ),
                    }));
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 'bold' }}>+</span>
                </button>
              </div>
              {/* Alignment */}
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.textAlign === 'left' || !editingTextObject.textAlign ? 'active bg-blue-100' : ''
                )}
                title="Align Left"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id ? { ...obj, textAlign: 'left' } : obj
                  ),
                }))}
              >
                {/* Left align SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="2" rx="1" fill="currentColor"/><rect x="4" y="11" width="10" height="2" rx="1" fill="currentColor"/><rect x="4" y="15" width="16" height="2" rx="1" fill="currentColor"/></svg>
              </button>
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.textAlign === 'center' ? 'active bg-blue-100' : ''
                )}
                title="Align Center"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id ? { ...obj, textAlign: 'center' } : obj
                  ),
                }))}
              >
                {/* Center align SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24"><rect x="6" y="7" width="12" height="2" rx="1" fill="currentColor"/><rect x="4" y="11" width="16" height="2" rx="1" fill="currentColor"/><rect x="6" y="15" width="12" height="2" rx="1" fill="currentColor"/></svg>
              </button>
              <button
                className={classNames(
                  'toolbar-btn p-3 rounded min-w-[48px] w-[48px] flex justify-center items-center hover:bg-gray-200 dark:hover:bg-gray-600',
                  editingTextObject.textAlign === 'right' ? 'active bg-blue-100' : ''
                )}
                title="Align Right"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setState(prev => ({
                  ...prev,
                  objects: prev.objects.map(obj =>
                    obj.id === editingTextObject.id ? { ...obj, textAlign: 'right' } : obj
                  ),
                }))}
              >
                {/* Right align SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="2" rx="1" fill="currentColor"/><rect x="10" y="11" width="10" height="2" rx="1" fill="currentColor"/><rect x="4" y="15" width="16" height="2" rx="1" fill="currentColor"/></svg>
              </button>
            </div>
          )}

          {/* Selection box */}
          {state.selectionBox && (
            <div
              style={{
                position: 'absolute',
                left:
                  Math.min(state.selectionBox.startX, state.selectionBox.endX) * state.viewport.scale +
                  state.viewport.x,
                top:
                  Math.min(state.selectionBox.startY, state.selectionBox.endY) * state.viewport.scale +
                  state.viewport.y,
                width: Math.abs(state.selectionBox.endX - state.selectionBox.startX) * state.viewport.scale,
                height: Math.abs(state.selectionBox.endY - state.selectionBox.startY) * state.viewport.scale,
                border: '2px dashed #2563eb',
                background: 'rgba(37,99,235,0.08)',
                zIndex: 100,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Welcome overlay ... */}
          {canvasLoaded && state.objects.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
              <div className="text-center text-gray-500 dark:text-gray-400">
                <div className="i-ph:hand-pointing text-6xl mb-4 mx-auto opacity-50" />
                <h3 className="text-xl font-medium mb-2">Welcome to Visual Canvas</h3>
                <p className="text-sm mb-4">
                  {currentChatId && isAuthenticated 
                    ? "Add objects using the toolbar above. Your canvas is automatically saved."
                    : "Please open a chat to start using the canvas."
                  }
                </p>
                {currentChatId && isAuthenticated && (
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="i-ph:pen-nib text-lg" style={{ color: 'inherit' }} />
                      <span style={{ color: 'inherit' }}>Pen</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-ph:note text-lg" style={{ color: 'inherit' }} />
                      <span style={{ color: 'inherit' }}>Notes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-ph:square text-lg" style={{ color: 'inherit' }} />
                      <span style={{ color: 'inherit' }}>Shapes</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-ph:text-t text-lg" style={{ color: 'inherit' }} />
                      <span style={{ color: 'inherit' }}>Text</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-ph:frame-corners text-lg" style={{ color: 'inherit' }} />
                      <span style={{ color: 'inherit' }}>Frames</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loading indicator */}
        {!canvasLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
            <div className="text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin i-ph:circle-dashed text-4xl mb-2 mx-auto opacity-50" />
              <p className="text-sm">Loading canvas...</p>
            </div>
          </div>
        )}
      </div>

      {/* Clear All Confirmation Dialog */}
      {showClearConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]" style={{ pointerEvents: 'auto' }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl z-[99999]" style={{ pointerEvents: 'auto' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="i-ph:warning-circle text-2xl text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Erase All Canvas Data?
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
            This will erase all items on the canvas permanently. Once deleted, this action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-600"
                onClick={confirmClearAll}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}); 