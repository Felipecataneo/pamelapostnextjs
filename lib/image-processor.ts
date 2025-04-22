// src/lib/image-processor.ts
import { createCanvas, loadImage } from 'canvas';

// Tipo para os parâmetros da função de processamento
interface CompositeImageParams {
  leftImage: string;
  rightImage: string;
  logo?: string;
  leftPosition: { x: number; y: number };
  rightPosition: { x: number; y: number };
  logoPosition: { x: number; y: number };
  leftZoom: number;
  rightZoom: number;
  logoZoom: number;
}

/**
 * Processa e combina as imagens de acordo com os parâmetros fornecidos
 * 
 * @param params Parâmetros para processamento da imagem
 * @returns Buffer da imagem resultante
 */
export async function processCompositeImage(params: CompositeImageParams): Promise<Buffer> {
  const {
    leftImage,
    rightImage,
    logo,
    leftPosition,
    rightPosition,
    logoPosition,
    leftZoom,
    rightZoom,
    logoZoom
  } = params;

  // Decodificar Base64 para imagens
  const leftImageData = leftImage.replace(/^data:image\/\w+;base64,/, '');
  const rightImageData = rightImage.replace(/^data:image\/\w+;base64,/, '');
  
  // Carregar imagens
  const leftImg = await loadImage(Buffer.from(leftImageData, 'base64'));
  const rightImg = await loadImage(Buffer.from(rightImageData, 'base64'));
  
  // Determinar altura máxima entre as duas imagens para um resultado coerente
  const height = Math.max(leftImg.height, rightImg.height);
  const width = leftImg.width + rightImg.width;
  
  // Criar canvas com o dobro da largura (para as duas imagens lado a lado)
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Adicionar um fundo branco (opcional)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Função auxiliar para desenhar uma imagem com zoom e posição
  const drawImage = (
    img: any, 
    x: number, 
    y: number, 
    w: number, 
    h: number, 
    zoom: number, 
    posX: number, 
    posY: number
  ) => {
    // Calcular escala baseada no zoom
    const scale = zoom / 100;
    
    // Calcular dimensões escaladas
    const scaledWidth = w * scale;
    const scaledHeight = h * scale;
    
    // Calcular posições de corte
    const offsetX = Math.max(0, Math.min(scaledWidth - w, posX));
    const offsetY = Math.max(0, Math.min(scaledHeight - h, posY));
    
    // Desenhar a imagem com transformação aplicada
    ctx.drawImage(
      img,
      offsetX / scale, offsetY / scale,  // Posição de início do corte na imagem original
      w / scale, h / scale,              // Largura e altura do corte na imagem original
      x, y,                             // Posição de destino no canvas
      w, h                              // Largura e altura de destino no canvas
    );
  };
  
  // Desenhar a imagem esquerda na metade esquerda do canvas
  drawImage(
    leftImg,
    0, 0,                               // Posição inicial no canvas
    leftImg.width, height,              // Largura e altura no canvas
    leftZoom,                           // Zoom
    leftPosition.x, leftPosition.y      // Posição
  );
  
  // Desenhar a imagem direita na metade direita do canvas
  drawImage(
    rightImg,
    leftImg.width, 0,                   // Posição inicial no canvas (depois da imagem esquerda)
    rightImg.width, height,             // Largura e altura no canvas
    rightZoom,                          // Zoom
    rightPosition.x, rightPosition.y    // Posição
  );
  
  // Se tiver um logo, adicionar sobreposto às imagens
  if (logo) {
    const logoData = logo.replace(/^data:image\/\w+;base64,/, '');
    const logoImg = await loadImage(Buffer.from(logoData, 'base64'));
    
    // Calcular tamanho proporcional do logo
    const logoWidth = logoZoom;
    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
    
    // Calcular posição do logo como percentual da imagem combinada
    const logoX = (width * logoPosition.x / 100) - (logoWidth / 2);
    const logoY = (height * logoPosition.y / 100) - (logoHeight / 2);
    
    // Desenhar o logo
    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
  }
  
  // Converter o canvas para buffer PNG
  return canvas.toBuffer('image/png');
}