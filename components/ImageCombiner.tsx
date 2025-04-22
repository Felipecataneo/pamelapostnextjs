"use client"
import { useState, useRef, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Upload, ZoomIn, Move } from 'lucide-react';
import { GeminiImageEditor } from './gemini-image-editor';

export default function ImageCombiner() {
  // Estados para as imagens e logo
  const [leftImage, setLeftImage] = useState<string | null>(null);
  const [rightImage, setRightImage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  
  // Estados para controle de zoom e posição
  const [leftZoom, setLeftZoom] = useState(100);
  const [rightZoom, setRightZoom] = useState(100);
  const [logoZoom, setLogoZoom] = useState(100);
  
  const [leftPosition, setLeftPosition] = useState({ x: 0, y: 0 });
  const [rightPosition, setRightPosition] = useState({ x: 0, y: 0 });
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 50 });
  
  // Referências para os elementos de imagem
  const leftImageRef = useRef(null);
  const rightImageRef = useRef(null);
  const logoRef = useRef(null);
  const combinedContainerRef = useRef(null);
  
  // Estado ativo para arrastar
  type DragType = 'left' | 'right' | 'logo' | null;
  const [activeDrag, setActiveDrag] = useState<DragType>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Função para lidar com upload de arquivos
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (value: string | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          setter(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Lidar com início do arrasto
  const handleDragStart = (e: React.MouseEvent, type: Exclude<DragType, null>) => {
    e.preventDefault();
    setActiveDrag(type);
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
  };
  
  // Lidar com movimento do arrasto
  const handleDrag = (e: MouseEvent) => {
    if (!activeDrag) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    if (activeDrag === 'left') {
      setLeftPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
    } else if (activeDrag === 'right') {
      setRightPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
    } else if (activeDrag === 'logo') {
      setLogoPosition(prev => ({
        x: prev.x + deltaX / 4, // Proporção relativa à área combinada
        y: prev.y + deltaY / 4
      }));
    }
    
    setDragStart({
      x: e.clientX,
      y: e.clientY
    });
  };
  
  // Lidar com fim do arrasto
  const handleDragEnd = () => {
    setActiveDrag(null);
  };
  
  // Adicionar e remover event listeners
  useEffect(() => {
    if (activeDrag) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [activeDrag, dragStart]);
  
  // Função para salvar a imagem combinada (enviando para o backend)
  const saveCompositeImage = async () => {
    // Aqui você precisaria capturar as configurações atuais e enviar para o backend
    const compositeData = {
      leftImage: leftImage,
      rightImage: rightImage,
      logo: logo,
      leftPosition,
      rightPosition,
      logoPosition,
      leftZoom,
      rightZoom,
      logoZoom
    };
    
    try {
      const response = await fetch('/api/combine-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(compositeData),
      });
      
      if (response.ok) {
        const result = await response.blob();
        const url = URL.createObjectURL(result);
        
        // Criar link para download
        const a = document.createElement('a');
        a.href = url;
        a.download = 'imagem-combinada.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        console.error('Erro ao combinar imagens');
      }
    } catch (error) {
      console.error('Erro:', error);
    }
  };
  
  return (
    <div className="w-full max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-center">Editor de Combinação de Imagens</h1>
      
      {/* Área de upload */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <h2 className="text-lg font-medium mb-2">Imagem Esquerda</h2>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload(e, setLeftImage)}
            className="mb-2"
          />
          {leftImage && <div className="aspect-square bg-gray-100 rounded-md overflow-hidden">
            <img src={leftImage} alt="Preview esquerda" className="w-full h-full object-contain" />
          </div>}
        </Card>
        
        <Card className="p-4">
          <h2 className="text-lg font-medium mb-2">Imagem Direita</h2>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload(e, setRightImage)}
            className="mb-2"
          />
          {rightImage && <div className="aspect-square bg-gray-100 rounded-md overflow-hidden">
            <img src={rightImage} alt="Preview direita" className="w-full h-full object-contain" />
          </div>}
        </Card>
        
        <Card className="p-4">
          <h2 className="text-lg font-medium mb-2">Logo</h2>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => handleFileUpload(e, setLogo)}
            className="mb-2"
          />
          {logo && <div className="aspect-square bg-gray-100 rounded-md overflow-hidden">
            <img src={logo} alt="Preview logo" className="w-full h-full object-contain" />
          </div>}
        </Card>
      </div>
      
      {/* Editor de imagem combinada */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-2 bg-slate-50 relative" style={{ height: '500px' }} ref={combinedContainerRef}>
            <div className="flex h-full relative">
              {/* Imagem esquerda */}
              <div className="w-1/2 h-full overflow-hidden relative bg-gray-200">
                {leftImage && (
                  <div 
                    className="absolute cursor-move"
                    style={{
                      width: `${leftZoom}%`,
                      height: `${leftZoom}%`,
                      transform: `translate(${leftPosition.x}px, ${leftPosition.y}px)`,
                      transformOrigin: 'center'
                    }}
                    onMouseDown={(e) => handleDragStart(e, 'left')}
                    ref={leftImageRef}
                  >
                    <img 
                      src={leftImage} 
                      alt="Imagem esquerda" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              
              {/* Imagem direita */}
              <div className="w-1/2 h-full overflow-hidden relative bg-gray-200">
                {rightImage && (
                  <div 
                    className="absolute cursor-move"
                    style={{
                      width: `${rightZoom}%`,
                      height: `${rightZoom}%`,
                      transform: `translate(${rightPosition.x}px, ${rightPosition.y}px)`,
                      transformOrigin: 'center'
                    }}
                    onMouseDown={(e) => handleDragStart(e, 'right')}
                    ref={rightImageRef}
                  >
                    <img 
                      src={rightImage} 
                      alt="Imagem direita" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              
              {/* Logo sobrepondo */}
              {logo && (
                <div 
                  className="absolute cursor-move z-10"
                  style={{
                    width: `${logoZoom}px`,
                    height: 'auto',
                    left: `${logoPosition.x}%`,
                    top: `${logoPosition.y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  onMouseDown={(e) => handleDragStart(e, 'logo')}
                  ref={logoRef}
                >
                  <img 
                    src={logo} 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          </Card>
          
          <div className="mt-4 flex justify-end">
            <Button 
              onClick={saveCompositeImage}
              disabled={!leftImage || !rightImage}
              className="flex items-center gap-2"
            >
              <Save size={18} />
              Salvar Imagem Combinada
            </Button>
          </div>
        </div>
        
        {/* Controles */}
        <div>
          <Tabs defaultValue="left" className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="left">Esquerda</TabsTrigger>
              <TabsTrigger value="right">Direita</TabsTrigger>
              <TabsTrigger value="logo">Logo</TabsTrigger>
            </TabsList>
            
            <TabsContent value="left" className="mt-4 space-y-4">
              <Card className="p-4">
                <Label htmlFor="left-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Zoom
                </Label>
                <Slider
                  id="left-zoom"
                  min={50}
                  max={200}
                  step={1}
                  value={[leftZoom]}
                  onValueChange={(value) => setLeftZoom(value[0])}
                  className="mb-2"
                />
                <div className="text-right text-sm text-gray-500">{leftZoom}%</div>
                
                <div className="mt-6">
                  <Label className="block mb-2 font-medium flex items-center">
                    <Move size={16} className="mr-2" /> Posição
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="left-pos-x" className="text-sm">X</Label>
                      <Input
                        id="left-pos-x"
                        type="number"
                        value={leftPosition.x}
                        onChange={(e) => setLeftPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="left-pos-y" className="text-sm">Y</Label>
                      <Input
                        id="left-pos-y"
                        type="number"
                        value={leftPosition.y}
                        onChange={(e) => setLeftPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="right" className="mt-4 space-y-4">
              <Card className="p-4">
                <Label htmlFor="right-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Zoom
                </Label>
                <Slider
                  id="right-zoom"
                  min={50}
                  max={200}
                  step={1}
                  value={[rightZoom]}
                  onValueChange={(value) => setRightZoom(value[0])}
                  className="mb-2"
                />
                <div className="text-right text-sm text-gray-500">{rightZoom}%</div>
                
                <div className="mt-6">
                  <Label className="block mb-2 font-medium flex items-center">
                    <Move size={16} className="mr-2" /> Posição
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="right-pos-x" className="text-sm">X</Label>
                      <Input
                        id="right-pos-x"
                        type="number"
                        value={rightPosition.x}
                        onChange={(e) => setRightPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="right-pos-y" className="text-sm">Y</Label>
                      <Input
                        id="right-pos-y"
                        type="number"
                        value={rightPosition.y}
                        onChange={(e) => setRightPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
            
            <TabsContent value="logo" className="mt-4 space-y-4">
              <Card className="p-4">
                <Label htmlFor="logo-zoom" className="block mb-2 font-medium flex items-center">
                  <ZoomIn size={16} className="mr-2" /> Tamanho
                </Label>
                <Slider
                  id="logo-zoom"
                  min={20}
                  max={300}
                  step={1}
                  value={[logoZoom]}
                  onValueChange={(value) => setLogoZoom(value[0])}
                  className="mb-2"
                />
                <div className="text-right text-sm text-gray-500">{logoZoom}px</div>
                
                <div className="mt-6">
                  <Label className="block mb-2 font-medium flex items-center">
                    <Move size={16} className="mr-2" /> Posição
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="logo-pos-x" className="text-sm">X (%)</Label>
                      <Input
                        id="logo-pos-x"
                        type="number"
                        min={0}
                        max={100}
                        value={logoPosition.x}
                        onChange={(e) => setLogoPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="logo-pos-y" className="text-sm">Y (%)</Label>
                      <Input
                        id="logo-pos-y"
                        type="number"
                        min={0}
                        max={100}
                        value={logoPosition.y}
                        onChange={(e) => setLogoPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-6 text-center mt-12">Edite sua foto com IA </h1>
        <GeminiImageEditor />
    </div>
  );
}