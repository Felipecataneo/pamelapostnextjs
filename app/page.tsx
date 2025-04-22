// src/app/page.tsx
import ImageCombiner from '@/components/ImageCombiner'; // Keep this

export default function Home() {
  return (
    // Adjusted padding for different screen sizes
    <main className="flex min-h-screen flex-col items-center justify-between p-2 sm:p-4 md:p-8">
      <div className="w-full max-w-7xl"> {/* Max width container */}
         {/* Header can be simplified or removed if title is in ImageCombiner */}
         <header className="mb-6 md:mb-12 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
            Combinador de Mídia Lado a Lado
          </h1>
          <p className="text-base md:text-lg text-muted-foreground"> 
            Carregue imagens ou vídeos e um logo opcional para criar sua composição.
          </p>
        </header>

        {/* ImageCombiner now contains most of the UI */}
        <ImageCombiner />

        <footer className="mt-12 md:mt-16 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} - Seu App de Combinação</p>
        </footer>
      </div>
    </main>
  );
}