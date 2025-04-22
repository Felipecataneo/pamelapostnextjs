// app/actions.ts
"use server";

import { GoogleGenAI } from "@google/genai";

interface GeminiEditResult {
    success: boolean;
    imageUrl?: string;
    message?: string;
}



const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("GEMINI_API_KEY not found in environment variables.");
}

/**
 * Função de retry com backoff exponencial para lidar com sobrecarga do servidor
 */
async function retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 5,
    initialDelayMs = 1000
): Promise<T> {
    let retries = 0;
    let delay = initialDelayMs;
    
    while (true) {
        try {
            return await operation();
        } catch (error) {
            retries++;
            
            // Verificar se é um erro de sobrecarga do servidor
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isServerOverloaded = 
                errorMessage.includes("503") || 
                errorMessage.includes("overloaded") ||
                errorMessage.includes("UNAVAILABLE");
            
            // Se excedeu o número máximo de tentativas ou não é um erro de sobrecarga, rejeita
            if (retries >= maxRetries || !isServerOverloaded) {
                throw error;
            }
            
            console.log(`Tentativa ${retries} falhou, tentando novamente em ${delay}ms...`);
            
            // Espera antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Aumenta o tempo de espera para a próxima tentativa (backoff exponencial)
            delay *= 2;
        }
    }
}

export async function generateImageWithGemini(
    prompt: string,
    imageBase64DataUrl: string
): Promise<GeminiEditResult> {

    if (!apiKey) {
        return { success: false, message: "Server configuration error: API Key not found." };
    }
    if (!prompt || !imageBase64DataUrl) {
        return { success: false, message: "Prompt and original image are required." };
    }

    try {
        // Inicializar o cliente Gemini com a nova SDK
        const ai = new GoogleGenAI({ apiKey });
        
        // Extrair dados base64 da Data URL
        const match = imageBase64DataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/);
        if (!match) {
            return { success: false, message: "Invalid image Data URL format (only PNG, JPEG, WEBP supported)." };
        }
        const mimeType = match[1];
        const base64Image = match[2];

        // Preparar as partes do conteúdo conforme novo formato
        const contents = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image,
                },
            },
        ];

        // Usar função de retry para chamar a API
        const response = await retryWithExponentialBackoff(async () => {
            console.log("Calling Gemini API...");
            return ai.models.generateContent({
                // Tentar primeiro com o modelo experimental para geração de imagens
                model: "gemini-2.0-flash-exp-image-generation",
                contents: contents,
                config: {
                    responseModalities: ["Text", "Image"],
                },
            });
        });

        console.log("Response received from Gemini API");

        // Verificar se há uma resposta válida
        if (!response || !response.candidates || response.candidates.length === 0) {
            console.error("Gemini API returned invalid response", response);
            return { success: false, message: "API did not return a valid response" };
        }

        let resultText = "";
        let resultImageUrl = "";

        // Processar as partes da resposta
        for (const part of response?.candidates?.[0]?.content?.parts || []) {
            if (part.text) {
                resultText = part.text;
                console.log("Text response:", resultText);
            } else if (part.inlineData) {
                const imageData = part.inlineData.data;
                const imageMimeType = part.inlineData.mimeType || "image/png";
                resultImageUrl = `data:${imageMimeType};base64,${imageData}`;
                console.log("Image data received");
            }
        }

        if (resultImageUrl) {
            return {
                success: true,
                imageUrl: resultImageUrl,
                message: resultText
            };
        } else {
            return { 
                success: false, 
                message: resultText || "API did not return an image" 
            };
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, message: `API call failed: ${errorMessage}` };
    }
}

// Função de fallback que tenta modelos alternativos se o primeiro falhar
export async function generateImageWithGeminiFallback(
    prompt: string,
    imageBase64DataUrl: string
): Promise<GeminiEditResult> {
    try {
        // Tenta primeiro com o modelo experimental
        const result = await generateImageWithGemini(prompt, imageBase64DataUrl);
        if (result.success) {
            return result;
        }
        
        // Se falhar e a mensagem indicar sobrecarga, tenta com um modelo alternativo
        if (result.message?.includes("overloaded") || result.message?.includes("503") || result.message?.includes("UNAVAILABLE")) {
            console.log("Trying with fallback model...");
            
            // Implementação com modelo alternativo (mesma lógica, modelo diferente)
            // Esta é uma implementação simplificada; você pode extrair a lógica comum
            if (!apiKey) {
                return { success: false, message: "Server configuration error: API Key not found." };
            }
            
            const ai = new GoogleGenAI({ apiKey });
            
            const match = imageBase64DataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/);
            if (!match) {
                return { success: false, message: "Invalid image Data URL format." };
            }
            const mimeType = match[1];
            const base64Image = match[2];
            
            const contents = [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image,
                    },
                },
            ];
            
            // Use um modelo alternativo mais estável
            const response = await retryWithExponentialBackoff(async () => {
                console.log("Calling Gemini API with fallback model...");
                return ai.models.generateContent({
                    model: "gemini-1.5-flash", // Modelo alternativo
                    contents: contents,
                    config: {
                        responseModalities: ["Text", "Image"],
                    },
                });
            });
            
            if (!response || !response.candidates || response.candidates.length === 0) {
                return { success: false, message: "Fallback API did not return a valid response" };
            }
            
            let resultText = "";
            let resultImageUrl = "";
            
            for (const part of response?.candidates?.[0]?.content?.parts || []) {
                if (part.text) {
                    resultText = part.text;
                } else if (part.inlineData) {
                    const imageData = part.inlineData.data;
                    const imageMimeType = part.inlineData.mimeType || "image/png";
                    resultImageUrl = `data:${imageMimeType};base64,${imageData}`;
                }
            }
            
            if (resultImageUrl) {
                return {
                    success: true,
                    imageUrl: resultImageUrl,
                    message: resultText
                };
            }
        }
        
        // Se chegar aqui, retorna o resultado original
        return result;
    } catch (error) {
        console.error("Error in fallback mechanism:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Fallback mechanism failed: ${errorMessage}` };
    }
}