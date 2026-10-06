import { spawn } from "node:child_process"

const args = process.argv.slice(2)
const withAdsIndex = args.indexOf("--with-ads")
const env = { ...process.env }

if (withAdsIndex !== -1) {
  args.splice(withAdsIndex, 1)
  env.CHRONICLE_PREVIEW_ADS = "true"
}

const vite = spawn("vite", args, {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
})

vite.on("error", (error) => {
  console.error("Failed to start Vite:", error)
  process.exitCode = 1
})

vite.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exitCode = code ?? 1
})
