// src/app/page.tsx
import ImageCombiner from '@/components/ImageCombiner';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-8">
      <div className="w-full max-w-7xl">
        <header className="mb-12 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Combinador de Imagens</h1>
          <p className="text-lg text-gray-600">
            Carregue duas imagens e um logo para criar uma composição personalizada.
          </p>
        </header>
        
        <ImageCombiner />
        
        <footer className="mt-16 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} - Combinador de Imagens</p>
        </footer>
      </div>
    </main>
  );
}