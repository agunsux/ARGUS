import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  branch: (branch) => {
    if (branch.exists || branch.isDefault) return {}; // don't touch prod
    return {
      ttl: "7d", // ephemeral branches auto-expire instead of accruing storage
      postgres: {
        computeSettings: {
          autoscalingLimitMinCu: 0.25, // scale to zero when idle
          autoscalingLimitMaxCu: 1, // cap autoscaling on throwaway branches
          suspendTimeout: "5m",
        },
      },
    };
  },
});
