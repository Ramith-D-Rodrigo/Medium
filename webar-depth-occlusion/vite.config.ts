import {defineConfig} from "vite";
import glsl from 'vite-plugin-glsl';

export default defineConfig({
    server: {
        open: true,
        port: 5500
    },

    plugins: [
        glsl()
    ]
});
