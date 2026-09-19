import { localUploadUrl } from "../lib/deployment.js";
import { Router, type Request, type Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.cloudinary_cloud_name || "",
  api_key: process.env.cloudinary_api_key || "",
  api_secret: process.env.cloudinary_api_secret || "",
});

function hasValidCloudinaryConfig(): boolean {
  const cloudName = process.env.cloudinary_cloud_name;
  const apiKey = process.env.cloudinary_api_key;
  return Boolean(
    cloudName &&
    !cloudName.includes("your_") &&
    cloudName.trim().length > 0 &&
    apiKey &&
    !apiKey.includes("your_")
  );
}

import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/issues/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

export const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const engineerRouter = Router();

engineerRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  try {
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid email or password." });

    if (user.role !== "ENGINEER") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. You do not have permission to use this login." });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "Server configuration error." });
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      jwtSecret,
      { expiresIn: "7d" },
    );

    const { password: _, ...safeUser } = user;
    res.status(200).json({ success: true, token, user: safeUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

engineerRouter.get(
  "/issues",
  requireAuth,
  requireRole("ENGINEER"),
  async (req: Request, res: Response) => {
    const engineerId = req.user!.userId;
    try {
      const isEngineer = await prisma.user.findFirst({
        where: {
          id: engineerId,
          role: "ENGINEER",
        },
      });

      if (!isEngineer)
        return res
          .status(402)
          .json({ success: false, message: "invalid user" });

      const assignments = await prisma.issueAssignment.findMany({
        where: { engineerId },
        include: {
          issue: {
            include: {
              ward: true,
              route: true,
            },
          },
        },
      });

      const issues = assignments.map((a) => ({
        ...a.issue,
        assignedAt: a.assignedAt,
        assignmentId: a.id,
      }));
      res.status(200).json({ issues });
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json({ success: false, message: "internal server error" });
    }
  },
);

engineerRouter.put(
  "/acceptAssignment",
  requireAuth,
  requireRole("ENGINEER"),
  async (req, res) => {
    const { issueId } = req.body;

    if (!issueId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing issueId" });
    }

    try {
      const issue = await prisma.issue.findUnique({ where: { id: issueId } });

      if (!issue) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid issue ID." });
      }

      if (issue.status !== "ASSIGNED" && issue.status !== "IN_PROGRESS") {
        return res.status(400).json({
          success: false,
          message: "Issue is not in an assigned state.",
        });
      }

      const updatedIssue = await prisma.issue.update({
        where: { id: issueId },
        data: { status: "IN_PROGRESS" },
      });
      return res.json({ success: true, data: updatedIssue });
    } catch (error) {
      console.error("Error accepting assignment:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error." });
    }
  },
);

engineerRouter.put(
  "/solveIssue",
  requireAuth,
  requireRole("ENGINEER"),
  upload.single("afterImage"),
  async (req, res) => {
    const { issueId } = req.body;
    const engineerId = req.user!.userId;
    const file = req.file;
    console.log("request reached in solveissue");

    if (!issueId || !engineerId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing issueId or engineerId" });
    }

    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "After-fix image is required" });
    }

    try {
      const issue = await prisma.issue.findUnique({
        where: { id: issueId },
      });

      if (!issue) {
        return res
          .status(404)
          .json({ success: false, message: "Issue not found" });
      }

      if (issue.status === "RESOLVED" || issue.status === "FIXED") {
        return res
          .status(400)
          .json({ success: false, message: "Issue is already resolved or fixed" });
      }

      if (issue.status !== "IN_PROGRESS" && issue.status !== "ASSIGNED") {
        return res
          .status(400)
          .json({ success: false, message: "Issue must be IN_PROGRESS or ASSIGNED to be marked as fixed" });
      }

      let afterUrl = "";
      if (hasValidCloudinaryConfig()) {
        try {
          const uploadImage = await cloudinary.uploader.upload(
            `uploads/issues/${file.filename}`,
            {
              folder: "issue-resolutions",
              quality: "auto",
              fetch_format: "auto",
            }
          );
          afterUrl = uploadImage.secure_url;
        } catch (cErr) {
          console.warn("Cloudinary upload failed in engineer routes, using local path:", cErr);
        }
      }

      if (!afterUrl) {
        afterUrl = localUploadUrl(`uploads/issues/${file.filename}`);
      }

      const updatedIssue = await prisma.issue.update({
        where: { id: issueId },
        data: {
          status: "FIXED",
          afterUrl: afterUrl,
        },
      });

      return res.json({
        success: true,
        data: updatedIssue,
      });
    } catch (error) {
      console.error("Error solving issue:", error);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  },
);

export { engineerRouter };
