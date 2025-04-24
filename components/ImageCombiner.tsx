"use client"
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ZoomIn, Move, Video, Image as ImageIcon, AlertTriangle, Download } from 'lucide-react';
import { GeminiImageEditor } from './gemini-image-editor'; // Assumindo que este componente existe
import { MediaInput } from './media-input'; // Assumindo que este componente existe
import { cn } from '@/lib/utils'; // Assumindo que esta função existe

type MediaType = 'image' | 'video' | null;
type DragType = 'left' | 'right' | 'logo' | null;
type PinchSide = 'left' | 'right' | null; // NOVO: Para rastrear o lado da pinça
type RelativeFocus = { x: number; y: number };

const logPrefix = "[ImageCombiner] ";

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

// Helper para calcular distância entre dois toques
const calculateDistance = (touch1: Touch, touch2: Touch): number => {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

// Helper para carregar elementos Image/Video (sem alterações)
const loadMediaElement = (dataUrl: string, type: MediaType, side: 'left' | 'right' | 'logo'): Promise<HTMLImageElement | HTMLVideoElement> => {
  // ... (código existente inalterado)
    // console.log(logPrefix + `[${side}] loadMediaElement START. Type: ${type}`);
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') { /* console.error(logPrefix + `[${side}] loadMediaElement failed: window is undefined.`); */ return reject(new Error("loadMediaElement client-side only.")); }
      let element: HTMLImageElement | HTMLVideoElement | null = null; let timeoutId: NodeJS.Timeout | null = null;
      const cleanupTimeout = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } };
      timeoutId = setTimeout(() => { console.error(logPrefix + `[${side}] LOAD TIMEOUT after 20 seconds! Type: ${type}`); if(element) { element.src = ''; /* console.warn(logPrefix + `[${side}] Cleared element src on timeout.`); */ } reject(new Error(`Timeout ao carregar mídia (${side})`)); }, 20000);
      try {
          if (type === 'image') {
              const img = new window.Image(); element = img;
              img.onload = () => { cleanupTimeout(); if (img.naturalWidth > 0 && img.naturalHeight > 0) { resolve(img); } else { console.error(logPrefix + `[${side}] Image ONLOAD fired but dimensions are invalid.`); reject(new Error(`Imagem carregada mas com dimensões inválidas (${side})`)); } };
              img.onerror = (e) => { cleanupTimeout(); console.error(logPrefix + `[${side}] Image ONERROR fired. Error event:`, e); reject(new Error(`Erro ao carregar imagem (${side})`)); };
              img.src = dataUrl;
          } else if (type === 'video') {
              const video = document.createElement('video'); element = video;
              video.onloadeddata = () => { cleanupTimeout(); if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) { video.currentTime = 0; video.muted = true; video.playsInline = true; resolve(video); } else { console.error(logPrefix + `[${side}] Video ONLOADEDDATA fired but dimensions/readyState invalid. Dims: ${video.videoWidth}x${video.videoHeight}, State: ${video.readyState}`); reject(new Error(`Vídeo carregado mas com dimensões ou readyState inválidos (${side})`)); } };
              video.onerror = (e) => { cleanupTimeout(); const error = video.error; console.error(logPrefix + `[${side}] Video ONERROR fired. Error object:`, error, "Event:", e); reject(new Error(`Erro ao carregar vídeo (${side}): ${error?.message || 'Erro desconhecido de vídeo'}`)); };
              video.onstalled = () => console.warn(logPrefix + `[${side}] Video ONSTALLED fired.`); video.onsuspend = () => console.warn(logPrefix + `[${side}] Video ONSUSPEND fired.`);
              video.preload = 'auto'; video.src = dataUrl; video.load();
          } else { cleanupTimeout(); console.error(logPrefix + `[${side}] Unsupported media type: ${type}`); reject(new Error(`Tipo de mídia não suportado (${side})`)); }
      } catch (err) { cleanupTimeout(); console.error(logPrefix + `[${side}] Catched error during element creation/setup:`, err); reject(err instanceof Error ? err : new Error(String(err))); }
    });
  };


// --- Lógica de Desenho --- (sem alterações)
const drawMediaSection = (
    ctx: CanvasRenderingContext2D, mediaElement: HTMLImageElement | HTMLVideoElement | null, section: 'left' | 'right',
    targetCanvasWidth: number, targetCanvasHeight: number, zoomPercent: number, relativeFocus: RelativeFocus
) => {
    // ... (código existente inalterado)
    const dWidth = targetCanvasWidth / 2; const dHeight = targetCanvasHeight; const dx = 0; const dy = 0;
    ctx.save();
    try {
        ctx.clearRect(dx, dy, dWidth, dHeight); if (!mediaElement) { ctx.restore(); return; }
        const isImage = mediaElement instanceof HTMLImageElement;
        const sourceWidth = isImage ? mediaElement.naturalWidth : mediaElement.videoWidth;
        const sourceHeight = isImage ? mediaElement.naturalHeight : mediaElement.videoHeight;
        if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) { ctx.restore(); return; }
        const overallScale = zoomPercent / 100; const sourceAspect = sourceWidth / sourceHeight; const destAspect = dWidth / dHeight;
        let coverScale: number; if (sourceAspect > destAspect) { coverScale = dHeight / sourceHeight; } else { coverScale = dWidth / sourceWidth; }
        const finalScale = coverScale * overallScale; const sWidthFinal = dWidth / finalScale; const sHeightFinal = dHeight / finalScale;
        const sxIdeal = sourceWidth * relativeFocus.x - sWidthFinal / 2; const syIdeal = sourceHeight * relativeFocus.y - sHeightFinal / 2;
        const sx = clamp(sxIdeal, 0, Math.max(0, sourceWidth - sWidthFinal)); const sy = clamp(syIdeal, 0, Math.max(0, sourceHeight - sHeightFinal));
        const sWidth = sWidthFinal; const sHeight = sHeightFinal; const dX = dx; const dY = dy; const dW = dWidth; const dH = dHeight;
        if (sWidth > 0 && sHeight > 0 && dW > 0 && dH > 0 && Number.isFinite(sx) && Number.isFinite(sy)) {
            ctx.drawImage(mediaElement, sx, sy, sWidth, sHeight, dX, dY, dW, dH);
        } else { console.warn(logPrefix + `[${section}] Skipping drawImage due to zero/invalid params. sW=${sWidth}, sH=${sHeight}, dW=${dW}, dH=${dH}, sx=${sx}, sy=${sy}`); }
    } catch (e) { console.error(logPrefix + `[${section}] Error during drawImage execution:`, e); ctx.fillStyle = 'red'; ctx.fillRect(dx, dy, dWidth, dHeight); ctx.fillStyle = 'white'; ctx.fillText('Draw Error', dx + 10, dy + 20); }
    finally { ctx.restore(); }
}

// --- CONSTANTES ---
const MIN_ZOOM = 10;
const MAX_ZOOM = 500;

export default function ImageCombiner() {
    // --- State & Refs ---
    const [leftMedia, setLeftMedia] = useState<string | null>(null);
    const [rightMedia, setRightMedia] = useState<string | null>(null);
    const [logo, setLogo] = useState<string | null>(null);
    const [leftMediaType, setLeftMediaType] = useState<MediaType>(null);
    const [rightMediaType, setRightMediaType] = useState<MediaType>(null);
    const [leftMediaElement, setLeftMediaElement] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
    const [rightMediaElement, setRightMediaElement] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
    const [logoElement, setLogoElement] = useState<HTMLImageElement | null>(null);
    const [leftZoom, setLeftZoom] = useState(100);
    const [rightZoom, setRightZoom] = useState(100);
    const [logoZoom, setLogoZoom] = useState(10);
    const [leftRelativeFocus, setLeftRelativeFocus] = useState<RelativeFocus>({ x: 0.5, y: 0.5 });
    const [rightRelativeFocus, setRightRelativeFocus] = useState<RelativeFocus>({ x: 0.5, y: 0.5 });
    const [logoPosition, setLogoPosition] = useState({ x: 50, y: 90 });
    const [activeDrag, setActiveDrag] = useState<DragType>(null);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialDragFocus, setInitialDragFocus] = useState<RelativeFocus>({ x: 0.5, y: 0.5 });
    const [initialLogoPos, setInitialLogoPos] = useState({ x: 50, y: 90 });
    const [isTouching, setIsTouching] = useState(false); // Para drag com 1 dedo
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isLoadingLeft, setIsLoadingLeft] = useState(false);
    const [isLoadingRight, setIsLoadingRight] = useState(false);
    const [isLoadingLogo, setIsLoadingLogo] = useState(false);

    // --- NOVO Estado para Pinch ---
    const [isPinching, setIsPinching] = useState(false);
    const [initialPinchDistance, setInitialPinchDistance] = useState(0);
    const [pinchSide, setPinchSide] = useState<PinchSide>(null);
    const [zoomAtPinchStart, setZoomAtPinchStart] = useState(100);
    // ----------------------------

    const leftPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const logoRef = useRef<HTMLImageElement>(null);
    const combinedContainerRef = useRef<HTMLDivElement>(null);
    const isMounted = useRef(true);
    const animationFrameId = useRef<number | null>(null);
    const leftInteractiveRef = useRef<HTMLDivElement>(null);
    const rightInteractiveRef = useRef<HTMLDivElement>(null);

    // --- Efeitos --- (sem alterações significativas, exceto no cleanup/dependências talvez)
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false; if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            const cleanup = (el: HTMLImageElement | HTMLVideoElement | null) => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); };
            cleanup(leftMediaElement); cleanup(rightMediaElement); cleanup(logoElement);
        };
    }, [leftMediaElement, rightMediaElement, logoElement]);

    // --- Callback de Desenho --- (sem alterações)
    const drawPreviewCanvases = useCallback(() => {
        // ... (código existente inalterado)
        const leftCanvas = leftPreviewCanvasRef.current; const rightCanvas = rightPreviewCanvasRef.current; const container = combinedContainerRef.current;
        if (!container || !leftCanvas || !rightCanvas || !isMounted.current) return;
        const containerWidth = container.offsetWidth; const containerHeight = container.offsetHeight; if (containerWidth <= 0 || containerHeight <= 0) return;
        const previewHalfWidth = Math.max(1, Math.floor(containerWidth / 2)); const previewHeight = Math.max(1, containerHeight);
        if (leftCanvas.width !== previewHalfWidth || leftCanvas.height !== previewHeight) { leftCanvas.width = previewHalfWidth; leftCanvas.height = previewHeight; }
        if (rightCanvas.width !== previewHalfWidth || rightCanvas.height !== previewHeight) { rightCanvas.width = previewHalfWidth; rightCanvas.height = previewHeight; }
        const leftCtx = leftCanvas.getContext('2d'); const rightCtx = rightCanvas.getContext('2d');
        if (leftCtx) { drawMediaSection(leftCtx, leftMediaElement, 'left', containerWidth, previewHeight, leftZoom, leftRelativeFocus); } else { console.error(logPrefix + "Failed to get left preview context."); }
        if (rightCtx) { drawMediaSection(rightCtx, rightMediaElement, 'right', containerWidth, previewHeight, rightZoom, rightRelativeFocus); } else { console.error(logPrefix + "Failed to get right preview context."); }
    }, [leftMediaElement, rightMediaElement, leftZoom, rightZoom]); // Removed unnecessary dependencies

    // --- Efeitos de Carregamento --- (sem alterações)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (leftMedia && leftMediaType) { setIsLoadingLeft(true); setLeftMediaElement(null); let cancelled = false; loadMediaElement(leftMedia, leftMediaType, 'left').then(el => { if (isMounted.current && !cancelled) setLeftMediaElement(el); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Esq: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingLeft(false); }); return () => { cancelled = true; setLeftMediaElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (leftMediaElement || isLoadingLeft) { setLeftMediaElement(null); setIsLoadingLeft(false); } } }, [leftMedia, leftMediaType]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (rightMedia && rightMediaType) { setIsLoadingRight(true); setRightMediaElement(null); let cancelled = false; loadMediaElement(rightMedia, rightMediaType, 'right').then(el => { if (isMounted.current && !cancelled) setRightMediaElement(el); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Dir: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingRight(false); }); return () => { cancelled = true; setRightMediaElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (rightMediaElement || isLoadingRight) { setRightMediaElement(null); setIsLoadingRight(false); } } }, [rightMedia, rightMediaType]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (logo) { setIsLoadingLogo(true); setLogoElement(null); let cancelled = false; loadMediaElement(logo, 'image', 'logo').then(el => { if (isMounted.current && !cancelled) setLogoElement(el as HTMLImageElement); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Logo: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingLogo(false); }); return () => { cancelled = true; setLogoElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (logoElement || isLoadingLogo) { setLogoElement(null); setIsLoadingLogo(false); } } }, [logo]);

    // --- Efeitos de Desenho/Redimensionamento --- (sem alterações)
    useEffect(() => { if (combinedContainerRef.current && combinedContainerRef.current.offsetParent !== null) { const rafId = requestAnimationFrame(() => { if (isMounted.current && combinedContainerRef.current) { drawPreviewCanvases(); } }); return () => { cancelAnimationFrame(rafId); }; } }, [drawPreviewCanvases]);
    useEffect(() => { const container = combinedContainerRef.current; if (!container) return; let rafId: number | null = null; const triggerDraw = () => { if (rafId) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => { if (isMounted.current && combinedContainerRef.current) { drawPreviewCanvases(); } rafId = null; }); }; const initialDrawTimeout = setTimeout(triggerDraw, 100); const resizeObserver = new ResizeObserver(triggerDraw); resizeObserver.observe(container); return () => { clearTimeout(initialDrawTimeout); resizeObserver.disconnect(); if (rafId) cancelAnimationFrame(rafId); }; }, [drawPreviewCanvases]);

    // --- Handlers ---
    // Handle Media Uploads (sem alterações)
    const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>, mediaSetter: (v: string | null) => void, typeSetter: (v: MediaType) => void, focusSetter: (v: RelativeFocus) => void, zoomSetter: (v: number) => void) => {
        const file = e.target.files?.[0]; focusSetter({ x: 0.5, y: 0.5 }); zoomSetter(100); typeSetter(null); mediaSetter(null); setSaveError(null);
        if (file) { const reader = new FileReader(); reader.onload = (event) => { const result = event.target?.result; if (typeof result === 'string') { let detectedType: MediaType = null; if (file.type.startsWith('video/')) { detectedType = 'video'; } else if (file.type.startsWith('image/')) { detectedType = 'image'; } else { setSaveError(`Tipo de arquivo não suportado: ${file.type}`); return; } typeSetter(detectedType); mediaSetter(result); } else { setSaveError("Erro interno ao ler arquivo."); } }; reader.onerror = () => { setSaveError("Erro ao ler o arquivo."); }; reader.readAsDataURL(file); }
        e.target.value = '';
    };
    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; setLogo(null); setLogoElement(null); setSaveError(null);
        if (file && file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (ev) => { const res = ev.target?.result; if (typeof res === 'string') { setLogo(res); } else { setSaveError("Erro interno ao ler logo."); } }; reader.onerror = () => { setSaveError("Erro ao ler logo."); }; reader.readAsDataURL(file); }
        else if (file) { setSaveError("Arquivo de logo deve ser uma imagem (ex: PNG, JPG)."); }
        e.target.value = '';
    };

    // --- MODIFICADO: Interaction Start (apenas para drag) ---
    const handleDragStart = (clientX: number, clientY: number, type: Exclude<DragType, null>) => {
        if ((type === 'left' && !leftMediaElement) || (type === 'right' && !rightMediaElement) || (type === 'logo' && !logoElement)) { return; }
        // Não iniciar drag se já estivermos em modo pinça
        if (isPinching) return;

        setActiveDrag(type);
        setDragStart({ x: clientX, y: clientY });
        if (type === 'left') setInitialDragFocus(leftRelativeFocus);
        else if (type === 'right') setInitialDragFocus(rightRelativeFocus);
        else if (type === 'logo') setInitialLogoPos(logoPosition);
    };

    // --- MODIFICADO: Interaction Move (apenas para drag) ---
    const handleDragMove = useCallback((clientX: number, clientY: number) => {
        // Ignorar se não for um drag ativo ou se estiver pinçando
        if (!activeDrag || isPinching) return;

        const deltaX = clientX - dragStart.x;
        const deltaY = clientY - dragStart.y;
        const container = combinedContainerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        if (containerWidth <= 0 || containerHeight <= 0) return;

        const previewHalfWidth = containerWidth / 2;
        let needsRedraw = false;

        const panMedia = (mediaElement: HTMLImageElement | HTMLVideoElement, zoom: number, setRelativeFocus: React.Dispatch<React.SetStateAction<RelativeFocus>>, initialFocus: RelativeFocus) => {
            const currentZoom = zoom / 100;
            const sourceWidth = ('naturalWidth' in mediaElement ? mediaElement.naturalWidth : mediaElement.videoWidth) || 1;
            const sourceHeight = ('naturalHeight' in mediaElement ? mediaElement.naturalHeight : mediaElement.videoHeight) || 1;
            const destAspect = previewHalfWidth / containerHeight;
            const sourceAspect = sourceWidth / sourceHeight;
            const scaleToCover = (sourceAspect > destAspect) ? (containerHeight / sourceHeight) : (previewHalfWidth / sourceWidth);
            const finalScale = scaleToCover * currentZoom;
            if (finalScale <= 0) return false;

            const effectiveFocusDeltaX = deltaX / (sourceWidth * finalScale);
            const effectiveFocusDeltaY = deltaY / (sourceHeight * finalScale);

            setRelativeFocus({
                x: clamp(initialFocus.x - effectiveFocusDeltaX, 0, 1),
                y: clamp(initialFocus.y - effectiveFocusDeltaY, 0, 1),
            });
            return true;
        };

        if (activeDrag === 'left' && leftMediaElement) {
            if (panMedia(leftMediaElement, leftZoom, setLeftRelativeFocus, initialDragFocus)) { needsRedraw = true; }
        } else if (activeDrag === 'right' && rightMediaElement) {
            if (panMedia(rightMediaElement, rightZoom, setRightRelativeFocus, initialDragFocus)) { needsRedraw = true; }
        } else if (activeDrag === 'logo' && logoElement) {
            const percentDeltaX = (deltaX / containerWidth) * 100;
            const percentDeltaY = (deltaY / containerHeight) * 100;
            setLogoPosition({
                x: clamp(initialLogoPos.x + percentDeltaX, 0, 100),
                y: clamp(initialLogoPos.y + percentDeltaY, 0, 100),
            });
            // Redraw do logo é feito pelo estilo CSS, mas o canvas pode precisar se houver sobreposição ou efeitos
        }

        if (needsRedraw) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
        }
    }, [activeDrag, dragStart, initialDragFocus, initialLogoPos, leftMediaElement, rightMediaElement, logoElement, leftZoom, rightZoom, drawPreviewCanvases, isPinching, leftRelativeFocus, rightRelativeFocus, logoPosition]); // Adicionado isPinching e outros estados relevantes

    // --- MODIFICADO: Interaction End (apenas para drag) ---
    const handleDragEnd = useCallback(() => {
        if (activeDrag) {
            setActiveDrag(null);
            setIsTouching(false); // Desativa o modo de toque de arrastar
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
            // Não resetar estado de pinça aqui
        }
    }, [activeDrag]); // Removido isPinching

    // --- MODIFICADO: Mouse Down (chama handleDragStart) ---
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
        if (e.button !== 0 || isTouching || isPinching) return; // Ignora se já estiver tocando ou pinçando
        const target = e.target as HTMLElement;
        if (target.getAttribute('data-interactive-area') === String(type) || (type === 'logo' && target.closest('[data-logo-container]'))) {
            e.preventDefault();
            e.stopPropagation();
            handleDragStart(e.clientX, e.clientY, type); // Chama o início do DRAG
        }
    };

    // --- MODIFICADO: Handlers Globais Mouse (usam handleDragMove/End) ---
    const handleMouseMove = useCallback((e: MouseEvent) => {
        // Somente move o drag se o drag estiver ativo e NÃO estiver no modo touch (drag) e NÃO estiver pinçando
        if (activeDrag && !isTouching && !isPinching) {
            // e.preventDefault(); // Prevent default pode ser desnecessário para mouse move
            handleDragMove(e.clientX, e.clientY);
        }
    }, [activeDrag, isTouching, isPinching, handleDragMove]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        // Somente finaliza o drag se o drag estiver ativo e NÃO estiver no modo touch (drag) e NÃO estiver pinçando
        if (e.button === 0 && activeDrag && !isTouching && !isPinching) {
            handleDragEnd();
        }
    }, [activeDrag, isTouching, isPinching, handleDragEnd]);


    // --- MODIFICADO: Touch Start (Detecta Drag ou Pinch) ---
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
        const target = e.target as HTMLElement;
        const isInteractiveArea = target.getAttribute('data-interactive-area') === String(type);
        const isLogoArea = type === 'logo' && target.closest('[data-logo-container]'); // Logo não suporta pinch zoom aqui

        if (isInteractiveArea && type !== 'logo') { // Pinch só para 'left' ou 'right'
            e.stopPropagation(); // Previne bubbling
            // e.preventDefault(); // CUIDADO: Pode impedir scroll fora da área. Remover se causar problemas.

            if (e.touches.length === 1 && !isPinching) { // Iniciar DRAG com 1 dedo (se não estiver pinçando)
                setIsTouching(true); // Ativa modo de toque para drag
                const touch = e.touches[0];
                handleDragStart(touch.clientX, touch.clientY, type);
            } else if (e.touches.length === 2) { // Iniciar PINCH com 2 dedos
                 // Se estava arrastando, cancela o drag para priorizar pinch
                 if (activeDrag) {
                    handleDragEnd();
                 }
                 setIsTouching(false); // Garante que não está em modo drag de 1 toque

                 // Verifica se a mídia existe para o lado do pinch
                 const mediaExists = (type === 'left' && leftMediaElement) || (type === 'right' && rightMediaElement);
                 if (!mediaExists) return; // Não faz nada se não houver mídia

                 setIsPinching(true);
                 setPinchSide(type);
                 const initialDist = calculateDistance(e.touches[0] as Touch, e.touches[1] as Touch);
                 setInitialPinchDistance(initialDist);
                 setZoomAtPinchStart(type === 'left' ? leftZoom : rightZoom);
            } else {
                // Mais de 2 dedos ou outra condição, pode querer cancelar tudo
                handleDragEnd();
                setIsPinching(false);
                setPinchSide(null);
            }
        } else if (isLogoArea && type === 'logo') { // Drag do logo (1 dedo)
             if (e.touches.length === 1 && !isPinching) {
                e.stopPropagation();
                // e.preventDefault(); // Pode ser necessário para drag do logo
                setIsTouching(true);
                const touch = e.touches[0];
                handleDragStart(touch.clientX, touch.clientY, type);
             }
        }
    };

    // --- MODIFICADO: Handler Global Touch Move (Inclui Pinch) ---
    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (isPinching && e.touches.length === 2 && pinchSide) {
            // --- Lógica de Pinch ---
            e.preventDefault(); // ESSENCIAL para evitar zoom/scroll do navegador durante a pinça
            const currentDist = calculateDistance(e.touches[0] as Touch, e.touches[1] as Touch);
            const scale = currentDist / initialPinchDistance;

            const newZoom = clamp(zoomAtPinchStart * scale, MIN_ZOOM, MAX_ZOOM);

            if (pinchSide === 'left') {
                setLeftZoom(newZoom);
            } else if (pinchSide === 'right') {
                setRightZoom(newZoom);
            }

            // Redesenhar imediatamente
             if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
             animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);

        } else if (activeDrag && isTouching && e.touches.length === 1 && !isPinching) {
             // --- Lógica de Drag (1 dedo) ---
            // e.preventDefault(); // Descomente se o drag estiver causando scroll indesejado
            handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if (isPinching && e.touches.length !== 2) {
            // Número de dedos mudou durante a pinça, talvez parar?
             setIsPinching(false);
             setPinchSide(null);
        } else if (activeDrag && isTouching && e.touches.length !== 1) {
             // Número de dedos mudou durante o drag, parar o drag
             handleDragEnd();
        }
    }, [isPinching, pinchSide, initialPinchDistance, zoomAtPinchStart, activeDrag, isTouching, handleDragMove, drawPreviewCanvases, handleDragEnd]); // Adicionadas dependências de pinça

    // --- MODIFICADO: Handler Global Touch End/Cancel (Inclui Pinch) ---
    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (isPinching) {
            // Finaliza a pinça se menos de 2 dedos restarem
            if (e.touches.length < 2) {
                setIsPinching(false);
                setPinchSide(null);
                setInitialPinchDistance(0);
                // console.log(logPrefix + "Pinch ended.");
            }
        } else if (isTouching && activeDrag) {
            // Finaliza o drag se não houver mais dedos (ou o dedo ativo foi removido)
            // A verificação e.touches.length === 0 é a mais segura
            if (e.touches.length === 0) {
                 handleDragEnd();
                 // console.log(logPrefix + "Touch drag ended.");
            }
        }
         // Garante que isTouching seja falso se não houver toques
        if (e.touches.length === 0) {
            setIsTouching(false);
        }

    }, [isPinching, isTouching, activeDrag, handleDragEnd]);

    // Wheel Zoom Handler (sem alterações)
    const internalHandleWheelZoom = useCallback((e: WheelEvent, zoomSetter: React.Dispatch<React.SetStateAction<number>>, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM) => {
        e.preventDefault(); e.stopPropagation(); const zoomAmount = e.deltaY * -0.2; zoomSetter(prevZoom => clamp(prevZoom + zoomAmount, minZoom, maxZoom));
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
    }, [drawPreviewCanvases]);

    // --- MODIFICADO: Efeito para Listeners Globais (com passive: false para touchmove) ---
    useEffect(() => {
        const touchMoveOptions: AddEventListenerOptions = { passive: false }; // NECESSÁRIO para preventDefault na pinça
        const otherTouchOptions: AddEventListenerOptions = { passive: true }; // Pode ser passive para start/end/cancel

        const addListeners = () => {
            // Sempre adiciona listeners de toque se houver interação de toque ativa (drag ou pinch)
            if (isTouching || isPinching) {
                document.addEventListener('touchmove', handleTouchMove, touchMoveOptions);
                document.addEventListener('touchend', handleTouchEnd, otherTouchOptions);
                document.addEventListener('touchcancel', handleTouchEnd, otherTouchOptions);
                // console.log(logPrefix + "Adding global touch listeners.");
            }
            // Adiciona listeners de mouse apenas se for drag de mouse
            if (activeDrag && !isTouching && !isPinching) {
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                // console.log(logPrefix + "Adding global mouse listeners.");
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
            }
        };

        const removeListeners = () => {
            // Remove todos os listeners globais para garantir limpeza
            document.removeEventListener('touchmove', handleTouchMove, touchMoveOptions); // Precisa das mesmas opções
            document.removeEventListener('touchend', handleTouchEnd as EventListener, otherTouchOptions);
            document.removeEventListener('touchcancel', handleTouchEnd as EventListener, otherTouchOptions);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // console.log(logPrefix + "Removing global listeners.");

            // Resetar estilos do body apenas se nenhuma interação estiver ativa
            if (!activeDrag && !isPinching && !isTouching) {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                 // console.log(logPrefix + "Resetting body styles.");
            }
        };

        // Adiciona listeners se houver qualquer interação ativa (drag de mouse, drag de toque, ou pinça)
        if (activeDrag || isTouching || isPinching) {
            addListeners();
        } else {
             // Garante que estilos sejam resetados se tudo parar
             document.body.style.cursor = '';
             document.body.style.userSelect = '';
        }

        // Função de cleanup
        return () => {
            removeListeners();
            // Garante reset no unmount ou mudança de dependência, se necessário
             document.body.style.cursor = '';
             document.body.style.userSelect = '';
             // console.log(logPrefix + "Cleanup global listeners effect.");
        };
    // Dependências: estados que controlam a interação ativa + handlers
    }, [activeDrag, isTouching, isPinching, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

    // --- EFEITO PARA WHEEL --- (sem alterações)
    useEffect(() => {
        const leftDiv = leftInteractiveRef.current;
        const rightDiv = rightInteractiveRef.current;
        const wheelOptions: AddEventListenerOptions = { passive: false };

        const wheelHandlerLeft = (e: Event) => { if (leftMediaElement && e instanceof WheelEvent) { internalHandleWheelZoom(e, setLeftZoom); } };
        const wheelHandlerRight = (e: Event) => { if (rightMediaElement && e instanceof WheelEvent) { internalHandleWheelZoom(e, setRightZoom); } };

        if (leftDiv) { leftDiv.addEventListener('wheel', wheelHandlerLeft, wheelOptions); }
        if (rightDiv) { rightDiv.addEventListener('wheel', wheelHandlerRight, wheelOptions); }

        return () => {
            if (leftDiv) { leftDiv.removeEventListener('wheel', wheelHandlerLeft, wheelOptions); }
            if (rightDiv) { rightDiv.removeEventListener('wheel', wheelHandlerRight, wheelOptions); }
        };
    }, [internalHandleWheelZoom, leftMediaElement, rightMediaElement, setLeftZoom, setRightZoom]);


    // --- Lógica `canSave` --- (sem alterações)
    const canSave = leftMediaType === 'image' && rightMediaType === 'image'
        && !!leftMediaElement && leftMediaElement instanceof HTMLImageElement && leftMediaElement.naturalWidth > 0 && leftMediaElement.naturalHeight > 0
        && !!rightMediaElement && rightMediaElement instanceof HTMLImageElement && rightMediaElement.naturalWidth > 0 && rightMediaElement.naturalHeight > 0;

    // --- Lógica de Salvamento --- (sem alterações)
    const saveCompositeImage = async () => {
        // ... (código existente inalterado)
        if (!canSave) { setSaveError("Ambos os lados devem ser imagens carregadas e válidas para salvar."); return; }
        const safeLeftElement = leftMediaElement as HTMLImageElement; const safeRightElement = rightMediaElement as HTMLImageElement; setIsSaving(true); setSaveError(null);
        try {
             const targetWidthPerImage = Math.max(safeLeftElement.naturalWidth, safeRightElement.naturalWidth); const finalWidth = targetWidthPerImage * 2; const leftHeightAtTarget = targetWidthPerImage * (safeLeftElement.naturalHeight / safeLeftElement.naturalWidth); const rightHeightAtTarget = targetWidthPerImage * (safeRightElement.naturalHeight / safeRightElement.naturalWidth); const finalHeight = Math.ceil(Math.max(leftHeightAtTarget, rightHeightAtTarget));
            if (!Number.isFinite(finalWidth) || finalWidth <= 0 || !Number.isFinite(finalHeight) || finalHeight <= 0) { throw new Error(`Dimensões finais calculadas inválidas: ${finalWidth}x${finalHeight}.`); }
            const canvas = document.createElement('canvas'); canvas.width = finalWidth; canvas.height = finalHeight; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error("Não foi possível obter o contexto 2D final.");
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            const drawFinalMedia = ( finalCtx: CanvasRenderingContext2D, mediaEl: HTMLImageElement, section: 'left' | 'right', outputWidth: number, outputHeight: number, zoom: number, focus: RelativeFocus ) => {
                finalCtx.save(); const sectionWidth = outputWidth / 2; const sectionHeight = outputHeight; const sectionDx = section === 'left' ? 0 : sectionWidth; const sectionDy = 0; finalCtx.beginPath(); finalCtx.rect(sectionDx, sectionDy, sectionWidth, sectionHeight); finalCtx.clip(); const sourceWidth = mediaEl.naturalWidth; const sourceHeight = mediaEl.naturalHeight; const overallScale = zoom / 100; const sourceAspect = sourceWidth / sourceHeight; const destAspect = sectionWidth / sectionHeight; let coverScale: number; if (sourceAspect > destAspect) { coverScale = sectionHeight / sourceHeight; } else { coverScale = sectionWidth / sourceWidth; } const finalScale = coverScale * overallScale; const sWidthFinal = sectionWidth / finalScale; const sHeightFinal = sectionHeight / finalScale; const sxIdeal = sourceWidth * focus.x - sWidthFinal / 2; const syIdeal = sourceHeight * focus.y - sHeightFinal / 2; const sx = clamp(sxIdeal, 0, Math.max(0, sourceWidth - sWidthFinal)); const sy = clamp(syIdeal, 0, Math.max(0, sourceHeight - sHeightFinal)); const sWidth = sWidthFinal; const sHeight = sHeightFinal; finalCtx.drawImage(mediaEl, sx, sy, sWidth, sHeight, sectionDx, sectionDy, sectionWidth, sectionHeight); finalCtx.restore();
            };
            drawFinalMedia(ctx, safeLeftElement, 'left', finalWidth, finalHeight, leftZoom, leftRelativeFocus);
            drawFinalMedia(ctx, safeRightElement, 'right', finalWidth, finalHeight, rightZoom, rightRelativeFocus);
            if (logoElement && logoElement.naturalWidth > 0 && logoElement.naturalHeight > 0) { const logoAspectRatio = logoElement.naturalHeight / logoElement.naturalWidth; const targetLogoWidth = (finalWidth * logoZoom) / 100; const targetLogoHeight = targetLogoWidth * (isNaN(logoAspectRatio) ? 1 : logoAspectRatio); const logoCenterX = (finalWidth * logoPosition.x) / 100; const logoCenterY = (finalHeight * logoPosition.y) / 100; let logoDrawX = logoCenterX - targetLogoWidth / 2; let logoDrawY = logoCenterY - targetLogoHeight / 2; logoDrawX = clamp(logoDrawX, 0, finalWidth - targetLogoWidth); logoDrawY = clamp(logoDrawY, 0, finalHeight - targetLogoHeight); ctx.drawImage(logoElement, logoDrawX, logoDrawY, targetLogoWidth, targetLogoHeight); }
            canvas.toBlob( (blob) => { if (blob && isMounted.current) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'imagem-combinada.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); setIsSaving(false); } else { if (!isMounted.current) { /* Cancelled */ } else { setSaveError("Falha ao gerar o blob da imagem final."); setIsSaving(false); } } }, 'image/png', 0.95 );
        } catch (error) { if (isMounted.current) { const msg = error instanceof Error ? error.message : String(error); setSaveError(`Falha ao salvar: ${msg}`); setIsSaving(false); } }
    };


    // --- Calcula Estilos do Logo --- (sem alterações)
    const getLogoStyle = (): React.CSSProperties => {
        // ... (código existente inalterado)
        const container = combinedContainerRef.current; if (!container || !logoElement || !logo || logoElement.naturalWidth <= 0 || logoElement.naturalHeight <= 0) { return { display: 'none' }; } const previewContainerWidth = container.offsetWidth; const previewContainerHeight = container.offsetHeight; if (previewContainerWidth <= 0 || previewContainerHeight <= 0) { return { display: 'none' }; } const previewLogoWidthPx = (previewContainerWidth * logoZoom) / 100; const aspectRatio = logoElement.naturalHeight / logoElement.naturalWidth; const previewLogoHeightPx = previewLogoWidthPx * (isNaN(aspectRatio) ? 1 : aspectRatio); const centerX = (previewContainerWidth * logoPosition.x) / 100; const centerY = (previewContainerHeight * logoPosition.y) / 100; const topLeftX = centerX - previewLogoWidthPx / 2; const topLeftY = centerY - previewLogoHeightPx / 2;
        return { position: 'absolute', left: `${topLeftX}px`, top: `${topLeftY}px`, width: `${previewLogoWidthPx}px`, height: `${previewLogoHeightPx}px`, cursor: activeDrag === 'logo' ? 'grabbing' : 'grab', zIndex: 10, userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', touchAction: 'none', backgroundImage: `url(${logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', border: `1px dashed ${activeDrag === 'logo' ? 'rgba(0, 100, 255, 0.8)' : 'transparent'}`, opacity: activeDrag === 'logo' ? 0.8 : 1.0, transition: 'border-color 0.2s ease, opacity 0.2s ease', };
    };

    // --- Estrutura JSX --- (Adicionado onTouchStart às divs interativas)
    return (
        <div className="w-full max-w-7xl mx-auto p-2 sm:p-4">
            {/* ... (Título, Cards de Upload - sem alterações) ... */}
             <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Editor de Combinação</h1>
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
                  <Card className="p-3 md:p-4">
                      <CardHeader className='p-0 mb-3'> <CardTitle className="text-base md:text-lg font-medium flex items-center gap-1"> {leftMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Esquerda {isLoadingLeft && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>} </CardTitle> </CardHeader>
                      <CardContent className='p-0'>
                          <MediaInput id="left-media-upload" label="Carregar Esquerda" accept="image/*,video/*" onMediaUpload={(e) => handleMediaUpload(e, setLeftMedia, setLeftMediaType, setLeftRelativeFocus, setLeftZoom)} className="mb-2" />
                          {leftMedia && ( <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground"> {isLoadingLeft ? "Carregando..." : leftMediaElement && leftMediaType === 'video' ? <video src={leftMedia} className="w-full h-full object-contain" muted loop playsInline autoPlay key={`preview-left-${leftMedia.substring(0,10)}`} aria-label="Preview vídeo esquerdo"/> : leftMediaElement && leftMediaType === 'image' ?
                             // eslint-disable-next-line @next/next/no-img-element
                             <img src={leftMedia} alt="Preview esquerda" className="w-full h-full object-contain" />
                             : !isLoadingLeft && !leftMediaElement ? <div className="text-destructive p-2">Falha no carregamento</div> : "Selecione um arquivo" } </div> )}
                      </CardContent>
                  </Card>
                  <Card className="p-3 md:p-4">
                      <CardHeader className='p-0 mb-3'> <CardTitle className="text-base md:text-lg font-medium flex items-center gap-1"> {rightMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Direita {isLoadingRight && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>} </CardTitle> </CardHeader>
                      <CardContent className='p-0'>
                          <MediaInput id="right-media-upload" label="Carregar Direita" accept="image/*,video/*" onMediaUpload={(e) => handleMediaUpload(e, setRightMedia, setRightMediaType, setRightRelativeFocus, setRightZoom)} className="mb-2" />
                           {rightMedia && ( <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground"> {isLoadingRight ? "Carregando..." : rightMediaElement && rightMediaType === 'video' ? <video src={rightMedia} className="w-full h-full object-contain" muted loop playsInline autoPlay key={`preview-right-${rightMedia.substring(0,10)}`} aria-label="Preview vídeo direito"/> : rightMediaElement && rightMediaType === 'image' ?
                             // eslint-disable-next-line @next/next/no-img-element
                             <img src={rightMedia} alt="Preview direita" className="w-full h-full object-contain" />
                             : !isLoadingRight && !rightMediaElement ? <div className="text-destructive p-2">Falha no carregamento</div> : "Selecione um arquivo" } </div> )}
                      </CardContent>
                  </Card>
                  <Card className="p-3 md:p-4">
                      <CardHeader className='p-0 mb-3'> <CardTitle className="text-base md:text-lg font-medium"> Logo {isLoadingLogo && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>} </CardTitle> </CardHeader>
                      <CardContent className='p-0'>
                          <MediaInput id="logo-upload" label="Carregar Logo (Opcional)" accept="image/png,image/jpeg,image/webp,image/svg+xml" onMediaUpload={handleLogoUpload} className="mb-2" />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img ref={logoRef} src={logo ?? undefined} alt="" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
                          {logo && ( <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground"> {isLoadingLogo ? "Carregando..." : logoElement ?
                             // eslint-disable-next-line @next/next/no-img-element
                             <img src={logo} alt="Preview logo" className="w-full h-full object-contain" />
                             : !isLoadingLogo && !logoElement ? <div className="text-destructive p-2">Falha ao carregar logo</div> : "Selecione um arquivo" } </div> )}
                      </CardContent>
                  </Card>
             </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="lg:col-span-2">
                    {/* --- Container Principal Interativo --- */}
                    <Card
                        className="p-0 bg-slate-700 dark:bg-slate-900 relative overflow-hidden aspect-video touch-none select-none" // touch-none é importante aqui
                        ref={combinedContainerRef}
                        style={{ cursor: activeDrag ? 'grabbing' : (isPinching ? 'zoom-in' : 'default') }} // Feedback visual
                    >
                        <div className="flex h-full w-full relative">
                            {/* --- Área Interativa Esquerda --- */}
                            <div
                                ref={leftInteractiveRef}
                                data-interactive-area="left"
                                className={cn(
                                    "w-1/2 h-full relative border-r border-gray-500 dark:border-gray-600 bg-muted/50 flex items-center justify-center",
                                    // Cursor: grabbing para drag, default senão, grab se puder interagir
                                    leftMediaElement ? (activeDrag === 'left' ? 'cursor-grabbing' : 'cursor-grab') : "cursor-default"
                                )}
                                onMouseDown={(e) => handleMouseDown(e, 'left')}
                                onTouchStart={(e) => handleTouchStart(e, 'left')} // ADICIONADO AQUI
                                style={{ touchAction: 'none' }} // Mantém para evitar scroll/zoom padrão NA ÁREA
                            >
                                <canvas ref={leftPreviewCanvasRef} className="absolute top-0 left-0 w-full h-full block pointer-events-none" aria-label="Pré-visualização interativa esquerda" />
                                {isLoadingLeft && (<div className="absolute inset-0 flex items-center justify-center text-gray-200 text-sm font-medium pointer-events-none bg-black/50 z-[5]"> Carregando Esquerda... </div>)}
                                {!leftMediaElement && !isLoadingLeft && (<div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none"> Lado Esquerdo Vazio </div>)}
                            </div>
                            {/* --- Área Interativa Direita --- */}
                            <div
                                ref={rightInteractiveRef}
                                data-interactive-area="right"
                                className={cn(
                                    "w-1/2 h-full relative bg-muted/50 flex items-center justify-center",
                                    rightMediaElement ? (activeDrag === 'right' ? 'cursor-grabbing' : 'cursor-grab') : "cursor-default"
                                )}
                                onMouseDown={(e) => handleMouseDown(e, 'right')}
                                onTouchStart={(e) => handleTouchStart(e, 'right')} // ADICIONADO AQUI
                                style={{ touchAction: 'none' }} // Mantém para evitar scroll/zoom padrão NA ÁREA
                            >
                                <canvas ref={rightPreviewCanvasRef} className="absolute top-0 left-0 w-full h-full block pointer-events-none" aria-label="Pré-visualização interativa direita" />
                                {isLoadingRight && (<div className="absolute inset-0 flex items-center justify-center text-gray-200 text-sm font-medium pointer-events-none bg-black/50 z-[5]"> Carregando Direita... </div>)}
                                {!rightMediaElement && !isLoadingRight && (<div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none"> Lado Direito Vazio </div>)}
                            </div>
                             {/* --- Logo Interativo --- */}
                             {logoElement && logo && logoElement.naturalWidth > 0 && (
                                <div
                                    data-logo-container
                                    style={getLogoStyle()}
                                    onMouseDown={(e) => handleMouseDown(e, 'logo')}
                                    onTouchStart={(e) => handleTouchStart(e, 'logo')} // ADICIONADO AQUI (para drag do logo no touch)
                                    role="button"
                                    aria-label="Mover logo" // Apenas mover, zoom é pelo slider
                                    tabIndex={0}
                                    className="hover:opacity-90"
                                ></div>
                             )}
                        </div>
                    </Card>
                     {/* ... (Botão Download, Alertas - sem alterações) ... */}
                     <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                         <div className="flex-grow flex flex-col gap-2 w-full sm:w-auto">
                              {(leftMediaType === 'video' || rightMediaType === 'video') && !isSaving && ( <Alert variant="default" className="w-full text-xs sm:text-sm p-2 sm:p-3"> <AlertTriangle className="h-4 w-4" /> <AlertTitle className="text-xs sm:text-sm font-semibold">Aviso Vídeo</AlertTitle> <AlertDescription className="text-xs sm:text-sm"> Pré-visualização de vídeo mostra apenas o 1º quadro. O download final está disponível apenas para combinação de **imagens**. </AlertDescription> </Alert> )}
                              {saveError && ( <Alert variant="destructive" className="w-full text-xs sm:text-sm p-2 sm:p-3"> <AlertTriangle className="h-4 w-4" /> <AlertTitle className="text-xs sm:text-sm font-semibold">Erro</AlertTitle> <AlertDescription className="text-xs sm:text-sm"> {saveError} </AlertDescription> </Alert> )}
                         </div>
                         <Button onClick={saveCompositeImage} disabled={!canSave || isSaving || isLoadingLeft || isLoadingRight || isLoadingLogo} className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0" aria-label={canSave ? "Baixar imagem combinada" : "Carregue duas imagens válidas para poder baixar"} title={ !canSave ? "Carregue uma imagem válida em ambos os lados para habilitar o download." : isSaving ? "Salvando imagem..." : (isLoadingLeft || isLoadingRight || isLoadingLogo) ? "Aguarde o carregamento das mídias..." : "Baixar imagem combinada (PNG)" } >
                             {isSaving ? ( <> <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div> Processando... </> ) : ( <> <Download size={18} /> Baixar Imagem </> )}
                         </Button>
                     </div>
                </div>
                <div className="lg:col-span-1">
                     {/* --- Tabs de Controle --- */}
                    <Tabs defaultValue="left" className="w-full">
                        <TabsList className="grid grid-cols-3 w-full"> <TabsTrigger value="left" disabled={!leftMediaElement || isLoadingLeft}>Esquerda</TabsTrigger> <TabsTrigger value="right" disabled={!rightMediaElement || isLoadingRight}>Direita</TabsTrigger> <TabsTrigger value="logo" disabled={!logoElement || isLoadingLogo}>Logo</TabsTrigger> </TabsList>
                         {/* ... (Conteúdo das Tabs - Sliders e Inputs - sem alterações) ... */}
                        <TabsContent value="left" className="mt-4 space-y-4">
                             <Card className="p-4">
                                <Label htmlFor="left-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Zoom ({leftZoom.toFixed(0)}%)</Label>
                                <Slider id="left-zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={1} value={[leftZoom]} onValueChange={(v) => { setLeftZoom(v[0]); if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); animationFrameId.current = requestAnimationFrame(drawPreviewCanvases); }} disabled={!leftMediaElement || isLoadingLeft} aria-label="Ajustar zoom da imagem esquerda" />
                                <div className="mt-4"> <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Foco)</Label> <p className="text-xs text-muted-foreground">Arraste a imagem na pré-visualização ou use a pinça para zoom.</p> </div>
                             </Card>
                        </TabsContent>
                        <TabsContent value="right" className="mt-4 space-y-4">
                            <Card className="p-4">
                                <Label htmlFor="right-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Zoom ({rightZoom.toFixed(0)}%)</Label>
                                <Slider id="right-zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={1} value={[rightZoom]} onValueChange={(v) => { setRightZoom(v[0]); if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current); animationFrameId.current = requestAnimationFrame(drawPreviewCanvases); }} disabled={!rightMediaElement || isLoadingRight} aria-label="Ajustar zoom da imagem direita" />
                                <div className="mt-4"> <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Foco)</Label> <p className="text-xs text-muted-foreground">Arraste a imagem na pré-visualização ou use a pinça para zoom.</p> </div>
                             </Card>
                        </TabsContent>
                        <TabsContent value="logo" className="mt-4 space-y-4">
                            <Card className="p-4">
                                <Label htmlFor="logo-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Largura Relativa ({logoZoom.toFixed(1)}%)</Label>
                                <Slider id="logo-zoom" min={1} max={50} step={0.5} value={[logoZoom]} onValueChange={(v) => setLogoZoom(v[0])} disabled={!logoElement || isLoadingLogo} aria-label="Ajustar tamanho relativo do logo" />
                                <div className="mt-4"> <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição Central</Label> <p className="text-xs text-muted-foreground">Arraste o logo na pré-visualização ou ajuste abaixo.</p>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div> <Label htmlFor="logo-pos-x" className='text-xs text-muted-foreground'>X (%)</Label> <Input id="logo-pos-x" type="number" min={0} max={100} step={0.1} value={logoPosition.x.toFixed(1)} onChange={(e) => setLogoPosition(p => ({ ...p, x: clamp(Number(e.target.value),0,100) }))} disabled={!logoElement || isLoadingLogo} aria-label="Ajustar posição horizontal do logo em porcentagem" /> </div>
                                        <div> <Label htmlFor="logo-pos-y" className='text-xs text-muted-foreground'>Y (%)</Label> <Input id="logo-pos-y" type="number" min={0} max={100} step={0.1} value={logoPosition.y.toFixed(1)} onChange={(e) => setLogoPosition(p => ({ ...p, y: clamp(Number(e.target.value),0,100) }))} disabled={!logoElement || isLoadingLogo} aria-label="Ajustar posição vertical do logo em porcentagem" /> </div>
                                    </div>
                                </div>
                             </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
             {/* ... (Seção Editor AI - sem alterações) ... */}
             <div className="mt-12 md:mt-16">
                 <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Edite sua foto com IA</h2>
                 <GeminiImageEditor />
             </div>
        </div>
    );
}