import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	server: {
		port: 3001,
		open: true,
		proxy: {
			"/api/generate": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/api/health": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
			"/api/job": {
				target: "http://localhost:8000",
				changeOrigin: true,
			},
		},
	},
});
