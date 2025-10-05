import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'backend-server',
      configureServer(server) {
        // Start backend server when Vite dev server starts
        setTimeout(() => {
          const backend = spawn('node', ['server.js'], {
            stdio: 'inherit',
            cwd: process.cwd()
          })

          // Handle process termination
          process.on('SIGINT', () => {
            console.log('\n🛑 Stopping development servers...')
            backend.kill()
            process.exit(0)
          })

          backend.on('error', (err) => {
            console.error('Backend server error:', err)
          })
        }, 1000) // 1 second delay to ensure port is available
      }
    }
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3003'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true
  }
})
