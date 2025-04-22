// components/image-input.tsx
import React, { ChangeEvent } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageInputProps {
  id: string;
  label: string;
  onImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

export function ImageInput({ id, label, onImageUpload, className }: ImageInputProps) {
  return (
    <div className={`grid w-full max-w-sm items-center gap-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        accept="image/*"
        onChange={onImageUpload}
        // Adiciona uma key baseada em um timestamp ou estado para forçar reset se necessário
        // ou limpar o value no handler onChange como já fazemos
      />
    </div>
  );
}