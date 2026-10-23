import { spawn } from "node:child_process"

const args = process.argv.slice(2)
const env = { ...process.env }

function enableFlag(argument, environmentVariable) {
  const index = args.indexOf(argument)
  if (index === -1) return

  args.splice(index, 1)
  env[environmentVariable] = "true"
}

enableFlag("--with-ads", "CHRONICLE_PREVIEW_ADS")
enableFlag("--with-demo-ads", "CHRONICLE_PREVIEW_ADS_DEMO")

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
