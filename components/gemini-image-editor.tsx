// components/gemini-image-editor.tsx
"use client";

import React, { useState, useCallback, ChangeEvent } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MediaInput } from "@/components/media-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from 'lucide-react';

import { generateImageWithGemini } from "@/app/actions";

export function GeminiImageEditor() {
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);

  const handleSourceImageUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceImageUrl(reader.result as string);
        setGeneratedImageUrl(null);
        setError(null);
        setApiMessage(null);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
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

    // Using the action directly
    const result = await generateImageWithGemini(prompt, sourceImageUrl);

    if (result.success && result.imageUrl) {
      setGeneratedImageUrl(result.imageUrl);
      if (result.message) setApiMessage(result.message);
    } else {
      setError(result.message || "Ocorreu um erro desconhecido ao gerar a imagem.");
    }

    setIsLoading(false);
  };

  const handleDownloadGenerated = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    // Extract mime type for better filename, fallback to png
    const mimeMatch = generatedImageUrl.match(/^data:(image\/(.+));base64,/);
    const extension = mimeMatch ? mimeMatch[2] : 'png';
    link.download = `imagem-editada-gemini.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edição Rápida com IA</CardTitle>
        <CardDescription>
          Carregue uma imagem, descreva a edição (ex: adicione um chapéu de festa) e clique em Gerar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <MediaInput
          id="sourceImageGemini"
          label="Imagem Original"
          onMediaUpload={handleSourceImageUpload}
          accept='image/*' // Only images for Gemini edit
        />

        {sourceImageUrl && (
           <div className="mt-4">
             <Label>Preview Original:</Label>
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img
                src={sourceImageUrl}
                alt="Preview Imagem Original"
                className="mt-2 rounded-md border max-w-full h-auto max-h-60 object-contain"
            />
           </div>
        )}

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="promptGemini">O que você quer fazer com a imagem?</Label>
          <Input
            id="promptGemini"
            type="text"
            placeholder="Ex: adicione um fundo de praia, transforme em pintura..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
         {apiMessage && !error && (
          <Alert variant="default">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Mensagem da IA</AlertTitle>
            <AlertDescription>{apiMessage}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="flex justify-center items-center p-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-muted-foreground">Gerando imagem...</span>
          </div>
        )}
        {generatedImageUrl && !isLoading && (
          <div className="mt-4">
            <Label>Imagem Editada:</Label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={generatedImageUrl}
              alt="Imagem Editada pela IA"
              className="mt-2 rounded-md border max-w-full h-auto max-h-96 object-contain"
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