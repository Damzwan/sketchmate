import { spawnSync } from "node:child_process";

const result = spawnSync(
	"pnpm",
	["test:unit", "--run", "src/draw/benchmark/baseline.test.ts"],
	{
		cwd: process.cwd(),
		stdio: "inherit",
		shell: process.platform === "win32",
	},
);

process.exit(result.status ?? 1);
