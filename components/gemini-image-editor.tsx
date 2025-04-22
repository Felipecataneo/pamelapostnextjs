// components/gemini-image-editor.tsx
"use client";

import React, { useState, useCallback, ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageInput } from "@/components/image-input"; // Importa o componente de input de imagem
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from 'lucide-react'; // Ícone para o Alert



// Importa a Server Action
import { generateImageWithGemini } from "@/app/actions";

export function GeminiImageEditor() {
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null); // Para mensagens de texto da API

  const handleSourceImageUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImageUrl(reader.result as string);
        setGeneratedImageUrl(null); // Limpa resultado anterior ao carregar nova imagem
        setError(null);
        setApiMessage(null);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = ''; // Limpa para permitir re-upload
  }, []);

  const handleGenerate = async () => {
    if (!sourceImageUrl || !prompt) {
      setError("Por favor, carregue uma imagem e insira um prompt.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImageUrl(null);
    setApiMessage(null);

    const result = await generateImageWithGemini(prompt, sourceImageUrl);

    if (result.success && result.imageUrl) {
      setGeneratedImageUrl(result.imageUrl);
      if (result.message) setApiMessage(result.message); // Mostra texto da API se houver
    } else {
      setError(result.message || "Ocorreu um erro desconhecido.");
    }

    setIsLoading(false);
  };

  const handleDownloadGenerated = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = 'imagem-editada-gemini.png'; // Ou extrair o tipo mime da data url
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edição Rápida com IA</CardTitle>
        <CardDescription>
          Carregue uma imagem, descreva a edição desejada (ex: adicione um chapéu de festa no gato) e clique em Gerar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input da Imagem Fonte */}
        <ImageInput
          id="sourceImageGemini"
          label="Imagem Original"
          onImageUpload={handleSourceImageUpload}
        />

        {/* Preview da Imagem Fonte (Opcional mas útil) */}
        {sourceImageUrl && (
           <div className="mt-4">
             <Label>Preview Original:</Label>
             <img
                src={sourceImageUrl}
                alt="Preview Imagem Original"
                className="mt-2 rounded-md border max-w-full h-auto max-h-60 object-contain"
            />
           </div>
        )}


        {/* Input do Prompt */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="promptGemini">O que você quer fazer com a imagem?</Label>
          <Input
            id="promptGemini"
            type="text"
            placeholder="Ex: adicione um fundo de praia, transforme em pintura a óleo..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {/* Exibição de Erros ou Mensagens da API */}
        {error && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
         {apiMessage && !error && ( // Mostra mensagens da API se não houver erro
          <Alert variant="default">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Mensagem da IA</AlertTitle>
            <AlertDescription>{apiMessage}</AlertDescription>
          </Alert>
        )}

        {/* Resultado da Imagem Gerada */}
        {isLoading && (
          <div className="flex justify-center items-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Gerando imagem...</span>
          </div>
        )}
        {generatedImageUrl && !isLoading && (
          <div className="mt-4">
            <Label>Imagem Editada:</Label>
            <img // Usar <img> normal para Data URL funciona bem
              src={generatedImageUrl}
              alt="Imagem Editada pela IA"
              className="mt-2 rounded-md border max-w-full h-auto max-h-96 object-contain" // Maior que o preview
            />
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between gap-4">
        <Button
          onClick={handleGenerate}
          disabled={!sourceImageUrl || !prompt || isLoading}
          className='w-full sm:w-auto'
        >
          {isLoading ? 'Gerando...' : 'Gerar Edição'}
        </Button>
        <Button
          onClick={handleDownloadGenerated}
          disabled={!generatedImageUrl || isLoading}
          variant="outline"
          className='w-full sm:w-auto'
        >
          Baixar Imagem Editada
        </Button>
      </CardFooter>
    </Card>
  );
}