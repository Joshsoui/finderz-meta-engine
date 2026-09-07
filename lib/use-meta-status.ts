"use client";

import { useEffect, useState } from "react";

export type MetaStatus = {
  configured: boolean;
  services: { adsManager: boolean; leadForms: boolean; imageGeneration: boolean };
  mode: "connected" | "sandbox";
};

const SANDBOX_STATUS: MetaStatus = {
  configured: false,
  services: { adsManager: false, leadForms: false, imageGeneration: false },
  mode: "sandbox",
};

/** Reflects whether a real Meta Ads connection is configured (env vars set), or still sandbox. */
export function useMetaStatus(): MetaStatus {
  const [status, setStatus] = useState<MetaStatus>(SANDBOX_STATUS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/meta/status");
        if (!response.ok) return;
        const payload = (await response.json()) as MetaStatus;
        if (!cancelled) setStatus(payload);
      } catch {
        // Keep the sandbox default if the status check itself fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
