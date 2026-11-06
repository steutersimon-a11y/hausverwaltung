import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('./client',import.meta.url)),plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('./client',import.meta.url))}},build:{outDir:'../dist/client',emptyOutDir:true,assetsInlineLimit:0},worker:{format:'es'}});
