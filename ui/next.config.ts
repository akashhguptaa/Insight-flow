import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

function copyVadAssetsToPublic() {
  const root = process.cwd();
  const publicDir = path.join(root, "public");
  const vadDistDir = path.join(root, "node_modules", "@ricky0123", "vad-web", "dist");
  const ortDistDir = path.join(root, "node_modules", "onnxruntime-web", "dist");

  if (!fs.existsSync(vadDistDir) || !fs.existsSync(ortDistDir)) {
    return;
  }

  fs.mkdirSync(publicDir, { recursive: true });

  const wantedExtensions = new Set([".onnx", ".wasm", ".mjs"]);

  const copyMatchingFiles = (sourceDir: string) => {
    for (const name of fs.readdirSync(sourceDir)) {
      const sourcePath = path.join(sourceDir, name);
      if (!fs.statSync(sourcePath).isFile()) {
        continue;
      }

      const extension = path.extname(name);
      if (!wantedExtensions.has(extension)) {
        continue;
      }

      fs.copyFileSync(sourcePath, path.join(publicDir, name));
    }
  };

  copyMatchingFiles(vadDistDir);
  copyMatchingFiles(ortDistDir);

  const workletBundle = path.join(vadDistDir, "vad.worklet.bundle.min.js");
  if (fs.existsSync(workletBundle)) {
    fs.copyFileSync(workletBundle, path.join(publicDir, "vad.worklet.bundle.min.js"));
  }
}

copyVadAssetsToPublic();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GROQ_API_KEY: process.env.GROQ_API_KEY,
  },
};

export default nextConfig;
