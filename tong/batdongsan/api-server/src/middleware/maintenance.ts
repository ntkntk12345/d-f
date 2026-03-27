import type { NextFunction, Request, Response } from "express";
import { getSiteMaintenanceStatus } from "../lib/site-maintenance";

const EXEMPT_PATH_PREFIXES = [
  "/healthz",
  "/site/maintenance-status",
  "/admin/bichha",
];

function isMaintenanceExempt(req: Request) {
  return EXEMPT_PATH_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`));
}

export async function maintenanceModeGuard(req: Request, res: Response, next: NextFunction) {
  if (isMaintenanceExempt(req)) {
    next();
    return;
  }

  try {
    const status = await getSiteMaintenanceStatus();

    if (!status.isEnabled) {
      next();
      return;
    }

    res.status(503).json({
      message: status.message,
      maintenance: status,
    });
  } catch (error) {
    console.error("[maintenance.guard]", error);
    next();
  }
}
