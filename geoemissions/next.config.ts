import { existsSync } from "node:fs"
import path from "node:path"
import tls from "node:tls"
import type { NextConfig } from "next"

// One .env for the app and outlook-pipeline.py, in the folder above (Supabase + Graph credentials).
const sharedEnv = path.join(__dirname, "..", ".env")
if (existsSync(sharedEnv)) process.loadEnvFile(sharedEnv)

// Trust the OS certificate store too: the corporate TLS proxy's root CA lives there, not in Node's bundle.
tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")])

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home folder otherwise makes Next guess the wrong workspace root.
  turbopack: { root: __dirname },
  // The dev-tools badge sits on top of the profile menu (bottom-left) during demos.
  devIndicators: false,
  // Loaded by Node at runtime, not bundled: pdf.js starts its worker from its own files, Tesseract loads wasm + the language model.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "@napi-rs/canvas"],
}

export default nextConfig
