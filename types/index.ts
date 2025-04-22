// src/types/index.ts

// Tipo para posição (coordenadas x e y)
export interface Position {
    x: number;
    y: number;
  }
  
  // Tipo para os dados do formulário de combinação de imagens
  export interface CompositeImageData {
    leftImage: string | null;
    rightImage: string | null;
    logo: string | null;
    leftPosition: Position;
    rightPosition: Position;
    logoPosition: Position;
    leftZoom: number;
    rightZoom: number;
    logoZoom: number;
  }
  
  // Tipo para a resposta da API de combinação
  export interface CompositeImageResponse {
    url?: string;
    error?: string;
  }