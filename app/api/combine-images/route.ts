// src/app/api/combine-images/route.ts
import { NextResponse } from 'next/server';
import { processCompositeImage } from '@/lib/image-processor';


// Configuração para lidar com payloads grandes de imagens
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
    responseLimit: '10mb',
  },
};

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // Extrair dados das imagens e configurações
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
    } = data;

    // Verificar se temos as imagens necessárias
    if (!leftImage || !rightImage) {
      return NextResponse.json(
        { error: 'Imagens esquerda e direita são necessárias' },
        { status: 400 }
      );
    }

    // Processar imagem utilizando nossa função auxiliar
    const resultImageBuffer = await processCompositeImage({
      leftImage,
      rightImage,
      logo,
      leftPosition,
      rightPosition,
      logoPosition,
      leftZoom,
      rightZoom,
      logoZoom
    });

    // Configurar cabeçalhos para a resposta da imagem
    return new NextResponse(resultImageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="imagem-combinada.png"',
      },
    });
  } catch (error) {
    console.error('Erro ao processar imagens:', error);
    return NextResponse.json(
      { error: 'Erro ao processar imagens' },
      { status: 500 }
    );
  }
}