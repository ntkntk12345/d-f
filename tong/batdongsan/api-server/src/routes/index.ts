import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import authRouter from "./auth";
import adminRouter from "./admin";
import analyticsRouter from "./analytics";
import chatRouter from "./chat";
import roommateRouter from "./roommate";
import groupsRouter from "./groups";
import userDataRouter from "./user-data";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(analyticsRouter);
router.use(chatRouter);
router.use(propertiesRouter);
router.use(roommateRouter);
router.use(groupsRouter);
router.use(userDataRouter);

export default router;
