"use client"
import { useState, useRef, useEffect, useCallback, WheelEvent } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Import Alert
import { Save, Upload, ZoomIn, Move, Video, Image as ImageIcon, AlertTriangle } from 'lucide-react'; // Added icons
import { GeminiImageEditor } from './gemini-image-editor';
import { MediaInput } from './media-input'; // Import the new MediaInput

type MediaType = 'image' | 'video' | null;
type DragType = 'left' | 'right' | 'logo' | null;

export default function ImageCombiner() {
  // States for media sources and types
  const [leftMedia, setLeftMedia] = useState<string | null>(null);
  const [rightMedia, setRightMedia] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [leftMediaType, setLeftMediaType] = useState<MediaType>(null);
  const [rightMediaType, setRightMediaType] = useState<MediaType>(null);

  // States for control
  const [leftZoom, setLeftZoom] = useState(100); // Zoom as percentage
  const [rightZoom, setRightZoom] = useState(100); // Zoom as percentage
  const [logoZoom, setLogoZoom] = useState(100); // Zoom as pixel width

  const [leftPosition, setLeftPosition] = useState({ x: 0, y: 0 }); // Position offset in pixels
  const [rightPosition, setRightPosition] = useState({ x: 0, y: 0 }); // Position offset in pixels
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 90 }); // Position as percentage (center x, 90% down y)

  // Refs for elements
  const leftMediaRef = useRef<HTMLDivElement>(null);
  const rightMediaRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const combinedContainerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [activeDrag, setActiveDrag] = useState<DragType>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialDragPos, setInitialDragPos] = useState({ x: 0, y: 0 });

  // Loading/Error State for saving
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Handlers ---

  const handleMediaUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    mediaSetter: (value: string | null) => void,
    typeSetter: (value: MediaType) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          mediaSetter(result);
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
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) { // Only allow image for logo
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setLogo(result);
        }
      };
      reader.readAsDataURL(file);
    } else if (file) {
        alert("Por favor, selecione um arquivo de imagem para o logo.")
    }
  };

  // --- Drag Logic ---
  const handleDragStart = (
    e: React.MouseEvent<HTMLDivElement>,
    type: Exclude<DragType, null>
  ) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent potential parent handlers
    setActiveDrag(type);
    setDragStart({ x: e.clientX, y: e.clientY });

    // Store initial position for relative calculation
    if (type === 'left') setInitialDragPos(leftPosition);
    if (type === 'right') setInitialDragPos(rightPosition);
    if (type === 'logo') setInitialDragPos(logoPosition); 
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!activeDrag) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    const container = combinedContainerRef.current;

    if (activeDrag === 'left' && container) {
      setLeftPosition({
        x: initialDragPos.x + deltaX,
        y: initialDragPos.y + deltaY,
      });
    } else if (activeDrag === 'right' && container) {
      setRightPosition({
        x: initialDragPos.x + deltaX,
        y: initialDragPos.y + deltaY,
      });
    } else if (activeDrag === 'logo' && container) {
        // Calculate percentage change based on container size
        const percentDeltaX = (deltaX / container.offsetWidth) * 100;
        const percentDeltaY = (deltaY / container.offsetHeight) * 100;

        setLogoPosition(prev => ({
            x: clamp(initialDragPos.x + percentDeltaX, 0, 100), // Clamp percentage
            y: clamp(initialDragPos.y + percentDeltaY, 0, 100), // Clamp percentage
        }));
    }
     // Note: We don't update dragStart here for smoother relative dragging from initial point
  }, [activeDrag, dragStart, initialDragPos]);

  const handleDragEnd = useCallback(() => {
    setActiveDrag(null);
  }, []);


  // --- Wheel Zoom Logic ---
  const handleWheelZoom = (
    e: WheelEvent<HTMLDivElement>,
    zoomSetter: React.Dispatch<React.SetStateAction<number>>
  ) => {
    e.preventDefault(); // Prevent page scroll
    const zoomAmount = e.deltaY * -0.1; // Adjust sensitivity as needed
    zoomSetter(prevZoom => clamp(prevZoom + zoomAmount, 50, 300)); // Clamp zoom level
  };


  // --- Clamping utility ---
  const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

  // --- Effects ---
  useEffect(() => {
    // Add global listeners when dragging starts
    if (activeDrag) {
      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'grabbing'; // Indicate dragging
    } else {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'default'; // Reset cursor
    }

    // Cleanup listeners
    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'default';
    };
  }, [activeDrag, handleDrag, handleDragEnd]);


  // --- Save Logic ---
  const canSave = leftMediaType === 'image' && rightMediaType === 'image'; // Can only save if both are images

  const saveCompositeImage = async () => {
    if (!canSave || !leftMedia || !rightMedia) {
      setSaveError("Ambos os lados devem ser imagens para salvar.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    // Prepare data, ensuring zoom/position are correctly passed
    const compositeData = {
      leftImage: leftMedia,
      rightImage: rightMedia,
      logo: logo, // Send logo data url or null
      leftPosition,
      rightPosition,
      logoPosition, // Send percentage-based position
      leftZoom, // Send percentage zoom
      rightZoom, // Send percentage zoom
      logoZoom // Send pixel width zoom
    };

    try {
      const response = await fetch('/api/combine-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(compositeData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'imagem-combinada.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up
      } else {
        const errorData = await response.json();
        console.error('Erro ao combinar imagens:', errorData);
        setSaveError(errorData.error || 'Falha ao gerar a imagem no servidor.');
      }
    } catch (error) {
      console.error('Erro na requisição:', error);
      setSaveError('Erro de rede ou falha na comunicação com o servidor.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Render Helper for Media ---
  const renderMedia = (
    mediaUrl: string | null,
    mediaType: MediaType,
    zoom: number,
    position: { x: number; y: number },
    dragHandler: (e: React.MouseEvent<HTMLDivElement>) => void,
    wheelHandler: (e: React.WheelEvent<HTMLDivElement>) => void,
    ref: React.RefObject<HTMLDivElement | null>,
    altText: string
  ) => {
    if (!mediaUrl) return null;

    const style: React.CSSProperties = {
      position: 'absolute',
      left: `${position.x}px`, // Apply direct pixel offset
      top: `${position.y}px`,
      width: `${zoom}%`, // Zoom applied to the container
      height: `${zoom}%`,
      cursor: 'grab',
      transformOrigin: 'center center', // Zoom from center
      userSelect: 'none', // Prevent text selection during drag
    };

    return (
      <div
          ref={ref}
          className="absolute top-0 left-0 w-full h-full flex items-center justify-center" // Centering container
          style={style}
          onMouseDown={dragHandler}
          onWheel={wheelHandler}
      >
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            controls
            className="w-full h-full object-contain pointer-events-none" // contain to fit, disable pointer events on video itself
            muted // Mute by default to avoid issues
            loop
            playsInline // Important for mobile
          />
        ) : ( // Assume image otherwise
          <img
            src={mediaUrl}
            alt={altText}
            className="w-full h-full object-contain pointer-events-none" // contain to fit, disable pointer events on image itself
            draggable="false" // Prevent native image dragging
          />
        )}
      </div>
    );
  };

    // --- Calculate Logo Position Styles with Clamping ---
    const getLogoStyle = (): React.CSSProperties => {
        const container = combinedContainerRef.current;
        const logoElem = logoRef.current;
        if (!container || !logoElem || !logo) return { display: 'none'};

        // Use logoZoom directly as width (as it's controlled by slider in px)
        const logoW = logoZoom;
        // Estimate height based on current element aspect ratio (might flicker on load)
        // A better way would be to load the image to get dimensions, but this is simpler for now
        const logoH = logoElem.offsetHeight || logoW; // Fallback if height isn't available yet

        // Convert percentage position to pixels
        const desiredX = (container.offsetWidth * logoPosition.x) / 100;
        const desiredY = (container.offsetHeight * logoPosition.y) / 100;

        // Calculate boundaries to keep the logo *inside* the container
        // The logo is positioned by its top-left corner now
        const minX = 0;
        const minY = 0;
        const maxX = container.offsetWidth - logoW;
        const maxY = container.offsetHeight - logoH;

        // Clamp the position
        const finalX = clamp(desiredX - logoW / 2, minX, maxX); // Adjust for center origin then clamp
        const finalY = clamp(desiredY - logoH / 2, minY, maxY); // Adjust for center origin then clamp

        return {
            position: 'absolute',
            left: `${finalX}px`,
            top: `${finalY}px`,
            width: `${logoW}px`,
            height: 'auto', // Maintain aspect ratio
            cursor: 'grab',
            zIndex: 10,
            userSelect: 'none',
        };
    };

  return (
    <div className="w-full max-w-7xl mx-auto p-2 sm:p-4"> {/* Responsive padding */}
      {/* Title hidden on small screens, shown on medium+ */}
       <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">
        Editor de Combinação
      </h1>

      {/* Area de upload - responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 md:mb-8">
        {/* Card for Left Media */}
        <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2 flex items-center gap-1">
             {leftMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Esquerda
          </h2>
          <MediaInput
             id="left-media-upload"
             label="Carregar Esquerda"
             onMediaUpload={(e) => handleMediaUpload(e, setLeftMedia, setLeftMediaType)}
             className="mb-2"
           />
           {leftMedia && (
            <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden mt-2">
              {leftMediaType === 'video' ? (
                <video src={leftMedia} className="w-full h-full object-contain" muted controls={false} />
              ) : (
                <img src={leftMedia} alt="Preview esquerda" className="w-full h-full object-contain" />
              )}
            </div>
           )}
        </Card>

        {/* Card for Right Media */}
         <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2 flex items-center gap-1">
             {rightMediaType === 'video' ? <Video size={18}/> : <ImageIcon size={18} />} Mídia Direita
          </h2>
          <MediaInput
             id="right-media-upload"
             label="Carregar Direita"
             onMediaUpload={(e) => handleMediaUpload(e, setRightMedia, setRightMediaType)}
             className="mb-2"
           />
           {rightMedia && (
            <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden mt-2">
              {rightMediaType === 'video' ? (
                <video src={rightMedia} className="w-full h-full object-contain" muted controls={false} />
              ) : (
                <img src={rightMedia} alt="Preview direita" className="w-full h-full object-contain" />
              )}
            </div>
           )}
        </Card>

        {/* Card for Logo */}
        <Card className="p-3 md:p-4">
          <h2 className="text-base md:text-lg font-medium mb-2">Logo</h2>
          <MediaInput
            id="logo-upload"
            label="Carregar Logo"
            accept="image/*" // Logo must be an image
            onMediaUpload={handleLogoUpload} // Use specific handler
            className="mb-2"
          />
          {logo && (
            <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden mt-2">
             <img src={logo} alt="Preview logo" className="w-full h-full object-contain" />
            </div>
          )}
        </Card>
      </div>

      {/* Editor and Controls - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Preview Area */}
        <div className="lg:col-span-2">
          <Card className="p-1 md:p-2 bg-slate-100 dark:bg-slate-800 relative overflow-hidden aspect-video" ref={combinedContainerRef}>
             {/* Use aspect-video for consistent shape */}
            <div className="flex h-full w-full relative"> {/* Ensure parent fills card */}
              {/* Left Media Area */}
              <div className="w-1/2 h-full overflow-hidden relative border-r border-gray-300 dark:border-gray-600">
                 {renderMedia(
                   leftMedia,
                   leftMediaType,
                   leftZoom,
                   leftPosition,
                   (e) => handleDragStart(e, 'left'),
                   (e) => handleWheelZoom(e, setLeftZoom),
                   leftMediaRef,
                   "Mídia esquerda"
                 )}
                 {!leftMedia && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Lado Esquerdo</div>}
              </div>

              {/* Right Media Area */}
              <div className="w-1/2 h-full overflow-hidden relative">
                {renderMedia(
                  rightMedia,
                  rightMediaType,
                  rightZoom,
                  rightPosition,
                  (e) => handleDragStart(e, 'right'),
                  (e) => handleWheelZoom(e, setRightZoom),
                  rightMediaRef,
                  "Mídia direita"
                )}
                 {!rightMedia && <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Lado Direito</div>}
              </div>

              {/* Logo Overlay - Rendered using calculated style */}
              {logo && (
                <div
                    ref={logoRef}
                    style={getLogoStyle()} // Apply clamped style
                    onMouseDown={(e) => handleDragStart(e, 'logo')}
                >
                    <img
                        src={logo}
                        alt="Logo"
                        className="w-full h-full object-contain pointer-events-none"
                        draggable="false"
                    />
                </div>
              )}
            </div>
          </Card>

          {/* Save Button and Messages */}
          <div className="mt-4 flex flex-col sm:flex-row justify-end items-center gap-4">
             {/* Alert for video limitation */}
             { (leftMediaType === 'video' || rightMediaType === 'video') && (
                <Alert variant="default" className="w-full sm:w-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Aviso</AlertTitle>
                    <AlertDescription>
                    Não é possível salvar combinação com vídeos. Apenas a visualização é suportada.
                    </AlertDescription>
                </Alert>
             )}
             {/* Alert for save error */}
             { saveError && (
                <Alert variant="destructive" className="w-full sm:w-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erro ao Salvar</AlertTitle>
                    <AlertDescription>{saveError}</AlertDescription>
                </Alert>
             )}
            <Button
              onClick={saveCompositeImage}
              disabled={!canSave || isSaving || !leftMedia || !rightMedia} // Disable if not saveable, saving, or missing images
              className="flex items-center gap-2 w-full sm:w-auto" // Full width on small screens
            >
              {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Salvando...
                  </>
              ) : (
                 <>
                   <Save size={18} />
                   Salvar Imagem Combinada
                 </>
              )}
            </Button>
          </div>
        </div>

        {/* Controls Area */}
        <div className="lg:col-span-1">
          <Tabs defaultValue="left" className="w-full">
             {/* Responsive Tabs List */}
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="left">Esquerda</TabsTrigger>
              <TabsTrigger value="right">Direita</TabsTrigger>
              <TabsTrigger value="logo" disabled={!logo}>Logo</TabsTrigger> {/* Disable if no logo */}
            </TabsList>

            {/* Left Controls */}
            <TabsContent value="left" className="mt-4 space-y-4">
               <Card className="p-4">
                <Label htmlFor="left-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Zoom ({leftZoom.toFixed(0)}%)
                </Label>
                <Slider
                  id="left-zoom" min={50} max={300} step={1}
                  value={[leftZoom]} onValueChange={(value) => setLeftZoom(value[0])}
                  disabled={!leftMedia}
                />
                <div className="mt-4">
                  <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (px)</Label>
                  <div className="grid grid-cols-2 gap-2">
                     <Input id="left-pos-x" type="number" placeholder='X' value={leftPosition.x} onChange={(e) => setLeftPosition(p => ({ ...p, x: Number(e.target.value) }))} disabled={!leftMedia}/>
                     <Input id="left-pos-y" type="number" placeholder='Y' value={leftPosition.y} onChange={(e) => setLeftPosition(p => ({ ...p, y: Number(e.target.value) }))} disabled={!leftMedia}/>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Right Controls */}
            <TabsContent value="right" className="mt-4 space-y-4">
              <Card className="p-4">
                <Label htmlFor="right-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Zoom ({rightZoom.toFixed(0)}%)
                </Label>
                <Slider
                  id="right-zoom" min={50} max={300} step={1}
                  value={[rightZoom]} onValueChange={(value) => setRightZoom(value[0])}
                  disabled={!rightMedia}
                />
                 <div className="mt-4">
                  <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (px)</Label>
                  <div className="grid grid-cols-2 gap-2">
                     <Input id="right-pos-x" type="number" placeholder='X' value={rightPosition.x} onChange={(e) => setRightPosition(p => ({ ...p, x: Number(e.target.value) }))} disabled={!rightMedia}/>
                     <Input id="right-pos-y" type="number" placeholder='Y' value={rightPosition.y} onChange={(e) => setRightPosition(p => ({ ...p, y: Number(e.target.value) }))} disabled={!rightMedia}/>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Logo Controls */}
            <TabsContent value="logo" className="mt-4 space-y-4">
               <Card className="p-4">
                <Label htmlFor="logo-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Largura ({logoZoom}px)
                </Label>
                <Slider
                  id="logo-zoom" min={20} max={500} step={1} // Increased max size
                  value={[logoZoom]} onValueChange={(value) => setLogoZoom(value[0])}
                  disabled={!logo}
                />
                 <div className="mt-4">
                  <Label className="block mb-1 font-medium flex items-center"><Move size={16} className="mr-2" /> Posição (%)</Label>
                  <div className="grid grid-cols-2 gap-2">
                     <Input id="logo-pos-x" type="number" placeholder='X %' min={0} max={100} value={logoPosition.x} onChange={(e) => setLogoPosition(p => ({ ...p, x: clamp(Number(e.target.value),0,100) }))} disabled={!logo}/>
                     <Input id="logo-pos-y" type="number" placeholder='Y %' min={0} max={100} value={logoPosition.y} onChange={(e) => setLogoPosition(p => ({ ...p, y: clamp(Number(e.target.value),0,100) }))} disabled={!logo}/>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* AI Editor Section */}
      <div className="mt-12 md:mt-16">
        <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-center">Edite sua foto com IA</h2>
        <GeminiImageEditor />
      </div>
    </div>
  );
}