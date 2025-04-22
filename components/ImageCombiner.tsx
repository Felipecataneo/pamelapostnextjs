// components/ImageCombiner.tsx
"use client"
import React, { useState, useRef, useEffect, useCallback, WheelEvent, TouchEvent, ChangeEvent } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Save, ZoomIn, Move, Video, Image as ImageIcon, AlertTriangle, Download } from 'lucide-react';
// Substitua pelos seus caminhos corretos se necessário
import { GeminiImageEditor } from './gemini-image-editor'; // Assumindo que este componente existe
import { MediaInput } from './media-input'; // Assumindo que este componente existe
import { cn } from '@/lib/utils'; // Assumindo que esta função existe

type MediaType = 'image' | 'video' | null;
type DragType = 'left' | 'right' | 'logo' | null;
type RelativeFocus = { x: number; y: number };

const logPrefix = "[ImageCombiner] "; // Para facilitar a filtragem dos logs

// Utilitário de clamp
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

// Helper para carregar elementos Image/Video (com logs DETALHADOS e TIMEOUT)
const loadMediaElement = (dataUrl: string, type: MediaType, side: 'left' | 'right' | 'logo'): Promise<HTMLImageElement | HTMLVideoElement> => {
  console.log(logPrefix + `[${side}] loadMediaElement START. Type: ${type}`);
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { console.error(logPrefix + `[${side}] loadMediaElement failed: window is undefined.`); return reject(new Error("loadMediaElement client-side only.")); }
    let element: HTMLImageElement | HTMLVideoElement | null = null; let timeoutId: NodeJS.Timeout | null = null;
    const cleanupTimeout = () => { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } };
    timeoutId = setTimeout(() => { console.error(logPrefix + `[${side}] LOAD TIMEOUT after 20 seconds! Type: ${type}`); if(element) { element.src = ''; console.warn(logPrefix + `[${side}] Cleared element src on timeout.`); } reject(new Error(`Timeout ao carregar mídia (${side})`)); }, 20000);
    try {
        if (type === 'image') {
            const img = new window.Image(); element = img; console.log(logPrefix + `[${side}] Image element created.`);
            img.onload = () => { cleanupTimeout(); console.log(logPrefix + `[${side}] Image ONLOAD fired. Natural Dims: ${img.naturalWidth}x${img.naturalHeight}`); if (img.naturalWidth > 0 && img.naturalHeight > 0) { resolve(img); } else { console.error(logPrefix + `[${side}] Image ONLOAD fired but dimensions are invalid.`); reject(new Error(`Imagem carregada mas com dimensões inválidas (${side})`)); } };
            img.onerror = (e) => { cleanupTimeout(); console.error(logPrefix + `[${side}] Image ONERROR fired. Error event:`, e); reject(new Error(`Erro ao carregar imagem (${side})`)); };
            console.log(logPrefix + `[${side}] Setting image src...`); img.src = dataUrl; console.log(logPrefix + `[${side}] Image src set.`);
        } else if (type === 'video') {
            const video = document.createElement('video'); element = video; console.log(logPrefix + `[${side}] Video element created.`);
            video.onloadeddata = () => { cleanupTimeout(); console.log(logPrefix + `[${side}] Video ONLOADEDDATA fired. Video Dims: ${video.videoWidth}x${video.videoHeight}, ReadyState: ${video.readyState}`); if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) { video.currentTime = 0; video.muted = true; video.playsInline = true; console.log(logPrefix + `[${side}] Video ready, resolving.`); resolve(video); } else { console.error(logPrefix + `[${side}] Video ONLOADEDDATA fired but dimensions/readyState invalid. Dims: ${video.videoWidth}x${video.videoHeight}, State: ${video.readyState}`); reject(new Error(`Vídeo carregado mas com dimensões ou readyState inválidos (${side})`)); } };
            video.onerror = (e) => { cleanupTimeout(); const error = video.error; console.error(logPrefix + `[${side}] Video ONERROR fired. Error object:`, error, "Event:", e); reject(new Error(`Erro ao carregar vídeo (${side}): ${error?.message || 'Erro desconhecido de vídeo'}`)); };
            video.onstalled = () => console.warn(logPrefix + `[${side}] Video ONSTALLED fired.`); video.onsuspend = () => console.warn(logPrefix + `[${side}] Video ONSUSPEND fired.`);
            console.log(logPrefix + `[${side}] Setting video src and calling load()...`); video.preload = 'auto'; video.src = dataUrl; video.load(); console.log(logPrefix + `[${side}] Video src set and load() called.`);
        } else { cleanupTimeout(); console.error(logPrefix + `[${side}] Unsupported media type: ${type}`); reject(new Error(`Tipo de mídia não suportado (${side})`)); }
    } catch (err) { cleanupTimeout(); console.error(logPrefix + `[${side}] Catched error during element creation/setup:`, err); reject(err instanceof Error ? err : new Error(String(err))); }
  });
};

// --- Lógica de Desenho (Object-Cover + Pan - COM LOGS DETALHADOS) ---
const drawMediaSection = (
    ctx: CanvasRenderingContext2D,
    mediaElement: HTMLImageElement | HTMLVideoElement | null,
    section: 'left' | 'right',
    targetCanvasWidth: number, // Largura total do canvas combinado (pai)
    targetCanvasHeight: number, // Altura total do canvas combinado (pai)
    zoomPercent: number,
    relativeFocus: RelativeFocus
) => {
    // Calcula as dimensões e posição de destino DENTRO DESTE CONTEXTO (ctx)
    // Se for o ctx direito, o (0,0) é o canto superior esquerdo do canvas direito.
    const dWidth = targetCanvasWidth / 2; // Largura desta seção (metade do total)
    const dHeight = targetCanvasHeight; // Altura desta seção (total)
    const dx = 0; // Posição X de desenho DENTRO DESTE CANVAS específico é sempre 0
    const dy = 0; // Posição Y de desenho DENTRO DESTE CANVAS específico é sempre 0

    ctx.save();
    try {
        // Limpa APENAS a área deste canvas específico
        ctx.clearRect(dx, dy, dWidth, dHeight);
        if (!mediaElement) {
            console.log(logPrefix + `[${section}] Skipping draw: No media element.`);
            ctx.restore();
            return;
        }
        const isImage = mediaElement instanceof HTMLImageElement;
        const sourceWidth = isImage ? mediaElement.naturalWidth : mediaElement.videoWidth;
        const sourceHeight = isImage ? mediaElement.naturalHeight : mediaElement.videoHeight;

        if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) {
            console.warn(logPrefix + `[${section}] Skipping draw: Invalid source dimensions ${sourceWidth}x${sourceHeight}.`);
            ctx.restore();
            return;
        }

        const overallScale = zoomPercent / 100;
        const sourceAspect = sourceWidth / sourceHeight;
        const destAspect = dWidth / dHeight; // Aspecto da ÁREA de destino (metade do canvas)

        // Calcula a escala para cobrir a área de destino
        let coverScale: number;
        if (sourceAspect > destAspect) { // Imagem mais larga que a área -> ajustar pela altura
            coverScale = dHeight / sourceHeight;
        } else { // Imagem mais alta que a área -> ajustar pela largura
            coverScale = dWidth / sourceWidth;
        }

        const finalScale = coverScale * overallScale; // Aplica o zoom sobre a escala de cobertura
        const sWidthFinal = dWidth / finalScale; // Largura da fonte necessária para preencher dWidth com finalScale
        const sHeightFinal = dHeight / finalScale; // Altura da fonte necessária para preencher dHeight com finalScale

        // Calcula o ponto superior esquerdo (sx, sy) da fonte com base no foco relativo
        let sxIdeal = sourceWidth * relativeFocus.x - sWidthFinal / 2;
        let syIdeal = sourceHeight * relativeFocus.y - sHeightFinal / 2;

        // Garante que sx e sy não saiam dos limites da imagem original
        const sx = clamp(sxIdeal, 0, Math.max(0, sourceWidth - sWidthFinal));
        const sy = clamp(syIdeal, 0, Math.max(0, sourceHeight - sHeightFinal));

        // Define os parâmetros finais para drawImage (fonte e destino)
        const sWidth = sWidthFinal;
        const sHeight = sHeightFinal;
        const dX = dx; // Posição X no canvas de destino (sempre 0 para este canvas)
        const dY = dy; // Posição Y no canvas de destino (sempre 0 para este canvas)
        const dW = dWidth; // Largura no canvas de destino
        const dH = dHeight; // Altura no canvas de destino

        console.log(logPrefix + `[${section}] DRAWING PARAMS: \n  Source: sx=${sx.toFixed(1)}, sy=${sy.toFixed(1)}, sW=${sWidth.toFixed(1)}, sH=${sHeight.toFixed(1)} (from ${sourceWidth}x${sourceHeight})\n  Dest:   dX=${dX.toFixed(1)}, dY=${dY.toFixed(1)}, dW=${dW.toFixed(1)}, dH=${dH.toFixed(1)}`);

        if (sWidth > 0 && sHeight > 0 && dW > 0 && dH > 0 && Number.isFinite(sx) && Number.isFinite(sy)) {
            ctx.drawImage(mediaElement, sx, sy, sWidth, sHeight, dX, dY, dW, dH);
            console.log(logPrefix + `[${section}] drawImage successful.`);
        } else {
            console.warn(logPrefix + `[${section}] Skipping drawImage due to zero/invalid params. sW=${sWidth}, sH=${sH}, dW=${dW}, dH=${dH}, sx=${sx}, sy=${sy}`);
        }
    } catch (e) {
        console.error(logPrefix + `[${section}] Error during drawImage execution:`, e);
        // Desenha um erro no canvas específico
        ctx.fillStyle = 'red';
        ctx.fillRect(dx, dy, dWidth, dHeight);
        ctx.fillStyle = 'white';
        ctx.fillText('Draw Error', dx + 10, dy + 20);
    } finally {
        ctx.restore();
    }
}


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
    const [isTouching, setIsTouching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isLoadingLeft, setIsLoadingLeft] = useState(false);
    const [isLoadingRight, setIsLoadingRight] = useState(false);
    const [isLoadingLogo, setIsLoadingLogo] = useState(false);

    const leftPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
    const logoRef = useRef<HTMLImageElement>(null); // Ref para a imagem do logo (usado para obter dimensões)
    const combinedContainerRef = useRef<HTMLDivElement>(null);
    const isMounted = useRef(true);
    const animationFrameId = useRef<number | null>(null);
    const leftInteractiveRef = useRef<HTMLDivElement>(null);
    const rightInteractiveRef = useRef<HTMLDivElement>(null);

    // --- Efeito de Montagem/Desmontagem ---
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false; if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            const cleanup = (el: HTMLImageElement | HTMLVideoElement | null) => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); };
            cleanup(leftMediaElement); cleanup(rightMediaElement); cleanup(logoElement); console.log(logPrefix + "Component unmounted.");
        };
    }, [leftMediaElement, rightMediaElement, logoElement]); // Adicionado dependências para garantir cleanup correto

    // --- Callback de Desenho ---
    const drawPreviewCanvases = useCallback(() => {
        const leftCanvas = leftPreviewCanvasRef.current;
        const rightCanvas = rightPreviewCanvasRef.current;
        const container = combinedContainerRef.current;

        if (!container || !leftCanvas || !rightCanvas || !isMounted.current) return;

        const containerWidth = container.offsetWidth;
        const containerHeight = container.offsetHeight;
        if (containerWidth <= 0 || containerHeight <= 0) return; // Evita divisão por zero ou desenho inválido

        const previewHalfWidth = Math.max(1, Math.floor(containerWidth / 2));
        const previewHeight = Math.max(1, containerHeight);

        // Ajusta o tamanho dos canvases SE necessário
        if (leftCanvas.width !== previewHalfWidth || leftCanvas.height !== previewHeight) {
            leftCanvas.width = previewHalfWidth;
            leftCanvas.height = previewHeight;
             console.log(logPrefix + `[left] Resized canvas to ${previewHalfWidth}x${previewHeight}`);
        }
        if (rightCanvas.width !== previewHalfWidth || rightCanvas.height !== previewHeight) {
            rightCanvas.width = previewHalfWidth;
            rightCanvas.height = previewHeight;
            console.log(logPrefix + `[right] Resized canvas to ${previewHalfWidth}x${previewHeight}`);
        }

        const leftCtx = leftCanvas.getContext('2d');
        const rightCtx = rightCanvas.getContext('2d');

        // Desenha no canvas esquerdo
        if (leftCtx) {
            // Passa a LARGURA TOTAL do container para drawMediaSection saber o tamanho da "metade"
            drawMediaSection(leftCtx, leftMediaElement, 'left', containerWidth, previewHeight, leftZoom, leftRelativeFocus);
        } else {
            console.error(logPrefix + "Failed to get left preview context.");
        }

        // Desenha no canvas direito - CORRIGIDO
        if (rightCtx) {
            // Passa a LARGURA TOTAL do container para drawMediaSection saber o tamanho da "metade"
            drawMediaSection(rightCtx, rightMediaElement, 'right', containerWidth, previewHeight, rightZoom, rightRelativeFocus);

            // -------> REMOVIDO O CÓDIGO DE TESTE QUE IMPEDIA O DESENHO <-------
            // console.log(logPrefix + "[right] Attempting TEST FILL RECT");
            // const dx_test = 0; // Coords locais do canvas direito
            // const dy_test = 0;
            // const dWidth_test = previewHalfWidth;
            // const dHeight_test = previewHeight;
            // rightCtx.clearRect(dx_test, dy_test, dWidth_test, dHeight_test); // Limpa canvas direito
            // rightCtx.fillStyle = 'lime';
            // rightCtx.fillRect(dx_test + 5, dy_test + 5, dWidth_test - 10, dHeight_test - 10); // Desenha teste
            // console.log(logPrefix + `[right] TEST Fill Rect executed at ${dx_test},${dy_test} ${dWidth_test}x${dHeight_test}`);
            // // drawMediaSection(...) // Esta linha estava comentada!
        } else {
            console.error(logPrefix + "Failed to get right preview context.");
        }

    }, [leftMediaElement, rightMediaElement, leftZoom, rightZoom, leftRelativeFocus, rightRelativeFocus /* Adicionar outras dependências se necessário, como tamanho do container se ele mudar dinamicamente e afetar o desenho*/]);

    // --- Efeitos de Carregamento de Mídia ---
    useEffect(() => { if (leftMedia && leftMediaType) { setIsLoadingLeft(true); setLeftMediaElement(null); let cancelled = false; console.log(logPrefix + `[left] EFFECT START - Loading media. Type: ${leftMediaType}`); loadMediaElement(leftMedia, leftMediaType, 'left').then(el => { if (isMounted.current && !cancelled) setLeftMediaElement(el); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Esq: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingLeft(false); }); return () => { cancelled = true; setLeftMediaElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (leftMediaElement || isLoadingLeft) { setLeftMediaElement(null); setIsLoadingLeft(false); } } }, [leftMedia, leftMediaType]);
    useEffect(() => { if (rightMedia && rightMediaType) { setIsLoadingRight(true); setRightMediaElement(null); let cancelled = false; console.log(logPrefix + `[right] EFFECT START - Loading media. Type: ${rightMediaType}`); loadMediaElement(rightMedia, rightMediaType, 'right').then(el => { if (isMounted.current && !cancelled) setRightMediaElement(el); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Dir: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingRight(false); }); return () => { cancelled = true; setRightMediaElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (rightMediaElement || isLoadingRight) { setRightMediaElement(null); setIsLoadingRight(false); } } }, [rightMedia, rightMediaType]);
    useEffect(() => { if (logo) { setIsLoadingLogo(true); setLogoElement(null); let cancelled = false; console.log(logPrefix + `[logo] EFFECT START - Loading logo.`); loadMediaElement(logo, 'image', 'logo').then(el => { if (isMounted.current && !cancelled) setLogoElement(el as HTMLImageElement); else if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); }).catch(err => { if (isMounted.current && !cancelled) { const msg = err instanceof Error ? err.message : String(err); setSaveError(`Erro Logo: ${msg}`); } }).finally(() => { if (isMounted.current && !cancelled) setIsLoadingLogo(false); }); return () => { cancelled = true; setLogoElement(el => { if (el && el.src.startsWith('blob:')) URL.revokeObjectURL(el.src); return null; }); }; } else { if (logoElement || isLoadingLogo) { setLogoElement(null); setIsLoadingLogo(false); } } }, [logo]);

    // --- Efeito para Acionar Desenhos quando elementos ou parâmetros mudam ---
    useEffect(() => {
        // Redesenha sempre que um elemento de mídia for carregado/removido
        // ou quando zoom/foco mudar (implícito pela dependência de drawPreviewCanvases)
        if (combinedContainerRef.current && combinedContainerRef.current.offsetParent !== null) {
            const rafId = requestAnimationFrame(() => {
                if (isMounted.current && combinedContainerRef.current) {
                    console.log(logPrefix + "Redrawing due to media/param change...");
                    drawPreviewCanvases();
                }
            });
            return () => {
                cancelAnimationFrame(rafId);
            };
        }
    }, [drawPreviewCanvases]); // Depende diretamente do callback que contém as dependências de desenho

    // --- Efeito para Redimensionamento ---
    useEffect(() => {
        const container = combinedContainerRef.current;
        if (!container) return;

        let rafId: number | null = null;
        const triggerDraw = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                if (isMounted.current && combinedContainerRef.current) {
                    console.log(logPrefix + "Redrawing due to resize...");
                    drawPreviewCanvases();
                }
                rafId = null;
            });
        };

        // Chama uma vez no início para garantir o tamanho correto
        const initialDrawTimeout = setTimeout(triggerDraw, 100);

        const resizeObserver = new ResizeObserver(triggerDraw);
        resizeObserver.observe(container);

        return () => {
            clearTimeout(initialDrawTimeout);
            resizeObserver.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
            console.log(logPrefix + "Resize observer disconnected.");
        };
    }, [drawPreviewCanvases]); // Depende do callback de desenho atualizado

    // --- Handlers ---
    const handleMediaUpload = (e: ChangeEvent<HTMLInputElement>, mediaSetter: (v: string | null) => void, typeSetter: (v: MediaType) => void, focusSetter: (v: RelativeFocus) => void, zoomSetter: (v: number) => void) => {
        console.log(logPrefix + `handleMediaUpload fired for input: ${e.target?.id}`);
        const file = e.target.files?.[0];
        // Reset state before loading new file
        focusSetter({ x: 0.5, y: 0.5 });
        zoomSetter(100);
        typeSetter(null);
        mediaSetter(null);
        setSaveError(null); // Clear previous errors

        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result;
                if (typeof result === 'string') {
                    let detectedType: MediaType = null;
                    if (file.type.startsWith('video/')) {
                        detectedType = 'video';
                    } else if (file.type.startsWith('image/')) {
                        detectedType = 'image';
                    } else {
                        console.warn(logPrefix + `Unsupported file type: ${file.type}`);
                        setSaveError(`Tipo de arquivo não suportado: ${file.type}`);
                        return; // Don't set state if type is unsupported
                    }
                    typeSetter(detectedType);
                    mediaSetter(result); // Set media data URL *after* type
                } else {
                    console.error(logPrefix + "FileReader result is not a string.");
                    setSaveError("Erro interno ao ler arquivo.");
                }
            };
            reader.onerror = () => {
                console.error(logPrefix + "FileReader error.");
                setSaveError("Erro ao ler o arquivo.");
            };
            reader.readAsDataURL(file);
        }
        // Clear the input value to allow re-uploading the same file
        e.target.value = '';
    };

    const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
        console.log(logPrefix + `handleLogoUpload fired`);
        const file = e.target.files?.[0];
        // Reset state
        setLogo(null);
        setLogoElement(null); // Ensure element is cleared too
        setSaveError(null);

        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const res = ev.target?.result;
                if (typeof res === 'string') {
                    setLogo(res); // This will trigger the useEffect for loading the logo element
                } else {
                    setSaveError("Erro interno ao ler logo.");
                }
            };
            reader.onerror = () => {
                setSaveError("Erro ao ler logo.");
            };
            reader.readAsDataURL(file);
        } else if (file) {
            setSaveError("Arquivo de logo deve ser uma imagem (ex: PNG, JPG).");
        }
        e.target.value = ''; // Clear input
    };

    const handleInteractionStart = (clientX: number, clientY: number, type: Exclude<DragType, null>) => {
        // Prevent drag if the corresponding media isn't loaded
        if ((type === 'left' && !leftMediaElement) || (type === 'right' && !rightMediaElement) || (type === 'logo' && !logoElement)) {
            console.log(logPrefix + `handleInteractionStart prevented: type=${type}, element missing.`);
            return;
        }
        console.log(logPrefix + `handleInteractionStart: type=${type}`);
        setActiveDrag(type);
        setDragStart({ x: clientX, y: clientY });
        if (type === 'left') setInitialDragFocus(leftRelativeFocus);
        else if (type === 'right') setInitialDragFocus(rightRelativeFocus);
        else if (type === 'logo') setInitialLogoPos(logoPosition);
    };

    const handleInteractionMove = useCallback((clientX: number, clientY: number) => {
        if (!activeDrag) return;

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

        const panMedia = (
            mediaElement: HTMLImageElement | HTMLVideoElement,
            zoom: number,
            setRelativeFocus: React.Dispatch<React.SetStateAction<RelativeFocus>>,
            initialFocus: RelativeFocus
        ) => {
            const currentZoom = zoom / 100;
            const sourceWidth = ('naturalWidth' in mediaElement ? mediaElement.naturalWidth : mediaElement.videoWidth) || 1;
            const sourceHeight = ('naturalHeight' in mediaElement ? mediaElement.naturalHeight : mediaElement.videoHeight) || 1;

            // Recalculate scale based on *destination* area (half width)
            const destAspect = previewHalfWidth / containerHeight;
            const sourceAspect = sourceWidth / sourceHeight;
            let scaleToCover = (sourceAspect > destAspect) ? (containerHeight / sourceHeight) : (previewHalfWidth / sourceWidth);
            const finalScale = scaleToCover * currentZoom;
            if (finalScale <= 0) return false; // Avoid division by zero

            // Calculate how much the focus should shift in relative terms (0-1)
            // The divisor represents how many pixels on screen correspond to the full source width/height
            const effectiveFocusDeltaX = deltaX / (sourceWidth * finalScale);
            const effectiveFocusDeltaY = deltaY / (sourceHeight * finalScale);

            setRelativeFocus({ // Update based on initial focus minus the delta
                x: clamp(initialFocus.x - effectiveFocusDeltaX, 0, 1),
                y: clamp(initialFocus.y - effectiveFocusDeltaY, 0, 1),
            });
            return true;
        };

        if (activeDrag === 'left' && leftMediaElement) {
            if (panMedia(leftMediaElement, leftZoom, setLeftRelativeFocus, initialDragFocus)) {
                needsRedraw = true;
            }
        } else if (activeDrag === 'right' && rightMediaElement) {
            if (panMedia(rightMediaElement, rightZoom, setRightRelativeFocus, initialDragFocus)) {
                needsRedraw = true;
            }
        } else if (activeDrag === 'logo' && logoElement) {
            const percentDeltaX = (deltaX / containerWidth) * 100;
            const percentDeltaY = (deltaY / containerHeight) * 100;
            setLogoPosition({ // Update based on initial position plus the delta
                x: clamp(initialLogoPos.x + percentDeltaX, 0, 100),
                y: clamp(initialLogoPos.y + percentDeltaY, 0, 100),
            });
            // Logo position update doesn't require canvas redraw, only CSS style update (handled by getLogoStyle)
        }

        if (needsRedraw) {
            // Use rAF for smoother updates during drag
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
        }
    }, [activeDrag, dragStart, initialDragFocus, initialLogoPos, leftMediaElement, rightMediaElement, logoElement, leftZoom, rightZoom, drawPreviewCanvases]); // Include logoElement here

    const handleInteractionEnd = useCallback(() => {
        if (activeDrag) {
            console.log(logPrefix + `handleInteractionEnd: was dragging=${activeDrag}`);
            setActiveDrag(null);
            setIsTouching(false); // Ensure touch state is reset
            if (animationFrameId.current) { // Cancel any pending frame on end
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
             // Optional: Trigger one final draw for highest quality after interaction
            // requestAnimationFrame(drawPreviewCanvases);
        }
    }, [activeDrag /*, drawPreviewCanvases */]); // drawPreviewCanvases removed if final draw isn't needed

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
        if (e.button !== 0 || isTouching) return; // Only left clicks, ignore if touch is active
        const target = e.target as HTMLElement;
        // Check if the click is directly on the interactive area or the logo container
        if (target.getAttribute('data-interactive-area') === String(type) || (type === 'logo' && target.closest('[data-logo-container]'))) {
            e.preventDefault();
            e.stopPropagation();
            handleInteractionStart(e.clientX, e.clientY, type);
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        // Only handle if dragging and not currently touching
        if (activeDrag && !isTouching) {
            e.preventDefault(); // Prevent text selection etc. during drag
            handleInteractionMove(e.clientX, e.clientY);
        }
    }, [activeDrag, isTouching, handleInteractionMove]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        // Only handle if dragging, left button released, and not a touch interaction
        if (e.button === 0 && activeDrag && !isTouching) {
            handleInteractionEnd();
        }
    }, [activeDrag, isTouching, handleInteractionEnd]);

    const handleTouchStart = (e: TouchEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
        const target = e.target as HTMLElement;
        // Check if the touch is directly on the interactive area or the logo container
        if (target.getAttribute('data-interactive-area') === String(type) || (type === 'logo' && target.closest('[data-logo-container]'))) {
             e.stopPropagation(); // Prevent outer elements from scrolling etc.
             if (e.touches.length === 1) { // Only single touch drag
                 setIsTouching(true); // Set touch flag
                 const touch = e.touches[0];
                 handleInteractionStart(touch.clientX, touch.clientY, type);
             } else {
                 // If more than one touch, cancel any potential drag
                 handleInteractionEnd();
             }
        }
    };

    const handleTouchMove = useCallback((e: globalThis.TouchEvent) => {
        // Only handle if dragging, touch is active, and it's a single touch
        if (activeDrag && isTouching && e.touches.length === 1) {
             e.preventDefault(); // Prevent scrolling during drag
             handleInteractionMove(e.touches[0].clientX, e.touches[0].clientY);
        } else if(activeDrag && isTouching) {
             // If touch count changes during drag, end interaction
             handleInteractionEnd();
        }
    }, [activeDrag, isTouching, handleInteractionMove, handleInteractionEnd]);

    const handleTouchEnd = useCallback((e: globalThis.TouchEvent) => {
        // End interaction if touch was active and no touches remain
        if (isTouching && activeDrag && e.touches.length === 0) {
             handleInteractionEnd();
        }
    }, [isTouching, activeDrag, handleInteractionEnd]);

    const internalHandleWheelZoom = useCallback((e: WheelEvent, zoomSetter: React.Dispatch<React.SetStateAction<number>>, minZoom = 10, maxZoom = 500) => {
        e.preventDefault();
        e.stopPropagation();
        const zoomAmount = e.deltaY * -0.2; // Adjust multiplier for sensitivity
        zoomSetter(prevZoom => clamp(prevZoom + zoomAmount, minZoom, maxZoom));
        // Request redraw after zoom change
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
    }, [drawPreviewCanvases]);

    // --- Efeito para Listeners Globais (Mouse/Touch Move/End) ---
    useEffect(() => {
        const touchMoveOptions = { passive: false }; // Need false to call preventDefault in handleTouchMove

        const addListeners = () => {
            // Check the type of interaction to add appropriate listeners
            if (isTouching) {
                document.addEventListener('touchmove', handleTouchMove, touchMoveOptions);
                document.addEventListener('touchend', handleTouchEnd);
                document.addEventListener('touchcancel', handleTouchEnd);
            } else {
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            }
            // Apply styles to prevent selection and indicate grabbing
            document.body.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        };

        const removeListeners = () => {
            document.removeEventListener('touchmove', handleTouchMove, touchMoveOptions);
            document.removeEventListener('touchend', handleTouchEnd);
            document.removeEventListener('touchcancel', handleTouchEnd);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            // Reset styles only if not actively dragging anymore
            if (!activeDrag) { // Check activeDrag again inside removeListeners
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        // Add listeners only when a drag is active
        if (activeDrag) {
            addListeners();
        } else {
            // Ensure styles are reset if drag ends unexpectedly
             document.body.style.cursor = '';
             document.body.style.userSelect = '';
        }

        // Cleanup function: always remove listeners when effect re-runs or component unmounts
        return () => {
            removeListeners();
        };
    }, [activeDrag, isTouching, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]); // Dependencies trigger effect when drag starts/ends or touch state changes

    // --- EFEITO PARA ADICIONAR LISTENER DE WHEEL NÃO-PASSIVO ---
    useEffect(() => {
        const leftDiv = leftInteractiveRef.current;
        const rightDiv = rightInteractiveRef.current;
        // Need passive: false to call preventDefault inside internalHandleWheelZoom
        const wheelOptions = { passive: false };

        // Wrap handlers to ensure elements exist and pass correct setters
        const handleLeftWheel = (e: WheelEvent) => {
            if (leftMediaElement) internalHandleWheelZoom(e, setLeftZoom);
        }
        const handleRightWheel = (e: WheelEvent) => {
            if (rightMediaElement) internalHandleWheelZoom(e, setRightZoom);
        }

        if (leftDiv) {
            leftDiv.addEventListener('wheel', handleLeftWheel, wheelOptions);
            console.log(logPrefix + "Added wheel listener to left div");
        }
        if (rightDiv) {
            rightDiv.addEventListener('wheel', handleRightWheel, wheelOptions);
            console.log(logPrefix + "Added wheel listener to right div");
        }

        return () => {
            if (leftDiv) {
                leftDiv.removeEventListener('wheel', handleLeftWheel, wheelOptions);
                console.log(logPrefix + "Removed wheel listener from left div");
            }
            if (rightDiv) {
                rightDiv.removeEventListener('wheel', handleRightWheel, wheelOptions);
                console.log(logPrefix + "Removed wheel listener from right div");
            }
        };
        // Re-attach if elements or zoom handlers change (internalHandleWheelZoom changes if drawPreviewCanvases changes)
    }, [internalHandleWheelZoom, leftMediaElement, rightMediaElement]);

    // --- Lógica `canSave` ---
    const canSave = leftMediaType === 'image' && rightMediaType === 'image'
        && !!leftMediaElement && leftMediaElement instanceof HTMLImageElement && leftMediaElement.naturalWidth > 0 && leftMediaElement.naturalHeight > 0
        && !!rightMediaElement && rightMediaElement instanceof HTMLImageElement && rightMediaElement.naturalWidth > 0 && rightMediaElement.naturalHeight > 0;

    // --- Lógica de Salvamento ---
    const saveCompositeImage = async () => {
        console.log(logPrefix + "Save button clicked. canSave:", canSave);
        if (!canSave) {
            console.warn(logPrefix + "Save attempt failed: Conditions not met.", {
                canSave,
                leftMediaType,
                rightMediaType,
                leftEl: !!leftMediaElement,
                rightEl: !!rightMediaElement,
                leftW: leftMediaElement && 'naturalWidth' in leftMediaElement ? leftMediaElement.naturalWidth : undefined,
                leftH: leftMediaElement && 'naturalHeight' in leftMediaElement ? leftMediaElement.naturalHeight : undefined,
                rightW: rightMediaElement && 'naturalWidth' in rightMediaElement ? rightMediaElement.naturalWidth : undefined,
                rightH: rightMediaElement && 'naturalHeight' in rightMediaElement ? rightMediaElement.naturalHeight : undefined,
            });
            setSaveError("Ambos os lados devem ser imagens carregadas e válidas para salvar.");
            return;
        }

        // Type assertion is safe here due to canSave check
        const safeLeftElement = leftMediaElement as HTMLImageElement;
        const safeRightElement = rightMediaElement as HTMLImageElement;

        setIsSaving(true);
        setSaveError(null);
        console.log(logPrefix + "--- Starting Save ---");

        try {
            // --- Define Final Output Dimensions ---
            // Option 1: Fixed Width (like your original)
            // const finalWidth = 1920;
            // const finalHalfWidth = finalWidth / 2;
            // // Calculate heights based on maintaining aspect ratio for each half
            // const leftTargetHeight = finalHalfWidth * (safeLeftElement.naturalHeight / safeLeftElement.naturalWidth);
            // const rightTargetHeight = finalHalfWidth * (safeRightElement.naturalHeight / safeRightElement.naturalWidth);
            // // Use the maximum height to ensure both images fit fully
            // const finalHeight = Math.ceil(Math.max(leftTargetHeight, rightTargetHeight));

            // Option 2: Use native resolution of one image (e.g., left) as basis?
            // const finalWidth = safeLeftElement.naturalWidth * 2; // Double width for side-by-side
            // const finalHeight = safeLeftElement.naturalHeight; // Keep original height

            // Option 3: Use the HIGHEST resolution available as basis (might create large files)
             const targetWidthPerImage = Math.max(safeLeftElement.naturalWidth, safeRightElement.naturalWidth);
             const finalWidth = targetWidthPerImage * 2;
             // Calculate height based on the tallest image at the target width per side
             const leftHeightAtTarget = targetWidthPerImage * (safeLeftElement.naturalHeight / safeLeftElement.naturalWidth);
             const rightHeightAtTarget = targetWidthPerImage * (safeRightElement.naturalHeight / safeRightElement.naturalWidth);
             const finalHeight = Math.ceil(Math.max(leftHeightAtTarget, rightHeightAtTarget));


            if (!Number.isFinite(finalWidth) || finalWidth <= 0 || !Number.isFinite(finalHeight) || finalHeight <= 0) {
                 throw new Error(`Dimensões finais calculadas inválidas: ${finalWidth}x${finalHeight}. Verifique as dimensões das imagens originais.`);
            }
            console.log(logPrefix + `Final canvas size: ${finalWidth}x${finalHeight}`);

            const canvas = document.createElement('canvas');
            canvas.width = finalWidth;
            canvas.height = finalHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) throw new Error("Não foi possível obter o contexto 2D final.");

            // Optional: Fill background if images might not cover fully
            ctx.fillStyle = '#ffffff'; // or another background color
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            console.log(logPrefix + "Drawing Left (Final)...");
            // Use a separate drawing function for final output OR reuse drawMediaSection carefully
            // Reusing drawMediaSection: We need to pass the *final* dimensions
            // Note: The 'dx' inside drawMediaSection is 0 for both left and right contexts,
            // but here we draw onto a single context, so we *do* need an offset for the right side.
            // LET'S CREATE A SPECIFIC FINAL DRAW FUNCTION TO AVOID CONFUSION.

            const drawFinalMedia = (
                finalCtx: CanvasRenderingContext2D,
                mediaEl: HTMLImageElement,
                section: 'left' | 'right',
                outputWidth: number,
                outputHeight: number,
                zoom: number,
                focus: RelativeFocus
            ) => {
                finalCtx.save();
                const sectionWidth = outputWidth / 2; // Width of this section in the final canvas
                const sectionHeight = outputHeight; // Height of this section
                const sectionDx = section === 'left' ? 0 : sectionWidth; // X offset in the final canvas
                const sectionDy = 0; // Y offset

                // Clip drawing to the specific section to prevent overflow
                finalCtx.beginPath();
                finalCtx.rect(sectionDx, sectionDy, sectionWidth, sectionHeight);
                finalCtx.clip();

                // Reuse the core logic from drawMediaSection, adapting destination parameters
                const sourceWidth = mediaEl.naturalWidth;
                const sourceHeight = mediaEl.naturalHeight;
                const overallScale = zoom / 100;
                const sourceAspect = sourceWidth / sourceHeight;
                const destAspect = sectionWidth / sectionHeight; // Use section aspect ratio

                let coverScale: number;
                if (sourceAspect > destAspect) { coverScale = sectionHeight / sourceHeight; } else { coverScale = sectionWidth / sourceWidth; }
                const finalScale = coverScale * overallScale;
                const sWidthFinal = sectionWidth / finalScale;
                const sHeightFinal = sectionHeight / finalScale;
                let sxIdeal = sourceWidth * focus.x - sWidthFinal / 2;
                let syIdeal = sourceHeight * focus.y - sHeightFinal / 2;
                const sx = clamp(sxIdeal, 0, Math.max(0, sourceWidth - sWidthFinal));
                const sy = clamp(syIdeal, 0, Math.max(0, sourceHeight - sHeightFinal));
                const sWidth = sWidthFinal;
                const sHeight = sHeightFinal;

                // Draw into the correct section of the final canvas
                finalCtx.drawImage(mediaEl, sx, sy, sWidth, sHeight, sectionDx, sectionDy, sectionWidth, sectionHeight);
                console.log(logPrefix + `[${section}] Final Draw Params: sx=${sx.toFixed(1)}, sy=${sy.toFixed(1)}, sW=${sWidth.toFixed(1)}, sH=${sHeight.toFixed(1)} -> dX=${sectionDx}, dY=${sectionDy}, dW=${sectionWidth}, dH=${sectionHeight}`);

                finalCtx.restore(); // Remove clipping path
            };

            drawFinalMedia(ctx, safeLeftElement, 'left', finalWidth, finalHeight, leftZoom, leftRelativeFocus);

            console.log(logPrefix + "Drawing Right (Final)...");
            drawFinalMedia(ctx, safeRightElement, 'right', finalWidth, finalHeight, rightZoom, rightRelativeFocus);

            // --- Draw Logo (Final) ---
            if (logoElement && logoElement.naturalWidth > 0 && logoElement.naturalHeight > 0) {
                console.log(logPrefix + "Drawing Logo (Final)...");
                const logoAspectRatio = logoElement.naturalHeight / logoElement.naturalWidth;
                // Calculate logo size relative to the *final* image width
                const targetLogoWidth = (finalWidth * logoZoom) / 100; // logoZoom is % of total width
                const targetLogoHeight = targetLogoWidth * (isNaN(logoAspectRatio) ? 1 : logoAspectRatio);

                // Calculate logo center position based on final dimensions and relative position
                const logoCenterX = (finalWidth * logoPosition.x) / 100;
                const logoCenterY = (finalHeight * logoPosition.y) / 100;

                // Calculate top-left corner for drawing
                let logoDrawX = logoCenterX - targetLogoWidth / 2;
                let logoDrawY = logoCenterY - targetLogoHeight / 2;

                 // Clamp logo position to stay within canvas bounds (optional but good practice)
                 logoDrawX = clamp(logoDrawX, 0, finalWidth - targetLogoWidth);
                 logoDrawY = clamp(logoDrawY, 0, finalHeight - targetLogoHeight);

                ctx.drawImage(logoElement, logoDrawX, logoDrawY, targetLogoWidth, targetLogoHeight);
                console.log(logPrefix + `Logo drawn at ${logoDrawX.toFixed(1)},${logoDrawY.toFixed(1)} size ${targetLogoWidth.toFixed(1)}x${targetLogoHeight.toFixed(1)}.`);
            } else {
                console.log(logPrefix + "Skipping final logo draw (not loaded or invalid).");
            }

            console.log(logPrefix + "Generating Blob...");
            canvas.toBlob(
                (blob) => {
                    if (blob && isMounted.current) {
                        console.log(logPrefix + "Blob created, triggering download...");
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'imagem-combinada.png'; // Set filename
                        document.body.appendChild(a); // Required for Firefox
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url); // Clean up blob URL
                        console.log(logPrefix + "Download triggered and cleanup done.");
                        setIsSaving(false);
                    } else {
                        if (!isMounted.current) {
                            console.log(logPrefix + "Blob generation/download cancelled, component unmounted.");
                            // No need to set state if unmounted
                        } else {
                            console.error(logPrefix + "Failed to generate blob (blob is null).");
                            setSaveError("Falha ao gerar o blob da imagem final.");
                            setIsSaving(false);
                        }
                    }
                },
                'image/png', // Specify PNG format
                0.95 // Quality setting (0 to 1) for PNG (often ignored) or JPEG
            );

        } catch (error) {
            console.error(logPrefix + 'Error during save:', error);
            if (isMounted.current) {
                const msg = error instanceof Error ? error.message : String(error);
                setSaveError(`Falha ao salvar: ${msg}`);
                setIsSaving(false);
            }
        }
    };

    // --- Calcula Estilos do Logo (para preview) ---
    const getLogoStyle = (): React.CSSProperties => {
        const container = combinedContainerRef.current;
        // Ensure logo is loaded and container exists
        if (!container || !logoElement || !logo || logoElement.naturalWidth <= 0 || logoElement.naturalHeight <= 0) {
            return { display: 'none' }; // Hide if no logo or container
        }

        const previewContainerWidth = container.offsetWidth;
        const previewContainerHeight = container.offsetHeight;
        if (previewContainerWidth <= 0 || previewContainerHeight <= 0) {
            return { display: 'none' }; // Hide if container has no size
        }

        // Calculate logo size based on preview container width and logoZoom percentage
        const previewLogoWidthPx = (previewContainerWidth * logoZoom) / 100;
        const aspectRatio = logoElement.naturalHeight / logoElement.naturalWidth;
        const previewLogoHeightPx = previewLogoWidthPx * (isNaN(aspectRatio) ? 1 : aspectRatio); // Use aspect ratio

        // Calculate center position based on preview container size and logoPosition percentage
        const centerX = (previewContainerWidth * logoPosition.x) / 100;
        const centerY = (previewContainerHeight * logoPosition.y) / 100;

        // Calculate top-left position for absolute positioning
        const topLeftX = centerX - previewLogoWidthPx / 2;
        const topLeftY = centerY - previewLogoHeightPx / 2;

        return {
            position: 'absolute',
            left: `${topLeftX}px`,
            top: `${topLeftY}px`,
            width: `${previewLogoWidthPx}px`,
            height: `${previewLogoHeightPx}px`, // Set height based on aspect ratio
            cursor: activeDrag === 'logo' ? 'grabbing' : 'grab',
            zIndex: 10, // Ensure logo is above canvases
            userSelect: 'none', // Prevent text selection
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            touchAction: 'none', // Prevent default touch actions like scrolling
            // Use background image for better scaling/containment control
            backgroundImage: `url(${logo})`,
            backgroundSize: 'contain', // Scale logo to fit within the dimensions
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            // Add border for visual feedback during interaction
            border: `1px dashed ${activeDrag === 'logo' ? 'rgba(0, 100, 255, 0.8)' : 'transparent'}`,
            opacity: activeDrag === 'logo' ? 0.8 : 1.0,
            transition: 'border-color 0.2s ease, opacity 0.2s ease', // Smooth transitions
        };
    };

    // --- Estrutura JSX ---
    return (
        <div className="w-full max-w-7xl mx-auto p-2 sm:p-4">
            {/* Título */}
            <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Editor de Combinação</h1>

            {/* Área de Upload */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
                 {/* Card Esquerda */}
                 <Card className="p-3 md:p-4">
                     <CardHeader className='p-0 mb-3'>
                         <CardTitle className="text-base md:text-lg font-medium flex items-center gap-1">
                             {leftMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Esquerda
                             {isLoadingLeft && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>}
                         </CardTitle>
                     </CardHeader>
                     <CardContent className='p-0'>
                         <MediaInput
                             id="left-media-upload"
                             label="Carregar Esquerda"
                             accept="image/*,video/*"
                             onMediaUpload={(e) => handleMediaUpload(e, setLeftMedia, setLeftMediaType, setLeftRelativeFocus, setLeftZoom)}
                             className="mb-2"
                         />
                         {/* Preview no Card */}
                         {leftMedia && (
                             <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground">
                                 {isLoadingLeft
                                     ? "Carregando..."
                                     : leftMediaElement && leftMediaType === 'video'
                                         ? <video src={leftMedia} className="w-full h-full object-contain" muted loop playsInline autoPlay key={`preview-left-${leftMedia.substring(0,10)}`} aria-label="Preview vídeo esquerdo"/>
                                         : leftMediaElement && leftMediaType === 'image'
                                             ? <img src={leftMedia} alt="Preview esquerda" className="w-full h-full object-contain" />
                                             : !isLoadingLeft && !leftMediaElement // Se não está carregando E não tem elemento -> falha
                                                 ? <div className="text-destructive p-2">Falha no carregamento</div>
                                                 : "Selecione um arquivo" // Estado inicial ou tipo inválido
                                 }
                             </div>
                         )}
                     </CardContent>
                 </Card>

                 {/* Card Direita */}
                 <Card className="p-3 md:p-4">
                     <CardHeader className='p-0 mb-3'>
                         <CardTitle className="text-base md:text-lg font-medium flex items-center gap-1">
                             {rightMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Direita
                             {isLoadingRight && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>}
                         </CardTitle>
                     </CardHeader>
                     <CardContent className='p-0'>
                         <MediaInput
                             id="right-media-upload"
                             label="Carregar Direita"
                             accept="image/*,video/*"
                             onMediaUpload={(e) => handleMediaUpload(e, setRightMedia, setRightMediaType, setRightRelativeFocus, setRightZoom)}
                             className="mb-2"
                         />
                         {/* Preview no Card */}
                          {rightMedia && (
                             <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground">
                                 {isLoadingRight
                                     ? "Carregando..."
                                     : rightMediaElement && rightMediaType === 'video'
                                         ? <video src={rightMedia} className="w-full h-full object-contain" muted loop playsInline autoPlay key={`preview-right-${rightMedia.substring(0,10)}`} aria-label="Preview vídeo direito"/>
                                         : rightMediaElement && rightMediaType === 'image'
                                             ? <img src={rightMedia} alt="Preview direita" className="w-full h-full object-contain" />
                                             : !isLoadingRight && !rightMediaElement // Se não está carregando E não tem elemento -> falha
                                                 ? <div className="text-destructive p-2">Falha no carregamento</div>
                                                 : "Selecione um arquivo" // Estado inicial ou tipo inválido
                                 }
                             </div>
                         )}
                     </CardContent>
                 </Card>

                 {/* Card Logo */}
                 <Card className="p-3 md:p-4">
                     <CardHeader className='p-0 mb-3'>
                         <CardTitle className="text-base md:text-lg font-medium">
                             Logo
                             {isLoadingLogo && <span className='text-xs text-muted-foreground ml-2'>(Carregando...)</span>}
                         </CardTitle>
                     </CardHeader>
                     <CardContent className='p-0'>
                         <MediaInput
                            id="logo-upload"
                            label="Carregar Logo (Opcional)"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml" // Aceita formatos comuns de imagem
                            onMediaUpload={handleLogoUpload}
                            className="mb-2"
                         />
                         {/* Elemento img oculto para carregar o logo e obter dimensões */}
                         <img ref={logoRef} src={logo ?? undefined} alt="" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
                         {/* Preview no Card */}
                         {logo && (
                             <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative flex items-center justify-center text-sm text-muted-foreground">
                                 {isLoadingLogo
                                    ? "Carregando..."
                                    : logoElement
                                        ? <img src={logo} alt="Preview logo" className="w-full h-full object-contain" />
                                        : !isLoadingLogo && !logoElement // Falha
                                            ? <div className="text-destructive p-2">Falha ao carregar logo</div>
                                            : "Selecione um arquivo"
                                 }
                             </div>
                         )}
                     </CardContent>
                 </Card>
            </div>

            {/* Editor e Controles */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Área de Preview Combinado */}
                <div className="lg:col-span-2">
                    <Card
                        className="p-0 bg-slate-700 dark:bg-slate-900 relative overflow-hidden aspect-video touch-none select-none" // touch-none é crucial para prevenir scroll no mobile
                        ref={combinedContainerRef}
                        style={{ cursor: activeDrag ? 'grabbing' : 'default' }}
                    >
                        <div className="flex h-full w-full relative">
                            {/* Wrapper Esquerdo Interativo */}
                            <div
                                ref={leftInteractiveRef} // Ref para listener de wheel
                                data-interactive-area="left" // Atributo para identificar a área no start
                                className={cn(
                                    "w-1/2 h-full relative border-r border-gray-500 dark:border-gray-600 bg-muted/50 flex items-center justify-center",
                                    leftMediaElement ? (activeDrag === 'left' ? 'cursor-grabbing' : 'cursor-grab') : "cursor-default" // Cursor dinâmico
                                )}
                                onMouseDown={(e) => handleMouseDown(e, 'left')}
                                onTouchStart={(e) => handleTouchStart(e, 'left')}
                                style={{ touchAction: 'none' }} // Garante que o touch start seja capturado
                            >
                                <canvas ref={leftPreviewCanvasRef} className="absolute top-0 left-0 w-full h-full block pointer-events-none" aria-label="Pré-visualização interativa esquerda" />
                                {/* Indicador de Loading */}
                                {isLoadingLeft && (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-200 text-sm font-medium pointer-events-none bg-black/50 z-[5]">
                                        Carregando Esquerda...
                                    </div>
                                )}
                                {/* Placeholder se vazio */}
                                {!leftMediaElement && !isLoadingLeft && (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
                                        Lado Esquerdo Vazio
                                    </div>
                                )}
                            </div>

                            {/* Wrapper Direito Interativo */}
                            <div
                                ref={rightInteractiveRef} // Ref para listener de wheel
                                data-interactive-area="right" // Atributo para identificar a área no start
                                className={cn(
                                    "w-1/2 h-full relative bg-muted/50 flex items-center justify-center",
                                     rightMediaElement ? (activeDrag === 'right' ? 'cursor-grabbing' : 'cursor-grab') : "cursor-default" // Cursor dinâmico
                                )}
                                onMouseDown={(e) => handleMouseDown(e, 'right')}
                                onTouchStart={(e) => handleTouchStart(e, 'right')}
                                style={{ touchAction: 'none' }} // Garante que o touch start seja capturado
                            >
                                <canvas ref={rightPreviewCanvasRef} className="absolute top-0 left-0 w-full h-full block pointer-events-none" aria-label="Pré-visualização interativa direita" />
                                {/* Indicador de Loading */}
                                {isLoadingRight && (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-200 text-sm font-medium pointer-events-none bg-black/50 z-[5]">
                                         Carregando Direita...
                                    </div>
                                )}
                                {/* Placeholder se vazio */}
                                {!rightMediaElement && !isLoadingRight && (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
                                        Lado Direito Vazio
                                    </div>
                                )}
                            </div>

                            {/* Overlay do Logo Interativo */}
                            {logoElement && logo && logoElement.naturalWidth > 0 && (
                                <div
                                    data-logo-container // Identificador para eventos
                                    style={getLogoStyle()} // Estilos dinâmicos para posição e tamanho
                                    onMouseDown={(e) => handleMouseDown(e, 'logo')}
                                    onTouchStart={(e) => handleTouchStart(e, 'logo')}
                                    role="button" // Semântica de interação
                                    aria-label="Mover e redimensionar logo"
                                    tabIndex={0} // Permite foco pelo teclado (opcional)
                                    className="hover:opacity-90" // Feedback visual no hover
                                >
                                   {/* Conteúdo interno opcional, ou deixar vazio para usar background */}
                                </div>
                             )}
                        </div>
                    </Card>

                    {/* Botão Salvar e Mensagens */}
                    <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        {/* Mensagens de Aviso/Erro */}
                        <div className="flex-grow flex flex-col gap-2 w-full sm:w-auto">
                             {(leftMediaType === 'video' || rightMediaType === 'video') && !isSaving && (
                                <Alert variant="default" className="w-full text-xs sm:text-sm p-2 sm:p-3">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle className="text-xs sm:text-sm font-semibold">Aviso Vídeo</AlertTitle>
                                    <AlertDescription className="text-xs sm:text-sm">
                                        Pré-visualização de vídeo mostra apenas o 1º quadro. O download final está disponível apenas para combinação de **imagens**.
                                    </AlertDescription>
                                </Alert>
                             )}
                             {saveError && (
                                <Alert variant="destructive" className="w-full text-xs sm:text-sm p-2 sm:p-3">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle className="text-xs sm:text-sm font-semibold">Erro</AlertTitle>
                                    <AlertDescription className="text-xs sm:text-sm">
                                        {saveError}
                                    </AlertDescription>
                                </Alert>
                             )}
                        </div>
                        {/* Botão Salvar */}
                        <Button
                            onClick={saveCompositeImage}
                            disabled={!canSave || isSaving || isLoadingLeft || isLoadingRight || isLoadingLogo}
                            className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0"
                            aria-label={canSave ? "Baixar imagem combinada" : "Carregue duas imagens válidas para poder baixar"}
                            title={
                                !canSave ? "Carregue uma imagem válida em ambos os lados para habilitar o download."
                                : isSaving ? "Salvando imagem..."
                                : (isLoadingLeft || isLoadingRight || isLoadingLogo) ? "Aguarde o carregamento das mídias..."
                                : "Baixar imagem combinada (PNG)"
                            }
                        >
                            {isSaving ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Baixar Imagem
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Área de Controles (Abas) */}
                <div className="lg:col-span-1">
                    <Tabs defaultValue="left" className="w-full">
                        <TabsList className="grid grid-cols-3 w-full">
                            <TabsTrigger value="left" disabled={!leftMediaElement || isLoadingLeft}>Esquerda</TabsTrigger>
                            <TabsTrigger value="right" disabled={!rightMediaElement || isLoadingRight}>Direita</TabsTrigger>
                            <TabsTrigger value="logo" disabled={!logoElement || isLoadingLogo}>Logo</TabsTrigger>
                        </TabsList>

                        {/* Aba Esquerda */}
                        <TabsContent value="left" className="mt-4 space-y-4">
                             <Card className="p-4">
                                <Label htmlFor="left-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Zoom ({leftZoom.toFixed(0)}%)</Label>
                                <Slider
                                    id="left-zoom"
                                    min={10} max={500} step={1} value={[leftZoom]}
                                    onValueChange={(v) => {
                                        setLeftZoom(v[0]);
                                        // Redesenha imediatamente no preview ao mudar o slider
                                        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                                        animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
                                    }}
                                    disabled={!leftMediaElement || isLoadingLeft}
                                    aria-label="Ajustar zoom da imagem esquerda"
                                />
                                <div className="mt-4">
                                    <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Foco)</Label>
                                    <p className="text-xs text-muted-foreground">Arraste a imagem na pré-visualização para ajustar o foco.</p>
                                    {/* Opcional: Mostrar coords de foco */}
                                    {/* <p className="text-xs text-muted-foreground mt-1">X: {leftRelativeFocus.x.toFixed(2)}, Y: {leftRelativeFocus.y.toFixed(2)}</p> */}
                                </div>
                             </Card>
                        </TabsContent>

                        {/* Aba Direita */}
                        <TabsContent value="right" className="mt-4 space-y-4">
                            <Card className="p-4">
                                <Label htmlFor="right-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Zoom ({rightZoom.toFixed(0)}%)</Label>
                                <Slider
                                    id="right-zoom"
                                    min={10} max={500} step={1} value={[rightZoom]}
                                    onValueChange={(v) => {
                                        setRightZoom(v[0]);
                                        // Redesenha imediatamente no preview ao mudar o slider
                                        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
                                        animationFrameId.current = requestAnimationFrame(drawPreviewCanvases);
                                     }}
                                    disabled={!rightMediaElement || isLoadingRight}
                                    aria-label="Ajustar zoom da imagem direita"
                                />
                                <div className="mt-4">
                                    <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Foco)</Label>
                                    <p className="text-xs text-muted-foreground">Arraste a imagem na pré-visualização para ajustar o foco.</p>
                                     {/* Opcional: Mostrar coords de foco */}
                                    {/* <p className="text-xs text-muted-foreground mt-1">X: {rightRelativeFocus.x.toFixed(2)}, Y: {rightRelativeFocus.y.toFixed(2)}</p> */}
                               </div>
                             </Card>
                        </TabsContent>

                        {/* Aba Logo */}
                        <TabsContent value="logo" className="mt-4 space-y-4">
                            <Card className="p-4">
                                <Label htmlFor="logo-zoom" className="block mb-2 font-medium flex items-center"><ZoomIn size={16} className="mr-2" /> Largura Relativa ({logoZoom.toFixed(1)}%)</Label>
                                <Slider
                                    id="logo-zoom"
                                    min={1} max={50} step={0.5} value={[logoZoom]}
                                    onValueChange={(v) => setLogoZoom(v[0])} // Atualiza estilo via getLogoStyle
                                    disabled={!logoElement || isLoadingLogo}
                                    aria-label="Ajustar tamanho relativo do logo"
                                />
                                <div className="mt-4">
                                    <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição Central</Label>
                                    <p className="text-xs text-muted-foreground">Arraste o logo na pré-visualização ou ajuste abaixo.</p>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <div>
                                            <Label htmlFor="logo-pos-x" className='text-xs text-muted-foreground'>X (%)</Label>
                                            <Input
                                                id="logo-pos-x" type="number" min={0} max={100} step={0.1}
                                                value={logoPosition.x.toFixed(1)}
                                                onChange={(e) => setLogoPosition(p => ({ ...p, x: clamp(Number(e.target.value),0,100) }))}
                                                disabled={!logoElement || isLoadingLogo}
                                                aria-label="Ajustar posição horizontal do logo em porcentagem"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="logo-pos-y" className='text-xs text-muted-foreground'>Y (%)</Label>
                                            <Input
                                                id="logo-pos-y" type="number" min={0} max={100} step={0.1}
                                                value={logoPosition.y.toFixed(1)}
                                                onChange={(e) => setLogoPosition(p => ({ ...p, y: clamp(Number(e.target.value),0,100) }))}
                                                disabled={!logoElement || isLoadingLogo}
                                                aria-label="Ajustar posição vertical do logo em porcentagem"
                                            />
                                        </div>
                                    </div>
                                </div>
                             </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Seção Editor AI */}
            <div className="mt-12 md:mt-16">
                <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Edite sua foto com IA</h2>
                <GeminiImageEditor />
            </div>
        </div>
    );
}