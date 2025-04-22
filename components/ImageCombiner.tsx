// components/ImageCombiner.tsx
"use client"
import React, { useState, useRef, useEffect, useCallback, WheelEvent, TouchEvent, ChangeEvent } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Save, ZoomIn, Move, Video, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { GeminiImageEditor } from './gemini-image-editor';
import { MediaInput } from './media-input'; // Import the new MediaInput

type MediaType = 'image' | 'video' | null;
type DragType = 'left' | 'right' | 'logo' | null;

// Clamping utility
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

export default function ImageCombiner() {
  // States for media sources and types
  const [leftMedia, setLeftMedia] = useState<string | null>(null);
  const [rightMedia, setRightMedia] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [leftMediaType, setLeftMediaType] = useState<MediaType>(null);
  const [rightMediaType, setRightMediaType] = useState<MediaType>(null);

  // States for control
  const [leftZoom, setLeftZoom] = useState(100); // Percentage zoom (e.g., 100 = 100%)
  const [rightZoom, setRightZoom] = useState(100); // Percentage zoom
  const [logoZoom, setLogoZoom] = useState(10); // Percentage of total final image width (e.g., 10 = 10%)

  const [leftPosition, setLeftPosition] = useState({ x: 0, y: 0 }); // Pixel offset in preview relative to top-left
  const [rightPosition, setRightPosition] = useState({ x: 0, y: 0 }); // Pixel offset in preview relative to top-left
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 90 }); // Position of logo CENTER as percentage (x, y)

  // Refs for elements
  const leftMediaRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;; // Ref for the draggable container of left media
  const rightMediaRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;; // Ref for the draggable container of right media
  const logoRef = useRef<HTMLImageElement>(null); // Ref the actual logo IMG tag to get its natural dimensions
  const combinedContainerRef = useRef<HTMLDivElement>(null); // Ref for the main preview container

  // Drag/Touch state
  const [activeDrag, setActiveDrag] = useState<DragType>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // Screen coordinates where drag started
  const [initialDragPos, setInitialDragPos] = useState({ x: 0, y: 0 }); // Initial position.{x,y} of the element being dragged
  const [isTouching, setIsTouching] = useState(false); // Track if a touch interaction is active
  const isPinching = false; // Basic pinch detection placeholder (implement if needed)

  // Loading/Error State for saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Handlers ---

  const handleMediaUpload = (
    e: ChangeEvent<HTMLInputElement>,
    mediaSetter: (value: string | null) => void,
    typeSetter: (value: MediaType) => void,
    posSetter: (value: { x: number; y: number }) => void, // Add position setter
    zoomSetter: (value: number) => void // Add zoom setter
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          mediaSetter(result);
          // Reset position and zoom when new media is loaded
          posSetter({ x: 0, y: 0 });
          zoomSetter(100);
          // Determine media type
          if (file.type.startsWith('video/')) {
            typeSetter('video');
          } else if (file.type.startsWith('image/')) {
            typeSetter('image');
          } else {
            typeSetter(null); // Unknown type
          }
        }
      };
      reader.readAsDataURL(file);
    }
     // Reset input value to allow re-uploading the same file
     e.target.value = '';
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) { // Only allow image for logo
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setLogo(result);
          // Reset logo position/zoom? Optional, maybe keep position but reset zoom?
          // setLogoPosition({ x: 50, y: 90 });
          // setLogoZoom(10);
        }
      };
      reader.readAsDataURL(file);
    } else if (file) {
        alert("Por favor, selecione um arquivo de imagem para o logo.")
    }
     // Reset input value
     e.target.value = '';
  };

  // --- Unified Drag/Pan Logic ---
  const handleInteractionStart = (
    clientX: number,
    clientY: number,
    type: Exclude<DragType, null>
  ) => {
    setActiveDrag(type);
    setDragStart({ x: clientX, y: clientY });

    // Store the initial pixel/percentage position of the element being dragged
    if (type === 'left') setInitialDragPos(leftPosition);
    else if (type === 'right') setInitialDragPos(rightPosition);
    else if (type === 'logo') setInitialDragPos(logoPosition); // Logo uses percentage
  };

  const handleInteractionMove = useCallback((clientX: number, clientY: number) => {
    if (!activeDrag) return;

    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;
    const container = combinedContainerRef.current;

    if (activeDrag === 'left' && container) {
      // Update pixel offset directly
      setLeftPosition({
        x: initialDragPos.x + deltaX,
        y: initialDragPos.y + deltaY,
      });
    } else if (activeDrag === 'right' && container) {
       // Update pixel offset directly
      setRightPosition({
        x: initialDragPos.x + deltaX,
        y: initialDragPos.y + deltaY,
      });
    } else if (activeDrag === 'logo' && container) {
      // Calculate change in percentage based on container size
      const percentDeltaX = (deltaX / container.offsetWidth) * 100;
      const percentDeltaY = (deltaY / container.offsetHeight) * 100;
      // Update percentage position state
      setLogoPosition({
        x: clamp(initialDragPos.x + percentDeltaX, 0, 100),
        y: clamp(initialDragPos.y + percentDeltaY, 0, 100),
      });
    }
  }, [activeDrag, dragStart, initialDragPos]); // Depend only on values used inside

  const handleInteractionEnd = useCallback(() => {
    setActiveDrag(null);
    setIsTouching(false); // Reset touch flag
  }, []);

  // --- Mouse Event Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
    if (e.button !== 0) return; // Only handle left clicks
    e.preventDefault();
    e.stopPropagation();
    handleInteractionStart(e.clientX, e.clientY, type);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleInteractionMove(e.clientX, e.clientY);
  }, [handleInteractionMove]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return; // Only handle left clicks
    handleInteractionEnd();
  }, [handleInteractionEnd]);

  // --- Touch Event Handlers ---
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>, type: Exclude<DragType, null>) => {
    // Prevent default only if interacting with draggable element, not container itself
    e.stopPropagation(); // Stop propagation regardless
    if (e.touches.length === 1) {
        e.preventDefault(); // Prevent scroll when starting drag
        setIsTouching(true); // Set touch flag
        const touch = e.touches[0];
        handleInteractionStart(touch.clientX, touch.clientY, type);
    }
    // Handle pinch start here if implementing zoom
  };

  const handleTouchMove = useCallback((e: globalThis.TouchEvent) => { // Use global TouchEvent
    if (!activeDrag || !isTouching || e.touches.length !== 1 || isPinching) return;

    // Prevent scroll ONLY when dragging
    e.preventDefault();

    const touch = e.touches[0];
    handleInteractionMove(touch.clientX, touch.clientY);
    // Handle pinch move here
  }, [activeDrag, isTouching, isPinching, handleInteractionMove]); // Add isPinching if implemented

  const handleTouchEnd = useCallback((e: globalThis.TouchEvent) => { // Use global TouchEvent
    if (!isTouching) return; // Only handle if touch started

    // Check if the touch ending was the one we were tracking for drag
    if (activeDrag && e.touches.length === 0) {
      handleInteractionEnd();
    }
    // Handle pinch end here
  }, [isTouching, activeDrag, handleInteractionEnd]); // Add activeDrag dependency

  // --- Wheel Zoom Logic ---
  const handleWheelZoom = (
    e: WheelEvent<HTMLDivElement>,
    zoomSetter: React.Dispatch<React.SetStateAction<number>>,
    minZoom = 10, // Min zoom percentage
    maxZoom = 500 // Max zoom percentage
  ) => {
    e.preventDefault(); // Prevent page scroll
    e.stopPropagation(); // Prevent event bubbling up if necessary
    const zoomAmount = e.deltaY * -0.2; // Adjust sensitivity as needed (increase multiplier for faster zoom)
    zoomSetter(prevZoom => clamp(prevZoom + zoomAmount, minZoom, maxZoom)); // Clamp zoom level
  };

  // --- Effects for Global Listeners ---
  useEffect(() => {
    const currentRef = combinedContainerRef.current; // Capture ref for cleanup

    // Mouse Listeners
    if (activeDrag && !isTouching) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none'; // Prevent text selection globally during drag
    }

    // Touch Listeners
    if (activeDrag && isTouching) {
      document.addEventListener('touchmove', handleTouchMove, { passive: false }); // Need passive: false to preventDefault
      document.addEventListener('touchend', handleTouchEnd);
      document.addEventListener('touchcancel', handleTouchEnd); // Handle cancel event
      document.body.style.cursor = 'grabbing'; // Visual cue even for touch
       document.body.style.userSelect = 'none';
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
      if (currentRef) { // Reset cursor and selection only if interaction truly ends
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };
  }, [activeDrag, isTouching, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);


  // --- Save Logic ---
  const canSave = leftMediaType === 'image' && rightMediaType === 'image';

  const saveCompositeImage = async () => {
    if (!canSave || !leftMedia || !rightMedia) {
      setSaveError("Ambos os lados devem ser imagens para salvar.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    // Prepare data - send percentage zoom for logo
    const compositeData = {
      leftImage: leftMedia,
      rightImage: rightMedia,
      logo: logo,
      leftPosition, // Send pixel offset from preview
      rightPosition, // Send pixel offset from preview
      logoPosition, // Send percentage CENTER position
      leftZoom, // Send percentage zoom
      rightZoom, // Send percentage zoom
      logoZoom // Send percentage width for logo
    };

    try {
      const response = await fetch('/api/combine-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'image/png' }, // Be explicit about acceptance
        body: JSON.stringify(compositeData),
      });

      if (response.ok && response.headers.get('Content-Type')?.includes('image/png')) {
         const blob = await response.blob();
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = 'imagem-combinada.png';
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url); // Clean up memory
      } else {
        let errorData = { error: `Status: ${response.status}` };
        try {
            // Try parsing JSON error if available
            if (response.headers.get('Content-Type')?.includes('application/json')) {
                errorData = await response.json();
            }
        } catch (parseError) {
             console.error("Could not parse error response", parseError);
        }
        console.error('Erro ao combinar imagens:', response.status, errorData);
        setSaveError(errorData.error || 'Falha ao gerar a imagem no servidor.');
      }
    } catch (error) {
      console.error('Erro na requisição fetch:', error);
      setSaveError('Erro de rede ou falha na comunicação com o servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helper for Media (Left/Right) ---
  const renderMedia = (
    mediaUrl: string | null,
    mediaType: MediaType,
    zoom: number, // Percentage zoom
    position: { x: number; y: number }, // Pixel offset
    onMouseDownHandler: (e: React.MouseEvent<HTMLDivElement>) => void,
    onTouchStartHandler: (e: TouchEvent<HTMLDivElement>) => void,
    wheelHandler: (e: WheelEvent<HTMLDivElement>) => void,
    ref: React.RefObject<HTMLDivElement>,
    altText: string
  ) => {
    if (!mediaUrl) return null;

    // Apply zoom and pan using CSS transform for accurate preview
    // The container div handles the mouse events and wheel events
    const style: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%', // Media element fills its direct container
        height: '100%',
        // Apply transform to the inner container
        transform: `translate(${position.x}px, ${position.y}px) scale(${zoom / 100})`,
        transformOrigin: 'top left', // Scale from top-left to match translation point
        cursor: 'grab', // Cursor for the transformed element container
    };

    return (
      // Outer div: takes full space, handles pointer events (mouse down/touch start), and wheel event
      <div
        ref={ref}
        className="absolute top-0 left-0 w-full h-full overflow-hidden cursor-grab touch-pan-y touch-pan-x" // Allow panning, explicit cursor
        onMouseDown={onMouseDownHandler}
        onTouchStart={onTouchStartHandler}
        onWheel={wheelHandler} // Attach wheel listener here
        role="application" // Indicate interactivity
        aria-label={`Área interativa para ${altText}`}
      >
        {/* Inner div: applies the transform */}
        <div style={style} className="flex items-center justify-center" aria-hidden="true">
            {mediaType === 'video' ? (
            <video
                src={mediaUrl}
                className="w-full h-full object-contain pointer-events-none block" // 'contain' fits video; 'block' prevents extra space
                muted
                loop
                playsInline // Important for mobile playback without fullscreen
                key={mediaUrl} // Force re-render if src changes
            />
            ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={mediaUrl}
                alt={altText}
                className="w-full h-full object-contain pointer-events-none block" // 'contain' fits image
                draggable="false" // Prevent native browser image dragging
            />
            )}
        </div>
      </div>
    );
  };


  // --- Calculate Logo Position/Size Styles for PREVIEW ---
  const getLogoStyle = (): React.CSSProperties => {
    const container = combinedContainerRef.current;
    if (!container || !logo) return { display: 'none' };

    // Calculate logo width in pixels based on percentage of PREVIEW container width
    const previewLogoWidthPx = (container.offsetWidth * logoZoom) / 100;

    // Try to get aspect ratio from the loaded image element via ref
    const logoImgElement = logoRef.current;
    const aspectRatio = (logoImgElement && logoImgElement.naturalWidth > 0)
        ? logoImgElement.naturalHeight / logoImgElement.naturalWidth
        : 1; // Fallback to 1:1 if dimensions aren't available yet

    const previewLogoHeightPx = previewLogoWidthPx * (isNaN(aspectRatio) ? 1 : aspectRatio) ;

    // Calculate position based on percentage (logoPosition x/y is the center)
    // Convert percentage center position to pixel top-left position relative to the preview container
    const centerX = (container.offsetWidth * logoPosition.x) / 100;
    const centerY = (container.offsetHeight * logoPosition.y) / 100;

    const topLeftX = centerX - previewLogoWidthPx / 2;
    const topLeftY = centerY - previewLogoHeightPx / 2;

    return {
      position: 'absolute',
      left: `${topLeftX}px`,
      top: `${topLeftY}px`,
      width: `${previewLogoWidthPx}px`, // Use calculated pixel width for preview
      height: 'auto', // Maintain aspect ratio via height: auto
      cursor: 'grab',
      zIndex: 10, // Ensure logo is above media
      userSelect: 'none', // Prevent text selection during drag
      touchAction: 'none', // Prevent browser scrolling/zooming when dragging logo
    };
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 sm:p-4">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">
        Editor de Combinação
      </h1>

      {/* --- Upload Area --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
         {/* Left Media Card */}
         <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2 flex items-center gap-1">
            {leftMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Esquerda
          </h2>
          <MediaInput
            id="left-media-upload"
            label="Carregar Esquerda"
            onMediaUpload={(e) => handleMediaUpload(e, setLeftMedia, setLeftMediaType, setLeftPosition, setLeftZoom)}
            className="mb-2"
          />
          {leftMedia && (
            <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative">
              {leftMediaType === 'video' ? (
                <video src={leftMedia} className="w-full h-full object-contain" muted loop playsInline key={leftMedia}/>
              ) : (
                <img src={leftMedia} alt="Preview esquerda" className="w-full h-full object-contain" />
              )}
            </div>
          )}
        </Card>

        {/* Right Media Card */}
        <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2 flex items-center gap-1">
            {rightMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Direita
          </h2>
          <MediaInput
            id="right-media-upload"
            label="Carregar Direita"
            onMediaUpload={(e) => handleMediaUpload(e, setRightMedia, setRightMediaType, setRightPosition, setRightZoom)}
            className="mb-2"
          />
           {rightMedia && (
             <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative">
              {rightMediaType === 'video' ? (
                <video src={rightMedia} className="w-full h-full object-contain" muted loop playsInline key={rightMedia}/>
              ) : (
                <img src={rightMedia} alt="Preview direita" className="w-full h-full object-contain" />
              )}
            </div>
          )}
        </Card>

        {/* Logo Card */}
        <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2">Logo</h2>
          <MediaInput
            id="logo-upload"
            label="Carregar Logo"
            accept="image/*" // Only images for logo
            onMediaUpload={handleLogoUpload}
            className="mb-2"
          />
          {logo && (
            <div className="aspect-video bg-muted rounded-md overflow-hidden mt-2 relative">
              <img src={logo} alt="Preview logo" className="w-full h-full object-contain" />
            </div>
          )}
        </Card>
      </div>


      {/* --- Editor and Controls --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Preview Area */}
        <div className="lg:col-span-2">
          {/* Combined Preview Container */}
          <Card
            className="p-0 md:p-0 bg-slate-200 dark:bg-slate-900 relative overflow-hidden aspect-video" // No padding on card itself
            ref={combinedContainerRef}
          >
            {/* Flex container for the two halves */}
            <div className="flex h-full w-full relative">
              {/* Left Media Area */}
              <div className="w-1/2 h-full relative border-r border-gray-400 dark:border-gray-600 bg-muted/50">
                {renderMedia(
                  leftMedia, leftMediaType, leftZoom, leftPosition,
                  (e) => handleMouseDown(e, 'left'), (e) => handleTouchStart(e, 'left'),
                  (e) => handleWheelZoom(e, setLeftZoom), // Pass zoom handler
                   leftMediaRef, "Mídia esquerda"
                )}
                {!leftMedia && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">Lado Esquerdo</div>}
              </div>

              {/* Right Media Area */}
              <div className="w-1/2 h-full relative bg-muted/50">
                {renderMedia(
                  rightMedia, rightMediaType, rightZoom, rightPosition,
                  (e) => handleMouseDown(e, 'right'), (e) => handleTouchStart(e, 'right'),
                  (e) => handleWheelZoom(e, setRightZoom), // Pass zoom handler
                  rightMediaRef, "Mídia direita"
                )}
                {!rightMedia && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">Lado Direito</div>}
              </div>

              {/* Logo Overlay - Container handles interaction */}
              {logo && (
                <div // Container for logo positioning and interaction
                  style={getLogoStyle()}
                  onMouseDown={(e) => handleMouseDown(e, 'logo')}
                  onTouchStart={(e) => handleTouchStart(e, 'logo')}
                  role="application"
                  aria-label="Logo interativo"
                >
                  <img // Actual logo image, gets dimensions via ref
                    ref={logoRef}
                    src={logo}
                    alt="Logo"
                    className="w-full h-full object-contain block" // block display important
                    draggable="false"
                    style={{ pointerEvents: 'none' }} // Prevent image interfering with container's drag events
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Save Button and Messages */}
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
             {/* Alerts container */}
             <div className="flex-grow flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {(leftMediaType === 'video' || rightMediaType === 'video') && !canSave && (
                <Alert variant="default" className="w-full sm:w-auto text-xs sm:text-sm p-2 sm:p-3">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs sm:text-sm">Aviso</AlertTitle>
                    <AlertDescription className="text-xs sm:text-sm">
                    Não é possível salvar vídeos. Apenas visualização.
                    </AlertDescription>
                </Alert>
                )}
                {saveError && (
                <Alert variant="destructive" className="w-full sm:w-auto text-xs sm:text-sm p-2 sm:p-3">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs sm:text-sm">Erro ao Salvar</AlertTitle>
                    <AlertDescription className="text-xs sm:text-sm">{saveError}</AlertDescription>
                </Alert>
                )}
             </div>
            {/* Save Button */}
            <Button
                onClick={saveCompositeImage}
                disabled={!canSave || isSaving || !leftMedia || !rightMedia}
                className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0" // prevent button shrinking too much
            >
                {isSaving ? (
                <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    Salvando...
                </>
                ) : (
                <>
                    <Save size={18} />
                    Salvar Imagem
                </>
                )}
            </Button>
          </div>
        </div>

        {/* --- Controls Area --- */}
        <div className="lg:col-span-1">
          <Tabs defaultValue="left" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="left" disabled={!leftMedia}>Esquerda</TabsTrigger>
              <TabsTrigger value="right" disabled={!rightMedia}>Direita</TabsTrigger>
              <TabsTrigger value="logo" disabled={!logo}>Logo</TabsTrigger>
            </TabsList>

            {/* Left Controls */}
            <TabsContent value="left" className="mt-4 space-y-4">
               <Card className="p-4">
                 <Label htmlFor="left-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Zoom ({leftZoom.toFixed(0)}%)
                 </Label>
                 <Slider id="left-zoom" min={10} max={500} step={1}
                  value={[leftZoom]} onValueChange={(value) => setLeftZoom(value[0])} disabled={!leftMedia} />
                 <div className="mt-4">
                    <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Arraste a imagem)</Label>
                     <p className="text-xs text-muted-foreground">Offset Atual: X={leftPosition.x.toFixed(0)}px, Y={leftPosition.y.toFixed(0)}px</p>
                 </div>
               </Card>
             </TabsContent>

            {/* Right Controls */}
             <TabsContent value="right" className="mt-4 space-y-4">
               <Card className="p-4">
                 <Label htmlFor="right-zoom" className="block mb-2 font-medium flex items-center">
                   <ZoomIn size={16} className="mr-2" /> Zoom ({rightZoom.toFixed(0)}%)
                 </Label>
                 <Slider id="right-zoom" min={10} max={500} step={1}
                  value={[rightZoom]} onValueChange={(value) => setRightZoom(value[0])} disabled={!rightMedia} />
                  <div className="mt-4">
                    <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (Arraste a imagem)</Label>
                     <p className="text-xs text-muted-foreground">Offset Atual: X={rightPosition.x.toFixed(0)}px, Y={rightPosition.y.toFixed(0)}px</p>
                  </div>
               </Card>
             </TabsContent>

            {/* Logo Controls */}
            <TabsContent value="logo" className="mt-4 space-y-4">
              <Card className="p-4">
                <Label htmlFor="logo-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Largura Relativa ({logoZoom.toFixed(1)}%)
                </Label>
                <Slider
                  id="logo-zoom"
                  min={1} max={50} step={0.5} // Percentage range
                  value={[logoZoom]} onValueChange={(value) => setLogoZoom(value[0])}
                  disabled={!logo}
                />
                <div className="mt-4">
                  <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição Central (Arraste o logo)</Label>
                   <div className="grid grid-cols-2 gap-2">
                    {/* Input for X percentage */}
                    <div>
                        <Label htmlFor="logo-pos-x" className='text-xs text-muted-foreground'>X (%)</Label>
                        <Input id="logo-pos-x" type="number" placeholder='X %' min={0} max={100} step={0.1} value={logoPosition.x.toFixed(1)} onChange={(e) => setLogoPosition(p => ({ ...p, x: clamp(Number(e.target.value),0,100) }))} disabled={!logo}/>
                    </div>
                     {/* Input for Y percentage */}
                    <div>
                         <Label htmlFor="logo-pos-y" className='text-xs text-muted-foreground'>Y (%)</Label>
                        <Input id="logo-pos-y" type="number" placeholder='Y %' min={0} max={100} step={0.1} value={logoPosition.y.toFixed(1)} onChange={(e) => setLogoPosition(p => ({ ...p, y: clamp(Number(e.target.value),0,100) }))} disabled={!logo}/>
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* --- AI Editor Section --- */}
      <div className="mt-12 md:mt-16">
        <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Edite sua foto com IA</h2>
        <GeminiImageEditor />
      </div>
    </div>
  );
}