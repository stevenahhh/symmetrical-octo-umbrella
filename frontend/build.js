#!/usr/bin/env node
import { execSync } from "child_process";

try {
  console.log("🔨 Building frontend...");
  execSync("npx vite build", { stdio: "inherit" });
  console.log("✅ Build completed!");
} catch (error) {
  console.error("❌ Build failed!");
  process.exit(1);
}
